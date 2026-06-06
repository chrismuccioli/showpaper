import 'server-only';
import { getDb } from '@/lib/db';
import { toSlug } from '@/lib/cities';
import { searchSpotifyArtists } from '@/lib/spotify';
import type { ScrapedShow, IngestResult } from './types';
import type { Client } from '@libsql/client';

// ── Slug helpers ─────────────────────────────────────────────────────────────

async function uniqueSlug(db: Client, table: string, base: string, excludeId: number): Promise<string> {
  let slug = base;
  let n = 2;
  while (true) {
    const row = await db.execute({ sql: `SELECT id FROM ${table} WHERE slug = ? AND id != ?`, args: [slug, excludeId] });
    if (!row.rows.length) return slug;
    slug = `${base}-${n++}`;
  }
}

// ── Venue upsert ─────────────────────────────────────────────────────────────

async function getOrCreateVenue(db: Client, name: string, address: string | null): Promise<number> {
  const existing = await db.execute({ sql: 'SELECT id FROM venues WHERE name = ?', args: [name] });
  if (existing.rows.length) return Number(existing.rows[0]['id']);

  const r = await db.execute({
    sql: 'INSERT INTO venues (name, address, city) VALUES (?, ?, ?)',
    args: [name, address, 'Austin'],
  });
  const id = Number(r.lastInsertRowid);
  const slug = await uniqueSlug(db, 'venues', toSlug(name), id);
  await db.execute({ sql: 'UPDATE venues SET slug = ? WHERE id = ?', args: [slug, id] });
  return id;
}

// ── Artist upsert ─────────────────────────────────────────────────────────────

async function getOrCreateArtist(
  db: Client,
  name: string,
  photoUrl: string | null,
  enrichWithSpotify: boolean
): Promise<{ id: number; wasCreated: boolean }> {
  const existing = await db.execute({ sql: 'SELECT id FROM artists WHERE name = ?', args: [name] });
  if (existing.rows.length) return { id: Number(existing.rows[0]['id']), wasCreated: false };

  // New artist — optionally enrich with Spotify before inserting
  let spotifyId: string | null = null;
  let spotifyPhoto: string | null = photoUrl; // fallback to show poster
  let previewUrl: string | null = null;

  if (enrichWithSpotify) {
    try {
      const results = await searchSpotifyArtists(name);
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = results.find((r: { name: string }) => norm(r.name) === norm(name));
      if (match) {
        spotifyId = match.id;
        spotifyPhoto = (match.images as { url: string }[])[0]?.url ?? photoUrl;
        // Fetch top-track preview
        const token = await getSpotifyToken();
        if (token) {
          const trackRes = await fetch(
            `https://api.spotify.com/v1/artists/${match.id}/top-tracks?market=US`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const trackData = await trackRes.json() as { tracks: { preview_url: string | null }[] };
          previewUrl = trackData.tracks?.find((t) => t.preview_url)?.preview_url ?? null;
        }
      }
    } catch {
      // Spotify enrichment is best-effort — don't fail the whole ingest
    }
  }

  const r = await db.execute({
    sql: 'INSERT INTO artists (name, photo_url, spotify_id, preview_url) VALUES (?, ?, ?, ?)',
    args: [name, spotifyPhoto, spotifyId, previewUrl],
  });
  const id = Number(r.lastInsertRowid);
  const slug = await uniqueSlug(db, 'artists', toSlug(name), id);
  await db.execute({ sql: 'UPDATE artists SET slug = ? WHERE id = ?', args: [slug, id] });

  return { id, wasCreated: true };
}

// Lazy Spotify token cache (reuse across ingest run)
let _spotifyToken: string | null = null;
let _tokenExpiry = 0;

async function getSpotifyToken(): Promise<string | null> {
  if (_spotifyToken && Date.now() < _tokenExpiry) return _spotifyToken;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    _spotifyToken = data.access_token;
    _tokenExpiry = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;
    return _spotifyToken;
  } catch { return null; }
}

// ── Show duplicate check ──────────────────────────────────────────────────────

