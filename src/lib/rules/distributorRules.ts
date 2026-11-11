import { AUDIO_SPECS, COVER_SPECS, DISTRIBUTORS, PLATFORM_LABEL, type Distributor } from './platformSpecs';
import { normalizeForMatch } from '../text';
import type { AudioInfo, ImageInfo, ReleaseMetadata, ValidationResult } from '../types';

const TIME_WORDS = [
  { label: 'new', pattern: /\bnew\b/ },
  { label: 'latest', pattern: /\blatest\b/ },
  { label: 'exclusive', pattern: /\bexclusive\b/ },
  { label: 'limited edition', pattern: /\blimited edition\b/ },
];

const FILENAME_RE = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

function deliveryKind(audio: AudioInfo): 'wav' | 'flac' | 'mp3' | 'wma' | 'other' {
  if (audio.sniffed === 'wav' || audio.sniffed === 'flac' || audio.sniffed === 'mp3' || audio.sniffed === 'wma') {
    return audio.sniffed;
  }
  const blob = `${audio.container ?? ''} ${audio.codec ?? ''}`.toLowerCase();
  if (blob.includes('flac')) return 'flac';
  if (blob.includes('mpeg') || blob.includes('mp3') || blob.includes('layer 3')) return 'mp3';
  if (blob.includes('wma') || blob.includes('asf') || blob.includes('windows media')) return 'wma';
  if (blob.includes('wave') || blob.includes('wav') || blob.includes('pcm') || audio.wavFormatCode != null) return 'wav';
  return 'other';
}

