import { getDb } from '@/lib/db';
import ShowsAdmin from './components/ShowsAdmin';
import SyncPanel from './components/SyncPanel';
import type { Venue } from '@/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getAdminShows() {
  const db = await getDb();
  const showsResult = await db.execute(
    `SELECT s.*, v.name as venue_name
     FROM shows s JOIN venues v ON s.venue_id = v.id
     ORDER BY s.date ASC, COALESCE(s.show_time, '23:59') ASC`
  );
  if (!showsResult.rows.length) return [];

  const showIds = showsResult.rows.map((r) => Number(r['id']));
  const placeholders = showIds.map(() => '?').join(',');
  const artistsResult = await db.execute({
    sql: `SELECT sa.show_id, a.name, a.photo_url FROM show_artists sa
          JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id IN (${placeholders}) ORDER BY sa.sort_order ASC`,
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
    venue_name: String(r['venue_name']),
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    artists: artistsByShow[Number(r['id'])] ?? [],
  }));
}

async function getVenues(): Promise<Venue[]> {
  const db = await getDb();
  const result = await db.execute('SELECT * FROM venues ORDER BY name ASC');
  return result.rows.map((r) => ({
    id: Number(r['id']),
    name: String(r['name']),
    address: r['address'] ? String(r['address']) : null,
    city: String(r['city']),
    website: r['website'] ? String(r['website']) : null,
    created_at: String(r['created_at']),
  }));
}

export default async function AdminPage() {
  const [shows, venues] = await Promise.all([getAdminShows(), getVenues()]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Admin · Shows</h2>
        <div style={{ fontSize: 12 }}>
          <strong>Shows</strong>
          {' · '}
          <Link href="/admin/venues">Venues</Link>
          {' · '}
          <Link href="/">← Public site</Link>
        </div>
      </div>
      <SyncPanel />
      <ShowsAdmin initialShows={shows} venues={venues} />
    </div>
  );
}
