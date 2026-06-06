import { getDb } from '@/lib/db';
import VenuesAdmin from '../components/VenuesAdmin';
import type { Venue } from '@/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

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

export default async function AdminVenuesPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const params = await searchParams;
  const city = params.city ?? 'Austin';
  const venues = await getVenues(city);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Admin · Venues · <span style={{ color: '#551A8B', fontWeight: 'normal' }}>{city}</span></h2>
        <div style={{ fontSize: 12 }}>
          <Link href={`/admin?city=${encodeURIComponent(city)}`}>Shows</Link>
          {' · '}
          <strong>Venues</strong>
          {' · '}
          <Link href={`/${city.toLowerCase().replace(/\s+/g, '-')}`}>← Public site</Link>
        </div>
      </div>
      <VenuesAdmin initialVenues={venues} defaultCity={city} />
    </div>
  );
}
