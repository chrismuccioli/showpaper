import { getDb } from '@/lib/db';
import { detectSourceType } from '@/lib/scrapers/detect';

function rowToSource(r: Record<string, unknown>) {
  return {
    id: Number(r['id']),
    name: String(r['name']),
    url: String(r['url']),
    sourceType: String(r['source_type']),
    city: String(r['city']),
    timezone: String(r['timezone']),
    enabled: Number(r['enabled']) === 1,
    venueId: r['venue_id'] != null ? Number(r['venue_id']) : null,
    lastSyncedAt: r['last_synced_at'] ? String(r['last_synced_at']) : null,
    lastResult: r['last_result'] ? JSON.parse(String(r['last_result'])) : null,
    lastError: r['last_error'] ? String(r['last_error']) : null,
    consecutiveFailures: Number(r['consecutive_failures']),
    status: String(r['status']),
    createdAt: String(r['created_at']),
  };
}

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.execute('SELECT * FROM scrape_sources ORDER BY created_at ASC');
    return Response.json(rows.rows.map(rowToSource));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const db = await getDb();
  const body = await request.json();
  const { name, url, sourceType, city, timezone, venueId } = body;

  if (!name?.trim() || !url?.trim()) {
    return Response.json({ error: 'name and url are required' }, { status: 400 });
  }

  const type = sourceType || detectSourceType(url);

  const r = await db.execute({
    sql: `INSERT INTO scrape_sources (name, url, source_type, city, timezone, venue_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      name.trim(),
      url.trim(),
      type,
      city || 'Austin',
      timezone || 'America/Chicago',
      venueId ?? null,
    ],
  });

  const id = Number(r.lastInsertRowid);
  const row = await db.execute({ sql: 'SELECT * FROM scrape_sources WHERE id = ?', args: [id] });
  return Response.json(rowToSource(row.rows[0] as Record<string, unknown>), { status: 201 });
}
