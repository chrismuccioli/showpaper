/**
 * Generate clean URL slugs for all artists, venues, and shows.
 * Run once after schema migration, safe to re-run (skips already-slugged records).
 *
 * Usage:  node scripts/generate-slugs.mjs
 */

import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = createClient({ url: `file:${path.join(__dirname, '../data/showpaper.db')}` });

function toSlug(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Get a unique slug by appending -2, -3 etc. if needed */
async function uniqueSlug(table, base, excludeId) {
  let slug = base;
  let n = 2;
  while (true) {
    const row = await db.execute({
      sql: `SELECT id FROM ${table} WHERE slug = ? AND id != ?`,
      args: [slug, excludeId],
    });
    if (!row.rows.length) return slug;
    slug = `${base}-${n++}`;
  }
}

async function main() {
  // Ensure slug columns exist
  for (const table of ['artists', 'venues', 'shows']) {
    try { await db.execute(`ALTER TABLE ${table} ADD COLUMN slug TEXT`); } catch {}
  }

  console.log('── Generating venue slugs ───────────────────────────────────');
  const venues = await db.execute('SELECT id, name FROM venues');
  for (const v of venues.rows) {
    const id = Number(v['id']);
    const base = toSlug(String(v['name']));
    const slug = await uniqueSlug('venues', base, id);
    await db.execute({ sql: 'UPDATE venues SET slug = ? WHERE id = ?', args: [slug, id] });
    console.log(`  [${id}] ${v['name']} → ${slug}`);
  }

  console.log('\n── Generating artist slugs ──────────────────────────────────');
  const artists = await db.execute('SELECT id, name FROM artists');
  for (const a of artists.rows) {
    const id = Number(a['id']);
    const base = toSlug(String(a['name']));
    const slug = await uniqueSlug('artists', base, id);
    await db.execute({ sql: 'UPDATE artists SET slug = ? WHERE id = ?', args: [slug, id] });
    console.log(`  [${id}] ${a['name']} → ${slug}`);
  }

  console.log('\n── Generating show slugs ────────────────────────────────────');
  const shows = await db.execute(`
    SELECT s.id, s.date, v.slug as venue_slug,
           (SELECT a.slug FROM show_artists sa JOIN artists a ON sa.artist_id = a.id
            WHERE sa.show_id = s.id ORDER BY sa.sort_order ASC LIMIT 1) as headliner_slug
    FROM shows s JOIN venues v ON s.venue_id = v.id
  `);
  for (const s of shows.rows) {
    const id = Number(s['id']);
    const headliner = s['headliner_slug'] ? String(s['headliner_slug']) : 'show';
    const venue = s['venue_slug'] ? String(s['venue_slug']) : 'venue';
    const date = String(s['date']); // YYYY-MM-DD
    const base = `${headliner}-at-${venue}-${date}`;
    const slug = await uniqueSlug('shows', base, id);
    await db.execute({ sql: 'UPDATE shows SET slug = ? WHERE id = ?', args: [slug, id] });
    console.log(`  [${id}] ${slug}`);
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
