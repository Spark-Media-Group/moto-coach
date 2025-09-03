let riderCount = 1;
let recaptchaSiteKey = null;
let recaptchaToken = null;
let ratePerRider = 190; // Default rate in AUD
let maxSpots = null; // Maximum spots available for the event
let remainingSpots = null; // Remaining spots available

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
    // Load configuration and initialize reCAPTCHA v3
    initializeRecaptcha();
    
    // Initialize pricing from URL parameters
    initializePricing();
    
    // Set up add rider button event listener
    document.getElementById('addRiderBtn').addEventListener('click', function() {
        // Check if we've reached the maximum number of riders (simple UI limit)
        if (remainingSpots !== null && riderCount >= remainingSpots) {
            showErrorModal(`Maximum ${remainingSpots} rider${remainingSpots !== 1 ? 's' : ''} allowed for this event.`);
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

// Initialize pricing from URL parameters
function initializePricing() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRate = urlParams.get('rate');
    const urlMaxSpots = urlParams.get('maxSpots');
    const urlRemainingSpots = urlParams.get('remainingSpots');
    
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
    
    if (rateDisplay && ridersDisplay && totalDisplay) {
        const total = ratePerRider * riderCount;
        
        rateDisplay.textContent = `$${ratePerRider.toFixed(2)} AUD`;
        ridersDisplay.textContent = riderCount;
        totalDisplay.textContent = `$${total.toFixed(2)} AUD`;
    }
}

// Update add rider button based on available spots
function updateAddRiderButton() {
    const addRiderBtn = document.getElementById('addRiderBtn');
    
    if (addRiderBtn && remainingSpots !== null) {
        if (riderCount >= remainingSpots) {
            addRiderBtn.disabled = true;
            addRiderBtn.textContent = `Maximum ${remainingSpots} rider${remainingSpots !== 1 ? 's' : ''} allowed`;
            addRiderBtn.style.opacity = '0.5';
            addRiderBtn.style.cursor = 'not-allowed';
        } else {
            addRiderBtn.disabled = false;
            addRiderBtn.textContent = '+ Add Another Rider';
            addRiderBtn.style.opacity = '1';
            addRiderBtn.style.cursor = 'pointer';
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

    // Check availability for all selected events and riders before proceeding
    submitButton.disabled = true;
    submitButton.textContent = 'Checking availability...';
    
    try {
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
            showErrorModal(result.message || 'Registration failed due to availability constraints. Please select different events or reduce the number of riders.');
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
    submitButton.textContent = 'Processing payment...';
    
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

        if (!paymentResponse.ok) {
            throw new Error('Failed to create payment intent');
        }

        const { clientSecret, paymentIntentId } = await paymentResponse.json();
        
        // Show payment modal and handle payment
        const paymentResult = await showPaymentModal(clientSecret, totalAmount);
        
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
        
        if (response.ok) {
            // Success - show success modal
            submitButton.style.backgroundColor = '#28a745';
            submitButton.innerHTML = '✓ Submitted Successfully!';
            
            setTimeout(() => {
                // Show the success modal
                showSuccessModal();
                form.reset();
                // Reset reCAPTCHA
                recaptchaToken = null;
                // Reset button after success
                submitButton.disabled = false;
                submitButton.style.backgroundColor = '';
                submitButton.textContent = 'Confirm';
            }, 1500);
        } else {
            const errorData = await response.json();
            
            // Check if this is an availability error with detailed information
            if (errorData.details && errorData.unavailableEvents) {
                showErrorModal(errorData.details);
            } else {
                throw new Error(errorData.error || 'Failed to submit registration');
            }
            return; // Don't continue to catch block for availability errors
        }
        
// Show payment modal with Stripe Elements and multiple payment methods
async function showPaymentModal(clientSecret, amount) {
    return new Promise(async (resolve) => {
        // Get Stripe publishable key
        let stripePublishableKey;
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
    });
}

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
            throw new Error(errorData.details || errorData.error || 'Registration failed');
        }
        
        const result = await response.json();
        console.log('Registration submitted successfully:', result);
        
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
