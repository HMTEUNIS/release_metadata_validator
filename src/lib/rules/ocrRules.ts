import { containsNormalized, findPromotionalText, normalizeForMatch } from '../text';
import type { ReleaseMetadata, ValidationResult } from '../types';

function nameRule(
  id: 'OCR-01' | 'OCR-02',
  label: 'artist name' | 'title',
  value: string,
  coverText: string,
): ValidationResult | null {
  const trimmed = value.trim();
  if (!trimmed || !normalizeForMatch(trimmed)) return null;
  if (containsNormalized(coverText, trimmed)) {
    return {
      id,
      platform: 'all',
      severity: 'pass',
      message: `The ${label} '${trimmed}' was found in the cover text.`,
      fix: '',
    };
  }
  const message =
    id === 'OCR-01'
      ? `Your artist name '${trimmed}' wasn't found in the cover art text. Apple and Spotify may reject if the cover doesn't match the metadata.`
      : `Your title '${trimmed}' wasn't found in the cover art text.`;
  return {
    id,
    platform: 'all',
    severity: 'warning',
    message,
    fix:
      id === 'OCR-01'
        ? 'Add the artist name to the artwork, or confirm the cover text matches the metadata. OCR can miss stylized lettering.'
        : 'Add the title to the artwork, or confirm the cover text matches the metadata. OCR can miss stylized lettering.',
  };
}

export function ocrRules(coverText: string, metadata: ReleaseMetadata): ValidationResult[] {
  const results: ValidationResult[] = [];
  const artist = nameRule('OCR-01', 'artist name', metadata.artist, coverText);
  const title = nameRule('OCR-02', 'title', metadata.title, coverText);
  if (artist) results.push(artist);
  if (title) results.push(title);

  const promo = findPromotionalText(coverText);
  if (promo) {
    results.push({
      id: 'OCR-03',
      platform: 'all',
      severity: 'error',
      message: `Cover art contains what looks like a URL/handle/price: '${promo}'. Spotify and Apple reject cover art with promotional text.`,
      fix: 'Remove URLs, social handles, and prices from the cover art.',
    });
  } else {
    results.push({
      id: 'OCR-03',
      platform: 'all',
      severity: 'pass',
      message: 'No URL, social handle, or price was found in the cover text.',
      fix: '',
    });
  }

  const normalized = normalizeForMatch(coverText);
  if (normalized.includes('parental advisory') || /\bexplicit\b/.test(normalized)) {
    results.push({
      id: 'OCR-04',
      platform: 'apple',
      severity: 'error',
      message: "Remove 'Explicit' / 'Parental Advisory' from cover art. Apple labels this automatically.",
      fix: 'Delete that label from the image. Apple adds the explicit badge itself.',
    });
  } else {
    results.push({
      id: 'OCR-04',
      platform: 'apple',
      severity: 'pass',
      message: 'Cover text has no Explicit or Parental Advisory label.',
      fix: '',
    });
  }

  return results;
}
