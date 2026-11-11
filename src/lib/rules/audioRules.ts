import { formatCode } from '../format';
import type { AudioInfo, ContainerKind, ValidationResult } from '../types';

const PCM = 0x0001;
const EXTENSIBLE = 0xfffe;
const ALLOWED = new Set(['wav', 'flac', 'mp3']);

const KIND_LABEL: Record<ContainerKind, string> = {
  wav: 'WAV',
  flac: 'FLAC',
  mp3: 'MP3',
  wma: 'WMA',
  unknown: 'an unknown format',
};

export function actualKind(audio: AudioInfo): ContainerKind {
  if (audio.sniffed !== 'unknown') return audio.sniffed;
  const blob = `${audio.container ?? ''} ${audio.codec ?? ''}`.toLowerCase();
  if (blob.includes('flac')) return 'flac';
  if (blob.includes('mpeg') || blob.includes('mp3') || blob.includes('layer 3')) return 'mp3';
  if (blob.includes('wma') || blob.includes('asf') || blob.includes('windows media')) return 'wma';
  if (blob.includes('wave') || blob.includes('wav') || blob.includes('pcm') || audio.wavFormatCode != null) {
    return 'wav';
  }
  return 'unknown';
}

function finite(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function ruleAudio01(audio: AudioInfo): ValidationResult {
  const ext = audio.extension;
  const kind = actualKind(audio);
  if (!ALLOWED.has(ext)) {
    return {
      id: 'AUDIO-01',
      platform: 'all',
      severity: 'error',
      message: `File extension is .${ext || 'missing'}. Upload a WAV, FLAC, or MP3.`,
      fix: 'Export the master as WAV, FLAC, or MP3 and upload that file.',
    };
  }
  if (ext === 'wav' && kind === 'wav' && audio.wavFormatCode != null) {
    const code = audio.wavFormatCode;
    if (code !== PCM && code !== EXTENSIBLE) {
      return {
        id: 'AUDIO-01',
        platform: 'all',
        severity: 'error',
        message: `This WAV is not PCM. The header format code is ${formatCode(code)}.`,
        fix: 'Re-export from your DAW as standard PCM WAV. Renaming another format to .wav does not convert it.',
      };
    }
  }
  if (kind === 'unknown') {
    return {
      id: 'AUDIO-01',
      platform: 'all',
      severity: 'error',
      message: `This file is named .${ext}, but the header does not look like ${KIND_LABEL[ext as ContainerKind] ?? ext.toUpperCase()}.`,
      fix: 'Re-export the file from your DAW instead of renaming it.',
    };
  }
  if (kind !== ext) {
    const renamedMp3 = ext === 'wav' && kind === 'mp3';
    return {
      id: 'AUDIO-01',
      platform: 'all',
      severity: 'error',
      message: renamedMp3
        ? 'This file is named .wav, but the header is MP3, not PCM audio.'
        : `This file is named .${ext}, but the header is ${KIND_LABEL[kind]}.`,
      fix: renamedMp3
        ? 'Re-export from your DAW as a real PCM WAV. Renaming an MP3 to .wav does not change the format.'
        : 'Re-export the file so the extension matches the real format.',
    };
  }
  return {
    id: 'AUDIO-01',
    platform: 'all',
    severity: 'pass',
    message: `File format matches its .${ext} extension.`,
    fix: '',
    details: [audio.container, audio.codec].filter(Boolean).join(' / ') || undefined,
  };
}

function ruleAudio02(audio: AudioInfo): ValidationResult {
  if (actualKind(audio) === 'mp3') {
    return {
      id: 'AUDIO-02',
      platform: 'spotify',
      severity: 'pass',
      message: 'This MP3 has no PCM bit depth. Spotify accepts MP3.',
      fix: '',
    };
  }
  const bits = finite(audio.bitsPerSample);
  if (bits == null) {
    return {
      id: 'AUDIO-02',
      platform: 'spotify',
      severity: 'warning',
      message: 'Could not read the bit depth from this file.',
      fix: 'Re-export as 16-bit or 24-bit WAV or FLAC and check again.',
    };
  }
  if (bits === 16 || bits === 24) {
    return {
      id: 'AUDIO-02',
      platform: 'spotify',
      severity: 'pass',
      message: `Bit depth is ${bits}-bit.`,
      fix: '',
    };
  }
  return {
    id: 'AUDIO-02',
    platform: 'spotify',
    severity: 'error',
    message: `Spotify accepts 16-bit or 24-bit. Yours is ${bits}-bit.`,
    fix: 'Re-export as 16-bit or 24-bit audio.',
  };
}

function ruleAudio03(audio: AudioInfo): ValidationResult {
  const sampleRate = finite(audio.sampleRate);
  if (sampleRate == null) {
    return {
      id: 'AUDIO-03',
      platform: 'spotify',
      severity: 'warning',
      message: 'Could not read the sample rate from this file.',
      fix: 'Re-export the file and check again.',
    };
  }
  const rounded = Math.round(sampleRate);
  if (rounded >= 44100) {
    return {
      id: 'AUDIO-03',
      platform: 'spotify',
      severity: 'pass',
      message: `Sample rate is ${rounded} Hz.`,
      fix: '',
    };
  }
  return {
    id: 'AUDIO-03',
    platform: 'spotify',
    severity: 'error',
    message: `Spotify requires 44.1kHz or higher. Yours is ${rounded}Hz.`,
    fix: 'Re-export at 44.1 kHz or higher.',
  };
}

function ruleAudio04(audio: AudioInfo): ValidationResult {
  const channels = finite(audio.numberOfChannels);
  if (channels == null) {
    return {
      id: 'AUDIO-04',
      platform: 'spotify',
      severity: 'warning',
      message: 'Could not read the channel count from this file.',
      fix: 'Re-export a stereo file with 2 channels and check again.',
    };
  }
  const rounded = Math.round(channels);
  if (rounded === 2) {
    return {
      id: 'AUDIO-04',
      platform: 'spotify',
      severity: 'pass',
      message: 'Channel count is 2 (stereo).',
      fix: '',
    };
  }
  return {
    id: 'AUDIO-04',
    platform: 'spotify',
    severity: 'error',
    message: `Spotify accepts 2-channel audio. Yours has ${rounded} channels.`,
    fix: 'Export a stereo file with 2 channels.',
  };
}

function ruleAudio05(audio: AudioInfo): ValidationResult {
  if (actualKind(audio) !== 'wav') {
    return {
      id: 'AUDIO-05',
      platform: 'spotify',
      severity: 'pass',
      message: 'Not a WAV container, so the WAV format code was not checked.',
      fix: '',
    };
  }
  if (audio.wavFormatCode == null) {
    return {
      id: 'AUDIO-05',
      platform: 'spotify',
      severity: 'warning',
      message: 'Could not find a WAV format code in the header.',
      fix: 'Re-export from your DAW as standard PCM.',
    };
  }
  if (audio.wavFormatCode === PCM) {
    return {
      id: 'AUDIO-05',
      platform: 'spotify',
      severity: 'pass',
      message: 'WAV format code is 0x0001 (PCM).',
      fix: '',
    };
  }
  if (audio.wavFormatCode === EXTENSIBLE) {
    return {
      id: 'AUDIO-05',
      platform: 'spotify',
      severity: 'error',
      message: 'Spotify requires standard PCM WAV, not WAVE_FORMAT_EXTENSIBLE. Re-export from your DAW as standard PCM.',
      fix: 'Re-export from your DAW as standard PCM, not WAVE_FORMAT_EXTENSIBLE.',
    };
  }
  return {
    id: 'AUDIO-05',
    platform: 'spotify',
    severity: 'error',
    message: `Spotify requires standard PCM WAV (0x0001). This file's format code is ${formatCode(audio.wavFormatCode)}.`,
    fix: 'Re-export from your DAW as standard PCM.',
  };
}

function ruleAudio06(audio: AudioInfo): ValidationResult {
  if (actualKind(audio) !== 'wav') {
    return {
      id: 'AUDIO-06',
      platform: 'distrokid',
      severity: 'pass',
      message: "DistroKid's 16-bit WAV recommendation does not apply to this file type.",
      fix: '',
    };
  }
  const bits = finite(audio.bitsPerSample);
  if (bits == null) {
    return {
      id: 'AUDIO-06',
      platform: 'distrokid',
      severity: 'warning',
      message: 'Could not read the WAV bit depth for the DistroKid check.',
      fix: "Re-export as 16-bit PCM WAV if you want to match DistroKid's guide.",
    };
  }
  if (bits === 16) {
    return {
      id: 'AUDIO-06',
      platform: 'distrokid',
      severity: 'pass',
      message: "WAV is 16-bit, which matches DistroKid's documented standard.",
      fix: '',
    };
  }
  return {
    id: 'AUDIO-06',
    platform: 'distrokid',
    severity: 'warning',
    message: `DistroKid recommends 16-bit WAV. Yours is ${bits}-bit. This may still work but isn't their documented standard.`,
    fix: "Export a 16-bit WAV if you want to match DistroKid's guide.",
  };
}

export function audioRules(audio: AudioInfo): ValidationResult[] {
  return [
    ruleAudio01(audio),
    ruleAudio02(audio),
    ruleAudio03(audio),
    ruleAudio04(audio),
    ruleAudio05(audio),
    ruleAudio06(audio),
  ];
}
