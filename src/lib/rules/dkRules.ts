import { actualKind } from './audioRules';
import type { AudioInfo, ValidationResult } from '../types';

export function dkCoverRule(extension: string): ValidationResult {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (ext === 'jpg' || ext === 'jpeg') {
    return {
      id: 'DK-01',
      platform: 'distrokid',
      severity: 'pass',
      message: 'Cover art is a JPEG, which matches DistroKid’s documented format.',
      fix: '',
    };
  }
  return {
    id: 'DK-01',
    platform: 'distrokid',
    severity: 'warning',
    message: `DistroKid prefers .jpg for cover art. Yours is .${ext || 'missing'}. It may still work, but .jpg is their documented format.`,
    fix: 'Export the cover as a .jpg file for DistroKid.',
  };
}

export function dkAudioRule(audio: AudioInfo): ValidationResult {
  if (actualKind(audio) === 'wma' || audio.extension === 'wma') {
    return {
      id: 'DK-02',
      platform: 'distrokid',
      severity: 'warning',
      message: 'DistroKid accepts WMA, but WAV or FLAC is safer for distribution.',
      fix: 'Export WAV or FLAC instead of WMA.',
    };
  }
  return {
    id: 'DK-02',
    platform: 'distrokid',
    severity: 'pass',
    message: 'Audio file is not WMA.',
    fix: '',
  };
}
