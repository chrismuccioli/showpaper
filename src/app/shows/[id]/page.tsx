import { getDb } from '@/lib/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function fmt12(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDateLong(d: string): string {
  const [y, mo, day] = d.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const date = new Date(y, mo - 1, day);
  return `${weekdays[date.getDay()]}, ${months[mo - 1]} ${day}, ${y}`;
}

function formatPrice(min: number | null, max: number | null): string {
  if (min === null || min === 0) return 'Free';
  if (max && max !== min) return `$${min}–$${max}`;
  return `$${min}`;
}

async function getShow(id: string) {
  const db = await getDb();
  const showResult = await db.execute({
    sql: `SELECT s.*, v.name as venue_name, v.address as venue_address, v.website as venue_website
          FROM shows s JOIN venues v ON s.venue_id = v.id WHERE s.id = ?`,
    args: [id],
  });
  if (!showResult.rows.length) return null;

  const r = showResult.rows[0];
  const artistsResult = await db.execute({
    sql: `SELECT a.id, a.name, a.photo_url, a.preview_url, a.spotify_id, a.bandcamp_url, sa.sort_order
          FROM show_artists sa JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id = ? ORDER BY sa.sort_order ASC`,
    args: [id],
  });

  return {
    id: Number(r['id']),
    date: String(r['date']),
    doors_time: r['doors_time'] ? String(r['doors_time']) : null,
    show_time: r['show_time'] ? String(r['show_time']) : null,
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    venue_name: String(r['venue_name']),
    venue_address: r['venue_address'] ? String(r['venue_address']) : null,
    venue_website: r['venue_website'] ? String(r['venue_website']) : null,
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

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await getShow(id);
  if (!show) notFound();

  const mapsQuery = encodeURIComponent(show.venue_address ? `${show.venue_name}, ${show.venue_address}` : show.venue_name);
  const priceLabel = formatPrice(show.price_min, show.price_max);

  return (
    <div style={{ maxWidth: 680 }}>
      {/* CL-style breadcrumb */}
      <div style={{ fontSize: 13, color: '#666', marginBottom: 10, borderBottom: '1px solid #ccc', paddingBottom: 6 }}>
        <Link href="/">showpaper</Link>
        {' › '}
        <Link href="/">austin</Link>
        {' › events › '}
        <span>{show.artists[0]?.name ?? 'show'}</span>
      </div>

      {/* CL-style heading: title — price (venue) */}
      <h1 style={{ fontSize: 18, fontWeight: 'bold', margin: '0 0 10px', color: '#222', lineHeight: 1.3 }}>
        {show.artists.map(a => a.name).join(', ') || 'TBA'}
        {' '}
        <span style={{ fontWeight: 'normal', color: '#666' }}>
          &mdash; {priceLabel}
          {show.venue_address && <span> ({show.venue_name})</span>}
        </span>
      </h1>

      {/* Two-column layout: images left, metadata right */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Artist photos */}
        {show.artists.some(a => a.photo_url) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            {show.artists.map((artist) => (
              <div key={artist.id}>
                {artist.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={artist.photo_url}
                    alt={artist.name}
                    width={120}
                    height={120}
                    style={{ objectFit: 'cover', display: 'block', border: '1px solid #ddd' }}
                  />
                ) : (
                  <div style={{ width: 120, height: 120, background: '#ede8f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: '#9e7ec9', border: '1px solid #ddd' }}>♪</div>
                )}
                {show.artists.length > 1 && (
                  <div style={{ fontSize: 10, color: '#666', marginTop: 2, maxWidth: 120, textAlign: 'center' }}>{artist.name}</div>
                )}
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
                {show.venue_website
                  ? <a href={show.venue_website} target="_blank" rel="noreferrer">{show.venue_name}</a>
                  : show.venue_name
                }
              </td>
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
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>30s previews</div>
          {show.artists.filter((a) => a.preview_url).map((artist) => (
            <div key={artist.id} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#555', minWidth: 120 }}>{artist.name}</span>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={artist.preview_url!} style={{ height: 24, width: 240 }} />
            </div>
          ))}
        </div>
      )}

      {/* CL-style footer */}
      <div style={{ marginTop: 24, fontSize: 10, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 8 }}>
        <Link href="/">all shows</Link>
        {' · '}
        <a href="/admin">post a show</a>
        {' · '}
        <span>austin, tx</span>
      </div>
    </div>
  );
}
