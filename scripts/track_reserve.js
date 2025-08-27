let riderCount = 1;

// Add rider functionality
document.addEventListener('DOMContentLoaded', function() {
    // Set up add rider button event listener
    document.getElementById('addRiderBtn').addEventListener('click', function() {
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
    });

    // Set up form submission
    const form = document.querySelector('.track-reservation-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmission);
    }

    // Populate event details from URL parameters when page loads
    populateEventDetails();
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
        document.getElementById('descriptionDisplay').textContent = eventDescription;
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
    
    // Check reCAPTCHA verification
    let recaptchaResponse = '';
    try {
        recaptchaResponse = grecaptcha.getResponse();
    } catch (error) {
        console.warn('reCAPTCHA not loaded or error:', error);
        // For development/testing, you might want to allow submissions
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isDev) {
            console.log('Development mode: skipping reCAPTCHA verification');
        } else {
            alert('reCAPTCHA verification system is not available. Please try again later or contact us directly.');
            return;
        }
    }
    
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!recaptchaResponse && !isDev) {
        alert('Please complete the reCAPTCHA verification.');
        return;
    }
    
    // Show loading state
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    
    try {
        // Collect all form data
        const formData = new FormData(form);
        const data = {};
        
        // Get basic form data
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        // Add reCAPTCHA response
        data.recaptchaResponse = recaptchaResponse;
        
        // Add event details from URL parameters (use consistent naming)
        const urlParams = new URLSearchParams(window.location.search);
        data.eventName = urlParams.get('event') || data.eventName || '';
        data.eventDate = urlParams.get('date') || '';
        data.eventLocation = urlParams.get('location') || '';
        data.eventTime = urlParams.get('time') || '';
        
        // Submit to API
        const response = await fetch('/api/track_reserve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            // Success - show success message and reset form
            submitButton.style.backgroundColor = '#28a745';
            submitButton.innerHTML = '✓ Submitted Successfully!';
            
            setTimeout(() => {
                alert('Registration submitted successfully! We will contact you soon with confirmation details. A confirmation email has been sent to the appropriate email address(es).');
                form.reset();
                // Reset reCAPTCHA
                grecaptcha.reset();
                // Reset button after success
                submitButton.disabled = false;
                submitButton.style.backgroundColor = '';
                submitButton.textContent = originalButtonText;
            }, 1500);
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to submit registration');
        }
        
    } catch (error) {
        console.error('Error submitting form:', error);
        
        // Show error state
        submitButton.style.backgroundColor = '#dc3545';
        submitButton.innerHTML = '✗ Submission Failed';
        
        setTimeout(() => {
            alert('There was an error submitting your registration. Please try again or contact us directly.');
            // Reset reCAPTCHA
            grecaptcha.reset();
            // Reset button state
            submitButton.disabled = false;
            submitButton.style.backgroundColor = '';
            submitButton.textContent = originalButtonText;
        }, 2000);
    }
}
