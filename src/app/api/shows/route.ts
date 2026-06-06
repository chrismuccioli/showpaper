import { getDb } from '@/lib/db';
import type { ArtistInput } from '@/types';

export async function GET(request: Request) {
  const db = await getDb();
  const url = new URL(request.url);
  const venueId = url.searchParams.get('venue_id');
  const fromDate = url.searchParams.get('from') ?? new Date().toISOString().split('T')[0];

  let sql = `
    SELECT s.*, v.name as venue_name, v.address as venue_address, v.website as venue_website
    FROM shows s
    JOIN venues v ON s.venue_id = v.id
    WHERE s.date >= ?
  `;
  const args: (string | number)[] = [fromDate];
  if (venueId) {
    sql += ' AND s.venue_id = ?';
    args.push(Number(venueId));
  }
  sql += ' ORDER BY s.date ASC, COALESCE(s.show_time, "23:59") ASC';

  const showsResult = await db.execute({ sql, args });

  if (!showsResult.rows.length) return Response.json([]);

  const showIds = showsResult.rows.map((r) => Number(r['id']));
  const placeholders = showIds.map(() => '?').join(',');
  const artistsResult = await db.execute({
    sql: `SELECT sa.show_id, sa.sort_order, a.id, a.name, a.photo_url, a.preview_url, a.spotify_id, a.bandcamp_url
          FROM show_artists sa
          JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id IN (${placeholders})
          ORDER BY sa.show_id, sa.sort_order ASC`,
    args: showIds,
  });

  // Group artists by show_id
  const artistsByShow: Record<number, { name: string; photo_url: string | null }[]> = {};
  for (const r of artistsResult.rows) {
    const sid = Number(r['show_id']);
    if (!artistsByShow[sid]) artistsByShow[sid] = [];
    artistsByShow[sid].push({
      name: String(r['name']),
      photo_url: r['photo_url'] ? String(r['photo_url']) : null,
    });
  }

  const shows = showsResult.rows.map((r) => ({
    id: Number(r['id']),
    venue_id: Number(r['venue_id']),
    date: String(r['date']),
    doors_time: r['doors_time'] ? String(r['doors_time']) : null,
    show_time: r['show_time'] ? String(r['show_time']) : null,
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    venue_name: String(r['venue_name']),
    venue_address: r['venue_address'] ? String(r['venue_address']) : null,
    artists: artistsByShow[Number(r['id'])] ?? [],
  }));

  return Response.json(shows);
}

export async function POST(request: Request) {
  const db = await getDb();
  const body = await request.json();
  const { venue_id, date, doors_time, show_time, price_min, price_max, ticket_url, artists = [] } = body;

  if (!venue_id || !date) {
    return Response.json({ error: 'venue_id and date are required' }, { status: 400 });
  }

  // Insert show
  const showResult = await db.execute({
    sql: 'INSERT INTO shows (venue_id, date, doors_time, show_time, price_min, price_max, ticket_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [
      Number(venue_id),
      date,
      doors_time || null,
      show_time || null,
      price_min !== '' && price_min != null ? Number(price_min) : null,
      price_max !== '' && price_max != null ? Number(price_max) : null,
      ticket_url || null,
    ],
  });
  const showId = Number(showResult.lastInsertRowid);

  // Upsert artists and link to show
  await upsertShowArtists(db, showId, artists);

  return Response.json({ id: showId }, { status: 201 });
}

export async function upsertShowArtists(
  db: Awaited<ReturnType<typeof getDb>>,
  showId: number,
  artists: ArtistInput[]
) {
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i];
    let artistId: number;

    if (a.dbId) {
      // Update existing artist metadata
      await db.execute({
        sql: 'UPDATE artists SET name = ?, photo_url = ?, spotify_id = ?, preview_url = ? WHERE id = ?',
        args: [a.name, a.photo_url || null, a.spotify_id || null, a.preview_url || null, a.dbId],
      });
      artistId = a.dbId;
    } else {
      // Create new artist
      const r = await db.execute({
        sql: 'INSERT INTO artists (name, photo_url, spotify_id, preview_url) VALUES (?, ?, ?, ?)',
        args: [a.name, a.photo_url || null, a.spotify_id || null, a.preview_url || null],
      });
      artistId = Number(r.lastInsertRowid);
    }

    await db.execute({
      sql: 'INSERT OR IGNORE INTO show_artists (show_id, artist_id, sort_order) VALUES (?, ?, ?)',
      args: [showId, artistId, i],
    });
  }
}
