import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getCityMeta, getAllCitySlugs, CITIES,
  computeDateRange, fmtMonthLabel, prevMonth, nextMonth, currentMonth,
  type Period,
} from '@/lib/cities';
import { getShowsByCity, getVenuesByCity } from '@/lib/queries';
import ShowGrid from '@/app/components/ShowGrid';
import MiniPlayer, { type PlaylistItem } from '@/app/components/MiniPlayer';

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
  searchParams: Promise<{ venue?: string; period?: string; month?: string }>;
}) {
  const { city } = await params;
  const { venue, period: rawPeriod, month: rawMonth } = await searchParams;
  const meta = getCityMeta(city);
  if (!meta) notFound();

  const period = (rawPeriod as Period) || null;
  // month navigation only shown when no period filter
  const month = !period && rawMonth ? rawMonth : (!period ? null : null);
  const dateRange = computeDateRange(period, month);
  const activeMonth = month ?? currentMonth();

  const [shows, venues] = await Promise.all([
    getShowsByCity(meta.name, venue, dateRange?.from, dateRange?.to),
    getVenuesByCity(meta.name),
  ]);

  // Build artist browser playlist — one entry per unique artist with a Spotify ID
  const seenArtists = new Set<number>();
  const playlist: PlaylistItem[] = shows
    .flatMap((show) =>
      show.artists.map((a) => ({ show, artist: a }))
    )
    .filter(({ artist }) => {
      if (seenArtists.has(artist.id)) return false;
      seenArtists.add(artist.id);
      return true;
    })
    .map(({ show, artist }) => ({
      artistId: artist.id,
      artistName: artist.name,
      artistSlug: artist.slug,
      artistPhoto: artist.photo_url,
      spotifyId: artist.spotify_id,
      showDate: show.date,
      venueName: show.venue_name,
      showId: show.id,
      showSlug: show.slug,
    }));

  const otherCities = Object.values(CITIES).filter((c) => c.slug !== city);
  const isFiltered = !!period || !!month;

  // Period pill builder — preserves ?venue= when switching periods
  const periodUrl = (p: Period | null) => {
    const params = new URLSearchParams();
    if (venue) params.set('venue', venue);
    if (p && p !== 'all') params.set('period', p);
    const q = params.toString();
    return `/${city}${q ? '?' + q : ''}`;
  };
  const monthUrl = (m: string) => {
    const params = new URLSearchParams();
    if (venue) params.set('venue', venue);
    params.set('month', m);
    return `/${city}?${params.toString()}`;
  };

  const pills: { label: string; value: Period | null }[] = [
    { label: 'All', value: null },
    { label: 'Today', value: 'today' },
    { label: 'Weekend', value: 'weekend' },
    { label: 'This Week', value: 'week' },
    { label: 'Next Week', value: 'next-week' },
    { label: '30 Days', value: 'month' },
  ];

  const filterBar = (
    <div style={{ marginBottom: 10 }}>
      {/* Period pills */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {pills.map(({ label, value }) => {
          const isActive = period === value || (!period && !month && value === null);
          return (
            <Link key={label} href={periodUrl(value)}
              style={{
                padding: '3px 10px', fontSize: 12, textDecoration: 'none', borderRadius: 12,
                background: isActive ? '#551A8B' : '#f0f0f0',
                color: isActive ? '#fff' : '#555',
                border: isActive ? '1px solid #551A8B' : '1px solid #ddd',
              }}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Month navigation (visible when no period filter) */}
      {!period && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <Link href={monthUrl(prevMonth(activeMonth))} style={{ color: '#551A8B', textDecoration: 'none', padding: '2px 8px', border: '1px solid #ddd', borderRadius: 3 }}>
            ‹
          </Link>
          <span style={{ fontWeight: 'bold', color: month ? '#551A8B' : '#888', minWidth: 80, textAlign: 'center' }}>
            {fmtMonthLabel(activeMonth + '-01')}
          </span>
          <Link href={monthUrl(nextMonth(activeMonth))} style={{ color: '#551A8B', textDecoration: 'none', padding: '2px 8px', border: '1px solid #ddd', borderRadius: 3 }}>
            ›
          </Link>
          {month && (
            <Link href={periodUrl(null)} style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>all upcoming</Link>
          )}
        </div>
      )}
    </div>
  );

  // JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Live Music in ${meta.name}, ${meta.state}`,
    description: meta.description,
    url: `https://showpaper.co/${city}`,
    numberOfItems: shows.length,
    itemListElement: shows.slice(0, 20).map((show, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: {
        '@type': 'Event',
        name: show.artists[0]?.name ?? 'Live Show',
        startDate: show.show_time ? `${show.date}T${show.show_time}` : show.date,
        location: { '@type': 'Place', name: show.venue_name, address: { '@type': 'PostalAddress', addressLocality: meta.name, addressRegion: meta.state } },
        url: `https://showpaper.co/shows/${show.id}`,
      },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* City header */}
      <div style={{ marginBottom: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', margin: '0 0 2px', color: '#222' }}>
          {meta.name} Live Music
        </h1>
        <div style={{ fontSize: 12, color: '#888' }}>
          <Link href="/">showpaper</Link> › {meta.name.toLowerCase()}
          {isFiltered && (
            <span style={{ marginLeft: 8, color: '#aaa' }}>
              · {period ? period.replace('-', ' ') : fmtMonthLabel(activeMonth + '-01')}
              <Link href={`/${city}${venue ? '?venue=' + venue : ''}`} style={{ marginLeft: 6, fontSize: 11 }}>clear</Link>
            </span>
          )}
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

      <ShowGrid
        shows={shows}
        venues={venues}
        venueFilter={venue}
        groupByDate={true}
        filterBar={filterBar}
      />

      {/* Floating preview jukebox — no auth required */}
      <MiniPlayer playlist={playlist} />
    </>
  );
}
