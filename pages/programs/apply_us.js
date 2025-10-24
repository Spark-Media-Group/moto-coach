import Head from 'next/head';
import Script from 'next/script';
import { loadLegacyPage } from '../../lib/loadLegacyPage';

export async function getStaticProps() {
  const { body } = await loadLegacyPage('programs/apply_us.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function ApplyUsProgram({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Inquire About the US Travel Program - Join American Motocross Adventure | Moto Coach</title>
        <meta
          name="description"
          content="Inquire about Moto Coach's exclusive US Travel Program. Join our American motocross adventure tour with expert guides from Sydney. Limited spots available for this premium experience."
        />
        <meta
          name="keywords"
          content="inquire US travel program, American motocross tour inquiry, US motocross adventure booking, international motocross tour inquiry, premium dirt bike experience, Sydney to USA tour inquiry"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/programs/apply_us" />
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data: https://cdn.vercel-insights.com; connect-src 'self' https://va.vercel-scripts.com https://cdn.vercel-insights.com; font-src 'self' fonts.gstatic.com; frame-src 'none'; object-src 'none'; base-uri 'self';" />
        <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/programs/apply_us" />
        <meta property="og:title" content="Inquire About the US Travel Program - Join American Motocross Adventure" />
        <meta
          property="og:description"
          content="Inquire about Moto Coach's exclusive US Travel Program. Join our American motocross adventure tour with expert guides from Sydney."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="og:site_name" content="Moto Coach" />
        <meta property="og:locale" content="en_AU" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/programs/apply_us" />
        <meta property="twitter:title" content="Inquire About the US Travel Program - Join American Motocross Adventure" />
        <meta
          property="twitter:description"
          content="Inquire about Moto Coach's exclusive US Travel Program. Limited spots available for this premium motocross experience."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
      </Head>
      <div className="apply-page" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script type="module" src="/scripts/apply_us.js" strategy="afterInteractive" />
    </>
  );
}
