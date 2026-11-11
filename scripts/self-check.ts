import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { buildSkeletonXml, ISRC_PLACEHOLDER, UPC_PLACEHOLDER } from '../src/lib/ddexSkeleton';
import { prefersInlineXmlSave } from '../src/lib/downloadXml';
import { audioRules } from '../src/lib/rules/audioRules';
import { artRules } from '../src/lib/rules/artRules';
import { dkAudioRule, dkCoverRule } from '../src/lib/rules/dkRules';
import { metaRules } from '../src/lib/rules/metaRules';
import { ocrRules } from '../src/lib/rules/ocrRules';
import { runStaticChecks } from '../src/lib/runChecks';
import type { AudioInfo, ImageInfo, ReleaseMetadata, Severity, ValidationResult } from '../src/lib/types';
import { parseAudioFile, readWavFormatCode, sniffContainer } from '../src/lib/validateAudio';

function byId(results: ValidationResult[], id: string, severity?: Severity): ValidationResult {
  const found = results.find((result) => result.id === id && (!severity || result.severity === severity));
  assert.ok(found, `missing ${id} ${severity ?? ''}\n${JSON.stringify(results, null, 2)}`);
  return found;
}

function assertActions(results: ValidationResult[]) {
  const platforms = new Set(['spotify', 'apple', 'distrokid', 'all']);
  for (const result of results) {
    assert.ok(result.message.trim(), `${result.id} message`);
    assert.ok(platforms.has(result.platform), `${result.id} platform`);
    if (result.severity !== 'pass') assert.ok(result.fix.trim(), `${result.id} fix`);
  }
}

function audio(overrides: Partial<AudioInfo> = {}): AudioInfo {
  return {
    fileName: 'tone.wav',
    extension: 'wav',
    container: 'WAVE',
    codec: 'PCM',
    bitsPerSample: 16,
    sampleRate: 44100,
    numberOfChannels: 2,
    duration: 1,
    wavFormatCode: 0x0001,
    sniffed: 'wav',
    ...overrides,
  };
}

function image(width: number, height: number, extension = 'jpg'): ImageInfo {
  return { fileName: `cover.${extension || 'bin'}`, extension, width, height };
}

function meta(overrides: Partial<ReleaseMetadata> = {}): ReleaseMetadata {
  return {
    title: 'Night Drive',
    artist: 'Silver Harbor',
    featuring: '',
    composer: 'Ada Lovelace',
    explicit: false,
    ...overrides,
  };
}

function makePcmWav(options: {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  formatCode?: number;
  frames?: number;
}): Uint8Array {
  const formatCode = options.formatCode ?? 0x0001;
  const frames = options.frames ?? 32;
  const channels = options.channels;
  const bits = options.bitsPerSample;
  const blockAlign = channels * (bits >> 3);
  const dataBytes = frames * blockAlign;
  const extra = formatCode === 0xfffe ? 24 : 0;
  const fmtData = 16 + extra;
  const total = 12 + 8 + fmtData + 8 + dataBytes;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const write = (value: string) => {
    for (let i = 0; i < value.length; i += 1) bytes[offset++] = value.charCodeAt(i);
  };
  write('RIFF');
  view.setUint32(offset, total - 8, true);
  offset += 4;
  write('WAVE');
  write('fmt ');
  view.setUint32(offset, fmtData, true);
  offset += 4;
  view.setUint16(offset, formatCode, true);
  offset += 2;
  view.setUint16(offset, channels, true);
  offset += 2;
  view.setUint32(offset, options.sampleRate, true);
  offset += 4;
  view.setUint32(offset, options.sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bits, true);
  offset += 2;
  if (formatCode === 0xfffe) {
    view.setUint16(offset, 22, true);
    offset += 2;
    view.setUint16(offset, bits, true);
    offset += 2;
    view.setUint32(offset, channels === 1 ? 0x4 : 0x3, true);
    offset += 4;
    const guid = [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71];
    guid.forEach((byte) => {
      bytes[offset++] = byte;
    });
  }
  write('data');
  view.setUint32(offset, dataBytes, true);
  offset += 4;
  if (offset + dataBytes !== total) {
    throw new Error(`wav size mismatch ${offset}+${dataBytes} != ${total}`);
  }
  return bytes;
}

