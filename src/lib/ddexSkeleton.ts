import { planReleaseTags, releaseWavFilename } from './releaseTags';
import { actualKind } from './rules/audioRules';
import type { AudioInfo, ContainerKind, ReleaseMetadata } from './types';

const SENDER_DPID = 'PADPIDA0000000001X';
const RECIPIENT_DPID = 'PADPIDA0000000002X';

export interface SkeletonSource {
  metadata: ReleaseMetadata;
  audio: AudioInfo | null;
  imageFileName?: string | null;
}

export function isoDuration(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `PT${hours}H${minutes}M${secs}S`;
  return `PT${minutes}M${secs}S`;
}

export function audioDetailsArePlaceholders(audio: AudioInfo | null): boolean {
  if (!audio) return true;
  return !positive(audio.sampleRate) || !positive(audio.bitsPerSample) || !positive(audio.numberOfChannels) || audio.duration == null;
}

function positive(value: number | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function codecFor(kind: ContainerKind | undefined): string {
  if (kind === 'wav') return 'PCM';
  if (kind === 'flac') return 'FLAC';
  if (kind === 'mp3') return 'MP3';
  if (kind === 'wma') return 'WMA';
  return '';
}

function warningType(explicit: boolean | null): string {
  if (explicit === true) return 'Explicit';
  if (explicit === false) return 'NotExplicit';
  return '';
}

function createdAt(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function el(name: string, value: string, depth: number): string {
  return `${'  '.repeat(depth)}<${name}>${value ? escapeXml(value) : ''}</${name}>`;
}

function party(reference: string, name: string): string[] {
  return [
    '    <Party>',
    `      <PartyReference>${reference}</PartyReference>`,
    '      <PartyName>',
    el('FullName', name, 4),
    '      </PartyName>',
    '    </Party>',
  ];
}

function displayTitle(title: string, depth: number): string[] {
  const pad = '  '.repeat(depth);
  return [el('DisplayTitleText', title, depth), `${pad}<DisplayTitle>`, el('TitleText', title, depth + 1), `${pad}</DisplayTitle>`];
}

function artistBlocks(artist: string, depth: number): string[] {
  const pad = '  '.repeat(depth);
  return [
    el('DisplayArtistName', artist, depth),
    `${pad}<DisplayArtist>`,
    `${pad}  <ArtistPartyReference>P1</ArtistPartyReference>`,
    `${pad}  <DisplayArtistRole>MainArtist</DisplayArtistRole>`,
    `${pad}</DisplayArtist>`,
    `${pad}<DisplayArtist>`,
    `${pad}  <ArtistPartyReference>P3</ArtistPartyReference>`,
    `${pad}  <DisplayArtistRole>FeaturedArtist</DisplayArtistRole>`,
    `${pad}</DisplayArtist>`,
  ];
}

function fileBlock(fileName: string, depth: number): string[] {
  const pad = '  '.repeat(depth);
  return [
    `${pad}<File>`,
    el('URI', fileName, depth + 1),
    `${pad}  <HashSum>`,
    el('Algorithm', '', depth + 2),
    el('HashSumValue', '', depth + 2),
    `${pad}  </HashSum>`,
    `${pad}</File>`,
  ];
}

function deliveryKind(audio: AudioInfo): ContainerKind {
  const kind = actualKind(audio);
  if (kind !== 'unknown') return kind;
  if (audio.extension === 'mp3' || audio.extension === 'flac' || audio.extension === 'wav' || audio.extension === 'wma') {
    return audio.extension;
  }
  return 'unknown';
}

function deliveredBits(kind: ContainerKind, bits: number | undefined): string {
  if (kind === 'mp3' || kind === 'flac') {
    if (kind === 'flac' && bits === 24) return '24';
    if (kind === 'flac' && bits === 32) return '32';
    return '16';
  }
  return positive(bits) ? String(Math.round(bits ?? 0)) : '';
}

function deliveredWav(audio: AudioInfo, title: string): { codec: string; bits: string; uri: string } | null {
  const kind = deliveryKind(audio);
  if (kind !== 'mp3' && kind !== 'flac' && kind !== 'wav') return null;
  return { codec: 'PCM', bits: deliveredBits(kind, audio.bitsPerSample), uri: releaseWavFilename(audio.fileName, title) };
}

function deliveryFile(audio: AudioInfo | null, title: string): string[] {
  const delivered = audio ? deliveredWav(audio, title) : null;
  return [
    '          <DeliveryFile>',
    '            <Type>AudioFile</Type>',
    el('AudioCodecType', delivered?.codec ?? codecFor(audio ? deliveryKind(audio) : undefined), 6),
    el('NumberOfChannels', positive(audio?.numberOfChannels) ? String(Math.round(audio!.numberOfChannels!)) : '', 6),
    el('SamplingRate', positive(audio?.sampleRate) ? String(Math.round(audio!.sampleRate!)) : '', 6),
    el('BitsPerSample', delivered?.bits ?? (positive(audio?.bitsPerSample) ? String(Math.round(audio!.bitsPerSample!)) : ''), 6),
    ...fileBlock(delivered?.uri ?? audio?.fileName?.trim() ?? '', 6),
    '          </DeliveryFile>',
  ];
}

function soundRecording(title: string, artist: string, isrc: string, audio: AudioInfo | null, explicit: boolean | null): string[] {
  return [
    '    <SoundRecording>',
    '      <ResourceReference>A1</ResourceReference>',
    '      <Type>MusicalWorkSoundRecording</Type>',
    '      <SoundRecordingEdition>',
    '        <ResourceId>',
    el('ISRC', isrc, 5),
    '        </ResourceId>',
    '        <TechnicalDetails>',
    '          <TechnicalResourceDetailsReference>T1</TechnicalResourceDetailsReference>',
    ...deliveryFile(audio, title),
    '        </TechnicalDetails>',
    '      </SoundRecordingEdition>',
    ...displayTitle(title, 3),
    ...artistBlocks(artist, 3),
    '      <Contributor>',
    '        <ContributorPartyReference>P4</ContributorPartyReference>',
    '        <Role>Composer</Role>',
    '      </Contributor>',
    el('Duration', isoDuration(audio?.duration), 3),
    el('ParentalWarningType', warningType(explicit), 3),
    '    </SoundRecording>',
  ];
}

function imageResource(fileName: string): string[] {
  return [
    '    <Image>',
    '      <ResourceReference>A2</ResourceReference>',
    '      <Type>FrontCoverImage</Type>',
    '      <ResourceId>',
    `        <ProprietaryId Namespace="${SENDER_DPID}">cover-001</ProprietaryId>`,
    '      </ResourceId>',
    '      <TechnicalDetails>',
    '        <TechnicalResourceDetailsReference>T2</TechnicalResourceDetailsReference>',
    ...fileBlock(fileName, 4),
    '      </TechnicalDetails>',
    '    </Image>',
  ];
}

function releaseId(depth: number): string[] {
  const pad = '  '.repeat(depth);
  return [`${pad}<ReleaseId>`, el('GRid', '', depth + 1), el('ICPN', '', depth + 1), `${pad}</ReleaseId>`];
}

function genre(depth: number): string[] {
  const pad = '  '.repeat(depth);
  return [`${pad}<Genre>`, el('GenreText', '', depth + 1), `${pad}</Genre>`];
}

function resourceGroup(): string[] {
  return [
    '      <ResourceGroup>',
    '        <ResourceGroupContentItem>',
    '          <SequenceNumber>1</SequenceNumber>',
    '          <ReleaseResourceReference>A1</ReleaseResourceReference>',
    '        </ResourceGroupContentItem>',
    '        <LinkedReleaseResourceReference LinkDescription="CoverArt">A2</LinkedReleaseResourceReference>',
    '      </ResourceGroup>',
  ];
}

function release(title: string, artist: string, explicit: boolean | null): string[] {
  return [
    '    <Release>',
    '      <ReleaseReference>R0</ReleaseReference>',
    '      <ReleaseType>Single</ReleaseType>',
    ...releaseId(3),
    ...displayTitle(title, 3),
    ...artistBlocks(artist, 3),
    '      <ReleaseLabelReference>P2</ReleaseLabelReference>',
    ...genre(3),
    el('ParentalWarningType', warningType(explicit), 3),
    ...resourceGroup(),
    '    </Release>',
  ];
}

function trackRelease(title: string): string[] {
  return [
    '    <TrackRelease>',
    '      <ReleaseReference>R1</ReleaseReference>',
    ...releaseId(3),
    ...displayTitle(title, 3),
    '      <ReleaseResourceReference>A1</ReleaseResourceReference>',
    '      <ReleaseLabelReference>P2</ReleaseLabelReference>',
    ...genre(3),
    '    </TrackRelease>',
  ];
}

function dealList(): string[] {
  return [
    '  <DealList>',
    '    <ReleaseDeal>',
    '      <DealReleaseReference>R0</DealReleaseReference>',
    '      <DealReleaseReference>R1</DealReleaseReference>',
    '      <Deal>',
    '        <DealTerms>',
    el('TerritoryCode', '', 5),
    '          <ValidityPeriod>',
    el('StartDateTime', '', 6),
    '          </ValidityPeriod>',
    el('CommercialModelType', '', 5),
    el('UseType', '', 5),
    '        </DealTerms>',
    '      </Deal>',
    '    </ReleaseDeal>',
    '  </DealList>',
  ];
}

export function buildSkeletonXml(source: SkeletonSource, now = new Date()): string {
  const tags = planReleaseTags(source.metadata).tags;
  const title = tags.title ?? '';
  const artist = tags.artist ?? '';
  const featuring = tags.featuring ?? '';
  const composer = tags.composer ?? '';
  const isrc = tags.isrc ?? '';
  const imageName = source.imageFileName?.trim() ?? '';
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ern:NewReleaseMessage',
    '    xmlns:ern="http://ddex.net/xml/ern/43"',
    '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '    xsi:schemaLocation="http://ddex.net/xml/ern/43 http://ddex.net/xml/ern/43/release-notification.xsd"',
    '    LanguageAndScriptCode="en"',
    '    ReleaseProfileVersionId="SimpleAudioSingle"',
    '    AvsVersionId="12">',
    '  <MessageHeader>',
    `    <MessageId>SKELETON-${now.getTime()}</MessageId>`,
    '    <MessageSender>',
    `      <PartyId>${SENDER_DPID}</PartyId>`,
    '      <PartyName>',
    '        <FullName>Skeleton Export</FullName>',
    '      </PartyName>',
    '    </MessageSender>',
    '    <MessageRecipient>',
    `      <PartyId>${RECIPIENT_DPID}</PartyId>`,
    '      <PartyName>',
    '        <FullName>Recipient (placeholder)</FullName>',
    '      </PartyName>',
    '    </MessageRecipient>',
    `    <MessageCreatedDateTime>${createdAt(now)}</MessageCreatedDateTime>`,
    '  </MessageHeader>',
    '  <PartyList>',
    ...party('P1', artist),
    ...party('P2', ''),
    ...party('P3', featuring),
    ...party('P4', composer),
    '  </PartyList>',
    '  <ResourceList>',
    ...soundRecording(title, artist, isrc, source.audio, source.metadata.explicit),
    ...imageResource(imageName),
    '  </ResourceList>',
    '  <ReleaseList>',
    ...release(title, artist, source.metadata.explicit),
    ...trackRelease(title),
    '  </ReleaseList>',
    ...dealList(),
    '</ern:NewReleaseMessage>',
  ];
  return lines.join('\n');
}
