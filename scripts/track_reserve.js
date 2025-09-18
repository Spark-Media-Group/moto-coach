let riderCount = 1;
let recaptchaSiteKey = null;
let recaptchaToken = null;
let ratePerRider = 190; // Default rate in AUD
let maxSpots = null; // Maximum spots available for the event
let remainingSpots = null; // Remaining spots available

// Check if returning from payment redirect (for Afterpay, etc.)
function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const paymentIntent = urlParams.get('payment_intent');
    const paymentIntentClientSecret = urlParams.get('payment_intent_client_secret');
    
    if (paymentStatus === 'success' && paymentIntent) {
        // Handle successful payment return
        const intentIdString = typeof paymentIntent === 'string' ? paymentIntent : String(paymentIntent);
        const maskedIntentId = intentIdString.length > 8
            ? `${intentIdString.slice(0, 4)}...${intentIdString.slice(-4)}`
            : '[redacted]';
        console.log('Payment completed successfully (masked ID):', maskedIntentId);
        
        // Show success modal
        showSuccessModal();
        
        // Clean up URL parameters
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        
    } else if (paymentIntentClientSecret) {
        // Handle other payment states if needed
        stripe.retrievePaymentIntent(paymentIntentClientSecret).then(({ paymentIntent }) => {
            if (paymentIntent.status === 'succeeded') {
                showSuccessModal();
            } else if (paymentIntent.status === 'processing') {
                // Show processing message
                showErrorModal('Payment is being processed. You will receive confirmation shortly.');
            } else {
                // Show error for failed payments
                showErrorModal('Payment was not completed successfully. Please try again.');
            }
        });
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
document.addEventListener('DOMContentLoaded', function() {
    // Check if returning from payment redirect
    checkPaymentStatus();
    
    // Load configuration and initialize reCAPTCHA v3
    initializeRecaptcha();
    
    // Initialize pricing from URL parameters
    initializePricing();
    
    // Initialize payment elements
    initializePaymentElements();
    
    // Set up add rider button event listener
    document.getElementById('addRiderBtn').addEventListener('click', function() {
        // Check if we've reached the maximum number of riders based on server-validated spots
        if (remainingSpots !== null && riderCount >= remainingSpots) {
            const urlParams = new URLSearchParams(window.location.search);
            const multiEventsParam = urlParams.get('multiEvents');
            
            if (multiEventsParam) {
                showErrorModal(`Cannot add more riders. One of your selected events only has ${remainingSpots} spot${remainingSpots !== 1 ? 's' : ''} remaining.`);
            } else {
                showErrorModal(`Maximum ${remainingSpots} rider${remainingSpots !== 1 ? 's' : ''} allowed for this event.`);
            }
            return;
        }
        
        riderCount++;
        const ridersContainer = document.getElementById('ridersContainer');
        
        const newRiderHTML = `
            <div class="rider-section" id="rider${riderCount}">
                <div class="rider-header">
                    <h4>Rider ${riderCount}</h4>
                    <button type="button" class="remove-rider-btn" onclick="removeRider('rider${riderCount}')">
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
                
                <!-- Rider Contact Information (18+ only) -->
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
        updatePricing(); // Update pricing when adding rider
        updateAddRiderButton(); // Update add rider button state
    });

    // Set up form submission
    const form = document.querySelector('.track-reservation-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmission);
    }

    // Populate event details from URL parameters when page loads
    populateEventDetails();
});

// Initialize reCAPTCHA v3
async function initializeRecaptcha() {
    try {
        // Get configuration from API
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();
        recaptchaSiteKey = config.recaptchaSiteKey;
        
        if (!recaptchaSiteKey) {
            console.warn('reCAPTCHA site key not configured');
            return;
        }
        
        console.log('reCAPTCHA v3 site key loaded securely');
        
        // Dynamically load reCAPTCHA v3 script with the site key
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`;
        script.async = true;
        script.defer = true;
        
        script.onload = function() {
            console.log('reCAPTCHA v3 script loaded successfully');
        };
        
        script.onerror = function() {
            console.error('Failed to load reCAPTCHA v3 script');
        };
        
        document.head.appendChild(script);
        
    } catch (error) {
        console.error('Failed to load reCAPTCHA configuration:', error);
    }
}

// Global variables for Stripe
let stripe = null;
let elements = null;
let paymentElement = null;
let applePayButton = null;
let currentPaymentMethod = 'card';

// Initialize payment elements on page load
async function initializePaymentElements() {
    try {
        // Get Stripe publishable key
        const configResponse = await fetch('/api/stripe-config');
        if (!configResponse.ok) {
            throw new Error('Failed to fetch Stripe configuration');
        }
        
        const config = await configResponse.json();
        const stripePublishableKey = config.publishableKey;
        
        if (!stripePublishableKey) {
            throw new Error('Stripe publishable key not found in configuration');
        }
        
        console.log('Initializing Stripe with key:', stripePublishableKey.substring(0, 12) + '...');
        
        // Initialize Stripe
        stripe = Stripe(stripePublishableKey);
        
        // Calculate current total amount for initial display
        const totalAmount = window.multiEventData 
            ? window.multiEventData.pricingInfo.totalCost * riderCount
            : ratePerRider * riderCount;
        
        // Create initial elements for user input (without clientSecret)
        elements = stripe.elements({
            mode: 'payment',
            currency: 'aud',
            amount: Math.round(totalAmount * 100),
            appearance: {
                theme: 'night',
                variables: {
                    colorPrimary: '#ff6600',
                    colorBackground: '#2a2a2a',
                    colorText: '#ffffff',
                    colorDanger: '#dc3545',
                    fontFamily: '"Roboto Condensed", sans-serif',
                    spacingUnit: '4px',
                    borderRadius: '8px'
                }
            }
        });
        
        // Create and mount payment element for card input
        paymentElement = elements.create('payment', {
            layout: 'tabs'  // This enables Stripe to show Card/Apple Pay/Link tabs automatically
        });
        paymentElement.mount('#payment-element');
        
        // Handle events from the Payment Element (including Apple Pay clicks)
        paymentElement.on('ready', () => {
            console.log('Payment element ready');
        });
        
        paymentElement.on('change', (event) => {
            if (event.error) {
                console.error('Payment element error:', event.error);
                const errorDiv = document.querySelector('#payment-errors');
                if (errorDiv) {
                    errorDiv.textContent = 'Payment method error: ' + event.error.message;
                    errorDiv.style.display = 'block';
                }
            }
        });
        
        // This handles Apple Pay, Link, and other express payment methods
        paymentElement.on('click', (event) => {
            console.log('Payment method clicked:', event);
            // Clear any previous errors when user tries again
            const errorDiv = document.querySelector('#payment-errors');
            if (errorDiv) {
                errorDiv.style.display = 'none';
            }
        });
        
        console.log('Payment element mounted successfully - Stripe will handle method detection');
        
    } catch (error) {
        console.error('Error initializing payment system:', error);
        
        // Hide payment section if initialization fails
        const paymentSection = document.querySelector('.payment-method-selector');
        if (paymentSection) {
            paymentSection.style.display = 'none';
        }
        
        // Show error message
        const errorDiv = document.querySelector('#payment-errors');
        if (errorDiv) {
            errorDiv.textContent = 'Payment system unavailable. Please contact us directly.';
            errorDiv.style.display = 'block';
        }
    }
}

// Initialize Stripe elements with client secret
// Update payment amount when pricing changes
function updatePaymentAmount(amount) {
    // Store the amount for reference
    window.currentPaymentAmount = amount;
    
    // Note: Amount updates will be handled when creating the payment intent
    // Stripe Elements created in 'payment' mode get their amount from the payment intent's client secret
    // We don't need to update elements directly - the amount is embedded in the client secret
}

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
        
        // Update payment amount
        updatePaymentAmount(total);
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
        } catch (error) {
            console.error('Error parsing multi-event data:', error);
            // Fallback to single event
            populateSingleEventDetails();
        }
    } else {
        // Handle single event registration
        populateSingleEventDetails();
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
    
    // Store multi-event data for form submission
    window.multiEventData = { events, pricingInfo };
}

function populateSingleEventDetails() {
    const eventName = getUrlParameter('event');
    const eventTime = getUrlParameter('time');
    const eventLocation = getUrlParameter('location');
    const eventDescription = getUrlParameter('description');
    
    if (eventName) {
        document.getElementById('eventDisplay').textContent = eventName;
        // Make sure to populate the hidden field for form validation
        const hiddenEventName = document.getElementById('eventName');
        if (hiddenEventName) {
            hiddenEventName.value = eventName;
        }
    }
    
    if (eventTime) {
        document.getElementById('timeDisplay').textContent = `🕒 ${eventTime}`;
    }
    
    if (eventLocation) {
        document.getElementById('locationDisplay').textContent = `📍 ${eventLocation}`;
    }
    
    if (eventDescription) {
        document.getElementById('descriptionDisplay').textContent = eventDescription.toLowerCase();
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
    const originalButtonText = submitButton.textContent;
    
    // Validate the form manually before submission
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Check if events are selected
    const selectedEvents = getEventsForSubmission();
    
    if (selectedEvents.length === 0) {
        showErrorModal('Please select at least one event before submitting your registration.');
        return;
    }

    // SECURITY: Check if all events have been server-validated (URL manipulation protection)
    const urlParams = new URLSearchParams(window.location.search);
    const multiEventsParam = urlParams.get('multiEvents');
    
    if (multiEventsParam) {
        try {
            const urlEvents = JSON.parse(decodeURIComponent(multiEventsParam));
            
            // Verify each event still exists in calendar (prevent URL manipulation)
            for (const urlEvent of urlEvents) {
                const response = await fetch(`/api/calendar?mode=single&eventName=${encodeURIComponent(urlEvent.title)}&eventDate=${encodeURIComponent(urlEvent.dateString)}`);
                
                if (!response.ok) {
                    showErrorModal('⚠️ Security validation failed: Unable to verify event data. Please return to the calendar and select events again.');
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                    return;
                }
                
                const serverData = await response.json();
                if (!serverData.success || !serverData.event) {
                    showErrorModal('⚠️ Security validation failed: Selected events could not be verified. This may indicate URL manipulation. Please return to the calendar.');
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                    return;
                }
                
                // Check if event name was tampered with
                if (serverData.event.name !== urlEvent.title) {
                    console.warn('🔒 SECURITY ALERT: Event name tampering detected (details redacted)');
                    showErrorModal('⚠️ Security validation failed: Event data has been tampered with. Please return to the calendar and select events properly.');
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                    return;
                }
            }
            
            console.log('✓ Security validation passed: All events verified against server');
        } catch (error) {
            console.error('Security validation error:', error);
            showErrorModal('⚠️ Security validation failed: Unable to verify event data. Please try again.');
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
            return;
        }
    }

    // Check availability for all selected events and riders before proceeding
    submitButton.disabled = true;
    submitButton.textContent = 'Checking availability...';
    
    try {
        // For multi-event, validate against the minimum spots across all events
        const urlParams = new URLSearchParams(window.location.search);
        const multiEventsParam = urlParams.get('multiEvents');
        
        if (multiEventsParam) {
            // Re-validate all events to ensure availability hasn't changed
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
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                    showErrorModal(`Availability has changed. Only ${minAvailableSpots} spot${minAvailableSpots !== 1 ? 's' : ''} remaining across your selected events. Please reduce the number of riders or refresh the page.`);
                    return;
                }
            } catch (error) {
                console.error('Error re-validating multi-event availability:', error);
                // Continue with normal validation as fallback
            }
        }
        
        // Standard availability check via API
        const response = await fetch('/api/track_reserve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                checkAvailability: true,
                events: selectedEvents,
                riderCount: riderCount
            })
        });

        const result = await response.json();
        
        if (!response.ok || !result.success) {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
            
            // Handle specific validation errors
            if (result.invalidEvents && result.invalidEvents.length > 0) {
                let errorMessage = 'Event validation failed:\n\n';
                result.invalidEvents.forEach(event => {
                    errorMessage += `• ${event.eventName} (${event.date}): ${event.reason}\n`;
                });
                errorMessage += '\nPlease return to the calendar and select valid events.';
                showErrorModal(errorMessage);
            } else {
                showErrorModal(result.message || 'Registration failed due to availability constraints. Please select different events or reduce the number of riders.');
            }
            return;
        }
    } catch (error) {
        console.error('Error checking availability:', error);
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
        showErrorModal('Error checking availability. Please try again.');
        return;
    }

    // Calculate total amount
    let totalAmount;
    if (window.multiEventData) {
        totalAmount = window.multiEventData.pricingInfo.totalCost * riderCount;
    } else {
        totalAmount = ratePerRider * riderCount;
    }

    // Start payment process
    submitButton.textContent = 'Creating payment...';
    
    console.log('About to create payment intent with amount:', totalAmount);
    
    try {
        // Create payment intent
        const paymentResponse = await fetch('/api/create-payment-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: totalAmount,
                currency: 'aud',
                metadata: {
                    riderCount: riderCount,
                    eventNames: selectedEvents.map(e => e.title).join(', '),
                    registrationData: 'track_reservation'
                }
            })
        });

        console.log('Payment response status:', paymentResponse.status);

        if (!paymentResponse.ok) {
            const errorData = await paymentResponse.text();
            console.error('Payment intent creation failed:', errorData);
            throw new Error('Failed to create payment intent: ' + errorData);
        }

        const paymentData = await paymentResponse.json();
        console.log('Payment data received (keys):', Object.keys(paymentData));

        const { clientSecret, paymentIntentId } = paymentData;
        const maskedPaymentIntentId = typeof paymentIntentId === 'string' && paymentIntentId.length > 8
            ? `${paymentIntentId.slice(0, 4)}...${paymentIntentId.slice(-4)}`
            : paymentIntentId ? '[redacted]' : 'UNDEFINED';

        console.log('Payment intent created:', {
            clientSecret: clientSecret ? clientSecret.substring(0, 20) + '...' : 'UNDEFINED',
            paymentIntentId: maskedPaymentIntentId
        });
        
        if (!clientSecret) {
            throw new Error('No client secret received from payment intent creation');
        }
        
        // Process payment with the client secret and existing elements
        submitButton.textContent = 'Processing payment...';
        const paymentResult = await processPayment(clientSecret);
        
        if (paymentResult.success) {
            // Payment successful, now submit registration
            submitButton.textContent = 'Completing registration...';
            await completeRegistration(form, paymentIntentId, totalAmount);
        } else {
            throw new Error(paymentResult.error || 'Payment failed');
        }
        
    } catch (error) {
        console.error('Payment error:', error);
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
        showErrorModal('Payment failed: ' + error.message);
    }
}

