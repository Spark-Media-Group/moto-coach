import { ensureBotIdClient } from './botid-client.js';

const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';
let riderCount = 1;
let ratePerRider = 190; // Default rate in AUD
let maxSpots = null; // Maximum spots available for the event
let remainingSpots = null; // Remaining spots available

const EVENT_STORAGE_KEY = 'trackReserveEventDetails';
let cachedEventDetails = null;

function sanitizeStoredEvent(event) {
    return {
        title: event?.title || '',
        date: event?.date || '',
        time: event?.time || '',
        location: event?.location || '',
        description: event?.description || ''
    };
}

function persistEventDetails(details) {
    if (typeof window === 'undefined') {
        return;
    }

    if (!details || !Array.isArray(details.events) || details.events.length === 0) {
        cachedEventDetails = null;
        try {
            window.sessionStorage.removeItem(EVENT_STORAGE_KEY);
        } catch (error) {
            console.warn('Unable to clear stored event details:', error);
        }
        return;
    }

    const sanitized = {
        type: details.type || (details.events.length > 1 ? 'multi' : 'single'),
        events: details.events.map(sanitizeStoredEvent),
        pricingInfo: details.pricingInfo || null
    };

    cachedEventDetails = sanitized;

    try {
        window.sessionStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(sanitized));
    } catch (error) {
        console.warn('Unable to persist calendar event details:', error);
    }
}

function restoreStoredEventDetails() {
    if (typeof window === 'undefined') {
        return null;
    }

    if (cachedEventDetails) {
        return cachedEventDetails;
    }

    try {
        const stored = window.sessionStorage.getItem(EVENT_STORAGE_KEY);
        if (stored) {
            cachedEventDetails = JSON.parse(stored);
            return cachedEventDetails;
        }
    } catch (error) {
        console.warn('Unable to restore calendar event details:', error);
    }

    return null;
}

function getStoredEventDetails() {
    return cachedEventDetails || restoreStoredEventDetails();
}

function updateStoredEventDetails(updater) {
    const current = getStoredEventDetails();
    if (!current) {
        return;
    }

    const clone = JSON.parse(JSON.stringify(current));
    const updated = updater(clone) || clone;
    persistEventDetails(updated);
}

function readCheckoutSession() {
    try {
        const stored = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        console.warn('Track Reserve: Unable to read checkout session payload', error);
        return null;
    }
}

function writeCheckoutSession(data) {
    try {
        sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.warn('Track Reserve: Unable to persist checkout payload', error);
    }
}

function showInlineMessage(type, message) {
    const statusEl = document.getElementById('formStatus');
    if (!statusEl) {
        if (type === 'error') {
            alert(message);
        }
        return;
    }

    statusEl.textContent = message;
    statusEl.classList.remove('success', 'error');
    if (type === 'success') {
        statusEl.classList.add('success');
    } else if (type === 'error') {
        statusEl.classList.add('error');
    }
}

function clearInlineMessage() {
    const statusEl = document.getElementById('formStatus');
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.remove('success', 'error');
    }
}

// Function to get selected events from the calendar
function getSelectedEvents() {
    // Try to access the global calendar variable from window only
    const calendarInstance = window.calendar;
    if (calendarInstance && calendarInstance.selectedEvents) {
        return Array.from(calendarInstance.selectedEvents.values());
    }
    return [];
}

// Function to get events from URL parameters or calendar
function getEventsForSubmission() {
    // First try to get events from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const multiEventsParam = urlParams.get('multiEvents');
    
    if (multiEventsParam) {
        try {
            const events = JSON.parse(decodeURIComponent(multiEventsParam));
            return events;
        } catch (error) {
            console.error('Error parsing URL events:', error);
        }
    }
    
    // Check for single event from URL parameters
    const eventName = urlParams.get('event');
    const eventDate = urlParams.get('date');
    const eventTime = urlParams.get('time');
    const eventLocation = urlParams.get('location');
    
    if (eventName && eventDate) {
        return [{
            title: eventName,
            dateString: eventDate,
            time: eventTime || '',
            location: eventLocation || '',
            eventKey: `${eventName}_${eventDate}`
        }];
    }
    
    // Finally try to get from calendar (for calendar-based selection)
    const calendarEvents = getSelectedEvents();
    if (calendarEvents.length > 0) {
        return calendarEvents;
    }
    
    return [];
}

