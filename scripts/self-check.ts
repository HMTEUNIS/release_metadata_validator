import assert from 'node:assert/strict';
import { parseBuffer } from 'music-metadata';
import { buildSkeletonXml } from '../src/lib/ddexSkeleton';
import { prefersInlineXmlSave, skeletonFilename } from '../src/lib/downloadXml';
import { coverExportEdge } from '../src/lib/rules/platformSpecs';
import { audioRules } from '../src/lib/rules/audioRules';
import { coverFileSizeRules } from '../src/lib/rules/distributorRules';
import { artRules } from '../src/lib/rules/artRules';
import { dkAudioRule, dkCoverRule } from '../src/lib/rules/dkRules';
import { metaRules } from '../src/lib/rules/metaRules';
import { ocrRules } from '../src/lib/rules/ocrRules';
import { runStaticChecks } from '../src/lib/runChecks';
import type { AudioInfo, ImageInfo, ReleaseMetadata, Severity, ValidationResult } from '../src/lib/types';
import { analyzeChannels, loudnessRules, scanSamples } from '../src/lib/analyzeBuffer';
import { normalizedFilename, pcmCodec, wavFilename } from '../src/lib/fixLoudness';
import { readImageTags, stampImageTags } from '../src/lib/imageTags';
import { audioSpecsPass, imageNeedsRelease, planReleaseTags, releaseWavFilename, tagsAlreadyMatch } from '../src/lib/releaseTags';
import { stampWavTags } from '../src/lib/wavTags';
import { parseAudioFile, readWavFormatCode, sniffContainer } from '../src/lib/validateAudio';

function byId(results: ValidationResult[], id: string, severity?: Severity): ValidationResult {
  const found = results.find((result) => result.id === id && (!severity || result.severity === severity));
  assert.ok(found, `missing ${id} ${severity ?? ''}\n${JSON.stringify(results, null, 2)}`);
  return found;
}

function assertActions(results: ValidationResult[]) {
  const platforms = new Set(['spotify', 'apple', 'distrokid', 'tunecore', 'cdbaby', 'all']);
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

  const apple = artRules(image(4000, 4000, 'jpg'));
  const legacyApple = apple.filter((result) => result.platform !== 'tunecore' && result.platform !== 'cdbaby');
  assert.equal(legacyApple.every((result) => result.severity === 'pass'), true);
  assert.match(byId(apple, 'ART-02', 'error').message, /max of 3000px/);
  const belowApple = artRules(image(3000, 3000, 'jpg'));
  assert.equal(byId(belowApple, 'ART-03').severity, 'error');
  assert.match(byId(belowApple, 'ART-03').message, /4000px/);
  assert.equal(byId(artRules(image(1500, 1500, 'jpg')), 'ART-04').severity, 'warning');

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
    image: image(4000, 4000, 'jpg'),
    imageError: null,
    imageFileName: 'cover.jpg',
    metadata: clean,
  });
  assertActions(ready);
  const legacyReady = ready.filter((result) => result.platform !== 'tunecore' && result.platform !== 'cdbaby');
  assert.equal(legacyReady.some((result) => result.severity !== 'pass'), false);
  assert.match(
    byId(artRules(image(1200, 1200, 'jpg')).filter((result) => result.platform === 'tunecore'), 'ART-01').message,
    /1600px/,
  );
  assert.equal(byId(artRules(image(1600, 1600, 'jpg')).filter((result) => result.platform === 'tunecore'), 'ART-01').severity, 'pass');
  assert.equal(byId(artRules(image(1400, 1400, 'jpg')).filter((result) => result.platform === 'cdbaby'), 'ART-01').severity, 'pass');
  assert.equal(byId(artRules(image(3500, 3500, 'jpg')).filter((result) => result.platform === 'cdbaby'), 'ART-02').severity, 'error');
  assert.equal(byId(artRules(image(3000, 3000, 'jpg')).filter((result) => result.platform === 'tunecore'), 'ART-02').severity, 'pass');
  assert.equal(coverExportEdge('spotify', 1200, 1200), 1200);
  assert.equal(coverExportEdge('apple', 1200, 1200), 4000);
  assert.equal(coverExportEdge('distrokid', 1200, 1200), 3000);
  assert.equal(coverExportEdge('tunecore', 1200, 800), 1600);
  assert.equal(coverExportEdge('cdbaby', 1200, 800), 1400);
  assert.equal(coverExportEdge('tunecore', 5000, 5000), 3000);
  assert.equal(coverExportEdge('spotify', 12000, 12000), 10000);
  const twelveMb = 12 * 1024 * 1024;
  const eightMb = 8 * 1024 * 1024;
  assert.equal(byId(coverFileSizeRules(twelveMb), 'ART-07').severity, 'error');
  assert.equal(byId(coverFileSizeRules(eightMb), 'ART-07').severity, 'pass');
  assert.equal(byId(coverFileSizeRules(30 * 1024 * 1024), 'ART-08').severity, 'error');
  assert.equal(byId(coverFileSizeRules(20 * 1024 * 1024), 'ART-08').severity, 'pass');
  assert.equal(byId(audioRules(audio({ bitsPerSample: 24 })), 'AUDIO-16').severity, 'warning');
  assert.equal(byId(audioRules(audio({ bitsPerSample: 16 })), 'AUDIO-16').severity, 'pass');
  assert.equal(byId(audioRules(audio({ bitsPerSample: 24 })), 'AUDIO-17').severity, 'warning');
  assert.equal(byId(audioRules(audio({ fileName: 'track (1).wav' })), 'AUDIO-15').severity, 'error');
  assert.equal(byId(audioRules(audio({ fileName: 'track_01.wav' })), 'AUDIO-15').severity, 'pass');
  const exact = ocrRules('Silver Harbor Night Drive', clean);
  assert.equal(byId(exact, 'ART-09').severity, 'pass');
  const extra = ocrRules('Silver Harbor Night Drive latest', clean);
  assert.equal(byId(extra, 'ART-09').severity, 'warning');
  assert.match(byId(extra, 'META-07', 'error').message, /latest/);
  assert.match(byId(extra, 'META-08', 'error').message, /latest/);

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