// Process payment based on selected method
async function processPayment(clientSecret) {
    console.log('processPayment called with clientSecret:', clientSecret?.substring(0, 20) + '...');
    
    if (!clientSecret) {
        throw new Error('Client secret is required for payment processing');
    }
    
    const errorDiv = document.querySelector('#payment-errors');
    
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
    
    try {
        let result;
        
        // Determine the correct return URL based on current domain
        const currentDomain = window.location.hostname;
        let returnUrl;
        
        if (currentDomain.includes('vercel.app')) {
            returnUrl = 'https://smg-mc.vercel.app/programs/track_reserve.html?payment=success';
        } else if (currentDomain.includes('motocoach.com.au')) {
            returnUrl = 'https://motocoach.com.au/programs/track_reserve.html?payment=success';
        } else {
            // Fallback for local development
            returnUrl = window.location.origin + '/programs/track_reserve.html?payment=success';
        }
        
        // Submit and validate the Elements form before confirming payment
        console.log('Submitting elements for validation...');
        const { error: submitError } = await elements.submit();
        if (submitError) {
            console.error('Elements submission error:', submitError);
            if (errorDiv) {
                errorDiv.textContent = submitError.message;
                errorDiv.style.display = 'block';
            }
            return { success: false, error: submitError.message };
        }
        console.log('Elements submitted successfully');
        
        // Pattern B: Elements created without clientSecret, so pass it to confirmPayment
        console.log('Confirming payment with clientSecret...');
        result = await stripe.confirmPayment({
            elements,
            clientSecret,
            confirmParams: {
                return_url: returnUrl,
            },
            redirect: 'if_required'
        });
        
        if (result.error) {
            if (errorDiv) {
                errorDiv.textContent = result.error.message;
                errorDiv.style.display = 'block';
            }
            return { success: false, error: result.error.message };
        } else {
            return { success: true };
        }
        
    } catch (error) {
        if (errorDiv) {
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'block';
        }
        return { success: false, error: error.message };
    }
}
        
