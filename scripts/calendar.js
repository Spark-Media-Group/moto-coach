class MotoCoachCalendar {
    constructor() {
        this.currentDate = new Date();
        this.events = [];
        this.currentWeekStart = null; // For mobile weekly view
        this.isMobileView = false;
        this.selectedEvents = new Map(); // Store selected events for multi-registration
        this.currentEventPage = 1; // For event panel pagination
        this.cachedEventsPerPage = null; // Cache the events per page calculation
        this.globalRegistrationCache = new Map(); // Global cache for all registration counts
        this.cacheLastUpdated = null; // Track when cache was last updated
        this.monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        this.init();
    }

    // Throttle function to prevent excessive resize handling
    throttle(fn, wait = 150) {
        let lastTime = 0;
        return (...args) => {
            const now = Date.now();
            if (now - lastTime >= wait) {
                lastTime = now;
                fn(...args);
            }
        };
    }

    async init() {
        this.checkViewMode();
        this.bindEvents();
        
        // Render empty calendar immediately for instant display
        await this.renderEmptyCalendar();
        
        // Load all events and build global registration cache
        await this.loadEvents();
        await this.buildGlobalRegistrationCache();
        
        // Populate events into calendar and update events panel
        await this.populateEventsIntoCalendar();
        this.updateEventPanel();
        
        // Add throttled resize listener to switch between desktop/mobile views and recalculate pagination
        window.addEventListener('resize', this.throttle(async () => {
            this.checkViewMode();
            // Render empty calendar first for instant visual feedback
            await this.renderEmptyCalendar();
            // Then populate events into the existing calendar structure
            await this.populateEventsIntoCalendar();
            // Clear cached events per page if viewport changed significantly
            if (this.lastViewportHeight && Math.abs(window.innerHeight - this.lastViewportHeight) >= 100) {
                this.cachedEventsPerPage = null;
                this.lastViewportHeight = null;
            }
            // Recalculate events per page and update if needed
            if (this.events.length > 0) {
                const oldPage = this.currentEventPage;
                this.currentEventPage = 1; // Reset to first page
                this.updateEventPanel();
            }
        }, 150));
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

        // Note: Date selection removed - calendar is now view-only with hover interactions
    }

    async previousWeek() {
        this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
        // Render empty calendar first for instant visual feedback
        await this.renderEmptyCalendar();
        // Populate events (no need to load - all events already cached)
        await this.populateEventsIntoCalendar();
        // Note: Don't update event panel - upcoming events don't change when viewing different weeks
    }

    async nextWeek() {
        this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
        // Render empty calendar first for instant visual feedback
        await this.renderEmptyCalendar();
        // Populate events (no need to load - all events already cached)
        await this.populateEventsIntoCalendar();
        // Note: Don't update event panel - upcoming events don't change when viewing different weeks
    }

    async loadEvents() {
        try {
            // Calculate date range (6 months back to 12 months forward for comprehensive loading)
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 6);
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 12);

            const timeMin = startDate.toISOString();
            const timeMax = endDate.toISOString();

            // Call our Vercel API endpoint with higher maxResults for comprehensive loading
            const response = await fetch(`/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=200`);
            
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
                console.log(`Loaded ${this.events.length} events from Google Calendar (18-month range)`);
            }
            
        } catch (error) {
            console.error('Error loading calendar events:', error);
            console.log('No events to display');
            this.events = [];
        }
    }

    async buildGlobalRegistrationCache() {
        console.log('Building global registration cache for all events...');
        
        // Collect all unique events that need registration checks
        const eventsToCheck = new Map();
        
        for (const event of this.events) {
            if (event.maxSpots && event.maxSpots > 0) {
                const eventDateStr = `${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
                const eventKey = `${event.title}_${eventDateStr}`;
                if (!eventsToCheck.has(eventKey)) {
                    eventsToCheck.set(eventKey, {
                        title: event.title,
                        dateStr: eventDateStr,
                        maxSpots: event.maxSpots
                    });
                }
            }
        }
        
        if (eventsToCheck.size === 0) {
            console.log('No events require registration checks');
            return;
        }
        
        console.log(`Batch fetching registration counts for ${eventsToCheck.size} unique events...`);
        
        try {
            // Prepare batch request data
            const items = Array.from(eventsToCheck.values()).map(eventInfo => ({
                name: eventInfo.title,
                date: eventInfo.dateStr
            }));

            // Make single batch request
            const response = await fetch('/api/calendar?mode=batchCounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ items })
            });

            if (!response.ok) {
                throw new Error(`Batch API error: ${response.status}`);
            }

            const { counts } = await response.json();

            // Store results in global cache
            this.globalRegistrationCache.clear();
            for (const { title, dateStr, maxSpots } of eventsToCheck.values()) {
                const key = `${title}_${dateStr}`;
                const lookupKey = `${title.trim().toLowerCase()}__${dateStr}`;
                const count = counts[lookupKey] || 0;
                const remainingSpots = Math.max(0, maxSpots - count);
                
                this.globalRegistrationCache.set(key, {
                    key,
                    count,
                    remainingSpots
                });
            }

            this.cacheLastUpdated = new Date();
            console.log(`Global registration cache built with ${this.globalRegistrationCache.size} entries using batch request`);

        } catch (error) {
            console.error('Error building batch registration cache, falling back to individual requests:', error);
            
            // Fallback to individual requests if batch fails
            const registrationCountPromises = Array.from(eventsToCheck.values()).map(eventInfo => 
                this.getRegistrationCount(eventInfo.title, eventInfo.dateStr)
                    .then(count => ({
                        key: `${eventInfo.title}_${eventInfo.dateStr}`,
                        count: count,
                        remainingSpots: Math.max(0, eventInfo.maxSpots - count)
                    }))
                    .catch(error => {
                        console.error('Error getting registration count:', error);
                        return {
                            key: `${eventInfo.title}_${eventInfo.dateStr}`,
                            count: 0,
                            remainingSpots: eventInfo.maxSpots // Fallback
                        };
                    })
            );
            
            const registrationResults = await Promise.all(registrationCountPromises);
            
            // Store results in global cache
            this.globalRegistrationCache.clear();
            registrationResults.forEach(result => {
                this.globalRegistrationCache.set(result.key, result);
            });
            
            this.cacheLastUpdated = new Date();
            console.log(`Global registration cache built with ${this.globalRegistrationCache.size} entries using fallback method`);
        }
    }

    convertGoogleEvents(googleEvents) {
        return googleEvents.map(event => {
            let eventDate;
            let eventEndDate;
            let timeString = 'All Day';

            if (event.start.dateTime) {
                // Use the date exactly as it appears in the calendar, no timezone conversion
                eventDate = new Date(event.start.dateTime);
                eventEndDate = event.end.dateTime ? new Date(event.end.dateTime) : eventDate;
                const startTime = this.formatTime(eventDate);
                
                if (event.end.dateTime) {
                    const endTime = this.formatTime(eventEndDate);
                    timeString = `${startTime} - ${endTime}`;
                } else {
                    timeString = startTime;
                }
            } else if (event.start.date) {
                eventDate = new Date(event.start.date);
                eventEndDate = event.end.date ? new Date(event.end.date) : eventDate;
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
                endDate: eventEndDate,
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

    isEventPast(event) {
        const now = new Date();
        // If event has an end time, check if it has ended
        if (event.endDate) {
            return event.endDate < now;
        }
        // If no end time, check if the start date has passed
        return event.date < now;
    }

    async previousMonth() {
        // Use a safer method to decrement month
        const currentMonth = this.currentDate.getMonth();
        const currentYear = this.currentDate.getFullYear();
        
        // Create a new date for the first day of the previous month
        this.currentDate = new Date(currentYear, currentMonth - 1, 1);
        
        // Render empty calendar first for instant visual feedback
        await this.renderEmptyCalendar();
        // Populate events (no need to load - all events already cached)
        await this.populateEventsIntoCalendar();
        // Note: Don't update event panel - upcoming events don't change when viewing different months
    }

    async nextMonth() {
        // Use a safer method to increment month
        const currentMonth = this.currentDate.getMonth();
        const currentYear = this.currentDate.getFullYear();
        
        // Create a new date for the next month
        this.currentDate = new Date(currentYear, currentMonth + 1, 1);
        
        // Render empty calendar first for instant visual feedback
        await this.renderEmptyCalendar();
        // Populate events (no need to load - all events already cached)
        await this.populateEventsIntoCalendar();
        // Note: Don't update event panel - upcoming events don't change when viewing different months
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

    async renderEmptyCalendar() {
        const monthElement = document.getElementById('currentMonth');
        const daysContainer = document.getElementById('calendarDays');

        if (!monthElement || !daysContainer) return;

        if (this.isMobileView) {
            await this.renderEmptyWeeklyView(monthElement, daysContainer);
        } else {
            await this.renderEmptyMonthlyView(monthElement, daysContainer);
        }
    }

    async populateEventsIntoCalendar() {
        const daysContainer = document.getElementById('calendarDays');
        if (!daysContainer) return;

        // Get all day elements and populate them with events using global cache
        const dayElements = daysContainer.querySelectorAll('.calendar-day');
        const dayElementData = [];
        
        // Collect all day element data
        for (const dayElement of dayElements) {
            const dayNumber = parseInt(dayElement.querySelector('.day-number').textContent);
            const isOtherMonth = dayElement.classList.contains('other-month');
            
            if (!isOtherMonth) {
                // Calculate the date for this day element
                let currentDay;
                if (this.isMobileView && dayElement.dataset.fullDate) {
                    currentDay = new Date(dayElement.dataset.fullDate);
                } else {
                    currentDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), dayNumber);
                }
                
                const dayEvents = this.getEventsForDate(currentDay);
                dayElementData.push({ dayElement, currentDay, dayEvents });
            }
        }
        
        // Populate events using global registration cache
        for (const { dayElement, currentDay, dayEvents } of dayElementData) {
            await this.populateEventsForDayWithCache(dayElement, currentDay, dayEvents, this.globalRegistrationCache);
        }
    }

    async populateEventsForDayWithCache(dayElement, currentDay, dayEvents, registrationCountMap) {
        if (dayEvents.length > 0) {
            dayElement.classList.add('has-events');
            
            // Check if ALL events on this day are past
            const allEventsPast = dayEvents.every(event => this.isEventPast(event));
            if (allEventsPast) {
                dayElement.classList.add('past-event');
            }
            
            if (this.isMobileView) {
                // Mobile: Show just the number of events
                const existingEventCount = dayElement.querySelector('.event-count');
                if (!existingEventCount) {
                    const eventCount = document.createElement('div');
                    eventCount.className = 'event-count';
                    eventCount.textContent = dayEvents.length;
                    dayElement.appendChild(eventCount);
                }
            } else {
                // Desktop: Show event previews
                const existingEventsContainer = dayElement.querySelector('.day-events');
                if (!existingEventsContainer) {
                    const eventsContainer = document.createElement('div');
                    eventsContainer.className = 'day-events';
                    
                    // Show up to 3 events in the day box
                    for (const event of dayEvents.slice(0, 3)) {
                        const eventPreview = document.createElement('div');
                        eventPreview.className = `event-preview event-${event.type}`;
                        
                        // Check if event is full using cached data
                        let isEventFull = false;
                        if (event.maxSpots && event.maxSpots > 0) {
                            const eventDateStr = `${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
                            const eventKey = `${event.title}_${eventDateStr}`;
                            const cachedResult = registrationCountMap.get(eventKey);
                            
                            if (cachedResult) {
                                isEventFull = cachedResult.remainingSpots <= 0;
                            }
                        }
                        
                        if (isEventFull) {
                            // Show "EVENT FULL" for full events - no click handler
                            const eventTitle = event.title.length > 15 
                                ? event.title.substring(0, 15) + '...' 
                                : event.title;
                            const eventTime = event.time === 'All Day' ? 'All Day' : event.time;
                            
                            eventPreview.innerHTML = `
                                <div class="event-title-small">${eventTitle}</div>
                                <div class="event-time-small">${eventTime}</div>
                                <div class="event-full-indicator">EVENT FULL</div>
                            `;
                            eventPreview.classList.add('event-full');
                        } else {
                            // Show normal event details with click handler for available events
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
                            
                            // Add click handler only for available events
                            if (!this.isEventPast(event)) {
                                eventPreview.style.cursor = 'pointer';
                                eventPreview.classList.add('clickable-event');
                                
                                // Create unique event ID for scrolling
                                const eventId = this.generateEventId(event);
                                eventPreview.addEventListener('click', () => {
                                    this.scrollToEventInUpcomingList(eventId);
                                });
                            }
                        }
                        
                        eventsContainer.appendChild(eventPreview);
                    }
                    
                    // If more events, show "and X more"
                    if (dayEvents.length > 3) {
                        const moreEvents = document.createElement('div');
                        moreEvents.className = 'more-events';
                        moreEvents.textContent = `+${dayEvents.length - 3} more`;
                        eventsContainer.appendChild(moreEvents);
                    }
                    
                    dayElement.appendChild(eventsContainer);
                }
            }
        }
    }

    async renderEmptyWeeklyView(monthElement, daysContainer) {
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

        // Render 7 empty days of the week
        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(this.currentWeekStart);
            currentDay.setDate(this.currentWeekStart.getDate() + i);
            
            const dayElement = this.createEmptyDayElement(currentDay.getDate(), false, currentDay);
            daysContainer.appendChild(dayElement);
        }
    }

    async renderEmptyMonthlyView(monthElement, daysContainer) {
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
            const dayElement = this.createEmptyDayElement(prevMonth.getDate() - i, true);
            daysContainer.appendChild(dayElement);
        }

        // Current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = this.createEmptyDayElement(day, false);
            daysContainer.appendChild(dayElement);
        }

        // Next month's leading days
        const totalCells = daysContainer.children.length;
        const remainingCells = 42 - totalCells;
        for (let day = 1; day <= remainingCells; day++) {
            const dayElement = this.createEmptyDayElement(day, true);
            daysContainer.appendChild(dayElement);
        }
    }

    createEmptyDayElement(day, isOtherMonth, fullDate = null) {
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
                // Store the full date for later event population
                dayElement.dataset.fullDate = fullDate.toISOString();
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

            if (isPastDay) {
                // Add past-event class even if no events, for visual consistency
                dayElement.classList.add('past-event');
            }
        }

        return dayElement;
    }

    async renderCalendar() {
        const monthElement = document.getElementById('currentMonth');
        const daysContainer = document.getElementById('calendarDays');

        if (!monthElement || !daysContainer) return;

        if (this.isMobileView) {
            await this.renderWeeklyView(monthElement, daysContainer);
        } else {
            await this.renderMonthlyView(monthElement, daysContainer);
        }
    }

    async renderWeeklyView(monthElement, daysContainer) {
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
            
            const dayElement = await this.createDayElement(currentDay.getDate(), false, currentDay);
            daysContainer.appendChild(dayElement);
        }
    }

    async renderMonthlyView(monthElement, daysContainer) {
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
            const dayElement = await this.createDayElement(prevMonth.getDate() - i, true);
            daysContainer.appendChild(dayElement);
        }

        // Current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = await this.createDayElement(day, false);
            daysContainer.appendChild(dayElement);
        }

        // Next month's leading days
        const totalCells = daysContainer.children.length;
        const remainingCells = 42 - totalCells;
        for (let day = 1; day <= remainingCells; day++) {
            const dayElement = await this.createDayElement(day, true);
            daysContainer.appendChild(dayElement);
        }
    }

    async createDayElement(day, isOtherMonth, fullDate = null) {
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
                
                // Check if ALL events on this day are past
                const allEventsPast = dayEvents.every(event => this.isEventPast(event));
                if (allEventsPast) {
                    dayElement.classList.add('past-event');
                }
                
                if (this.isMobileView) {
                    // Mobile: Show just the number of events
                    const eventCount = document.createElement('div');
                    eventCount.className = 'event-count';
                    eventCount.textContent = dayEvents.length;
                    dayElement.appendChild(eventCount);
                } else {
                    // Desktop: Show event previews or "EVENT FULL" for full events
                    const eventsContainer = document.createElement('div');
                    eventsContainer.className = 'day-events';
                    
                    // Show up to 3 events in the day box
                    for (const event of dayEvents.slice(0, 3)) {
                        const eventPreview = document.createElement('div');
                        eventPreview.className = `event-preview event-${event.type}`;
                        
                        // Check if event is full
                        let isEventFull = false;
                        if (event.maxSpots && event.maxSpots > 0) {
                            const eventDateStr = `${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
                            const registrationCount = await this.getRegistrationCount(event.title, eventDateStr);
                            const remainingSpots = event.maxSpots - registrationCount;
                            isEventFull = remainingSpots <= 0;
                        }
                        
                        if (isEventFull) {
                            // Show "EVENT FULL" for full events - no click handler
                            const eventTitle = event.title.length > 15 
                                ? event.title.substring(0, 15) + '...' 
                                : event.title;
                            const eventTime = event.time === 'All Day' ? 'All Day' : event.time;
                            
                            eventPreview.innerHTML = `
                                <div class="event-title-small">${eventTitle}</div>
                                <div class="event-time-small">${eventTime}</div>
                                <div class="event-full-indicator">EVENT FULL</div>
                            `;
                            eventPreview.classList.add('event-full');
                        } else {
                            // Show normal event details with click handler for available events
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
                            
                            // Add click handler only for available events
                            if (!this.isEventPast(event)) {
                                eventPreview.style.cursor = 'pointer';
                                eventPreview.classList.add('clickable-event');
                                
                                // Create unique event ID for scrolling
                                const eventId = this.generateEventId(event);
                                eventPreview.addEventListener('click', () => {
                                    this.scrollToEventInUpcomingList(eventId);
                                });
                            }
                        }
                        
                        eventsContainer.appendChild(eventPreview);
                    }
                    
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

            // Remove click event - calendar dates are now view-only (hover only)
        }

        return dayElement;
    }

    // Generate unique event ID for calendar-to-upcoming-events scrolling
    generateEventId(event) {
        // Create a unique ID based on event title and date
        const dateStr = `${event.date.getDate()}-${event.date.getMonth() + 1}-${event.date.getFullYear()}`;
        const titleStr = event.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
        return `event-${titleStr}-${dateStr}`;
    }

    // Scroll to specific event in upcoming events list
    scrollToEventInUpcomingList(eventId) {
        const eventElement = document.getElementById(eventId);
        if (eventElement) {
            // Scroll the element into view with smooth animation
            eventElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
            
            // Add a highlight effect
            eventElement.classList.add('event-highlighted');
            setTimeout(() => {
                eventElement.classList.remove('event-highlighted');
            }, 2000);
        }
    }

    // Date selection methods removed - calendar is now view-only

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
            dateString: event.dateString,  // Add this field for backend compatibility
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

        // Show all upcoming events (no date selection)
        await this.showAllUpcomingEvents();
    }

    async showAllUpcomingEvents() {
        const eventList = document.getElementById('eventList');
        if (!eventList) return;

        // Get all upcoming events (from today onwards)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let allUpcomingEvents = this.events
            .filter(event => event.date >= today && !this.isEventPast(event))
            .sort((a, b) => a.date - b.date);

        if (allUpcomingEvents.length === 0) {
            eventList.innerHTML = '<p class="no-events">No available events scheduled</p>';
            return;
        }

        // Show loading state
        eventList.innerHTML = `
            <div class="events-header">
                <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 0.5rem; line-height: 1.4;">
                    Standard rates: $190/rider (single event), $175/rider (2 events), $150/rider (3+ events)
                </p>
            </div>
            <p class="loading-events">Loading event details...</p>
        `;

        try {
            // Filter out full events using global registration cache
            const availableEvents = allUpcomingEvents.filter(event => {
                if (event.hasRegistration && event.maxSpots !== null) {
                    const eventDateStr = `${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
                    const eventKey = `${event.title}_${eventDateStr}`;
                    const cachedResult = this.globalRegistrationCache.get(eventKey);
                    
                    if (cachedResult) {
                        return cachedResult.remainingSpots > 0;
                    }
                    // If no cached result, include the event (fallback)
                    return true;
                } else {
                    // Events without registration limits or unlimited spots
                    return true;
                }
            });

            if (availableEvents.length === 0) {
                eventList.innerHTML = '<p class="no-events">No available events scheduled</p>';
                return;
            }

            // Generate HTML for available events using global registration cache
            const eventHTMLPromises = availableEvents.map(event => this.createEventHTMLWithCache(event, true, this.globalRegistrationCache));
            const eventHTMLs = await Promise.all(eventHTMLPromises);

            eventList.innerHTML = `
                <div class="events-header">
                    <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 0.5rem; line-height: 1.4;">
                        Standard rates: $190/rider (single event), $175/rider (2 events), $150/rider (3+ events)
                    </p>
                </div>
                <div class="events-list-scrollable">
                    ${eventHTMLs.join('')}
                </div>
            `;

        } catch (error) {
            console.error('Error loading upcoming events:', error);
            eventList.innerHTML = '<p class="no-events">Error loading events</p>';
        }
    }

    async createEventHTMLWithCache(event, showDate = false, registrationCountMap) {
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
        const isEventPast = this.isEventPast(event);
        
        if (event.hasRegistration && !isEventPast) {
            const eventDateStr = `${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
            const eventKey = `${event.title}_${eventDateStr}`;
            
            // Get registration count from cache
            let showRegisterButton = true;
            let remainingSpots = null;
            
            if (event.maxSpots !== null) {
                const cachedResult = registrationCountMap.get(eventKey);
                
                if (cachedResult) {
                    remainingSpots = cachedResult.remainingSpots;
                    
                    if (remainingSpots > 0) {
                        const lowSpotsClass = remainingSpots < 5 ? ' low' : '';
                        spotsDisplayStr = `<div class="spots-remaining${lowSpotsClass}">${remainingSpots} spots remaining</div>`;
                        showRegisterButton = true;
                    } else {
                        spotsDisplayStr = `<div class="spots-remaining full">Event is full</div>`;
                        showRegisterButton = false;
                    }
                } else {
                    // Fallback if no cached data
                    remainingSpots = event.maxSpots;
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
            const selectionEventKey = `${event.title}_${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
            
            if (showRegisterButton) {
                if (isSelected) {
                    registerButtonStr = `<button class="btn-remove-selection" onclick="calendar.removeEventFromSelection('${selectionEventKey}')">Remove from Selection</button>`;
                } else {
                    // Store event data in a data attribute and use a simpler approach
                    registerButtonStr = `<button class="btn-add-selection" data-event-key="${selectionEventKey}" onclick="calendar.addEventToSelectionByKey('${selectionEventKey}', this)">Add to Selection</button>`;
                }
            }
        }
        
        return `
            <div id="${this.generateEventId(event)}" class="event-item ${event.hasRegistration && this.isEventSelected(event) ? 'event-selected' : ''} ${isEventPast ? 'past-event' : ''}">
                <div class="event-details-centered">
                    <div class="event-time-centered">${dateStr}${event.time}</div>
                    <div class="event-title-centered">${event.title}</div>
                    ${locationStr ? `<div class="event-location-centered">${locationStr}</div>` : ''}
                    ${descriptionStr ? `<div class="event-description-centered">${descriptionStr}</div>` : ''}
                    ${rateStr ? `<div class="event-rate-centered">${rateStr}</div>` : ''}
                    ${isEventPast ? `<div class="event-past-notice">Event has ended</div>` : ''}
                </div>
                ${registerButtonStr ? `<div class="event-register-centered">${registerButtonStr}</div>` : ''}
                ${spotsDisplayStr ? `<div class="event-spots-centered">${spotsDisplayStr}</div>` : ''}
            </div>
        `;
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
        const isEventPast = this.isEventPast(event);
        
        if (event.hasRegistration && !isEventPast) {
            const eventDateStr = `${event.date.getDate()}/${event.date.getMonth() + 1}/${event.date.getFullYear()}`;
            
            // Get registration count for this event
            let showRegisterButton = true;
            let remainingSpots = null; // Initialize remainingSpots variable
            
            if (event.maxSpots !== null) {
                try {
                    // Use global registration cache instead of individual API call
                    const cacheKey = `${event.title}_${eventDateStr}`;
                    const cached = this.globalRegistrationCache.get(cacheKey);
                    
                    if (cached) {
                        remainingSpots = cached.remainingSpots;
                    } else {
                        // Fallback to individual API call if not in cache
                        const registrationCount = await this.getRegistrationCount(event.title, eventDateStr);
                        remainingSpots = event.maxSpots - registrationCount;
                    }
                    
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
            <div id="${this.generateEventId(event)}" class="event-item ${event.hasRegistration && this.isEventSelected(event) ? 'event-selected' : ''} ${isEventPast ? 'past-event' : ''}">
                <div class="event-details-centered">
                    <div class="event-time-centered">${dateStr}${event.time}</div>
                    <div class="event-title-centered">${event.title}</div>
                    ${locationStr ? `<div class="event-location-centered">${locationStr}</div>` : ''}
                    ${descriptionStr ? `<div class="event-description-centered">${descriptionStr}</div>` : ''}
                    ${rateStr ? `<div class="event-rate-centered">${rateStr}</div>` : ''}
                    ${isEventPast ? `<div class="event-past-notice">Event has ended</div>` : ''}
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

    calculateEventsPerPage() {
        // Return cached value if available and viewport hasn't changed significantly
        if (this.cachedEventsPerPage && this.lastViewportHeight && 
            Math.abs(window.innerHeight - this.lastViewportHeight) < 50) {
            return this.cachedEventsPerPage;
        }

        // Get the calendar wrapper and event panel for boundary detection
        const calendarWrapper = document.querySelector('.calendar-wrapper');
        const eventPanel = document.getElementById('eventPanel');
        
        if (!calendarWrapper || !eventPanel) {
            return 3; // Conservative fallback
        }

        // Get the calendar wrapper bottom boundary (this is your red line)
        const calendarRect = calendarWrapper.getBoundingClientRect();
        const calendarBottom = calendarRect.bottom;
        
        // Get the event panel top position
        const eventPanelRect = eventPanel.getBoundingClientRect();
        const eventPanelTop = eventPanelRect.top;
        
        // Calculate space for headers and pagination
        const headerSpace = 120; // Space for "Upcoming Events" header and pricing info
        const paginationSpace = 80; // Space for pagination controls
        const buffer = 20; // Safety buffer
        
        // Available height for actual events
        const availableHeight = calendarBottom - eventPanelTop - headerSpace - paginationSpace - buffer;
        
        // Use a consistent event height estimate (based on your reduced card height)
        const eventHeight = 140; // Height per event including margins
        
        // Calculate how many events fit
        const calculatedEvents = Math.floor(availableHeight / eventHeight);
        
        // Apply conservative bounds
        const eventsPerPage = Math.max(2, Math.min(6, calculatedEvents));
        
        // Cache the result
        this.cachedEventsPerPage = eventsPerPage;
        this.lastViewportHeight = window.innerHeight;
        
        console.log(`Calendar bottom: ${calendarBottom}px, Panel top: ${eventPanelTop}px`);
        console.log(`Available: ${availableHeight}px, Event height: ${eventHeight}px, Events: ${eventsPerPage}`);
        
        return eventsPerPage;
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