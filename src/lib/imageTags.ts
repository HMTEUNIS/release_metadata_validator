import { releaseCaption, type ReleaseTags } from './releaseTags';
import type { EmbeddedTags } from './types';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const TEXT_KEYS = ['Title', 'Author', 'Description', 'Comment', 'Composer', 'ISRC', 'Featuring', 'Explicit'];

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

function u16(bytes: Uint8Array, offset: number, little: boolean): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 2);
  return view.getUint16(0, little);
}

function u32(bytes: Uint8Array, offset: number, little: boolean): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return view.getUint32(0, little);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).replace(/\0+$/g, '').trim();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

function itxt(keyword: string, value: string): Uint8Array {
  const key = utf8(keyword);
  const text = utf8(value);
  const data = new Uint8Array(key.length + 5 + text.length);
  data.set(key, 0);
  data.set(text, key.length + 5);
  return pngChunk('iTXt', data);
}

function captionFields(caption: string): EmbeddedTags {
  const tags: EmbeddedTags = {};
  for (const line of caption.split(/\r?\n/)) {
    const split = line.indexOf(':');
    if (split < 0) continue;
    const key = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    if (!value) continue;
    if (key === 'title') tags.title = value;
    if (key === 'artist') tags.artist = value;
    if (key === 'featuring') tags.featuring = value;
    if (key === 'composer') tags.composer = value;
    if (key === 'isrc') tags.isrc = value;
    if (key === 'explicit') tags.explicit = value;
  }
  return tags;
}

function readPngTags(bytes: Uint8Array): EmbeddedTags {
  const tags: EmbeddedTags = {};
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset, false);
    const type = ascii(bytes, offset + 4, 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'iTXt' || type === 'tEXt') {
      const zero = data.indexOf(0);
      const keyword = zero >= 0 ? ascii(data, 0, zero) : '';
      const text =
        type === 'tEXt'
          ? ascii(data, zero + 1, data.length - zero - 1).replace(/\0+$/g, '').trim()
          : decodeUtf8(data.subarray(zero + 5));
      if (keyword === 'Title') tags.title = text;
      if (keyword === 'Author') tags.artist = text;
      if (keyword === 'Composer') tags.composer = text;
      if (keyword === 'Featuring') tags.featuring = text;
      if (keyword === 'ISRC') tags.isrc = text;
      if (keyword === 'Explicit') tags.explicit = text;
      if (keyword === 'Description' || keyword === 'Comment') Object.assign(tags, { ...captionFields(text), ...tags });
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return tags;
}

function stampPng(bytes: Uint8Array, tags: ReleaseTags): Uint8Array {
  const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset, false);
    const type = ascii(bytes, offset + 4, 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const keyword = data.indexOf(0) >= 0 ? ascii(data, 0, data.indexOf(0)) : '';
    const drop = (type === 'iTXt' || type === 'tEXt' || type === 'zTXt') && TEXT_KEYS.includes(keyword);
    if (type === 'IEND') {
      const caption = releaseCaption(tags);
      if (tags.title) chunks.push(itxt('Title', tags.title));
      if (tags.artist) chunks.push(itxt('Author', tags.artist));
      if (tags.featuring) chunks.push(itxt('Featuring', tags.featuring));
      if (tags.composer) chunks.push(itxt('Composer', tags.composer));
      if (tags.isrc) chunks.push(itxt('ISRC', tags.isrc));
      if (tags.explicit) chunks.push(itxt('Explicit', tags.explicit));
      if (caption) chunks.push(itxt('Description', caption));
      chunks.push(bytes.subarray(offset, offset + 12 + length));
      break;
    }
    if (!drop) chunks.push(bytes.subarray(offset, offset + 12 + length));
    const next = offset + 12 + length;
    if (next <= offset) break;
    offset = next;
  }
  return concat(chunks);
}

