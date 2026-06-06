import { getDb } from '@/lib/db';
import { CITIES } from '@/lib/cities';
import ShowGrid from '@/app/components/ShowGrid';
import type { ShowGridItem } from '@/app/components/ShowGrid';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getShows(venueId?: string): Promise<ShowGridItem[]> {
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
    sql: `SELECT sa.show_id, sa.sort_order, a.id, a.name, a.photo_url
          FROM show_artists sa JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id IN (${placeholders}) ORDER BY sa.show_id, sa.sort_order ASC`,
    args: showIds,
  });

  const artistsByShow: Record<number, { id: number; name: string; photo_url: string | null }[]> = {};
  for (const r of artistsResult.rows) {
    const sid = Number(r['show_id']);
    if (!artistsByShow[sid]) artistsByShow[sid] = [];
    artistsByShow[sid].push({ id: Number(r['id']), name: String(r['name']), photo_url: r['photo_url'] ? String(r['photo_url']) : null });
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

  // City selector links
  const cities = Object.values(CITIES);

  return (
    <div>
      {/* City nav */}
      <div style={{ marginBottom: 8, fontSize: 12, color: '#888', borderBottom: '1px solid #e8e8e8', paddingBottom: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>all cities:</span>
        {cities.map((c, i) => (
          <span key={c.slug}>
            {i > 0 && <span style={{ color: '#ddd', margin: '0 2px' }}>·</span>}
            <Link href={`/${c.slug}`} style={{ color: '#00E' }}>{c.name}</Link>
          </span>
        ))}
      </div>

      <ShowGrid shows={shows} venues={venues} venueFilter={params.venue} />
    </div>
  );
}
