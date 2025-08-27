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
                        <label for="dateOfBirth${riderCount}">Date of Birth *</label>
                        <input type="date" id="dateOfBirth${riderCount}" name="dateOfBirth${riderCount}" required onchange="toggleAgeBasedFields()">
                    </div>
                </div>
            </div>
        `;
        
        ridersContainer.insertAdjacentHTML('beforeend', newRiderHTML);
        updateRemoveButtons();
    });

    // Set up form submission
    const form = document.querySelector('.contact-form');
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
        document.getElementById('eventName').value = eventName;
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

// Toggle age-based contact fields
function toggleAgeBasedFields() {
    const dobInput = document.getElementById('dateOfBirth1'); // Use first rider's DOB for contact logic
    if (!dobInput || !dobInput.value) return;
    
    const dob = new Date(dobInput.value);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }

    // Get rider contact section elements
    const riderContactSection = document.getElementById('riderContactSection');
    const riderContactFields = document.getElementById('riderContactFields');
    const riderEmail = document.getElementById('riderEmail');
    const riderPhone = document.getElementById('riderPhone');

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
    }
}

// Function to handle form submission
async function handleFormSubmission(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    
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
        
        // Add event details from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        data.eventTitle = urlParams.get('event') || '';
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
            // Success - show success message and redirect or reset form
            alert('Registration submitted successfully! We will contact you soon with confirmation details.');
            form.reset();
            // Optionally redirect to a thank you page
            // window.location.href = '/thank-you.html';
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to submit registration');
        }
        
    } catch (error) {
        console.error('Error submitting form:', error);
        alert('There was an error submitting your registration. Please try again or contact us directly.');
    } finally {
        // Reset button state
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}