function xmpPacket(tags: ReleaseTags): string {
  const title = tags.title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(tags.title)}</rdf:li></rdf:Alt></dc:title>` : '';
  const artist = tags.artist
    ? `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(tags.artist)}</rdf:li></rdf:Seq></dc:creator>`
    : '';
  const caption = releaseCaption(tags);
  const description = caption
    ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(caption)}</rdf:li></rdf:Alt></dc:description>`
    : '';
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   ${title}${artist}${description}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function utf16le(value: string): Uint8Array {
  const bytes = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < value.length; i += 1) view.setUint16(i * 2, value.charCodeAt(i), true);
  return bytes;
}

function asciiValue(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length + 1);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function exifTiff(tags: ReleaseTags, orientation?: number): Uint8Array {
  const values: { tag: number; type: number; data: Uint8Array }[] = [];
  if (tags.title) values.push({ tag: 0x010e, type: 2, data: asciiValue(tags.title) });
  if (orientation) {
    const data = new Uint8Array(2);
    new DataView(data.buffer).setUint16(0, orientation, true);
    values.push({ tag: 0x0112, type: 3, data });
  }
  if (tags.artist) values.push({ tag: 0x013b, type: 2, data: asciiValue(tags.artist) });
  if (tags.title) values.push({ tag: 0x9c9b, type: 1, data: utf16le(tags.title) });
  if (tags.artist) values.push({ tag: 0x9c9d, type: 1, data: utf16le(tags.artist) });
  values.sort((left, right) => left.tag - right.tag);
  const dataOffset = 8 + 2 + values.length * 12 + 4;
  const payload = values.reduce((sum, value) => sum + (value.data.length <= 4 ? 0 : value.data.length), 0);
  const tiff = new Uint8Array(dataOffset + payload);
  const view = new DataView(tiff.buffer);
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, values.length, true);
  let cursor = dataOffset;
  values.forEach((value, index) => {
    const entry = 10 + index * 12;
    view.setUint16(entry, value.tag, true);
    view.setUint16(entry + 2, value.type, true);
    view.setUint32(entry + 4, value.type === 3 ? 1 : value.data.length, true);
    if (value.data.length <= 4) tiff.set(value.data, entry + 8);
    else {
      view.setUint32(entry + 8, cursor, true);
      tiff.set(value.data, cursor);
      cursor += value.data.length;
    }
  });
  return tiff;
}

function markerSegment(marker: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  const view = new DataView(out.buffer);
  out[0] = 0xff;
  out[1] = marker;
  view.setUint16(2, payload.length + 2, false);
  out.set(payload, 4);
  return out;
}

function exifSegment(tags: ReleaseTags, orientation?: number): Uint8Array {
  const header = utf8('Exif\0\0');
  const tiff = exifTiff(tags, orientation);
  const payload = new Uint8Array(header.length + tiff.length);
  payload.set(header, 0);
  payload.set(tiff, header.length);
  return markerSegment(0xe1, payload);
}

function xmpSegment(tags: ReleaseTags): Uint8Array {
  const header = utf8('http://ns.adobe.com/xap/1.0/\0');
  const body = utf8(xmpPacket(tags));
  const payload = new Uint8Array(header.length + body.length);
  payload.set(header, 0);
  payload.set(body, header.length);
  return markerSegment(0xe1, payload);
}

function iptcSegment(tags: ReleaseTags): Uint8Array {
  const datasets: Uint8Array[] = [];
  const push = (record: number, dataset: number, value: string) => {
    const text = utf8(value);
    const item = new Uint8Array(5 + text.length);
    item[0] = 0x1c;
    item[1] = record;
    item[2] = dataset;
    new DataView(item.buffer).setUint16(3, text.length, false);
    item.set(text, 5);
    datasets.push(item);
  };
  push(1, 90, '\u001b%G');
  if (tags.title) push(2, 5, tags.title);
  if (tags.artist) push(2, 80, tags.artist);
  const caption = releaseCaption(tags);
  if (caption) push(2, 120, caption);
  const iptc = concat(datasets);
  const padded = iptc.length % 2 === 0 ? iptc : concat([iptc, Uint8Array.of(0)]);
  const name = Uint8Array.of(0x38, 0x42, 0x49, 0x4d, 0x04, 0x04, 0x00, 0x00);
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, iptc.length, false);
  const prefix = utf8('Photoshop 3.0\0');
  return markerSegment(0xed, concat([prefix, name, size, padded]));
}

