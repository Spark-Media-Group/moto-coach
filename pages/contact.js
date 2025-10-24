import Head from 'next/head';
import Script from 'next/script';
import { loadLegacyPage } from '../lib/loadLegacyPage';

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Moto Coach',
  image: 'https://motocoach.com.au/images/long-logo.png',
  url: 'https://motocoach.com.au/',
  telephone: '+61 423 626 601',
  email: 'leigh@motocoach.com.au',
  priceRange: '$150-$190',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Sydney',
    addressRegion: 'NSW',
    postalCode: '2000',
    addressCountry: 'AU'
  },
  areaServed: [
    { '@type': 'AdministrativeArea', name: 'Sydney NSW' },
    { '@type': 'Country', name: 'Australia' }
  ],
  sameAs: [
    'https://www.instagram.com/sydneymotocoach/',
    'https://www.facebook.com/TheMotocoach/'
  ]
};

export async function getStaticProps() {
  const { body } = await loadLegacyPage('contact.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function Contact({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Contact Us - Moto Coach | Professional Motocross Training Sydney Australia</title>
        <meta
          name="description"
          content="Get in touch with Moto Coach for professional motocross training, coaching certification, and travel programs. Based in Sydney, Australia. Call +61 423 626 601 or email leigh@motocoach.com.au"
        />
        <meta
          name="keywords"
          content="motocross coaching contact, moto coach Sydney, motocross training Australia, professional coaching contact, dirt bike training contact"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/contact" />
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.jsdelivr.net https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data: https://cdn.vercel-insights.com; connect-src 'self' https://va.vercel-scripts.com https://cdn.vercel-insights.com; font-src 'self' fonts.gstatic.com; frame-src 'none'; object-src 'none'; base-uri 'self';" />
        <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/contact" />
        <meta property="og:title" content="Contact Us - Moto Coach | Professional Motocross Training" />
        <meta
          property="og:description"
          content="Get in touch with Moto Coach for professional motocross training, coaching certification, and travel programs. Based in Sydney, Australia."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/contact" />
        <meta property="twitter:title" content="Contact Us - Moto Coach | Professional Motocross Training" />
        <meta
          property="twitter:description"
          content="Get in touch with Moto Coach for professional motocross training, coaching certification, and travel programs. Based in Sydney, Australia."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script type="module" src="/scripts/contact.js" strategy="afterInteractive" />
    </>
  );
}
