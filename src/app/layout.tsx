import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Metadata Validation Program',
  description:
    'Check a release against Spotify, Apple Music, and DistroKid guidelines before you upload. Runs in the browser.',
};

export const viewport: Viewport = {
  themeColor: '#0b0e0b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