function readOrientation(payload: Uint8Array): number | undefined {
  if (ascii(payload, 0, 6) !== 'Exif\0\0') return undefined;
  const tiff = payload.subarray(6);
  if (tiff.length < 8) return undefined;
  const little = ascii(tiff, 0, 2) === 'II';
  const offset = u32(tiff, 4, little);
  if (offset + 2 > tiff.length) return undefined;
  const count = u16(tiff, offset, little);
  for (let index = 0; index < count; index += 1) {
    const entry = offset + 2 + index * 12;
    if (entry + 12 > tiff.length) return undefined;
    if (u16(tiff, entry, little) === 0x0112) return u16(tiff, entry + 8, little);
  }
  return undefined;
}

function isXmp(payload: Uint8Array): boolean {
  return ascii(payload, 0, 29) === 'http://ns.adobe.com/xap/1.0/\0';
}

function isExif(payload: Uint8Array): boolean {
  return ascii(payload, 0, 6) === 'Exif\0\0';
}

function isIptc(payload: Uint8Array): boolean {
  return ascii(payload, 0, 14) === 'Photoshop 3.0\0';
}

function stampJpeg(bytes: Uint8Array, tags: ReleaseTags): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('This image is not a JPEG.');
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation: number | undefined;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      kept.push(exifSegment(tags, orientation), xmpSegment(tags), iptcSegment(tags), bytes.subarray(offset));
      return concat(kept);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      kept.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const size = u16(bytes, offset + 2, false);
    const payload = bytes.subarray(offset + 4, offset + 2 + size);
    if (marker === 0xe1 && isExif(payload)) orientation = readOrientation(payload) ?? orientation;
    const drop = (marker === 0xe1 && (isExif(payload) || isXmp(payload))) || (marker === 0xed && isIptc(payload));
    if (!drop) kept.push(bytes.subarray(offset, offset + 2 + size));
    offset += 2 + size;
  }
  throw new Error('This JPEG has no image data.');
}

function readAsciiTag(tiff: Uint8Array, wanted: number): string | undefined {
  if (tiff.length < 8) return undefined;
  const little = ascii(tiff, 0, 2) === 'II';
  if (!little && ascii(tiff, 0, 2) !== 'MM') return undefined;
  const offset = u32(tiff, 4, little);
  if (offset + 2 > tiff.length) return undefined;
  const count = u16(tiff, offset, little);
  for (let index = 0; index < count; index += 1) {
    const entry = offset + 2 + index * 12;
    if (entry + 12 > tiff.length) return undefined;
    if (u16(tiff, entry, little) !== wanted) continue;
    const type = u16(tiff, entry + 2, little);
    const length = u32(tiff, entry + 4, little);
    if (type !== 2) return undefined;
    const data = length <= 4 ? tiff.subarray(entry + 8, entry + 8 + length) : tiff.subarray(u32(tiff, entry + 8, little), u32(tiff, entry + 8, little) + length);
    return ascii(data, 0, data.length).replace(/\0+$/g, '').trim();
  }
  return undefined;
}

function readJpegTags(bytes: Uint8Array): EmbeddedTags {
  const tags: EmbeddedTags = {};
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    const size = u16(bytes, offset + 2, false);
    const payload = bytes.subarray(offset + 4, offset + 2 + size);
    if (marker === 0xe1 && isExif(payload)) {
      const tiff = payload.subarray(6);
      tags.title = readAsciiTag(tiff, 0x010e) || tags.title;
      tags.artist = readAsciiTag(tiff, 0x013b) || tags.artist;
    }
    if (marker === 0xe1 && isXmp(payload)) {
      const xml = decodeUtf8(payload.subarray(29));
      const title = xml.match(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]*)<\/rdf:li>/);
      const artist = xml.match(/<dc:creator>[\s\S]*?<rdf:li[^>]*>([^<]*)<\/rdf:li>/);
      const description = xml.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([^<]*)<\/rdf:li>/);
      if (title?.[1]) tags.title = title[1];
      if (artist?.[1]) tags.artist = artist[1];
      if (description?.[1]) Object.assign(tags, captionFields(description[1].replace(/&#10;/g, '\n')), { title: tags.title, artist: tags.artist });
    }
    offset += 2 + size;
  }
  return tags;
}

