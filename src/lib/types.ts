export type Platform = 'spotify' | 'apple' | 'distrokid' | 'tunecore' | 'cdbaby' | 'all';

export type Severity = 'error' | 'warning' | 'pass';

export type ContainerKind = 'wav' | 'flac' | 'mp3' | 'wma' | 'unknown';

export interface ValidationResult {
  id: string;
  platform: Platform;
  severity: Severity;
  message: string;
  fix: string;
  details?: string;
}

export interface EmbeddedTags {
  title?: string;
  artist?: string;
  featuring?: string;
  composer?: string;
  isrc?: string;
  explicit?: string;
}

export interface AudioInfo {
  fileName: string;
  extension: string;
  container?: string;
  codec?: string;
  bitsPerSample?: number;
  sampleRate?: number;
  numberOfChannels?: number;
  duration?: number;
  wavFormatCode: number | null;
  sniffed: ContainerKind;
  tags?: EmbeddedTags;
}

export interface ImageInfo {
  fileName: string;
  extension: string;
  width: number;
  height: number;
  bytes?: number;
  tags?: EmbeddedTags;
}

export interface ReleaseMetadata {
  title: string;
  artist: string;
  featuring: string;
  composer: string;
  isrc?: string;
  explicit: boolean | null;
}

export interface OcrProgress {
  label: string;
  fraction: number;
}

export interface OcrOutcome {
  results: ValidationResult[];
  text: string | null;
}
