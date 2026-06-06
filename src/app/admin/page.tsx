import { getDb } from '@/lib/db';
import ShowsAdmin from './components/ShowsAdmin';
import SyncPanel from './components/SyncPanel';
import type { Venue } from '@/types';
import Link from 'next/link';
import { CITIES } from '@/lib/cities';

export const dynamic = 'force-dynamic';

async function getAdminShows(city: string) {
  const db = await getDb();
  const showsResult = await db.execute({
    sql: `SELECT s.*, v.name as venue_name
          FROM shows s JOIN venues v ON s.venue_id = v.id
          WHERE v.city = ?
          ORDER BY s.date ASC, COALESCE(s.show_time, '23:59') ASC`,
    args: [city],
  });
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

async function getVenues(city: string): Promise<Venue[]> {
  const db = await getDb();
  const result = await db.execute({ sql: 'SELECT * FROM venues WHERE city = ? ORDER BY name ASC', args: [city] });
  return result.rows.map((r) => ({
    id: Number(r['id']),
    name: String(r['name']),
    address: r['address'] ? String(r['address']) : null,
    city: String(r['city']),
    website: r['website'] ? String(r['website']) : null,
    created_at: String(r['created_at']),
  }));
}

async function getCitiesWithData(): Promise<string[]> {
  const db = await getDb();
  const r = await db.execute('SELECT DISTINCT city FROM venues ORDER BY city ASC');
  return r.rows.map((v) => String(v['city']));
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const params = await searchParams;
  const allCities = await getCitiesWithData();
  // Default to Austin, or first city with data
  const activeCity = params.city && allCities.includes(params.city)
    ? params.city
    : (allCities.find((c) => c.toLowerCase() === 'austin') ?? allCities[0] ?? 'Austin');

  const [shows, venues] = await Promise.all([getAdminShows(activeCity), getVenues(activeCity)]);

  const registeredCities = Object.values(CITIES);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Admin</h2>
        <div style={{ fontSize: 12 }}>
          <strong>Shows</strong>
          {' · '}
          <Link href={`/admin/venues?city=${encodeURIComponent(activeCity)}`}>Venues</Link>
          {' · '}
          <Link href={`/${activeCity.toLowerCase().replace(/\s+/g, '-')}`}>← Public site</Link>
        </div>
      </div>

      {/* City tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '1px solid #ddd', flexWrap: 'wrap' }}>
        {allCities.map((city) => {
          const isActive = city === activeCity;
          const meta = registeredCities.find((c) => c.name === city);
          const label = meta?.shortName ?? city;
          return (
            <Link
              key={city}
              href={`/admin?city=${encodeURIComponent(city)}`}
              style={{
                padding: '5px 14px',
                fontSize: 12,
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid #551A8B' : '2px solid transparent',
                color: isActive ? '#551A8B' : '#888',
                fontWeight: isActive ? 'bold' : 'normal',
                marginBottom: '-1px',
              }}
            >
              {label}
            </Link>
          );
        })}
        {/* Link to add a new city via public page */}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#bbb', padding: '5px 4px', alignSelf: 'center' }}>
          {activeCity}
        </span>
      </div>

      <SyncPanel city={activeCity} />
      <ShowsAdmin initialShows={shows} venues={venues} />
    </div>
  );
}
