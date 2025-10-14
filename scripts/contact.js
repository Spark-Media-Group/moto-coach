import { ensureBotIdClient } from './botid-client.js';

// Contact form handling with Vercel BotID protection
let botProtectionEnabled = true;

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize scroll animations
    initScrollAnimations();

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

    const formWrapper = document.querySelector('.contact-form-wrapper');
    if (!formWrapper) {
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

    // Insert before the form
    const form = formWrapper.querySelector('.contact-form');
    if (form) {
        formWrapper.insertBefore(messageDiv, form);
    } else {
        formWrapper.insertBefore(messageDiv, formWrapper.firstChild);
    }

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

// ===================================
// SCROLL ANIMATIONS
// ===================================
function initScrollAnimations() {
    // Add class to enable animations (content is visible by default)
    document.documentElement.classList.add('animations-ready');
    
    const animatedElements = document.querySelectorAll(
        '.fade-in-up, .fade-in-left, .fade-in-right, .fade-in-scale, .stagger-item'
    );

    // Small delay to allow CSS to apply hidden state before triggering animations
    setTimeout(() => {
        // Immediately show elements that are already in viewport on page load
        animatedElements.forEach(element => {
            const rect = element.getBoundingClientRect();
            const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
            if (isInViewport) {
                element.classList.add('is-visible');
            }
        });

        const observerOptions = {
            root: null,
            rootMargin: '0px 0px -100px 0px',
            threshold: 0.15
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        }, observerOptions);

        animatedElements.forEach(element => {
            observer.observe(element);
        });
    }, 50);
}
