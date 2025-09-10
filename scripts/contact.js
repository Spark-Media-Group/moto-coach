// Contact form handling with reCAPTCHA protection
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.querySelector('.contact-form');
    const submitButton = contactForm.querySelector('button[type="submit"]');
    
    contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Get reCAPTCHA response
        const recaptchaResponse = grecaptcha.getResponse();
        
        if (!recaptchaResponse) {
            showErrorMessage('Please complete the reCAPTCHA verification.');
            return;
        }
        
        // Disable submit button and show loading state
        submitButton.disabled = true;
        const originalText = submitButton.textContent;
        submitButton.textContent = 'Sending...';
        
        try {
            // Collect form data
            const formData = new FormData(contactForm);
            const data = {
                firstName: formData.get('firstName'),
                lastName: formData.get('lastName'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                subject: formData.get('subject'),
                message: formData.get('message'),
                recaptchaToken: recaptchaResponse
            };
            
            // Submit form to API
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Success
                showSuccessMessage(result.message || 'Thank you for your message! We\'ll get back to you soon.');
                contactForm.reset();
                grecaptcha.reset(); // Reset reCAPTCHA
            } else {
                // Error from server
                showErrorMessage(result.error || 'Failed to send message. Please try again.');
                grecaptcha.reset(); // Reset reCAPTCHA on error
            }
            
        } catch (error) {
            console.error('Contact form error:', error);
            showErrorMessage('Network error. Please check your connection and try again.');
            grecaptcha.reset(); // Reset reCAPTCHA on error
        } finally {
            // Re-enable submit button
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    });
});

function showSuccessMessage(message) {
    // Remove any existing messages
    removeExistingMessages();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'alert alert-success';
    messageDiv.innerHTML = `
        <div class="alert-content">
            <svg class="alert-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span>${message}</span>
        </div>
    `;
    
    const formContainer = document.querySelector('.contact-form-container');
    formContainer.insertBefore(messageDiv, formContainer.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

function showErrorMessage(message) {
    // Remove any existing messages
    removeExistingMessages();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'alert alert-error';
    messageDiv.innerHTML = `
        <div class="alert-content">
            <svg class="alert-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>${message}</span>
        </div>
    `;
    
    const formContainer = document.querySelector('.contact-form-container');
    formContainer.insertBefore(messageDiv, formContainer.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

function removeExistingMessages() {
    const existingMessages = document.querySelectorAll('.alert');
    existingMessages.forEach(msg => msg.remove());
}
