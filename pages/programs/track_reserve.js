import Head from 'next/head';
import Script from 'next/script';
import { loadLegacyPage } from '../../lib/loadLegacyPage';

export async function getStaticProps() {
  const { body } = await loadLegacyPage('programs/track_reserve.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function TrackReserve({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Track Reservation - Book Your Motocross Training Session | Moto Coach Sydney</title>
        <meta
          name="description"
          content="Reserve your motocross training session at premium tracks with Moto Coach. Book track time, dirt bike coaching sessions, and skill development programs in Sydney and across Australia."
        />
        <meta
          name="keywords"
          content="track reservation, motocross track booking, training session booking, track time Sydney, motocross coaching booking, track reserve Australia, professional dirt bike training, Sydney motocross tracks"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/programs/track_reserve" />
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live js.stripe.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data: https://cdn.vercel-insights.com; connect-src 'self' https://va.vercel-scripts.com https://cdn.vercel-insights.com api.stripe.com; font-src 'self' fonts.gstatic.com; frame-src js.stripe.com; object-src 'none'; base-uri 'self';" />
        <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/programs/track_reserve" />
        <meta property="og:title" content="Track Reservation - Book Your Motocross Training Session" />
        <meta
          property="og:description"
          content="Reserve your motocross training session at premium tracks with Moto Coach. Book track time and dirt bike coaching sessions in Sydney."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="og:site_name" content="Moto Coach" />
        <meta property="og:locale" content="en_AU" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/programs/track_reserve" />
        <meta property="twitter:title" content="Track Reservation - Book Your Motocross Training Session" />
        <meta
          property="twitter:description"
          content="Reserve your motocross training session at premium tracks with Moto Coach."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
      </Head>
      <div className="apply-page" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script src="/scripts/calendar.js" strategy="afterInteractive" />
      <Script type="module" src="/scripts/track_reserve.js" strategy="afterInteractive" />
    </>
  );
}
