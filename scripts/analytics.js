// Vercel Analytics for static HTML sites
(function() {
    // Check if we're in development mode
    const isDev = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.includes('vercel.app') === false;
    
    // Only load analytics in production
    if (!isDev) {
        // Vercel Analytics Web Vitals tracking
        function vitals(metric) {
            const body = JSON.stringify(metric);
            const url = 'https://vitals.vercel-analytics.com/v1/vitals';
            
            // Use sendBeacon if available, fallback to fetch
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, body);
            } else {
                fetch(url, { body, method: 'POST', keepalive: true });
            }
        }

        // Track Core Web Vitals
        function trackWebVitals() {
            try {
                // CLS (Cumulative Layout Shift)
                new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (!entry.hadRecentInput) {
                            vitals({
                                name: 'CLS',
                                value: entry.value,
                                id: generateUniqueId(),
                                url: window.location.href
                            });
                        }
                    }
                }).observe({ type: 'layout-shift', buffered: true });

                // FID (First Input Delay)
                new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        vitals({
                            name: 'FID',
                            value: entry.processingStart - entry.startTime,
                            id: generateUniqueId(),
                            url: window.location.href
                        });
                    }
                }).observe({ type: 'first-input', buffered: true });

                // LCP (Largest Contentful Paint)
                new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const lastEntry = entries[entries.length - 1];
                    vitals({
                        name: 'LCP',
                        value: lastEntry.startTime,
                        id: generateUniqueId(),
                        url: window.location.href
                    });
                }).observe({ type: 'largest-contentful-paint', buffered: true });

                // TTFB (Time to First Byte)
                const navigation = performance.getEntriesByType('navigation')[0];
                if (navigation) {
                    vitals({
                        name: 'TTFB',
                        value: navigation.responseStart - navigation.requestStart,
                        id: generateUniqueId(),
                        url: window.location.href
                    });
                }

                // FCP (First Contentful Paint)
                new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.name === 'first-contentful-paint') {
                            vitals({
                                name: 'FCP',
                                value: entry.startTime,
                                id: generateUniqueId(),
                                url: window.location.href
                            });
                        }
                    }
                }).observe({ type: 'paint', buffered: true });

            } catch (error) {
                console.warn('Analytics: Web Vitals tracking failed:', error);
            }
        }

        // Generate unique ID for each metric
        function generateUniqueId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }

        // Track page views
        function trackPageView() {
            try {
                vitals({
                    name: 'PV',
                    value: 1,
                    id: generateUniqueId(),
                    url: window.location.href,
                    referrer: document.referrer
                });
            } catch (error) {
                console.warn('Analytics: Page view tracking failed:', error);
            }
        }

        // Track custom events for Moto Coach interactions
        function trackCustomEvent(eventName, eventData = {}) {
            try {
                vitals({
                    name: 'CE',
                    value: 1,
                    id: generateUniqueId(),
                    url: window.location.href,
                    event: eventName,
                    data: eventData
                });
            } catch (error) {
                console.warn('Analytics: Custom event tracking failed:', error);
            }
        }

        // Track specific Moto Coach interactions
        function setupCustomTracking() {
            // Track form submissions
            document.addEventListener('submit', function(e) {
                const form = e.target;
                if (form.classList.contains('contact-form')) {
                    trackCustomEvent('contact_form_submit', { page: window.location.pathname });
                } else if (form.classList.contains('track-reservation-form')) {
                    trackCustomEvent('track_reservation_submit', { page: window.location.pathname });
                } else if (form.classList.contains('application-form')) {
                    trackCustomEvent('application_form_submit', { page: window.location.pathname });
                }
            });

            // Track register button clicks
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('btn-register')) {
                    trackCustomEvent('register_button_click', { 
                        page: window.location.pathname,
                        url: e.target.href
                    });
                }
                
                // Track navigation menu clicks
                if (e.target.closest('.nav-links a')) {
                    const link = e.target.closest('a');
                    trackCustomEvent('navigation_click', {
                        page: window.location.pathname,
                        destination: link.href,
                        text: link.textContent.trim()
                    });
                }
                
                // Track social media clicks
                if (e.target.closest('.social-icon')) {
                    const link = e.target.closest('a');
                    trackCustomEvent('social_media_click', {
                        page: window.location.pathname,
                        platform: link.href.includes('instagram') ? 'instagram' : 'facebook'
                    });
                }
                
                // Track calendar date clicks
                if (e.target.classList.contains('calendar-day')) {
                    trackCustomEvent('calendar_date_click', {
                        page: window.location.pathname,
                        date: e.target.textContent
                    });
                }
            });

            // Track video interactions (if any)
            document.addEventListener('play', function(e) {
                if (e.target.tagName === 'VIDEO') {
                    trackCustomEvent('video_play', {
                        page: window.location.pathname,
                        video: e.target.src || e.target.currentSrc
                    });
                }
            }, true);

            // Track scroll depth
            let maxScroll = 0;
            const trackScrollDepth = () => {
                const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
                if (scrollPercent > maxScroll && scrollPercent % 25 === 0) {
                    maxScroll = scrollPercent;
                    trackCustomEvent('scroll_depth', {
                        page: window.location.pathname,
                        depth: scrollPercent
                    });
                }
            };
            
            let scrollTimeout;
            window.addEventListener('scroll', function() {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(trackScrollDepth, 100);
            });
        }

        // Initialize analytics when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                trackPageView();
                trackWebVitals();
                setupCustomTracking();
            });
        } else {
            trackPageView();
            trackWebVitals();
            setupCustomTracking();
        }

        // Track page visibility changes
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden') {
                vitals({
                    name: 'PVC',
                    value: 1,
                    id: generateUniqueId(),
                    url: window.location.href
                });
            }
        });

        console.log('Moto Coach Analytics: Initialized successfully');
    } else {
        console.log('Moto Coach Analytics: Disabled in development mode');
    }
})();
