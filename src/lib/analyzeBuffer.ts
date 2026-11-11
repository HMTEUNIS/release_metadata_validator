import { measure } from 'lufs-web';
import type { ValidationResult } from './types';

export const SILENCE_DBFS = -60;
export const SILENCE_LINEAR = 10 ** (SILENCE_DBFS / 20);
const FULL_SCALE = 32767 / 32768;
export const SILENCE_LIMIT_SECONDS = 3;
export const LONG_TRACK_SECONDS = 180;

const SPOTIFY_TARGET = -14;
const APPLE_TARGET = -16;

export interface SampleScan {
  clipSeconds: number | null;
  leadingSilence: number;
  trailingSilence: number;
}

export interface LoudnessReading {
  integratedLUFS: number;
}

export interface BufferAnalysis extends SampleScan {
  loudness: LoudnessReading | null;
  loudnessError?: string;
}

export function scanSamples(sampleRate: number, channels: Float32Array[]): SampleScan {
  const frames = channels[0]?.length ?? 0;
  const runs = new Array<number>(channels.length).fill(0);
  let clipAt: number | null = null;
  let leading = 0;
  let leadingDone = false;
  let trailing = 0;

  for (let index = 0; index < frames; index += 1) {
    let audible = false;
    for (let channel = 0; channel < channels.length; channel += 1) {
      const sample = channels[channel][index] ?? 0;
      const amplitude = sample < 0 ? -sample : sample;
      if (amplitude >= FULL_SCALE) {
        runs[channel] += 1;
        if (runs[channel] >= 3 && clipAt == null) clipAt = index - 2;
      } else {
        runs[channel] = 0;
      }
      if (amplitude >= SILENCE_LINEAR) audible = true;
    }
    if (!leadingDone) {
      if (audible) leadingDone = true;
      else leading += 1;
    }
    if (audible) trailing = 0;
    else trailing += 1;
  }

  const seconds = (framesCount: number) => (sampleRate > 0 ? framesCount / sampleRate : 0);
  return {
    clipSeconds: clipAt == null ? null : seconds(clipAt),
    leadingSilence: seconds(leading),
    trailingSilence: frames === 0 ? 0 : seconds(trailing),
  };
}

export function measureLoudness(sampleRate: number, channels: Float32Array[]): LoudnessReading {
  const result = measure({ sampleRate, channels });
  return { integratedLUFS: result.integratedLUFS };
}

export function analyzeChannels(sampleRate: number, channels: Float32Array[]): BufferAnalysis {
  const scan = scanSamples(sampleRate, channels);
  try {
    return { ...scan, loudness: measureLoudness(sampleRate, channels) };
  } catch (error) {
    return {
      ...scan,
      loudness: null,
      loudnessError: error instanceof Error ? error.message : 'Loudness measurement failed.',
    };
  }
}

function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function timestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}

function turn(target: number, measured: number): { direction: 'up' | 'down'; amount: string } {
  const delta = target - measured;
  return {
    direction: delta >= 0 ? 'up' : 'down',
    amount: oneDecimal(Math.abs(delta)),
  };
}

export function loudnessRules(analysis: BufferAnalysis): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (analysis.clipSeconds == null) {
    results.push({
      id: 'AUDIO-10',
      platform: 'all',
      severity: 'pass',
      message: 'No clipping detected.',
      fix: '',
    });
  } else {
    results.push({
      id: 'AUDIO-10',
      platform: 'all',
      severity: 'error',
      message: `Clipping detected at ${timestamp(analysis.clipSeconds)}. This may distort on streaming.`,
      fix: 'Lower the master so three samples in a row never reach full scale, then re-export.',
    });
  }

  if (analysis.leadingSilence > SILENCE_LIMIT_SECONDS) {
    results.push({
      id: 'AUDIO-11',
      platform: 'all',
      severity: 'warning',
      message: `${oneDecimal(analysis.leadingSilence)}s of silence at the start. Consider trimming.`,
      fix: 'Trim the silent opening, then re-export.',
    });
  } else {
    results.push({
      id: 'AUDIO-11',
      platform: 'all',
      severity: 'pass',
      message: 'No silence longer than 3 seconds at the start.',
      fix: '',
    });
  }

  if (analysis.trailingSilence > SILENCE_LIMIT_SECONDS) {
    results.push({
      id: 'AUDIO-12',
      platform: 'all',
      severity: 'warning',
      message: `${oneDecimal(analysis.trailingSilence)}s of silence at the end. Consider trimming.`,
      fix: 'Trim the silent ending, then re-export.',
    });
  } else {
    results.push({
      id: 'AUDIO-12',
      platform: 'all',
      severity: 'pass',
      message: 'No silence longer than 3 seconds at the end.',
      fix: '',
    });
  }

  if (!analysis.loudness) {
    const detail = analysis.loudnessError;
    results.push(
      {
        id: 'AUDIO-13',
        platform: 'spotify',
        severity: 'warning',
        message: 'Could not measure integrated loudness for the Spotify check.',
        fix: 'Re-export a standard WAV, FLAC, or MP3 and check again.',
        details: detail,
      },
      {
        id: 'AUDIO-14',
        platform: 'apple',
        severity: 'warning',
        message: 'Could not measure integrated loudness for the Apple Music check.',
        fix: 'Re-export a standard WAV, FLAC, or MP3 and check again.',
        details: detail,
      },
    );
    return results;
  }

  const measured = analysis.loudness.integratedLUFS;
  const shown = oneDecimal(measured);
  const spotify = turn(SPOTIFY_TARGET, measured);
  const apple = turn(APPLE_TARGET, measured);
  const spotifyInRange = measured >= -16 && measured <= -8;
  const appleInRange = measured >= -18 && measured <= -10;

  results.push({
    id: 'AUDIO-13',
    platform: 'spotify',
    severity: spotifyInRange ? 'pass' : 'warning',
    message: `Your master is ${shown} LUFS. Spotify normalizes to -14 LUFS, so your track will be turned ${spotify.direction} by ${spotify.amount} dB.`,
    fix: spotifyInRange ? '' : 'Adjust the master toward -14 LUFS if you want less playback gain change on Spotify.',
  });
  results.push({
    id: 'AUDIO-14',
    platform: 'apple',
    severity: appleInRange ? 'pass' : 'warning',
    message: `Apple Music normalizes to -16 LUFS. Your master will be turned ${apple.direction} by ${apple.amount} dB.`,
    fix: appleInRange ? '' : 'Adjust the master toward -16 LUFS if you want less playback gain change on Apple Music.',
    details: `${shown} LUFS`,
  });

  return results;
}

export function decodeFailure(message: string): ValidationResult[] {
  return ['AUDIO-10', 'AUDIO-11', 'AUDIO-12', 'AUDIO-13', 'AUDIO-14'].map((id) => ({
    id,
    platform: id === 'AUDIO-13' ? 'spotify' : id === 'AUDIO-14' ? 'apple' : 'all',
    severity: 'warning' as const,
    message:
      id === 'AUDIO-13' || id === 'AUDIO-14'
        ? 'Could not decode the audio, so loudness was not measured.'
        : 'Could not decode the audio, so clipping and silence were not checked.',
    fix: 'Export a standard WAV, FLAC, or MP3 and check again.',
    details: message,
  }));
}