// Add rider functionality
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await ensureBotIdClient([
            { path: '/api/track_reserve', method: 'POST' }
        ]);
    } catch (error) {
        console.warn('Bot protection initialisation failed for track reserve form:', error);
    }

    restoreStoredEventDetails();
    initializePricing();

    const addRiderBtn = document.getElementById('addRiderBtn');
    if (addRiderBtn) {
        addRiderBtn.addEventListener('click', function() {
            clearInlineMessage();
            if (remainingSpots !== null && riderCount >= remainingSpots) {
                const urlParams = new URLSearchParams(window.location.search);
                const multiEventsParam = urlParams.get('multiEvents');
                const message = multiEventsParam
                    ? `Cannot add more riders. One of your selected events only has ${remainingSpots} spot${remainingSpots !== 1 ? 's' : ''} remaining.`
                    : `Maximum ${remainingSpots} rider${remainingSpots !== 1 ? 's' : ''} allowed for this event.`;
                showInlineMessage('error', message);
                return;
            }

            riderCount++;
            const riderId = `rider${riderCount}`;
            const ridersContainer = document.getElementById('ridersContainer');
            const newRiderHTML = `
                <div class="rider-section" id="${riderId}">
                    <div class="rider-header">
                        <h4>Rider ${riderCount}</h4>
                        <button type="button" class="remove-rider-btn" onclick="removeRider('${riderId}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="riderFirstName${riderCount}">First Name *</label>
                            <input type="text" id="riderFirstName${riderCount}" name="riderFirstName${riderCount}" required>
                        </div>
                        <div class="form-group">
                            <label for="riderLastName${riderCount}">Last Name *</label>
                            <input type="text" id="riderLastName${riderCount}" name="riderLastName${riderCount}" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="bikeNumber${riderCount}">Bike Number (Optional)</label>
                            <input type="text" id="bikeNumber${riderCount}" name="bikeNumber${riderCount}">
                        </div>
                        <div class="form-group">
                            <label for="bikeSize${riderCount}">Bike Size *</label>
                            <select id="bikeSize${riderCount}" name="bikeSize${riderCount}" required>
                                <option value="">Select bike size</option>
                                <option value="50cc">50cc</option>
                                <option value="65cc">65cc</option>
                                <option value="85cc">85cc</option>
                                <option value="125cc">125cc</option>
                                <option value="250cc">250cc</option>
                                <option value="450cc">450cc</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="dateOfBirth${riderCount}">Date of Birth (DD/MM/YYYY) *</label>
                            <input type="text" id="dateOfBirth${riderCount}" name="dateOfBirth${riderCount}" required
                                   pattern="^(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])/\\d{4}$"
                                   placeholder="DD/MM/YYYY"
                                   maxlength="10"
                                   onchange="toggleAgeBasedFields('${riderCount}')"
                                   onblur="validateAustralianDate(this)"
                                   oninput="formatDateInput(this)">
                        </div>
                    </div>

                    <div class="rider-contact-section" id="riderContactSection${riderCount}" style="display: none;">
                        <h4 style="color: #ccc; margin: 15px 0 10px 0; font-size: 1em;">Contact Information (18+ only)</h4>
                        <div class="form-row" id="riderContactFields${riderCount}">
                            <div class="form-group">
                                <label for="riderEmail${riderCount}">Email Address *</label>
                                <input type="email" id="riderEmail${riderCount}" name="riderEmail${riderCount}">
                            </div>
                            <div class="form-group">
                                <label for="riderPhone${riderCount}">Phone Number *</label>
                                <input type="tel" id="riderPhone${riderCount}" name="riderPhone${riderCount}">
                            </div>
                        </div>
                    </div>
                </div>
            `;

            ridersContainer.insertAdjacentHTML('beforeend', newRiderHTML);
            updateRemoveButtons();
            updatePricing();
            updateAddRiderButton();
        });
    }

    const initialDob = document.getElementById('dateOfBirth1');
    if (initialDob) {
        initialDob.addEventListener('change', () => toggleAgeBasedFields('1'));
        initialDob.addEventListener('blur', () => validateAustralianDate(initialDob));
        initialDob.addEventListener('input', () => formatDateInput(initialDob));
    }

    const form = document.querySelector('.track-reservation-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmission);
    }

    populateEventDetails();
    updatePricing();
});


// Remove rider functionality
function removeRider(riderId) {
    const riderElement = document.getElementById(riderId);
    if (riderElement) {
        riderElement.remove();
        updateRemoveButtons();
        renumberRiders();
    }
}

// Update visibility of remove buttons
function updateRemoveButtons() {
    const riderSections = document.querySelectorAll('.rider-section');
    const removeButtons = document.querySelectorAll('.remove-rider-btn');
    
    removeButtons.forEach(button => {
        button.style.display = riderSections.length > 1 ? 'block' : 'none';
    });
}

// Renumber riders after removal
function renumberRiders() {
    const riderSections = document.querySelectorAll('.rider-section');
    riderSections.forEach((section, index) => {
        const riderNumber = index + 1;
        const header = section.querySelector('.rider-header h4');
        header.textContent = `Rider ${riderNumber}`;
    });
    // Update rider count and pricing
    riderCount = riderSections.length;
    updatePricing();
    updateAddRiderButton(); // Update add rider button state when removing riders
}

