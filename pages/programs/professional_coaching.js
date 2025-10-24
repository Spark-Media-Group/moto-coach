import Head from 'next/head';
import { loadLegacyPage } from '../../lib/loadLegacyPage';

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What does the weekly after school program include?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Moto Coach operates weekly coaching at Penrith Mini Bike Club, Dargle, and Appin with both small group and private options for up to 12 riders per session.'
      }
    },
    {
      '@type': 'Question',
      name: 'How does the small group coaching at Appin work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Riders are grouped by bike size and ability for two-hour Fast 50 track sessions, capped at six riders with track entry and public track access included.'
      }
    },
    {
      '@type': 'Question',
      name: 'What support is available beyond coaching sessions?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Moto Coach offers Motorcycling NSW Kickstarts, one-on-one training, loan gear, and insurance-backed permits with flexible Afterpay booking.'
      }
    }
  ]
};

export async function getStaticProps() {
  const { body } = await loadLegacyPage('programs/professional_coaching.html');

  return {
    props: {
      bodyHtml: body
    }
  };
}

export default function ProfessionalCoaching({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Professional Coaching - Expert Motocross Training | Moto Coach Sydney</title>
        <meta
          name="description"
          content="Professional one-on-one motocross coaching with expert instructors. Personalized dirt bike training sessions, track coaching, and skill development programs in Sydney. Improve your riding technique with Moto Coach."
        />
        <meta
          name="keywords"
          content="professional motocross coaching, one-on-one dirt bike training, motocross instructor Sydney, track coaching, riding technique, personalized training, motocross skills development, expert coaching Sydney"
        />
        <meta name="author" content="Moto Coach" />
        <link rel="canonical" href="https://motocoach.com.au/programs/professional_coaching" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://motocoach.com.au/programs/professional_coaching" />
        <meta property="og:title" content="Professional Coaching - Expert Motocross Training" />
        <meta
          property="og:description"
          content="Professional one-on-one motocross coaching with expert instructors. Personalized dirt bike training sessions and skill development programs in Sydney."
        />
        <meta property="og:image" content="https://motocoach.com.au/images/long-logo.png" />
        <meta property="og:site_name" content="Moto Coach" />
        <meta property="og:locale" content="en_AU" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://motocoach.com.au/programs/professional_coaching" />
        <meta property="twitter:title" content="Professional Coaching - Expert Motocross Training" />
        <meta
          property="twitter:description"
          content="Professional one-on-one motocross coaching with expert instructors. Personalized dirt bike training sessions in Sydney."
        />
        <meta property="twitter:image" content="https://motocoach.com.au/images/long-logo.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
        />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </>
  );
}
