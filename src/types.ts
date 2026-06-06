export interface Venue {
  id: number;
  name: string;
  address: string | null;
  city: string;
  website: string | null;
  created_at: string;
}

export interface Artist {
  id: number;
  name: string;
  photo_url: string | null;
  spotify_id: string | null;
  apple_music_url: string | null;
  preview_url: string | null;
  bandcamp_url: string | null;
}

export interface Show {
  id: number;
  venue_id: number;
  date: string;
  doors_time: string | null;
  show_time: string | null;
  price_min: number | null;
  price_max: number | null;
  ticket_url: string | null;
  source_url: string | null;
  created_at: string;
}

export interface ShowArtist extends Artist {
  sort_order: number;
}

export interface ShowWithDetails extends Show {
  venue_name: string;
  venue_address: string | null;
  venue_website: string | null;
  artists: ShowArtist[];
}

// Lightweight version used on the list page
export interface ShowListItem {
  id: number;
  date: string;
  show_time: string | null;
  doors_time: string | null;
  price_min: number | null;
  price_max: number | null;
  ticket_url: string | null;
  venue_name: string;
  venue_id: number;
  artists: { name: string; photo_url: string | null }[];
}

// Artist input used in the admin form (may not have a DB id yet)
export interface ArtistInput {
  dbId?: number;
  name: string;
  photo_url: string;
  spotify_id: string;
  preview_url: string;
  sort_order: number;
}

export interface SpotifyArtistResult {
  id: string;
  name: string;
  images: { url: string; width: number; height: number }[];
  popularity: number;
}
