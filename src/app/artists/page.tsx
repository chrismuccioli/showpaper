import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { artistUrl } from '@/lib/cities';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Artists | Showpaper',
  description: 'Browse all artists with upcoming shows on Showpaper — Austin live music.',
};

async function getArtists() {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  // Only artists with upcoming shows, with show count
  const r = await db.execute({
    sql: `SELECT a.id, a.name, a.slug, a.photo_url,
                 COUNT(DISTINCT sa.show_id) as show_count
          FROM artists a
          JOIN show_artists sa ON sa.artist_id = a.id
          JOIN shows s ON s.id = sa.show_id
          WHERE s.date >= ?
          GROUP BY a.id
          ORDER BY a.name ASC`,
    args: [today],
  });
  return r.rows.map((row) => ({
    id: Number(row['id']),
    name: String(row['name']),
    slug: row['slug'] ? String(row['slug']) : null,
    photo_url: row['photo_url'] ? String(row['photo_url']) : null,
    show_count: Number(row['show_count']),
  }));
}

export default async function ArtistsPage() {
  const artists = await getArtists();

  // Group by first letter
  const grouped: Record<string, typeof artists> = {};
  for (const a of artists) {
    const letter = a.name[0].toUpperCase().replace(/[^A-Z]/, '#');
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(a);
  }
  const letters = Object.keys(grouped).sort((a, b) =>
    a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10, borderBottom: '1px solid #ccc', paddingBottom: 6 }}>
        <Link href="/">showpaper</Link>
        {' › artists'}
        <span style={{ marginLeft: 10, color: '#aaa' }}>{artists.length} with upcoming shows</span>
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 'bold', margin: '0 0 14px', color: '#222' }}>Artists</h1>

      {letters.map((letter) => (
        <div key={letter} style={{ marginBottom: 16 }}>
          {/* Letter header */}
          <div className="date-header">{letter}</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingTop: 8 }}>
            {grouped[letter].map((artist) => (
              <Link
                key={artist.id}
                href={artistUrl(artist.slug, artist.id, artist.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', width: 220 }}
              >
                {/* Photo */}
                {artist.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={artist.photo_url}
                    alt={artist.name}
                    width={40}
                    height={40}
                    style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid #eee' }}
                  />
                ) : (
                  <div style={{ width: 40, height: 40, background: '#eee', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 16 }}>♪</div>
                )}
                {/* Name + show count */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#00E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {artist.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {artist.show_count} show{artist.show_count !== 1 ? 's' : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {artists.length === 0 && (
        <p style={{ color: '#888', fontSize: 13 }}>No artists with upcoming shows yet.</p>
      )}
    </div>
  );
}
