import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { venueUrl } from '@/lib/cities';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Venues | Showpaper',
  description: 'Browse all venues with upcoming shows on Showpaper — Austin live music.',
};

async function getVenues() {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const r = await db.execute({
    sql: `SELECT v.id, v.name, v.slug, v.address, v.city, v.website,
                 COUNT(DISTINCT s.id) as show_count
          FROM venues v
          LEFT JOIN shows s ON s.venue_id = v.id AND s.date >= ?
          GROUP BY v.id
          ORDER BY v.name ASC`,
    args: [today],
  });
  return r.rows.map((row) => ({
    id: Number(row['id']),
    name: String(row['name']),
    slug: row['slug'] ? String(row['slug']) : null,
    address: row['address'] ? String(row['address']) : null,
    city: String(row['city']),
    website: row['website'] ? String(row['website']) : null,
    show_count: Number(row['show_count']),
  }));
}

export default async function VenuesPage() {
  const venues = await getVenues();
  const citySlug = 'austin'; // default; could be dynamic

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10, borderBottom: '1px solid #ccc', paddingBottom: 6 }}>
        <Link href="/">showpaper</Link>
        {' › '}
        <Link href={`/${citySlug}`}>austin</Link>
        {' › venues'}
        <span style={{ marginLeft: 10, color: '#aaa' }}>{venues.length} venues</span>
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 'bold', margin: '0 0 14px', color: '#222' }}>Venues</h1>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="show-table">
        <thead>
          <tr style={{ borderBottom: '2px solid #551A8B' }}>
            <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: '#666', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Venue</th>
            <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: '#666', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Address</th>
            <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: '#666', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>City</th>
            <th style={{ textAlign: 'right', padding: '4px 0', color: '#666', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Shows</th>
          </tr>
        </thead>
        <tbody>
          {venues.map((venue) => (
            <tr key={venue.id}>
              <td style={{ padding: '8px 12px 8px 0' }}>
                <Link href={venueUrl(venue.slug, venue.id, venue.name)} style={{ fontWeight: 'bold', color: '#00E' }}>
                  {venue.name}
                </Link>
                {venue.website && (
                  <span style={{ marginLeft: 6 }}>
                    <a href={venue.website} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#888' }}>
                      ↗
                    </a>
                  </span>
                )}
              </td>
              <td style={{ padding: '8px 12px 8px 0', color: '#666' }}>
                {venue.address ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name}, ${venue.address}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#666' }}
                  >
                    {venue.address}
                  </a>
                ) : '—'}
              </td>
              <td style={{ padding: '8px 12px 8px 0', color: '#666' }}>{venue.city}</td>
              <td style={{ padding: '8px 0', textAlign: 'right', color: venue.show_count > 0 ? '#222' : '#bbb' }}>
                {venue.show_count > 0 ? (
                  <Link href={venueUrl(venue.slug, venue.id, venue.name)} style={{ color: '#00E' }}>
                    {venue.show_count}
                  </Link>
                ) : '0'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {venues.length === 0 && (
        <p style={{ color: '#888', fontSize: 13 }}>No venues yet.</p>
      )}
    </div>
  );
}
