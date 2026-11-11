import { stampImageTags } from './imageTags';
import { hasReleaseTags, type ReleaseTags } from './releaseTags';
import { coverExportEdge, coverFileLimitMB, type CoverPlatform } from './rules/platformSpecs';
import { loadImage } from './validateImage';

function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode this JPEG.'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function fitCoverFile(file: Blob, platform: CoverPlatform, width: number, height: number, tags: ReleaseTags): Promise<Blob> {
  const edge = coverExportEdge(platform, width, height);
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not draw this cover.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = Math.floor((image.naturalWidth - side) / 2);
    const sy = Math.floor((image.naturalHeight - side) / 2);
    context.drawImage(image, sx, sy, side, side, 0, 0, edge, edge);

    const limit = coverFileLimitMB(platform);
    const maxBytes = limit == null ? Number.POSITIVE_INFINITY : limit * 1024 * 1024;
    let quality = 0.92;
    let encoded = await canvasJpeg(canvas, quality);
    while (encoded.size >= maxBytes && quality > 0.5) {
      quality = Math.round((quality - 0.08) * 100) / 100;
      encoded = await canvasJpeg(canvas, quality);
    }
    if (!hasReleaseTags(tags)) return encoded;
    const stamped = stampImageTags(new Uint8Array(await encoded.arrayBuffer()), tags);
    const copy = new ArrayBuffer(stamped.byteLength);
    new Uint8Array(copy).set(stamped);
    return new Blob([copy], { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
