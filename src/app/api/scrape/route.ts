import { scrapeResound } from '@/lib/scrapers/resound';
import { scrapeAntones } from '@/lib/scrapers/antones';
import { scrapeSongkickVenue } from '@/lib/scrapers/songkick';
import { scrapeThirteenthFloor } from '@/lib/scrapers/thirteenthfloor';
import { scrapePrekindle } from '@/lib/scrapers/prekindle';
import { ingestShows } from '@/lib/scrapers/ingest';
import { getDb } from '@/lib/db';
import type { IngestResult } from '@/lib/scrapers/types';

export const maxDuration = 120;

async function runSource(
  id: number,
  name: string,
  url: string,
  sourceType: string,
  city: string,
  skipSpotify: boolean
): Promise<IngestResult & { skippedVenues?: string[] }> {
  const opts = { enrichSpotify: !skipSpotify, city };

  if (sourceType === 'resound') {
    const { shows, skippedVenues } = await scrapeResound();
    return { ...(await ingestShows(shows, name, opts)), skippedVenues };
  }
  if (sourceType === 'antones') {
    const shows = await scrapeAntones(url);
    return await ingestShows(shows, name, opts);
  }
  if (sourceType === 'songkick-venue') {
    const { shows } = await scrapeSongkickVenue(url);
    return await ingestShows(shows, name, opts);
  }
  if (sourceType === 'thirteenthfloor') {
    const shows = await scrapeThirteenthFloor(url);
    return await ingestShows(shows, name, opts);
  }
  if (sourceType === 'prekindle') {
    const shows = await scrapePrekindle(url);
    return await ingestShows(shows, name, opts);
  }
  throw new Error(`Unknown source type: ${sourceType}`);
}

export async function POST(request: Request) {
  const reqUrl = new URL(request.url);
  const sourceId = reqUrl.searchParams.get('source_id');
  const sourceAll = reqUrl.searchParams.get('source') === 'all' || !reqUrl.searchParams.get('source_id');
  const skipSpotify = reqUrl.searchParams.get('skip_spotify') === '1';

  const db = await getDb();

  try {
    // Determine which sources to run
    const cityFilter = reqUrl.searchParams.get('city');
    let rows;
    if (sourceId) {
      rows = (await db.execute({ sql: 'SELECT * FROM scrape_sources WHERE id = ?', args: [sourceId] })).rows;
    } else if (cityFilter) {
      rows = (await db.execute({ sql: 'SELECT * FROM scrape_sources WHERE enabled = 1 AND city = ? ORDER BY created_at ASC', args: [cityFilter] })).rows;
    } else {
      rows = (await db.execute('SELECT * FROM scrape_sources WHERE enabled = 1 ORDER BY created_at ASC')).rows;
    }

    if (!rows.length) {
      return Response.json({ ok: false, error: 'No enabled sources found' }, { status: 404 });
    }

    const results = [];

    for (const row of rows) {
      const id = Number(row['id']);
      const name = String(row['name']);
      const url = String(row['url']);
      const sourceType = String(row['source_type']);
      const city = String(row['city']);

      try {
        const result = await runSource(id, name, url, sourceType, city, skipSpotify);

        // Update last_synced_at, reset failure count on success
        await db.execute({
          sql: `UPDATE scrape_sources SET
                  last_synced_at = datetime('now'),
                  last_result = ?,
                  last_error = NULL,
                  consecutive_failures = 0,
                  status = 'active'
                WHERE id = ?`,
          args: [JSON.stringify(result), id],
        });

        results.push({ sourceId: id, name, ok: true, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failures = Number(row['consecutive_failures']) + 1;
        const status = failures >= 5 ? 'disabled' : failures >= 3 ? 'failing' : 'active';
        const enabled = failures >= 5 ? 0 : Number(row['enabled']);

        await db.execute({
          sql: `UPDATE scrape_sources SET
                  last_error = ?,
                  consecutive_failures = ?,
                  status = ?,
                  enabled = ?
                WHERE id = ?`,
          args: [message, failures, status, enabled, id],
        });

        results.push({ sourceId: id, name, ok: false, error: message });
      }
    }

    const totalInserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0);
    const totalSkipped = results.reduce((s, r) => s + (r.skipped ?? 0), 0);

    return Response.json({ ok: true, sources: results, totalInserted, totalSkipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