// Show payment modal with Stripe Elements and multiple payment methods
// NOTE: This function is no longer used - payment is now inline
/*
async function showPaymentModal(clientSecret, amount) {
    return new Promise((resolve) => {
        // Get Stripe publishable key
        let stripePublishableKey;
        
        // Use async IIFE to handle async operations inside Promise
        (async () => {
            try {
                const configResponse = await fetch('/api/stripe-config');
                const config = await configResponse.json();
                stripePublishableKey = config.publishableKey;
            } catch (error) {
                console.error('Error getting Stripe config:', error);
                resolve({ success: false, error: 'Payment configuration error' });
                return;
            }
            
            // Create payment modal
            const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; width: 95%;">
                <div class="modal-header" style="text-align: center;">
                    <h2>Complete Payment</h2>
                    <p style="color: #ccc; margin: 10px 0;">Total: $${amount.toFixed(2)} AUD</p>
                </div>
                
                <!-- Payment Method Selector -->
                <div class="payment-method-selector" style="margin: 20px 0;">
                    <h4 style="color: #fff; margin-bottom: 15px;">Choose Payment Method</h4>
                    <div class="payment-methods" style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <button type="button" class="payment-method-btn active" data-method="card" style="
                            flex: 1; padding: 12px; border: 2px solid #ff6600; background: #ff6600; color: white; 
                            border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; 
                            justify-content: center; gap: 8px; transition: all 0.3s ease;
                        ">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                            </svg>
                            Card
                        </button>
                        <button type="button" class="payment-method-btn" data-method="apple-pay" style="
                            flex: 1; padding: 12px; border: 2px solid #555; background: #2a2a2a; color: #ccc; 
                            border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; 
                            justify-content: center; gap: 8px; transition: all 0.3s ease;
                        ">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                            </svg>
                            Apple Pay
                        </button>
                        <button type="button" class="payment-method-btn" data-method="afterpay" style="
                            flex: 1; padding: 12px; border: 2px solid #555; background: #2a2a2a; color: #ccc; 
                            border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; 
                            justify-content: center; gap: 8px; transition: all 0.3s ease;
                        ">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                            </svg>
                            Afterpay
                        </button>
                    </div>
                </div>
                
                <!-- Payment Elements Container -->
                <div id="card-element-container" style="margin: 20px 0;">
                    <div id="payment-element"></div>
                </div>
                
                <div id="apple-pay-container" style="margin: 20px 0; display: none;">
                    <div id="apple-pay-button"></div>
                </div>
                
                <div id="afterpay-container" style="margin: 20px 0; display: none;">
                    <div id="afterpay-element"></div>
                </div>
                
                <div id="payment-errors" style="color: #dc3545; margin: 10px 0; display: none;"></div>
                <div class="modal-actions" style="display: flex; gap: 15px; justify-content: center;">
                    <button id="cancel-payment" type="button" class="btn-secondary">Cancel</button>
                    <button id="submit-payment" type="button" class="btn-primary">Pay Now</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Initialize Stripe
        const stripe = Stripe(stripePublishableKey);
        const elements = stripe.elements({ 
            clientSecret,
            appearance: {
                theme: 'night',
                variables: {
                    colorPrimary: '#ff6600',
                    colorBackground: '#2a2a2a',
                    colorText: '#ffffff',
                    colorDanger: '#dc3545',
                    fontFamily: '"Roboto Condensed", sans-serif',
                    spacingUnit: '4px',
                    borderRadius: '8px'
                }
            }
        });
        
        // Create payment elements
        const paymentElement = elements.create('payment', {
            layout: 'tabs'
        });
        paymentElement.mount('#payment-element');
        
        // Check if Apple Pay is available
        const applePayButton = elements.create('paymentRequestButton', {
            paymentRequest: {
                country: 'AU',
                currency: 'aud',
                total: {
                    label: 'Moto Coach Track Reservation',
                    amount: Math.round(amount * 100)
                },
                requestPayerName: true,
                requestPayerEmail: true,
            }
        });
        
        // Check if Apple Pay is available and mount if supported
        applePayButton.canMakePayment().then((result) => {
            if (result && result.applePay) {
                applePayButton.mount('#apple-pay-button');
                // Enable Apple Pay button
                modal.querySelector('[data-method="apple-pay"]').style.display = 'flex';
            } else {
                // Hide Apple Pay option if not available
                modal.querySelector('[data-method="apple-pay"]').style.opacity = '0.5';
                modal.querySelector('[data-method="apple-pay"]').style.cursor = 'not-allowed';
                modal.querySelector('[data-method="apple-pay"]').disabled = true;
            }
        });
        
        // Payment method switching
        const methodButtons = modal.querySelectorAll('.payment-method-btn');
        const containers = {
            'card': modal.querySelector('#card-element-container'),
            'apple-pay': modal.querySelector('#apple-pay-container'),
            'afterpay': modal.querySelector('#afterpay-container')
        };
        
        let currentMethod = 'card';
        
        methodButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                
                // Update button states
                methodButtons.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = '#2a2a2a';
                    b.style.borderColor = '#555';
                    b.style.color = '#ccc';
                });
                
                btn.classList.add('active');
                btn.style.background = '#ff6600';
                btn.style.borderColor = '#ff6600';
                btn.style.color = 'white';
                
                // Show/hide containers
                Object.values(containers).forEach(container => {
                    container.style.display = 'none';
                });
                
                const method = btn.dataset.method;
                currentMethod = method;
                
                if (method === 'apple-pay') {
                    containers['apple-pay'].style.display = 'block';
                } else if (method === 'afterpay') {
                    containers['afterpay'].style.display = 'block';
                } else {
                    containers['card'].style.display = 'block';
                }
            });
        });
        
        const submitBtn = modal.querySelector('#submit-payment');
        const cancelBtn = modal.querySelector('#cancel-payment');
        const errorDiv = modal.querySelector('#payment-errors');
        
        // Handle Apple Pay payment
        applePayButton.on('click', async (event) => {
            const { error } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: window.location.href,
                },
                redirect: 'if_required'
            });
            
            if (error) {
                errorDiv.textContent = error.message;
                errorDiv.style.display = 'block';
            } else {
                document.body.removeChild(modal);
                resolve({ success: true });
            }
        });
        
        // Handle regular payment submission
        submitBtn.addEventListener('click', async () => {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';
            errorDiv.style.display = 'none';
            
            const { error } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: window.location.href,
                },
                redirect: 'if_required'
            });
            
            if (error) {
                errorDiv.textContent = error.message;
                errorDiv.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Pay Now';
            } else {
                document.body.removeChild(modal);
                resolve({ success: true });
            }
        });
        
        // Handle cancel
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve({ success: false, error: 'Payment cancelled' });
        });
        
        })(); // Close async IIFE
    });
}
*/

