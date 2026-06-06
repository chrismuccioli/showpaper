import { getDb } from '@/lib/db';
import type { Venue } from '@/types';

export async function GET(request: Request) {
  const db = await getDb();
  const city = new URL(request.url).searchParams.get('city');
  const result = city
    ? await db.execute({ sql: 'SELECT * FROM venues WHERE city = ? ORDER BY name ASC', args: [city] })
    : await db.execute('SELECT * FROM venues ORDER BY name ASC');
  const venues: Venue[] = result.rows.map((r) => ({
    id: Number(r['id']),
    name: String(r['name']),
    address: r['address'] ? String(r['address']) : null,
    city: String(r['city']),
    website: r['website'] ? String(r['website']) : null,
    created_at: String(r['created_at']),
  }));
  return Response.json(venues);
}

export async function POST(request: Request) {
  const db = await getDb();
  const body = await request.json();
  const { name, address, city = 'Austin', website } = body;
  if (!name?.trim()) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }
  const result = await db.execute({
    sql: 'INSERT INTO venues (name, address, city, website) VALUES (?, ?, ?, ?)',
    args: [name.trim(), address || null, city, website || null],
  });
  const newId = Number(result.lastInsertRowid);
  const row = await db.execute({ sql: 'SELECT * FROM venues WHERE id = ?', args: [newId] });
  return Response.json(row.rows[0], { status: 201 });
}
