/**
 * Showpaper — Artist enrichment script
 *
 * 1. Deduplicates artists with the same name (merges show_artists references)
 * 2. Searches Spotify for each unique artist → photo + spotify_id + preview_url
 *
 * Usage:
 *   node scripts/enrich-artists.mjs             # dry run
 *   node scripts/enrich-artists.mjs --write      # write to DB
 *
 * Reads SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET from .env.local
 */

import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRITE = process.argv.includes('--write');

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  if (!existsSync(envPath)) throw new Error('Missing .env.local — add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET || CLIENT_ID === 'your_spotify_client_id_here') {
  console.error('Set real SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local');
  process.exit(1);
}

// ── Spotify helpers ──────────────────────────────────────────────────────────
let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Spotify auth failed: ${JSON.stringify(data)}`);
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

async function searchArtist(name) {
  const token = await getToken();
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=3`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.artists?.items ?? [];
}

async function getArtistTopTrack(spotifyId) {
  const token = await getToken();
  const res = await fetch(`https://api.spotify.com/v1/artists/${spotifyId}/top-tracks?market=US`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const track = (data.tracks ?? []).find((t) => t.preview_url);
  return track?.preview_url ?? null;
}

// Basic name similarity (avoid matching "Wavves" with "Wavves Tribute Band" etc.)
function nameSimilar(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(a) === norm(b);
}

// ── DB ───────────────────────────────────────────────────────────────────────
const db = createClient({ url: `file:${path.join(__dirname, '../data/showpaper.db')}` });

// ── Step 1: Dedup artists ────────────────────────────────────────────────────
async function dedup() {
  const rows = await db.execute('SELECT id, name FROM artists ORDER BY name ASC, id ASC');
  const byName = {};
  for (const r of rows.rows) {
    const name = String(r['name']).trim();
    if (!byName[name]) byName[name] = [];
    byName[name].push(Number(r['id']));
  }

  let mergedCount = 0;
  for (const [name, ids] of Object.entries(byName)) {
    if (ids.length <= 1) continue;
    const [keep, ...dupes] = ids;
    console.log(`  DEDUP "${name}": keep id=${keep}, remove ids=[${dupes.join(',')}]`);
    if (WRITE) {
      for (const dupeId of dupes) {
        // Re-point show_artists from dupe → keep (skip if that show already has keep)
        await db.execute({
          sql: `UPDATE OR IGNORE show_artists SET artist_id = ? WHERE artist_id = ?`,
          args: [keep, dupeId],
        });
        // Delete any remaining (conflicting) dupe references
        await db.execute({ sql: 'DELETE FROM show_artists WHERE artist_id = ?', args: [dupeId] });
        await db.execute({ sql: 'DELETE FROM artists WHERE id = ?', args: [dupeId] });
      }
    }
    mergedCount += dupes.length;
  }
  console.log(`Dedup: ${mergedCount} duplicate artist rows ${WRITE ? 'removed' : '(dry run)'}\n`);
}

// ── Step 2: Spotify enrichment ───────────────────────────────────────────────
async function enrich() {
  const rows = await db.execute('SELECT id, name, spotify_id FROM artists ORDER BY name ASC');
  const artists = rows.rows.map((r) => ({
    id: Number(r['id']),
    name: String(r['name']),
    spotify_id: r['spotify_id'] ? String(r['spotify_id']) : null,
  }));

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const artist of artists) {
    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 150));

    const results = await searchArtist(artist.name);
    const match = results.find((r) => nameSimilar(r.name, artist.name));

    if (!match) {
      console.log(`  ✗ NOT FOUND: ${artist.name}`);
      notFound++;
      continue;
    }

    const photo = match.images[0]?.url ?? null;
    const previewUrl = await getArtistTopTrack(match.id);

    console.log(`  ✔ ${artist.name} → ${match.name} (pop:${match.popularity})${previewUrl ? ' [preview]' : ''}`);

    if (WRITE) {
      await db.execute({
        sql: 'UPDATE artists SET spotify_id = ?, photo_url = ?, preview_url = ? WHERE id = ?',
        args: [match.id, photo, previewUrl, artist.id],
      });
    }
    updated++;
  }

  console.log(`\nEnrichment: ${updated} updated, ${skipped} skipped, ${notFound} not found ${WRITE ? '(written)' : '(dry run)'}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${WRITE ? 'WRITE' : 'DRY RUN'}\n`);

  console.log('── Step 1: Dedup duplicate artists ─────────────────────────');
  await dedup();

  console.log('── Step 2: Spotify enrichment ───────────────────────────────');
  await enrich();
}

main().catch((err) => { console.error(err); process.exit(1); });