// Complete registration after successful payment
async function completeRegistration(form, paymentIntentId, totalAmount) {
    // Check reCAPTCHA v3 verification
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (!isDev) {
        // Execute reCAPTCHA v3 for this form submission
        try {
            console.log('Executing reCAPTCHA v3...');
            await new Promise((resolve, reject) => {
                grecaptcha.ready(function() {
                    grecaptcha.execute(recaptchaSiteKey, {action: 'track_reservation'}).then(function(token) {
                        console.log('reCAPTCHA v3 token received');
                        recaptchaToken = token;
                        resolve(token);
                    }).catch(reject);
                });
            });
        } catch (error) {
            console.error('reCAPTCHA execution failed:', error);
            throw new Error('Security verification failed. Please try again or contact us directly.');
        }
        
        if (!recaptchaToken) {
            throw new Error('Security verification is required. Please try again.');
        }
    } else {
        console.log('Development mode: skipping reCAPTCHA verification');
    }
    
    try {
        // Collect all form data
        const formData = new FormData(form);
        const data = {};
        
        // Get basic form data
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        // Add payment and security data
        data.paymentIntentId = paymentIntentId;
        data.totalAmount = totalAmount;
        data.recaptchaToken = recaptchaToken;
        
        // Handle multi-event vs single event data
        if (window.multiEventData) {
            // Multi-event registration
            data.multiEventRegistration = true;
            data.events = window.multiEventData.events;
            data.pricingInfo = window.multiEventData.pricingInfo;
        } else {
            // Single event registration
            const urlParams = new URLSearchParams(window.location.search);
            data.eventName = urlParams.get('event') || data.eventName || '';
            data.eventDate = urlParams.get('date') || '';
            data.eventLocation = urlParams.get('location') || '';
            data.eventTime = urlParams.get('time') || '';
            data.ratePerRider = ratePerRider;
            
            // Include events array format for availability checking
            data.events = [{
                title: data.eventName,
                dateString: data.eventDate,
                time: data.eventTime,
                location: data.eventLocation,
                maxSpots: 10 // Default capacity
            }];
        }
        
        // Submit to API
        const response = await fetch('/api/track_reserve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            
            // Handle specific validation errors
            if (errorData.invalidEvents && errorData.invalidEvents.length > 0) {
                let errorMessage = 'Registration failed - Event validation error:\n\n';
                errorData.invalidEvents.forEach(event => {
                    errorMessage += `• ${event.eventName} (${event.date}): ${event.reason}\n`;
                });
                errorMessage += '\nPlease return to the calendar and select valid events.';
                throw new Error(errorMessage);
            } else {
                throw new Error(errorData.details || errorData.error || 'Registration failed');
            }
        }
        
        await response.json();
        console.log('Registration submitted successfully (response redacted).');
        
        // Show success modal
        showSuccessModal();
        
        // Reset form state
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = false;
        submitButton.textContent = 'Confirm';
        
    } catch (error) {
        console.error('Error completing registration:', error);
        throw error;
    }
}

// Function to show success modal
function showSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.style.display = 'flex';
        
        // Blur the main content (excluding header and footer)
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.style.filter = 'blur(5px)';
        }
        
        // Prevent body scrolling when modal is open
        document.body.style.overflow = 'hidden';
    }
}

// Function to hide success modal (in case we need it)
function hideSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.style.display = 'none';
        
        // Remove blur from main content
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.style.filter = 'none';
        }
        
        // Restore body scrolling
        document.body.style.overflow = 'auto';
    }
}

// Function to show error modal
function showErrorModal(message) {
    const modal = document.getElementById('errorModal');
    const errorDetails = document.getElementById('errorDetails');
    
    if (modal && errorDetails) {
        errorDetails.textContent = message;
        modal.style.display = 'flex';
        
        // Blur the main content (excluding header and footer)
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.style.filter = 'blur(5px)';
        }
        
        // Prevent body scrolling when modal is open
        document.body.style.overflow = 'hidden';
    }
}

// Function to hide error modal
function hideErrorModal() {
    const modal = document.getElementById('errorModal');
    if (modal) {
        modal.style.display = 'none';
        
        // Remove blur from main content
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.style.filter = 'none';
        }
        
        // Restore body scrolling
        document.body.style.overflow = 'auto';
    }
}
