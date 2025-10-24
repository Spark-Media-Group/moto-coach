import { ensureBotIdClient } from './botid-client.js';

// US Travel Program Inquiry Form Handler
let botProtectionEnabled = true;

document.addEventListener('DOMContentLoaded', async function() {
    const form = document.querySelector('.application-form');
    if (!form) {
        return;
    }

    await initialiseBotProtection();

    // Handle form submission
    form.addEventListener('submit', handleFormSubmission);

    // File upload handlers
    setupFileUpload();
});

async function initialiseBotProtection() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            return;
        }

        const config = await response.json();
        if (typeof config.botProtectionEnabled === 'boolean') {
            botProtectionEnabled = config.botProtectionEnabled;
        }

        if (botProtectionEnabled) {
            await ensureBotIdClient([
                { path: '/api/apply_us', method: 'POST' }
            ]);
        } else {
            console.log('Bot protection disabled for this environment');
        }
    } catch (error) {
        console.error('Failed to load bot protection configuration:', error);
    }
}

// Handle form submission
async function handleFormSubmission(e) {
    e.preventDefault();
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    
    try {
        // Disable submit button and show loading state
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting Inquiry...';

        // Collect form data
        const formData = await collectFormData(e.target);

        // Validate form data
        const validation = validateFormData(formData);
        if (!validation.isValid) {
            throw new Error(validation.message);
        }
        
        // Submit to backend API
        const response = await fetch('/api/apply_us', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.details || result.error || 'Inquiry submission failed');
        }
        
        // Show success message
        showSuccessMessage(result.applicationId);
        
        // Reset form
        e.target.reset();
        
        // Clear dynamic supporter forms
        const supporterForms = document.getElementById('supporterForms');
        if (supporterForms) {
            supporterForms.innerHTML = '';
        }
        
        // Reset supporter dropdowns
        document.getElementById('bringingSupporter').value = '';
        document.getElementById('supporterCount').value = '';
        document.getElementById('supporterCountGroup').style.display = 'none';

        const passportInput = document.getElementById('passportPicture');
        if (passportInput) {
            passportInput.value = '';
            const uploadText = passportInput.previousElementSibling?.querySelector('.file-upload-text');
            if (uploadText) {
                uploadText.textContent = 'Click to upload';
            }
        }
        
    } catch (error) {
        console.error('Form submission error:', error);
        showErrorMessage(error.message);
    } finally {
        // Re-enable submit button
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}

// Collect all form data
async function collectFormData(form) {
    const formData = {};
    const inputs = form.querySelectorAll('input, select, textarea');

    for (const input of inputs) {
        if (input.type === 'file') {
            const file = input.files[0];
            if (file) {
                const base64 = await readFileAsBase64(file);
                formData[input.name] = {
                    filename: file.name,
                    contentType: file.type,
                    data: base64
                };
            }
        } else if (input.type === 'checkbox') {
            formData[input.name] = input.checked;
        } else if (input.type === 'radio') {
            if (input.checked) {
                formData[input.name] = input.value;
            }
        } else {
            formData[input.name] = typeof input.value === 'string' ? input.value.trim() : input.value;
        }
    }

    return formData;
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                const base64Data = reader.result.split(',')[1] || '';
                resolve(base64Data);
            } else {
                reject(new Error('Unable to process uploaded file.'));
            }
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read the uploaded file.'));
        reader.readAsDataURL(file);
    });
}

// Validate form data
function validateFormData(formData) {
    // Check required fields
    const requiredFields = [
        'firstName', 'lastName', 'dateOfBirth', 'email', 'bikeChoice',
        'passportNumber', 'bringingSupporter', 'emergencyContact', 'emergencyPhone'
    ];
    
    for (const field of requiredFields) {
        if (!formData[field] || formData[field].trim() === '') {
            return {
                isValid: false,
                message: `Please fill in the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} field.`
            };
        }
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        return {
            isValid: false,
            message: 'Please enter a valid email address.'
        };
    }
    
    // Validate supporter information if applicable
    if (formData.bringingSupporter === 'yes') {
        if (!formData.supporterCount) {
            return {
                isValid: false,
                message: 'Please specify the number of supporters you are bringing.'
            };
        }
        
        // Check supporter details
        for (let i = 1; i <= parseInt(formData.supporterCount); i++) {
            const requiredSupporterFields = [
                `supporterFirstName${i}`, `supporterLastName${i}`,
                `supporterDateOfBirth${i}`, `supporterPassportNumber${i}`
            ];
            
            for (const field of requiredSupporterFields) {
                if (!formData[field] || formData[field].trim() === '') {
                    return {
                        isValid: false,
                        message: `Please fill in all details for supporter ${i}.`
                    };
                }
            }
        }
    }
    
    if (!formData.passportPicture || !formData.passportPicture.data) {
        return {
            isValid: false,
            message: 'Please upload your passport picture.'
        };
    }

    return { isValid: true };
}