function fileFrom(bytes: Uint8Array, name: string, type = ''): File {
  return new File([bytes], name, { type });
}

function wavWithLeadingJunk(): Uint8Array {
  const fmt = makePcmWav({ sampleRate: 44100, channels: 2, bitsPerSample: 16, frames: 8 });
  const junk = Uint8Array.of(0x4a, 0x55, 0x4e, 0x4b, 4, 0, 0, 0, 0x61, 0x62, 0x63, 0x64);
  const out = new Uint8Array(fmt.length + junk.length);
  out.set(fmt.slice(0, 12), 0);
  out.set(junk, 12);
  out.set(fmt.slice(12), 12 + junk.length);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

function testRules() {
  const good = audioRules(audio());
  assertActions(good);
  assert.equal(good.every((result) => result.severity === 'pass'), true);

  const wide = audioRules(audio({ bitsPerSample: 24, sampleRate: 48000 }));
  assert.equal(byId(wide, 'AUDIO-02').severity, 'pass');
  assert.equal(byId(wide, 'AUDIO-06').severity, 'warning');
  assert.match(byId(wide, 'AUDIO-06').message, /24-bit/);

  const thin = audioRules(audio({ sampleRate: 22050, numberOfChannels: 1 }));
  assert.match(byId(thin, 'AUDIO-03', 'error').message, /22050Hz/);
  assert.match(byId(thin, 'AUDIO-04', 'error').message, /1 channels/);

  const extensible = audioRules(audio({ bitsPerSample: 24, wavFormatCode: 0xfffe }));
  assert.match(byId(extensible, 'AUDIO-05', 'error').message, /EXTENSIBLE/);
  assert.match(byId(extensible, 'AUDIO-05', 'error').fix, /PCM/);

  const floatWav = audioRules(audio({ wavFormatCode: 0x0003, bitsPerSample: 32 }));
  assert.match(byId(floatWav, 'AUDIO-01', 'error').message, /0x0003/);
  assert.equal(byId(floatWav, 'AUDIO-02').severity, 'error');

  const renamed = audioRules(
    audio({
      fileName: 'song.wav',
      extension: 'wav',
      container: 'MPEG',
      codec: 'MPEG 1 Layer 3',
      bitsPerSample: undefined,
      wavFormatCode: null,
      sniffed: 'mp3',
    }),
  );
  assert.match(byId(renamed, 'AUDIO-01', 'error').message, /MP3/);

  const wma = audio({ fileName: 'song.wma', extension: 'wma', container: 'ASF', codec: 'WMA', sniffed: 'wma', wavFormatCode: null });
  assert.equal(byId(audioRules(wma), 'AUDIO-01').severity, 'error');
  assert.equal(dkAudioRule(wma).severity, 'warning');
  assert.equal(dkAudioRule(audio()).severity, 'pass');

  const small = artRules(image(500, 500, 'png'));
  assertActions(small);
  assert.equal(byId(small, 'ART-01').severity, 'error');
  assert.equal(byId(small, 'ART-02').severity, 'pass');
  assert.equal(byId(small, 'ART-03').severity, 'error');
  assert.equal(byId(small, 'ART-04').severity, 'error');
  assert.equal(byId(small, 'ART-05').severity, 'pass');
  assert.equal(byId(small, 'ART-06').severity, 'pass');

  const apple = artRules(image(3000, 3000, 'jpg'));
  assert.equal(apple.every((result) => result.severity === 'pass'), true);

  const rectangle = artRules(image(500, 800, 'gif'));
  assert.match(byId(rectangle, 'ART-05', 'error').message, /500x800 \(0\.63:1\)/);
  assert.equal(byId(rectangle, 'ART-06').severity, 'warning');
  assert.match(byId(artRules(image(10001, 10001)), 'ART-02', 'error').message, /10001x10001/);

  assert.equal(dkCoverRule('jpg').severity, 'pass');
  assert.equal(dkCoverRule('jpeg').severity, 'pass');
  assert.match(dkCoverRule('png').message, /\.png/);

  const badMeta = metaRules(meta({ title: 'Song Title (Remix)', artist: 'Artist feat. Other', composer: 'R.J.' }));
  assertActions(badMeta);
  assert.equal(byId(badMeta, 'META-01').severity, 'error');
  assert.equal(byId(badMeta, 'META-02').severity, 'error');
  assert.equal(byId(badMeta, 'META-06').severity, 'warning');
  assert.match(byId(badMeta, 'META-06').message, /R\.J\./);

  const seo = metaRules(meta({ artist: 'Deep Sleep Radio' }));
  assert.match(byId(seo, 'META-04', 'error').message, /sleep/i);
  const phrase = metaRules(meta({ artist: 'Rain Sounds Collective' }));
  assert.match(byId(phrase, 'META-04', 'error').message, /rain sounds/i);
  const babyface = metaRules(meta({ artist: 'Babyface', title: 'OK', composer: 'Prince' }));
  assert.equal(byId(babyface, 'META-04').severity, 'pass');
  assert.equal(byId(babyface, 'META-05').severity, 'warning');
  assert.equal(byId(babyface, 'META-06').severity, 'warning');

  const empty = metaRules(meta({ title: '', artist: '', composer: '' }));
  assert.equal(empty.filter((result) => result.id === 'META-03' && result.severity === 'error').length, 2);
  assert.equal(byId(empty, 'META-06').severity, 'warning');

  const clean = meta({ title: 'Night Drive', artist: 'Silver Harbor' });
  const coverText = 'SILVER HARBOR — Night Drive';
  const ocrPass = ocrRules(coverText, clean);
  assertActions(ocrPass);
  assert.equal(byId(ocrPass, 'OCR-01').severity, 'pass');
  assert.equal(byId(ocrPass, 'OCR-02').severity, 'pass');
  const punctuated = ocrRules('Silver-Harbor: Night Drive!', clean);
  assert.equal(byId(punctuated, 'OCR-01').severity, 'pass');
  assert.equal(byId(punctuated, 'OCR-02').severity, 'pass');
  const promo = ocrRules('night drive www.example.com @silver $4.99', clean);
  assert.match(byId(promo, 'OCR-03', 'error').message, /www\.example\.com|@silver|\$4\.99/);
  const advisory = ocrRules('Parental Advisory Explicit Content', clean);
  assert.equal(byId(advisory, 'OCR-04').severity, 'error');
  assert.equal(byId(advisory, 'OCR-01').severity, 'warning');

  const ready = runStaticChecks({
    hasAudioFile: true,
    audio: audio(),
    audioError: null,
    hasImageFile: true,
    image: image(3000, 3000, 'jpg'),
    imageError: null,
    imageFileName: 'cover.jpg',
    metadata: clean,
  });
  assertActions(ready);
  assert.equal(ready.some((result) => result.severity !== 'pass'), false);

  const missing = runStaticChecks({
    hasAudioFile: false,
    audio: null,
    audioError: null,
    hasImageFile: false,
    image: null,
    imageError: null,
    imageFileName: null,
    metadata: meta({ title: '', artist: '', composer: '' }),
  });
  assert.equal(byId(missing, 'AUDIO-01').severity, 'error');
  assert.equal(byId(missing, 'ART-01').severity, 'error');
  assert.equal(byId(missing, 'META-03').severity, 'error');
}

async function testWavBytes() {
  const pcm = makePcmWav({ sampleRate: 44100, channels: 2, bitsPerSample: 16 });
  assert.equal(sniffContainer(pcm), 'wav');
  assert.equal(await readWavFormatCode(fileFrom(pcm, 'tone.wav', 'audio/wav')), 0x0001);
  assert.equal(await readWavFormatCode(fileFrom(wavWithLeadingJunk(), 'junk.wav')), 0x0001);

  const extensible = makePcmWav({
    sampleRate: 48000,
    channels: 2,
    bitsPerSample: 24,
    formatCode: 0xfffe,
  });
  assert.equal(await readWavFormatCode(fileFrom(extensible, 'ext.wav')), 0xfffe);

  const mp3ish = Uint8Array.of(0xff, 0xfb, 0x90, 0x00);
  assert.equal(sniffContainer(mp3ish), 'mp3');
  const parsed = await parseAudioFile(fileFrom(pcm, 'tone.wav', 'audio/wav'));
  assert.equal(parsed.sniffed, 'wav');
  assert.equal(parsed.wavFormatCode, 0x0001);
  assert.equal(parsed.sampleRate, 44100);
  assert.equal(parsed.bitsPerSample, 16);
  assert.equal(parsed.numberOfChannels, 2);
  assertActions(audioRules(parsed));
  assert.equal(audioRules(parsed).every((result) => result.severity === 'pass'), true);

  const renamed = await parseAudioFile(fileFrom(mp3ish, 'renamed.wav', 'audio/wav'));
  assert.equal(renamed.sniffed, 'mp3');
  assert.match(byId(audioRules(renamed), 'AUDIO-01', 'error').message, /MP3/);
}

function section(xml: string, tag: string): string {
  const start = xml.indexOf(`<${tag}`);
  const end = xml.lastIndexOf(`</${tag}>`);
  assert.ok(start >= 0 && end > start, `missing ${tag}`);
  return xml.slice(start, end + tag.length + 3);
}

function testDdex() {
  const now = new Date('2026-11-11T18:00:00.000Z');
  const xml = buildSkeletonXml(
    {
      metadata: {
        title: 'Night Drive',
        artist: 'Silver & Harbor',
        featuring: '',
        composer: 'Ada Lovelace',
        explicit: false,
      },
      audio: {
        fileName: 'tone.wav',
        extension: 'wav',
        bitsPerSample: 16,
        sampleRate: 44100,
        numberOfChannels: 2,
        duration: 222,
        wavFormatCode: 1,
        sniffed: 'wav',
      },
    },
    now,
  );
  new XMLParser({ ignoreAttributes: false }).parse(xml);
  assert.match(xml, /xmlns:ern="http:\/\/ddex.net\/xml\/ern\/43"/);
  assert.match(xml, /MessageSchemaVersionId="ern\/43"/);
  const resource = section(xml, 'ResourceList');
  const release = section(xml, 'ReleaseList');
  assert.match(resource, /Night Drive/);
  assert.match(release, /Night Drive/);
  assert.match(resource, /Silver &amp; Harbor/);
  assert.match(release, /Silver &amp; Harbor/);
  assert.match(resource, /<TechnicalSoundRecordingDetails>/);
  assert.match(resource, /<SamplingRate>44100<\/SamplingRate>/);
  assert.match(resource, /<BitsPerSample>16<\/BitsPerSample>/);
  assert.match(resource, /<NumberOfChannels>2<\/NumberOfChannels>/);
  assert.match(resource, /<Duration>PT3M42S<\/Duration>/);
  assert.match(xml, new RegExp(ISRC_PLACEHOLDER));
  assert.match(xml, /<StartDate>2026-11-11<\/StartDate>/);
  assert.match(xml, /PADPIDA0000000001X/);
  assert.match(xml, /PADPIDA0000000002X/);
  assert.doesNotMatch(xml, /HashSum/);
  assert.match(xml, /<FileName>tone\.wav<\/FileName>/);
  assert.match(xml, /PayAsYouGoModel/);
  assert.match(xml, /OnDemandStream/);
  assert.match(xml, /Worldwide/);
  assert.match(xml, new RegExp(UPC_PLACEHOLDER));

  const withIsrc = buildSkeletonXml(
    {
      metadata: { title: 'A', artist: 'B', featuring: '', composer: '', isrc: 'USRC17607839', explicit: null },
      audio: null,
    },
    now,
  );
  new XMLParser({ ignoreAttributes: false }).parse(withIsrc);
  assert.match(withIsrc, /USRC17607839/);
  assert.equal(withIsrc.includes(ISRC_PLACEHOLDER), false);
  assert.match(withIsrc, /<SamplingRate>PLACEHOLDER<\/SamplingRate>/);
  assert.match(withIsrc, /<FileName>track\.wav<\/FileName>/);

  const tricky = buildSkeletonXml(
    {
      metadata: { title: 'Rock <&>', artist: 'A & B', featuring: '', composer: '', explicit: null },
      audio: null,
    },
    now,
  );
  new XMLParser({ ignoreAttributes: false }).parse(tricky);

  assert.equal(prefersInlineXmlSave('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(prefersInlineXmlSave('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), true);
  assert.equal(prefersInlineXmlSave('Mozilla/5.0 (Linux; Android 14)'), true);
  assert.equal(prefersInlineXmlSave('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0'), false);
}

testRules();
testDdex();
testWavBytes()
  .then(() => {
    console.log('self-check ok');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
