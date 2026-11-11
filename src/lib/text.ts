export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ {2,}/g, ' ');
}

export function containsNormalized(haystack: string, needle: string): boolean {
  const hay = normalizeForMatch(haystack);
  const pin = normalizeForMatch(needle);
  if (!pin) return false;
  return hay.includes(pin);
}

const PROMO_PATTERNS = [
  /https?:\/\/[^\s]+/i,
  /\bwww\.[^\s]+/i,
  /\b[a-z0-9-]+\.(?:com|net|org|io|fm|co|ly|link)\b/i,
  /@[a-z0-9._]{2,}/i,
  /\$\s?\d+(?:[.,]\d{2})?/,
];

export function findPromotionalText(text: string): string | null {
  for (const pattern of PROMO_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}
