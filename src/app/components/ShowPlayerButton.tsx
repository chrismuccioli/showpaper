'use client';

export interface PlayEvent {
  artistId: number;
  artistName: string;
  artistSlug: string | null;
  artistPhoto: string | null;
  spotifyId: string;
  showId: number;
  showSlug: string | null;
  venueName: string;
  showDate: string;
}

export default function ShowPlayerButton(props: PlayEvent) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('showpaper:play', { detail: props }));
  };

  return (
    <button
      onClick={handleClick}
      title={`Preview ${props.artistName}`}
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0)', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, opacity: 0,
        transition: 'opacity 0.15s, background 0.15s',
      }}
      className="play-btn"
    >
      ▶
    </button>
  );
}
