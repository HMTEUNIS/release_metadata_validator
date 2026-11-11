import { extensionOf } from './format';
import type { ImageInfo } from './types';

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode this image.'));
    img.src = url;
  });
}

export async function parseImageFile(file: File): Promise<ImageInfo> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('The image has no readable dimensions.');
    }
    return {
      fileName: file.name,
      extension: extensionOf(file.name),
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
