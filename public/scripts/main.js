// Kazzaz Motor Co. - Enhanced Homepage JavaScript

// Hero Slideshow variables
let currentSlideIndex = 0;
const slides = document.querySelectorAll('.hero-slide');
let slideInterval;

// Coaching slideshow variables
let currentCoachingSlideIndex = 0;
const coachingSlides = document.querySelectorAll('.coaching-slide');
let coachingSlideInterval;

// US Travel slideshow variables
let currentUSSlideIndex = 0;
const usSlides = document.querySelectorAll('.us-travel-slide');
let usSlideInterval;

// Mobile coaching hero slideshow variables
let currentMobileHeroSlideIndex = 0;
const mobileHeroSlides = document.querySelectorAll('.mobile-hero-slide');
let mobileHeroSlideInterval;

// Mobile homepage slideshow variables
let currentMobileSlideIndex = 0;
const mobileSlides = document.querySelectorAll('.mobile-slide');
let mobileSlideInterval;

// Testimonial slideshow variables
let currentTestimonialIndex = 0;
const testimonialCards = document.querySelectorAll('.testimonial-card');
const testimonialDots = document.querySelectorAll('.slider-dot');
let testimonialInterval;

// Slideshow functions
function showSlide(index) {
    // Hide all slides
    slides.forEach(slide => {
        slide.classList.remove('active');
    });
    
    // Show current slide
    if (slides[index]) {
        slides[index].classList.add('active');
    }
}

function nextSlide() {
    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
    showSlide(currentSlideIndex);
}

function startSlideshow() {
    slideInterval = setInterval(() => {
        nextSlide();
    }, 7000); // Change slide every 7 seconds for smoother experience
}

// Coaching slideshow functions
function showCoachingSlide(index) {
    // Hide all coaching slides
    coachingSlides.forEach(slide => {
        slide.classList.remove('active');
    });
    
    // Show current coaching slide
    if (coachingSlides[index]) {
        coachingSlides[index].classList.add('active');
    }
}

function nextCoachingSlide() {
    currentCoachingSlideIndex = (currentCoachingSlideIndex + 1) % coachingSlides.length;
    showCoachingSlide(currentCoachingSlideIndex);
}

function startCoachingSlideshow() {
    coachingSlideInterval = setInterval(() => {
        nextCoachingSlide();
    }, 4000); // Change coaching slide every 4 seconds
}

// US Travel slideshow functions
function showUSSlide(index) {
    // Hide all US travel slides
    usSlides.forEach(slide => {
        slide.classList.remove('active');
    });
    
    // Show current US travel slide
    if (usSlides[index]) {
        usSlides[index].classList.add('active');
    }
}

function nextUSSlide() {
    currentUSSlideIndex = (currentUSSlideIndex + 1) % usSlides.length;
    showUSSlide(currentUSSlideIndex);
}

function startUSSlideshow() {
    usSlideInterval = setInterval(() => {
        nextUSSlide();
    }, 5000); // Change US travel slide every 5 seconds
}

// Mobile coaching hero slideshow functions
function showMobileHeroSlide(index) {
    // Hide all mobile hero slides
    mobileHeroSlides.forEach(slide => {
        slide.classList.remove('active');
    });
    
    // Show current mobile hero slide
    if (mobileHeroSlides[index]) {
        mobileHeroSlides[index].classList.add('active');
    }
}

function nextMobileHeroSlide() {
    currentMobileHeroSlideIndex = (currentMobileHeroSlideIndex + 1) % mobileHeroSlides.length;
    showMobileHeroSlide(currentMobileHeroSlideIndex);
}

function startMobileHeroSlideshow() {
    mobileHeroSlideInterval = setInterval(() => {
        nextMobileHeroSlide();
    }, 4000); // Change mobile hero slide every 4 seconds
}

// Mobile homepage slideshow functions
function showMobileSlide(index) {
    // Hide all mobile slides
    mobileSlides.forEach(slide => {
        slide.classList.remove('active');
    });
    
    // Show current mobile slide
    if (mobileSlides[index]) {
        mobileSlides[index].classList.add('active');
    }
}

function nextMobileSlide() {
    currentMobileSlideIndex = (currentMobileSlideIndex + 1) % mobileSlides.length;
    showMobileSlide(currentMobileSlideIndex);
}

