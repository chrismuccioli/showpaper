import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function PUT(request: NextRequest, ctx: RouteContext<'/api/venues/[id]'>) {
  const db = await getDb();
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, address, city = 'Austin', website } = body;
  if (!name?.trim()) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }
  await db.execute({
    sql: 'UPDATE venues SET name = ?, address = ?, city = ?, website = ? WHERE id = ?',
    args: [name.trim(), address || null, city, website || null, id],
  });
  const row = await db.execute({ sql: 'SELECT * FROM venues WHERE id = ?', args: [id] });
  if (!row.rows.length) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(row.rows[0]);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/venues/[id]'>) {
  const db = await getDb();
  const { id } = await ctx.params;
  await db.execute({ sql: 'DELETE FROM shows WHERE venue_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM venues WHERE id = ?', args: [id] });
  return Response.json({ ok: true });
}
