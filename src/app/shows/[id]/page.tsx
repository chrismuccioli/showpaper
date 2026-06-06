import { getDb } from '@/lib/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fmt12, fmtDateLong, formatPrice, artistUrl, venueUrl } from '@/lib/cities';

export const dynamic = 'force-dynamic';

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getShow(slug: string) {
  const db = await getDb();
  const isNumeric = /^\d+$/.test(slug);
  const showResult = await db.execute({
    sql: `SELECT s.*, v.id as venue_id, v.name as venue_name, v.slug as venue_slug,
                 v.address as venue_address, v.website as venue_website, v.city as venue_city
          FROM shows s JOIN venues v ON s.venue_id = v.id WHERE ${isNumeric ? 's.id' : 's.slug'} = ?`,
    args: [isNumeric ? Number(slug) : slug],
  });
  if (!showResult.rows.length) return null;

  const r = showResult.rows[0];
  const artistsResult = await db.execute({
    sql: `SELECT a.id, a.name, a.slug, a.photo_url, a.preview_url, a.spotify_id,
                 a.apple_music_url, a.bandcamp_url, sa.sort_order
          FROM show_artists sa JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id = ? ORDER BY sa.sort_order ASC`,
    args: [r['id']],
  });

  return {
    id: Number(r['id']),
    slug: r['slug'] ? String(r['slug']) : null,
    date: String(r['date']),
    doors_time: r['doors_time'] ? String(r['doors_time']) : null,
    show_time: r['show_time'] ? String(r['show_time']) : null,
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    venue_id: Number(r['venue_id']),
    venue_name: String(r['venue_name']),
    venue_slug: r['venue_slug'] ? String(r['venue_slug']) : null,
    venue_address: r['venue_address'] ? String(r['venue_address']) : null,
    venue_website: r['venue_website'] ? String(r['venue_website']) : null,
    venue_city: String(r['venue_city']),
    artists: artistsResult.rows.map((a) => ({
      id: Number(a['id']),
      name: String(a['name']),
      slug: a['slug'] ? String(a['slug']) : null,
      photo_url: a['photo_url'] ? String(a['photo_url']) : null,
      preview_url: a['preview_url'] ? String(a['preview_url']) : null,
      spotify_id: a['spotify_id'] ? String(a['spotify_id']) : null,
      apple_music_url: a['apple_music_url'] ? String(a['apple_music_url']) : null,
      bandcamp_url: a['bandcamp_url'] ? String(a['bandcamp_url']) : null,
    })),
  };
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const show = await getShow(id);
  if (!show) return {};

  const artistNames = show.artists.map((a) => a.name).join(', ') || 'Live Show';
  const priceLabel = formatPrice(show.price_min, show.price_max);
  const dateStr = fmtDateLong(show.date);
  const timeStr = show.show_time ? ` at ${fmt12(show.show_time)}` : '';
  const title = `${artistNames} at ${show.venue_name} — ${dateStr} | Showpaper`;
  const description = `${artistNames} live at ${show.venue_name} in ${show.venue_city} on ${dateStr}${timeStr}.${priceLabel ? ` ${priceLabel !== 'free' ? `Tickets from ${priceLabel}.` : 'Free admission.'}` : ''} Get tickets and listen on Showpaper.`;
  const ogImage = show.artists[0]?.photo_url;

  return {
    title,
    description,
    openGraph: { title, description, siteName: 'Showpaper', type: 'website', ...(ogImage && { images: [{ url: ogImage, alt: artistNames }] }) },
    twitter: { card: ogImage ? 'summary_large_image' : 'summary', title, description, ...(ogImage && { images: [ogImage] }) },
    alternates: { canonical: `/shows/${id}` },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await getShow(id);
  if (!show) notFound();

  const mapsQuery = encodeURIComponent(show.venue_address ? `${show.venue_name}, ${show.venue_address}` : show.venue_name);
  const priceLabel = formatPrice(show.price_min, show.price_max);
  const citySlug = show.venue_city.toLowerCase().replace(/\s+/g, '-');
  const headliner = show.artists[0];
  const supporting = show.artists.slice(1);
  const hasSpotify = show.artists.some((a) => a.spotify_id);
  const multiArtist = show.artists.length > 1;

  // JSON-LD
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
      ...(a.spotify_id && { sameAs: `https://open.spotify.com/artist/${a.spotify_id}` }),
    })),
    ...(show.ticket_url && { offers: { '@type': 'Offer', url: show.ticket_url, priceCurrency: 'USD', ...(show.price_min != null && show.price_min > 0 && { price: show.price_min }), availability: 'https://schema.org/InStock' } }),
    url: `https://showpaper.co/shows/${id}`,
    ...(show.artists[0]?.photo_url && { image: show.artists[0].photo_url }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 12, borderBottom: '1px solid #ccc', paddingBottom: 6 }}>
        <Link href="/">showpaper</Link>
        {' › '}
        <Link href={`/${citySlug}`}>{show.venue_city.toLowerCase()}</Link>
        {' › events › '}
        <span>{headliner?.name ?? 'show'}</span>
      </div>

      {/* Hero: artist photo(s) — full width banner */}
      {headliner?.photo_url && (
        <div style={{ marginBottom: 16, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
          {multiArtist ? (
            /* Multiple artists — row of photos */
            <div style={{ display: 'flex', gap: 3, height: 200 }}>
              {show.artists.map((a) => (
                <Link key={a.id} href={artistUrl(a.slug, a.id, a.name)} style={{ flex: 1, display: 'block', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
                  {a.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.photo_url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#ccc' }}>♪</div>
                  )}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '16px 8px 6px', fontSize: 11, color: '#fff', fontWeight: 'bold' }}>
                    {a.name}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            /* Single headliner — tall banner */
            <Link href={artistUrl(headliner.slug, headliner.id, headliner.name)} style={{ display: 'block' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={headliner.photo_url} alt={headliner.name} style={{ width: '100%', height: 260, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
            </Link>
          )}
        </div>
      )}

      {/* Title */}
      <h1 style={{ fontSize: 20, fontWeight: 'bold', margin: '0 0 4px', color: '#222', lineHeight: 1.3 }}>
        {show.artists.length > 0
          ? show.artists.map((a, i) => (
              <span key={a.id}>
                <Link href={artistUrl(a.slug, a.id, a.name)} style={{ color: '#222' }}>{a.name}</Link>
                {i < show.artists.length - 1 ? ', ' : ''}
              </span>
            ))
          : 'TBA'}
      </h1>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
        <Link href={venueUrl(show.venue_slug, show.venue_id, show.venue_name)} style={{ color: '#00E' }}>{show.venue_name}</Link>
        {' · '}{fmtDateLong(show.date)}
        {show.show_time && ` · ${fmt12(show.show_time)}`}
      </div>

      {/* Main two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: hasSpotify ? '1fr 280px' : '1fr 280px', gap: 24, alignItems: 'start' }}>

        {/* LEFT: Artist music section */}
        <div>
          {show.artists.map((artist, idx) => (
            <div key={artist.id} style={{ marginBottom: 24 }}>
              {/* Artist header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {artist.photo_url && !multiArtist ? null : (
                  artist.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artist.photo_url} alt={artist.name} width={44} height={44}
                      style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                  )
                )}
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 15 }}>
                    <Link href={artistUrl(artist.slug, artist.id, artist.name)} style={{ color: '#222' }}>{artist.name}</Link>
                    {idx === 0 && show.artists.length > 1 && <span style={{ fontSize: 11, fontWeight: 'normal', color: '#888', marginLeft: 6 }}>headliner</span>}
                    {idx > 0 && <span style={{ fontSize: 11, fontWeight: 'normal', color: '#888', marginLeft: 6 }}>supporting</span>}
                  </div>
                  {/* Platform links */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                    {artist.spotify_id && (
                      <a href={`https://open.spotify.com/artist/${artist.spotify_id}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#1db954', textDecoration: 'none' }}>
                        ♫ Spotify
                      </a>
                    )}
                    {artist.apple_music_url && (
                      <a href={artist.apple_music_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#f94c57', textDecoration: 'none' }}>
                        ♫ Apple Music
                      </a>
                    )}
                    {!artist.apple_music_url && (
                      <a href={`https://music.apple.com/search?term=${encodeURIComponent(artist.name)}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#aaa', textDecoration: 'none' }}>
                        Apple Music ↗
                      </a>
                    )}
                    {artist.bandcamp_url && (
                      <a href={artist.bandcamp_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#1da0c3', textDecoration: 'none' }}>
                        Bandcamp ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Spotify artist embed — full interactive player */}
              {artist.spotify_id && (
                <iframe
                  src={`https://open.spotify.com/embed/artist/${artist.spotify_id}?utm_source=generator&theme=0`}
                  width="100%"
                  height={multiArtist ? '152' : '352'}
                  style={{ border: 'none', borderRadius: 8 }}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  title={`${artist.name} on Spotify`}
                />
              )}

              {/* Fallback: 30s preview if no Spotify embed */}
              {!artist.spotify_id && artist.preview_url && (
                <div style={{ background: '#f8f8f8', border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>preview clip</div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={artist.preview_url} style={{ width: '100%', height: 32 }} />
                </div>
              )}

              {/* No music available */}
              {!artist.spotify_id && !artist.preview_url && (
                <div style={{ background: '#f8f8f8', border: '1px solid #eee', borderRadius: 8, padding: 12, fontSize: 12, color: '#aaa' }}>
                  <Link href={artistUrl(artist.slug, artist.id, artist.name)} style={{ color: '#00E' }}>View {artist.name} profile</Link>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* RIGHT: Event details + ticket CTA */}
        <div>
          {/* Ticket CTA — primary action, most prominent */}
          {show.ticket_url && (
            <a href={show.ticket_url} target="_blank" rel="noreferrer"
              style={{
                display: 'block', textAlign: 'center', padding: '14px 20px',
                background: '#551A8B', color: '#fff', borderRadius: 6,
                textDecoration: 'none', fontWeight: 'bold', fontSize: 16,
                border: '1px solid #9775B8', marginBottom: 8, letterSpacing: 0.3,
              }}>
              🎟 Get Tickets
            </a>
          )}
          {priceLabel && (
            <div style={{ textAlign: 'center', fontSize: 13, color: priceLabel === 'free' ? '#090' : '#555', marginBottom: 16, fontWeight: priceLabel === 'free' ? 'bold' : 'normal' }}>
              {priceLabel === 'free' ? '✓ Free admission' : priceLabel}
            </div>
          )}
          {!show.ticket_url && (
            <div style={{ background: '#f8f8f8', border: '1px solid #eee', borderRadius: 6, padding: 12, textAlign: 'center', fontSize: 12, color: '#888', marginBottom: 16 }}>
              Tickets available at the door
            </div>
          )}

          {/* Event details card */}
          <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                <tr>
                  <td style={{ color: '#888', paddingBottom: 8, paddingRight: 10, whiteSpace: 'nowrap', verticalAlign: 'top' }}>📅</td>
                  <td style={{ paddingBottom: 8 }}><strong>{fmtDateLong(show.date)}</strong></td>
                </tr>
                {show.show_time && (
                  <tr>
                    <td style={{ color: '#888', paddingBottom: 8, paddingRight: 10, whiteSpace: 'nowrap' }}>⏰</td>
                    <td style={{ paddingBottom: 8 }}>
                      Show {fmt12(show.show_time)}
                      {show.doors_time && <span style={{ color: '#999', fontSize: 12 }}> · doors {fmt12(show.doors_time)}</span>}
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ color: '#888', paddingBottom: 8, paddingRight: 10, whiteSpace: 'nowrap' }}>📍</td>
                  <td style={{ paddingBottom: 8 }}>
                    <Link href={venueUrl(show.venue_slug, show.venue_id, show.venue_name)} style={{ fontWeight: 'bold', color: '#00E' }}>{show.venue_name}</Link>
                    {show.venue_address && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noreferrer" style={{ color: '#888' }}>
                          {show.venue_address}
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
                {show.venue_website && (
                  <tr>
                    <td style={{ color: '#888', paddingBottom: 8, paddingRight: 10 }}>🌐</td>
                    <td style={{ paddingBottom: 8, fontSize: 12 }}>
                      <a href={show.venue_website} target="_blank" rel="noreferrer" style={{ color: '#00E' }}>
                        {show.venue_website.replace(/^https?:\/\//, '')}
                      </a>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Add to calendar */}
            {show.show_time && (
              <a
                href={buildCalendarUrl(show)}
                target="_blank" rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', padding: '8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, color: '#551A8B', textDecoration: 'none', marginTop: 8 }}>
                + Add to Calendar
              </a>
            )}
          </div>

          {/* Artist quick links */}
          {show.artists.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 12, color: '#888' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#555' }}>Artists</div>
              {show.artists.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {a.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.photo_url} alt="" width={28} height={28} style={{ borderRadius: 3, objectFit: 'cover' }} />
                  )}
                  <Link href={artistUrl(a.slug, a.id, a.name)} style={{ color: '#00E' }}>{a.name}</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div style={{ marginTop: 28, fontSize: 11, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href={`/${citySlug}`} style={{ color: '#00E' }}>← {show.venue_city.toLowerCase()} shows</Link>
        <span>·</span>
        <Link href={venueUrl(show.venue_slug, show.venue_id, show.venue_name)} style={{ color: '#00E' }}>{show.venue_name}</Link>
        {show.artists.map((a) => (
          <span key={a.id} style={{ display: 'contents' }}>
            <span>·</span>
            <Link href={artistUrl(a.slug, a.id, a.name)} style={{ color: '#00E' }}>{a.name}</Link>
          </span>
        ))}
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCalendarUrl(show: { date: string; show_time: string | null; venue_name: string; artists: { name: string }[] }): string {
  const title = encodeURIComponent(
    `${show.artists.map((a) => a.name).join(', ')} at ${show.venue_name}`
  );
  // Google Calendar format: YYYYMMDDTHHMMSS
  const startDt = show.show_time
    ? show.date.replace(/-/g, '') + 'T' + show.show_time.replace(':', '') + '00'
    : show.date.replace(/-/g, '');
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDt}/${startDt}`;
}
