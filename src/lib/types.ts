export type Platform = 'spotify' | 'apple' | 'distrokid' | 'all';

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
}

export interface ImageInfo {
  fileName: string;
  extension: string;
  width: number;
  height: number;
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
