import { analyzeChannels, decodeFailure, LONG_TRACK_SECONDS, loudnessRules } from './analyzeBuffer';
import type { BufferAnalysis } from './analyzeBuffer';
import type { ValidationResult } from './types';

function channelsOf(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice());
}

function analyzeInWorker(sampleRate: number, channels: Float32Array[]): Promise<BufferAnalysis> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./loudness.worker.ts', import.meta.url));
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('Loudness measurement timed out.'));
    }, 120000);
    worker.onmessage = (event: MessageEvent<BufferAnalysis>) => {
      window.clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error('The loudness worker failed.'));
    };
    const transfers = channels.map((channel) => channel.buffer);
    worker.postMessage({ sampleRate, channels }, transfers);
  });
}

function openContext(sampleRate?: number): AudioContext {
  if (sampleRate && Number.isFinite(sampleRate) && sampleRate > 0) {
    try {
      return new AudioContext({ sampleRate });
    } catch {
      return new AudioContext();
    }
  }
  return new AudioContext();
}

export async function analyzeAudioFile(file: File, sampleRate?: number): Promise<ValidationResult[]> {
  const bytes = await file.arrayBuffer();
  const context = openContext(sampleRate);
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const channels = channelsOf(decoded);
    const seconds = decoded.length / decoded.sampleRate;
    try {
      const analysis =
        seconds > LONG_TRACK_SECONDS
          ? await analyzeInWorker(decoded.sampleRate, channels)
          : analyzeChannels(decoded.sampleRate, channels);
      return loudnessRules(analysis);
    } catch {
      return loudnessRules(analyzeChannels(decoded.sampleRate, channelsOf(decoded)));
    }
  } catch (error) {
    return decodeFailure(error instanceof Error ? error.message : 'The browser could not decode this file.');
  } finally {
    await context.close();
  }
}
