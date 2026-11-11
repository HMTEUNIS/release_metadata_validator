import { releaseCaption, type ReleaseTags } from './releaseTags';

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

function putFourcc(target: Uint8Array, offset: number, value: string) {
  for (let i = 0; i < 4; i += 1) target[offset + i] = value.charCodeAt(i);
}

function latin1(value: string): Uint8Array | null {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 255) return null;
    bytes[i] = code;
  }
  return bytes;
}

function infoItem(id: string, value: string): Uint8Array | null {
  const text = latin1(value);
  if (!text) return null;
  const size = text.length + 1;
  const padded = size + (size % 2);
  const item = new Uint8Array(8 + padded);
  const view = new DataView(item.buffer);
  putFourcc(item, 0, id);
  view.setUint32(4, size, true);
  item.set(text, 8);
  return item;
}

function infoPayload(tags: ReleaseTags): Uint8Array | null {
  const caption = releaseCaption(tags);
  const items = [
    tags.title ? infoItem('INAM', tags.title) : null,
    tags.artist ? infoItem('IART', tags.artist) : null,
    tags.composer ? infoItem('IWRI', tags.composer) : null,
    tags.isrc ? infoItem('ISRC', tags.isrc) : null,
    caption ? infoItem('ICMT', caption) : null,
  ].filter((item): item is Uint8Array => item != null);
  if (items.length === 0) return null;
  const body = items.reduce((sum, item) => sum + item.length, 4);
  const payload = new Uint8Array(body);
  putFourcc(payload, 0, 'INFO');
  let offset = 4;
  for (const item of items) {
    payload.set(item, offset);
    offset += item.length;
  }
  return payload;
}

function syncsafe(size: number): Uint8Array {
  return Uint8Array.of((size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f);
}

function frame(id: string, body: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(10 + body.length);
  const view = new DataView(bytes.buffer);
  putFourcc(bytes, 0, id);
  view.setUint32(4, body.length, false);
  bytes.set(body, 10);
  return bytes;
}

function textFrame(id: string, encoding: number, text: Uint8Array): Uint8Array {
  const body = new Uint8Array(1 + text.length);
  body[0] = encoding;
  body.set(text, 1);
  return frame(id, body);
}

function txxxFrame(description: string, value: string): Uint8Array {
  const desc = utf16(description);
  const text = utf16(value);
  const body = new Uint8Array(1 + desc.length + 2 + text.length);
  body[0] = 1;
  body.set(desc, 1);
  body.set(text, 1 + desc.length + 2);
  return frame('TXXX', body);
}

function utf16(value: string): Uint8Array {
  const text = new Uint8Array(2 + value.length * 2);
  text[0] = 0xff;
  text[1] = 0xfe;
  const view = new DataView(text.buffer);
  for (let i = 0; i < value.length; i += 1) view.setUint16(2 + i * 2, value.charCodeAt(i), true);
  return text;
}

function id3Payload(tags: ReleaseTags): Uint8Array | null {
  const frames = [
    tags.title ? textFrame('TIT2', 1, utf16(tags.title)) : null,
    tags.artist ? textFrame('TPE1', 1, utf16(tags.artist)) : null,
    tags.composer ? textFrame('TCOM', 1, utf16(tags.composer)) : null,
    tags.isrc && latin1(tags.isrc) ? textFrame('TSRC', 0, latin1(tags.isrc)!) : null,
    tags.featuring ? txxxFrame('Featuring', tags.featuring) : null,
    tags.explicit ? txxxFrame('Explicit', tags.explicit) : null,
  ].filter((item): item is Uint8Array => item != null);
  if (frames.length === 0) return null;
  const bodySize = frames.reduce((sum, frame) => sum + frame.length, 0);
  const tag = new Uint8Array(10 + bodySize);
  putFourcc(tag, 0, 'ID3');
  tag[3] = 3;
  tag.set(syncsafe(bodySize), 6);
  let offset = 10;
  for (const frame of frames) {
    tag.set(frame, offset);
    offset += frame.length;
  }
  return tag;
}

function assemble(chunks: { id: string; data: Uint8Array }[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length + (chunk.data.length % 2), 4);
  const bytes = new Uint8Array(8 + size);
  const view = new DataView(bytes.buffer);
  putFourcc(bytes, 0, 'RIFF');
  view.setUint32(4, size, true);
  putFourcc(bytes, 8, 'WAVE');
  let offset = 12;
  for (const chunk of chunks) {
    putFourcc(bytes, offset, chunk.id);
    view.setUint32(offset + 4, chunk.data.length, true);
    bytes.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length + (chunk.data.length % 2);
  }
  return bytes;
}

export function stampWavTags(input: Uint8Array, tags: ReleaseTags): Uint8Array {
  if (input.length < 12 || fourcc(input, 0) !== 'RIFF' || fourcc(input, 8) !== 'WAVE') {
    throw new Error('The metadata export needs a WAV file.');
  }
  const chunks: { id: string; data: Uint8Array }[] = [];
  let offset = 12;
  for (let i = 0; i < 256 && offset + 8 <= input.length; i += 1) {
    const id = fourcc(input, offset);
    const size = u32(input, offset + 4);
    const start = offset + 8;
    const end = Math.min(input.length, start + size);
    const data = input.slice(start, end);
    const infoList = id === 'LIST' && fourcc(data, 0) === 'INFO';
    if (!infoList && id !== 'id3 ' && id !== 'ID3 ') chunks.push({ id, data });
    const next = start + size + (size % 2);
    if (next <= offset) break;
    offset = next;
  }
  const info = infoPayload(tags);
  const id3 = id3Payload(tags);
  if (info) chunks.push({ id: 'LIST', data: info });
  if (id3) chunks.push({ id: 'id3 ', data: id3 });
  return assemble(chunks);
}

export function wavBlob(bytes: Uint8Array): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: 'audio/wav' });
}

export async function writeReleaseWav(file: Blob, tags: ReleaseTags): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return wavBlob(stampWavTags(bytes, tags));
}
