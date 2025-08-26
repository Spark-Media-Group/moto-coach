class MotoCoachCalendar {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = null;
        this.events = [];
        this.currentWeekStart = null; // For mobile weekly view
        this.isMobileView = false;
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

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.isMobileView) {
                    this.previousWeek();
                } else {
                    this.previousMonth();
                }
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.isMobileView) {
                    this.nextWeek();
                } else {
                    this.nextMonth();
                }
            });
        }
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
                eventDate = new Date(event.start.dateTime);
                const startTime = this.formatTime(eventDate);
                
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

            // Check for registration requirement and clean description
            let description = event.description || '';
            let hasRegistration = false;
            
            // Case and spacing insensitive regex for "registration = on"
            const registrationRegex = /registration\s*=\s*on/i;
            if (registrationRegex.test(description)) {
                hasRegistration = true;
                // Remove the registration text from description
                description = description.replace(registrationRegex, '').trim();
                // Clean up any extra whitespace or newlines
                description = description.replace(/\n\s*\n/g, '\n').trim();
            }

            return {
                date: eventDate,
                time: timeString,
                title: event.summary || 'Untitled Event',
                description: description,
                location: event.location || '',
                type: this.categorizeEvent(event.summary || ''),
                hasRegistration: hasRegistration
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
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        await this.checkAndLoadEvents();
        this.renderCalendar();
        this.updateEventPanel();
    }

    async nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
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
            
            if (this.isSameDay(currentDay, today)) {
                dayElement.classList.add('today');
            }

            const dayEvents = this.getEventsForDate(currentDay);
            if (dayEvents.length > 0) {
                dayElement.classList.add('has-events');
                
                // Add event previews directly in the calendar day
                const eventsContainer = document.createElement('div');
                eventsContainer.className = 'day-events';
                
                // Show up to 3 events in the day box (2 for mobile)
                const maxEvents = this.isMobileView ? 2 : 3;
                dayEvents.slice(0, maxEvents).forEach(event => {
                    const eventPreview = document.createElement('div');
                    eventPreview.className = `event-preview event-${event.type}`;
                    
                    // Create event content: Event title, then time frame, then location
                    const maxTitleLength = this.isMobileView ? 12 : 15;
                    const eventTitle = event.title.length > maxTitleLength 
                        ? event.title.substring(0, maxTitleLength) + '...' 
                        : event.title;
                    
                    const eventTime = event.time === 'All Day' ? 'All Day' : event.time;
                    
                    let eventContent = `
                        <div class="event-title-small">${eventTitle}</div>
                        <div class="event-time-small">${eventTime}</div>
                    `;
                    
                    // Only show location on desktop to save space on mobile
                    if (!this.isMobileView && event.location) {
                        const eventLocation = event.location.length > 20 
                            ? event.location.substring(0, 20) + '...' 
                            : event.location;
                        eventContent += `<div class="event-location-small">📍 ${eventLocation}</div>`;
                    }
                    
                    eventPreview.innerHTML = eventContent;
                    eventsContainer.appendChild(eventPreview);
                });
                
                // If more events, show "and X more"
                if (dayEvents.length > maxEvents) {
                    const moreEvents = document.createElement('div');
                    moreEvents.className = 'more-events';
                    moreEvents.textContent = `+${dayEvents.length - maxEvents} more`;
                    eventsContainer.appendChild(moreEvents);
                }
                
                dayElement.appendChild(eventsContainer);
            }

            dayElement.addEventListener('click', () => {
                this.selectDate(currentDay);
            });
        }

        return dayElement;
    }

    selectDate(date) {
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

    updateEventPanel() {
        const eventList = document.getElementById('eventList');
        if (!eventList) return;

        if (this.selectedDate) {
            const dayEvents = this.getEventsForDate(this.selectedDate);
            
            if (dayEvents.length > 0) {
                eventList.innerHTML = dayEvents.map(event => this.createEventHTML(event)).join('');
            } else {
                eventList.innerHTML = '<p class="no-events">No events scheduled for this date</p>';
            }
        } else {
            const monthEvents = this.getEventsForMonth(this.currentDate);
            if (monthEvents.length > 0) {
                eventList.innerHTML = `
                    <p style="color: #ff6b35; font-weight: 600; margin-bottom: 1rem;">
                        Upcoming events this month:
                    </p>
                    ${monthEvents.slice(0, 5).map(event => this.createEventHTML(event, true)).join('')}
                `;
            } else {
                eventList.innerHTML = '<p class="no-events">No events scheduled this month</p>';
            }
        }
    }

    createEventHTML(event, showDate = false) {
        const dateStr = showDate ? `${event.date.getDate()}/${event.date.getMonth() + 1} - ` : '';
        const locationStr = event.location ? `<div class="event-location">📍 ${event.location}</div>` : '';
        const descriptionStr = event.description ? `<div class="event-description">${event.description}</div>` : '';
        
        // Add register button if event has registration enabled
        const registerButtonStr = event.hasRegistration ? 
            `<div class="event-register">
                <a href="programs/track_reserve.html?event=${encodeURIComponent(event.title)}&time=${encodeURIComponent(event.time)}&location=${encodeURIComponent(event.location || '')}&description=${encodeURIComponent(event.description || '')}" class="btn-register">Register</a>
            </div>` : '';
        
        return `
            <div class="event-item">
                <div class="event-time">${dateStr}${event.time}</div>
                <div class="event-title">${event.title}</div>
                ${locationStr}
                ${descriptionStr}
                ${registerButtonStr}
            </div>
        `;
    }

    getEventsForDate(date) {
        // Get today's date in Sydney timezone
        const todaySydney = new Date().toLocaleDateString('en-AU', {
            timeZone: 'Australia/Sydney',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const [dayToday, monthToday, yearToday] = todaySydney.split('/');
        const today = new Date(yearToday, monthToday - 1, dayToday);
        
        // Only return events from today onwards
        return this.events.filter(event => {
            const isSameDay = this.isSameDay(event.date, date);
            const isDateTodayOrFuture = date >= today;
            return isSameDay && isDateTodayOrFuture;
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

// Initialize calendar when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('calendarDays')) {
        new MotoCoachCalendar();
    }
});