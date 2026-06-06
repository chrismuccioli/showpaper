import 'server-only';
import { getDb } from './db';
import type { ShowGridItem } from '@/app/components/ShowGrid';

const today = () => new Date().toISOString().split('T')[0];

async function attachArtists(db: Awaited<ReturnType<typeof getDb>>, showRows: { id: number }[]): Promise<Record<number, { id: number; name: string; photo_url: string | null; slug: string | null }[]>> {
  if (!showRows.length) return {};
  const showIds = showRows.map((r) => r.id);
  const placeholders = showIds.map(() => '?').join(',');
  const artistsResult = await db.execute({
    sql: `SELECT sa.show_id, sa.sort_order, a.id, a.name, a.photo_url, a.slug
          FROM show_artists sa JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id IN (${placeholders}) ORDER BY sa.show_id, sa.sort_order ASC`,
    args: showIds,
  });
  const map: Record<number, { id: number; name: string; photo_url: string | null; slug: string | null }[]> = {};
  for (const r of artistsResult.rows) {
    const sid = Number(r['show_id']);
    if (!map[sid]) map[sid] = [];
    map[sid].push({
      id: Number(r['id']),
      name: String(r['name']),
      photo_url: r['photo_url'] ? String(r['photo_url']) : null,
      slug: r['slug'] ? String(r['slug']) : null,
    });
  }
  return map;
}

/** Shows for a given city (matched against venues.city) */
export async function getShowsByCity(
  cityName: string,
  venueId?: string,
  from?: string,
  to?: string
): Promise<ShowGridItem[]> {
  const db = await getDb();
  const fromDate = from ?? today();
  let sql = `
    SELECT s.id, s.slug, s.date, s.show_time, s.doors_time, s.price_min, s.price_max, s.ticket_url,
           v.id as venue_id, v.name as venue_name, v.slug as venue_slug
    FROM shows s JOIN venues v ON s.venue_id = v.id
    WHERE v.city = ? AND s.date >= ?
  `;
  const args: (string | number)[] = [cityName, fromDate];
  if (to) { sql += ' AND s.date <= ?'; args.push(to); }
  if (venueId) { sql += ' AND s.venue_id = ?'; args.push(Number(venueId)); }
  sql += ` ORDER BY s.date ASC, COALESCE(s.show_time, '23:59') ASC`;

  const rows = await db.execute({ sql, args });
  if (!rows.rows.length) return [];

  const shows = rows.rows.map((r) => ({
    id: Number(r['id']),
    slug: r['slug'] ? String(r['slug']) : null,
    date: String(r['date']),
    show_time: r['show_time'] ? String(r['show_time']) : null,
    doors_time: r['doors_time'] ? String(r['doors_time']) : null,
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    venue_id: Number(r['venue_id']),
    venue_name: String(r['venue_name']),
    venue_slug: r['venue_slug'] ? String(r['venue_slug']) : null,
  }));

  const artistMap = await attachArtists(db, shows);
  return shows.map((s) => ({ ...s, artists: artistMap[s.id] ?? [] }));
}

/** All upcoming shows for a specific venue */
export async function getShowsByVenue(venueId: string): Promise<ShowGridItem[]> {
  const db = await getDb();
  const rows = await db.execute({
    sql: `SELECT s.id, s.slug, s.date, s.show_time, s.doors_time, s.price_min, s.price_max, s.ticket_url,
                 v.id as venue_id, v.name as venue_name, v.slug as venue_slug
          FROM shows s JOIN venues v ON s.venue_id = v.id
          WHERE s.venue_id = ? AND s.date >= ?
          ORDER BY s.date ASC, COALESCE(s.show_time, '23:59') ASC`,
    args: [venueId, today()],
  });
  if (!rows.rows.length) return [];

  const shows = rows.rows.map((r) => ({
    id: Number(r['id']), slug: r['slug'] ? String(r['slug']) : null, date: String(r['date']),
    show_time: r['show_time'] ? String(r['show_time']) : null,
    doors_time: r['doors_time'] ? String(r['doors_time']) : null,
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    venue_id: Number(r['venue_id']), venue_name: String(r['venue_name']),
    venue_slug: r['venue_slug'] ? String(r['venue_slug']) : null,
  }));

  const artistMap = await attachArtists(db, shows);
  return shows.map((s) => ({ ...s, artists: artistMap[s.id] ?? [] }));
}

/** All upcoming shows for a specific artist */
export async function getShowsByArtist(artistId: string): Promise<ShowGridItem[]> {
  const db = await getDb();
  const rows = await db.execute({
    sql: `SELECT s.id, s.slug, s.date, s.show_time, s.doors_time, s.price_min, s.price_max, s.ticket_url,
                 v.id as venue_id, v.name as venue_name, v.slug as venue_slug
          FROM shows s
          JOIN venues v ON s.venue_id = v.id
          JOIN show_artists sa ON s.id = sa.show_id
          WHERE sa.artist_id = ? AND s.date >= ?
          ORDER BY s.date ASC, COALESCE(s.show_time, '23:59') ASC`,
    args: [artistId, today()],
  });
  if (!rows.rows.length) return [];

  const shows = rows.rows.map((r) => ({
    id: Number(r['id']), slug: r['slug'] ? String(r['slug']) : null, date: String(r['date']),
    show_time: r['show_time'] ? String(r['show_time']) : null,
    doors_time: r['doors_time'] ? String(r['doors_time']) : null,
    price_min: r['price_min'] != null ? Number(r['price_min']) : null,
    price_max: r['price_max'] != null ? Number(r['price_max']) : null,
    ticket_url: r['ticket_url'] ? String(r['ticket_url']) : null,
    venue_id: Number(r['venue_id']), venue_name: String(r['venue_name']),
    venue_slug: r['venue_slug'] ? String(r['venue_slug']) : null,
  }));

  const artistMap = await attachArtists(db, shows);
  return shows.map((s) => ({ ...s, artists: artistMap[s.id] ?? [] }));
}

/** Venues for a city (for the filter dropdown) */
export async function getVenuesByCity(cityName: string): Promise<{ id: number; name: string }[]> {
  const db = await getDb();
  const r = await db.execute({
    sql: `SELECT DISTINCT v.id, v.name FROM venues v
          JOIN shows s ON s.venue_id = v.id
          WHERE v.city = ? AND s.date >= ?
          ORDER BY v.name ASC`,
    args: [cityName, today()],
  });
  return r.rows.map((v) => ({ id: Number(v['id']), name: String(v['name']) }));
}
