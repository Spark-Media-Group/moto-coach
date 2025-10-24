import Head from 'next/head';
import { loadLegacyPage } from '../../lib/loadLegacyPage';

export async function getStaticProps() {
  const { body } = await loadLegacyPage('programs/australia_travel_program.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function AustraliaTravelProgram({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Aussie Moto Vacations - Adventure Motocross Tours | Moto Coach</title>
        <meta
          name="description"
          content="Epic motocross adventures through Australia's outback. Guided dirt bike tours, scenic routes, and unforgettable experiences across the Australian landscape with Moto Coach Sydney's expert guides."
        />
        <meta
          name="keywords"
          content="Australia motocross tours, outback adventure, dirt bike travel program, guided tours Australia, adventure riding, scenic motocross routes, Australian outback tours, motocross experiences Sydney"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/programs/australia_travel_program" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/programs/australia_travel_program" />
        <meta property="og:title" content="Aussie Moto Vacations - Adventure Motocross Tours" />
        <meta
          property="og:description"
          content="Epic motocross adventures through Australia's outback. Guided dirt bike tours, scenic routes, and unforgettable experiences with expert guides."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="og:site_name" content="Moto Coach" />
        <meta property="og:locale" content="en_AU" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/programs/australia_travel_program" />
        <meta property="twitter:title" content="Aussie Moto Vacations - Adventure Motocross Tours" />
        <meta
          property="twitter:description"
          content="Epic motocross adventures through Australia's outback. Guided dirt bike tours and unforgettable experiences."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </>
  );
}
