import type { AudioInfo, ImageInfo } from './types';

export function extensionOf(fileName: string): string {
  const base = fileName.trim();
  const slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
  const name = slash >= 0 ? base.slice(slash + 1) : base;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function formatDuration(seconds?: number): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${remain.toString().padStart(2, '0')}`;
}

export function describeAudio(info: AudioInfo): string {
  const parts = [info.fileName];
  const duration = formatDuration(info.duration);
  if (duration) parts.push(duration);
  if (info.sampleRate) parts.push(`${Math.round(info.sampleRate)} Hz`);
  if (info.bitsPerSample) parts.push(`${info.bitsPerSample}-bit`);
  if (info.numberOfChannels === 1) parts.push('mono');
  else if (info.numberOfChannels === 2) parts.push('stereo');
  else if (info.numberOfChannels) parts.push(`${info.numberOfChannels} channels`);
  if (info.extension === 'wav' && info.sniffed === 'mp3') parts.push('header is MP3, not WAV');
  return parts.join(' · ');
}

export function describeImage(info: ImageInfo): string {
  const shape = info.width === info.height ? 'Square' : 'Not square';
  return `${info.fileName} · ${info.width}x${info.height} · ${shape}`;
}

export function formatCode(code: number): string {
  return `0x${code.toString(16).toUpperCase().padStart(4, '0')}`;
}
