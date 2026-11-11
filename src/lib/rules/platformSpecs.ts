import type { Platform } from '../types';

export const PLATFORM_LABEL: Record<Platform, string> = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  distrokid: 'DistroKid',
  tunecore: 'TuneCore',
  cdbaby: 'CD Baby',
  all: 'All platforms',
};

export const COVER_SPECS = {
  spotify: { min: 640, max: 10000, formats: ['jpg', 'png', 'tiff'] },
  apple: { min: 4000, max: 10000, formats: ['jpg', 'png', 'gif'] },
  distrokid: { min: 1000, max: 10000, formats: ['jpg'] },
  tunecore: { min: 1600, max: 3000, formats: ['jpg', 'png', 'gif'], maxFileMB: 10 },
  cdbaby: { min: 1400, max: 3000, formats: ['jpg', 'jpeg', 'png', 'gif'], maxFileMB: 25 },
} as const;

export const AUDIO_SPECS = {
  spotify: { sampleRate: 44100, bitDepths: [16, 24], channels: 2 },
  apple: { sampleRate: 44100, bitDepths: [16, 24], channels: 2 },
  distrokid: { sampleRate: 44100, bitDepths: [16], channels: 2 },
  tunecore: { sampleRate: 44100, bitDepths: [16], channels: 2 },
  cdbaby: { sampleRate: 44100, bitDepths: [16], channels: 2 },
} as const;

export const DISTRIBUTORS = ['tunecore', 'cdbaby'] as const;

export type Distributor = (typeof DISTRIBUTORS)[number];

export const COVER_PLATFORMS = ['spotify', 'apple', 'distrokid', 'tunecore', 'cdbaby'] as const;

export type CoverPlatform = (typeof COVER_PLATFORMS)[number];

/**
 * Edge length for a square JPEG that lands inside that platform's range.
 * DistroKid's download uses 3000px when the art is smaller, so it meets the
 * recommendation rather than only the 1000px minimum.
 */
export function coverFileLimitMB(platform: CoverPlatform): number | undefined {
  const spec = COVER_SPECS[platform];
  return 'maxFileMB' in spec ? spec.maxFileMB : undefined;
}

export function coverExportEdge(platform: CoverPlatform, width: number, height: number): number {
  const side = Math.max(1, Math.min(width, height));
  const spec = COVER_SPECS[platform];
  const floor = platform === 'distrokid' ? 3000 : spec.min;
  return Math.round(Math.min(spec.max, Math.max(floor, side)));
}
