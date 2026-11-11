import { ocrRules } from './rules/ocrRules';
import { loadImage } from './validateImage';
import type { OcrOutcome, OcrProgress, ReleaseMetadata, ValidationResult } from './types';

function assetUrl(relativePath: string): string {
  return new URL(relativePath, window.location.href).toString();
}

function progressLabel(status: string): string {
  if (status === 'recognizing text') return 'Reading cover text';
  if (status.toLowerCase().includes('language')) return 'Loading text recognition';
  if (status.toLowerCase().includes('load') || status.toLowerCase().includes('init')) {
    return 'Loading text recognition';
  }
  return 'Reading cover text';
}

function unreadable(details?: string): ValidationResult {
  return {
    id: 'OCR-01',
    platform: 'all',
    severity: 'warning',
    message: 'Could not read text from cover art. Text consistency not checked.',
    fix: 'Use a sharper image with larger type, then run the check again.',
    details,
  };
}

async function imageForOcr(file: File): Promise<Blob> {
  const maxEdgeLimit = 2000;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const maxEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (maxEdge <= maxEdgeLimit) return file;
    const scale = maxEdgeLimit / maxEdge;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ?? file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function recognizeCover(
  file: File,
  metadata: ReleaseMetadata,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrOutcome> {
  if (typeof window === 'undefined') {
    return { results: [unreadable()], text: null };
  }

  let worker: {
    recognize: (image: Blob) => Promise<{ data: { text?: string } }>;
    terminate: () => Promise<unknown>;
  } | null = null;
  try {
    const { createWorker, OEM } = await import('tesseract.js');
    let lastPaint = 0;
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: assetUrl('tesseract/worker.min.js'),
      corePath: assetUrl('tesseract/core'),
      langPath: assetUrl('tesseract/lang'),
      workerBlobURL: false,
      gzip: true,
      logger: (message) => {
        const now = Date.now();
        const fraction = typeof message.progress === 'number' ? message.progress : 0;
        if (now - lastPaint < 80 && fraction < 1) return;
        lastPaint = now;
        onProgress?.({
          label: progressLabel(message.status || ''),
          fraction,
        });
      },
    });
    const source = await imageForOcr(file);
    const recognized = await worker.recognize(source);
    const text = recognized.data.text ?? '';
    if (!text.trim()) return { results: [unreadable()], text: null };
    return { results: ocrRules(text, metadata), text };
  } catch (error) {
    const details = error instanceof Error ? error.message : undefined;
    return { results: [unreadable(details)], text: null };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // The warning result already covers a failed OCR run.
      }
    }
  }
}