async function showExists(db: Client, ticketUrl: string | null, date: string, venueId: number, headliner: string): Promise<boolean> {
  if (ticketUrl) {
    const r = await db.execute({ sql: 'SELECT id FROM shows WHERE source_url = ?', args: [ticketUrl] });
    if (r.rows.length) return true;
  }
  // Fallback: date + venue + headliner name
  const r2 = await db.execute({
    sql: `SELECT s.id FROM shows s
          JOIN show_artists sa ON s.id = sa.show_id
          JOIN artists a ON sa.artist_id = a.id
          WHERE s.date = ? AND s.venue_id = ? AND a.name = ? AND sa.sort_order = 0`,
    args: [date, venueId, headliner],
  });
  return r2.rows.length > 0;
}

// ── Main ingest ───────────────────────────────────────────────────────────────

export async function ingestShows(
  shows: ScrapedShow[],
  sourceName: string,
  options: { enrichSpotify?: boolean } = {}
): Promise<IngestResult> {
  const start = Date.now();
  const db = await getDb();
  const enrichSpotify = options.enrichSpotify ?? !!process.env.SPOTIFY_CLIENT_ID;

  let inserted = 0;
  let skipped = 0;
  let venuesCreated = 0;
  let artistsEnriched = 0;
  const errors: string[] = [];

  // Deduplicate within the scraped batch (same show may appear in Upcoming + Just Announced)
  const seen = new Set<string>();

  for (const show of shows) {
    const dedupeKey = `${show.ticketUrl ?? `${show.date}|${show.venueName}|${show.headliner}`}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    try {
      // Venue
      const venuesBefore = (await db.execute('SELECT COUNT(*) as n FROM venues')).rows[0]['n'];
      const venueId = await getOrCreateVenue(db, show.venueName, show.venueAddress);
      const venuesAfter = (await db.execute('SELECT COUNT(*) as n FROM venues')).rows[0]['n'];
      if (Number(venuesAfter) > Number(venuesBefore)) venuesCreated++;

      // Duplicate check
      if (await showExists(db, show.ticketUrl, show.date, venueId, show.headliner)) {
        skipped++;
        continue;
      }

      // Insert show
      const showResult = await db.execute({
        sql: 'INSERT INTO shows (venue_id, date, doors_time, show_time, price_min, price_max, ticket_url, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [venueId, show.date, show.doorsTime, show.showTime, show.priceMin, show.priceMax, show.ticketUrl, show.sourceUrl],
      });
      const showId = Number(showResult.lastInsertRowid);

      // Generate show slug
      const headlinerBase = toSlug(show.headliner);
      const venueBase = toSlug(show.venueName);
      const showSlugBase = `${headlinerBase}-at-${venueBase}-${show.date}`;
      const showSlug = await uniqueSlug(db, 'shows', showSlugBase, showId);
      await db.execute({ sql: 'UPDATE shows SET slug = ? WHERE id = ?', args: [showSlug, showId] });

      // Artists (headliner first, then supporting)
      const artistNames = [show.headliner, ...show.supporting];
      for (let i = 0; i < artistNames.length; i++) {
        const name = artistNames[i].trim();
        if (!name) continue;

        // Use show poster only for headliner (index 0)
        const photoFallback = i === 0 ? show.imageUrl : null;
        const { id: artistId, wasCreated } = await getOrCreateArtist(db, name, photoFallback, enrichSpotify);
        if (wasCreated && enrichSpotify) artistsEnriched++;

        // Small delay to respect Spotify rate limits
        if (enrichSpotify && wasCreated) await new Promise((r) => setTimeout(r, 150));

        await db.execute({
          sql: 'INSERT OR IGNORE INTO show_artists (show_id, artist_id, sort_order) VALUES (?, ?, ?)',
          args: [showId, artistId, i],
        });
      }

      inserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${show.headliner} @ ${show.venueName} ${show.date}: ${msg}`);
    }
  }

  return {
    source: sourceName,
    inserted,
    skipped,
    venuesCreated,
    artistsEnriched,
    errors,
    durationMs: Date.now() - start,
  };
}