// Initialize pricing and validate against server data
async function initializePricing() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventName = urlParams.get('event');
    const eventDate = urlParams.get('date');
    
    // Get URL parameters for fallback
    const urlRate = urlParams.get('rate');
    const urlMaxSpots = urlParams.get('maxSpots');
    const urlRemainingSpots = urlParams.get('remainingSpots');
    
    // Handle multi-event registration with real-time validation
    const multiEventsParam = urlParams.get('multiEvents');
    if (multiEventsParam) {
        try {
            const events = JSON.parse(decodeURIComponent(multiEventsParam));

            // Validate each event against server data and find minimum availability
            let minRemainingSpots = Infinity;
            let validatedEvents = [];
            let totalRate = 0;

            console.log(`Validating multi-event registration for ${events.length} event(s)`);
            
            for (const event of events) {
                try {
                    // Fetch real-time data for each event
                    const response = await fetch(`/api/calendar?mode=single&eventName=${encodeURIComponent(event.title)}&eventDate=${encodeURIComponent(event.date)}`);
                    
                    if (response.ok) {
                        const serverData = await response.json();
                        
                        if (serverData.success && serverData.event) {
                            const validatedEvent = {
                                ...event,
                                // SECURITY: Use server data to override URL manipulation
                                title: serverData.event.name,  // Override with server name
                                serverRate: serverData.event.rate,
                                serverMaxSpots: serverData.event.maxSpots,
                                serverRemainingSpots: serverData.event.remainingSpots,
                                validated: true
                            };
                            
                            validatedEvents.push(validatedEvent);
                            totalRate += serverData.event.rate;

                            // Track the minimum remaining spots across all events
                            minRemainingSpots = Math.min(minRemainingSpots, serverData.event.remainingSpots);
                            
                            console.log('Event validated against server data. Spots remaining:', serverData.event.remainingSpots);
                            console.log(`🔍 MIN SPOTS TRACKING: minRemainingSpots = ${minRemainingSpots}`);
                        } else {
                            console.warn('Could not validate user-selected event (details redacted)');
                            // Fallback to URL data for this event
                            validatedEvents.push(event);
                            totalRate += event.effectiveRate || 190;
                            minRemainingSpots = Math.min(minRemainingSpots, event.remainingSpots || 0);
                        }
                    } else {
                        console.warn('Server validation failed for user-selected event (details redacted)');
                        // Fallback to URL data
                        validatedEvents.push(event);
                        totalRate += event.effectiveRate || 190;
                        minRemainingSpots = Math.min(minRemainingSpots, event.remainingSpots || 0);
                    }
                } catch (error) {
                    console.error(`Error validating event ${event.title}:`, error);
                    // Fallback to URL data
                    validatedEvents.push(event);
                    totalRate += event.effectiveRate || 190;
                    minRemainingSpots = Math.min(minRemainingSpots, event.remainingSpots || 0);
                }
            }
            
            // Use server-validated data
            ratePerRider = totalRate;
            remainingSpots = minRemainingSpots === Infinity ? 0 : minRemainingSpots;
            maxSpots = Math.max(...validatedEvents.map(e => e.serverMaxSpots || e.maxSpots || 10));

            if (validatedEvents.length > 0) {
                persistEventDetails({
                    type: 'multi',
                    events: validatedEvents,
                    pricingInfo: window.multiEventData?.pricingInfo || pricingInfo
                });
            }
            
            // Update validation text
            const validationText = document.getElementById('pricingValidationText');
            if (validationText) {
                if (validatedEvents.some(e => e.serverRate !== undefined)) {
                    validationText.textContent = `✓ Multi-event pricing validated (min ${remainingSpots} spots available)`;
                    validationText.style.color = '#28a745';
                } else {
                    validationText.textContent = '⚠️ Using cached multi-event pricing (server validation failed)';
                    validationText.style.color = '#ffc107';
                }
            }
            
            console.log('Multi-event validation complete:', {
                totalRate: ratePerRider,
                minRemainingSpots: remainingSpots,
                validatedEvents: validatedEvents.length
            });
            
            // DEBUG: Log remaining spots calculation
            console.log(`🔍 RIDER LIMIT DEBUG: remainingSpots = ${remainingSpots}, riderCount = ${riderCount}`);
            console.log(`🔍 Current rider limit: ${remainingSpots} total riders allowed`);
            console.log(`🔍 Can add ${Math.max(0, remainingSpots - riderCount)} more riders`);
            
            updatePricing();
            updateAddRiderButton();
            return;
            
        } catch (error) {
            console.error('Error validating multi-event data:', error);
            
            // Fallback to URL parameters
            const validationText = document.getElementById('pricingValidationText');
            if (validationText) {
                validationText.textContent = '⚠️ Using cached multi-event pricing (validation error)';
                validationText.style.color = '#ffc107';
            }
            
            // Use URL parameters as fallback
            if (urlRate && !isNaN(urlRate)) {
                ratePerRider = parseInt(urlRate);
            }
            
            if (urlRemainingSpots && urlRemainingSpots !== '' && !isNaN(urlRemainingSpots)) {
                remainingSpots = parseInt(urlRemainingSpots);
            }
            
            updatePricing();
            updateAddRiderButton();
            return;
        }
    }
    
    // For single events, validate against server data
    if (eventName && eventDate) {
        try {
            // Fetch real-time event data from server
            const response = await fetch(`/api/calendar?mode=single&eventName=${encodeURIComponent(eventName)}&eventDate=${encodeURIComponent(eventDate)}`);
            
            if (response.ok) {
                const serverData = await response.json();
                
                if (serverData.success && serverData.event) {
                    // Use server-validated data instead of URL parameters
                    ratePerRider = serverData.event.rate || 190; // Default rate
                    maxSpots = serverData.event.maxSpots || 10;
                    remainingSpots = serverData.event.remainingSpots || 0;
                    
                    // SECURITY: Update display with server-validated event name
                    const eventDisplayElement = document.getElementById('eventDisplay');
                    if (eventDisplayElement) {
                        eventDisplayElement.textContent = serverData.event.name;
                    }

                    console.log('Event security validation succeeded (URL parameters overridden with server data)');

                    updateStoredEventDetails(details => {
                        if (!details || !Array.isArray(details.events) || details.events.length === 0) {
                            return details;
                        }

                        details.events[0].title = serverData.event.name || details.events[0].title;
                        details.events[0].date = serverData.event.date || details.events[0].date;
                        if (serverData.event.description) {
                            details.events[0].description = serverData.event.description;
                        }

                        return details;
                    });

                    console.log('Event data validated from server:', {
                        rate: ratePerRider,
                        maxSpots: maxSpots,
                        remainingSpots: remainingSpots
                    });
                    
                    // Update validation text
                    const validationText = document.getElementById('pricingValidationText');
                    if (validationText) {
                        validationText.textContent = '✓ Pricing and availability validated from server';
                        validationText.style.color = '#28a745';
                    }
                    
                    // Update display with validated data
                    updatePricing();
                    updateAddRiderButton();
                    
                    // Show warning if URL data doesn't match server data
                    if (urlRate && parseInt(urlRate) !== ratePerRider) {
                        console.warn('URL rate parameter doesn\'t match server data. Using server rate:', ratePerRider);
                    }
                    
                    if (urlRemainingSpots && parseInt(urlRemainingSpots) !== remainingSpots) {
                        console.warn('URL remaining spots doesn\'t match server data. Using server data:', remainingSpots);
                    }
                    
                    return;
                }
            }
        } catch (error) {
            console.error('Failed to validate event data from server:', error);
        }
    }
    
    // Fallback to URL parameters if server validation fails
    console.warn('Using URL parameters as fallback (server validation failed)');
    
    // Update validation text to show fallback mode
    const validationText = document.getElementById('pricingValidationText');
    if (validationText) {
        validationText.textContent = '⚠️ Using cached pricing (server validation unavailable)';
        validationText.style.color = '#ffc107';
    }
    
    if (urlRate && !isNaN(urlRate)) {
        ratePerRider = parseInt(urlRate);
    }
    
    if (urlMaxSpots && urlMaxSpots !== '' && !isNaN(urlMaxSpots)) {
        maxSpots = parseInt(urlMaxSpots);
    }
    
    if (urlRemainingSpots && urlRemainingSpots !== '' && !isNaN(urlRemainingSpots)) {
        remainingSpots = parseInt(urlRemainingSpots);
    }
    
    updatePricing();
    updateAddRiderButton();
}

