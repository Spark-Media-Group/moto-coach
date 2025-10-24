import Head from 'next/head';
import Script from 'next/script';
import { loadLegacyPage } from '../../lib/loadLegacyPage';

export async function getStaticProps() {
  const { body } = await loadLegacyPage('programs/us_travel_program.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function UsTravelProgram({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>US Training Camp - American Motocross Adventures | Moto Coach</title>
        <meta
          name="description"
          content="Experience the ultimate American motocross adventure with Moto Coach. Guided dirt bike tours across the US, professional training, and unforgettable riding experiences from Sydney-based motocross experts."
        />
        <meta
          name="keywords"
          content="US motocross tours, American motocross adventure, USA travel program, international motocross tours, motocross training USA, guided dirt bike tours America, adventure riding USA, Sydney to USA motocross"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/programs/us_travel_program" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/programs/us_travel_program" />
        <meta property="og:title" content="US Training Camp - American Motocross Adventures" />
        <meta
          property="og:description"
          content="Experience the ultimate American motocross adventure with Moto Coach. Guided dirt bike tours across the US and professional training."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="og:site_name" content="Moto Coach" />
        <meta property="og:locale" content="en_AU" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/programs/us_travel_program" />
        <meta property="twitter:title" content="US Training Camp - American Motocross Adventures" />
        <meta
          property="twitter:description"
          content="Experience the ultimate American motocross adventure with Moto Coach. Guided dirt bike tours and training."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script src="/scripts/us_travel.js" strategy="afterInteractive" />
    </>
  );
}
