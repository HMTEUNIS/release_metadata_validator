import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Metadata Validation Program [beta]',
  description:
    'Check a release against Spotify, Apple Music, DistroKid, TuneCore, and CD Baby. Fix loudness, write metadata, fit cover art, and download an ERN 4.3 base file. Runs in the browser.',
};

export const viewport: Viewport = {
  themeColor: '#0b0e0b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
