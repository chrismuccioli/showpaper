'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

interface DeezerPreview {
  previewUrl: string;
  trackTitle?: string;
  artistName?: string;
  albumArt?: string;
}

export default function MiniPlayer({ playlist }: { playlist: PlaylistItem[] }) {
  const [current, setCurrent] = useState<PlayEvent | null>(null);
  const [preview, setPreview] = useState<DeezerPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Build audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ''; };
  }, []);

  // Wire up audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setElapsed(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    };
    const onEnded = () => { setPlaying(false); setProgress(1); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  const fetchAndPlay = useCallback(async (artistName: string) => {
    setLoading(true);
    setPreview(null);
    setProgress(0);
    setElapsed(0);
    try {
      const res = await fetch(`/api/deezer/preview?q=${encodeURIComponent(artistName)}`);
      if (!res.ok) throw new Error('No preview found');
      const data: DeezerPreview = await res.json();
      setPreview(data);
      const audio = audioRef.current;
      if (audio) {
        audio.src = data.previewUrl;
        await audio.play();
      }
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for play events from any ShowPlayerButton
  useEffect(() => {
    const handle = (e: Event) => {
      const detail = (e as CustomEvent<PlayEvent>).detail;
      // Pause current audio before switching
      audioRef.current?.pause();
      setPlaying(false);
      setCurrent(detail);
      fetchAndPlay(detail.artistName);
    };
    window.addEventListener('showpaper:play', handle);
    return () => window.removeEventListener('showpaper:play', handle);
  }, [fetchAndPlay]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !preview) return;
    if (playing) audio.pause();
    else audio.play();
  };

  const stop = () => {
    audioRef.current?.pause();
    setCurrent(null);
    setPreview(null);
    setPlaying(false);
    setProgress(0);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  const fmtSec = (s: number) => `${Math.floor(s)}s`;

  if (!current) return null;

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999, background: '#1a1a1a', borderTop: '1px solid #222', boxShadow: '0 -4px 20px rgba(0,0,0,0.5)' }}>
      {/* Progress bar — clickable */}
      <div onClick={seek} style={{ height: 3, background: '#2a2a2a', cursor: 'pointer' }}>
        <div style={{ height: '100%', background: loading ? '#555' : '#1db954', width: `${progress * 100}%`, transition: 'width 0.1s linear' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', maxWidth: 860, margin: '0 auto' }}>

        {/* Artist photo with pulse */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {current.artistPhoto
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={current.artistPhoto} alt="" width={36} height={36} style={{ borderRadius: 3, objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: 36, height: 36, background: '#2a2a2a', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 16 }}>♪</div>
          }
          {playing && (
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderRadius: 5, background: '#1db954', border: '2px solid #1a1a1a', animation: 'sp-pulse 2s ease-in-out infinite' }} />
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Link href={artistUrl(current.artistSlug, current.artistId, current.artistName)} style={{ color: '#fff', textDecoration: 'none' }}>
              {current.artistName}
            </Link>
            {loading && <span style={{ fontSize: 11, color: '#555', marginLeft: 8, fontWeight: 'normal' }}>loading…</span>}
            {!loading && preview?.trackTitle && (
              <span style={{ fontSize: 11, color: '#555', marginLeft: 8, fontWeight: 'normal' }}>"{preview.trackTitle}"</span>
            )}
            {!loading && !preview && current && (
              <span style={{ fontSize: 11, color: '#c00', marginLeft: 8, fontWeight: 'normal' }}>no preview available</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {current.venueName}
            <span style={{ margin: '0 4px', color: '#2a2a2a' }}>·</span>
            {fmtDateShort(current.showDate)}
            <span style={{ margin: '0 4px', color: '#2a2a2a' }}>·</span>
            <Link href={showUrl(current.showSlug, current.showId, [{ name: current.artistName }], current.venueName)} style={{ color: '#1db954', textDecoration: 'none' }}>
              view show →
            </Link>
          </div>
        </div>

        {/* Elapsed */}
        {preview && (
          <div style={{ fontSize: 11, color: '#444', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtSec(elapsed)} / 30s</div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {preview && (
            <button onClick={togglePlay}
              style={{ background: '#1db954', border: 'none', color: '#fff', cursor: 'pointer', width: 30, height: 30, borderRadius: 15, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {playing ? '⏸' : '▶'}
            </button>
          )}
          <button onClick={stop}
            style={{ background: 'none', border: '1px solid #2a2a2a', color: '#555', cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 3 }}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
