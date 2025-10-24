import Head from 'next/head';
import Script from 'next/script';
import { loadLegacyPage } from '../lib/loadLegacyPage';

export async function getStaticProps() {
  const { body } = await loadLegacyPage('calendar.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function Calendar({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Schedule - Moto Coach Training Calendar | Sydney, Australia</title>
        <meta
          name="description"
          content="View our upcoming motocross coaching sessions, track reserve dates, travel programs, and training events. Book your spot with Moto Coach Sydney's premier dirt bike coaching team."
        />
        <meta
          name="keywords"
          content="motocross schedule, training calendar, track reserve dates, coaching sessions, Sydney motocross events, booking calendar, professional motocross coaching schedule, Australia travel program dates"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/calendar" />
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data: https://cdn.vercel-insights.com; connect-src 'self' https://www.googleapis.com https://*.vercel.app https://motocoach.com.au https://sydneymotocoach.com https://va.vercel-scripts.com https://cdn.vercel-insights.com;" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/calendar" />
        <meta property="og:title" content="Schedule - Moto Coach Training Calendar" />
        <meta
          property="og:description"
          content="View our upcoming motocross coaching sessions, track reserve dates, and travel programs. Book your spot with Sydney's premier dirt bike coaching team."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="og:site_name" content="Moto Coach" />
        <meta property="og:locale" content="en_AU" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/calendar" />
        <meta property="twitter:title" content="Schedule - Moto Coach Training Calendar" />
        <meta
          property="twitter:description"
          content="View our upcoming motocross coaching sessions, track reserve dates, and travel programs."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
      </Head>
      <div className="calendar-page" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script src="/scripts/calendar.js" strategy="afterInteractive" />
    </>
  );
}
