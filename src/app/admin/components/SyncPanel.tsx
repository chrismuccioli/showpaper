'use client';

import { useState } from 'react';

interface SyncResult {
  ok: boolean;
  source?: string;
  inserted?: number;
  skipped?: number;
  venuesCreated?: number;
  artistsEnriched?: number;
  errors?: string[];
  durationMs?: number;
  error?: string;
  skippedVenues?: string[];
}

export default function SyncPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [skipSpotify, setSkipSpotify] = useState(false);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ source: 'resound' });
      if (skipSpotify) params.set('skip_spotify', '1');
      const res = await fetch(`/api/scrape?${params}`, { method: 'POST' });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ border: '1px solid #ddd', padding: 12, background: '#fff', marginBottom: 16 }}>
      <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>Sync Shows</div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        {/* Source badge */}
        <span style={{ fontSize: 11, background: '#eee', padding: '2px 8px', borderRadius: 3, color: '#555' }}>
          resoundpresents.com
        </span>

        {/* Skip Spotify toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={skipSpotify}
            onChange={(e) => setSkipSpotify(e.target.checked)}
          />
          skip Spotify enrichment (faster)
        </label>

        {/* Trigger button */}
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: '5px 14px',
            background: running ? '#999' : '#551A8B',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            cursor: running ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 'bold',
          }}
        >
          {running ? 'Syncing…' : '↓ Sync Now'}
        </button>
      </div>

      {running && (
        <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>
          Fetching resoundpresents.com and ingesting new shows
          {!skipSpotify ? ' + enriching artists with Spotify' : ''}…
          this may take 20–40 seconds.
        </div>
      )}

      {/* Results */}
      {result && !running && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          {result.ok ? (
            <div>
              <div style={{ color: '#090', fontWeight: 'bold', marginBottom: 4 }}>
                ✓ Sync complete in {((result.durationMs ?? 0) / 1000).toFixed(1)}s
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: '#444' }}>
                <span><strong>{result.inserted}</strong> new shows added</span>
                <span><strong>{result.skipped}</strong> already existed</span>
                {(result.venuesCreated ?? 0) > 0 && <span><strong>{result.venuesCreated}</strong> new venues</span>}
                {(result.artistsEnriched ?? 0) > 0 && <span><strong>{result.artistsEnriched}</strong> artists enriched</span>}
              </div>
              {(result.errors ?? []).length > 0 && (
                <div style={{ marginTop: 6, color: '#c00' }}>
                  <strong>Errors ({result.errors!.length}):</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {result.errors!.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                    {result.errors!.length > 5 && <li>…and {result.errors!.length - 5} more</li>}
                  </ul>
                </div>
              )}
              {(result.skippedVenues ?? []).length > 0 && (
                <div style={{ marginTop: 4, color: '#888', fontSize: 11 }}>
                  Non-Austin venues skipped: {result.skippedVenues!.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#c00' }}>
              <strong>Sync failed:</strong> {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
