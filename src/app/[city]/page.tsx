import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getCityMeta, getAllCitySlugs, CITIES } from '@/lib/cities';
import { getShowsByCity, getVenuesByCity } from '@/lib/queries';
import ShowGrid from '@/app/components/ShowGrid';

export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  return getAllCitySlugs().map((city) => ({ city }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  const meta = getCityMeta(city);
  if (!meta) return {};
  const title = `${meta.name} Live Music | Showpaper`;
  const description = `Upcoming live shows in ${meta.name}, ${meta.state} — tickets, times, and artist previews. Updated daily from local venues.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: 'Showpaper', type: 'website' },
    twitter: { card: 'summary', title, description },
    alternates: { canonical: `/${city}` },
  };
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ venue?: string }>;
}) {
  const { city } = await params;
  const { venue } = await searchParams;
  const meta = getCityMeta(city);
  if (!meta) notFound();

  const [shows, venues] = await Promise.all([
    getShowsByCity(meta.name, venue),
    getVenuesByCity(meta.name),
  ]);

  const otherCities = Object.values(CITIES).filter((c) => c.slug !== city);

  // JSON-LD: ItemList of events
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Live Music in ${meta.name}, ${meta.state}`,
    description: meta.description,
    url: `https://showpaper.co/${city}`,
    numberOfItems: shows.length,
    itemListElement: shows.slice(0, 20).map((show, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: show.artists[0]?.name ?? 'Live Show',
        startDate: show.show_time ? `${show.date}T${show.show_time}` : show.date,
        location: {
          '@type': 'Place',
          name: show.venue_name,
          address: { '@type': 'PostalAddress', addressLocality: meta.name, addressRegion: meta.state },
        },
        url: `https://showpaper.co/shows/${show.id}`,
      },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* City header */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', margin: '0 0 2px', color: '#222' }}>
          {meta.name} Live Music
        </h1>
        <div style={{ fontSize: 12, color: '#888' }}>
          showpaper &rsaquo; {meta.name.toLowerCase()}
          <span style={{ marginLeft: 10 }}>
            {otherCities.map((c, i) => (
              <span key={c.slug}>
                {i > 0 && <span style={{ color: '#ddd', margin: '0 4px' }}>·</span>}
                <Link href={`/${c.slug}`} style={{ color: '#888' }}>{c.shortName}</Link>
              </span>
            ))}
          </span>
        </div>
      </div>

      <ShowGrid shows={shows} venues={venues} venueFilter={venue} />
    </>
  );
}
