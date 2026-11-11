import { extensionOf } from './format';
import type { AudioInfo, ContainerKind } from './types';

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

export function sniffContainer(bytes: Uint8Array): ContainerKind {
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') {
    return 'wav';
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'fLaC') return 'flac';
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'ID3') return 'mp3';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x30 &&
    bytes[1] === 0x26 &&
    bytes[2] === 0xb2 &&
    bytes[3] === 0x75
  ) {
    return 'wma';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3';
  return 'unknown';
}

function tagAt(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * music-metadata does not expose the WAV fmt format tag. Walk chunk headers
 * and read the 16-bit code at the start of `fmt ` (0x0001 PCM, 0xFFFE extensible).
 */
export async function readWavFormatCode(file: Blob): Promise<number | null> {
  if (file.size < 12) return null;
  const head = new DataView(await file.slice(0, 12).arrayBuffer());
  if (tagAt(head, 0) !== 'RIFF' || tagAt(head, 8) !== 'WAVE') return null;

  let offset = 12;
  for (let i = 0; i < 64 && offset + 8 <= file.size; i += 1) {
    const chunk = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
    const id = tagAt(chunk, 0);
    const size = chunk.getUint32(4, true);
    if (id === 'fmt ') {
      const fmt = await file.slice(offset + 8, offset + 10).arrayBuffer();
      if (fmt.byteLength < 2) return null;
      return new DataView(fmt).getUint16(0, true);
    }
    const next = offset + 8 + size + (size % 2);
    if (next <= offset) return null;
    offset = next;
  }
  return null;
}

interface ParsedFormat {
  container?: string;
  codec?: string;
  bitsPerSample?: number;
  sampleRate?: number;
  numberOfChannels?: number;
  duration?: number;
}

interface ParsedTags {
  title?: string;
  artist?: string;
  isrc?: string[];
}

type ParseBlob = (blob: Blob) => Promise<{ format?: ParsedFormat; common?: ParsedTags }>;

async function loadParseBlob(): Promise<ParseBlob> {
  const imported = (await import('music-metadata-browser')) as {
    parseBlob?: ParseBlob;
    default?: { parseBlob?: ParseBlob };
  };
  const parseBlob = imported.parseBlob ?? imported.default?.parseBlob;
  if (!parseBlob) throw new Error('Audio parser failed to load in this browser.');
  return parseBlob;
}

export async function parseAudioFile(file: File): Promise<AudioInfo> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffContainer(header);
  const extension = extensionOf(file.name);
  let parsed: ParsedFormat | undefined;
  let tags: ParsedTags | undefined;

  try {
    const parseBlob = await loadParseBlob();
    const metadata = await parseBlob(file);
    parsed = metadata.format;
    tags = metadata.common;
  } catch (error) {
    if (sniffed === 'unknown') {
      throw new Error(error instanceof Error ? error.message : 'Could not read this audio file.');
    }
  }

  const wavFormatCode =
    sniffed === 'wav' || extension === 'wav' ? await readWavFormatCode(file) : null;

  return {
    fileName: file.name,
    extension,
    container: parsed?.container,
    codec: parsed?.codec,
    bitsPerSample: parsed?.bitsPerSample,
    sampleRate: parsed?.sampleRate,
    numberOfChannels: parsed?.numberOfChannels,
    duration: parsed?.duration,
    wavFormatCode,
    sniffed,
    tags: {
      title: tags?.title?.trim() || undefined,
      artist: tags?.artist?.trim() || undefined,
      isrc: tags?.isrc?.find((value) => value.trim())?.trim(),
    },
  };
}
