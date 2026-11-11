import type { ReleaseMetadata, ValidationResult } from '../types';

const VERSION_RE = /\((?:remix|live|remastered|deluxe)\)/i;
const FEAT_RE = /\b(?:feat\.?|ft\.?|featuring)\b|\bprod\.?\s*by\b/i;
const SEO_TERMS = ['christmas', 'sleep', 'meditation', 'rain sounds', 'baby'];

function pass(id: string, platform: ValidationResult['platform'], message: string): ValidationResult {
  return { id, platform, severity: 'pass', message, fix: '' };
}

function findSeoTerms(artist: string): string[] {
  return SEO_TERMS.filter((term) => new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i').test(artist));
}

function ruleMeta01(metadata: ReleaseMetadata): ValidationResult[] {
  const title = metadata.title.trim();
  if (!title) return [];
  if (VERSION_RE.test(title)) {
    return [
      {
        id: 'META-01',
        platform: 'spotify',
        severity: 'error',
        message:
          'Version info like (Remix) should go in the Version field, not the title. Distributors have a separate field for this.',
        fix: "Remove tags such as (Remix), (Live), (Remastered), or (Deluxe) from the title and put them in your distributor's version field.",
      },
    ];
  }
  return [pass('META-01', 'spotify', 'Title has no (Remix), (Live), (Remastered), or (Deluxe) tag.')];
}

function ruleMeta02(metadata: ReleaseMetadata): ValidationResult[] {
  const artist = metadata.artist.trim();
  if (!artist) return [];
  if (FEAT_RE.test(artist)) {
    return [
      {
        id: 'META-02',
        platform: 'spotify',
        severity: 'error',
        message:
          "Featuring credits should be in a contributor field, not the main artist name. Use the 'Featuring' role.",
        fix: 'Move the featuring or producer credit into the Featuring field and leave the main artist name on its own.',
      },
    ];
  }
  return [pass('META-02', 'spotify', 'Artist name has no featuring or producer credit in it.')];
}

function ruleMeta03(metadata: ReleaseMetadata): ValidationResult[] {
  const title = metadata.title.trim();
  const artist = metadata.artist.trim();
  return [
    title
      ? pass('META-03', 'all', 'Title is filled in.')
      : {
          id: 'META-03',
          platform: 'all',
          severity: 'error',
          message: 'Title is required.',
          fix: 'Enter a title before you check the release.',
        },
    artist
      ? pass('META-03', 'all', 'Artist is filled in.')
      : {
          id: 'META-03',
          platform: 'all',
          severity: 'error',
          message: 'Artist is required.',
          fix: 'Enter the main artist name.',
        },
  ];
}

function ruleMeta04(metadata: ReleaseMetadata): ValidationResult[] {
  const artist = metadata.artist.trim();
  if (!artist) return [];
  const found = findSeoTerms(artist);
  if (found.length === 0) {
    return [pass('META-04', 'spotify', 'Artist name has none of the checked SEO terms.')];
  }
  const label = found.join(', ');
  return [
    {
      id: 'META-04',
      platform: 'spotify',
      severity: 'error',
      message: `Spotify rejects artist names that contain SEO terms like '${label}'.`,
      fix: 'Use a distinct artistic identity that does not include that term.',
    },
  ];
}

function ruleMeta05(metadata: ReleaseMetadata): ValidationResult[] {
  const title = metadata.title.trim();
  if (!title) return [];
  const letters = title.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 2 && letters === letters.toUpperCase()) {
    return [
      {
        id: 'META-05',
        platform: 'apple',
        severity: 'warning',
        message: `Apple Music style guide prefers title casing. '${title}' may be flagged.`,
        fix: 'Retitle in title case unless the all-caps styling is intentional.',
      },
    ];
  }
  return [pass('META-05', 'apple', 'Title is not all caps.')];
}

function ruleMeta06(metadata: ReleaseMetadata): ValidationResult[] {
  const composer = metadata.composer.trim();
  if (!composer) {
    return [
      {
        id: 'META-06',
        platform: 'spotify',
        severity: 'warning',
        message: 'Composer is empty. Spotify expects a full legal name for the composer or lyricist.',
        fix: 'Enter the full legal name, first and last.',
      },
    ];
  }
  const singleWord = composer.split(/\s+/).filter(Boolean).length < 2;
  if (composer.includes('.') || singleWord) {
    return [
      {
        id: 'META-06',
        platform: 'spotify',
        severity: 'warning',
        message: `Spotify requires full legal names for composers/lyricists. '${composer}' looks like an alias or initials.`,
        fix: 'Enter a full legal name, first and last, without initials.',
      },
    ];
  }
  return [pass('META-06', 'spotify', 'Composer is more than one word and has no period, so it was not flagged as initials.')];
}

export function metaRules(metadata: ReleaseMetadata): ValidationResult[] {
  return [
    ...ruleMeta01(metadata),
    ...ruleMeta02(metadata),
    ...ruleMeta03(metadata),
    ...ruleMeta04(metadata),
    ...ruleMeta05(metadata),
    ...ruleMeta06(metadata),
  ];
}
