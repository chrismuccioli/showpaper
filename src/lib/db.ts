import 'server-only';
import { createClient, type Client } from '@libsql/client';
import path from 'path';
import fs from 'fs';

// Singleton: reuse the same client across hot-reloads in dev
const g = globalThis as typeof globalThis & {
  _atxDb?: Client;
  _atxDbReady?: Promise<void>;
};

function getClient(): Client {
  if (!g._atxDb) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    g._atxDb = createClient({
    url: `file:${path.join(dataDir, 'showpaper.db')}`,
    });
  }
  return g._atxDb;
}

async function initSchema(client: Client): Promise<void> {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS venues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        city TEXT NOT NULL DEFAULT 'Austin',
        website TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venue_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        doors_time TEXT,
        show_time TEXT,
        price_min REAL,
        price_max REAL,
        ticket_url TEXT,
        source_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        photo_url TEXT,
        spotify_id TEXT,
        apple_music_url TEXT,
        preview_url TEXT,
        bandcamp_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS show_artists (
        show_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (show_id, artist_id)
      )`,
    ],
    'write'
  );
}

async function migrateSlugColumns(client: Client): Promise<void> {
  // Add slug columns if not present (SQLite doesn't support IF NOT EXISTS on ALTER)
  for (const table of ['artists', 'venues', 'shows'] as const) {
    try { await client.execute(`ALTER TABLE ${table} ADD COLUMN slug TEXT`); } catch { /* already exists */ }
  }
}

export async function getDb(): Promise<Client> {
  const client = getClient();
  if (!g._atxDbReady) {
    g._atxDbReady = initSchema(client).then(() => migrateSlugColumns(client));
  }
  await g._atxDbReady;
  return client;
}
