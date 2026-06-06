import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/scrape/sources/[id]'>) {
  const db = await getDb();
  const { id } = await ctx.params;
  const body = await request.json();

  const updates: string[] = [];
  const args: (string | number | null)[] = [];

  if ('enabled' in body) {
    updates.push('enabled = ?');
    args.push(body.enabled ? 1 : 0);
    // Reset failure count when re-enabling
    if (body.enabled) {
      updates.push('consecutive_failures = ?', 'status = ?', 'last_error = ?');
      args.push(0, 'active', null);
    }
  }
  if ('name' in body) { updates.push('name = ?'); args.push(String(body.name)); }
  if ('city' in body) { updates.push('city = ?'); args.push(String(body.city)); }
  if ('venueId' in body) { updates.push('venue_id = ?'); args.push(body.venueId ?? null); }

  if (!updates.length) return Response.json({ error: 'Nothing to update' }, { status: 400 });

  args.push(id);
  await db.execute({ sql: `UPDATE scrape_sources SET ${updates.join(', ')} WHERE id = ?`, args });
  const row = await db.execute({ sql: 'SELECT * FROM scrape_sources WHERE id = ?', args: [id] });
  if (!row.rows.length) return Response.json({ error: 'Not found' }, { status: 404 });

  const r = row.rows[0];
  return Response.json({
    id: Number(r['id']),
    name: String(r['name']),
    enabled: Number(r['enabled']) === 1,
    status: String(r['status']),
    city: String(r['city']),
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/scrape/sources/[id]'>) {
  const db = await getDb();
  const { id } = await ctx.params;
  await db.execute({ sql: 'DELETE FROM scrape_sources WHERE id = ?', args: [id] });
  return Response.json({ ok: true });
}
