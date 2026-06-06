/**
 * Showpaper — Data cleanup script
 *
 * Fixes:
 *  1. Artist names that include tour/subtitle cruft → strip to real artist name
 *  2. Event-title headliners stored as wrong artist → rename to correct artist
 *  3. Joined "Artist A x Artist B" entries → split into separate artist rows
 *  4. Re-run Spotify search for artists that failed due to special chars
 *
 * Usage:
 *   node scripts/cleanup-data.mjs           # dry run
 *   node scripts/cleanup-data.mjs --write   # apply to DB
 */

import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRITE = process.argv.includes('--write');

const db = createClient({ url: `file:${path.join(__dirname, '../data/showpaper.db')}` });

// ── 1. Tour-name / subtitle renames ─────────────────────────────────────────
// [currentName, cleanedName]
const RENAMES = [
  // Tour suffix after " - "
  ['Kishi Bashi - Sonderlust: 10th Anniversary Tour', 'Kishi Bashi'],
  ['Meet Me @ the Altar - The Worried Sick Summer Tour', 'Meet Me @ the Altar'],
  ['Plini - An Unnameable Desire North American Tour', 'Plini'],
  ['The Damned - Final Damnation 50', 'The Damned'],
  // Tour suffix after ":"
  ['Ax and the Hatchetmen: The Late Checkout Tour 2026', 'Ax and the Hatchetmen'],
  ['Enter Shikari: North America Tour 2026', 'Enter Shikari'],
  // Event title — real artist is different
  ['Hawk Dawg: Cut Copy (DJ Set)', 'Cut Copy'],
  // Festival stored as single headliner — rename to just the headlining act
  ['MeadowFest 2026: Cimafunk, Chuwi, Combo Chimbita & More!', 'Cimafunk'],
  // Documentary screening
  ['Big Boys Documentary: You Can Color Outside The Lines', 'Big Boys'],
];

// ── 2. Split "Artist A & Artist B" / "Artist A x Artist B" ──────────────────
// [currentName, [artist1, artist2, ...]]
const SPLITS = [
  ['Quicksand & BANE', ['Quicksand', 'BANE']],
  ['Famous Friend x The Citie x Floats', ['Famous Friend', 'The Citie', 'Floats']],
];

// ── Spotify helpers (for re-enrichment of fixed artists) ────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx > 0) {
      let val = t.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      env[t.slice(0, idx).trim()] = val;
    }
  }
  return env;
}

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = loadEnv();
let _token = null, _tokenExpiry = 0;

async function getSpotifyToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;
  const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) return null;
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

