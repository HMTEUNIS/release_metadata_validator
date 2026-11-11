import type { EmbeddedTags, ReleaseMetadata, ValidationResult } from './types';

export interface ReleaseTags {
  title?: string;
  artist?: string;
  featuring?: string;
  composer?: string;
  isrc?: string;
  explicit?: 'Yes' | 'No';
}

export interface TagPlan {
  tags: ReleaseTags;
  written: string[];
  omitted: string[];
}

const SPEC_IDS = ['AUDIO-01', 'AUDIO-02', 'AUDIO-03', 'AUDIO-04', 'AUDIO-05'];

function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function planReleaseTags(metadata: ReleaseMetadata): TagPlan {
  const tags: ReleaseTags = {};
  const written: string[] = [];
  const omitted: string[] = [];
  const title = filled(metadata.title);
  const artist = filled(metadata.artist);
  const featuring = filled(metadata.featuring);
  const composer = filled(metadata.composer);
  const isrc = filled(metadata.isrc);

  if (title) {
    tags.title = title;
    written.push(`Title: ${title}`);
  } else omitted.push('Title was left blank.');
  if (artist) {
    tags.artist = artist;
    written.push(`Artist: ${artist}`);
  } else omitted.push('Artist was left blank.');
  if (featuring) {
    tags.featuring = featuring;
    written.push(`Featuring: ${featuring}`);
  } else omitted.push('Featuring was left blank.');
  if (composer) {
    tags.composer = composer;
    written.push(`Composer: ${composer}`);
  } else omitted.push('Composer was left blank.');
  if (isrc) {
    tags.isrc = isrc;
    written.push(`ISRC: ${isrc}`);
  } else omitted.push('ISRC was left blank. The XML keeps a placeholder.');
  if (metadata.explicit === true || metadata.explicit === false) {
    tags.explicit = metadata.explicit ? 'Yes' : 'No';
    written.push(`Explicit: ${tags.explicit}`);
  } else omitted.push('Explicit was left blank.');

  return { tags, written, omitted };
}

export function hasReleaseTags(tags: ReleaseTags): boolean {
  return Boolean(tags.title || tags.artist || tags.featuring || tags.composer || tags.isrc || tags.explicit);
}

export function tagSignature(tags: ReleaseTags): string {
  return [tags.title, tags.artist, tags.featuring, tags.composer, tags.isrc, tags.explicit].join('\0');
}

export function releaseCaption(tags: ReleaseTags): string {
  return [
    tags.title ? `Title: ${tags.title}` : '',
    tags.artist ? `Artist: ${tags.artist}` : '',
    tags.featuring ? `Featuring: ${tags.featuring}` : '',
    tags.composer ? `Composer: ${tags.composer}` : '',
    tags.isrc ? `ISRC: ${tags.isrc}` : '',
    tags.explicit ? `Explicit: ${tags.explicit}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function fold(value?: string): string {
  return (value ?? '').trim();
}

function foldIsrc(value?: string): string {
  return fold(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function tagsAlreadyMatch(embedded: EmbeddedTags | undefined, tags: ReleaseTags): boolean {
  if (!hasReleaseTags(tags)) return true;
  if (tags.title && fold(embedded?.title) !== fold(tags.title)) return false;
  if (tags.artist && fold(embedded?.artist) !== fold(tags.artist)) return false;
  if (tags.featuring && fold(embedded?.featuring) !== fold(tags.featuring)) return false;
  if (tags.composer && fold(embedded?.composer) !== fold(tags.composer)) return false;
  if (tags.isrc && foldIsrc(embedded?.isrc) !== foldIsrc(tags.isrc)) return false;
  if (tags.explicit && fold(embedded?.explicit) !== fold(tags.explicit)) return false;
  return true;
}

export function fileStem(fileName: string): string {
  const trimmed = fileName.trim();
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const name = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return name.replace(/\.[^.]+$/, '') || 'file';
}

export function imageNeedsRelease(fileName: string, embedded: EmbeddedTags | undefined, tags: ReleaseTags): boolean {
  if (!hasReleaseTags(tags)) return false;
  if (!tagsAlreadyMatch(embedded, tags)) return true;
  return Boolean(tags.title && fold(fileStem(fileName)).toLowerCase() !== fold(tags.title).toLowerCase());
}

export function audioSpecsPass(results: ValidationResult[]): boolean {
  return SPEC_IDS.every((id) => results.some((result) => result.id === id && result.severity === 'pass'));
}

export function sanitizeStem(value: string | undefined): string {
  const cleaned = (value ?? '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned;
}

export function releaseDownloadName(title: string | undefined, originalName: string, extension: string): string {
  const stem = sanitizeStem(title) || `${fileStem(originalName)}-release`;
  return `${stem}.${extension}`;
}

export function releaseWavFilename(originalName: string, title?: string): string {
  return releaseDownloadName(title, originalName, 'wav');
}
