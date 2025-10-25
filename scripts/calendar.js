const TRACK_RESERVE_TRANSFER_PREFIX = 'TRACK_RESERVE::';

function formatAustralianDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date?.valueOf?.())) {
        return '';
    }

    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

function normalizeAustralianDateString(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    const parts = trimmed.split('/');
    if (parts.length !== 3) {
        return trimmed;
    }

    const [dayPart, monthPart, yearPart] = parts;
    const day = parseInt(dayPart, 10);
    const month = parseInt(monthPart, 10);
    const year = parseInt(yearPart, 10);

    if ([day, month, year].some(number => Number.isNaN(number))) {
        return trimmed;
    }

    return `${day}/${month}/${year}`;
}

class MotoCoachCalendar {
    constructor() {
        this.currentDate = new Date();
        this.events = [];
        this.isMobileView = false;
        this.selectedEvents = new Map(); // Store selected events for multi-registration
        this.currentEventPage = 1; // For event panel pagination
        this.cachedEventsPerPage = null; // Cache the events per page calculation
        this.globalRegistrationCache = new Map(); // Global cache for all registration counts
        this.cacheLastUpdated = null; // Track when cache was last updated
        this.heightSyncRaf = null; // Track pending animation frame for height syncing
        this.apiKey = 'calendar-app-2024'; // Simple API key for request validation
        this.hasLoadedEvents = false;
        this.pageElement = null;
        this.mobileLoadingElement = null;
        this.mobileModalElements = {
            modal: null,
            dialog: null,
            content: null,
            title: null,
            date: null,
            close: null
        };
        this.mobileModalActiveDate = null;
        this.mobileModalLastFocus = null;
        this.handleDocumentKeyDown = this.handleDocumentKeyDown.bind(this);
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

    // HTML escape function to prevent XSS
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDescriptionForDisplay(description) {
        if (typeof description !== 'string') {
            return '';
        }

        const normalized = description
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();

        if (!normalized) {
            return '';
        }

        return normalized
            .split('\n')
            .map(line => this.escapeHtml(line.trim()))
            .filter(line => line.length > 0)
            .join('<br>');
    }

    // Create DOM element safely with text content
    createElementWithText(tag, className, textContent) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (textContent) element.textContent = textContent;
        return element;
    }

    createSelectionButton(eventKey, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.eventKey = eventKey;

        if (action === 'remove') {
            button.className = 'btn-remove-selection';
            button.textContent = 'Remove from Selection';
            button.addEventListener('click', () => this.removeEventFromSelection(eventKey));
        } else {
            button.className = 'btn-add-selection';
            button.textContent = 'Add to Selection';
            button.addEventListener('click', () => this.addEventToSelectionByKey(eventKey));
        }

        return button;
    }

    async init() {
        this.cacheDomElements();
        this.checkViewMode();
        this.updateMobileLoadingState();
        this.bindEvents();
        this.setupMobileModal();

        // Render empty calendar immediately for instant display
        await this.renderEmptyCalendar();
        
        // Load all events and build global registration cache
        await this.loadEvents();
        await this.buildGlobalRegistrationCache();

        // Populate events into calendar and update events panel
        await this.populateEventsIntoCalendar();
        await this.updateEventPanel();

        this.hasLoadedEvents = true;
        this.updateMobileLoadingState();

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
                await this.updateEventPanel();
            }