// Show success message
function showSuccessMessage(applicationId) {
    const message = `
        <div class="success-message" style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            text-align: center;
            z-index: 10000;
            max-width: 500px;
            width: 90%;
        ">
            <div style="color: #28a745; font-size: 60px; margin-bottom: 20px;">✓</div>
            <h3 style="color: #333; margin-bottom: 15px;">Inquiry Submitted</h3>
            <p style="color: #666; margin-bottom: 20px;">
                Thank you for sending an Inquiry to the US Travel Program. We'll be in touch with you if there are openings. Your inquiry ID is:
            </p>
            <div style="
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                font-family: monospace;
                font-weight: bold;
                color: #ff6600;
                margin-bottom: 20px;
            ">${applicationId}</div>
            <p style="color: #666; font-size: 14px;">
                You will receive a confirmation email shortly summarising your inquiry.
            </p>
            <button onclick="closeSuccessMessage()" style="
                background: #ff6600;
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 25px;
                cursor: pointer;
                font-size: 16px;
                margin-top: 20px;
            ">Return Home</button>
        </div>
        <div class="overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        "></div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', message);
}

// Show error message
function showErrorMessage(errorMessage) {
    const message = `
        <div class="error-message" style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            text-align: center;
            z-index: 10000;
            max-width: 500px;
            width: 90%;
        ">
            <div style="color: #dc3545; font-size: 60px; margin-bottom: 20px;">⚠</div>
            <h3 style="color: #333; margin-bottom: 15px;">Inquiry Error</h3>
            <p style="color: #666; margin-bottom: 20px;">${errorMessage}</p>
            <button onclick="closeErrorMessage()" style="
                background: #dc3545;
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 25px;
                cursor: pointer;
                font-size: 16px;
            ">Try Again</button>
        </div>
        <div class="overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        "></div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', message);
}

// Close success message
window.closeSuccessMessage = function() {
    const successMessage = document.querySelector('.success-message');
    const overlay = document.querySelector('.overlay');
    if (successMessage) successMessage.remove();
    if (overlay) overlay.remove();
    window.location.href = '/';
};

// Close error message
window.closeErrorMessage = function() {
    const errorMessage = document.querySelector('.error-message');
    const overlay = document.querySelector('.overlay');
    if (errorMessage) errorMessage.remove();
    if (overlay) overlay.remove();
};

// Setup file upload functionality
function setupFileUpload() {
    // This function is referenced in the HTML but needs to be defined
    window.updateFileUploadText = function(input) {
        const wrapper = input.previousElementSibling;
        const textElement = wrapper.querySelector('.file-upload-text');
        if (input.files && input.files[0]) {
            textElement.textContent = input.files[0].name;
        } else {
            textElement.textContent = 'Click to upload';
        }
    };
}

// Supporter form functionality (these functions are referenced in the HTML)
window.toggleSupporterDetails = function() {
    const bringingSupporter = document.getElementById('bringingSupporter').value;
    const supporterCountGroup = document.getElementById('supporterCountGroup');
    const supporterForms = document.getElementById('supporterForms');
    
    if (bringingSupporter === 'yes') {
        supporterCountGroup.style.display = 'block';
    } else {
        supporterCountGroup.style.display = 'none';
        supporterForms.innerHTML = '';
        document.getElementById('supporterCount').value = '';
    }
};

window.generateSupporterForms = function() {
    const supporterCount = parseInt(document.getElementById('supporterCount').value);
    const supporterForms = document.getElementById('supporterForms');
    
    supporterForms.innerHTML = '';
    
    for (let i = 1; i <= supporterCount; i++) {
        const supporterForm = `
            <div class="form-section-header">
                <h3>Supporter ${i} Information</h3>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="supporterFirstName${i}">First Name *</label>
                    <input type="text" id="supporterFirstName${i}" name="supporterFirstName${i}" required>
                </div>
                <div class="form-group">
                    <label for="supporterLastName${i}">Last Name *</label>
                    <input type="text" id="supporterLastName${i}" name="supporterLastName${i}" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="supporterDateOfBirth${i}">Date of Birth *</label>
                    <input type="date" id="supporterDateOfBirth${i}" name="supporterDateOfBirth${i}" required>
                </div>
                <div class="form-group">
                    <label for="supporterPassportNumber${i}">Passport Number *</label>
                    <input type="text" id="supporterPassportNumber${i}" name="supporterPassportNumber${i}" required>
                </div>
            </div>
        `;
        
        supporterForms.insertAdjacentHTML('beforeend', supporterForm);
    }
};
