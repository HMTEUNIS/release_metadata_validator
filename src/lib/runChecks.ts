import { extensionOf } from './format';
import { artRules } from './rules/artRules';
import { audioRules } from './rules/audioRules';
import { dkAudioRule, dkCoverRule } from './rules/dkRules';
import type { AudioInfo, ImageInfo, ReleaseMetadata, ValidationResult } from './types';
import { validateMetadata } from './validateMetadata';

export interface StaticCheckInput {
  hasAudioFile: boolean;
  audio: AudioInfo | null;
  audioError: string | null;
  hasImageFile: boolean;
  image: ImageInfo | null;
  imageError: string | null;
  imageFileName: string | null;
  metadata: ReleaseMetadata;
}

export function runStaticChecks(input: StaticCheckInput): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!input.hasAudioFile) {
    results.push({
      id: 'AUDIO-01',
      platform: 'all',
      severity: 'error',
      message: 'No audio file uploaded.',
      fix: 'Upload a WAV, FLAC, or MP3 master.',
    });
  } else if (!input.audio) {
    results.push({
      id: 'AUDIO-01',
      platform: 'all',
      severity: 'error',
      message: input.audioError
        ? `Could not read this audio file. ${input.audioError}`
        : 'Could not read this audio file.',
      fix: 'Export a standard WAV, FLAC, or MP3 and try again.',
    });
  } else {
    results.push(...audioRules(input.audio), dkAudioRule(input.audio));
  }

  if (!input.hasImageFile) {
    results.push({
      id: 'ART-01',
      platform: 'all',
      severity: 'error',
      message: 'No cover art uploaded.',
      fix: 'Upload a JPEG, PNG, or TIFF cover.',
    });
  } else if (!input.image) {
    results.push({
      id: 'ART-01',
      platform: 'all',
      severity: 'error',
      message: input.imageError
        ? `Could not decode this image in the browser. ${input.imageError}`
        : 'Could not decode this image in the browser, so size and shape were not checked.',
      fix: 'Export a JPEG or PNG and upload that. Many browsers cannot decode TIFF.',
    });
    if (input.imageFileName) results.push(dkCoverRule(extensionOf(input.imageFileName)));
  } else {
    results.push(...artRules(input.image), dkCoverRule(input.image.extension));
  }

  results.push(...validateMetadata(input.metadata));
  return results;
}
