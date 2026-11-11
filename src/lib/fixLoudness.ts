import { hasReleaseTags, sanitizeStem, type ReleaseTags } from './releaseTags';
import { stampWavTags, wavBlob } from './wavTags';

export const ISOLATION_MESSAGE =
  'Making a WAV in the browser is unavailable in this environment. This feature requires cross-origin isolation. Run locally with npm run dev, or use a host that sends the required headers.';

const TARGETS = {
  'AUDIO-13': { lufs: -14, platform: 'Spotify' },
  'AUDIO-14': { lufs: -16, platform: 'Apple Music' },
} as const;

export type LoudnessRuleId = keyof typeof TARGETS;

export type LoudnessProgress = { phase: 'preparing' } | { phase: 'running'; ratio: number };

let inFlight = false;
let coreUrls: { coreURL: string; wasmURL: string } | null = null;

export function loudnessTarget(ruleId: string): { lufs: number; platform: string } | null {
  if (ruleId !== 'AUDIO-13' && ruleId !== 'AUDIO-14') return null;
  return TARGETS[ruleId];
}

export function canUseLoudnessFix(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

export function normalizedFilename(originalName: string, targetLufs: number, title?: string): string {
  const base = sanitizeStem(title) || fileBase(originalName);
  return `${base}-normalized-${Math.abs(targetLufs)}lufs.wav`;
}

export function wavFilename(originalName: string): string {
  return `${fileBase(originalName)}.wav`;
}

export function pcmCodec(bitsPerSample?: number): string {
  if (bitsPerSample === 24) return 'pcm_s24le';
  if (bitsPerSample === 32) return 'pcm_s32le';
  return 'pcm_s16le';
}

function fileBase(originalName: string): string {
  const trimmed = originalName.trim();
  return trimmed.replace(/\.[^.]+$/, '') || 'track';
}

function inputName(file: File): string {
  const match = file.name.toLowerCase().match(/\.(wav|flac|mp3|aiff|aif|ogg|m4a)$/);
  return `input${match ? match[0] : '.wav'}`;
}

async function loadCoreUrls(): Promise<{ coreURL: string; wasmURL: string }> {
  if (coreUrls) return coreUrls;
  const { toBlobURL } = await import('@ffmpeg/util');
  const js = new URL('ffmpeg-core/ffmpeg-core.js', window.location.href).href;
  const wasm = new URL('ffmpeg-core/ffmpeg-core.wasm', window.location.href).href;
  coreUrls = {
    coreURL: await toBlobURL(js, 'text/javascript'),
    wasmURL: await toBlobURL(wasm, 'application/wasm'),
  };
  return coreUrls;
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error.replace(/^Error:\s*/, '');
  if (error instanceof Error && error.message) return error.message;
  return '';
}

export async function fixLoudness(
  file: File,
  targetLufs: number,
  onProgress?: (update: LoudnessProgress) => void,
  tags?: ReleaseTags,
): Promise<Blob> {
  return renderWav(
    file,
    ['-af', `loudnorm=I=${targetLufs}:TP=-1.0:LRA=11`, '-ar', '44100'],
    onProgress,
    'The loudness fix failed.',
    tags,
  );
}

export async function convertToWav(
  file: File,
  bitsPerSample: number | undefined,
  onProgress?: (update: LoudnessProgress) => void,
  tags?: ReleaseTags,
): Promise<Blob> {
  return renderWav(file, ['-c:a', pcmCodec(bitsPerSample)], onProgress, 'The WAV conversion failed.', tags);
}

async function renderWav(
  file: File,
  args: string[],
  onProgress: ((update: LoudnessProgress) => void) | undefined,
  failure: string,
  tags?: ReleaseTags,
): Promise<Blob> {
  if (!canUseLoudnessFix()) throw new Error(ISOLATION_MESSAGE);
  if (inFlight) throw new Error('A WAV file is already being made. Wait for it to finish.');
  inFlight = true;
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  const source = inputName(file);
  try {
    onProgress?.({ phase: 'preparing' });
    ffmpeg.on('progress', ({ progress }) => {
      if (!Number.isFinite(progress)) return;
      onProgress?.({ phase: 'running', ratio: Math.min(1, Math.max(0, progress)) });
    });
    const urls = await loadCoreUrls();
    try {
      await ffmpeg.load(urls);
    } catch (error) {
      const detail = errorText(error);
      if (/SharedArrayBuffer|cross-origin|isolated|wasm/i.test(detail)) throw new Error(ISOLATION_MESSAGE);
      throw new Error(detail ? `${failure} ${detail}` : failure);
    }
    onProgress?.({ phase: 'running', ratio: 0 });
    await ffmpeg.writeFile(source, await fetchFile(file));
    const code = await ffmpeg.exec(['-i', source, ...args, '-map_metadata', '-1', 'output.wav']);
    if (code !== 0) throw new Error(`${failure} FFmpeg exited with code ${code}.`);
    const data = await ffmpeg.readFile('output.wav');
    if (typeof data === 'string') throw new Error(`${failure} The output was not a WAV file.`);
    await ffmpeg.deleteFile(source);
    await ffmpeg.deleteFile('output.wav');
    const wav = new Uint8Array(data);
    const tagged = tags && hasReleaseTags(tags) ? stampWavTags(wav, tags) : wav;
    return wavBlob(tagged);
  } finally {
    try {
      ffmpeg.terminate();
    } catch {
      // The worker may not have started if loading failed.
    }
    inFlight = false;
  }
}