// Update pricing display
function updatePricing() {
    const rateDisplay = document.getElementById('ratePerRider');
    const ridersDisplay = document.getElementById('numberOfRiders');
    const totalDisplay = document.getElementById('totalPrice');
    const spotsDisplay = document.getElementById('spotsRemaining');
    const availabilityNote = document.getElementById('availabilityNote');
    
    if (rateDisplay && ridersDisplay && totalDisplay) {
        const total = ratePerRider * riderCount;
        
        rateDisplay.textContent = `$${ratePerRider.toFixed(2)} AUD`;
        ridersDisplay.textContent = riderCount;
        totalDisplay.textContent = `$${total.toFixed(2)} AUD`;
        
        // Update spots remaining display
        if (spotsDisplay) {
            if (remainingSpots !== null) {
                spotsDisplay.textContent = remainingSpots;
                spotsDisplay.style.color = remainingSpots > 0 ? '#ff6b35' : '#dc3545';
            } else {
                spotsDisplay.textContent = 'Unknown';
                spotsDisplay.style.color = '#ccc';
            }
        }
        
        // Show availability note for multi-events
        if (availabilityNote) {
            const urlParams = new URLSearchParams(window.location.search);
            const multiEventsParam = urlParams.get('multiEvents');
            
            if (multiEventsParam && remainingSpots !== null) {
                try {
                    const events = JSON.parse(decodeURIComponent(multiEventsParam));
                    if (events.length > 1) {
                        availabilityNote.style.display = 'block';
                    }
                } catch (error) {
                    // Hide note if can't parse events
                    availabilityNote.style.display = 'none';
                }
            } else {
                availabilityNote.style.display = 'none';
            }
        }
        
    }
}

// Update add rider button based on available spots
function updateAddRiderButton() {
    const addRiderBtn = document.getElementById('addRiderBtn');
    
    // DEBUG: Log button update values
    console.log(`🔍 ADD RIDER BUTTON DEBUG: remainingSpots = ${remainingSpots}, riderCount = ${riderCount}`);
    
    if (addRiderBtn && remainingSpots !== null) {
        if (riderCount >= remainingSpots) {
            addRiderBtn.disabled = true;
            
            // Check if this is multi-event to show helpful message
            const urlParams = new URLSearchParams(window.location.search);
            const multiEventsParam = urlParams.get('multiEvents');
            
            if (multiEventsParam) {
                addRiderBtn.textContent = `Limited by event with ${remainingSpots} spot${remainingSpots !== 1 ? 's' : ''}`;
            } else {
                addRiderBtn.textContent = `Maximum ${remainingSpots} rider${remainingSpots !== 1 ? 's' : ''} allowed`;
            }
            
            addRiderBtn.style.opacity = '0.5';
            addRiderBtn.style.cursor = 'not-allowed';
            
            console.log(`🔍 Button DISABLED: ${riderCount} >= ${remainingSpots}`);
        } else {
            addRiderBtn.disabled = false;
            addRiderBtn.textContent = '+ Add Another Rider';
            addRiderBtn.style.opacity = '1';
            addRiderBtn.style.cursor = 'pointer';
            
            console.log(`🔍 Button ENABLED: Can add ${remainingSpots - riderCount} more riders`);
        }
    }
}

