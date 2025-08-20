// Kazzaz Motor Co. - Enhanced Homepage JavaScript

// Slideshow variables
let currentSlideIndex = 0;
const slides = document.querySelectorAll('.slide');
let slideInterval;

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

document.addEventListener('DOMContentLoaded', function() {
    console.log('Welcome to Moto Coach.');
    
    // Initialize slideshow if slides exist
    if (slides.length > 0) {
        showSlide(0); // Show first slide
        startSlideshow(); // Start auto-advance
    }
    
    // Dropdown menu functionality
    const dropdowns = document.querySelectorAll('.dropdown');
    
    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        const menu = dropdown.querySelector('.dropdown-menu');
        
        // Handle clicks for mobile/touch devices
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Close other dropdowns
            dropdowns.forEach(otherDropdown => {
                if (otherDropdown !== dropdown) {
                    otherDropdown.classList.remove('active');
                }
            });
            
            // Toggle current dropdown
            dropdown.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    });
    
    // Load header for non-home pages
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        fetch('includes/header.html')
            .then(response => response.text())
            .then(data => {
                headerPlaceholder.innerHTML = data;
            })
            .catch(error => console.error('Error loading header:', error));
    }
    
    
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
    
    // Smooth scrolling for navigation links and CTA button
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"], .cta-btn[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth'
                });
            }
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
});
