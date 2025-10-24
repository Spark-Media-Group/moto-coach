import Head from 'next/head';

const teamBodyHtml = `
  <header class="main-header universal-header">
    <nav class="navbar">
      <div class="logo">
        <a href="/">
          <img src="/images/long-logo.png" alt="Moto Coach" class="logo-img">
        </a>
      </div>
      <div class="nav-right">
        <ul class="nav-links">
          <li><a href="/">Home</a></li>
          <li class="dropdown">
            <span class="dropdown-toggle">Programs</span>
            <ul class="dropdown-menu">
              <li><a href="/programs/professional_coaching">Professional Coaching</a></li>
              <li><a href="/programs/us_travel_program">US Training Camp</a></li>
              <li><a href="/programs/australia_travel_program">Aussie Moto Vacations</a></li>
            </ul>
          </li>
          <li><a href="/#about">About</a></li>
          <li><a href="/calendar">Register</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
        <div class="social-icons">
          <a href="https://www.instagram.com/sydneymotocoach/" target="_blank" class="social-icon" rel="noreferrer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"></path>
            </svg>
          </a>
          <a href="https://www.facebook.com/TheMotocoach/" target="_blank" class="social-icon" rel="noreferrer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"></path>
            </svg>
          </a>
        </div>
        <button class="mobile-menu-toggle" aria-label="Toggle menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </nav>
  </header>
  <section class="team-title-section">
    <div class="team-title-content">
      <h1 id="team-title">The Moto Coach Team</h1>
      <p>Experienced coaching and support staff helping riders perform in Australia and abroad.</p>
    </div>
  </section>
  <section class="team-hero">
    <div class="team-hero-content">
      <p>Moto Coach is led by Level 2 Motorcycling Australia Master Coach Leigh Gainfort. Our programs blend decades of racing experience, evidence-based training methods, and a passion for helping riders progress safely and confidently.</p>
      <p>From one-on-one coaching in Sydney to international development camps in the United States, the team delivers personalised feedback, structured programs, and trackside support built for ambitious riders.</p>
    </div>
  </section>
  <section class="team-section">
    <div class="team-container">
      <article class="team-member">
        <div class="team-image">
          <img src="/images/coaching 6.jpg" alt="Leigh Gainfort coaching a motocross rider">
        </div>
        <div class="team-info">
          <h2>Leigh Gainfort</h2>
          <h3>Founder &amp; Head Coach</h3>
          <p>Level 2 MA Master Coach, former Motorcycling NSW Team Coach (2019, 2022, 2024), and multi-time champion in New Zealand and Australian events.</p>
          <p>Leigh specialises in developing riders of every age and discipline, focusing on fundamentals, mindset, race craft, and high-performance preparation.</p>
        </div>
      </article>
      <article class="team-member">
        <div class="team-image">
          <img src="/images/coaching 5.jpg" alt="Moto Coach trackside support crew">
        </div>
        <div class="team-info">
          <h2>Trackside Support Crew</h2>
          <h3>Event &amp; Camp Operations</h3>
          <p>Experienced mechanics, coaches, and logistics staff who keep Moto Coach programs running smoothly from local track reserves to US training camps.</p>
          <p>They help riders with bike setup, scheduling, nutrition, and daily preparation so the focus stays on performance and skill progression.</p>
        </div>
      </article>
    </div>
  </section>
  <section class="team-section">
    <div class="team-container">
      <div class="team-cta">
        <h2>Ride with the Team</h2>
        <p>Ready to elevate your riding? Join Moto Coach for private coaching, group schools, or our international travel programs.</p>
        <a class="cta-btn btn-primary" href="/contact">Book a Session</a>
      </div>
    </div>
  </section>
`;

export default function Team() {
  return (
    <>
      <Head>
        <title>Meet the Moto Coach Team | Professional Motocross Coaching</title>
        <meta
          name="description"
          content="Meet the Moto Coach team led by Level 2 MA Master Coach Leigh Gainfort. Discover the experience, coaching philosophy, and support crew powering our motocross programs in Australia and the US."
        />
        <link rel="canonical" href="https://motocoach.com.au/team" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/team" />
        <meta property="og:title" content="Meet the Moto Coach Team" />
        <meta
          property="og:description"
          content="Learn about the Moto Coach staff delivering professional motocross coaching, travel camps, and trackside support."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/team" />
        <meta property="twitter:title" content="Meet the Moto Coach Team" />
        <meta
          property="twitter:description"
          content="Get to know the people guiding Moto Coach riders in Australia and the United States."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: teamBodyHtml }} />
    </>
  );
}