// Function to get URL parameters
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Populate event details from URL parameters
function populateEventDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const multiEventsParam = urlParams.get('multiEvents');
    const pricingParam = urlParams.get('pricing');

    if (multiEventsParam && pricingParam) {
        // Handle multi-event registration
        try {
            const events = JSON.parse(decodeURIComponent(multiEventsParam));
            const pricingInfo = JSON.parse(decodeURIComponent(pricingParam));

            populateMultiEventDetails(events, pricingInfo);
            return;
        } catch (error) {
            console.error('Error parsing multi-event data:', error);
            // Fallback to single event
            populateSingleEventDetails();
            return;
        }
    }

    const hasSingleParams = ['event', 'date', 'time', 'location', 'description'].some(param => urlParams.get(param));

    if (hasSingleParams) {
        // Handle single event registration
        populateSingleEventDetails();
        return;
    }

    // Fallback to stored event details (e.g., returning from payment redirect)
    const storedDetails = getStoredEventDetails();
    if (storedDetails && Array.isArray(storedDetails.events) && storedDetails.events.length > 0) {
        if (storedDetails.type === 'multi' && storedDetails.pricingInfo) {
            populateMultiEventDetails(storedDetails.events, storedDetails.pricingInfo);
        } else {
            populateSingleEventDetails(storedDetails.events[0]);
        }
    }
}

function populateMultiEventDetails(events, pricingInfo) {
    // Display multiple events
    const eventDisplay = document.getElementById('eventDisplay');
    const timeDisplay = document.getElementById('timeDisplay');
    const locationDisplay = document.getElementById('locationDisplay');
    const descriptionDisplay = document.getElementById('descriptionDisplay');
    
    if (eventDisplay) {
        const eventText = events.length === 1 ? 'event' : 'events';
        eventDisplay.innerHTML = `Registration info for ${events.length} ${eventText}`;
    }
    
    // Create detailed event list
    let eventDetailsHTML = '';
    events.forEach((event, index) => {
        eventDetailsHTML += `
            <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; margin: 0.5rem 0; border-radius: 6px;">
                <div style="font-weight: 600; color: #ff6b35; margin-bottom: 0.5rem;">${event.title}</div>
                <div style="margin-bottom: 0.25rem;">📅 ${event.date}</div>
                <div style="margin-bottom: 0.25rem;">🕒 ${event.time}</div>
                ${event.location ? `<div style="margin-bottom: 0.25rem;">📍 ${event.location}</div>` : ''}
                ${event.description ? `<div style="margin-bottom: 0.25rem; font-size: 0.9rem; opacity: 0.8;">${event.description.toLowerCase()}</div>` : ''}
                <div style="color: #ff6b35; font-weight: 600;">Rate: $${event.effectiveRate} AUD per rider</div>
            </div>
        `;
    });
    
    if (timeDisplay) {
        timeDisplay.innerHTML = eventDetailsHTML;
    }
    
    if (locationDisplay) {
        locationDisplay.style.display = 'none'; // Hide since we're showing location per event
    }
    
    if (descriptionDisplay) {
        descriptionDisplay.style.display = 'none'; // Hide since we're showing description per event
    }
    
    // Update pricing section for multi-events
    updateMultiEventPricing(pricingInfo);
    
    // Set hidden field for form submission
    const hiddenEventName = document.getElementById('eventName');
    if (hiddenEventName) {
        hiddenEventName.value = `Multi-Event Registration: ${events.map(e => e.title).join(', ')}`;
    }
    
    // Store multi-event data for form submission and calendar tools
    window.multiEventData = { events, pricingInfo };
    persistEventDetails({
        type: 'multi',
        events,
        pricingInfo
    });
}

function populateSingleEventDetails(preloadedEvent) {
    const eventName = preloadedEvent ? preloadedEvent.title : getUrlParameter('event');
    const eventDate = preloadedEvent ? preloadedEvent.date : getUrlParameter('date');
    const eventTime = preloadedEvent ? preloadedEvent.time : getUrlParameter('time');
    const eventLocation = preloadedEvent ? preloadedEvent.location : getUrlParameter('location');
    const eventDescriptionRaw = preloadedEvent ? preloadedEvent.description : getUrlParameter('description');

    if (eventName) {
        document.getElementById('eventDisplay').textContent = eventName;
        // Make sure to populate the hidden field for form validation
        const hiddenEventName = document.getElementById('eventName');
        if (hiddenEventName) {
            hiddenEventName.value = eventName;
        }
    }
    
    const timeDisplay = document.getElementById('timeDisplay');
    if (timeDisplay) {
        const timeParts = [];
        if (eventDate) {
            timeParts.push(`📅 ${eventDate}`);
        }
        if (eventTime) {
            timeParts.push(`🕒 ${eventTime}`);
        }
        timeDisplay.textContent = timeParts.join('   ');
    }

    if (eventLocation) {
        document.getElementById('locationDisplay').textContent = `📍 ${eventLocation}`;
    }

    if (eventDescriptionRaw) {
        document.getElementById('descriptionDisplay').textContent = eventDescriptionRaw.toLowerCase();
    }

    const eventDetailsForStorage = {
        title: eventName || '',
        date: eventDate || '',
        time: eventTime || '',
        location: eventLocation || '',
        description: eventDescriptionRaw || ''
    };

    if (preloadedEvent) {
        persistEventDetails({ type: 'single', events: [eventDetailsForStorage] });
    } else if (eventName || eventDate || eventTime || eventLocation || eventDescriptionRaw) {
        persistEventDetails({ type: 'single', events: [eventDetailsForStorage] });
    }

    // Clear any multi-event data
    window.multiEventData = null;
}