function tone(frames: number, sampleRate: number, write: (index: number) => number): Float32Array {
  const samples = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) samples[index] = write(index);
  return samples;
}

function testLoudness() {
  const sampleRate = 1000;
  const silentLead = tone(5000, sampleRate, () => 0);
  const blip = tone(1000, sampleRate, (index) => Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.2);
  const leading = new Float32Array(silentLead.length + blip.length);
  leading.set(silentLead, 0);
  leading.set(blip, silentLead.length);
  const leadScan = scanSamples(sampleRate, [leading, leading]);
  assert.ok(leadScan.leadingSilence > 3);
  assert.match(byId(loudnessRules({ ...leadScan, loudness: { integratedLUFS: -14 } }), 'AUDIO-11', 'warning').message, /5\.0s of silence at the start/);

  const trailing = new Float32Array(blip.length + silentLead.length);
  trailing.set(blip, 0);
  trailing.set(silentLead, blip.length);
  const trailScan = scanSamples(sampleRate, [trailing]);
  assert.match(byId(loudnessRules({ ...trailScan, loudness: { integratedLUFS: -14 } }), 'AUDIO-12', 'warning').message, /silence at the end/);

  const clipped = tone(100, sampleRate, (index) => (index >= 10 && index <= 12 ? 1 : 0.2));
  const clipScan = scanSamples(sampleRate, [clipped]);
  assert.equal(clipScan.clipSeconds, 0.01);
  assert.match(byId(loudnessRules({ ...clipScan, loudness: { integratedLUFS: -10 } }), 'AUDIO-10', 'error').message, /Clipping detected at 0:00\.01/);
  const fullScale = tone(10, sampleRate, (index) => (index < 3 ? 32767 / 32768 : 0.2));
  assert.equal(scanSamples(sampleRate, [fullScale]).clipSeconds, 0);
  const onePeak = tone(10, sampleRate, (index) => (index === 4 ? 1 : 0.2));
  assert.equal(scanSamples(sampleRate, [onePeak]).clipSeconds, null);

  const quiet = loudnessRules({ clipSeconds: null, leadingSilence: 0, trailingSilence: 0, loudness: { integratedLUFS: -20 } });
  assert.match(byId(quiet, 'AUDIO-13', 'warning').message, /-20\.0 LUFS/);
  assert.match(byId(quiet, 'AUDIO-13').message, /turned up by 6\.0 dB/);
  assert.equal(byId(quiet, 'AUDIO-14').severity, 'warning');

  const hot = loudnessRules({ clipSeconds: null, leadingSilence: 0, trailingSilence: 0, loudness: { integratedLUFS: -6 } });
  assert.match(byId(hot, 'AUDIO-13', 'warning').message, /turned down by 8\.0 dB/);
  assert.match(byId(hot, 'AUDIO-14', 'warning').message, /turned down by 10\.0 dB/);

  const centered = loudnessRules({ clipSeconds: null, leadingSilence: 0, trailingSilence: 0, loudness: { integratedLUFS: -14 } });
  assert.equal(byId(centered, 'AUDIO-13').severity, 'pass');
  assert.equal(byId(centered, 'AUDIO-14').severity, 'pass');

  const measured = analyzeChannels(sampleRate, [blip, blip]);
  assert.ok(measured.loudness);
  assert.ok(Number.isFinite(measured.loudness.integratedLUFS));
  assert.equal(normalizedFilename('track.wav', -14), 'track-normalized-14lufs.wav');
  assert.equal(normalizedFilename('night drive.flac', -16), 'night drive-normalized-16lufs.wav');
  assert.equal(wavFilename('night drive.flac'), 'night drive.wav');
  assert.equal(wavFilename('song.mp3'), 'song.wav');
  assert.equal(pcmCodec(24), 'pcm_s24le');
  assert.equal(pcmCodec(16), 'pcm_s16le');
  assert.equal(pcmCodec(undefined), 'pcm_s16le');
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

function assertWellFormedXml(xml: string): void {
  if (!xml.startsWith('<?xml')) throw new Error('The skeleton is missing an XML declaration.');
  const body = xml.replace(/<\?xml[^?]*\?>/, '');
  const stack: string[] = [];
  const tags = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*)>/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  while ((match = tags.exec(body))) {
    const text = body.slice(cursor, match.index);
    if (/[<>]/.test(text) || /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) {
      throw new Error('The skeleton has unescaped text.');
    }
    cursor = match.index + match[0].length;
    const [, slash, name, rest] = match;
    if (rest.endsWith('/')) continue;
    if (slash) {
      if (stack.pop() !== name) throw new Error(`The skeleton closes ${name} out of order.`);
    } else {
      stack.push(name);
    }
  }
  if (stack.length > 0 || body.slice(cursor).trim()) throw new Error('The skeleton has unclosed tags.');
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
      imageFileName: 'cover.jpg',
    },
    now,
  );
  assertWellFormedXml(xml);
  assert.match(xml, /xmlns:ern="http:\/\/ddex.net\/xml\/ern\/43"/);
  assert.match(xml, /ReleaseProfileVersionId="SimpleAudioSingle"/);
  assert.match(xml, /AvsVersionId="12"/);
  assert.match(xml, /<Type>MusicalWorkSoundRecording<\/Type>/);
  assert.match(xml, /<ReleaseType>Single<\/ReleaseType>/);
  assert.match(xml, /<TrackRelease>/);
  assert.match(xml, /<DealList>/);
  assert.match(xml, /<ICPN><\/ICPN>/);
  assert.match(xml, /<GRid><\/GRid>/);
  assert.match(xml, /<GenreText><\/GenreText>/);
  assert.match(xml, /<TerritoryCode><\/TerritoryCode>/);
  assert.match(xml, /<StartDateTime><\/StartDateTime>/);
  assert.match(xml, /<CommercialModelType><\/CommercialModelType>/);
  assert.match(xml, /<UseType><\/UseType>/);
  assert.match(xml, /<ISRC><\/ISRC>/);
  assert.match(xml, /<Role>Composer<\/Role>/);
  assert.match(xml, /Ada Lovelace/);
  const resource = section(xml, 'ResourceList');
  const release = section(xml, 'ReleaseList');
  assert.match(resource, /Night Drive/);
  assert.match(release, /Night Drive/);
  assert.match(resource, /Silver &amp; Harbor/);
  assert.match(release, /Silver &amp; Harbor/);
  assert.match(resource, /<TechnicalDetails>/);
  assert.match(resource, /<AudioCodecType>PCM<\/AudioCodecType>/);
  assert.match(resource, /<SamplingRate>44100<\/SamplingRate>/);
  assert.match(resource, /<BitsPerSample>16<\/BitsPerSample>/);
  assert.match(resource, /<NumberOfChannels>2<\/NumberOfChannels>/);
  assert.match(resource, /<Duration>PT3M42S<\/Duration>/);
  assert.match(resource, /<Type>FrontCoverImage<\/Type>/);
  assert.match(xml, /<HashSum>/);
  assert.match(xml, /<HashSumValue><\/HashSumValue>/);
  assert.match(xml, /PADPIDA0000000001X/);
  assert.match(xml, /PADPIDA0000000002X/);
  assert.match(xml, /<URI>Night Drive\.wav<\/URI>/);
  assert.match(xml, /<AudioCodecType>PCM<\/AudioCodecType>/);

  const fromMp3 = buildSkeletonXml(
    {
      metadata: { title: 'blue bearrrys', artist: 'A', featuring: '', composer: '', explicit: null },
      audio: {
        fileName: '3-07 Why Must I (Version).mp3',
        extension: 'mp3',
        sampleRate: 48000,
        numberOfChannels: 2,
        duration: 298,
        wavFormatCode: null,
        sniffed: 'unknown',
      },
    },
    now,
  );
  assert.match(fromMp3, /<AudioCodecType>PCM<\/AudioCodecType>/);
  assert.match(fromMp3, /<BitsPerSample>16<\/BitsPerSample>/);
  assert.match(fromMp3, /<SamplingRate>48000<\/SamplingRate>/);
  assert.match(fromMp3, /<NumberOfChannels>2<\/NumberOfChannels>/);
  assert.match(fromMp3, /<URI>blue bearrrys\.wav<\/URI>/);
  assert.match(fromMp3, /<DisplayTitleText>blue bearrrys<\/DisplayTitleText>/);
  assert.doesNotMatch(fromMp3, /Why Must I/);
  assert.match(xml, /<URI>cover\.jpg<\/URI>/);
  assert.match(xml, /<ParentalWarningType>NotExplicit<\/ParentalWarningType>/);

  const withIsrc = buildSkeletonXml(
    {
      metadata: { title: 'A', artist: 'B', featuring: '', composer: '', isrc: 'USRC17607839', explicit: null },
      audio: null,
    },
    now,
  );
  assertWellFormedXml(withIsrc);
  assert.match(withIsrc, /USRC17607839/);
  assert.match(withIsrc, /<SamplingRate><\/SamplingRate>/);
  assert.match(withIsrc, /<BitsPerSample><\/BitsPerSample>/);
  assert.match(withIsrc, /<Duration><\/Duration>/);
  assert.match(withIsrc, /<URI><\/URI>/);
  assert.match(withIsrc, /<ParentalWarningType><\/ParentalWarningType>/);

  const tricky = buildSkeletonXml(
    {
      metadata: { title: 'Rock <&>', artist: 'A & B', featuring: '', composer: '', explicit: null },
      audio: null,
    },
    now,
  );
  assertWellFormedXml(tricky);

  assert.equal(skeletonFilename('Night Drive'), 'Night Drive_DDEX_skeleton.xml');
  assert.equal(skeletonFilename('', 'track_demo2.wav'), 'track_demo2_DDEX_skeleton.xml');
  assert.equal(skeletonFilename(), 'release_DDEX_skeleton.xml');
  assert.equal(prefersInlineXmlSave('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(prefersInlineXmlSave('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), true);
  assert.equal(prefersInlineXmlSave('Mozilla/5.0 (Linux; Android 14)'), true);
  assert.equal(prefersInlineXmlSave('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0'), false);
}

