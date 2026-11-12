import { fileStem, sanitizeStem } from './releaseTags';

export function skeletonFilename(title?: string, audioName?: string): string {
  const track = sanitizeStem(title) || (audioName ? sanitizeStem(fileStem(audioName)) : '') || 'release';
  return `${track}_DDEX_skeleton.xml`;
}

export function prefersInlineXmlSave(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  if (prefersInlineXmlSave(navigator.userAgent)) {
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadXml(xml: string, filename = skeletonFilename()): void {
  downloadBlob(new Blob([xml], { type: 'application/xml' }), filename);
}
