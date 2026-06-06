import { getDb } from '@/lib/db';
import { upsertShowArtists } from '../route';
import type { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/shows/[id]'>) {
  const db = await getDb();
  const { id } = await ctx.params;

  const showResult = await db.execute({
    sql: `SELECT s.*, v.name as venue_name, v.address as venue_address, v.website as venue_website
          FROM shows s JOIN venues v ON s.venue_id = v.id WHERE s.id = ?`,
    args: [id],
  });
  if (!showResult.rows.length) return Response.json({ error: 'not found' }, { status: 404 });

  const r = showResult.rows[0];
  const artistsResult = await db.execute({
    sql: `SELECT sa.sort_order, a.id, a.name, a.photo_url, a.preview_url, a.spotify_id, a.bandcamp_url
          FROM show_artists sa JOIN artists a ON sa.artist_id = a.id
          WHERE sa.show_id = ? ORDER BY sa.sort_order ASC`,
    args: [id],
  });

  const show = {
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
    venue_website: r['venue_website'] ? String(r['venue_website']) : null,
    artists: artistsResult.rows.map((a) => ({
      dbId: Number(a['id']),
      name: String(a['name']),
      photo_url: a['photo_url'] ? String(a['photo_url']) : '',
      spotify_id: a['spotify_id'] ? String(a['spotify_id']) : '',
      preview_url: a['preview_url'] ? String(a['preview_url']) : '',
      sort_order: Number(a['sort_order']),
    })),
  };

  return Response.json(show);
}

export async function PUT(request: NextRequest, ctx: RouteContext<'/api/shows/[id]'>) {
  const db = await getDb();
  const { id } = await ctx.params;
  const body = await request.json();
  const { venue_id, date, doors_time, show_time, price_min, price_max, ticket_url, artists = [] } = body;

  if (!venue_id || !date) {
    return Response.json({ error: 'venue_id and date are required' }, { status: 400 });
  }

  await db.execute({
    sql: 'UPDATE shows SET venue_id=?, date=?, doors_time=?, show_time=?, price_min=?, price_max=?, ticket_url=? WHERE id=?',
    args: [
      Number(venue_id),
      date,
      doors_time || null,
      show_time || null,
      price_min !== '' && price_min != null ? Number(price_min) : null,
      price_max !== '' && price_max != null ? Number(price_max) : null,
      ticket_url || null,
      id,
    ],
  });

  // Replace artist links
  await db.execute({ sql: 'DELETE FROM show_artists WHERE show_id = ?', args: [id] });
  await upsertShowArtists(db, Number(id), artists);

  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/shows/[id]'>) {
  const db = await getDb();
  const { id } = await ctx.params;
  await db.execute({ sql: 'DELETE FROM show_artists WHERE show_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM shows WHERE id = ?', args: [id] });
  return Response.json({ ok: true });
}