function updateMultiEventPricing(pricingInfo) {
    const rateDisplay = document.getElementById('ratePerRider');
    const ridersDisplay = document.getElementById('numberOfRiders');
    const totalDisplay = document.getElementById('totalPrice');
    
    if (rateDisplay && ridersDisplay && totalDisplay) {
        // Create a detailed pricing breakdown
        let pricingHTML = '';
        
        if (pricingInfo.hasBundleDiscount) {
            pricingHTML = `
                <div style="font-size: 0.9rem; color: #ccc; margin-bottom: 0.5rem;">
                    ${pricingInfo.defaultEventsCount} event${pricingInfo.defaultEventsCount !== 1 ? 's' : ''} @ $${pricingInfo.bundlePrice} each
                    ${pricingInfo.customEventsCount > 0 ? `<br>${pricingInfo.customEventsCount} custom event${pricingInfo.customEventsCount !== 1 ? 's' : ''} (individual pricing)` : ''}
                </div>
                <div style="color: #ff6b35; font-weight: 600;">$${pricingInfo.totalCost.toFixed(2)} AUD</div>
            `;
        } else {
            pricingHTML = `$${pricingInfo.totalCost.toFixed(2)} AUD`;
        }
        
        rateDisplay.innerHTML = pricingHTML;
        ridersDisplay.textContent = 1; // Start with 1 rider
        totalDisplay.textContent = `$${pricingInfo.totalCost.toFixed(2)} AUD`;
        
        // Update global rate for calculations
        ratePerRider = pricingInfo.totalCost;
    }
}

// Function to format date input as DD/MM/YYYY while typing
function formatDateInput(input) {
    let value = input.value.replace(/\D/g, ''); // Remove non-digits
    
    if (value.length >= 3 && value.length <= 4) {
        value = value.substring(0, 2) + '/' + value.substring(2);
    } else if (value.length >= 5) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4) + '/' + value.substring(4, 8);
    }
    
    input.value = value;
}

// Function to validate Australian date format
function validateAustralianDate(input) {
    const value = input.value.trim();
    if (!value) return;
    
    const pattern = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
    
    if (!pattern.test(value)) {
        input.setCustomValidity('Please enter date in DD/MM/YYYY format');
        input.reportValidity();
        return false;
    }
    
    // Parse the date to check if it's valid
    const [day, month, year] = value.split('/');
    const date = new Date(year, month - 1, day);
    
    if (date.getDate() != day || date.getMonth() != (month - 1) || date.getFullYear() != year) {
        input.setCustomValidity('Please enter a valid date');
        input.reportValidity();
        return false;
    }
    
    // Check if date is not in the future
    const today = new Date();
    if (date > today) {
        input.setCustomValidity('Date of birth cannot be in the future');
        input.reportValidity();
        return false;
    }
    
    // Clear any previous validation messages
    input.setCustomValidity('');
    return true;
}

// Function to parse Australian date format (DD/MM/YYYY) to Date object
function parseAustralianDate(dateString) {
    if (!dateString) return null;
    
    const [day, month, year] = dateString.split('/');
    return new Date(year, month - 1, day);
}

// Toggle age-based contact fields for individual riders
function toggleAgeBasedFields(riderId) {
    const dobInput = document.getElementById(`dateOfBirth${riderId}`);
    if (!dobInput || !dobInput.value) return;
    
    // Validate the date format first
    if (!validateAustralianDate(dobInput)) return;
    
    // Parse the Australian date format
    const dob = parseAustralianDate(dobInput.value);
    if (!dob) return;
    
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }

    // Get rider contact section elements for this specific rider
    const riderContactSection = document.getElementById(`riderContactSection${riderId}`);
    const riderContactFields = document.getElementById(`riderContactFields${riderId}`);
    const riderEmail = document.getElementById(`riderEmail${riderId}`);
    const riderPhone = document.getElementById(`riderPhone${riderId}`);

    if (age >= 18) {
        // Show rider contact fields for 18+ riders
        riderContactSection.style.display = 'block';
        riderContactFields.style.display = 'flex';
        riderEmail.required = true;
        riderPhone.required = true;
    } else {
        // Hide rider contact fields for under 18 riders
        riderContactSection.style.display = 'none';
        riderContactFields.style.display = 'none';
        riderEmail.required = false;
        riderPhone.required = false;
        // Clear the values when hiding
        riderEmail.value = '';
        riderPhone.value = '';
    }
}

