import { getDb } from '@/lib/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fmt12, fmtDateLong, formatPrice } from '@/lib/cities';

export const dynamic = 'force-dynamic';

async function getShow(slug: string) {
  const db = await getDb();
  // Support both clean slugs and legacy numeric IDs
  const isNumeric = /^\d+$/.test(slug);
  const showResult = await db.execute({
    sql: `SELECT s.*, v.id as venue_id, v.name as venue_name, v.address as venue_address,
                 v.website as venue_website, v.city as venue_city
          FROM shows s JOIN venues v ON s.venue_id = v.id WHERE ${isNumeric ? 's.id' : 's.slug'} = ?`,
    args: [isNumeric ? Number(slug) : slug],
  });
  if (!showResult.rows.length) return null;

  const r = showResult.rows[0];
  const artistsResult = await db.execute({
    sql: `SELECT a.id, a.name, a.photo_url, a.preview_url, a.spotify_id, a.bandcamp_url, sa.sort_order
          FROM show_artists sa JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id = ? ORDER BY sa.sort_order ASC`,
    args: [r['id']],  // use actual show ID (slug lookup may differ from param)
  });

  return {
    id: Number(r['id']),
    date: String(r['date']),
    doors_time: r['doors_time'] ? String(r['doors_time']) : null,
    show_time: r['show_time'] ? String(r['show_time']) : null,
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    venue_id: Number(r['venue_id']),
    venue_name: String(r['venue_name']),
    venue_address: r['venue_address'] ? String(r['venue_address']) : null,
    venue_website: r['venue_website'] ? String(r['venue_website']) : null,
    venue_city: String(r['venue_city']),
    artists: artistsResult.rows.map((a) => ({
      id: Number(a['id']),
      name: String(a['name']),
      photo_url: a['photo_url'] ? String(a['photo_url']) : null,
      preview_url: a['preview_url'] ? String(a['preview_url']) : null,
      spotify_id: a['spotify_id'] ? String(a['spotify_id']) : null,
      bandcamp_url: a['bandcamp_url'] ? String(a['bandcamp_url']) : null,
    })),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const show = await getShow(id);
  if (!show) return {};

  const artistNames = show.artists.map((a) => a.name).join(', ') || 'Live Show';
  const priceLabel = formatPrice(show.price_min, show.price_max);
  const dateStr = fmtDateLong(show.date);
  const timeStr = show.show_time ? ` at ${fmt12(show.show_time)}` : '';
  const title = `${artistNames} at ${show.venue_name} — ${dateStr} | Showpaper`;
  const description = `${artistNames} live at ${show.venue_name} in ${show.venue_city} on ${dateStr}${timeStr}. ${priceLabel !== 'free' ? `Tickets from ${priceLabel}.` : 'Free admission.'} Get tickets and music previews on Showpaper.`;
  const ogImage = show.artists[0]?.photo_url;

  return {
    title,
    description,
    openGraph: {
      title, description, siteName: 'Showpaper', type: 'website',
      ...(ogImage && { images: [{ url: ogImage, alt: artistNames }] }),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title, description,
      ...(ogImage && { images: [ogImage] }),
    },
    alternates: { canonical: `/shows/${id}` },
  };
}

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await getShow(id);
  if (!show) notFound();

  const mapsQuery = encodeURIComponent(show.venue_address ? `${show.venue_name}, ${show.venue_address}` : show.venue_name);
  const priceLabel = formatPrice(show.price_min, show.price_max);
  const citySlug = show.venue_city.toLowerCase().replace(/\s+/g, '-');

  // JSON-LD Event schema for Google rich results
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: show.artists.map((a) => a.name).join(', ') || 'Live Show',
    startDate: show.show_time ? `${show.date}T${show.show_time}` : show.date,
    ...(show.doors_time && { doorTime: `${show.date}T${show.doors_time}` }),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place', name: show.venue_name,
      url: `https://showpaper.co/venues/${show.venue_id}`,
      address: { '@type': 'PostalAddress', streetAddress: show.venue_address ?? undefined, addressLocality: show.venue_city, addressCountry: 'US' },
    },
    performer: show.artists.map((a) => ({
      '@type': 'MusicGroup', name: a.name,
      url: `https://showpaper.co/artists/${a.id}`,
      ...(a.photo_url && { image: a.photo_url }),
    })),
    ...(show.ticket_url && {
      offers: {
        '@type': 'Offer', url: show.ticket_url, priceCurrency: 'USD',
        ...(show.price_min != null && show.price_min > 0 && { price: show.price_min }),
        availability: 'https://schema.org/InStock',
      },
    }),
    url: `https://showpaper.co/shows/${id}`,
    ...(show.artists[0]?.photo_url && { image: show.artists[0].photo_url }),
  };

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div style={{ maxWidth: 680 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10, borderBottom: '1px solid #ccc', paddingBottom: 6 }}>
        <Link href="/">showpaper</Link>
        {' › '}
        <Link href={`/${citySlug}`}>{show.venue_city.toLowerCase()}</Link>
        {' › events › '}
        <span>{show.artists[0]?.name ?? 'show'}</span>
      </div>

      {/* Heading with artist links */}
      <h1 style={{ fontSize: 18, fontWeight: 'bold', margin: '0 0 10px', color: '#222', lineHeight: 1.3 }}>
        {show.artists.length > 0
          ? show.artists.map((a, i) => (
              <span key={a.id}>
                <Link href={`/artists/${a.id}`} style={{ color: '#222' }}>{a.name}</Link>
                {i < show.artists.length - 1 ? ', ' : ''}
              </span>
            ))
          : 'TBA'}
        {' '}
        <span style={{ fontWeight: 'normal', color: '#666' }}>
          &mdash; {priceLabel}
          {show.venue_address && <span> (<Link href={`/venues/${show.venue_id}`} style={{ color: '#666' }}>{show.venue_name}</Link>)</span>}
        </span>
      </h1>

      {/* Two-column: photos (linked) left, metadata right */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Artist photos — each links to artist page */}
        {show.artists.some((a) => a.photo_url) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            {show.artists.map((artist) => (
              <div key={artist.id}>
                <Link href={`/artists/${artist.id}`} style={{ display: 'block' }}>
                  {artist.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artist.photo_url} alt={artist.name} width={110} height={110}
                      style={{ objectFit: 'cover', display: 'block', border: '1px solid #ddd', borderRadius: 3 }} />
                  ) : (
                    <div style={{ width: 110, height: 110, background: '#eee', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#ccc', border: '1px solid #ddd' }}>♪</div>
                  )}
                </Link>
                <div style={{ fontSize: 11, color: '#666', marginTop: 3, maxWidth: 110, textAlign: 'center' }}>
                  <Link href={`/artists/${artist.id}`} style={{ color: '#666' }}>{artist.name}</Link>
                </div>
                {artist.bandcamp_url && (
                  <div style={{ textAlign: 'center' }}>
                    <a href={artist.bandcamp_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#1da0c3' }}>bandcamp</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Metadata — CL-style attribute table */}
        <table style={{ fontSize: 12, borderCollapse: 'collapse', flex: 1 }}>
          <tbody>
            {show.artists.length > 0 && (
              <tr>
                <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top' }}>artists</td>
                <td style={{ padding: '3px 0' }}>
                  {show.artists.map((a, i) => (
                    <span key={a.id}><Link href={`/artists/${a.id}`}>{a.name}</Link>{i < show.artists.length - 1 ? ', ' : ''}</span>
                  ))}
                </td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top' }}>date</td>
              <td style={{ padding: '3px 0' }}><strong>{fmtDateLong(show.date)}</strong></td>
            </tr>
            {show.show_time && (
              <tr>
                <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap' }}>show time</td>
                <td style={{ padding: '3px 0' }}>{fmt12(show.show_time)}</td>
              </tr>
            )}
            {show.doors_time && (
              <tr>
                <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap' }}>doors</td>
                <td style={{ padding: '3px 0' }}>{fmt12(show.doors_time)}</td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap' }}>venue</td>
              <td style={{ padding: '3px 0' }}>
                <Link href={`/venues/${show.venue_id}`}>{show.venue_name}</Link>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap' }}>city</td>
              <td style={{ padding: '3px 0' }}><Link href={`/${citySlug}`}>{show.venue_city}</Link></td>
            </tr>
            {show.venue_address && (
              <tr>
                <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap' }}>address</td>
                <td style={{ padding: '3px 0' }}>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noreferrer">
                    {show.venue_address}
                  </a>
                </td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap' }}>price</td>
              <td style={{ padding: '3px 0', color: priceLabel === 'Free' ? '#1a9900' : '#333' }}>
                <strong>{priceLabel}</strong>
              </td>
            </tr>
            {show.ticket_url && (
              <tr>
                <td style={{ padding: '3px 12px 3px 0', color: '#888', whiteSpace: 'nowrap' }}>tickets</td>
                <td style={{ padding: '3px 0' }}>
                  <a href={show.ticket_url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-block', padding: '5px 16px', background: '#551A8B', color: '#fff', fontSize: 13, textDecoration: 'none', borderRadius: 5, border: '1px solid #9775B8' }}
                  >
                    buy tickets
                  </a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Spotify previews */}
      {show.artists.some((a) => a.preview_url) && (
        <div style={{ borderTop: '1px solid #e8e8e8', paddingTop: 10, marginTop: 4 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>30s previews via Spotify</div>
          {show.artists.filter((a) => a.preview_url).map((artist) => (
            <div key={artist.id} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link href={`/artists/${artist.id}`} style={{ fontSize: 12, color: '#00E', minWidth: 140 }}>{artist.name}</Link>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={artist.preview_url!} style={{ height: 24, width: 240 }} />
            </div>
          ))}
        </div>
      )}

      {/* Footer nav — full interlinking */}
      <div style={{ marginTop: 24, fontSize: 11, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 8 }}>
        <Link href={`/${citySlug}`}>← {show.venue_city.toLowerCase()} shows</Link>
        {' · '}
        <Link href={`/venues/${show.venue_id}`}>{show.venue_name}</Link>
        {show.artists.map((a) => (
          <span key={a.id}> · <Link href={`/artists/${a.id}`}>{a.name}</Link></span>
        ))}
      </div>
    </div>
    </>
  );
}
