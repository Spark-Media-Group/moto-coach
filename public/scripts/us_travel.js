// US Travel Program - Scroll Animation Controller
// Elite fade-in effects triggered on scroll

document.addEventListener('DOMContentLoaded', () => {
    // Intersection Observer configuration
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    // Callback function for intersection observer
    const observerCallback = (entries, observer) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Add stagger delay based on element index within its section
                setTimeout(() => {
                    entry.target.classList.add('is-visible');
                }, index * 100);
                
                // Unobserve after animation to improve performance
                observer.unobserve(entry.target);
            }
        });
    };

    // Create the observer
    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Select all elements to animate
    const animateElements = document.querySelectorAll(
        '.fade-in-up, .fade-in-left, .fade-in-right, .fade-in-scale'
    );

    // Start observing each element
    animateElements.forEach(element => {
        observer.observe(element);
    });

    // Performance optimization: disconnect observer when all animations are complete
    if (animateElements.length === 0) {
        observer.disconnect();
    }
});