// Function to handle form submission
async function handleFormSubmission(event) {
    event.preventDefault();

    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.textContent : '';

    clearInlineMessage();

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const selectedEvents = getEventsForSubmission();
    if (selectedEvents.length === 0) {
        showInlineMessage('error', 'Please select at least one event before submitting your registration.');
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Validating selection…';
    }

    const urlParams = new URLSearchParams(window.location.search);
    const multiEventsParam = urlParams.get('multiEvents');

    if (multiEventsParam) {
        try {
            const urlEvents = JSON.parse(decodeURIComponent(multiEventsParam));

            for (const urlEvent of urlEvents) {
                const response = await fetch(`/api/calendar?mode=single&eventName=${encodeURIComponent(urlEvent.title)}&eventDate=${encodeURIComponent(urlEvent.dateString)}`);
                if (!response.ok) {
                    throw new Error('Unable to verify event details.');
                }

                const serverData = await response.json();
                if (!serverData.success || !serverData.event || serverData.event.name !== urlEvent.title) {
                    throw new Error('Selected events could not be verified. Please return to the calendar and try again.');
                }
            }
        } catch (error) {
            console.error('Security validation error:', error);
            showInlineMessage('error', error.message || 'Unable to verify event data. Please try again.');
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
            return;
        }
    }

    try {
        if (multiEventsParam) {
            try {
                const events = JSON.parse(decodeURIComponent(multiEventsParam));
                let minAvailableSpots = Infinity;

                for (const event of events) {
                    const response = await fetch(`/api/calendar?mode=single&eventName=${encodeURIComponent(event.title)}&eventDate=${encodeURIComponent(event.date)}`);
                    if (response.ok) {
                        const serverData = await response.json();
                        if (serverData.success && serverData.event) {
                            minAvailableSpots = Math.min(minAvailableSpots, serverData.event.remainingSpots);
                        }
                    }
                }

                if (minAvailableSpots < riderCount) {
                    throw new Error(`Availability has changed. Only ${minAvailableSpots} spot${minAvailableSpots !== 1 ? 's' : ''} remaining across your selected events.`);
                }
            } catch (error) {
                console.warn('Multi-event availability revalidation failed', error);
            }
        }

        if (submitButton) {
            submitButton.textContent = 'Checking availability…';
        }

        const availabilityResponse = await fetch('/api/track_reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                checkAvailability: true,
                events: selectedEvents,
                riderCount
            })
        });

        const availabilityResult = await availabilityResponse.json();
        if (!availabilityResponse.ok || !availabilityResult.success) {
            if (availabilityResult.invalidEvents && availabilityResult.invalidEvents.length > 0) {
                const details = availabilityResult.invalidEvents.map(event => `• ${event.eventName} (${event.date}): ${event.reason}`).join('\n');
                throw new Error(`Event validation failed:\n${details}`);
            }
            throw new Error(availabilityResult.message || 'Registration failed due to availability constraints.');
        }
    } catch (error) {
        console.error('Availability check failed', error);
        showInlineMessage('error', error.message || 'Unable to confirm availability. Please try again.');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
        return;
    }

    const perRiderAmount = window.multiEventData ? window.multiEventData.pricingInfo.totalCost : ratePerRider;
    const totalAmount = perRiderAmount * riderCount;

    try {
        const formPayload = buildRegistrationPayload(form, totalAmount);
        const registrationSummary = createEventRegistrationSummary(formPayload, totalAmount);

        const existingCheckout = readCheckoutSession() || {};
        const updatedCheckout = {
            ...existingCheckout,
            eventRegistration: registrationSummary
        };

        writeCheckoutSession(updatedCheckout);

        showInlineMessage('success', 'Rider details saved! Redirecting to checkout…');

        setTimeout(() => {
            window.location.href = '/checkout.html';
        }, 400);
    } catch (error) {
        console.error('Failed to prepare registration payload', error);
        showInlineMessage('error', error.message || 'Unable to prepare rider details. Please try again.');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
        return;
    }
}

function buildRegistrationPayload(form, totalAmount) {
    const formData = new FormData(form);
    const data = {};

    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }

    data.totalAmount = totalAmount;
    data.riderCount = riderCount;

    if (window.multiEventData) {
        data.multiEventRegistration = true;
        data.events = window.multiEventData.events || [];
        data.pricingInfo = window.multiEventData.pricingInfo || null;
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        data.eventName = urlParams.get('event') || data.eventName || '';
        data.eventDate = urlParams.get('date') || '';
        data.eventLocation = urlParams.get('location') || '';
        data.eventTime = urlParams.get('time') || '';
        data.ratePerRider = ratePerRider;
        data.events = [{
            title: data.eventName,
            dateString: data.eventDate,
            time: data.eventTime,
            location: data.eventLocation,
            maxSpots: maxSpots || 10,
            remainingSpots: remainingSpots
        }];
    }

    return data;
}

function createEventRegistrationSummary(formPayload, totalAmount) {
    const events = window.multiEventData ? window.multiEventData.events : formPayload.events || [];
    const riders = [];
    let index = 1;

    while (formPayload[`riderFirstName${index}`]) {
        riders.push({
            firstName: formPayload[`riderFirstName${index}`],
            lastName: formPayload[`riderLastName${index}`],
            bikeNumber: formPayload[`bikeNumber${index}`] || '',
            bikeSize: formPayload[`bikeSize${index}`] || '',
            dateOfBirth: formPayload[`dateOfBirth${index}`] || ''
        });
        index++;
    }

    const perRider = riderCount > 0 ? totalAmount / riderCount : 0;

    return {
        totalAmount,
        currency: 'AUD',
        riderCount,
        perRiderAmount: perRider,
        events,
        riders,
        contact: {
            firstName: formPayload.contactFirstName || '',
            lastName: formPayload.contactLastName || '',
            email: formPayload.contactEmail || '',
            phone: formPayload.contactPhone || ''
        },
        comments: formPayload.comments || '',
        multiEvent: Boolean(window.multiEventData),
        pricingInfo: window.multiEventData ? window.multiEventData.pricingInfo : { ratePerRider },
        formPayload
    };
}
        
// Complete registration after successful payment

