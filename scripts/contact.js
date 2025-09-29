import { ensureBotIdClient } from './botid-client.js';

// Contact form handling with Vercel BotID protection
let botProtectionEnabled = true;

document.addEventListener('DOMContentLoaded', async function() {
    const contactForm = document.querySelector('.contact-form');
    if (!contactForm) {
        return;
    }

    const submitButton = contactForm.querySelector('button[type="submit"]');

    await loadBotProtectionSettings();

    if (botProtectionEnabled) {
        await ensureBotIdClient([
            { path: '/api/contact', method: 'POST' }
        ]);
    }

    contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();

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
                message: formData.get('message')
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
            } else {
                // Error from server
                showErrorMessage(result.error || 'Failed to send message. Please try again.');
            }

        } catch (error) {
            console.error('Contact form error:', error);
            showErrorMessage('Network error. Please check your connection and try again.');
        } finally {
            // Re-enable submit button
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    });
});

async function loadBotProtectionSettings() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            return;
        }

        const config = await response.json();
        if (typeof config.botProtectionEnabled === 'boolean') {
            botProtectionEnabled = config.botProtectionEnabled;
        }
    } catch (error) {
        console.error('Failed to load bot protection configuration:', error);
    }
}

function showSuccessMessage(message) {
    renderAlert('success', message);
}

function showErrorMessage(message) {
    renderAlert('error', message);
}

function renderAlert(type, message) {
    removeExistingMessages();

    const formContainer = document.querySelector('.contact-form-container');
    if (!formContainer) {
        return;
    }

    const iconPaths = {
        success: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.06 13.53-3.19-3.2 1.5-1.5 1.69 1.69 4.62-4.63 1.5 1.5-6.12 6.14z',
        error: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.54 12.54-1.41 1.41L12 13.41l-2.12 2.12-1.41-1.41L10.59 12 8.46 9.88l1.41-1.41L12 10.59l2.12-2.12 1.41 1.41L13.41 12l2.13 2.12z'
    };

    const titles = {
        success: 'Message sent successfully',
        error: 'Something went wrong'
    };

    const ariaRole = type === 'error' ? 'alert' : 'status';
    const ariaLive = type === 'error' ? 'assertive' : 'polite';

    const messageDiv = document.createElement('div');
    messageDiv.className = `alert alert-${type}`;
    messageDiv.setAttribute('role', ariaRole);
    messageDiv.setAttribute('aria-live', ariaLive);
    messageDiv.setAttribute('tabindex', '-1');

    messageDiv.innerHTML = `
        <div class="alert-content">
            <svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="${iconPaths[type]}" />
            </svg>
            <div class="alert-text">
                <p class="alert-title">${titles[type]}</p>
                <p class="alert-message">${message}</p>
            </div>
        </div>
    `;

    formContainer.insertBefore(messageDiv, formContainer.firstChild);

    try {
        messageDiv.focus({ preventScroll: true });
    } catch (focusError) {
        messageDiv.focus();
    }
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const removalDelay = type === 'success' ? 8000 : 10000;
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.classList.add('alert-hide');
            setTimeout(() => messageDiv.remove(), 250);
        }
    }, removalDelay);
}

function removeExistingMessages() {
    const existingMessages = document.querySelectorAll('.alert');
    existingMessages.forEach(msg => msg.remove());
}