function stampTiff(bytes: Uint8Array, tags: ReleaseTags): Uint8Array {
  if (bytes.length < 8) throw new Error('This image is not a TIFF.');
  const little = ascii(bytes, 0, 2) === 'II';
  if (!little && ascii(bytes, 0, 2) !== 'MM') throw new Error('This image is not a TIFF.');
  const offset = u32(bytes, 4, little);
  const count = u16(bytes, offset, little);
  const unique = [
    tags.title ? { tag: 0x010e, text: tags.title } : null,
    tags.artist ? { tag: 0x013b, text: tags.artist } : null,
  ].filter((item): item is { tag: number; text: string } => item != null);
  const replaced = new Set(unique.map((item) => item.tag));
  const kept: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = bytes.subarray(offset + 2 + index * 12, offset + 2 + index * 12 + 12);
    if (!replaced.has(u16(entry, 0, little))) kept.push(entry);
  }
  const total = kept.length + unique.length;
  const ifd = new Uint8Array(2 + total * 12 + 4);
  const view = new DataView(ifd.buffer);
  view.setUint16(0, total, little);
  let cursor = bytes.length + ifd.length;
  const strings = unique.map((item) => {
    const data = asciiValue(item.text);
    const at = cursor;
    cursor += data.length;
    return { ...item, data, at };
  });
  const entries = [
    ...kept.map((entry) => ({ tag: u16(entry, 0, little), bytes: entry })),
    ...strings.map((item) => {
      const entry = new Uint8Array(12);
      const entryView = new DataView(entry.buffer);
      entryView.setUint16(0, item.tag, little);
      entryView.setUint16(2, 2, little);
      entryView.setUint32(4, item.data.length, little);
      entryView.setUint32(8, item.at, little);
      return { tag: item.tag, bytes: entry };
    }),
  ].sort((left, right) => left.tag - right.tag);
  entries.forEach((entry, index) => ifd.set(entry.bytes, 2 + index * 12));
  view.setUint32(2 + total * 12, u32(bytes, offset + 2 + count * 12, little), little);
  const out = new Uint8Array(cursor);
  out.set(bytes, 0);
  new DataView(out.buffer).setUint32(4, bytes.length, little);
  out.set(ifd, bytes.length);
  strings.forEach((item) => out.set(item.data, item.at));
  return out;
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export function readImageTags(bytes: Uint8Array): EmbeddedTags {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return readJpegTags(bytes);
  if (isPng(bytes)) return readPngTags(bytes);
  if (bytes.length >= 4 && (ascii(bytes, 0, 2) === 'II' || ascii(bytes, 0, 2) === 'MM')) {
    return {
      title: readAsciiTag(bytes, 0x010e),
      artist: readAsciiTag(bytes, 0x013b),
    };
  }
  return {};
}

export function stampImageTags(bytes: Uint8Array, tags: ReleaseTags): Uint8Array {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return stampJpeg(bytes, tags);
  if (isPng(bytes)) return stampPng(bytes, tags);
  if (bytes.length >= 4 && (ascii(bytes, 0, 2) === 'II' || ascii(bytes, 0, 2) === 'MM')) return stampTiff(bytes, tags);
  throw new Error('Corrected art can be written for JPEG, PNG, or TIFF files.');
}

export async function writeReleaseImage(file: Blob, tags: ReleaseTags): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stamped = stampImageTags(bytes, tags);
  const type = isPng(stamped) ? 'image/png' : stamped[0] === 0x49 || stamped[0] === 0x4d ? 'image/tiff' : 'image/jpeg';
  const copy = new ArrayBuffer(stamped.byteLength);
  new Uint8Array(copy).set(stamped);
  return new Blob([copy], { type });
}
