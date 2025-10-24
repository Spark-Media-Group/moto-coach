import Head from 'next/head';
import Script from 'next/script';
import { loadLegacyPage } from '../lib/loadLegacyPage';

export async function getStaticProps() {
  const { body } = await loadLegacyPage('index.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function Home({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Sydney Moto Coach - Premier Motocross Training &amp; Travel Adventures | Sydney, Australia</title>
        <meta
          name="description"
          content="Expert motocross coaching, professional dirt bike training programs, and exciting travel adventures across Australia and the US. Based in Sydney, offering track reserve, motocross camps, and personalized coaching sessions."
        />
        <meta
          name="keywords"
          content="motocross coaching, dirt bike training, Sydney motocross school, professional motocross coaching, track reserve, Australia motocross travel program, US motocross travel program, motocross adventures, dirt bike coaching, Sydney Australia"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/" />
        <meta
          property="og:title"
          content="Sydney Moto Coach - Premier Motocross Training &amp; Travel Adventures"
        />
        <meta
          property="og:description"
          content="Expert motocross coaching, professional dirt bike training programs, and exciting travel adventures across Australia and the US. Based in Sydney."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="og:site_name" content="Moto Coach" />
        <meta property="og:locale" content="en_AU" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/" />
        <meta
          property="twitter:title"
          content="Sydney Moto Coach - Premier Motocross Training &amp; Travel Adventures"
        />
        <meta
          property="twitter:description"
          content="Expert motocross coaching, professional dirt bike training programs, and exciting travel adventures across Australia and the US."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://motocoach.com.au https://img.redbull.com https://cdn.vercel-insights.com; connect-src 'self' https://*.vercel-insights.com https://*.vercel-analytics.com https://va.vercel-scripts.com https://cdn.vercel-insights.com; font-src 'self' https://fonts.gstatic.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;"
        />
        <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script src="/scripts/index.js" strategy="afterInteractive" />
    </>
  );
}
