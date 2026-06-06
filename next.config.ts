import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },       // Spotify artist images
      { protocol: 'https', hostname: '**.scdn.co' },
      { protocol: 'https', hostname: '**.spotifycdn.com' },
      { protocol: 'https', hostname: '**' },               // allow any HTTPS image for MVP
    ],
  },
};

export default nextConfig;
