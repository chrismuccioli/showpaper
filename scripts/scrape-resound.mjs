/**
 * Resound Presents scraper
 * Fetches upcoming shows from resoundpresents.com and inserts Austin-only
 * shows into the local ATX Shows database.
 *
 * Usage:
 *   node scripts/scrape-resound.mjs           # dry run (preview only)
 *   node scripts/scrape-resound.mjs --insert   # insert into DB
 */

import * as cheerio from 'cheerio';
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes('--insert');

// ── Known Austin venues ────────────────────────────────────────────────────
// Resound also books in San Antonio (Paper Tiger), Dallas (Trees, Longhorn
// Ballroom), and Fort Worth (Tulips). Filter those out.
const AUSTIN_VENUES = {
  'Mohawk':                 '912 Red River St, Austin, TX 78701',
  '29th Street Ballroom':   '3005 S Lamar Blvd, Austin, TX 78704',
  'Hotel Vegas':            '1502 E 6th St, Austin, TX 78702',
  'Central Machine Works':  '4824 E Cesar Chavez St, Austin, TX 78702',
  'RADIO/EAST':             '4701 E 5th St, Austin, TX 78702',
  'Kingdom':                '2710 E 2nd St, Austin, TX 78702',
  'Brushy Street Commons':  '1645 E 6th St, Austin, TX 78702',
  "Hole in the Wall":       '2538 Guadalupe St, Austin, TX 78705',
  "Parish":                 '214 E 6th St, Austin, TX 78701',
  "Stubb's":                '801 Red River St, Austin, TX 78701',
  "State Theatre":          '719 Congress Ave, Austin, TX 78701',
  "Long Center":            '701 W Riverside Dr, Austin, TX 78704',
  "Emo's Austin":           '2015 E Riverside Dr, Austin, TX 78741',
  "Emo's":                  '2015 E Riverside Dr, Austin, TX 78741',
  "Antone's":               '305 E 5th St, Austin, TX 78701',
  "Antone's Nightclub":     '305 E 5th St, Austin, TX 78701',
  'AM/FM':                  '300 W 6th St, Austin, TX 78701',
  "Austin City Limits Live at the Moody Center": '2001 Robert Dedman Dr, Austin, TX 78712',
};

// ── Date parsing ───────────────────────────────────────────────────────────
const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

