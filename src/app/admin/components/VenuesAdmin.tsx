'use client';

import { useState } from 'react';
import type { Venue } from '@/types';

const emptyForm = { name: '', address: '', city: 'Austin', website: '' };

export default function VenuesAdmin({ initialVenues }: { initialVenues: Venue[] }) {
  const [venues, setVenues] = useState<Venue[]>(initialVenues);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setError(''); };

  const handleEdit = (v: Venue) => {
    setForm({ name: v.name, address: v.address ?? '', city: v.city, website: v.website ?? '' });
    setEditingId(v.id);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this venue and all its shows?')) return;
    await fetch(`/api/venues/${id}`, { method: 'DELETE' });
    setVenues((prev) => prev.filter((v) => v.id !== id));
    if (editingId === id) resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/venues/${editingId}` : '/api/venues',
        { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }
      );
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      const listRes = await fetch('/api/venues');
      setVenues(await listRes.json());
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = { border: '1px solid #ccc', padding: '3px 5px', fontSize: 12, width: '100%' };
  const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 'bold', marginBottom: 2, fontSize: 12 };

  return (
    <div>
      <div style={{ border: '1px solid #ddd', padding: 12, marginBottom: 16, background: '#fff' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{editingId ? 'Edit Venue' : 'Add Venue'}</h3>
        {error && <div style={{ color: '#c00', marginBottom: 8, fontSize: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Address</label>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} style={inputStyle} placeholder="123 Main St, Austin TX" />
            </div>
            <div>
              <label style={labelStyle}>City</label>
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input type="url" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} style={inputStyle} placeholder="https://..." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} style={{ padding: '5px 14px', background: '#800080', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}>
              {saving ? 'Saving...' : editingId ? 'Update Venue' : 'Add Venue'}
            </button>
            {editingId && <button type="button" onClick={resetForm} style={{ padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>}
          </div>
        </form>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #800080' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Address</th>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Website</th>
            <th style={{ padding: '4px 6px' }}></th>
          </tr>
        </thead>
        <tbody>
          {venues.length === 0 && (
            <tr><td colSpan={4} style={{ padding: 12, color: '#888', textAlign: 'center' }}>No venues yet. Add one above.</td></tr>
          )}
          {venues.map((v) => (
            <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}
              onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => (e.currentTarget.style.background = '#fffbf5')}
              onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) => (e.currentTarget.style.background = '')}
            >
              <td style={{ padding: '5px 6px', fontWeight: 'bold' }}>{v.name}</td>
              <td style={{ padding: '5px 6px', color: '#666' }}>{v.address ?? '—'}</td>
              <td style={{ padding: '5px 6px' }}>
                {v.website ? <a href={v.website} target="_blank" rel="noreferrer">{v.website.replace('https://', '')}</a> : '—'}
              </td>
              <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>
                <button onClick={() => handleEdit(v)} style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer', marginRight: 4 }}>Edit</button>
                <button onClick={() => handleDelete(v.id)} style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer', color: '#c00' }}>Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
