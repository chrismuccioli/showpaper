'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fmtDateShort, showUrl, artistUrl } from '@/lib/cities';
import type { PlayEvent } from './ShowPlayerButton';

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
  const [current, setCurrent] = useState<PlayEvent | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const handle = (e: Event) => {
      const detail = (e as CustomEvent<PlayEvent>).detail;
      setCurrent(detail);
      setIframeKey((k) => k + 1);
      setLoadFailed(false);
    };
    window.addEventListener('showpaper:play', handle);
    return () => window.removeEventListener('showpaper:play', handle);
  }, []);

  const stop = () => { setCurrent(null); setLoadFailed(false); };

  const go = (dir: 1 | -1) => {
    if (!current || !playlist.length) return;
    const i = playlist.findIndex((p) => p.artistId === current.artistId);
    const n = playlist[(i + dir + playlist.length) % playlist.length];
    if (!n || !n.spotifyId) return;
    setCurrent({ artistId: n.artistId, artistName: n.artistName, artistSlug: n.artistSlug, artistPhoto: n.artistPhoto, spotifyId: n.spotifyId, showId: n.showId, showSlug: n.showSlug, venueName: n.venueName, showDate: n.showDate });
    setIframeKey((k) => k + 1);
    setLoadFailed(false);
  };

  const pos = current ? playlist.findIndex((p) => p.artistId === current.artistId) + 1 : 0;

  if (!current) return null;

  return (
    <>
      {/* Hidden 1×1 autoplay iframe — audio plays in background */}
      {current.spotifyId && !loadFailed && (
        <iframe
          key={iframeKey}
          src={`https://open.spotify.com/embed/artist/${current.spotifyId}?utm_source=generator&theme=0&autoplay=1`}
          style={{ position: 'fixed', bottom: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 'none' }}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          title="bg-audio"
          onError={() => setLoadFailed(true)}
        />
      )}

      {/* Our player bar — no visible Spotify UI */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999, background: '#1a1a1a', borderTop: '1px solid #222', boxShadow: '0 -4px 20px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', maxWidth: 860, margin: '0 auto' }}>

          {/* Photo + pulse dot */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {current.artistPhoto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={current.artistPhoto} alt="" width={36} height={36} style={{ borderRadius: 3, objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: 36, height: 36, background: '#2a2a2a', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 16 }}>♪</div>
            }
            {!loadFailed && (
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderRadius: 5, background: '#1db954', border: '2px solid #1a1a1a', animation: 'sp-pulse 2s ease-in-out infinite' }} />
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Link href={artistUrl(current.artistSlug, current.artistId, current.artistName)} style={{ color: '#fff', textDecoration: 'none' }}>
                {current.artistName}
              </Link>
            </div>
            <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {current.venueName}
              <span style={{ margin: '0 4px', color: '#2a2a2a' }}>·</span>
              {fmtDateShort(current.showDate)}
              <span style={{ margin: '0 4px', color: '#2a2a2a' }}>·</span>
              <Link href={showUrl(current.showSlug, current.showId, [{ name: current.artistName }], current.venueName)} style={{ color: '#1db954', textDecoration: 'none' }}>
                view show →
              </Link>
              {loadFailed && (
                <span style={{ marginLeft: 8, color: '#555' }}>
                  audio blocked —{' '}
                  <a href={`https://open.spotify.com/artist/${current.spotifyId}`} target="_blank" rel="noreferrer" style={{ color: '#1db954' }}>open Spotify</a>
                </span>
              )}
            </div>
          </div>

          {/* Position */}
          {playlist.length > 1 && pos > 0 && (
            <div style={{ fontSize: 11, color: '#444', flexShrink: 0 }}>{pos}/{playlist.length}</div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            {playlist.length > 1 && (
              <>
                <button onClick={() => go(-1)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, padding: '3px 6px' }} title="Prev">‹</button>
                <button onClick={() => go(1)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, padding: '3px 6px' }} title="Next">›</button>
              </>
            )}
            <button onClick={stop} style={{ background: 'none', border: '1px solid #2a2a2a', color: '#555', cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 3 }}>■ stop</button>
          </div>
        </div>

      </div>
    </>
  );
}