            this.updateMobileLoadingState();
        }, 150));
    }

    cacheDomElements() {
        this.pageElement = document.querySelector('.calendar-page');
        this.mobileLoadingElement = document.getElementById('mobileCalendarLoading');
    }

    checkViewMode() {
        const wasMobile = this.isMobileView;
        this.isMobileView = window.innerWidth <= 768;

        if (wasMobile && !this.isMobileView) {
            this.closeMobileModal();
        }

        this.scheduleEventPanelHeightSync();
        this.updateMobileLoadingState();
    }

    bindEvents() {
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');

        if (prevBtn && !prevBtn.hasAttribute('data-bound')) {
            prevBtn.setAttribute('data-bound', 'true');
            prevBtn.addEventListener('click', () => {
                this.previousMonth();
            });
        }

        if (nextBtn && !nextBtn.hasAttribute('data-bound')) {
            nextBtn.setAttribute('data-bound', 'true');
            nextBtn.addEventListener('click', () => {
                this.nextMonth();
            });
        }

        // Note: Date selection removed - calendar is now view-only with hover interactions
    }

    updateMobileLoadingState() {
        if (!this.pageElement) {
            return;
        }

        const shouldShowMobileSpinner = this.isMobileView && !this.hasLoadedEvents;
        this.pageElement.classList.toggle('mobile-loading', shouldShowMobileSpinner);

        if (!this.mobileLoadingElement) {
            return;
        }

        if (shouldShowMobileSpinner) {
            this.mobileLoadingElement.removeAttribute('hidden');
        } else {
            this.mobileLoadingElement.setAttribute('hidden', '');
        }
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
                const eventDateStr = formatAustralianDate(event.date);
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
                date: normalizeAustralianDateString(eventInfo.dateStr)
            }));

            // Make single batch request
            const response = await fetch('/api/calendar?mode=batchCounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Key': this.apiKey
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

    formatCurrency(amount) {
        if (typeof amount !== 'number' || Number.isNaN(amount)) {
            return '';
        }

        try {
            return new Intl.NumberFormat('en-AU', {
                style: 'currency',
                currency: 'AUD',
                maximumFractionDigits: 0
            }).format(amount);
        } catch (error) {
            console.warn('Unable to format currency amount', error);
            return `$${amount}`;
        }
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

    isDateBeforeToday(date) {
        if (!(date instanceof Date)) {
            return false;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const comparisonDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return comparisonDate < today;
    }

    async previousMonth() {
        // Use a safer method to decrement month
        const currentMonth = this.currentDate.getMonth();
        const currentYear = this.currentDate.getFullYear();

        // Create a new date for the first day of the previous month
        this.currentDate = new Date(currentYear, currentMonth - 1, 1);

        this.closeMobileModal();

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

        this.closeMobileModal();

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

        await this.renderEmptyMonthlyView(monthElement, daysContainer);
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
            dayElement.dataset.fullDate = currentDay.toISOString();
            await this.populateEventsForDayWithCache(dayElement, currentDay, dayEvents, this.globalRegistrationCache);
        }

        if (this.isMobileModalOpen() && this.mobileModalActiveDate) {
            this.renderMobileModalContent(this.mobileModalActiveDate);
        }

        this.scheduleEventPanelHeightSync();
    }

    async populateEventsForDayWithCache(dayElement, currentDay, dayEvents, registrationCountMap) {
        const isPastDay = this.isDateBeforeToday(currentDay);

        // Reset view-specific elements before repopulating
        if (!this.isMobileView) {
            const existingMobileCount = dayElement.querySelector('.event-count');
            if (existingMobileCount) {
                existingMobileCount.remove();
            }
        }

        const existingDesktopCount = dayElement.querySelector('.event-count-label');
        if (existingDesktopCount) {
            existingDesktopCount.remove();
        }

        const dayHeader = dayElement.querySelector('.calendar-day-header');

        if (dayEvents.length > 0) {
            dayElement.classList.add('has-events');
            dayElement.classList.remove('past-event');

            // Check if ALL events on this day are past
            const allEventsPast = dayEvents.every(event => this.isEventPast(event));
            if (allEventsPast || isPastDay) {
                dayElement.classList.add('past-event');
            }

            if (this.isMobileView) {
                const existingDesktopContainer = dayElement.querySelector('.day-events');
                if (existingDesktopContainer) {
                    existingDesktopContainer.remove();
                }

                // Mobile: Show just the number of events
                const existingEventCount = dayElement.querySelector('.event-count');
                const eventCount = existingEventCount || document.createElement('div');
                eventCount.className = 'event-count';
                const countLabel = dayEvents.length === 1 ? '1 Event' : `${dayEvents.length} Events`;
                eventCount.textContent = countLabel;
                eventCount.classList.toggle('event-count--past', isPastDay);
                if (!existingEventCount) {
                    dayElement.appendChild(eventCount);
                }

                dayElement.dataset.fullDate = currentDay.toISOString();

                if (isPastDay) {
                    this.disableMobileDayInteraction(dayElement);
                } else {
                    this.enableMobileDayInteraction(dayElement, currentDay, dayEvents);
                }
            } else {
                // Desktop: Show event previews and count label
                let eventsContainer = dayElement.querySelector('.day-events');
                if (!eventsContainer) {
                    eventsContainer = document.createElement('div');
                    eventsContainer.className = 'day-events';
                    dayElement.appendChild(eventsContainer);
                }

                eventsContainer.innerHTML = '';

                // Show up to 3 events in the day box
                for (const event of dayEvents.slice(0, 3)) {
                    const eventPreview = document.createElement('div');
                    eventPreview.className = `event-preview event-${event.type}`;

                    // Check if event is full using cached data
                    let isEventFull = false;
                    if (event.maxSpots && event.maxSpots > 0) {
                        const eventDateStr = formatAustralianDate(event.date);
                        const eventKey = `${event.title}_${eventDateStr}`;
                        const cachedResult = registrationCountMap.get(eventKey);

                        if (cachedResult) {
                            if (typeof cachedResult.remainingSpots === 'number') {
                                event.remainingSpots = cachedResult.remainingSpots;
                                isEventFull = cachedResult.remainingSpots <= 0;
                            } else {
                                isEventFull = cachedResult.remainingSpots <= 0;
                            }
                        }
                    }

                    if (isEventFull) {
                        // Show "EVENT FULL" for full events - no click handler
                        const eventTitle = event.title.length > 15
                            ? event.title.substring(0, 15) + '...'
                            : event.title;
                        const eventTime = event.time === 'All Day' ? 'All Day' : event.time;

                        // Create elements safely to prevent XSS
                        const titleDiv = this.createElementWithText('div', 'event-title-small', eventTitle);
                        const timeDiv = this.createElementWithText('div', 'event-time-small', eventTime);
                        const fullDiv = this.createElementWithText('div', 'event-full-indicator', 'EVENT FULL');

                        eventPreview.appendChild(titleDiv);
                        eventPreview.appendChild(timeDiv);
                        eventPreview.appendChild(fullDiv);
                        eventPreview.classList.add('event-full');
                    } else {
                        // Show normal event details with click handler for available events
                        const maxTitleLength = 15;
                        const eventTitle = event.title.length > maxTitleLength
                            ? event.title.substring(0, maxTitleLength) + '...'
                            : event.title;

                        const eventTime = event.time === 'All Day' ? 'All Day' : event.time;

                        // Create elements safely to prevent XSS
                        const titleDiv = this.createElementWithText('div', 'event-title-small', eventTitle);
                        const timeDiv = this.createElementWithText('div', 'event-time-small', eventTime);

                        eventPreview.appendChild(titleDiv);
                        eventPreview.appendChild(timeDiv);

                        // Show location on desktop
                        if (event.location) {
                            const eventLocation = event.location.length > 20
                                ? event.location.substring(0, 20) + '...'
                                : event.location;
                            const locationDiv = this.createElementWithText('div', 'event-location-small', `📍 ${eventLocation}`);
                            eventPreview.appendChild(locationDiv);
                        }

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

                const eventsCountLabel = document.createElement('div');
                eventsCountLabel.className = 'event-count-label';
                eventsCountLabel.textContent = dayEvents.length === 1 ? '1 EVENT' : `${dayEvents.length} EVENTS`;
                eventsCountLabel.setAttribute('aria-hidden', 'true');
                (dayHeader || dayElement).appendChild(eventsCountLabel);
            }
        } else {
            dayElement.classList.remove('has-events');

            if (isPastDay) {
                // Add past-event class even if no events, for visual consistency
                dayElement.classList.add('past-event');
            } else {
                dayElement.classList.remove('past-event');
            }

            if (this.isMobileView) {
                this.disableMobileDayInteraction(dayElement);
                const existingEventCount = dayElement.querySelector('.event-count');
                if (existingEventCount) {
                    existingEventCount.remove();
                }
            } else {
                const existingEventsContainer = dayElement.querySelector('.day-events');
                if (existingEventsContainer) {
                    existingEventsContainer.remove();
                }
            }
        }
    }

    buildMobileDayAriaLabel(date, dayEvents) {
        const formattedDate = date.toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        const countLabel = dayEvents.length === 1 ? '1 event' : `${dayEvents.length} events`;
        return `${formattedDate}, ${countLabel}`;
    }

    enableMobileDayInteraction(dayElement, currentDay, dayEvents) {
        if (!dayElement) {
            return;
        }

        dayElement.classList.remove('mobile-day-disabled');
        dayElement.setAttribute('tabindex', '0');
        dayElement.setAttribute('role', 'button');
        dayElement.setAttribute('aria-label', this.buildMobileDayAriaLabel(currentDay, dayEvents));

        if (!dayElement._mobileClickHandler) {
            dayElement._mobileClickHandler = () => {
                const { fullDate } = dayElement.dataset;
                if (fullDate) {
                    this.openMobileModal(new Date(fullDate));
                }
            };
        }

        if (!dayElement._mobileKeydownHandler) {
            dayElement._mobileKeydownHandler = event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    const { fullDate } = dayElement.dataset;
                    if (fullDate) {
                        this.openMobileModal(new Date(fullDate));
                    }
                }
            };
        }

        dayElement.removeEventListener('click', dayElement._mobileClickHandler);
        dayElement.addEventListener('click', dayElement._mobileClickHandler);

        dayElement.removeEventListener('keydown', dayElement._mobileKeydownHandler);
        dayElement.addEventListener('keydown', dayElement._mobileKeydownHandler);
    }

    disableMobileDayInteraction(dayElement) {
        if (!dayElement) {
            return;
        }

        if (dayElement._mobileClickHandler) {
            dayElement.removeEventListener('click', dayElement._mobileClickHandler);
        }

        if (dayElement._mobileKeydownHandler) {
            dayElement.removeEventListener('keydown', dayElement._mobileKeydownHandler);
        }

        dayElement.classList.add('mobile-day-disabled');
        dayElement.removeAttribute('tabindex');
        dayElement.removeAttribute('role');
        dayElement.removeAttribute('aria-label');
    }

    setupMobileModal() {
        if (typeof document === 'undefined') {
            return;
        }

        const modal = document.getElementById('mobileDayModal');
        const content = document.getElementById('mobileDayModalContent');
        const title = document.getElementById('mobileDayModalTitle');
        const dateLabel = document.getElementById('mobileDayModalDate');
        const closeButton = document.getElementById('mobileDayModalClose');

        this.mobileModalElements.modal = modal || null;
        this.mobileModalElements.dialog = modal ? modal.querySelector('.mobile-day-modal__dialog') : null;
        this.mobileModalElements.content = content || null;
        this.mobileModalElements.title = title || null;
        this.mobileModalElements.date = dateLabel || null;
        this.mobileModalElements.close = closeButton || null;

        if (this.mobileModalElements.dialog && !this.mobileModalElements.dialog.hasAttribute('tabindex')) {
            this.mobileModalElements.dialog.setAttribute('tabindex', '-1');
        }

        if (!modal) {
            return;
        }

        modal.setAttribute('aria-hidden', 'true');

        if (closeButton) {
            closeButton.addEventListener('click', () => this.closeMobileModal());
        }

        modal.addEventListener('click', event => {
            if (event.target === modal || event.target?.dataset?.closeModal === 'true') {
                this.closeMobileModal();
            }
        });

        document.addEventListener('keydown', this.handleDocumentKeyDown);
    }

    openMobileModal(date) {
        if (!this.isMobileView || !(date instanceof Date)) {
            return;
        }

        const modal = this.mobileModalElements.modal;
        if (!modal) {
            return;
        }

        const events = this.getEventsForDate(date);
        if (events.length === 0) {
            return;
        }

        this.mobileModalActiveDate = new Date(date);
        this.mobileModalLastFocus = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        this.renderMobileModalContent(this.mobileModalActiveDate);

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');

        const closeButton = this.mobileModalElements.close;
        if (closeButton) {
            closeButton.focus({ preventScroll: true });
        } else if (this.mobileModalElements.dialog) {
            this.mobileModalElements.dialog.focus({ preventScroll: true });
        }
    }

    closeMobileModal() {
        const modal = this.mobileModalElements.modal;
        if (!modal || !this.isMobileModalOpen()) {
            return;
        }

        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        this.mobileModalActiveDate = null;

        if (this.mobileModalLastFocus && typeof this.mobileModalLastFocus.focus === 'function') {
            this.mobileModalLastFocus.focus({ preventScroll: true });
        }

        this.mobileModalLastFocus = null;
    }

    isMobileModalOpen() {
        return Boolean(this.mobileModalElements.modal && this.mobileModalElements.modal.classList.contains('is-open'));
    }

    renderMobileModalContent(date) {
        if (!(date instanceof Date)) {
            return;
        }

        const content = this.mobileModalElements.content;
        if (!content) {
            return;
        }

        const events = this.getEventsForDate(date).slice().sort((a, b) => a.date - b.date);

        const dateLabel = date.toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        const eventsCountLabel = events.length === 1 ? '1 Event' : `${events.length} Events`;

        if (this.mobileModalElements.date) {
            this.mobileModalElements.date.textContent = dateLabel;
        }

        if (this.mobileModalElements.title) {
            this.mobileModalElements.title.textContent = eventsCountLabel;
        }

        content.innerHTML = '';
        content.scrollTop = 0;

        if (events.length === 0) {
            const emptyState = this.createElementWithText('p', 'mobile-event-card__empty', 'No events scheduled for this day.');
            content.appendChild(emptyState);
            return;
        }

        for (const event of events) {
            const card = document.createElement('article');
            card.className = 'mobile-event-card';

            const isPast = this.isEventPast(event);
            if (isPast) {
                card.classList.add('past-event');
            }

            const titleElement = this.createElementWithText('h4', 'mobile-event-card__title', event.title || 'Moto Coach Event');
            card.appendChild(titleElement);

            const metaContainer = document.createElement('div');
            metaContainer.className = 'mobile-event-card__meta';

            const timeLabel = event.time && typeof event.time === 'string' ? event.time : 'Time TBA';
            metaContainer.appendChild(this.createElementWithText('span', 'mobile-event-card__meta-item', `🕒 ${timeLabel}`));

            if (event.location) {
                metaContainer.appendChild(this.createElementWithText('span', 'mobile-event-card__meta-item', `📍 ${event.location}`));
            }

            if (typeof event.ratePerRider === 'number' && event.ratePerRider > 0) {
                metaContainer.appendChild(this.createElementWithText('span', 'mobile-event-card__meta-item', `💲 ${this.formatCurrency(event.ratePerRider)}`));
            }

            card.appendChild(metaContainer);

            if (event.description) {
                const cleanedDescription = event.description.replace(/\s+/g, ' ').trim();
                if (cleanedDescription) {
                    const maxLength = 220;
                    const preview = cleanedDescription.length > maxLength
                        ? `${cleanedDescription.substring(0, maxLength).trim()}…`
                        : cleanedDescription;
                    card.appendChild(this.createElementWithText('p', 'mobile-event-card__description', preview));
                }
            }

            const eventDateStr = formatAustralianDate(event.date);
            const eventKey = `${event.title}_${eventDateStr}`;
            const cachedResult = this.globalRegistrationCache.get(eventKey);
            let remainingSpots = null;
            if (cachedResult && typeof cachedResult.remainingSpots === 'number') {
                remainingSpots = cachedResult.remainingSpots;
            } else if (typeof event.remainingSpots === 'number') {
                remainingSpots = event.remainingSpots;
            }

            let statusText = 'Spots available';
            let statusClass = 'available';
            let isFull = false;

            if (isPast) {
                statusText = 'Event completed';
                statusClass = 'full';
                isFull = true;
            } else if (event.hasRegistration && typeof remainingSpots === 'number') {
                if (remainingSpots <= 0) {
                    statusText = 'Event full';
                    statusClass = 'full';
                    isFull = true;
                } else if (remainingSpots <= 3) {
                    statusText = `${remainingSpots} spot${remainingSpots === 1 ? '' : 's'} left`;
                    statusClass = 'limited';
                } else {
                    statusText = `${remainingSpots} spots available`;
                }
            } else if (!event.hasRegistration) {
                statusText = 'Contact us to register';
            }

            const statusWrapper = document.createElement('div');
            statusWrapper.className = 'mobile-event-card__status';
            statusWrapper.appendChild(this.createElementWithText('span', `mobile-event-card__status-text ${statusClass}`, statusText));
            card.appendChild(statusWrapper);

            const actions = document.createElement('div');
            actions.className = 'mobile-event-card__actions';

            const isSelected = this.selectedEvents.has(eventKey);
            if (isSelected) {
                const removeBtn = this.createElementWithText('button', 'btn-remove-selection', 'Remove from Selection');
                removeBtn.addEventListener('click', () => {
                    this.removeEventFromSelection(eventKey);
                    this.renderMobileModalContent(date);
                });
                actions.appendChild(removeBtn);
            } else if (event.hasRegistration && !isPast && !isFull) {
                const addBtn = this.createElementWithText('button', 'btn-add-selection', 'Add to Selection');
                addBtn.addEventListener('click', () => {
                    this.addEventToSelection(event);
                    this.renderMobileModalContent(date);
                });
                actions.appendChild(addBtn);
            }

            if (!event.hasRegistration) {
                actions.appendChild(this.createElementWithText('div', 'mobile-event-card__note', 'Online registration not required for this event.'));
            } else if ((isPast || isFull) && !isSelected) {
                const message = isPast
                    ? 'This event has already finished.'
                    : 'This event is fully booked.';
                actions.appendChild(this.createElementWithText('div', 'mobile-event-card__note', message));
            }

            if (actions.children.length > 0) {
                card.appendChild(actions);
            }

            content.appendChild(card);
        }
    }

    getMobileModalFocusableElements() {
        const dialog = this.mobileModalElements.dialog;
        if (!dialog) {
            return [];
        }

        const selectors = [
            'a[href]',
            'button:not([disabled])',
            'textarea:not([disabled])',
            'input:not([type="hidden"]):not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ].join(', ');

        return Array.from(dialog.querySelectorAll(selectors));
    }

    handleDocumentKeyDown(event) {
        if (!this.isMobileModalOpen()) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeMobileModal();
            return;
        }

        if (event.key === 'Tab') {
            const focusable = this.getMobileModalFocusableElements();
            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey) {
                if (document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
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

        // Create day header container
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';

        // Create day number
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayHeader.appendChild(dayNumber);
        dayElement.appendChild(dayHeader);

        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        } else {
            const today = new Date();
            const currentDay = fullDate instanceof Date
                ? fullDate
                : new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);

            dayElement.dataset.fullDate = currentDay.toISOString();

            const isPastDay = this.isDateBeforeToday(currentDay);

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

    async createDayElement(day, isOtherMonth, fullDate = null) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';

        // Create day header container
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';

        // Create day number
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayHeader.appendChild(dayNumber);
        dayElement.appendChild(dayHeader);

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

            const isPastDay = this.isDateBeforeToday(currentDay);

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

                    const maxVisibleEvents = 3;
                    let renderedCount = 0;

                    for (const event of dayEvents) {
                        const eventPreview = document.createElement('div');
                        eventPreview.className = `event-preview event-${event.type}`;

                        if (renderedCount >= maxVisibleEvents) {
                            eventPreview.classList.add('extra-event');
                        }
                        
                        // Check if event is full
                        let isEventFull = false;
                        if (event.maxSpots && event.maxSpots > 0) {
                            const eventDateStr = formatAustralianDate(event.date);
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
                            
                            // Create safe DOM elements
                            const titleDiv = this.createElementWithText('div', 'event-title-small', eventTitle);
                            const timeDiv = this.createElementWithText('div', 'event-time-small', eventTime);
                            const fullDiv = this.createElementWithText('div', 'event-full-indicator', 'EVENT FULL');
                            
                            eventPreview.appendChild(titleDiv);
                            eventPreview.appendChild(timeDiv);
                            eventPreview.appendChild(fullDiv);
                            
                            eventPreview.classList.add('event-full');
                        } else {
                            // Show normal event details with click handler for available events
                            const maxTitleLength = 15;
                            const eventTitle = event.title.length > maxTitleLength 
                                ? event.title.substring(0, maxTitleLength) + '...' 
                                : event.title;
                            
                            const eventTime = event.time === 'All Day' ? 'All Day' : event.time;
                            
                            // Create safe DOM elements
                            const titleDiv = this.createElementWithText('div', 'event-title-small', eventTitle);
                            const timeDiv = this.createElementWithText('div', 'event-time-small', eventTime);
                            
                            eventPreview.appendChild(titleDiv);
                            eventPreview.appendChild(timeDiv);
                            
                            // Show location on desktop
                            if (event.location) {
                                const eventLocation = event.location.length > 20 
                                    ? event.location.substring(0, 20) + '...' 
                                    : event.location;
                                const locationDiv = this.createElementWithText('div', 'event-location-small', `📍 ${eventLocation}`);
                                eventPreview.appendChild(locationDiv);
                            }
                            
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
                        renderedCount++;
                    }

                    // If more events, show "and X more"
                    if (dayEvents.length > maxVisibleEvents) {
                        const moreEvents = document.createElement('div');
                        moreEvents.className = 'more-events';
                        moreEvents.dataset.moreCount = dayEvents.length - maxVisibleEvents;
                        moreEvents.textContent = `+${dayEvents.length - maxVisibleEvents} more`;
                        moreEvents.setAttribute('aria-label', `${dayEvents.length - maxVisibleEvents} additional events`);
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

    addEventToSelectionByKey(eventKey) {
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

            // Reset previous content before rendering updated selection summary
            selectionPanel.innerHTML = '';

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

            // Create selection panel DOM elements safely
            const header = document.createElement('div');
            header.className = 'selection-header';
            
            const title = this.createElementWithText('h4', null, `${selectionCount} Event${selectionCount !== 1 ? 's' : ''} Selected`);
            const total = this.createElementWithText('span', 'selection-total', `$${totalCost.toFixed(2)} AUD`);
            
            header.appendChild(title);
            header.appendChild(total);
            selectionPanel.appendChild(header);
            
            // Add pricing breakdown if exists
            if (pricingBreakdown) {
                const breakdownDiv = document.createElement('div');
                breakdownDiv.innerHTML = pricingBreakdown; // Safe since this is controlled content
                selectionPanel.appendChild(breakdownDiv);
            }
            
            // Create action buttons safely
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'selection-actions';
            
            const clearBtn = this.createElementWithText('button', 'btn-clear-selection', 'Clear All');
            clearBtn.addEventListener('click', () => this.clearSelection());
            
            const registerBtn = this.createElementWithText('button', 'btn-register-selected', 'Register for Selected Events');
            registerBtn.addEventListener('click', () => this.proceedToRegistration());
            
            actionsDiv.appendChild(clearBtn);
            actionsDiv.appendChild(registerBtn);
            selectionPanel.appendChild(actionsDiv);
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
                const eventRegister = eventItem.querySelector('.event-register') || registerContainer;

                if (addButton) {
                    const eventKey = addButton.dataset.eventKey || addButton.getAttribute('data-event-key');
                    if (eventKey && this.selectedEvents.has(eventKey)) {
                        const removeBtn = this.createSelectionButton(eventKey, 'remove');
                        registerContainer.replaceChild(removeBtn, addButton);
                        if (eventRegister) {
                            eventRegister.classList.add('event-selected');
                        }
                    }
                } else if (removeButton) {
                    const eventKey = removeButton.dataset.eventKey || removeButton.getAttribute('data-event-key');
                    if (eventKey && !this.selectedEvents.has(eventKey)) {
                        const addBtn = this.createSelectionButton(eventKey, 'add');
                        registerContainer.replaceChild(addBtn, removeButton);
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

        if (typeof window !== 'undefined' && typeof window.name === 'string' && window.name.startsWith(TRACK_RESERVE_TRANSFER_PREFIX)) {
            window.name = '';
        }
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
            maxSpots: typeof event.maxSpots === 'number' ? event.maxSpots : null,
            remainingSpots: typeof event.remainingSpots === 'number' ? event.remainingSpots : null
        }));

        const pricingInfo = {
            totalCost: totalCost,
            defaultEventsCount: defaultRateEvents.length,
            customEventsCount: customRateEvents.length,
            bundlePrice: bundlePrice,
            hasBundleDiscount: defaultRateEvents.length > 1
        };

        const transferPayload = {
            type: events.length > 1 ? 'multi' : 'single',
            events: eventData,
            pricingInfo
        };

        const transferEnvelope = {
            ...transferPayload,
            timestamp: Date.now()
        };

        try {
            sessionStorage.setItem('trackReserveEventDetails', JSON.stringify(transferEnvelope));
        } catch (error) {
            console.warn('Unable to persist selected events for track reservation transfer', error);
        }

        if (typeof window !== 'undefined') {
            try {
                window.name = `${TRACK_RESERVE_TRANSFER_PREFIX}${JSON.stringify(transferEnvelope)}`;
            } catch (error) {
                console.warn('Unable to persist selected events using window.name fallback', error);
            }
        }

        window.location.href = 'programs/track_reserve.html';
    }

    async updateEventPanel() {
        const eventList = document.getElementById('eventList');
        if (!eventList) return;

        // Show all upcoming events (no date selection)
        await this.showAllUpcomingEvents();
    }

    scheduleEventPanelHeightSync() {
        if (typeof window === 'undefined') {
            return;
        }

        if (this.heightSyncRaf) {
            cancelAnimationFrame(this.heightSyncRaf);
        }

        this.heightSyncRaf = window.requestAnimationFrame(() => {
            this.heightSyncRaf = null;
            this.syncEventPanelHeight();
        });
    }

    syncEventPanelHeight() {
        const eventPanel = document.getElementById('eventPanel');

        if (!eventPanel) {
            return;
        }

        if (this.isMobileView) {
            eventPanel.style.removeProperty('height');
            eventPanel.style.removeProperty('max-height');
            return;
        }

        const calendarSection = document.querySelector('.calendar-main-container .calendar-section');

        if (!calendarSection) {
            return;
        }

        const calendarHeight = calendarSection.offsetHeight;

        if (calendarHeight > 0) {
            eventPanel.style.height = `${calendarHeight}px`;
            eventPanel.style.maxHeight = `${calendarHeight}px`;
        } else {
            eventPanel.style.removeProperty('height');
            eventPanel.style.removeProperty('max-height');
        }
    }

    createEventsHeader() {
        const eventsHeader = document.createElement('div');
        eventsHeader.className = 'events-header';

        const ratesP = this.createElementWithText('p', null, 'Standard rates: $190/rider (single event), $175/rider (2 events), $150/rider (3+ events)');
        ratesP.style.color = '#ccc';
        ratesP.style.fontSize = '0.9rem';
        ratesP.style.marginBottom = '0.5rem';
        ratesP.style.lineHeight = '1.4';

        eventsHeader.appendChild(ratesP);
        return eventsHeader;
    }

    renderEventPanelLoadingState(eventList) {
        if (!eventList) return;

        eventList.innerHTML = '';

        const eventsHeader = this.createEventsHeader();
        const loadingState = document.createElement('div');
        loadingState.className = 'event-loading-state';
        loadingState.setAttribute('role', 'status');

        const spinner = document.createElement('div');
        spinner.className = 'calendar-loading-spinner';
        spinner.setAttribute('aria-hidden', 'true');

        const loadingText = this.createElementWithText('p', 'loading-events', 'Loading upcoming events...');
        loadingText.setAttribute('aria-live', 'polite');

        loadingState.appendChild(spinner);
        loadingState.appendChild(loadingText);

        eventList.appendChild(eventsHeader);
        eventList.appendChild(loadingState);

        this.scheduleEventPanelHeightSync();
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
            eventList.innerHTML = '';
            const noEventsP = this.createElementWithText('p', 'no-events', 'No available events scheduled');
            eventList.appendChild(noEventsP);
            this.updateStructuredData([]);
            this.scheduleEventPanelHeightSync();
            return;
        }

        // Show loading state while event details are prepared
        this.renderEventPanelLoadingState(eventList);

        try {
            // Filter out full events using global registration cache
            const availableEvents = allUpcomingEvents.filter(event => {
                if (event.hasRegistration && event.maxSpots !== null) {
                    const eventDateStr = formatAustralianDate(event.date);
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
                eventList.innerHTML = '';
                const noEventsP = this.createElementWithText('p', 'no-events', 'No available events scheduled');
                eventList.appendChild(noEventsP);
                this.updateStructuredData([]);
                this.scheduleEventPanelHeightSync();
                return;
            }

            // Generate HTML for available events using global registration cache
            const eventElements = await Promise.all(
                availableEvents.map(event => this.createEventElementWithCache(event, true, this.globalRegistrationCache))
            );

            // Create final event list with safe DOM
            eventList.innerHTML = '';

            const eventsHeader = this.createEventsHeader();

            const eventsScrollable = document.createElement('div');
            eventsScrollable.className = 'events-list-scrollable';
            eventElements.forEach(element => {
                if (element) {
                    eventsScrollable.appendChild(element);
                }
            });

            eventList.appendChild(eventsHeader);
            eventList.appendChild(eventsScrollable);

            this.updateStructuredData(availableEvents);

            this.scheduleEventPanelHeightSync();

        } catch (error) {
            console.error('Error loading upcoming events:', error);
            eventList.innerHTML = '';
            const errorP = this.createElementWithText('p', 'no-events', 'Error loading events');
            eventList.appendChild(errorP);
            this.updateStructuredData([]);
            this.scheduleEventPanelHeightSync();
        }
    }

    async createEventElementWithCache(event, showDate = false, registrationCountMap = new Map()) {
        const eventItem = document.createElement('div');
        const elementId = this.generateEventId(event);
        if (elementId) {
            eventItem.id = elementId;
        }

        const isEventPast = this.isEventPast(event);
        const eventClasses = ['event-item'];
        if (event.hasRegistration && this.isEventSelected(event)) {
            eventClasses.push('event-selected');
        }
        if (isEventPast) {
            eventClasses.push('past-event');
        }
        eventItem.className = eventClasses.join(' ');

        const detailsContainer = document.createElement('div');
        detailsContainer.className = 'event-details-centered';

        const datePrefix = showDate ? `${event.date.getDate()}/${event.date.getMonth() + 1}` : '';
        let timeContent = event.time || '';
        if (showDate && event.time) {
            timeContent = `${datePrefix} - ${event.time}`;
        } else if (showDate) {
            timeContent = datePrefix;
        }

        detailsContainer.appendChild(this.createElementWithText('div', 'event-time-centered', timeContent));
        detailsContainer.appendChild(this.createElementWithText('div', 'event-title-centered', event.title || ''));

        if (event.location) {
            detailsContainer.appendChild(this.createElementWithText('div', 'event-location-centered', `📍 ${event.location}`));
        }

        if (event.description) {
            const formattedDescription = this.formatDescriptionForDisplay(event.description);
            if (formattedDescription) {
                const descriptionElement = document.createElement('div');
                descriptionElement.className = 'event-description-centered';
                descriptionElement.innerHTML = formattedDescription;
                detailsContainer.appendChild(descriptionElement);
            }
        }

        if (event.hasRegistration) {
            if (event.ratePerRider === 190) {
                detailsContainer.appendChild(this.createElementWithText('div', 'event-rate-centered', 'Standard Rates Apply'));
            } else if (typeof event.ratePerRider === 'number') {
                detailsContainer.appendChild(this.createElementWithText('div', 'event-rate-centered', `$${event.ratePerRider} AUD/rider`));
            }
        }

        if (isEventPast) {
            detailsContainer.appendChild(this.createElementWithText('div', 'event-past-notice', 'Event has ended'));
        }

        eventItem.appendChild(detailsContainer);

        const eventDateStr = formatAustralianDate(event.date);
        const eventKey = `${event.title}_${eventDateStr}`;
        const isSelected = this.isEventSelected(event);

        let registerButton = null;
        let registerContainerSelected = isSelected;
        let spotsInfo = null;
        let showRegisterButton = false;

        if (event.hasRegistration && !isEventPast) {
            showRegisterButton = true;

            if (event.maxSpots !== null && event.maxSpots !== undefined) {
                let remainingSpots = null;

                try {
                    const cachedResult = registrationCountMap.get(eventKey);

                    if (cachedResult) {
                        remainingSpots = cachedResult.remainingSpots;
                    } else {
                        const registrationCount = await this.getRegistrationCount(event.title, eventDateStr);
                        remainingSpots = event.maxSpots - registrationCount;
                    }

                    if (remainingSpots > 0) {
                        spotsInfo = {
                            text: `${remainingSpots} spots remaining`,
                            classes: ['spots-remaining', ...(remainingSpots < 5 ? ['low'] : [])]
                        };
                    } else {
                        spotsInfo = {
                            text: 'Event is full',
                            classes: ['spots-remaining', 'full']
                        };
                        showRegisterButton = false;
                    }
                } catch (error) {
                    console.error('Error getting registration count:', error);
                    remainingSpots = event.maxSpots;
                    spotsInfo = {
                        text: `${event.maxSpots} spots available`,
                        classes: ['spots-remaining']
                    };
                }
            } else {
                spotsInfo = {
                    text: 'Unlimited spots',
                    classes: ['spots-remaining', 'unlimited']
                };
            }

            if (showRegisterButton) {
                registerButton = this.createSelectionButton(eventKey, isSelected ? 'remove' : 'add');
            }
        }

        if (registerButton) {
            const registerContainer = document.createElement('div');
            registerContainer.className = 'event-register-centered';
            if (registerContainerSelected) {
                registerContainer.classList.add('event-selected');
            }
            registerContainer.appendChild(registerButton);
            eventItem.appendChild(registerContainer);
        }

        if (spotsInfo) {
            const spotsContainer = document.createElement('div');
            spotsContainer.className = 'event-spots-centered';

            const spotsElement = document.createElement('div');
            spotsElement.className = spotsInfo.classes.join(' ');
            spotsElement.textContent = spotsInfo.text;

            spotsContainer.appendChild(spotsElement);
            eventItem.appendChild(spotsContainer);
        }

        return eventItem;
    }

    async getRegistrationCount(eventName, eventDate) {
        try {
            const response = await fetch('/api/calendar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Key': this.apiKey
                },
                body: JSON.stringify({
                    eventName: eventName,
                    eventDate: normalizeAustralianDateString(eventDate)
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

    updateStructuredData(events) {
        const schemaElement = document.getElementById('event-schema');

        if (!schemaElement) {
            return;
        }

        if (!Array.isArray(events) || events.length === 0) {
            schemaElement.textContent = '';
            return;
        }

        const normalizedEvents = events
            .filter(event => event && event.date instanceof Date && !this.isEventPast(event))
            .sort((a, b) => a.date - b.date)
            .slice(0, 10)
            .map((event, index) => {
                const eventId = this.generateEventId(event);
                const eventUrl = `https://motocoach.com.au/calendar.html#${eventId}`;
                const description = event.description || 'Moto Coach motocross coaching session in Sydney.';
                const price = typeof event.ratePerRider === 'number' ? event.ratePerRider.toFixed(2) : '190.00';
                const locationName = event.location && event.location.trim().length > 0 ? event.location.trim() : 'Moto Coach Training Venue';

                const eventData = {
                    '@type': 'Event',
                    'name': event.title,
                    'startDate': event.date.toISOString(),
                    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
                    'eventStatus': 'https://schema.org/EventScheduled',
                    'description': description,
                    'organizer': {
                        '@type': 'Organization',
                        'name': 'Moto Coach',
                        'url': 'https://motocoach.com.au'
                    },
                    'location': {
                        '@type': 'Place',
                        'name': locationName,
                        'address': {
                            '@type': 'PostalAddress',
                            'addressLocality': 'Sydney',
                            'addressRegion': 'NSW',
                            'addressCountry': 'AU'
                        }
                    },
                    'offers': {
                        '@type': 'Offer',
                        'priceCurrency': 'AUD',
                        'price': price,
                        'availability': 'https://schema.org/InStock',
                        'url': eventUrl
                    }
                };

                if (event.endDate instanceof Date) {
                    eventData.endDate = event.endDate.toISOString();
                }

                return {
                    '@type': 'ListItem',
                    'position': index + 1,
                    'url': eventUrl,
                    'item': eventData
                };
            });

        if (normalizedEvents.length === 0) {
            schemaElement.textContent = '';
            return;
        }

        const schema = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            'name': 'Upcoming Moto Coach Events',
            'itemListElement': normalizedEvents
        };

        schemaElement.textContent = JSON.stringify(schema, null, 2);
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