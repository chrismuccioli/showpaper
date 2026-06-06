import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getShowsByVenue } from '@/lib/queries';
import { fmtDateShort, fmt12, formatPrice } from '@/lib/cities';

export const dynamic = 'force-dynamic';

async function getVenue(slug: string) {
  const db = await getDb();
  const isNumeric = /^\d+$/.test(slug);
  const r = await db.execute({
    sql: `SELECT * FROM venues WHERE ${isNumeric ? 'id' : 'slug'} = ?`,
    args: [isNumeric ? Number(slug) : slug],
  });
  if (!r.rows.length) return null;
  const v = r.rows[0];
  return {
    id: Number(v['id']),
    name: String(v['name']),
    address: v['address'] ? String(v['address']) : null,
    city: String(v['city']),
    website: v['website'] ? String(v['website']) : null,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const venue = await getVenue(id);
  if (!venue) return {};

  const title = `${venue.name} — Upcoming Shows | Showpaper`;
  const description = `Upcoming live shows at ${venue.name}${venue.address ? `, ${venue.address}` : ''} in ${venue.city}. Tickets, times, and artist previews on Showpaper.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: 'Showpaper' },
    twitter: { card: 'summary', title, description },
    alternates: { canonical: `/venues/${id}` },
  };
}

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = await getVenue(id);
  if (!venue) notFound();
  const shows = await getShowsByVenue(String(venue.id));
  const mapsQuery = encodeURIComponent(venue.address ? `${venue.name}, ${venue.address}` : venue.name);
  // Derive city slug from city name
  const citySlug = venue.city.toLowerCase().replace(/\s+/g, '-');

  // JSON-LD: MusicVenue
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicVenue',
    name: venue.name,
    url: `https://showpaper.co/venues/${id}`,
    ...(venue.website && { sameAs: venue.website }),
    address: {
      '@type': 'PostalAddress',
      streetAddress: venue.address ?? undefined,
      addressLocality: venue.city,
      addressCountry: 'US',
    },
    event: shows.slice(0, 10).map((s) => ({
      '@type': 'Event',
      name: s.artists[0]?.name ?? 'Live Show',
      startDate: s.show_time ? `${s.date}T${s.show_time}` : s.date,
      location: { '@type': 'Place', name: venue.name },
      url: `https://showpaper.co/shows/${s.id}`,
      ...(s.ticket_url && { offers: { '@type': 'Offer', url: s.ticket_url } }),
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10, borderBottom: '1px solid #ccc', paddingBottom: 6 }}>
        <Link href="/">showpaper</Link>
        {' › '}
        <Link href={`/${citySlug}`}>{venue.city.toLowerCase()}</Link>
        {' › venues › '}
        <span>{venue.name}</span>
      </div>

      {/* Venue header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 4px', color: '#222' }}>{venue.name}</h1>
        <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {venue.address && (
              <tr>
                <td style={{ color: '#888', paddingRight: 12, verticalAlign: 'top', whiteSpace: 'nowrap' }}>address</td>
                <td>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noreferrer">
                    {venue.address}
                  </a>
                </td>
              </tr>
            )}
            <tr>
              <td style={{ color: '#888', paddingRight: 12, whiteSpace: 'nowrap' }}>city</td>
              <td><Link href={`/${citySlug}`}>{venue.city}</Link></td>
            </tr>
            {venue.website && (
              <tr>
                <td style={{ color: '#888', paddingRight: 12, whiteSpace: 'nowrap' }}>website</td>
                <td><a href={venue.website} target="_blank" rel="noreferrer">{venue.website.replace(/^https?:\/\//, '')}</a></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Upcoming shows */}
      <div style={{ borderTop: '1px solid #ccc', paddingTop: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 'bold', margin: '0 0 8px', color: '#222' }}>
          Upcoming Shows{' '}
          {shows.length > 0 && <span style={{ fontWeight: 'normal', color: '#888', fontSize: 13 }}>({shows.length})</span>}
        </h2>

        {shows.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No upcoming shows at {venue.name} on Showpaper yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="show-table">
            <tbody>
              {shows.map((show) => {
                const headliner = show.artists[0];
                const supporting = show.artists.slice(1);
                const price = formatPrice(show.price_min, show.price_max);
                const isFree = show.price_min === 0 || show.price_min === null;
                return (
                  <tr key={show.id}>
                    {/* Thumbnail */}
                    <td style={{ padding: '8px 10px 8px 0', width: 44 }}>
                      <Link href={`/shows/${show.id}`}>
                        {headliner?.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={headliner.photo_url} alt="" width={40} height={40}
                            style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                        ) : (
                          <div style={{ width: 40, height: 40, background: '#eee', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 18 }}>♪</div>
                        )}
                      </Link>
                    </td>
                    {/* Date */}
                    <td style={{ padding: '8px 12px 8px 0', whiteSpace: 'nowrap', color: '#444', width: 100 }}>
                      <strong>{fmtDateShort(show.date)}</strong>
                      {show.show_time && <span style={{ color: '#888', display: 'block', fontSize: 12 }}>{fmt12(show.show_time)}</span>}
                    </td>
                    {/* Artists */}
                    <td style={{ padding: '8px 12px' }}>
                      {headliner ? (
                        <Link href={`/artists/${headliner.id}`} style={{ color: '#00E', fontWeight: 'bold' }}>
                          {headliner.name}
                        </Link>
                      ) : (
                        <span style={{ fontWeight: 'bold' }}>TBA</span>
                      )}
                      {supporting.length > 0 && (
                        <span style={{ color: '#666', fontSize: 12 }}>
                          {', '}
                          {supporting.map((a, i) => (
                            <span key={a.id}>
                              <Link href={`/artists/${a.id}`} style={{ color: '#666' }}>{a.name}</Link>
                              {i < supporting.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    {/* Price */}
                    <td style={{ padding: '8px 0', whiteSpace: 'nowrap', color: isFree ? '#090' : '#666', fontSize: 12, width: 60 }}>
                      {price}
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '8px 0 8px 10px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {show.ticket_url && (
                        <a href={show.ticket_url} target="_blank" rel="noreferrer"
                          style={{ display: 'inline-block', padding: '3px 10px', background: '#551A8B', color: '#fff', fontSize: 11, borderRadius: 3, textDecoration: 'none', marginRight: 6 }}>
                          tickets
                        </a>
                      )}
                      <Link href={`/shows/${show.id}`}
                        style={{ fontSize: 11, color: '#551A8B', background: '#eee', padding: '3px 8px', border: '1px solid #ccc', borderRadius: 3, textDecoration: 'none' }}>
                        details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer nav */}
      <div style={{ marginTop: 24, fontSize: 11, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 8 }}>
        <Link href="/">all shows</Link>
        {' · '}
        <Link href={`/${citySlug}`}>{venue.city.toLowerCase()} shows</Link>
        {' · '}
        <a href="/admin">admin</a>
      </div>
    </>
  );
}