function finite(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizedExt(extension: string): string {
  const clean = extension.toLowerCase().replace(/^\./, '');
  if (clean === 'jpeg') return 'jpg';
  if (clean === 'tif') return 'tiff';
  return clean;
}

function formatAllowed(extension: string, formats: readonly string[]): boolean {
  const clean = extension.toLowerCase().replace(/^\./, '');
  const folded = normalizedExt(clean);
  return formats.some((format) => format === clean || normalizedExt(format) === folded);
}

function formatList(formats: readonly string[]): string {
  return formats.map((format) => format.toUpperCase()).join(', ');
}

export function distributorCoverRules(image: ImageInfo): ValidationResult[] {
  const size = `${image.width}x${image.height}`;
  const results: ValidationResult[] = [];
  for (const platform of DISTRIBUTORS) {
    const spec = COVER_SPECS[platform];
    const label = PLATFORM_LABEL[platform];
    if (image.width < spec.min || image.height < spec.min) {
      results.push({
        id: 'ART-01',
        platform,
        severity: 'error',
        message: `${label} requires at least ${spec.min}px. Yours is ${size}.`,
        fix: `Upload artwork at least ${spec.min}px in both dimensions.`,
      });
    } else {
      results.push({
        id: 'ART-01',
        platform,
        severity: 'pass',
        message: `Cover art meets ${label}'s ${spec.min}px minimum.`,
        fix: '',
      });
    }
    if (image.width > spec.max || image.height > spec.max) {
      results.push({
        id: 'ART-02',
        platform,
        severity: 'error',
        message: `${label} allows a max of ${spec.max}px. Yours is ${size}.`,
        fix: `Export artwork at ${spec.max}px or smaller on each side.`,
      });
    } else {
      results.push({
        id: 'ART-02',
        platform,
        severity: 'pass',
        message: `Cover art is within ${label}'s ${spec.max}px maximum.`,
        fix: '',
      });
    }
    const ext = image.extension || 'missing';
    if (formatAllowed(ext, spec.formats)) {
      results.push({
        id: 'ART-06',
        platform,
        severity: 'pass',
        message: `Cover format .${ext} is accepted by ${label}.`,
        fix: '',
      });
    } else {
      results.push({
        id: 'ART-06',
        platform,
        severity: 'error',
        message: `${label} accepts ${formatList(spec.formats)}. Yours is .${ext}.`,
        fix: `Export the cover as ${formatList(spec.formats)}.`,
      });
    }
  }
  return results;
}

export function coverFileSizeRules(bytes: number): ValidationResult[] {
  const mb = bytes / (1024 * 1024);
  const shown = mb.toFixed(1);
  return DISTRIBUTORS.map((platform) => {
    const max = COVER_SPECS[platform].maxFileMB;
    const label = PLATFORM_LABEL[platform];
    const id = platform === 'tunecore' ? 'ART-07' : 'ART-08';
    if (mb < max) {
      return {
        id,
        platform,
        severity: 'pass' as const,
        message: `Cover file is ${shown} MB, under ${label}'s ${max} MB limit.`,
        fix: '',
      };
    }
    return {
      id,
      platform,
      severity: 'error' as const,
      message: `${label} requires cover art under ${max} MB. Yours is ${shown} MB.`,
      fix: 'Compress or resize the cover so the file is under that limit.',
    };
  });
}

function words(value: string): string[] {
  return normalizeForMatch(value).split(' ').filter(Boolean);
}

function exactCoverMatch(coverText: string, metadata: ReleaseMetadata): boolean | null {
  const artist = metadata.artist.trim();
  const title = metadata.title.trim();
  if (!artist || !title) return null;
  const found = words(coverText);
  const expected = [...words(artist), ...words(title)];
  if (found.length === 0 || expected.length === 0) return null;
  const allowed = new Set(expected);
  const seen = new Set(found);
  return found.every((word) => allowed.has(word)) && expected.every((word) => seen.has(word));
}

function exactRule(platform: Distributor, coverText: string, metadata: ReleaseMetadata): ValidationResult | null {
  const match = exactCoverMatch(coverText, metadata);
  if (match == null) return null;
  const label = PLATFORM_LABEL[platform];
  const id = platform === 'tunecore' ? 'ART-09' : 'ART-10';
  const expected = `${metadata.artist.trim()} / ${metadata.title.trim()}`;
  const found = coverText.trim().replace(/\s+/g, ' ');
  if (match) {
    return {
      id,
      platform,
      severity: 'pass',
      message: `Cover text matches the artist and title for ${label}. This check is best-effort.`,
      fix: '',
    };
  }
  return {
    id,
    platform,
    severity: 'warning',
    message: `${label} requires cover art text to exactly match your artist name and title. OCR found '${found}' but metadata is '${expected}'.`,
    fix: 'Use only the artist name and title on the cover, written the same way as in the form. OCR can miss stylized lettering.',
  };
}

function timeRule(platform: Distributor, coverText: string): ValidationResult {
  const label = PLATFORM_LABEL[platform];
  const id = platform === 'tunecore' ? 'META-07' : 'META-08';
  const normalized = normalizeForMatch(coverText);
  const found = TIME_WORDS.filter((word) => word.pattern.test(normalized)).map((word) => word.label);
  if (found.length === 0) {
    return {
      id,
      platform,
      severity: 'pass',
      message: `No time-sensitive words were found for ${label}.`,
      fix: '',
    };
  }
  return {
    id,
    platform,
    severity: 'error',
    message: `${label} prohibits time-sensitive words on cover art. Found '${found.join(', ')}'.`,
    fix: 'Remove words such as new, latest, exclusive, and limited edition from the cover.',
  };
}

export function distributorTextRules(coverText: string, metadata: ReleaseMetadata): ValidationResult[] {
  const results: ValidationResult[] = [];
  for (const platform of DISTRIBUTORS) {
    const exact = exactRule(platform, coverText, metadata);
    if (exact) results.push(exact);
    results.push(timeRule(platform, coverText));
  }
  return results;
}

function formatProblem(audio: AudioInfo, platform: Distributor): string | null {
  const spec = AUDIO_SPECS[platform];
  const depths = spec.bitDepths as readonly number[];
  const kind = deliveryKind(audio);
  const issues: string[] = [];
  if (kind !== 'wav' && kind !== 'flac') issues.push(kind === 'mp3' ? 'MP3' : kind === 'wma' ? 'WMA' : 'not WAV or FLAC');
  const rate = finite(audio.sampleRate);
  if (rate == null || Math.round(rate) !== spec.sampleRate) issues.push(rate == null ? 'unreadable sample rate' : `${Math.round(rate)} Hz`);
  const bits = finite(audio.bitsPerSample);
  if (kind !== 'mp3') {
    if (bits == null) issues.push('unreadable bit depth');
    else if (!depths.includes(bits)) issues.push(`${bits}-bit`);
  }
  const channels = finite(audio.numberOfChannels);
  if (channels == null || Math.round(channels) !== spec.channels) issues.push(channels == null ? 'unreadable channels' : `${Math.round(channels)} channels`);
  return issues.length === 0 ? null : issues.join(', ');
}

export function distributorAudioRules(audio: AudioInfo): ValidationResult[] {
  const results: ValidationResult[] = DISTRIBUTORS.map((platform) => {
    const label = PLATFORM_LABEL[platform];
    const id = platform === 'tunecore' ? 'AUDIO-16' : 'AUDIO-17';
    const problem = formatProblem(audio, platform);
    if (!problem) {
      return {
        id,
        platform,
        severity: 'pass' as const,
        message: `Audio matches ${label}'s 44.1 kHz, 16-bit stereo WAV or FLAC guidance.`,
        fix: '',
      };
    }
    return {
      id,
      platform,
      severity: 'warning' as const,
      message: `${label} requires 44.1 kHz, 16-bit stereo WAV or FLAC. Yours is ${problem}.`,
      fix: 'Export a 16-bit, 44.1 kHz stereo WAV or FLAC.',
    };
  });

  const name = audio.fileName.trim();
  if (FILENAME_RE.test(name)) {
    results.push({
      id: 'AUDIO-15',
      platform: 'cdbaby',
      severity: 'pass',
      message: 'File name uses only letters, numbers, hyphens, and underscores.',
      fix: '',
    });
  } else {
    results.push({
      id: 'AUDIO-15',
      platform: 'cdbaby',
      severity: 'error',
      message: `CD Baby requires file names with only letters, numbers, hyphens, and underscores. Yours contains '${name}'.`,
      fix: 'Rename the file so it uses only those characters, such as track_01.wav.',
    });
  }
  return results;
}
