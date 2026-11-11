'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { GUIDELINES_AS_OF } from '../lib/guidelines';
import {
  AUDIO_SPECS,
  COVER_PLATFORMS,
  COVER_SPECS,
  PLATFORM_LABEL,
  coverFileLimitMB,
  type CoverPlatform,
} from '../lib/rules/platformSpecs';

function px(value: number): string {
  return value.toLocaleString('en-US');
}

function coverSize(platform: CoverPlatform): string {
  const spec = COVER_SPECS[platform];
  if (platform === 'distrokid') {
    return `${px(spec.min)} px minimum. 3,000 px recommended. Up to ${px(spec.max)} px.`;
  }
  return `${px(spec.min)}–${px(spec.max)} px`;
}

function coverFormat(platform: CoverPlatform): string {
  const names = COVER_SPECS[platform].formats.map((format) => (format === 'jpeg' ? 'JPG' : format.toUpperCase()));
  return [...new Set(names)].join(', ');
}

function coverBytes(platform: CoverPlatform): string {
  const limit = coverFileLimitMB(platform);
  return limit == null ? 'Not checked here' : `Under ${limit} MB`;
}

function bitDepth(platform: CoverPlatform): string {
  return AUDIO_SPECS[platform].bitDepths.map((depth) => `${depth}-bit`).join(' or ');
}

const ROWS: { topic: string; cells: Record<CoverPlatform, string> }[] = [
  {
    topic: 'Cover size',
    cells: {
      spotify: coverSize('spotify'),
      apple: coverSize('apple'),
      distrokid: coverSize('distrokid'),
      tunecore: coverSize('tunecore'),
      cdbaby: coverSize('cdbaby'),
    },
  },
  {
    topic: 'Cover format',
    cells: {
      spotify: coverFormat('spotify'),
      apple: coverFormat('apple'),
      distrokid: coverFormat('distrokid'),
      tunecore: coverFormat('tunecore'),
      cdbaby: coverFormat('cdbaby'),
    },
  },
  {
    topic: 'Cover file size',
    cells: {
      spotify: coverBytes('spotify'),
      apple: coverBytes('apple'),
      distrokid: coverBytes('distrokid'),
      tunecore: coverBytes('tunecore'),
      cdbaby: coverBytes('cdbaby'),
    },
  },
  {
    topic: 'Audio',
    cells: {
      spotify: `WAV, FLAC, or MP3. 44.1 kHz or higher. ${bitDepth('spotify')}. Stereo. A WAV must be standard PCM.`,
      apple: 'WAV, FLAC, or MP3. Stereo.',
      distrokid: '16-bit stereo WAV is the documented standard.',
      tunecore: `44.1 kHz, ${bitDepth('tunecore')}, stereo WAV or FLAC.`,
      cdbaby: `44.1 kHz, ${bitDepth('cdbaby')}, stereo WAV or FLAC.`,
    },
  },
  {
    topic: 'Loudness',
    cells: {
      spotify: 'About -14 LUFS. A master from -16 to -8 passes.',
      apple: 'About -16 LUFS. A master from -18 to -10 passes.',
      distrokid: 'Not checked for DistroKid.',
      tunecore: 'Not checked for TuneCore.',
      cdbaby: 'Not checked for CD Baby.',
    },
  },
  {
    topic: 'Cover text',
    cells: {
      spotify: 'No URL, social handle, or price.',
      apple: 'No Explicit or Parental Advisory printed on the art.',
      distrokid: 'Not checked for DistroKid.',
      tunecore:
        "This checks that the words match; it doesn't check order or punctuation. No “new”, “latest”, “exclusive”, or “limited edition”.",
      cdbaby:
        "This checks that the words match; it doesn't check order or punctuation. No “new”, “latest”, “exclusive”, or “limited edition”.",
    },
  },
  {
    topic: 'Names',
    cells: {
      spotify: 'Title and artist are required. Keep version tags and featuring credits out of those fields.',
      apple: 'Title and artist are required. All-caps titles are discouraged.',
      distrokid: 'Title and artist are required.',
      tunecore: 'Title and artist are required.',
      cdbaby: 'Title and artist are required. The file name may use letters, numbers, hyphens, and underscores.',
    },
  },
];

export function RulesChart() {
  const [open, setOpen] = useState(false);
  const launchRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      launchRef.current?.focus();
    };
  }, [open]);

  return (
    <section className="section rules-launch">
      <h2>Understand the rules</h2>
      <p>A chart of what Spotify, Apple Music, DistroKid, TuneCore, and CD Baby ask for.</p>
      <button
        ref={launchRef}
        type="button"
        className="rules-open"
        data-testid="rules-open"
        onClick={() => setOpen(true)}
      >
        Open the rules chart
      </button>
      {open ? (
        <div
          className="console-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="rules-window"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="rules-chart"
          >
            <div className="rules-toolbar">
              <h2 id={titleId}>What each platform needs</h2>
              <button ref={closeRef} type="button" className="rules-close" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="rules-scroll">
              <table className="rules-chart">
                <caption>Cover art must be square for every platform here.</caption>
                <thead>
                  <tr>
                    <th scope="col">Rule</th>
                    {COVER_PLATFORMS.map((platform) => (
                      <th scope="col" key={platform}>
                        {PLATFORM_LABEL[platform]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.topic}>
                      <th scope="row">{row.topic}</th>
                      {COVER_PLATFORMS.map((platform) => (
                        <td key={platform}>{row.cells[platform]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rules-note">
              Every platform also flags clipping, and silence longer than 3 seconds at the start or end. This chart
              matches the checks in this program, based on public guidelines as of {GUIDELINES_AS_OF}. Color space and
              DPI are not included.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
