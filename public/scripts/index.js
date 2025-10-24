// Index page scroll animations
document.addEventListener('DOMContentLoaded', function() {
    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Add stagger delay for elements in the same container
                const delay = index * 100;
                setTimeout(() => {
                    entry.target.classList.add('animate');
                }, delay);
                
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all fade-in elements
    const fadeElements = document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right, .fade-in-scale');
    fadeElements.forEach(element => {
        observer.observe(element);
    });

    // Special handling for stat items (stagger them nicely)
    const statItems = document.querySelectorAll('.stat-item');
    statItems.forEach((stat, index) => {
        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.classList.add('animate');
                    }, index * 150); // Stagger each stat by 150ms
                    statObserver.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        statObserver.observe(stat);
    });

    // Special handling for program cards (stagger them)
    const programCards = document.querySelectorAll('.program-card');
    programCards.forEach((card, index) => {
        const cardObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.classList.add('animate');
                    }, index * 150); // Stagger each card by 150ms
                    cardObserver.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        cardObserver.observe(card);
    });
});
