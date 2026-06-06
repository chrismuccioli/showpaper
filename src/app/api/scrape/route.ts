import { scrapeResound } from '@/lib/scrapers/resound';
import { ingestShows } from '@/lib/scrapers/ingest';

// Vercel/Next.js max function duration — scraping + Spotify can take ~30s
export const maxDuration = 60;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source') ?? 'resound';
  const skipSpotify = url.searchParams.get('skip_spotify') === '1';

  try {
    if (source === 'resound') {
      const { shows, skippedVenues } = await scrapeResound();
      const result = await ingestShows(shows, 'Resound Presents', {
        enrichSpotify: !skipSpotify,
      });
      return Response.json({ ok: true, skippedVenues, ...result });
    }

    return Response.json({ ok: false, error: `Unknown source: ${source}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
