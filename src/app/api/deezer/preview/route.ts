export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) return Response.json({ error: 'q required' }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`,
      { cache: 'force-cache', next: { revalidate: 3600 } } // cache per artist for 1hr
    );
    const data = await res.json() as { data?: { preview?: string; title?: string; artist?: { name?: string }; album?: { cover_medium?: string } }[] };

    const track = data.data?.find((t) => t.preview);
    if (!track?.preview) {
      return Response.json({ error: 'No preview found for this artist' }, { status: 404 });
    }

    return Response.json({
      previewUrl: track.preview,
      trackTitle: track.title,
      artistName: track.artist?.name,
      albumArt: track.album?.cover_medium,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
