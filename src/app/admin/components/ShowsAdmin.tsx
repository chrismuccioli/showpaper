'use client';

import { useState, useCallback } from 'react';
import type { Venue, ArtistInput, SpotifyArtistResult } from '@/types';

interface ShowRow {
  id: number;
  date: string;
  show_time: string | null;
  venue_name: string;
  price_min: number | null;
  price_max: number | null;
  ticket_url: string | null;
  artists: { name: string; photo_url: string | null }[];
}

const emptyForm = {
  venue_id: '',
  date: '',
  doors_time: '',
  show_time: '',
  price_min: '',
  price_max: '',
  ticket_url: '',
};

const emptyArtist = (): ArtistInput => ({
  name: '',
  photo_url: '',
  spotify_id: '',
  preview_url: '',
  sort_order: 0,
});

function formatPrice(min: number | null, max: number | null) {
  if (min === 0 || min === null) return 'Free';
  if (max && max !== min) return `$${min}–$${max}`;
  return `$${min}`;
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[Number(m) - 1]} ${Number(day)}, ${y}`;
}

export default function ShowsAdmin({ initialShows, venues }: { initialShows: ShowRow[]; venues: Venue[] }) {
  const [shows, setShows] = useState<ShowRow[]>(initialShows);
  const [form, setForm] = useState(emptyForm);
  const [artists, setArtists] = useState<ArtistInput[]>([emptyArtist()]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Per-artist Spotify search state
  const [artistSearch, setArtistSearch] = useState<Record<number, string>>({});
  const [artistResults, setArtistResults] = useState<Record<number, SpotifyArtistResult[]>>({});
  const [artistSearching, setArtistSearching] = useState<Record<number, boolean>>({});

  const resetForm = () => {
    setForm(emptyForm);
    setArtists([emptyArtist()]);
    setEditingId(null);
    setArtistSearch({});
    setArtistResults({});
    setError('');
  };

  const handleEdit = useCallback(async (id: number) => {
    const res = await fetch(`/api/shows/${id}`);
    const show = await res.json();
    setForm({
      venue_id: String(show.venue_id),
      date: show.date,
      doors_time: show.doors_time ?? '',
      show_time: show.show_time ?? '',
      price_min: show.price_min != null ? String(show.price_min) : '',
      price_max: show.price_max != null ? String(show.price_max) : '',
      ticket_url: show.ticket_url ?? '',
    });
    setArtists(show.artists.length ? show.artists : [emptyArtist()]);
    setEditingId(id);
    setArtistSearch({});
    setArtistResults({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Delete this show?')) return;
    await fetch(`/api/shows/${id}`, { method: 'DELETE' });
    setShows((prev) => prev.filter((s) => s.id !== id));
    if (editingId === id) resetForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const filledArtists = artists.filter((a) => a.name.trim());
    if (!form.venue_id || !form.date) {
      setError('Venue and date are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, artists: filledArtists };
      const res = await fetch(
        editingId ? `/api/shows/${editingId}` : '/api/shows',
        { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');

      // Reload full show list
      const listRes = await fetch('/api/shows?from=1970-01-01');
      setShows(await listRes.json());
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Artist management
  const addArtistRow = () => setArtists((prev) => [...prev, { ...emptyArtist(), sort_order: prev.length }]);
  const removeArtistRow = (i: number) => setArtists((prev) => prev.filter((_, idx) => idx !== i));
  const updateArtist = (i: number, patch: Partial<ArtistInput>) =>
    setArtists((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const searchSpotify = async (i: number) => {
    const q = (artistSearch[i] ?? artists[i].name).trim();
    if (!q) return;
    setArtistSearching((p) => ({ ...p, [i]: true }));
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setArtistResults((p) => ({ ...p, [i]: Array.isArray(data) ? data : [] }));
    } finally {
      setArtistSearching((p) => ({ ...p, [i]: false }));
    }
  };

  const pickSpotifyResult = (i: number, result: SpotifyArtistResult) => {
    const photo = result.images[0]?.url ?? '';
    updateArtist(i, { name: result.name, photo_url: photo, spotify_id: result.id });
    setArtistResults((p) => ({ ...p, [i]: [] }));
    setArtistSearch((p) => ({ ...p, [i]: '' }));
  };

  const inputStyle: React.CSSProperties = {
    border: '1px solid #ccc', padding: '3px 5px', fontSize: 12, width: '100%',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 'bold', marginBottom: 2, fontSize: 12 };

  return (
    <div>
      {/* Form */}
      <div style={{ border: '1px solid #ddd', padding: 12, marginBottom: 16, background: '#fff' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{editingId ? `Edit Show #${editingId}` : 'Add Show'}</h3>
        {error && <div style={{ color: '#c00', marginBottom: 8, fontSize: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={labelStyle}>Venue *</label>
              <select value={form.venue_id} onChange={(e) => setForm((f) => ({ ...f, venue_id: e.target.value }))} style={inputStyle}>
                <option value="">— select —</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date *</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Show Time</label>
              <input type="time" value={form.show_time} onChange={(e) => setForm((f) => ({ ...f, show_time: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Doors</label>
              <input type="time" value={form.doors_time} onChange={(e) => setForm((f) => ({ ...f, doors_time: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Price Min ($)</label>
              <input type="number" min="0" step="0.01" value={form.price_min} onChange={(e) => setForm((f) => ({ ...f, price_min: e.target.value }))} placeholder="0 = free" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Price Max ($)</label>
              <input type="number" min="0" step="0.01" value={form.price_max} onChange={(e) => setForm((f) => ({ ...f, price_max: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Ticket URL</label>
            <input type="url" value={form.ticket_url} onChange={(e) => setForm((f) => ({ ...f, ticket_url: e.target.value }))} style={inputStyle} />
          </div>

          {/* Artists */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
            <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 6 }}>Artists</div>
            {artists.map((artist, i) => (
              <div key={i} style={{ background: '#fafafa', border: '1px solid #eee', padding: 8, marginBottom: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 4 }}>
                  <div>
                    <label style={labelStyle}>Name {i === 0 && '(headliner)'}</label>
                    <input
                      value={artist.name}
                      onChange={(e) => updateArtist(i, { name: e.target.value })}
                      style={inputStyle}
                      placeholder="Artist name"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Photo URL</label>
                    <input
                      value={artist.photo_url}
                      onChange={(e) => updateArtist(i, { photo_url: e.target.value })}
                      style={inputStyle}
                      placeholder="https://..."
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="button" onClick={() => removeArtistRow(i)} style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
                {/* Spotify search */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    value={artistSearch[i] ?? ''}
                    onChange={(e) => setArtistSearch((p) => ({ ...p, [i]: e.target.value }))}
                    placeholder={`Search Spotify for "${artist.name || 'artist'}"`}
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchSpotify(i))}
                  />
                  <button
                    type="button"
                    onClick={() => searchSpotify(i)}
                    disabled={artistSearching[i]}
                    style={{ padding: '3px 8px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', background: '#1db954', color: '#fff', border: 'none' }}
                  >
                    {artistSearching[i] ? '...' : '⟳ Spotify'}
                  </button>
                </div>
                {/* Spotify results */}
                {(artistResults[i] ?? []).length > 0 && (
                  <div style={{ marginTop: 4, border: '1px solid #ddd', background: '#fff' }}>
                    {artistResults[i].map((r) => (
                      <div
                        key={r.id}
                        onClick={() => pickSpotifyResult(i, r)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f0f0f0' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                      >
                        {r.images[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.images[r.images.length - 1]?.url} alt="" width={28} height={28} style={{ borderRadius: 2, objectFit: 'cover' }} />
                        )}
                        <span>{r.name}</span>
                        <span style={{ color: '#999', marginLeft: 'auto' }}>popularity {r.popularity}</span>
                      </div>
                    ))}
                    <div
                      onClick={() => setArtistResults((p) => ({ ...p, [i]: [] }))}
                      style={{ padding: '3px 6px', fontSize: 11, color: '#999', cursor: 'pointer', textAlign: 'right' }}
                    >
                      close
                    </div>
                  </div>
                )}
                {artist.spotify_id && (
                  <div style={{ fontSize: 10, color: '#1db954', marginTop: 2 }}>✓ Spotify linked · preview {artist.preview_url ? 'available' : 'none'}</div>
                )}
              </div>
            ))}
            <button type="button" onClick={addArtistRow} style={{ fontSize: 12, padding: '3px 8px', cursor: 'pointer' }}>+ Add artist</button>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} style={{ padding: '5px 14px', background: '#800080', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}>
              {saving ? 'Saving...' : editingId ? 'Update Show' : 'Add Show'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} style={{ padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Shows table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #800080' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Date</th>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Artists</th>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Venue</th>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Price</th>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Ticket</th>
            <th style={{ padding: '4px 6px' }}></th>
          </tr>
        </thead>
        <tbody>
          {shows.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: '#888', textAlign: 'center' }}>No shows yet. Add one above.</td></tr>
          )}
          {shows.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}
              onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => (e.currentTarget.style.background = '#fffbf5')}
              onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) => (e.currentTarget.style.background = '')}
            >
              <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>
                {fmtDate(s.date)}
                {s.show_time && <span style={{ color: '#888', marginLeft: 4 }}>{s.show_time}</span>}
              </td>
              <td style={{ padding: '5px 6px' }}>
                {s.artists.length ? s.artists.map((a) => a.name).join(', ') : <span style={{ color: '#aaa' }}>TBA</span>}
              </td>
              <td style={{ padding: '5px 6px' }}>{s.venue_name}</td>
              <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{formatPrice(s.price_min, s.price_max)}</td>
              <td style={{ padding: '5px 6px' }}>
                {s.ticket_url ? <a href={s.ticket_url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>Link</a> : '—'}
              </td>
              <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>
                <button onClick={() => handleEdit(s.id)} style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer', marginRight: 4 }}>Edit</button>
                <button onClick={() => handleDelete(s.id)} style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer', color: '#c00' }}>Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
