'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { fmtDateShort, showUrl, artistUrl } from '@/lib/cities';

export interface PlaylistItem {
  artistId: number;
  artistName: string;
  artistSlug: string | null;
  artistPhoto: string | null;
  previewUrl: string;
  showDate: string;
  venueName: string;
  showId: number;
  showSlug: string | null;
}

export default function MiniPlayer({ playlist }: { playlist: PlaylistItem[] }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1
  const [elapsed, setElapsed] = useState(0);   // seconds
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Build audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ''; };
  }, []);

  const goTo = useCallback((i: number, autoPlay = true) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = playlist[i]?.previewUrl ?? '';
    audio.currentTime = 0;
    setIdx(i);
    setProgress(0);
    setElapsed(0);
    if (autoPlay) {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  }, [playlist]);

  const next = useCallback(() => goTo((idx + 1) % playlist.length), [idx, playlist.length, goTo]);
  const prev = useCallback(() => goTo((idx - 1 + playlist.length) % playlist.length), [idx, playlist.length, goTo]);

  // Wire up audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const dur = audio.duration || 30;
      setElapsed(audio.currentTime);
      setProgress(audio.currentTime / dur);
    };
    const onEnded = () => next();
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [next]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().catch(() => {}); setPlaying(true); }
  };

  const openPlayer = () => {
    setOpen(true);
    if (!audioRef.current?.src || audioRef.current.src === window.location.href) {
      goTo(0, true);
    } else {
      audioRef.current?.play().catch(() => {});
      setPlaying(true);
    }
  };

  const close = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setOpen(false);
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  };

  if (!playlist.length) return null;

  const current = playlist[idx];
  const fmtSec = (s: number) => `${Math.floor(s)}s`;

  // ── Closed: floating button ──────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={openPlayer}
        aria-label="Preview artist playlist"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 999,
          background: '#1db954', color: '#fff', border: 'none',
          borderRadius: 24, padding: '10px 18px', cursor: 'pointer',
          fontSize: 13, fontWeight: 'bold',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', gap: 7,
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.45)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.35)'; }}
      >
        <span style={{ fontSize: 16 }}>▶</span>
        Preview {playlist.length} artist{playlist.length !== 1 ? 's' : ''}
      </button>
    );
  }

  // ── Open: full player bar ─────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
      background: '#181818', color: '#fff',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
    }}>
      {/* Clickable progress bar */}
      <div
        onClick={seekTo}
        style={{ height: 4, background: '#404040', cursor: 'pointer' }}
        title="Seek"
      >
        <div style={{ height: '100%', background: '#1db954', width: `${progress * 100}%`, pointerEvents: 'none' }} />
      </div>

      {/* Player row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr auto auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 16px',
        maxWidth: 860,
        margin: '0 auto',
      }}>
        {/* Artist photo */}
        <Link href={artistUrl(current.artistSlug, current.artistId, current.artistName)} style={{ display: 'block', flexShrink: 0 }}>
          {current.artistPhoto
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={current.artistPhoto} alt="" width={44} height={44} style={{ borderRadius: 4, objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: 44, height: 44, background: '#333', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>♪</div>
          }
        </Link>

        {/* Track info */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Link href={artistUrl(current.artistSlug, current.artistId, current.artistName)} style={{ color: '#fff', textDecoration: 'none' }}>
              {current.artistName}
            </Link>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {current.venueName}
            <span style={{ margin: '0 4px', color: '#555' }}>·</span>
            {fmtDateShort(current.showDate)}
            <span style={{ margin: '0 4px', color: '#555' }}>·</span>
            <Link href={showUrl(current.showSlug, current.showId, [{ name: current.artistName }], current.venueName)}
              style={{ color: '#1db954', textDecoration: 'none' }}>
              view show →
            </Link>
          </div>
        </div>

        {/* Position */}
        <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', textAlign: 'right' }}>
          {fmtSec(elapsed)} · {idx + 1}/{playlist.length}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={prev}
            style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 16, padding: '4px 6px', lineHeight: 1 }}
            title="Previous">⏮</button>

          <button onClick={togglePlay}
            style={{ background: '#1db954', border: 'none', color: '#fff', cursor: 'pointer', width: 34, height: 34, borderRadius: 17, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={playing ? 'Pause' : 'Play'}>
            {playing ? '⏸' : '▶'}
          </button>

          <button onClick={next}
            style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 16, padding: '4px 6px', lineHeight: 1 }}
            title="Next">⏭</button>

          <button onClick={close}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, padding: '4px 6px', lineHeight: 1, marginLeft: 2 }}
            title="Close">✕</button>
        </div>
      </div>
    </div>
  );
}
