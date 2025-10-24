import Head from 'next/head';
import Script from 'next/script';
import { loadLegacyPage } from '../lib/loadLegacyPage';

export async function getStaticProps() {
  const { body } = await loadLegacyPage('checkout.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function Checkout({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Moto Coach Checkout</title>
        <meta
          name="description"
          content="Secure your Moto Coach gear with Stripe payments and automatic Shopify order creation."
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/checkout" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script type="module" src="/scripts/checkout.js" strategy="afterInteractive" />
    </>
  );
}