function pngPayload(bytes: Uint8Array, kind: string): Uint8Array {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === kind) return bytes.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;
  }
  throw new Error(`missing ${kind}`);
}

function wavData(bytes: Uint8Array): Uint8Array {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    if (id === 'data') return bytes.slice(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error('missing data chunk');
}

async function testReleaseTags() {
  const ready = planReleaseTags(meta());
  assert.equal(ready.tags.title, 'Night Drive');
  assert.equal(ready.tags.artist, 'Silver Harbor');
  assert.equal(ready.tags.isrc, undefined);
  assert.ok(ready.omitted.some((line) => line.includes('ISRC')));

  const typed = planReleaseTags(
    meta({ title: 'beutiful birdds', artist: 'Silver Harbor', featuring: 'Guest', composer: 'Ada Lovelace', isrc: 'USRC17607839', explicit: false }),
  );
  assert.equal(typed.tags.title, 'beutiful birdds');
  assert.equal(typed.tags.featuring, 'Guest');
  assert.equal(typed.tags.explicit, 'No');
  assert.equal(releaseWavFilename('track_demo2.wav', typed.tags.title), 'beutiful birdds.wav');
  assert.equal(imageNeedsRelease('bb_art_2.jpg', { title: 'bb_art_2' }, typed.tags), true);
  assert.equal(imageNeedsRelease('beutiful birdds.jpg', typed.tags, typed.tags), false);

  const coded = planReleaseTags(meta({ isrc: 'US-RC1-76-07839' }));
  assert.equal(coded.tags.isrc, 'US-RC1-76-07839');
  assert.equal(
    tagsAlreadyMatch(
      { title: 'Night Drive', artist: 'Silver Harbor', composer: 'Ada Lovelace', isrc: 'USRC17607839', explicit: 'No' },
      coded.tags,
    ),
    true,
  );
  assert.equal(tagsAlreadyMatch({ title: 'Other' }, ready.tags), false);
  assert.equal(releaseWavFilename('night drive.wav'), 'night drive-release.wav');

  const passingAudio = audio();
  assert.equal(audioSpecsPass(audioRules(passingAudio)), true);
  assert.equal(audioSpecsPass(audioRules(audio({ bitsPerSample: 8 }))), false);

  const source = makePcmWav({ sampleRate: 44100, channels: 2, bitsPerSample: 16 });
  const first = stampWavTags(source, { title: 'Wrong', artist: 'Old' });
  const stamped = stampWavTags(first, {
    title: 'Night Drive',
    artist: 'José',
    composer: 'Ada Lovelace',
    featuring: 'Guest',
    isrc: 'USRC17607839',
    explicit: 'No',
  });
  assert.deepEqual(wavData(stamped), wavData(source));
  assert.equal(await readWavFormatCode(fileFrom(stamped, 'night.wav', 'audio/wav')), 0x0001);
  const parsed = await parseBuffer(Buffer.from(stamped), 'audio/wav');
  assert.equal(parsed.common.title, 'Night Drive');
  assert.equal(parsed.common.artist, 'José');
  assert.deepEqual(parsed.common.composer, ['Ada Lovelace']);
  assert.deepEqual(parsed.common.isrc, ['USRC17607839']);
  assert.ok(Buffer.from(stamped).includes(Buffer.from('Featuring', 'utf16le')));
  assert.ok(Buffer.from(stamped).includes(Buffer.from('Guest', 'utf16le')));

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const pngBytes = new Uint8Array(png);
  const taggedPng = stampImageTags(pngBytes, typed.tags);
  const pngTags = readImageTags(taggedPng);
  assert.equal(pngTags.title, 'beutiful birdds');
  assert.equal(pngTags.artist, 'Silver Harbor');
  assert.equal(pngTags.featuring, 'Guest');
  assert.equal(pngTags.composer, 'Ada Lovelace');
  assert.equal(pngTags.isrc, 'USRC17607839');
  assert.equal(pngTags.explicit, 'No');
  assert.deepEqual(pngPayload(taggedPng, 'IDAT'), pngPayload(pngBytes, 'IDAT'));

  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwSiiiu84T/9k=',
    'base64',
  );
  const jpegBytes = new Uint8Array(jpeg);
  const scanAt = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  const taggedJpeg = stampImageTags(jpegBytes, typed.tags);
  const jpegTags = readImageTags(taggedJpeg);
  assert.equal(jpegTags.title, 'beutiful birdds');
  assert.equal(jpegTags.artist, 'Silver Harbor');
  assert.equal(jpegTags.featuring, 'Guest');
  assert.deepEqual(taggedJpeg.subarray(taggedJpeg.length - (jpegBytes.length - scanAt)), jpegBytes.subarray(scanAt));
  const xml = buildSkeletonXml({
    metadata: meta({ isrc: 'USRC17607839' }),
    audio: null,
  });
  assert.match(xml, /Night Drive/);
  assert.match(xml, /Silver Harbor/);
  assert.match(xml, /USRC17607839/);
}

testRules();
testLoudness();
testDdex();
testWavBytes()
  .then(() => testReleaseTags())
  .then(() => {
    console.log('self-check ok');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