function parseEventDateTime(dateStr, timeStr) {
    if (!dateStr) {
        return null;
    }

    const dateParts = dateStr.split(/[\/\-]/).map(part => parseInt(part, 10));
    if (dateParts.length < 3 || dateParts.some(part => Number.isNaN(part))) {
        return null;
    }

    const [day, month, year] = dateParts;
    const startDate = new Date(year, month - 1, day);
    if (Number.isNaN(startDate.getTime()) || startDate.getDate() !== day || (startDate.getMonth() + 1) !== month) {
        return null;
    }

    const normalizedTime = (timeStr || '').trim();

    if (!normalizedTime || /all\s*day/i.test(normalizedTime)) {
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        return {
            allDay: true,
            start: {
                year: startDate.getFullYear(),
                month: startDate.getMonth() + 1,
                day: startDate.getDate()
            },
            end: {
                year: endDate.getFullYear(),
                month: endDate.getMonth() + 1,
                day: endDate.getDate()
            }
        };
    }

    const rangeParts = normalizedTime
        .replace(/[–—]/g, '-')
        .split(/\s?(?:-|to)\s?/i)
        .filter(Boolean);

    const startTime = parseTimeComponent(rangeParts[0]);
    if (!startTime) {
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        return {
            allDay: true,
            start: {
                year: startDate.getFullYear(),
                month: startDate.getMonth() + 1,
                day: startDate.getDate()
            },
            end: {
                year: endDate.getFullYear(),
                month: endDate.getMonth() + 1,
                day: endDate.getDate()
            }
        };
    }

    const endTime = rangeParts.length > 1 ? parseTimeComponent(rangeParts[1]) : null;

    const startDateTime = new Date(year, month - 1, day, startTime.hour, startTime.minute);
    if (Number.isNaN(startDateTime.getTime())) {
        return null;
    }

    let endDateTime;
    if (endTime) {
        endDateTime = new Date(year, month - 1, day, endTime.hour, endTime.minute);
        if (endDateTime <= startDateTime) {
            endDateTime.setDate(endDateTime.getDate() + 1);
        }
    } else {
        endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    }

    return {
        allDay: false,
        start: {
            year: startDateTime.getFullYear(),
            month: startDateTime.getMonth() + 1,
            day: startDateTime.getDate(),
            hour: startDateTime.getHours(),
            minute: startDateTime.getMinutes()
        },
        end: {
            year: endDateTime.getFullYear(),
            month: endDateTime.getMonth() + 1,
            day: endDateTime.getDate(),
            hour: endDateTime.getHours(),
            minute: endDateTime.getMinutes()
        }
    };
}

function parseTimeComponent(component) {
    if (!component) {
        return null;
    }

    const cleaned = component
        .toUpperCase()
        .replace(/\./g, '')
        .replace(/HRS?/g, '')
        .replace(/HOURS?/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);
    if (!match) {
        return null;
    }

    let hour = parseInt(match[1], 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    const meridian = match[3] || null;

    if (meridian === 'PM' && hour < 12) {
        hour += 12;
    }
    if (meridian === 'AM' && hour === 12) {
        hour = 0;
    }

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return null;
    }

    return { hour, minute };
}

function formatDateParts(parts) {
    const year = String(parts.year).padStart(4, '0');
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return `${year}${month}${day}`;
}

function formatDateTimeParts(parts) {
    const date = formatDateParts(parts);
    const hour = String(parts.hour ?? 0).padStart(2, '0');
    const minute = String(parts.minute ?? 0).padStart(2, '0');
    return `${date}T${hour}${minute}00`;
}

function buildGoogleCalendarLink(event, parsed) {
    if (!parsed) {
        return '#';
    }

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: event.title || 'Moto Coach Event',
        details: event.description || '',
        location: event.location || '',
        ctz: 'Australia/Sydney'
    });

    if (parsed.allDay) {
        params.set('dates', `${formatDateParts(parsed.start)}/${formatDateParts(parsed.end)}`);
    } else {
        params.set('dates', `${formatDateTimeParts(parsed.start)}/${formatDateTimeParts(parsed.end)}`);
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

function generateICSContent(event, parsed) {
    if (!parsed) {
        return null;
    }

    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Moto Coach//Track Reservation//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${Date.now()}-${Math.floor(Math.random() * 10000)}@motocoach.com.au`,
        `DTSTAMP:${dtStamp}`,
        `SUMMARY:${escapeIcsText(event.title || 'Moto Coach Event')}`
    ];

    if (parsed.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${formatDateParts(parsed.start)}`);
        lines.push(`DTEND;VALUE=DATE:${formatDateParts(parsed.end)}`);
    } else {
        lines.push(`DTSTART;TZID=Australia/Sydney:${formatDateTimeParts(parsed.start)}`);
        lines.push(`DTEND;TZID=Australia/Sydney:${formatDateTimeParts(parsed.end)}`);
    }

    if (event.location) {
        lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }

    if (event.description) {
        lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }

    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
}

function downloadICSFile(filename, content) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function hideErrorModal() {
    const modal = document.getElementById('errorModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

if (typeof window !== 'undefined') {
    window.removeRider = removeRider;
    window.toggleAgeBasedFields = toggleAgeBasedFields;
    window.validateAustralianDate = validateAustralianDate;
    window.formatDateInput = formatDateInput;
    window.hideErrorModal = hideErrorModal;
}

