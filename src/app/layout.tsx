import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Showpaper",
  description: "Live music listings for Austin, TX",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* CL-exact header: #eee bg, 1px #ccc border, serif logo in #551A8B */}
        <div style={{ background: '#eee', borderBottom: '1px solid #ccc', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <a href="/" style={{
            fontFamily: 'Georgia, serif',
            fontSize: 22,
            color: '#551A8B',
            textDecoration: 'none',
            padding: '8px 4px',
          }}>
            showpaper
          </a>
          <span style={{ color: '#ccc', fontSize: 16 }}>|</span>
          <span style={{ fontSize: 13, color: '#666' }}>austin</span>
          <span style={{ color: '#ccc', fontSize: 16 }}>|</span>
          <a href="/artists" style={{ fontSize: 13, color: '#551A8B', padding: '8px 4px' }}>artists</a>
          <a href="/venues" style={{ fontSize: 13, color: '#551A8B', padding: '8px 4px' }}>venues</a>
          <a href="/admin" style={{ marginLeft: 'auto', fontSize: 13, color: '#551A8B', padding: '8px 4px' }}>admin</a>
        </div>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '8px 10px' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