function parseDate(str) {
  // e.g. "Sat Jun 6" or "Wed Jun 10"
  const parts = str.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const monthName = parts[1];
  const day = parseInt(parts[2], 10);
  const monthIdx = MONTHS[monthName];
  if (monthIdx === undefined || isNaN(day)) return null;

  const now = new Date();
  let year = now.getFullYear();
  // If this month/day is earlier than today, bump to next year
  const candidate = new Date(year, monthIdx, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    year += 1;
  }
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTime(str) {
  // e.g. "7:00PM" → "19:00"
  if (!str) return null;
  const m = str.match(/^(\d+):(\d{2})(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function parsePrice(str) {
  // e.g. "$20.00-$25.00" | "21+, $20.00-$25.00" | "$0.00" | ""
  if (!str) return { price_min: null, price_max: null };
  // Strip age restriction prefix
  const cleaned = str.replace(/^\d+\+,?\s*/i, '').trim();
  const range = cleaned.match(/\$(\d+(?:\.\d+)?)-\$(\d+(?:\.\d+)?)/);
  if (range) {
    return { price_min: parseFloat(range[1]), price_max: parseFloat(range[2]) };
  }
  const single = cleaned.match(/\$(\d+(?:\.\d+)?)/);
  if (single) {
    const val = parseFloat(single[1]);
    return { price_min: val, price_max: val };
  }
  return { price_min: null, price_max: null };
}

// ── DB helpers ─────────────────────────────────────────────────────────────
async function getOrCreateVenue(db, name, address) {
  const existing = await db.execute({
    sql: 'SELECT id FROM venues WHERE name = ?',
    args: [name],
  });
  if (existing.rows.length) return Number(existing.rows[0]['id']);

  const result = await db.execute({
    sql: 'INSERT INTO venues (name, address, city) VALUES (?, ?, ?)',
    args: [name, address, 'Austin'],
  });
  console.log(`  ✚ Created venue: ${name}`);
  return Number(result.lastInsertRowid);
}

async function showExists(db, ticketUrl, date, venueId, headliner) {
  if (ticketUrl) {
    const r = await db.execute({
      sql: 'SELECT id FROM shows WHERE source_url = ?',
      args: [ticketUrl],
    });
    if (r.rows.length) return true;
  }
  // Fallback: match on date + venue + first artist name
  const r2 = await db.execute({
    sql: `SELECT s.id FROM shows s
          JOIN show_artists sa ON s.id = sa.show_id
          JOIN artists a ON sa.artist_id = a.id
          WHERE s.date = ? AND s.venue_id = ? AND a.name = ? AND sa.sort_order = 0`,
    args: [date, venueId, headliner],
  });
  return r2.rows.length > 0;
}

async function insertShow(db, { venueId, date, doorsTime, showTime, priceMin, priceMax, ticketUrl, artists }) {
  const showResult = await db.execute({
    sql: 'INSERT INTO shows (venue_id, date, doors_time, show_time, price_min, price_max, ticket_url, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [venueId, date, doorsTime, showTime, priceMin, priceMax, ticketUrl, ticketUrl],
  });
  const showId = Number(showResult.lastInsertRowid);

  for (let i = 0; i < artists.length; i++) {
    const { name, photoUrl } = artists[i];
    const artistResult = await db.execute({
      sql: 'INSERT INTO artists (name, photo_url) VALUES (?, ?)',
      args: [name, photoUrl || null],
    });
    const artistId = Number(artistResult.lastInsertRowid);
    await db.execute({
      sql: 'INSERT OR IGNORE INTO show_artists (show_id, artist_id, sort_order) VALUES (?, ?, ?)',
      args: [showId, artistId, i],
    });
  }
  return showId;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching resoundpresents.com...');
  const res = await fetch('https://resoundpresents.com/');
  const html = await res.text();
  const $ = cheerio.load(html);

  const events = [];
  $('.seetickets-list-event-container').each((_, el) => {
    const headliner = $(el).find('.event-title a').first().text().trim();
    const supportingRaw = $(el).find('.supporting-talent').text().trim();
    const supporting = supportingRaw ? supportingRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const dateStr = $(el).find('.event-date').text().trim();
    const doorsRaw = $(el).find('.see-doortime').text().trim();
    const showRaw = $(el).find('.see-showtime').text().trim();
    const venueRaw = $(el).find('.venue').text().trim();
    const venueName = venueRaw.replace(/^at\s+/i, '').trim();
    const priceRaw = $(el).find('.price').text().trim();
    const ticketUrl = $(el).find('a.seetickets-buy-btn').attr('href') || '';
    const imageUrl = $(el).find('.seetickets-list-view-event-image').attr('src') || '';

    if (!headliner || !dateStr || !venueName) return;

    const date = parseDate(dateStr);
    if (!date) return;

    events.push({
      headliner,
      supporting,
      date,
      dateStr,
      doorsTime: parseTime(doorsRaw),
      showTime: parseTime(showRaw),
      venueName,
      priceRaw,
      ...parsePrice(priceRaw),
      ticketUrl: ticketUrl || null,
      imageUrl: imageUrl || null,
    });
  });

  // Filter to Austin venues only
  const austinEvents = events.filter(e => AUSTIN_VENUES[e.venueName] !== undefined);
  const skippedVenues = [...new Set(events.filter(e => !AUSTIN_VENUES[e.venueName]).map(e => e.venueName))];

  console.log(`\nFound ${events.length} total events, ${austinEvents.length} in Austin`);
  if (skippedVenues.length) {
    console.log(`Skipped non-Austin venues: ${skippedVenues.join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('\n── DRY RUN (pass --insert to write to DB) ───────────────\n');
    for (const e of austinEvents) {
      const artists = [e.headliner, ...e.supporting].join(', ');
      console.log(`${e.date}  ${(e.showTime || '?:??').padEnd(5)}  ${e.venueName.padEnd(25)}  ${artists}`);
      if (e.priceRaw) console.log(`          price: ${e.priceRaw}`);
    }
    console.log(`\nTotal to insert: ${austinEvents.length} shows`);
    return;
  }

  // ── Insert ──────────────────────────────────────────────────────────────
  const db = createClient({
    url: `file:${path.join(__dirname, '../data/showpaper.db')}`,
  });

  // Ensure schema
  await db.batch([
    `CREATE TABLE IF NOT EXISTS venues (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, city TEXT NOT NULL DEFAULT 'Austin', website TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS shows (id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER NOT NULL, date TEXT NOT NULL, doors_time TEXT, show_time TEXT, price_min REAL, price_max REAL, ticket_url TEXT, source_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS artists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, photo_url TEXT, spotify_id TEXT, apple_music_url TEXT, preview_url TEXT, bandcamp_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS show_artists (show_id INTEGER NOT NULL, artist_id INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (show_id, artist_id))`,
  ], 'write');

  let inserted = 0;
  let skipped = 0;

  for (const e of austinEvents) {
    const venueId = await getOrCreateVenue(db, e.venueName, AUSTIN_VENUES[e.venueName]);
    const exists = await showExists(db, e.ticketUrl, e.date, venueId, e.headliner);

    if (exists) {
      console.log(`  ~ Skipped (exists): ${e.date} ${e.headliner} @ ${e.venueName}`);
      skipped++;
      continue;
    }

    const artists = [
      { name: e.headliner, photoUrl: e.imageUrl },
      ...e.supporting.map(name => ({ name, photoUrl: null })),
    ];

    await insertShow(db, {
      venueId,
      date: e.date,
      doorsTime: e.doorsTime,
      showTime: e.showTime,
      priceMin: e.price_min,
      priceMax: e.price_max,
      ticketUrl: e.ticketUrl,
      artists,
    });

    console.log(`  ✔ Inserted: ${e.date} ${e.headliner} @ ${e.venueName}`);
    inserted++;
  }

  console.log(`\nDone. Inserted: ${inserted}  Skipped: ${skipped}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
