import { distributorCoverRules } from './distributorRules';
import type { ImageInfo, ValidationResult } from '../types';

const PREFERRED = new Set(['jpg', 'jpeg', 'png', 'tif', 'tiff']);

function ratioText(width: number, height: number): string {
  if (!height) return '0.00';
  return (width / height).toFixed(2);
}

export function artRules(image: ImageInfo): ValidationResult[] {
  const { width, height, extension } = image;
  const size = `${width}x${height}`;
  const results: ValidationResult[] = [];

  if (width < 640 || height < 640) {
    results.push({
      id: 'ART-01',
      platform: 'spotify',
      severity: 'error',
      message: `Spotify requires at least 640px. Yours is ${size}.`,
      fix: 'Upload a larger image, at least 640 pixels on each side.',
    });
  } else {
    results.push({
      id: 'ART-01',
      platform: 'spotify',
      severity: 'pass',
      message: `Cover is ${size}, which meets Spotify's 640px minimum.`,
      fix: '',
    });
  }

  if (width > 10000 || height > 10000) {
    results.push({
      id: 'ART-02',
      platform: 'spotify',
      severity: 'error',
      message: `Spotify allows up to 10000px. Yours is ${size}.`,
      fix: 'Export a smaller image. Each side must be 10000px or less.',
    });
  } else {
    results.push({
      id: 'ART-02',
      platform: 'spotify',
      severity: 'pass',
      message: `Cover is ${size}, within Spotify's 10000px maximum.`,
      fix: '',
    });
  }

  if (width < 4000 || height < 4000) {
    results.push({
      id: 'ART-03',
      platform: 'apple',
      severity: 'error',
      message: `Apple Music requires at least 4000px. Yours is ${size}.`,
      fix: 'Export a square image at least 4000px for Apple Music.',
    });
  } else {
    results.push({
      id: 'ART-03',
      platform: 'apple',
      severity: 'pass',
      message: `Cover is ${size}, which meets Apple Music's 4000px minimum.`,
      fix: '',
    });
  }

  if (width < 1000 || height < 1000) {
    results.push({
      id: 'ART-04',
      platform: 'distrokid',
      severity: 'error',
      message: `DistroKid requires at least 1000x1000. Yours is ${size}.`,
      fix: 'Export a square image at least 1000x1000 for DistroKid.',
    });
  } else if (width < 3000 || height < 3000) {
    results.push({
      id: 'ART-04',
      platform: 'distrokid',
      severity: 'warning',
      message: `DistroKid requires at least 1000px, recommends 3000px. Yours is ${size}.`,
      fix: 'Export a square image at 3000px or larger.',
    });
  } else {
    results.push({
      id: 'ART-04',
      platform: 'distrokid',
      severity: 'pass',
      message: `Cover is ${size}, which meets DistroKid's 3000px recommendation.`,
      fix: '',
    });
  }

  if (width !== height) {
    results.push({
      id: 'ART-05',
      platform: 'all',
      severity: 'error',
      message: `Cover art must be square. Yours is ${size} (${ratioText(width, height)}:1).`,
      fix: 'Crop or export the cover as a square image.',
    });
  } else {
    results.push({
      id: 'ART-05',
      platform: 'all',
      severity: 'pass',
      message: `Cover art is square (${size}).`,
      fix: '',
    });
  }

  const ext = extension || 'missing';
  if (PREFERRED.has(ext)) {
    results.push({
      id: 'ART-06',
      platform: 'spotify',
      severity: 'pass',
      message: `Cover format is .${ext}. Spotify prefers TIFF, PNG, or JPEG.`,
      fix: '',
    });
  } else {
    results.push({
      id: 'ART-06',
      platform: 'spotify',
      severity: 'warning',
      message: `Spotify prefers TIFF, PNG, or JPEG. Yours is .${ext}.`,
      fix: 'Export the cover as JPEG, PNG, or TIFF.',
    });
  }

  return [...results, ...distributorCoverRules(image)];
}
