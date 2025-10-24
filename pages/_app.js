import Head from 'next/head';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';

import '../styles/main.css';
import '../styles/index.css';
import '../styles/contact.css';
import '../styles/shop.css';
import '../styles/calendar.css';
import '../styles/checkout.css';
import '../styles/coaching.css';
import '../styles/australia.css';
import '../styles/us.css';
import '../styles/track_reserve.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
      <Script src="/scripts/main.js" strategy="afterInteractive" />
      <Script src="/scripts/analytics.js" strategy="afterInteractive" />
      <Analytics />
    </>
  );
}
