import { jsonToDdex, type DdexMessage4 } from 'ddex-json-codec';
import type { AudioInfo, ContainerKind, ReleaseMetadata } from './types';

export const ISRC_PLACEHOLDER = 'ISRC-PLACEHOLDER';
export const UPC_PLACEHOLDER = '0000000000000';
const TITLE_PLACEHOLDER = 'TITLE-PLACEHOLDER';
const ARTIST_PLACEHOLDER = 'ARTIST-PLACEHOLDER';

export interface SkeletonSource {
  metadata: ReleaseMetadata;
  audio: AudioInfo | null;
}

export function isoDuration(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return 'PT0M0S';
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
  return 'UserDefined';
}

function technicalXml(audio: AudioInfo | null): string {
  const sampleRate = positive(audio?.sampleRate) ? String(Math.round(audio!.sampleRate!)) : 'PLACEHOLDER';
  const bits = positive(audio?.bitsPerSample) ? String(Math.round(audio!.bitsPerSample!)) : 'PLACEHOLDER';
  const channels = positive(audio?.numberOfChannels) ? String(Math.round(audio!.numberOfChannels!)) : 'PLACEHOLDER';
  const fileName = escapeXml(audio?.fileName?.trim() || 'track.wav');
  return [
    '<TechnicalSoundRecordingDetails>',
    `<AudioCodecType>${codecFor(audio?.sniffed)}</AudioCodecType>`,
    `<SamplingRate>${sampleRate}</SamplingRate>`,
    `<BitsPerSample>${bits}</BitsPerSample>`,
    `<NumberOfChannels>${channels}</NumberOfChannels>`,
    `<File><FileName>${fileName}</FileName></File>`,
    '</TechnicalSoundRecordingDetails>',
  ].join('');
}

/**
 * ddex-json-codec 0.4 writes ERN 4 sound recordings without technical details.
 * The skeleton still needs sample rate, bit depth, channels, and a file name.
 */
function insertTechnicalDetails(xml: string, audio: AudioInfo | null): string {
  const marker = '</SoundRecording>';
  const index = xml.indexOf(marker);
  if (index < 0) return xml;
  return `${xml.slice(0, index)}${technicalXml(audio)}${xml.slice(index)}`;
}

function insertArtistName(xml: string, artist: string): string {
  const name = `<PartyName><FullName>${escapeXml(artist)}</FullName></PartyName>`;
  const needle = '<ArtistPartyReference>P1</ArtistPartyReference>';
  return xml.split(needle).join(`${needle}${name}`);
}

function insertSchemaVersion(xml: string): string {
  if (xml.includes('MessageSchemaVersionId=')) return xml;
  return xml.replace('<ern:NewReleaseMessage ', '<ern:NewReleaseMessage MessageSchemaVersionId="ern/43" ');
}

export function buildSkeletonMessage(source: SkeletonSource, now = new Date()): DdexMessage4 {
  const title = source.metadata.title.trim() || TITLE_PLACEHOLDER;
  const artist = source.metadata.artist.trim() || ARTIST_PLACEHOLDER;
  const isrc = source.metadata.isrc?.trim() || ISRC_PLACEHOLDER;
  const displayArtist = {
    artist: {
      name: artist,
      partyReference: 'P1',
      roles: [{ role: 'MainArtist' }],
    },
  };

  return {
    ernVersion: '4.3',
    messageHeader: {
      messageId: `SKELETON-${now.getTime()}`,
      messageCreatedDateTime: now.toISOString(),
      messageSender: {
        partyId: 'PADPIDA0000000001X',
        partyIdIsDpid: true,
        fullName: 'Skeleton Export',
      },
      messageRecipient: {
        partyId: 'PADPIDA0000000002X',
        partyIdIsDpid: true,
        fullName: 'Recipient (placeholder)',
      },
    },
    partyList: [
      {
        partyReference: 'P1',
        partyName: [{ fullName: artist }],
      },
    ],
    resourceList: [
      {
        resourceReference: 'A1',
        type: 'MusicalWorkSoundRecording',
        soundRecordingId: { isrc },
        displayTitleText: title,
        displayTitles: [{ titleText: title, isDefault: true }],
        displayArtists: [displayArtist],
        duration: isoDuration(source.audio?.duration),
      },
    ],
    releaseList: [
      {
        releaseReference: 'R1',
        releaseType: 'Track',
        releaseId: { icpn: UPC_PLACEHOLDER, isrc },
        displayTitleText: title,
        displayTitles: [{ titleText: title, isDefault: true }],
        displayArtists: [displayArtist],
        resourceGroup: {
          sequenceNumber: 1,
          resourceGroupContentItems: [
            {
              sequenceNumber: 1,
              resourceType: 'SoundRecording',
              releaseResourceReference: { value: 'A1', releaseResourceType: 'PrimaryResource' },
            },
          ],
        },
      },
    ],
    dealList: [
      {
        dealReleaseReferences: ['R1'],
        deals: [
          {
            dealTerms: {
              commercialModelType: 'PayAsYouGoModel',
              useTypes: ['OnDemandStream'],
              validityPeriod: { startDate: now.toISOString().slice(0, 10) },
              territoryCode: ['Worldwide'],
            },
          },
        ],
      },
    ],
  };
}

export function buildSkeletonXml(source: SkeletonSource, now = new Date()): string {
  const artist = source.metadata.artist.trim() || ARTIST_PLACEHOLDER;
  const xml = jsonToDdex(buildSkeletonMessage(source, now));
  return insertSchemaVersion(insertArtistName(insertTechnicalDetails(xml, source.audio), artist));
}