function startMobileSlideshow() {
    mobileSlideInterval = setInterval(() => {
        nextMobileSlide();
    }, 4000); // Change mobile homepage slide every 4 seconds
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Welcome to Moto Coach.');
    
    // Mobile menu toggle functionality
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navLinksContainer = document.querySelector('.nav-links');
    
    if (mobileMenuToggle && navLinksContainer) {
        mobileMenuToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            navLinksContainer.classList.toggle('active');
            
            // Prevent body scroll when menu is open
            if (navLinksContainer.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });
        
        // Close mobile menu when clicking on a navigation link
        const navLinkItems = navLinksContainer.querySelectorAll('a');
        navLinkItems.forEach(link => {
            link.addEventListener('click', function() {
                mobileMenuToggle.classList.remove('active');
                navLinksContainer.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
        
        // Close mobile menu when window is resized to desktop
        window.addEventListener('resize', function() {
            if (window.innerWidth > 1100) {
                mobileMenuToggle.classList.remove('active');
                navLinksContainer.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }
    
    // Initialize slideshow if slides exist
    if (slides.length > 0) {
        showSlide(0); // Show first slide
        startSlideshow(); // Start auto-advance
    }
    
    // Initialize coaching slideshow if coaching slides exist
    if (coachingSlides.length > 0) {
        showCoachingSlide(0); // Show first coaching slide
        startCoachingSlideshow(); // Start auto-advance
    }
    
    // Initialize US Travel slideshow if US travel slides exist
    if (usSlides.length > 0) {
        showUSSlide(0); // Show first US travel slide
        startUSSlideshow(); // Start auto-advance
    }
    
    // Initialize mobile coaching hero slideshow if mobile hero slides exist
    if (mobileHeroSlides.length > 0) {
        showMobileHeroSlide(0); // Show first mobile hero slide
        startMobileHeroSlideshow(); // Start auto-advance
    }
    
    // Initialize mobile homepage slideshow if mobile slides exist
    if (mobileSlides.length > 0) {
        showMobileSlide(0); // Show first mobile slide
        startMobileSlideshow(); // Start auto-advance
    }
    
    // Mobile coaching hero scroll down button functionality - dedicated function
    const scrollDownBtn = document.getElementById('scroll-down');
    if (scrollDownBtn) {
        scrollDownBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Check if we're on mobile (screen width <= 768px)
            if (window.innerWidth <= 768) {
                // On mobile, scroll to the mobile coaching content section
                const targetSection = document.querySelector('.mobile-coaching-content');
                if (targetSection) {
                    // Calculate offset to account for fixed navbar and add padding
                    const navbar = document.querySelector('.navbar');
                    const navbarHeight = navbar ? navbar.offsetHeight : 0;
                    const extraOffset = 0; // Increased padding to prevent undershooting
                    
                    const targetPosition = targetSection.getBoundingClientRect().top + window.pageYOffset - navbarHeight - extraOffset;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            } else {
                // On desktop, scroll to how-it-works section
                const targetSection = document.querySelector('.how-it-works-section');
                if (targetSection) {
                    const navbar = document.querySelector('.navbar');
                    const navbarHeight = navbar ? navbar.offsetHeight : 0;
                    const extraOffset = 0; // Increased padding to prevent undershooting
                    
                    const targetPosition = targetSection.getBoundingClientRect().top + window.pageYOffset - navbarHeight - extraOffset;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    }    // Dropdown menu functionality
    const dropdowns = document.querySelectorAll('.dropdown');
    
    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        const menu = dropdown.querySelector('.dropdown-menu');
        
        if (toggle) {
            // Handle clicks for mobile/touch devices
            toggle.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Toggle this specific dropdown
                dropdown.classList.toggle('active');
                
                // Close other dropdowns
                dropdowns.forEach(otherDropdown => {
                    if (otherDropdown !== dropdown) {
                        otherDropdown.classList.remove('active');
                    }
                });
            });
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    });
    
    // Typewriter effect for team page title
    const teamTitle = document.querySelector('#team-title');
    if (teamTitle) {
        const originalText = teamTitle.textContent;
        teamTitle.textContent = '';
        teamTitle.style.borderRight = '2px solid #00bcd4';
        teamTitle.style.animation = 'blink-cursor 0.8s infinite';
        
        let i = 0;
        const typeInterval = setInterval(() => {
            teamTitle.textContent = originalText.slice(0, i + 1);
            i++;
            
            if (i >= originalText.length) {
                clearInterval(typeInterval);
                // Remove cursor after typing is complete
                setTimeout(() => {
                    teamTitle.style.borderRight = 'none';
                    teamTitle.style.animation = 'none';
                }, 500);
            }
        }, 80); // Slightly slower for team page
    }
    
    // Homepage-specific smooth scrolling for the "Start Now" CTA button
    const isHomepage = document.querySelector('.hero'); // Check if we're on the homepage
    const ctaButton = document.querySelector('.cta-btn[href^="#"]');
    
    if (isHomepage && ctaButton) {
        ctaButton.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                // For homepage, scroll directly to the section with no offset
                const targetPosition = targetSection.getBoundingClientRect().top + window.pageYOffset;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    }
    
    // Smooth scrolling for other navigation links (non-homepage or other pages)
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"], .pricing-details-btn[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                // On homepage, handle About link the same as CTA button (no offset)
                if (isHomepage && targetId === '#about') {
                    const targetPosition = targetSection.getBoundingClientRect().top + window.pageYOffset;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                } else {
                    // Calculate offset for fixed navbar (navbar height + some padding)
                    const navbar = document.querySelector('.navbar');
                    const navbarHeight = navbar ? navbar.offsetHeight : 0;
                    const offset = navbarHeight + 20; // Add 20px extra padding
                    
                    const targetPosition = targetSection.getBoundingClientRect().top + window.pageYOffset - offset;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
    
    // Special handling for "Home" link - scroll to top
    const homeLinks = document.querySelectorAll('.nav-links a[href="#home"]');
    
    homeLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Scroll to the very top of the page
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    });
    
    // Navbar background on scroll with About Us detection
    const navbar = document.querySelector('.navbar');
    const aboutSection = document.querySelector('#about');
    
    window.addEventListener('scroll', function() {
        const scrollY = window.scrollY;
        const aboutSectionTop = aboutSection ? aboutSection.offsetTop : 0;
        const aboutSectionBottom = aboutSection ? aboutSectionTop + aboutSection.offsetHeight : 0;
        
        // Check if we're in the About Us section
        if (scrollY >= aboutSectionTop - 100 && scrollY < aboutSectionBottom - 100) {
            navbar.classList.remove('scrolled');
            navbar.classList.add('gray');
        } else if (scrollY > window.innerHeight * 0.8) {
            navbar.classList.remove('gray');
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled', 'gray');
        }
    });
    
    // Gallery image lazy loading and animation
    const galleryImages = document.querySelectorAll('.gallery-images img');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    });
    
    galleryImages.forEach(img => {
        img.style.opacity = '0';
        img.style.transform = 'translateY(20px)';
        img.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        imageObserver.observe(img);
    });
    
    // Add parallax effect to hero section
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const hero = document.querySelector('.hero');
        if (hero) {
            hero.style.transform = `translateY(${scrolled * 0.5}px)`;
        }
    });
    
    // US Travel Program Experience Selector
    const experiencePaths = document.querySelectorAll('.experience-path');
    const experienceDetails = document.querySelectorAll('.experience-detail');
    
    experiencePaths.forEach(path => {
        path.addEventListener('click', function() {
            const experienceType = this.getAttribute('data-experience');
            
            // Hide all details
            experienceDetails.forEach(detail => {
                detail.classList.remove('active');
            });
            
            // Show selected detail
            const targetDetail = document.getElementById(`${experienceType}-detail`);
            if (targetDetail) {
                targetDetail.classList.add('active');
                
                // Smooth scroll to the detail section
                targetDetail.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
            
            // Add visual feedback to selected path
            experiencePaths.forEach(p => p.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    // Initialize with vacation experience active by default
    const vacationDetail = document.getElementById('vacation-detail');
    if (vacationDetail) {
        vacationDetail.classList.add('active');
    }
    
    // Contact form is handled by contact.js on contact page
    
    // Form error and success message functions
    function showFormError(message) {
        clearFormMessages();
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-message form-error';
        errorDiv.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>${message}</span>
        `;
        
        const form = document.querySelector('.contact-form');
        const submitButton = form.querySelector('.form-submit');
        submitButton.parentNode.insertBefore(errorDiv, submitButton);
        
        // Scroll error message into view
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    function showFormSuccess(message) {
        clearFormMessages();
        
        const successDiv = document.createElement('div');
        successDiv.className = 'form-message form-success';
        successDiv.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>${message}</span>
        `;
        
        const form = document.querySelector('.contact-form');
        const submitButton = form.querySelector('.form-submit');
        submitButton.parentNode.insertBefore(successDiv, submitButton);
        
        // Scroll success message into view
        successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Auto-hide success message after 5 seconds
        setTimeout(() => {
            successDiv.remove();
        }, 5000);
    }
    
    function clearFormMessages() {
        const existingMessages = document.querySelectorAll('.form-message');
        existingMessages.forEach(msg => msg.remove());
    }
    
    function clearFormErrors() {
        clearFormMessages();
        
        // Remove error styling from form fields
        const formGroups = document.querySelectorAll('.form-group');
        formGroups.forEach(group => {
            group.classList.remove('error');
        });
    }
});

// Application form supporter functions
function toggleSupporterDetails() {
    const bringingSupporter = document.getElementById('bringingSupporter');
    const supporterCountGroup = document.getElementById('supporterCountGroup');
    const supporterForms = document.getElementById('supporterForms');
    
    if (bringingSupporter.value === 'yes') {
        supporterCountGroup.style.display = 'block';
        supporterCountGroup.querySelector('select').required = true;
    } else {
        supporterCountGroup.style.display = 'none';
        supporterCountGroup.querySelector('select').required = false;
        supporterForms.innerHTML = '';
    }
}

function generateSupporterForms() {
    const supporterCount = document.getElementById('supporterCount').value;
    const supporterForms = document.getElementById('supporterForms');
    
    // Clear existing forms
    supporterForms.innerHTML = '';
    
    if (supporterCount && parseInt(supporterCount) > 0) {
        for (let i = 1; i <= parseInt(supporterCount); i++) {
            const supporterForm = document.createElement('div');
            supporterForm.className = 'supporter-form-section';
            supporterForm.innerHTML = `
                <div class="form-section-header">
                    <h3>Supporter ${i} Information</h3>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="supporter${i}FirstName">Supporter ${i} First Name *</label>
                        <input type="text" id="supporter${i}FirstName" name="supporter${i}FirstName" required>
                    </div>
                    <div class="form-group">
                        <label for="supporter${i}LastName">Supporter ${i} Last Name *</label>
                        <input type="text" id="supporter${i}LastName" name="supporter${i}LastName" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="supporter${i}DateOfBirth">Supporter ${i} Date of Birth *</label>
                        <input type="date" id="supporter${i}DateOfBirth" name="supporter${i}DateOfBirth" required>
                    </div>
                    <div class="form-group">
                        <label for="supporter${i}Email">Supporter ${i} Email Address *</label>
                        <input type="email" id="supporter${i}Email" name="supporter${i}Email" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="supporter${i}PassportPicture">Supporter ${i} Passport Picture *</label>
                        <div class="file-upload-wrapper" onclick="document.getElementById('supporter${i}PassportPicture').click()">
                            <span class="file-upload-text">Click to upload</span>
                        </div>
                        <input type="file" id="supporter${i}PassportPicture" name="supporter${i}PassportPicture" accept="image/*" required onchange="updateFileUploadText(this)">
                    </div>
                    <div class="form-group">
                        <label for="supporter${i}PassportNumber">Supporter ${i} Passport Number *</label>
                        <input type="text" id="supporter${i}PassportNumber" name="supporter${i}PassportNumber" required>
                    </div>
                </div>
            `;
            supporterForms.appendChild(supporterForm);
        }
    }
}

// File upload text update function
function updateFileUploadText(input) {
    const wrapper = input.previousElementSibling;
    const textSpan = wrapper.querySelector('.file-upload-text');
    
    if (input.files && input.files[0]) {
        textSpan.textContent = input.files[0].name;
        wrapper.classList.add('has-file');
    } else {
        textSpan.textContent = 'Click to upload';
        wrapper.classList.remove('has-file');
    }
}

// Track reservation cost calculation function
function calculateTotalCost() {
    const numberOfRiders = document.getElementById('numberOfRiders');
    const totalCostDisplay = document.getElementById('totalCost');
    
    if (numberOfRiders && totalCostDisplay) {
        const riderCount = parseInt(numberOfRiders.value);
        
        if (riderCount && riderCount >= 10 && riderCount <= 20) {
            const costPerRider = 450; // AUD per rider for 3 hours
            const totalCost = riderCount * costPerRider;
            totalCostDisplay.textContent = `$${totalCost.toLocaleString()} AUD`;
            totalCostDisplay.classList.add('calculated');
        } else {
            totalCostDisplay.textContent = 'Select number of riders to calculate';
            totalCostDisplay.classList.remove('calculated');
        }
    }
}

// Testimonial Slideshow Functions
function showTestimonial(index) {
    testimonialCards.forEach((card, i) => {
        card.classList.toggle('active', i === index);
    });
    
    testimonialDots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function nextTestimonial() {
    currentTestimonialIndex = (currentTestimonialIndex + 1) % testimonialCards.length;
    showTestimonial(currentTestimonialIndex);
}

function goToTestimonial(index) {
    currentTestimonialIndex = index;
    showTestimonial(currentTestimonialIndex);
}

function startTestimonialAutoplay() {
    testimonialInterval = setInterval(nextTestimonial, 8000); // Change every 8 seconds
}

function stopTestimonialAutoplay() {
    clearInterval(testimonialInterval);
}

// Initialize testimonial slideshow if elements exist
if (testimonialCards.length > 0) {
    showTestimonial(0);
    startTestimonialAutoplay();
    
    // Dot navigation
    testimonialDots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            stopTestimonialAutoplay();
            goToTestimonial(index);
            startTestimonialAutoplay();
        });
    });
    
    // Pause autoplay on hover
    const slider = document.querySelector('.testimonials-slider');
    if (slider) {
        slider.addEventListener('mouseenter', stopTestimonialAutoplay);
        slider.addEventListener('mouseleave', startTestimonialAutoplay);
    }
}
