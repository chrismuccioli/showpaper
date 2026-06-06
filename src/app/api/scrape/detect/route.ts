import { detectSource } from '@/lib/scrapers/detect';

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const url = body?.url as string | undefined;

  if (!url?.trim()) {
    return Response.json({ error: 'url is required' }, { status: 400 });
  }

  try {
    const result = await detectSource(url);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
