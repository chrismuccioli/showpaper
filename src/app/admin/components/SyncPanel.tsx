'use client';

import { useState, useEffect, useCallback } from 'react';

interface Source {
  id: number;
  name: string;
  url: string;
  sourceType: string;
  city: string;
  enabled: boolean;
  status: 'active' | 'failing' | 'disabled';
  lastSyncedAt: string | null;
  lastResult: { inserted: number; skipped: number } | null;
  lastError: string | null;
  consecutiveFailures: number;
}

interface DetectResult {
  canScrape: boolean;
  sourceType: string;
  venueName: string | null;
  city: string | null;
  previewCount: number;
  sampleShows: { headliner: string; date: string; venue: string }[];
  failureReason?: string;
  suggestion?: { platform: string; message: string; searchUrl: string };
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  'resound':         { label: 'Resound',    color: '#5c1ab5' },
  'antones':         { label: 'Custom',     color: '#1a6e7a' },
  'songkick-venue':  { label: 'Songkick',   color: '#e53333' },
  'thirteenthfloor': { label: 'Custom',     color: '#1a6e7a' },
  'prekindle':       { label: 'Prekindle',  color: '#c47a00' },
  'unknown':         { label: '?',          color: '#888' },
};

const STATUS_COLOR: Record<string, string> = {
  active: '#090', failing: '#e07000', disabled: '#c00',
};

