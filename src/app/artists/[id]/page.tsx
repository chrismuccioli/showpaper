import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getShowsByArtist } from '@/lib/queries';
import { fmtDateShort, fmt12, formatPrice } from '@/lib/cities';

export const dynamic = 'force-dynamic';

async function getArtist(id: string) {
  const db = await getDb();
  const r = await db.execute({ sql: 'SELECT * FROM artists WHERE id = ?', args: [id] });
  if (!r.rows.length) return null;
  const a = r.rows[0];
  return {
    id: Number(a['id']),
    name: String(a['name']),
    photo_url: a['photo_url'] ? String(a['photo_url']) : null,
    spotify_id: a['spotify_id'] ? String(a['spotify_id']) : null,
    preview_url: a['preview_url'] ? String(a['preview_url']) : null,
    bandcamp_url: a['bandcamp_url'] ? String(a['bandcamp_url']) : null,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) return {};

  const title = `${artist.name} — Upcoming Shows | Showpaper`;
  const description = `See upcoming ${artist.name} shows near you on Showpaper. Tickets, dates, venues, and music previews.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'Showpaper',
      images: artist.photo_url ? [{ url: artist.photo_url, alt: artist.name }] : [],
    },
    twitter: { card: artist.photo_url ? 'summary_large_image' : 'summary', title, description },
    alternates: { canonical: `/artists/${id}` },
  };
}

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [artist, shows] = await Promise.all([getArtist(id), getShowsByArtist(id)]);
  if (!artist) notFound();

  // JSON-LD: MusicGroup
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: artist.name,
    url: `https://showpaper.co/artists/${id}`,
    ...(artist.photo_url && { image: artist.photo_url }),
    ...(artist.spotify_id && { sameAs: [`https://open.spotify.com/artist/${artist.spotify_id}`] }),
    event: shows.slice(0, 10).map((s) => ({
      '@type': 'Event',
      name: `${artist.name} at ${s.venue_name}`,
      startDate: s.show_time ? `${s.date}T${s.show_time}` : s.date,
      location: { '@type': 'Place', name: s.venue_name },
      url: `https://showpaper.co/shows/${s.id}`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10, borderBottom: '1px solid #ccc', paddingBottom: 6 }}>
        <Link href="/">showpaper</Link>
        {' › '}
        <Link href="/artists">artists</Link>
        {' › '}
        <span>{artist.name}</span>
      </div>

      {/* Artist header */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
        {artist.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.photo_url}
            alt={artist.name}
            width={120}
            height={120}
            style={{ objectFit: 'cover', borderRadius: 5, flexShrink: 0, border: '1px solid #ddd' }}
          />
        )}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 6px', color: '#222' }}>{artist.name}</h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
            {artist.spotify_id && (
              <a href={`https://open.spotify.com/artist/${artist.spotify_id}`} target="_blank" rel="noreferrer" style={{ color: '#1db954' }}>
                open in spotify
              </a>
            )}
            {artist.bandcamp_url && (
              <a href={artist.bandcamp_url} target="_blank" rel="noreferrer" style={{ color: '#1da0c3' }}>
                bandcamp
              </a>
            )}
          </div>
          {artist.preview_url && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>30-second preview</div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={artist.preview_url} style={{ height: 28, width: 280 }} />
            </div>
          )}
        </div>
      </div>

      {/* Upcoming shows */}
      <div style={{ borderTop: '1px solid #ccc', paddingTop: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 'bold', margin: '0 0 8px', color: '#222' }}>
          Upcoming Shows {shows.length > 0 && <span style={{ fontWeight: 'normal', color: '#888', fontSize: 13 }}>({shows.length})</span>}
        </h2>

        {shows.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No upcoming shows on Showpaper yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="show-table">
            <tbody>
              {shows.map((show) => {
                const price = formatPrice(show.price_min, show.price_max);
                const isFree = show.price_min === 0 || show.price_min === null;
                const otherArtists = show.artists.filter((a) => a.id !== Number(id));
                return (
                  <tr key={show.id}>
                    <td style={{ padding: '8px 10px 8px 0', whiteSpace: 'nowrap', color: '#444', width: 110 }}>
                      <strong>{fmtDateShort(show.date)}</strong>
                      {show.show_time && <span style={{ color: '#888', display: 'block', fontSize: 12 }}>{fmt12(show.show_time)}</span>}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <Link href={`/venues/${show.venue_id}`} style={{ color: '#00E', fontWeight: 'bold' }}>
                        {show.venue_name}
                      </Link>
                      {otherArtists.length > 0 && (
                        <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                          w/{' '}
                          {otherArtists.map((a, i) => (
                            <span key={a.id}>
                              <Link href={`/artists/${a.id}`} style={{ color: '#666' }}>{a.name}</Link>
                              {i < otherArtists.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 0', whiteSpace: 'nowrap', color: isFree ? '#090' : '#666', fontSize: 12 }}>
                      {price}
                    </td>
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
        <Link href="/">all shows</Link> · <Link href="/austin">austin</Link> · <a href="/admin">admin</a>
      </div>
    </>
  );
}
