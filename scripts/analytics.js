// Vercel Analytics for static HTML sites
(function() {
    // Check if we're in development mode
    const isDev = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.includes('192.168.') ||
                  window.location.protocol === 'file:';
    
    // Only load analytics in production (deployed on Vercel or main domain)
    if (!isDev) {
        // Initialize Vercel Web Analytics
        window.va = window.va || function() { 
            (window.vaq = window.vaq || []).push(arguments); 
        };

        // Inject the Web Analytics script
        const analyticsScript = document.createElement('script');
        analyticsScript.defer = true;
        analyticsScript.src = '/_vercel/insights/script.js';
        document.head.appendChild(analyticsScript);

        // Initialize Vercel Speed Insights
        window.si = window.si || function() { 
            (window.siq = window.siq || []).push(arguments); 
        };
        
        // Inject the Speed Insights script
        const speedScript = document.createElement('script');
        speedScript.defer = true;
        speedScript.src = '/_vercel/speed-insights/script.js';
        document.head.appendChild(speedScript);

        // Track custom events for Moto Coach interactions
        function trackCustomEvent(eventName, eventData = {}) {
            try {
                if (window.va) {
                    window.va('track', eventName, eventData);
                }
            } catch (error) {
                console.warn('Analytics: Custom event tracking failed:', error);
            }
        }

        // Setup custom tracking for Moto Coach specific interactions
        function setupCustomTracking() {
            // Track form submissions
            document.addEventListener('submit', function(e) {
                const form = e.target;
                if (form.classList.contains('contact-form')) {
                    trackCustomEvent('Contact Form Submit', { page: window.location.pathname });
                } else if (form.classList.contains('track-reservation-form')) {
                    trackCustomEvent('Track Reservation Submit', { page: window.location.pathname });
                } else if (form.classList.contains('application-form')) {
                    trackCustomEvent('Application Form Submit', { page: window.location.pathname });
                }
            });

            // Track register button clicks
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('btn-register')) {
                    trackCustomEvent('Register Button Click', { 
                        page: window.location.pathname,
                        url: e.target.href
                    });
                }
                
                // Track navigation menu clicks
                if (e.target.closest('.nav-links a')) {
                    const link = e.target.closest('a');
                    trackCustomEvent('Navigation Click', {
                        page: window.location.pathname,
                        destination: link.href,
                        text: link.textContent.trim()
                    });
                }
                
                // Track social media clicks
                if (e.target.closest('.social-icon')) {
                    const link = e.target.closest('a');
                    trackCustomEvent('Social Media Click', {
                        page: window.location.pathname,
                        platform: link.href.includes('instagram') ? 'instagram' : 'facebook'
                    });
                }
                
                // Track calendar date clicks
                if (e.target.classList.contains('calendar-day')) {
                    trackCustomEvent('Calendar Date Click', {
                        page: window.location.pathname
                    });
                }
            });

            // Track video interactions (if any)
            document.addEventListener('play', function(e) {
                if (e.target.tagName === 'VIDEO') {
                    trackCustomEvent('Video Play', {
                        page: window.location.pathname,
                        video: e.target.src || e.target.currentSrc
                    });
                }
            }, true);

            // Track scroll depth milestones
            let maxScroll = 0;
            const trackScrollDepth = () => {
                const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
                if (scrollPercent > maxScroll && scrollPercent % 25 === 0 && scrollPercent > 0) {
                    maxScroll = scrollPercent;
                    trackCustomEvent('Scroll Depth', {
                        page: window.location.pathname,
                        depth: `${scrollPercent}%`
                    });
                }
            };
            
            let scrollTimeout;
            window.addEventListener('scroll', function() {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(trackScrollDepth, 100);
            });
        }

        // Initialize custom tracking when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupCustomTracking);
        } else {
            setupCustomTracking();
        }

        console.log('Moto Coach Analytics: Vercel Analytics initialized successfully');
    } else {
        console.log('Moto Coach Analytics: Disabled in development mode');
    }
})();
