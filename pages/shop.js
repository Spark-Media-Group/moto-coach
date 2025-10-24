import Head from 'next/head';
import Script from 'next/script';
import { loadLegacyPage } from '../lib/loadLegacyPage';

export async function getStaticProps() {
  const { body } = await loadLegacyPage('shop.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function Shop({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Shop - Moto Coach Gear &amp; Equipment | Sydney, Australia</title>
        <meta
          name="description"
          content="Browse our selection of premium motocross gear, dirt bike training equipment, and Moto Coach branded merchandise. Quality products for serious riders and training enthusiasts in Sydney and across Australia."
        />
        <meta
          name="keywords"
          content="motocross gear, dirt bike equipment, moto coach merchandise, motocross accessories, riding gear, Sydney motocross shop, premium dirt bike equipment, motocross apparel"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/shop" />
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data: cdn.shopify.com *.shopifycdn.com https://cdn.vercel-insights.com https://files.cdn.printful.com https://img.printful.com https://images.printful.com https://printful.s3.amazonaws.com; connect-src 'self' https://va.vercel-scripts.com https://cdn.vercel-insights.com; font-src 'self' fonts.gstatic.com; object-src 'none'; base-uri 'self';" />
        <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/shop" />
        <meta property="og:title" content="Shop - Moto Coach Gear &amp; Equipment" />
        <meta
          property="og:description"
          content="Browse our selection of premium motocross gear, dirt bike training equipment, and Moto Coach branded merchandise. Quality products for serious riders."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="og:site_name" content="Moto Coach" />
        <meta property="og:locale" content="en_AU" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/shop" />
        <meta property="twitter:title" content="Shop - Moto Coach Gear &amp; Equipment" />
        <meta
          property="twitter:description"
          content="Browse our selection of premium motocross gear, dirt bike training equipment, and Moto Coach branded merchandise."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script src="/scripts/shop.js" strategy="afterInteractive" />
    </>
  );
}
