class MotoCoachCalendar {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = null;
        this.events = [];
        this.currentWeekStart = null; // For mobile weekly view
        this.isMobileView = false;
        this.selectedEvents = new Map(); // Store selected events for multi-registration
        this.currentEventPage = 1; // For event panel pagination
        this.monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        this.init();
    }

    async init() {
        this.checkViewMode();
        this.bindEvents();
        await this.loadEvents();
        this.renderCalendar();
        this.updateEventPanel();
        
        // Add resize listener to switch between desktop/mobile views
        window.addEventListener('resize', () => {
            this.checkViewMode();
            this.renderCalendar();
        });
    }

    checkViewMode() {
        const wasMobile = this.isMobileView;
        this.isMobileView = window.innerWidth <= 768;
        
        // If switching from desktop to mobile, set current week
        if (!wasMobile && this.isMobileView) {
            this.setCurrentWeek(this.currentDate);
        }
        
        // Update calendar wrapper class
        const calendarWrapper = document.querySelector('.calendar-wrapper');
        if (calendarWrapper) {
            if (this.isMobileView) {
                calendarWrapper.classList.add('mobile-week-view');
            } else {
                calendarWrapper.classList.remove('mobile-week-view');
            }
        }
    }

    setCurrentWeek(date) {
        // Set to the start of the week (Sunday)
        this.currentWeekStart = new Date(date);
        this.currentWeekStart.setDate(date.getDate() - date.getDay());
    }

    bindEvents() {
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');

        if (prevBtn && !prevBtn.hasAttribute('data-bound')) {
            prevBtn.setAttribute('data-bound', 'true');
            prevBtn.addEventListener('click', () => {
                if (this.isMobileView) {
                    this.previousWeek();
                } else {
                    this.previousMonth();
                }
            });
        }
        
        if (nextBtn && !nextBtn.hasAttribute('data-bound')) {
            nextBtn.setAttribute('data-bound', 'true');
            nextBtn.addEventListener('click', () => {
                if (this.isMobileView) {
                    this.nextWeek();
                } else {
                    this.nextMonth();
                }
            });
        }

        // Add click listener to document to deselect date when clicking outside calendar
        document.addEventListener('click', (e) => {
            // Only deselect if there's actually a date selected
            if (!this.selectedDate) {
                return; // No date selected, nothing to deselect
            }
            
            // Check if click was outside the calendar area entirely
            const calendarWrapper = document.querySelector('.calendar-wrapper');
            const selectionPanel = document.querySelector('.selection-panel');
            
            // Don't deselect if clicking within:
            // - Calendar wrapper (calendar grid, headers, navigation, EVENT PANEL)
            // - Selection panel (multi-event selection UI)
            // - Any buttons or interactive elements
            if (calendarWrapper && !calendarWrapper.contains(e.target) && 
                (!selectionPanel || !selectionPanel.contains(e.target)) &&
                !e.target.closest('button') &&
                !e.target.closest('a')) {
                this.deselectDate();
            }
        });
    }

    async previousWeek() {
        this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
        await this.checkAndLoadEvents();
        this.renderCalendar();
        this.updateEventPanel();
    }

    async nextWeek() {
        this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
        await this.checkAndLoadEvents();
        this.renderCalendar();
        this.updateEventPanel();
    }

    async loadEvents() {
        try {
            // Calculate date range (3 months back to 6 months forward)
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 3);
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 6);

            const timeMin = startDate.toISOString();
            const timeMax = endDate.toISOString();

            // Call our Vercel API endpoint
            const response = await fetch(`/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=50`);
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.fallback) {
                console.log('API returned fallback, no events to display');
                this.events = [];
            } else {
                // Convert Google Calendar events to our format
                this.events = this.convertGoogleEvents(data.events || []);
                console.log(`Loaded ${this.events.length} events from Google Calendar`);
            }
            
        } catch (error) {
            console.error('Error loading calendar events:', error);
            console.log('No events to display');
            this.events = [];
        }
    }

    convertGoogleEvents(googleEvents) {
        return googleEvents.map(event => {
            let eventDate;
            let timeString = 'All Day';

            if (event.start.dateTime) {
                // Parse date in Sydney timezone to match backend
                eventDate = new Date(event.start.dateTime);
                // Ensure we're using Sydney time for date calculations
                const sydneyDateStr = eventDate.toLocaleDateString('en-AU', {
                    timeZone: 'Australia/Sydney'
                });
                // Create a new date object that represents the Sydney date
                const [day, month, year] = sydneyDateStr.split('/');
                eventDate = new Date(year, month - 1, day); // month is 0-indexed in JS Date
                
                const startTime = this.formatTime(new Date(event.start.dateTime));
                
                if (event.end.dateTime) {
                    const endDate = new Date(event.end.dateTime);
                    const endTime = this.formatTime(endDate);
                    timeString = `${startTime} - ${endTime}`;
                } else {
                    timeString = startTime;
                }
            } else if (event.start.date) {
                eventDate = new Date(event.start.date);
                timeString = 'All Day';
            }

            // Check for registration requirement, spots limit, and rate, then clean description
            let description = event.description || '';
            let hasRegistration = false;
            let maxSpots = null;
            let ratePerRider = 190; // Default rate in AUD
            
            // Case and spacing insensitive regex for "registration = on"
            const registrationRegex = /registration\s*=\s*on/i;
            if (registrationRegex.test(description)) {
                hasRegistration = true;
                // Remove the registration text from description
                description = description.replace(registrationRegex, '').trim();
            }
            
            // Parse spots limit from description (spots = number)
            const spotsRegex = /spots\s*=\s*(\d+)/i;
            const spotsMatch = description.match(spotsRegex);
            if (spotsMatch) {
                maxSpots = parseInt(spotsMatch[1]);
                // Remove the spots text from description
                description = description.replace(spotsRegex, '').trim();
            }
            
            // Parse rate from description (rate = number)
            const rateRegex = /rate\s*=\s*(\d+)/i;
            const rateMatch = description.match(rateRegex);
            if (rateMatch) {
                ratePerRider = parseInt(rateMatch[1]);
                // Remove the rate text from description
                description = description.replace(rateRegex, '').trim();
            }
            
            // Clean up any extra whitespace or newlines
            description = description.replace(/\n\s*\n/g, '\n').trim();

            return {
                date: eventDate,
                time: timeString,
                title: event.summary || 'Untitled Event',
                description: description,
                location: event.location || '',
                type: this.categorizeEvent(event.summary || ''),
                hasRegistration: hasRegistration,
                maxSpots: maxSpots,
                ratePerRider: ratePerRider
            };
        }).filter(event => event.date);
    }

    categorizeEvent(title) {
        const titleLower = title.toLowerCase();
        
        if (titleLower.includes('coaching') || titleLower.includes('lesson')) {
            return 'coaching';
        } else if (titleLower.includes('training') || titleLower.includes('practice')) {
            return 'training';
        } else if (titleLower.includes('group') || titleLower.includes('session')) {
            return 'group';
        } else if (titleLower.includes('info') || titleLower.includes('meeting')) {
            return 'info';
        } else if (titleLower.includes('track') || titleLower.includes('open')) {
            return 'open';
        } else {
            return 'event';
        }
    }

    formatTime(date) {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    async previousMonth() {
        // Use a safer method to decrement month
        const currentMonth = this.currentDate.getMonth();
        const currentYear = this.currentDate.getFullYear();
        
        // Create a new date for the first day of the previous month
        this.currentDate = new Date(currentYear, currentMonth - 1, 1);
        
        await this.checkAndLoadEvents();
        this.renderCalendar();
        this.updateEventPanel();
    }

    async nextMonth() {
        // Use a safer method to increment month
        const currentMonth = this.currentDate.getMonth();
        const currentYear = this.currentDate.getFullYear();
        
        // Create a new date for the first day of the next month
        this.currentDate = new Date(currentYear, currentMonth + 1, 1);
        
        await this.checkAndLoadEvents();
        this.renderCalendar();
        this.updateEventPanel();
    }

    async checkAndLoadEvents() {
        const hasEventsForMonth = this.events.some(event => 
            event.date.getMonth() === this.currentDate.getMonth() && 
            event.date.getFullYear() === this.currentDate.getFullYear()
        );

        if (!hasEventsForMonth) {
            await this.loadEvents();
        }
    }

    renderCalendar() {
        const monthElement = document.getElementById('currentMonth');
        const daysContainer = document.getElementById('calendarDays');

        if (!monthElement || !daysContainer) return;

        if (this.isMobileView) {
            this.renderWeeklyView(monthElement, daysContainer);
        } else {
            this.renderMonthlyView(monthElement, daysContainer);
        }
    }

    renderWeeklyView(monthElement, daysContainer) {
        if (!this.currentWeekStart) {
            this.setCurrentWeek(this.currentDate);
        }

        // Create week range display
        const weekEnd = new Date(this.currentWeekStart);
        weekEnd.setDate(this.currentWeekStart.getDate() + 6);
        
        const startDay = this.currentWeekStart.getDate();
        const endDay = weekEnd.getDate();
        
        // Use abbreviated month names for mobile
        const monthNamesShort = [
            'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
            'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
        ];
        
        const monthName = monthNamesShort[this.currentWeekStart.getMonth()];
        
        // Handle cross-month weeks
        if (this.currentWeekStart.getMonth() !== weekEnd.getMonth()) {
            const endMonthName = monthNamesShort[weekEnd.getMonth()];
            monthElement.textContent = `${monthName} ${startDay} - ${endMonthName} ${endDay}`;
        } else {
            monthElement.textContent = `${monthName} ${startDay}-${endDay}`;
        }

        daysContainer.innerHTML = '';

        // Render 7 days of the week
        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(this.currentWeekStart);
            currentDay.setDate(this.currentWeekStart.getDate() + i);
            
            const dayElement = this.createDayElement(currentDay.getDate(), false, currentDay);
            daysContainer.appendChild(dayElement);
        }
    }

    renderMonthlyView(monthElement, daysContainer) {
        const monthYear = `${this.monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
        monthElement.textContent = monthYear;

        daysContainer.innerHTML = '';

        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        // Previous month's trailing days
        const prevMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 0);
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const dayElement = this.createDayElement(prevMonth.getDate() - i, true);
            daysContainer.appendChild(dayElement);
        }

        // Current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = this.createDayElement(day, false);
            daysContainer.appendChild(dayElement);
        }

        // Next month's leading days
        const totalCells = daysContainer.children.length;
        const remainingCells = 42 - totalCells;
        for (let day = 1; day <= remainingCells; day++) {
            const dayElement = this.createDayElement(day, true);
            daysContainer.appendChild(dayElement);
        }
    }

    createDayElement(day, isOtherMonth, fullDate = null) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        // Create day number
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayElement.appendChild(dayNumber);

        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        } else {
            const today = new Date();
            let currentDay;
            
            if (this.isMobileView && fullDate) {
                currentDay = fullDate;
            } else {
                currentDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
            }
            
            // Check if this day is in the past (before today)
            const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const currentDayMidnight = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate());
            const isPastDay = currentDayMidnight < todayMidnight;
            
            if (this.isSameDay(currentDay, today)) {
                dayElement.classList.add('today');
            }

            const dayEvents = this.getEventsForDate(currentDay);
            if (dayEvents.length > 0) {
                dayElement.classList.add('has-events');
                
                // Add past-event class if this day is in the past
                if (isPastDay) {
                    dayElement.classList.add('past-event');
                }
                
                if (this.isMobileView) {
                    // Mobile: Show just the number of events
                    const eventCount = document.createElement('div');
                    eventCount.className = 'event-count';
                    eventCount.textContent = dayEvents.length;
                    dayElement.appendChild(eventCount);
                } else {
                    // Desktop: Show event previews
                    const eventsContainer = document.createElement('div');
                    eventsContainer.className = 'day-events';
                    
                    // Show up to 3 events in the day box
                    dayEvents.slice(0, 3).forEach(event => {
                        const eventPreview = document.createElement('div');
                        eventPreview.className = `event-preview event-${event.type}`;
                        
                        // Create event content: Event title, then time frame, then location
                        const maxTitleLength = 15;
                        const eventTitle = event.title.length > maxTitleLength 
                            ? event.title.substring(0, maxTitleLength) + '...' 
                            : event.title;
                        
                        const eventTime = event.time === 'All Day' ? 'All Day' : event.time;
                        
                        let eventContent = `
                            <div class="event-title-small">${eventTitle}</div>
                            <div class="event-time-small">${eventTime}</div>
                        `;
                        
                        // Show location on desktop
                        if (event.location) {
                            const eventLocation = event.location.length > 20 
                                ? event.location.substring(0, 20) + '...' 
                                : event.location;
                            eventContent += `<div class="event-location-small">📍 ${eventLocation}</div>`;
                        }
                        
                        eventPreview.innerHTML = eventContent;
                        eventsContainer.appendChild(eventPreview);
                    });
                    
                    // If more events, show "and X more"
                    if (dayEvents.length > 3) {
                        const moreEvents = document.createElement('div');
                        moreEvents.className = 'more-events';
                        moreEvents.textContent = `+${dayEvents.length - 3} more`;
                        eventsContainer.appendChild(moreEvents);
                    }
                    
                    dayElement.appendChild(eventsContainer);
                }
            } else if (isPastDay) {
                // Add past-event class even if no events, for visual consistency
                dayElement.classList.add('past-event');
            }

            dayElement.addEventListener('click', () => {
                this.selectDate(currentDay);
            });
        }

        return dayElement;
    }

    selectDate(date) {
        // If clicking the same date that's already selected, deselect it
        if (this.selectedDate && this.isSameDay(this.selectedDate, date)) {
            this.deselectDate();
            return;
        }

        const previousSelected = document.querySelector('.calendar-day.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        const dayElements = document.querySelectorAll('.calendar-day:not(.other-month)');
        dayElements.forEach(element => {
            if (parseInt(element.textContent) === date.getDate()) {
                element.classList.add('selected');
            }
        });

        this.selectedDate = date;
        this.updateEventPanel();
    }

    deselectDate() {
        const previousSelected = document.querySelector('.calendar-day.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        this.selectedDate = null;
        this.updateEventPanel();
    }

    // Event selection methods for multi-registration
    addEventToSelection(event) {
        const eventKey = `${event.title}_${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
        this.selectedEvents.set(eventKey, {
            ...event,
            eventKey: eventKey,
            dateString: `${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`
        });
        this.updateSelectionUI();
        this.updateButtonStatesOnly(); // Only update button states, don't refresh all event details
    }

    addEventToSelectionByKey(eventKey, buttonElement) {
        // Find the event by key from our current events
        const targetEvent = this.events.find(event => {
            const key = `${event.title}_${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
            return key === eventKey;
        });
        
        if (targetEvent) {
            this.addEventToSelection(targetEvent);
        }
    }

    removeEventFromSelection(eventKey) {
        this.selectedEvents.delete(eventKey);
        this.updateSelectionUI();
        this.updateButtonStatesOnly(); // Only update button states, don't refresh all event details
    }

    isEventSelected(event) {
        const eventKey = `${event.title}_${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
        return this.selectedEvents.has(eventKey);
    }

    updateSelectionUI() {
        const selectionCount = this.selectedEvents.size;
        let selectionPanel = document.getElementById('selectionPanel');
        
        if (selectionCount > 0) {
            if (!selectionPanel) {
                // Create fixed selection panel
                selectionPanel = document.createElement('div');
                selectionPanel.id = 'selectionPanel';
                selectionPanel.className = 'selection-panel fixed-selection-panel';
                
                // Append to body for fixed positioning
                document.body.appendChild(selectionPanel);
            }

            // Calculate pricing with bundle discounts
            const events = Array.from(this.selectedEvents.values());
            const defaultRateEvents = events.filter(event => event.ratePerRider === 190);
            const customRateEvents = events.filter(event => event.ratePerRider !== 190);
            
            // Bundle pricing for default rate events
            let defaultEventsTotal = 0;
            if (defaultRateEvents.length > 0) {
                let pricePerDefault;
                if (defaultRateEvents.length === 1) {
                    pricePerDefault = 190;
                } else if (defaultRateEvents.length === 2) {
                    pricePerDefault = 175; // $350 total / 2 events
                } else {
                    pricePerDefault = 150; // $450+ total / 3+ events
                }
                defaultEventsTotal = defaultRateEvents.length * pricePerDefault;
            }
            
            // Individual pricing for custom rate events
            const customEventsTotal = customRateEvents.reduce((sum, event) => sum + event.ratePerRider, 0);
            
            const totalCost = defaultEventsTotal + customEventsTotal;
            
            // Create pricing breakdown
            let pricingBreakdown = '';
            if (defaultRateEvents.length > 0 && customRateEvents.length > 0) {
                // Mixed pricing - show inline breakdown
                const defaultPrice = defaultRateEvents.length === 1 ? 190 : 
                                   defaultRateEvents.length === 2 ? 175 : 150;
                pricingBreakdown = `<div class="pricing-breakdown">
                    <small>${defaultRateEvents.length} standard @ $${defaultPrice}</small>
                    <small>${customRateEvents.length} custom rate</small>
                </div>`;
            } else if (defaultRateEvents.length > 1) {
                // Show bundle discount for default events
                const defaultPrice = defaultRateEvents.length === 2 ? 175 : 150;
                const savings = (190 * defaultRateEvents.length) - defaultEventsTotal;
                pricingBreakdown = `<div class="pricing-breakdown">
                    <small>Bundle discount: Save $${savings} total</small>
                </div>`;
            }

            selectionPanel.innerHTML = `
                <div class="selection-header">
                    <h4>${selectionCount} Event${selectionCount !== 1 ? 's' : ''} Selected</h4>
                    <span class="selection-total">$${totalCost.toFixed(2)} AUD</span>
                </div>
                ${pricingBreakdown}
                <div class="selection-actions">
                    <button class="btn-clear-selection" onclick="calendar.clearSelection()">Clear All</button>
                    <button class="btn-register-selected" onclick="calendar.proceedToRegistration()">Register for Selected Events</button>
                </div>
            `;
        } else if (selectionPanel) {
            selectionPanel.remove();
        }
    }

    updateButtonStatesOnly() {
        // Update button states without refreshing all event content
        const eventItems = document.querySelectorAll('.event-item');
        eventItems.forEach(eventItem => {
            // Look for buttons in both old layout (.register-options) and new layout (.event-register-centered)
            const registerContainer = eventItem.querySelector('.register-options') || eventItem.querySelector('.event-register-centered');
            if (registerContainer) {
                const addButton = registerContainer.querySelector('.btn-add-selection');
                const removeButton = registerContainer.querySelector('.btn-remove-selection');
                
                if (addButton) {
                    const eventKey = addButton.getAttribute('data-event-key');
                    const isSelected = this.selectedEvents.has(eventKey);
                    
                    if (isSelected) {
                        // Replace add button with remove button
                        addButton.outerHTML = `<button class="btn-remove-selection" onclick="calendar.removeEventFromSelection('${eventKey}')">Remove from Selection</button>`;
                        // Update event item styling for selected state
                        const eventRegister = eventItem.querySelector('.event-register') || eventItem.querySelector('.event-register-centered');
                        if (eventRegister) {
                            eventRegister.classList.add('event-selected');
                        }
                    }
                } else if (removeButton) {
                    const eventKey = removeButton.getAttribute('onclick').match(/'([^']+)'/)[1];
                    const isSelected = this.selectedEvents.has(eventKey);
                    
                    if (!isSelected) {
                        // Replace remove button with add button
                        removeButton.outerHTML = `<button class="btn-add-selection" data-event-key="${eventKey}" onclick="calendar.addEventToSelectionByKey('${eventKey}', this)">Add to Selection</button>`;
                        // Update event item styling for unselected state
                        const eventRegister = eventItem.querySelector('.event-register') || eventItem.querySelector('.event-register-centered');
                        if (eventRegister) {
                            eventRegister.classList.remove('event-selected');
                        }
                    }
                }
            }
        });
    }

    clearSelection() {
        this.selectedEvents.clear();
        this.updateSelectionUI();
        this.updateButtonStatesOnly(); // Only update button states, don't refresh all event details
    }

    proceedToRegistration() {
        if (this.selectedEvents.size === 0) {
            alert('Please select at least one event to register for.');
            return;
        }

        // Calculate pricing with bundle discounts
        const events = Array.from(this.selectedEvents.values());
        const defaultRateEvents = events.filter(event => event.ratePerRider === 190);
        const customRateEvents = events.filter(event => event.ratePerRider !== 190);
        
        // Bundle pricing for default rate events
        let defaultEventsTotal = 0;
        let bundlePrice = 190;
        if (defaultRateEvents.length > 0) {
            if (defaultRateEvents.length === 1) {
                bundlePrice = 190;
            } else if (defaultRateEvents.length === 2) {
                bundlePrice = 175; // $350 total / 2 events
            } else {
                bundlePrice = 150; // $450+ total / 3+ events
            }
            defaultEventsTotal = defaultRateEvents.length * bundlePrice;
        }
        
        // Individual pricing for custom rate events
        const customEventsTotal = customRateEvents.reduce((sum, event) => sum + event.ratePerRider, 0);
        const totalCost = defaultEventsTotal + customEventsTotal;

        // Create URL parameters for multiple events with pricing info
        const eventData = events.map(event => ({
            title: event.title,
            date: event.dateString,
            time: event.time,
            location: event.location || '',
            description: event.description || '',
            rate: event.ratePerRider,
            effectiveRate: event.ratePerRider === 190 ? bundlePrice : event.ratePerRider, // Rate after bundle discount
            maxSpots: event.maxSpots || '',
            remainingSpots: 'TBD' // Will be calculated on form page
        }));

        const pricingInfo = {
            totalCost: totalCost,
            defaultEventsCount: defaultRateEvents.length,
            customEventsCount: customRateEvents.length,
            bundlePrice: bundlePrice,
            hasBundleDiscount: defaultRateEvents.length > 1
        };

        // Encode the event data and pricing info as JSON in URL
        const encodedEvents = encodeURIComponent(JSON.stringify(eventData));
        const encodedPricing = encodeURIComponent(JSON.stringify(pricingInfo));
        window.location.href = `programs/track_reserve.html?multiEvents=${encodedEvents}&pricing=${encodedPricing}`;
    }

    async updateEventPanel() {
        const eventList = document.getElementById('eventList');
        if (!eventList) return;

        // Always show all upcoming events, regardless of selected date
        await this.showAllUpcomingEvents();
    }

    async showAllUpcomingEvents() {
        const eventList = document.getElementById('eventList');
        if (!eventList) return;

        // Get all upcoming events (from today onwards)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const allUpcomingEvents = this.events
            .filter(event => event.date >= today)
            .sort((a, b) => a.date - b.date);

        if (allUpcomingEvents.length === 0) {
            eventList.innerHTML = '<p class="no-events">No upcoming events scheduled</p>';
            return;
        }

        // Initialize pagination if not already set
        if (!this.currentEventPage) {
            this.currentEventPage = 1;
        }

        const eventsPerPage = 5;
        const totalPages = Math.ceil(allUpcomingEvents.length / eventsPerPage);
        
        // Ensure current page is valid
        if (this.currentEventPage > totalPages) {
            this.currentEventPage = 1;
        }

        const startIndex = (this.currentEventPage - 1) * eventsPerPage;
        const endIndex = startIndex + eventsPerPage;
        const currentPageEvents = allUpcomingEvents.slice(startIndex, endIndex);

        // Show loading state
        eventList.innerHTML = `
            <div class="events-header">
                <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 0.5rem; line-height: 1.4;">
                    Standard rates: $190/rider (single event), $175/rider (2 events), $150/rider (3+ events)
                </p>
                <div class="events-title-row" style="display: flex; justify-content: center; align-items: center; margin-bottom: 1rem;">
                    <div class="top-pagination" style="display: flex; align-items: center; gap: 0.75rem;">
                        <button class="pagination-btn prev-events-top" ${this.currentEventPage === 1 ? 'disabled' : ''} style="
                            background: ${this.currentEventPage === 1 ? '#333' : '#ff6b35'}; 
                            color: ${this.currentEventPage === 1 ? '#666' : '#fff'}; 
                            border: none; 
                            padding: 0.4rem 0.8rem; 
                            border-radius: 4px; 
                            cursor: ${this.currentEventPage === 1 ? 'not-allowed' : 'pointer'};
                            font-size: 0.8rem;
                            transition: background-color 0.3s ease;
                        ">
                            ← Prev
                        </button>
                        <div class="pagination-info" style="color: #ccc; font-size: 0.85rem;">
                            Page ${this.currentEventPage} of ${totalPages}
                        </div>
                        <button class="pagination-btn next-events-top" ${this.currentEventPage === totalPages ? 'disabled' : ''} style="
                            background: ${this.currentEventPage === totalPages ? '#333' : '#ff6b35'}; 
                            color: ${this.currentEventPage === totalPages ? '#666' : '#fff'}; 
                            border: none; 
                            padding: 0.4rem 0.8rem; 
                            border-radius: 4px; 
                            cursor: ${this.currentEventPage === totalPages ? 'not-allowed' : 'pointer'};
                            font-size: 0.8rem;
                            transition: background-color 0.3s ease;
                        ">
                            Next →
                        </button>
                    </div>
                </div>
            </div>
            <p class="loading-events">Loading event details...</p>
        `;

        try {
            // Generate HTML for current page events
            const eventHTMLPromises = currentPageEvents.map(event => this.createEventHTML(event, true));
            const eventHTMLs = await Promise.all(eventHTMLPromises);

            // Create pagination controls
            const paginationHTML = this.createPaginationHTML(this.currentEventPage, totalPages);

            eventList.innerHTML = `
                <div class="events-header">
                    <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 0.5rem; line-height: 1.4;">
                        Standard rates: $190/rider (single event), $175/rider (2 events), $150/rider (3+ events)
                    </p>
                    <div class="events-title-row" style="display: flex; justify-content: center; align-items: center; margin-bottom: 1rem;">
                        <div class="top-pagination" style="display: flex; align-items: center; gap: 0.75rem;">
                            <button class="pagination-btn prev-events-top" ${this.currentEventPage === 1 ? 'disabled' : ''} style="
                                background: ${this.currentEventPage === 1 ? '#333' : '#ff6b35'}; 
                                color: ${this.currentEventPage === 1 ? '#666' : '#fff'}; 
                                border: none; 
                                padding: 0.4rem 0.8rem; 
                                border-radius: 4px; 
                                cursor: ${this.currentEventPage === 1 ? 'not-allowed' : 'pointer'};
                                font-size: 0.8rem;
                                transition: background-color 0.3s ease;
                            ">
                                ← Prev
                            </button>
                            <div class="pagination-info" style="color: #ccc; font-size: 0.85rem;">
                                Page ${this.currentEventPage} of ${totalPages}
                            </div>
                            <button class="pagination-btn next-events-top" ${this.currentEventPage === totalPages ? 'disabled' : ''} style="
                                background: ${this.currentEventPage === totalPages ? '#333' : '#ff6b35'}; 
                                color: ${this.currentEventPage === totalPages ? '#666' : '#fff'}; 
                                border: none; 
                                padding: 0.4rem 0.8rem; 
                                border-radius: 4px; 
                                cursor: ${this.currentEventPage === totalPages ? 'not-allowed' : 'pointer'};
                                font-size: 0.8rem;
                                transition: background-color 0.3s ease;
                            ">
                                Next →
                            </button>
                        </div>
                    </div>
                </div>
                <div class="events-list">
                    ${eventHTMLs.join('')}
                </div>
                ${paginationHTML}
            `;

            // Add event listeners for pagination
            this.setupPaginationListeners();

        } catch (error) {
            console.error('Error loading upcoming events:', error);
            eventList.innerHTML = '<p class="no-events">Error loading events</p>';
        }
    }

    createPaginationHTML(currentPage, totalPages) {
        if (totalPages <= 1) return '';

        const prevDisabled = currentPage === 1 ? 'disabled' : '';
        const nextDisabled = currentPage === totalPages ? 'disabled' : '';

        return `
            <div class="events-pagination" style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #333;">
                <button class="pagination-btn prev-events" ${prevDisabled} style="
                    background: ${currentPage === 1 ? '#333' : '#ff6b35'}; 
                    color: ${currentPage === 1 ? '#666' : '#fff'}; 
                    border: none; 
                    padding: 0.5rem 1rem; 
                    border-radius: 4px; 
                    cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'};
                    font-size: 0.9rem;
                    transition: background-color 0.3s ease;
                ">
                    ← Previous
                </button>
                <span style="color: #ccc; font-size: 0.9rem;">
                    ${currentPage} of ${totalPages}
                </span>
                <button class="pagination-btn next-events" ${nextDisabled} style="
                    background: ${currentPage === totalPages ? '#333' : '#ff6b35'}; 
                    color: ${currentPage === totalPages ? '#666' : '#fff'}; 
                    border: none; 
                    padding: 0.5rem 1rem; 
                    border-radius: 4px; 
                    cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'};
                    font-size: 0.9rem;
                    transition: background-color 0.3s ease;
                ">
                    Next →
                </button>
            </div>
        `;
    }

    setupPaginationListeners() {
        // Bottom pagination buttons
        const prevBtn = document.querySelector('.prev-events');
        const nextBtn = document.querySelector('.next-events');
        
        // Top pagination buttons
        const prevBtnTop = document.querySelector('.prev-events-top');
        const nextBtnTop = document.querySelector('.next-events-top');

        // Previous button event listeners
        [prevBtn, prevBtnTop].forEach(btn => {
            if (btn && !btn.disabled) {
                btn.addEventListener('click', () => {
                    if (this.currentEventPage > 1) {
                        this.currentEventPage--;
                        this.showAllUpcomingEvents();
                    }
                });
            }
        });

        // Next button event listeners
        [nextBtn, nextBtnTop].forEach(btn => {
            if (btn && !btn.disabled) {
                btn.addEventListener('click', () => {
                    const totalEvents = this.events.filter(event => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return event.date >= today;
                    }).length;
                    const totalPages = Math.ceil(totalEvents / 5);
                    
                    if (this.currentEventPage < totalPages) {
                        this.currentEventPage++;
                        this.showAllUpcomingEvents();
                    }
                });
            }
        });
    }

    async createEventHTML(event, showDate = false) {
        const dateStr = showDate ? `${event.date.getDate()}/${event.date.getMonth() + 1} - ` : '';
        const locationStr = event.location ? `📍 ${event.location}` : '';
        const descriptionStr = event.description || '';
        
        // Rate display logic
        let rateStr = '';
        if (event.hasRegistration) {
            if (event.ratePerRider === 190) {
                // Standard rate - show "Standard Rates Apply"
                rateStr = `Standard Rates Apply`;
            } else {
                // Custom rate - show simplified format
                rateStr = `$${event.ratePerRider} AUD/rider`;
            }
        }
        
        // Add register button and spots info if event has registration enabled
        let registerButtonStr = '';
        let spotsDisplayStr = '';
        if (event.hasRegistration) {
            const eventDateStr = `${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
            
            // Get registration count for this event
            let showRegisterButton = true;
            let remainingSpots = null; // Initialize remainingSpots variable
            
            if (event.maxSpots !== null) {
                try {
                    const registrationCount = await this.getRegistrationCount(event.title, eventDateStr);
                    remainingSpots = event.maxSpots - registrationCount;
                    
                    if (remainingSpots > 0) {
                        const lowSpotsClass = remainingSpots < 5 ? ' low' : '';
                        spotsDisplayStr = `<div class="spots-remaining${lowSpotsClass}">${remainingSpots} spots remaining</div>`;
                        showRegisterButton = true;
                    } else {
                        spotsDisplayStr = `<div class="spots-remaining full">Event is full</div>`;
                        showRegisterButton = false;
                    }
                } catch (error) {
                    console.error('Error getting registration count:', error);
                    remainingSpots = event.maxSpots; // Fallback to max spots if error
                    spotsDisplayStr = `<div class="spots-remaining">${event.maxSpots} spots available</div>`;
                    showRegisterButton = true;
                }
            } else {
                spotsDisplayStr = `<div class="spots-remaining unlimited">Unlimited spots</div>`;
                showRegisterButton = true;
                remainingSpots = null; // No limit
            }
            
            // Check if this event is already selected
            const isSelected = this.isEventSelected(event);
            const eventKey = `${event.title}_${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
            
            if (showRegisterButton) {
                if (isSelected) {
                    registerButtonStr = `<button class="btn-remove-selection" onclick="calendar.removeEventFromSelection('${eventKey}')">Remove from Selection</button>`;
                } else {
                    // Store event data in a data attribute and use a simpler approach
                    registerButtonStr = `<button class="btn-add-selection" data-event-key="${eventKey}" onclick="calendar.addEventToSelectionByKey('${eventKey}', this)">Add to Selection</button>`;
                }
            }
        }
        
        return `
            <div class="event-item ${event.hasRegistration && this.isEventSelected(event) ? 'event-selected' : ''}">
                <div class="event-details-centered">
                    <div class="event-time-centered">${dateStr}${event.time}</div>
                    <div class="event-title-centered">${event.title}</div>
                    ${locationStr ? `<div class="event-location-centered">${locationStr}</div>` : ''}
                    ${descriptionStr ? `<div class="event-description-centered">${descriptionStr}</div>` : ''}
                    ${rateStr ? `<div class="event-rate-centered">${rateStr}</div>` : ''}
                </div>
                ${registerButtonStr ? `<div class="event-register-centered">${registerButtonStr}</div>` : ''}
                ${spotsDisplayStr ? `<div class="event-spots-centered">${spotsDisplayStr}</div>` : ''}
            </div>
        `;
    }

    async getRegistrationCount(eventName, eventDate) {
        try {
            const response = await fetch('/api/calendar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    eventName: eventName,
                    eventDate: eventDate
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            return data.registrationCount || 0;

        } catch (error) {
            console.error('Error fetching registration count:', error);
            return 0; // Return 0 if there's an error
        }
    }

    getEventsForDate(date) {
        // Return all events for the date, regardless of whether they're past or future
        // The visual styling will handle showing past events differently
        return this.events.filter(event => {
            return this.isSameDay(event.date, date);
        });
    }

    getEventsForMonth(date) {
        // Get today's date in Sydney timezone
        const todaySydney = new Date().toLocaleDateString('en-AU', {
            timeZone: 'Australia/Sydney',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const [dayToday, monthToday, yearToday] = todaySydney.split('/');
        const today = new Date(yearToday, monthToday - 1, dayToday);
        
        return this.events.filter(event => {
            const isInMonth = event.date.getMonth() === date.getMonth() && 
                             event.date.getFullYear() === date.getFullYear();
            const isDateTodayOrFuture = event.date >= today;
            return isInMonth && isDateTodayOrFuture;
        }).sort((a, b) => a.date - b.date);
    }

    isSameDay(date1, date2) {
        return date1.getDate() === date2.getDate() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getFullYear() === date2.getFullYear();
    }
}

// Global calendar instance for onclick handlers
let calendar;

// Initialize calendar when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('calendarDays') && !calendar) {
        calendar = new MotoCoachCalendar();
        // Expose calendar globally for other scripts
        window.calendar = calendar;
    }
});