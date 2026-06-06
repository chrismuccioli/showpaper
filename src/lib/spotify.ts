import 'server-only';
import type { SpotifyArtistResult } from '@/types';

interface TokenCache {
  access_token: string;
  expires_at: number;
}

// Module-level cache — persists across requests within the same process
let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expires_at) {
    return tokenCache.access_token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env.local');
  }

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: 'grant_type=client_credentials',
    // Don't cache this fetch — it's auth
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Spotify auth failed: ${res.status}`);
  }

  const data = await res.json();
  tokenCache = {
    access_token: data.access_token,
    // Subtract 60s buffer so we refresh before actual expiry
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };

  return tokenCache.access_token;
}

export async function searchSpotifyArtists(query: string): Promise<SpotifyArtistResult[]> {
  const token = await getAccessToken();
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=5`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Spotify search failed: ${res.status}`);
  }

  const data = await res.json();
  return (data.artists?.items ?? []) as SpotifyArtistResult[];
}