async function spotifyEnrich(name) {
  const token = await getSpotifyToken();
  if (!token) return null;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=3`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = (data.artists?.items ?? []).find((a) => norm(a.name) === norm(name));
  if (!match) return null;

  // Get top-track preview
  const trackRes = await fetch(`https://api.spotify.com/v1/artists/${match.id}/top-tracks?market=US`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const trackData = await trackRes.json();
  const preview_url = (trackData.tracks ?? []).find((t) => t.preview_url)?.preview_url ?? null;

  return {
    spotify_id: match.id,
    photo_url: match.images[0]?.url ?? null,
    preview_url,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${WRITE ? 'WRITE' : 'DRY RUN'}\n`);

  // ── Step 1: Renames ──────────────────────────────────────────────────────
  console.log('── Step 1: Rename artist entries ───────────────────────────────');
  for (const [from, to] of RENAMES) {
    const row = await db.execute({ sql: 'SELECT id, spotify_id FROM artists WHERE name = ?', args: [from] });
    if (!row.rows.length) { console.log(`  SKIP (not found): "${from}"`); continue; }
    const id = Number(row.rows[0]['id']);
    const hasSpotify = !!row.rows[0]['spotify_id'];

    // Check if target name already exists (merge if so)
    const existing = await db.execute({ sql: 'SELECT id FROM artists WHERE name = ? AND id != ?', args: [to, id] });
    if (existing.rows.length) {
      const keepId = Number(existing.rows[0]['id']);
      console.log(`  MERGE  [${id}] "${from}" → [${keepId}] "${to}" (target already exists)`);
      if (WRITE) {
        await db.execute({ sql: 'UPDATE OR IGNORE show_artists SET artist_id = ? WHERE artist_id = ?', args: [keepId, id] });
        await db.execute({ sql: 'DELETE FROM show_artists WHERE artist_id = ?', args: [id] });
        await db.execute({ sql: 'DELETE FROM artists WHERE id = ?', args: [id] });
      }
    } else {
      console.log(`  RENAME [${id}] "${from}" → "${to}"`);
      if (WRITE) {
        await db.execute({ sql: 'UPDATE artists SET name = ? WHERE id = ?', args: [to, id] });
        // Re-enrich with Spotify if not already done
        if (!hasSpotify) {
          await new Promise(r => setTimeout(r, 200));
          const spotify = await spotifyEnrich(to);
          if (spotify) {
            await db.execute({
              sql: 'UPDATE artists SET spotify_id = ?, photo_url = ?, preview_url = ? WHERE id = ?',
              args: [spotify.spotify_id, spotify.photo_url, spotify.preview_url, id],
            });
            console.log(`    + Spotify enriched "${to}"`);
          }
        }
      }
    }
  }

  // ── Step 2: Splits ───────────────────────────────────────────────────────
  console.log('\n── Step 2: Split joined artist entries ─────────────────────────');
  for (const [from, toArr] of SPLITS) {
    const row = await db.execute({ sql: 'SELECT id FROM artists WHERE name = ?', args: [from] });
    if (!row.rows.length) { console.log(`  SKIP (not found): "${from}"`); continue; }
    const fromId = Number(row.rows[0]['id']);

    // Get all shows this joined artist is on
    const showLinks = await db.execute({ sql: 'SELECT show_id, sort_order FROM show_artists WHERE artist_id = ?', args: [fromId] });
    console.log(`  SPLIT [${fromId}] "${from}" → [${toArr.join(', ')}] (${showLinks.rows.length} show(s))`);

    if (WRITE) {
      for (let i = 0; i < toArr.length; i++) {
        const name = toArr[i];
        // Find or create each artist
        const existing = await db.execute({ sql: 'SELECT id FROM artists WHERE name = ?', args: [name] });
        let artistId;
        if (existing.rows.length) {
          artistId = Number(existing.rows[0]['id']);
          console.log(`    + Using existing [${artistId}] "${name}"`);
        } else {
          await new Promise(r => setTimeout(r, 200));
          const spotify = await spotifyEnrich(name);
          const r = await db.execute({
            sql: 'INSERT INTO artists (name, photo_url, spotify_id, preview_url) VALUES (?, ?, ?, ?)',
            args: [name, spotify?.photo_url ?? null, spotify?.spotify_id ?? null, spotify?.preview_url ?? null],
          });
          artistId = Number(r.lastInsertRowid);
          console.log(`    + Created [${artistId}] "${name}"${spotify ? ' (Spotify enriched)' : ''}`);
        }
        // Link to all shows the joined artist was on
        for (const link of showLinks.rows) {
          const sortOrder = Number(link['sort_order']) + i;
          await db.execute({
            sql: 'INSERT OR IGNORE INTO show_artists (show_id, artist_id, sort_order) VALUES (?, ?, ?)',
            args: [Number(link['show_id']), artistId, sortOrder],
          });
        }
      }
      // Remove the original joined entry
      await db.execute({ sql: 'DELETE FROM show_artists WHERE artist_id = ?', args: [fromId] });
      await db.execute({ sql: 'DELETE FROM artists WHERE id = ?', args: [fromId] });
    }
  }

  // ── Step 3: Re-enrich artists that failed due to special chars ───────────
  const REENRICH = ["The Flamin' Groovies", 'Dan Melchior SECT'];
  console.log('\n── Step 3: Re-enrich artists that previously failed Spotify ────');
  for (const name of REENRICH) {
    await new Promise(r => setTimeout(r, 200));
    const row = await db.execute({ sql: 'SELECT id FROM artists WHERE name = ?', args: [name] });
    if (!row.rows.length) { console.log(`  SKIP (not found): "${name}"`); continue; }
    const id = Number(row.rows[0]['id']);
    const spotify = await spotifyEnrich(name);
    if (spotify) {
      console.log(`  ✔ Found on Spotify: "${name}"`);
      if (WRITE) {
        await db.execute({
          sql: 'UPDATE artists SET spotify_id = ?, photo_url = ?, preview_url = ? WHERE id = ?',
          args: [spotify.spotify_id, spotify.photo_url, spotify.preview_url, id],
        });
      }
    } else {
      console.log(`  ✗ Still not found: "${name}"`);
    }
  }

  console.log(`\nDone ${WRITE ? '(changes written to DB)' : '(dry run — add --write to apply)'}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
