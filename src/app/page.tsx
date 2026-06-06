import { getDb } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function formatPrice(min: number | null, max: number | null): string {
  if (min === null || min === 0) return 'free';
  if (max && max !== min) return `$${min}–$${max}`;
  return `$${min}`;
}

function fmtDateGrid(d: string): { day: string; mmdd: string } {
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, m - 1, day);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return {
    day: days[date.getDay()],
    mmdd: `${String(m).padStart(2,'0')}/${String(day).padStart(2,'0')}`,
  };
}

function fmt12(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`;
}

async function getShows(venueId?: string) {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];

  let sql = `
    SELECT s.id, s.date, s.show_time, s.doors_time, s.price_min, s.price_max, s.ticket_url,
           v.id as venue_id, v.name as venue_name
    FROM shows s JOIN venues v ON s.venue_id = v.id
    WHERE s.date >= ?
  `;
  const args: (string | number)[] = [today];
  if (venueId) { sql += ' AND s.venue_id = ?'; args.push(Number(venueId)); }
  sql += " ORDER BY s.date ASC, COALESCE(s.show_time, '23:59') ASC";

  const showsResult = await db.execute({ sql, args });
  if (!showsResult.rows.length) return [];

  const showIds = showsResult.rows.map((r) => Number(r['id']));
  const placeholders = showIds.map(() => '?').join(',');
  const artistsResult = await db.execute({
    sql: `SELECT sa.show_id, sa.sort_order, a.name, a.photo_url
          FROM show_artists sa JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id IN (${placeholders}) ORDER BY sa.show_id, sa.sort_order ASC`,
    args: showIds,
  });

  const artistsByShow: Record<number, { name: string; photo_url: string | null }[]> = {};
  for (const r of artistsResult.rows) {
    const sid = Number(r['show_id']);
    if (!artistsByShow[sid]) artistsByShow[sid] = [];
    artistsByShow[sid].push({ name: String(r['name']), photo_url: r['photo_url'] ? String(r['photo_url']) : null });
  }

  return showsResult.rows.map((r) => ({
    id: Number(r['id']),
    date: String(r['date']),
    show_time: r['show_time'] ? String(r['show_time']) : null,
    doors_time: r['doors_time'] ? String(r['doors_time']) : null,
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    venue_id: Number(r['venue_id']),
    venue_name: String(r['venue_name']),
    artists: artistsByShow[Number(r['id'])] ?? [],
  }));
}

async function getVenues() {
  const db = await getDb();
  const r = await db.execute('SELECT id, name FROM venues ORDER BY name ASC');
  return r.rows.map((v) => ({ id: Number(v['id']), name: String(v['name']) }));
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string; date?: string }>;
}) {
  const params = await searchParams;
  const [shows, venues] = await Promise.all([getShows(params.venue), getVenues()]);

  return (
    <div>
      {/* Filter bar */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #e8e8e8', paddingBottom: 6 }}>
        <span style={{ color: '#666' }}>austin › events › live music</span>
        <span style={{ color: '#ddd' }}>|</span>
        <form method="GET" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select
            name="venue"
            defaultValue={params.venue ?? ''}
            style={{ fontSize: 11, border: '1px solid #ccc', padding: '1px 3px', color: '#333', background: '#fff' }}
          >
            <option value="">all venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <button type="submit" style={{ fontSize: 11, padding: '1px 6px', cursor: 'pointer', background: '#f2f2f2', border: '1px solid #ccc' }}>go</button>
          {params.venue && <a href="/" style={{ fontSize: 11 }}>reset</a>}
        </form>
      </div>

      {shows.length === 0 ? (
        <p style={{ color: '#888', fontSize: 12, padding: '12px 2px' }}>no upcoming shows — <a href="/admin">add one</a></p>
      ) : (
        <div>
          {shows.map((show) => {
            const headliner = show.artists[0];
            const supporting = show.artists.slice(1);
            const { day, mmdd } = fmtDateGrid(show.date);
            const price = formatPrice(show.price_min, show.price_max);
            const isFree = show.price_min === 0 || show.price_min === null;

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
                {/* Col 0 — Thumbnail (CL .cl-thumb: 50x50, border-radius 5px) */}
                <Link href={`/shows/${show.id}`} style={{ display: 'block', textDecoration: 'none' }}>
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
                    <div style={{ width: 50, height: 50, background: '#eee', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 22 }}>
                      ♪
                    </div>
                  )}
                </Link>

                {/* Col 1 — Date (CL: bold, system font) */}
                <div>
                  <div style={{ fontWeight: 'bold', lineHeight: 1.3 }}>{day}</div>
                  <div style={{ fontWeight: 'bold', lineHeight: 1.3 }}>{mmdd}</div>
                  {show.show_time && (
                    <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{fmt12(show.show_time)}</div>
                  )}
                </div>

                {/* Col 2 — Artists (CL: link = #00E) */}
                <div style={{ lineHeight: 1.5 }}>
                  <Link
                    href={`/shows/${show.id}`}
                    style={{ fontWeight: 'bold', color: '#00E' }}
                  >
                    {headliner?.name ?? 'TBA'}
                  </Link>
                  {supporting.length > 0 && (
                    <span style={{ color: '#444' }}>
                      {', '}{supporting.map(a => a.name).join(', ')}
                    </span>
                  )}
                </div>

                {/* Col 3 — Venue + price */}
                <div>
                  <div style={{ color: '#00E', lineHeight: 1.3 }}>
                    {show.venue_name}
                  </div>
                  <div style={{ fontSize: 13, color: isFree ? '#090' : '#666', marginTop: 2 }}>
                    {price}
                  </div>
                  {show.doors_time && (
                    <div style={{ fontSize: 12, color: '#999', marginTop: 1 }}>
                      doors {fmt12(show.doors_time)}
                    </div>
                  )}
                </div>

                {/* Col 4 — Actions (CL: #551A8B for primary actions) */}
                <div>
                  {show.ticket_url ? (
                    <a
                      href={show.ticket_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'block',
                        background: '#551A8B',
                        color: '#fff',
                        padding: '5px 0',
                        textAlign: 'center',
                        fontSize: 12,
                        fontWeight: 'bold',
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        borderRadius: 5,
                        textDecoration: 'none',
                        marginBottom: 4,
                        border: '1px solid #9775B8',
                      }}
                    >
                      tickets
                    </a>
                  ) : (
                    <div style={{ height: 30, marginBottom: 4 }} />
                  )}
                  <Link
                    href={`/shows/${show.id}`}
                    style={{
                      display: 'block',
                      background: '#eee',
                      color: '#551A8B',
                      padding: '3px 6px',
                      fontSize: 12,
                      textAlign: 'right',
                      textDecoration: 'none',
                      border: '1px solid #ccc',
                      borderRadius: 3,
                    }}
                  >
                    more info »
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
