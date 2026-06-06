import { searchSpotifyArtists } from '@/lib/spotify';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q) return Response.json({ error: 'q is required' }, { status: 400 });

  try {
    const results = await searchSpotifyArtists(q);
    return Response.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Spotify search failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