function fmtAgo(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SyncPanel({ city }: { city: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | 'all' | null>(null);
  const [skipSpotify, setSkipSpotify] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [detectUrl, setDetectUrl] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveCity, setSaveCity] = useState(city);
  const [saving, setSaving] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/scrape/sources?city=${encodeURIComponent(city)}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      if (Array.isArray(data)) setSources(data);
    } catch (e) {
      console.error('Failed to load sync sources:', e);
    }
    setLoading(false);
  }, [city]);

  useEffect(() => { loadSources(); }, [loadSources]);

  const syncSource = async (id: number | 'all') => {
    setSyncingId(id);
    try {
      const p = new URLSearchParams();
      if (id !== 'all') p.set('source_id', String(id));
      // For 'all', POST /api/scrape will run all enabled sources;
      // city filtering happens because sources are already city-scoped
      if (skipSpotify) p.set('skip_spotify', '1');
      await fetch(`/api/scrape?${p}`, { method: 'POST' });
      await loadSources();
    } finally { setSyncingId(null); }
  };

  const toggleEnabled = async (s: Source) => {
    await fetch(`/api/scrape/sources/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await loadSources();
  };

  const deleteSource = async (id: number) => {
    if (!confirm('Remove this source?')) return;
    await fetch(`/api/scrape/sources/${id}`, { method: 'DELETE' });
    await loadSources();
  };

  const detect = async () => {
    if (!detectUrl.trim()) return;
    setDetecting(true); setDetectResult(null);
    try {
      const res = await fetch('/api/scrape/detect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: detectUrl }),
      });
      const data = await res.json();
      setDetectResult(data);
      if (data.venueName) setSaveName(data.venueName);
      if (data.city) setSaveCity(data.city);
    } finally { setDetecting(false); }
  };

  const saveSource = async () => {
    if (!detectResult?.canScrape || !saveName) return;
    setSaving(true);
    try {
      await fetch('/api/scrape/sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName, url: detectUrl, sourceType: detectResult.sourceType, city: saveCity }),
        // Note: saveCity is pre-filled from detect result but editable
      });
      setShowAdd(false); setDetectUrl(''); setDetectResult(null); setSaveName('');
      await loadSources();
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = { border: '1px solid #ccc', padding: '3px 5px', fontSize: 12, width: '100%' };

  if (loading) return <div style={{ fontSize: 12, color: '#888', padding: 8 }}>Loading…</div>;

  const enabledCount = sources.filter((s) => s.enabled).length;

  return (
    <div style={{ border: '1px solid #ddd', padding: 12, background: '#fff', marginBottom: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Sync Sources · <span style={{ color: '#551A8B' }}>{city}</span></strong>
        <span style={{ fontSize: 11, color: '#888' }}>{enabledCount} of {sources.length} enabled</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={skipSpotify} onChange={(e) => setSkipSpotify(e.target.checked)} />
          skip Spotify
        </label>
        <button onClick={() => syncSource('all')} disabled={syncingId !== null || enabledCount === 0}
          style={{ padding: '4px 12px', background: '#551A8B', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}>
          {syncingId === 'all' ? 'Syncing…' : '↓ Sync All'}
        </button>
        <button onClick={() => { setShowAdd((v) => !v); setDetectResult(null); setDetectUrl(''); }}
          style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#eee', border: '1px solid #ccc', borderRadius: 3 }}>
          {showAdd ? '✕ Cancel' : '+ Add Source'}
        </button>
      </div>

      {/* Sources table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #551A8B' }}>
            {['Source', 'Type', 'Last sync', ''].map((h) => (
              <th key={h} style={{ textAlign: h === '' ? 'right' : 'left', padding: '3px 8px 3px 0', color: '#666', fontWeight: 'normal', fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const t = TYPE_LABELS[s.sourceType] ?? TYPE_LABELS.unknown;
            const syncing = syncingId === s.id;
            return (
              <tr key={s.id} style={{ borderBottom: '1px solid #eee', opacity: s.enabled ? 1 : 0.5 }}>
                <td style={{ padding: '6px 8px 6px 0' }}>
                  <div style={{ fontWeight: 'bold', color: s.enabled ? '#222' : '#888' }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: '#bbb', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
                  {s.lastError && (
                    <div style={{ fontSize: 10, color: '#c00' }} title={s.lastError}>
                      ⚠ {s.consecutiveFailures} failure{s.consecutiveFailures !== 1 ? 's' : ''}: {s.lastError.slice(0, 50)}
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px 8px 6px 0' }}>
                  <span style={{ fontSize: 10, background: t.color, color: '#fff', padding: '1px 5px', borderRadius: 10 }}>{t.label}</span>
                  <span style={{ display: 'block', fontSize: 10, color: STATUS_COLOR[s.status] ?? '#888', marginTop: 2 }}>{s.status}</span>
                </td>
                <td style={{ padding: '6px 8px 6px 0', color: '#666', fontSize: 11 }}>
                  <div>{fmtAgo(s.lastSyncedAt)}</div>
                  {s.lastResult && <div style={{ fontSize: 10, color: '#888' }}>+{s.lastResult.inserted} / {s.lastResult.skipped} skip</div>}
                </td>
                <td style={{ padding: '6px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => syncSource(s.id)} disabled={syncing || syncingId !== null}
                    style={{ fontSize: 11, padding: '2px 7px', cursor: 'pointer', marginRight: 3, background: '#551A8B', color: '#fff', border: 'none', borderRadius: 3 }}>
                    {syncing ? '…' : '↓'}
                  </button>
                  <button onClick={() => toggleEnabled(s)} title={s.enabled ? 'Disable' : 'Enable'}
                    style={{ fontSize: 11, padding: '2px 7px', cursor: 'pointer', marginRight: 3 }}>
                    {s.enabled ? '⏸' : '▶'}
                  </button>
                  <button onClick={() => deleteSource(s.id)}
                    style={{ fontSize: 11, padding: '2px 7px', cursor: 'pointer', color: '#c00' }}>✕</button>
                </td>
              </tr>
            );
          })}
          {sources.length === 0 && (
            <tr><td colSpan={4} style={{ padding: 12, color: '#888', textAlign: 'center' }}>No sources yet.</td></tr>
          )}
        </tbody>
      </table>

      {/* Add Source form */}
      {showAdd && (
        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 6 }}>Add Sync Source</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input value={detectUrl} onChange={(e) => { setDetectUrl(e.target.value); setDetectResult(null); }}
              placeholder="Paste a venue URL (Resound, Songkick, Antone's, 13th Floor…)"
              style={{ ...inp, flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && detect()} />
            <button onClick={detect} disabled={detecting || !detectUrl.trim()}
              style={{ padding: '3px 12px', fontSize: 12, cursor: 'pointer', background: '#eee', border: '1px solid #ccc', whiteSpace: 'nowrap' }}>
              {detecting ? 'Testing…' : 'Test URL'}
            </button>
          </div>

          {/* DetectResult card */}
          {detectResult && (
            <div style={{ border: `1px solid ${detectResult.canScrape ? '#090' : '#e07000'}`, borderRadius: 4, padding: 10, marginBottom: 8, fontSize: 12, background: detectResult.canScrape ? '#f0fff4' : '#fff8f0' }}>
              {detectResult.canScrape ? (
                <>
                  <div style={{ color: '#090', fontWeight: 'bold', marginBottom: 6 }}>
                    ✓ {detectResult.previewCount} shows found · {detectResult.venueName} · {detectResult.city}
                  </div>
                  {detectResult.sampleShows.map((s, i) => (
                    <div key={i} style={{ color: '#555', fontSize: 11, marginBottom: 1 }}>{s.date} · {s.headliner}</div>
                  ))}
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Name</label>
                      <input value={saveName} onChange={(e) => setSaveName(e.target.value)} style={{ ...inp, width: 180 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>City</label>
                      <input value={saveCity} onChange={(e) => setSaveCity(e.target.value)} style={{ ...inp, width: 100 }} />
                    </div>
                    <button onClick={saveSource} disabled={saving || !saveName.trim()}
                      style={{ padding: '5px 14px', background: '#551A8B', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}>
                      {saving ? 'Saving…' : 'Save Source'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: '#c07000', fontWeight: 'bold', marginBottom: 4 }}>⚠ Can&apos;t sync this URL directly</div>
                  <div style={{ color: '#555', marginBottom: 6 }}>{detectResult.failureReason}</div>
                  {detectResult.suggestion && (
                    <div style={{ fontSize: 11, background: '#fff', border: '1px solid #ddd', padding: '6px 8px', borderRadius: 3 }}>
                      {detectResult.suggestion.message}{' '}
                      <a href={detectResult.suggestion.searchUrl} target="_blank" rel="noreferrer" style={{ color: '#3c12b1' }}>
                        Search Songkick →
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
