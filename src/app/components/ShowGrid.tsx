import Link from 'next/link';
import { fmtDateGrid, fmt12, formatPrice, showUrl, artistUrl, venueUrl } from '@/lib/cities';

export interface ShowGridItem {
  id: number;
  slug: string | null;
  date: string;
  show_time: string | null;
  doors_time: string | null;
  price_min: number | null;
  price_max: number | null;
  ticket_url: string | null;
  venue_id: number;
  venue_name: string;
  venue_slug: string | null;
  artists: { id: number; name: string; photo_url: string | null; slug: string | null }[];
}

export default function ShowGrid({ shows, venueFilter, venues }: {
  shows: ShowGridItem[];
  venueFilter?: string;
  venues: { id: number; name: string }[];
}) {
  return (
    <div>
      {/* Filter bar */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #e8e8e8', paddingBottom: 6 }}>
        <form method="GET" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select
            name="venue"
            defaultValue={venueFilter ?? ''}
            style={{ fontSize: 13, border: '1px solid #ccc', padding: '2px 4px', color: '#333', background: '#fff' }}
          >
            <option value="">all venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <button type="submit" style={{ fontSize: 12, padding: '2px 8px', cursor: 'pointer', background: '#f2f2f2', border: '1px solid #ccc' }}>go</button>
          {venueFilter && <a href="?" style={{ fontSize: 12 }}>reset</a>}
        </form>
        <span style={{ color: '#888', fontSize: 12 }}>{shows.length} upcoming show{shows.length !== 1 ? 's' : ''}</span>
      </div>

      {shows.length === 0 ? (
        <p style={{ color: '#888', fontSize: 13, padding: '16px 2px' }}>
          no upcoming shows — <a href="/admin">add one</a>
        </p>
      ) : (
        shows.map((show) => {
          const headliner = show.artists[0];
          const supporting = show.artists.slice(1);
          const { day, mmdd } = fmtDateGrid(show.date);
          const price = formatPrice(show.price_min, show.price_max);
          const isFree = show.price_min === 0;

          return (
            <div
              key={show.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '50px 80px 1fr 160px 110px',
                gap: '0 12px',
                padding: '8px 4px',
                borderBottom: '1px solid #eee',
                alignItems: 'start',
              }}
              className="result-row"
            >
              {/* Thumbnail */}
              <Link href={showUrl(show.slug, show.id, show.artists, show.venue_name)} style={{ display: 'block', textDecoration: 'none' }}>
                {headliner?.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headliner.photo_url}
                    alt=""
                    width={50}
                    height={50}
                    style={{ objectFit: 'cover', display: 'block', borderRadius: 5, width: 50, height: 50 }}
                  />
                ) : (
                  <div style={{ width: 50, height: 50, background: '#eee', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 22 }}>♪</div>
                )}
              </Link>

              {/* Date */}
              <div>
                <div style={{ fontWeight: 'bold', lineHeight: 1.3 }}>{day}</div>
                <div style={{ fontWeight: 'bold', lineHeight: 1.3 }}>{mmdd}</div>
                {show.show_time && <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{fmt12(show.show_time)}</div>}
              </div>

              {/* Artists */}
              <div style={{ lineHeight: 1.5 }}>
                {headliner ? (
                  <Link href={artistUrl(headliner.slug, headliner.id, headliner.name)} style={{ fontWeight: 'bold', color: '#00E' }}>
                    {headliner.name}
                  </Link>
                ) : (
                  <span style={{ fontWeight: 'bold' }}>TBA</span>
                )}
                {supporting.length > 0 && (
                  <span style={{ color: '#444' }}>
                    {', '}
                    {supporting.map((a, i) => (
                      <span key={a.id}>
                        <Link href={artistUrl(a.slug, a.id, a.name)} style={{ color: '#444' }}>{a.name}</Link>
                        {i < supporting.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </span>
                )}
              </div>

              {/* Venue + price */}
              <div>
                <Link href={venueUrl(show.venue_slug, show.venue_id, show.venue_name)} style={{ color: '#00E', lineHeight: 1.3, display: 'block' }}>
                  {show.venue_name}
                </Link>
                <div style={{ fontSize: 13, color: isFree ? '#090' : '#666', marginTop: 2 }}>{price}</div>
                {show.doors_time && (
                  <div style={{ fontSize: 12, color: '#999', marginTop: 1 }}>doors {fmt12(show.doors_time)}</div>
                )}
              </div>

              {/* Actions */}
              <div>
                {show.ticket_url ? (
                  <a
                    href={show.ticket_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'block', background: '#551A8B', color: '#fff',
                      padding: '5px 0', textAlign: 'center', fontSize: 12,
                      fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase',
                      borderRadius: 5, textDecoration: 'none', marginBottom: 4,
                      border: '1px solid #9775B8',
                    }}
                  >
                    tickets
                  </a>
                ) : (
                  <div style={{ height: 30, marginBottom: 4 }} />
                )}
                <Link
                  href={showUrl(show.slug, show.id, show.artists, show.venue_name)}
                  style={{
                    display: 'block', background: '#eee', color: '#551A8B',
                    padding: '3px 6px', fontSize: 12, textAlign: 'right',
                    textDecoration: 'none', border: '1px solid #ccc', borderRadius: 3,
                  }}
                >
                  more info »
                </Link>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
