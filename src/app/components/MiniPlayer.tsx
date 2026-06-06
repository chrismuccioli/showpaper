'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fmtDateShort, showUrl, artistUrl } from '@/lib/cities';

export interface PlaylistItem {
  artistId: number;
  artistName: string;
  artistSlug: string | null;
  artistPhoto: string | null;
  spotifyId: string | null;
  showDate: string;
  venueName: string;
  showId: number;
  showSlug: string | null;
}

export default function MiniPlayer({ playlist }: { playlist: PlaylistItem[] }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  if (!playlist.length) return null;

  const current = playlist[idx];
  const prev = () => setIdx((i) => (i - 1 + playlist.length) % playlist.length);
  const next = () => setIdx((i) => (i + 1) % playlist.length);
  const close = () => setOpen(false);

  // ── Closed: floating button ───────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Browse artists"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 999,
          background: '#1db954', color: '#fff', border: 'none',
          borderRadius: 24, padding: '10px 18px', cursor: 'pointer',
          fontSize: 13, fontWeight: 'bold',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
      >
        <span style={{ fontSize: 16 }}>🎧</span>
        Browse {playlist.length} artist{playlist.length !== 1 ? 's' : ''}
      </button>
    );
  }

  // ── Open: slide-up panel ──────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
      background: '#121212', color: '#fff',
      boxShadow: '0 -8px 30px rgba(0,0,0,0.6)',
      maxHeight: '60vh',
    }}>
      {/* Info row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px 8px',
        maxWidth: 860, margin: '0 auto',
        borderBottom: '1px solid #2a2a2a',
      }}>
        {/* Prev */}
        <button onClick={prev}
          style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 18, padding: '4px 8px', flexShrink: 0 }}
          title="Previous artist">‹</button>

        {/* Artist photo */}
        {current.artistPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.artistPhoto} alt="" width={40} height={40}
            style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
        )}

        {/* Artist + show info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 'bold', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Link href={artistUrl(current.artistSlug, current.artistId, current.artistName)}
              style={{ color: '#fff', textDecoration: 'none' }}>
              {current.artistName}
            </Link>
          </div>
          <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {current.venueName}
            <span style={{ margin: '0 4px', color: '#444' }}>·</span>
            {fmtDateShort(current.showDate)}
            <span style={{ margin: '0 4px', color: '#444' }}>·</span>
            <Link href={showUrl(current.showSlug, current.showId, [{ name: current.artistName }], current.venueName)}
              style={{ color: '#1db954', textDecoration: 'none' }}>
              view show →
            </Link>
          </div>
        </div>

        {/* Count */}
        <div style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {idx + 1} / {playlist.length}
        </div>

        {/* Next */}
        <button onClick={next}
          style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 18, padding: '4px 8px', flexShrink: 0 }}
          title="Next artist">›</button>

        {/* Close */}
        <button onClick={close}
          style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 14, padding: '4px 8px', flexShrink: 0 }}
          title="Close">✕</button>
      </div>

      {/* Spotify embed */}
      <div style={{ padding: '0 16px 16px', maxWidth: 860, margin: '0 auto' }}>
        {current.spotifyId ? (
          <iframe
            key={current.spotifyId}  // force re-mount on artist change
            src={`https://open.spotify.com/embed/artist/${current.spotifyId}?utm_source=generator&theme=0`}
            width="100%"
            height="152"
            style={{ border: 'none', borderRadius: 8, marginTop: 10 }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="eager"
            title={`${current.artistName} on Spotify`}
          />
        ) : (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#555' }}>
            {current.artistName} isn&apos;t on Spotify yet —{' '}
            <Link href={artistUrl(current.artistSlug, current.artistId, current.artistName)}
              style={{ color: '#1db954' }}>view profile</Link>
            {' or '}
            <button onClick={next} style={{ background: 'none', border: 'none', color: '#1db954', cursor: 'pointer', fontSize: 12, padding: 0 }}>
              skip to next artist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
