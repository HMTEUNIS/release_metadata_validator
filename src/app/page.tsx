'use client';

import { useEffect, useRef, useState } from 'react';
import { FileDrop } from '../components/FileDrop';
import { MetadataForm } from '../components/MetadataForm';
import { ResultsList } from '../components/ResultsList';
import { SkeletonExport } from '../components/SkeletonExport';
import { audioDetailsArePlaceholders, buildSkeletonXml } from '../lib/ddexSkeleton';
import { downloadXml } from '../lib/downloadXml';
import { describeAudio, describeImage } from '../lib/format';
import { GUIDELINES_AS_OF } from '../lib/guidelines';
import { runStaticChecks } from '../lib/runChecks';
import type { AudioInfo, ImageInfo, OcrProgress, ReleaseMetadata, ValidationResult } from '../lib/types';
import { parseAudioFile } from '../lib/validateAudio';
import { parseImageFile } from '../lib/validateImage';
import { recognizeCover } from '../lib/validateOcr';

interface AudioState {
  file: File;
  info: AudioInfo | null;
  error: string | null;
}

interface CoverState {
  file: File;
  info: ImageInfo | null;
  error: string | null;
  previewUrl: string | null;
}

const SPIRAL = `⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⣤⣤⣤⣤⣤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⡶⠿⠋⠛⠉⠁⠀⠉⠉⠛⠿⣶⣀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣠⣾⠟⠁⠀⠀⢀⣄⣤⣤⣤⣀⠀⠀⠀⠈⠻⣧⡀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⣠⣼⠟⠀⠀⣠⣴⠟⠟⠉⠉⠈⠉⠻⣷⣄⠀⠀⠀⠹⣷⡀⠀⠀⠀⠀
⠀⠀⠀⣠⡿⠁⠀⢀⣾⠟⠁⠀⣠⣤⡶⣤⣤⣀⠈⢻⣦⠀⠀⠀⡿⡇⠀⠀⠀⠀
⠀⠀⢀⣿⠀⠀⢀⣾⠋⠀⠀⣾⠏⠀⣠⣄⠉⢻⣆⠈⣿⡄⠀⠀⢸⡧⠀⠀⠀⠀
⠀⠀⣸⡏⠀⠀⢸⡏⠀⠀⣸⡇⠀⢼⡏⠻⠂⢸⡯⠀⣸⡇⠀⠀⣸⠇⠀⠀⠀⠀
⠀⠀⢸⣇⠀⠀⢿⡇⠀⠀⠪⣷⠀⠈⠻⣷⡾⠟⠁⢠⡿⠁⠀⢰⡿⠁⠀⠀⠀⠀
⠀⠀⠀⢿⣆⠀⠈⣿⡄⠀⠀⠻⣷⣄⣀⣀⣀⣠⣴⠿⠁⠀⣴⠿⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠈⢻⣧⠀⠘⠿⣶⣄⠀⠈⠈⠛⠛⠛⠋⠀⠀⣤⡾⠋⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠋⠀⠀⠀⠈⠹⠷⣦⣤⣤⣤⣤⡴⠾⠟⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠁⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`;

const ASCII_TITLE = `#   # ##### #####  ###  ####   ###  #####  ###
## ## #       #   #   # #   # #   #   #   #   #
# # # ###     #   ##### #   # #####   #   #####
#   # #       #   #   # #   # #   #   #   #   #
#   # #####   #   #   # ####  #   #   #   #   #

#   #  ###  #     ##### ####   ###  ##### #####  ###  #   #
#   # #   # #       #   #   # #   #   #     #   #   # ##  #
#   # ##### #       #   #   # #####   #     #   #   # # # #
 # #  #   # #       #   #   # #   #   #     #   #   # #  ##
  #   #   # ##### ##### ####  #   #   #   #####  ###  #   #

####  ####   ###   ###  ####   ###  #   #
#   # #   # #   # #     #   # #   # ## ##
####  ####  #   # #  ## ####  ##### # # #
#     #  #  #   # #   # #  #  #   # #   #
#     #   #  ###   ###  #   # #   # #   #`;

const EMPTY_METADATA: ReleaseMetadata = {
  title: '',
  artist: '',
  featuring: '',
  composer: '',
  explicit: null,
};

export default function HomePage() {
  const [audio, setAudio] = useState<AudioState | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [cover, setCover] = useState<CoverState | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [metadata, setMetadata] = useState<ReleaseMetadata>(EMPTY_METADATA);
  const [running, setRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const audioToken = useRef(0);
  const coverToken = useRef(0);
  const previewRef = useRef<string | null>(null);
  const resultsRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    if (!checked) return;
    resultsRef.current?.scrollIntoView({ block: 'start' });
    resultsRef.current?.focus();
  }, [checked, results]);

  function replacePreview(next: string | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
  }

  async function onAudio(file: File) {
    const token = ++audioToken.current;
    setAudioBusy(true);
    setAudio({ file, info: null, error: null });
    try {
      const info = await parseAudioFile(file);
      if (token !== audioToken.current) return;
      setAudio({ file, info, error: null });
    } catch (error) {
      if (token !== audioToken.current) return;
      setAudio({
        file,
        info: null,
        error: error instanceof Error ? error.message : 'Could not read this audio file.',
      });
    } finally {
      if (token === audioToken.current) setAudioBusy(false);
    }
  }

  async function onCover(file: File) {
    const token = ++coverToken.current;
    const previewUrl = URL.createObjectURL(file);
    replacePreview(previewUrl);
    setCoverBusy(true);
    setCover({ file, info: null, error: null, previewUrl });
    try {
      const info = await parseImageFile(file);
      if (token !== coverToken.current) return;
      setCover({ file, info, error: null, previewUrl });
    } catch (error) {
      if (token !== coverToken.current) return;
      replacePreview(null);
      setCover({
        file,
        info: null,
        error: error instanceof Error ? error.message : 'Could not decode this image.',
        previewUrl: null,
      });
    } finally {
      if (token === coverToken.current) setCoverBusy(false);
    }
  }

  function clearAudio() {
    audioToken.current += 1;
    setAudio(null);
    setAudioBusy(false);
  }

  function clearCover() {
    coverToken.current += 1;
    replacePreview(null);
    setCover(null);
    setCoverBusy(false);
  }

  async function onCheck() {
    if (running || audioBusy || coverBusy) return;
    setRunning(true);
    setOcrProgress(null);
    setOcrText(null);
    const staticResults = runStaticChecks({
      hasAudioFile: Boolean(audio),
      audio: audio?.info ?? null,
      audioError: audio?.error ?? null,
      hasImageFile: Boolean(cover),
      image: cover?.info ?? null,
      imageError: cover?.error ?? null,
      imageFileName: cover?.file.name ?? null,
      metadata,
    });
    try {
      if (cover?.file && cover.info) {
        const outcome = await recognizeCover(cover.file, metadata, setOcrProgress);
        setOcrText(outcome.text);
        setResults([...staticResults, ...outcome.results]);
      } else {
        setResults(staticResults);
      }
      setChecked(true);
    } catch (error) {
      setResults([
        ...staticResults,
        {
          id: 'OCR-01',
          platform: 'all',
          severity: 'warning',
          message: 'Could not read text from cover art. Text consistency not checked.',
          fix: 'Use a sharper image with larger type, then run the check again.',
          details: error instanceof Error ? error.message : undefined,
        },
      ]);
      setChecked(true);
    } finally {
      setRunning(false);
      setOcrProgress(null);
    }
  }

  function onDownloadSkeleton() {
    try {
      downloadXml(buildSkeletonXml({ metadata, audio: audio?.info ?? null }));
      setExportError(null);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not build the XML file.');
    }
  }

  const hasErrors = results.some((result) => result.severity === 'error');
  const ocrFailed = results.some(
    (result) => result.id.startsWith('OCR') && result.message.startsWith('Could not read text'),
  );

  const audioStatus = audioBusy
    ? 'Reading the audio header…'
    : audio?.error
      ? audio.error
      : audio?.info
        ? `File: ${describeAudio(audio.info)}`
        : undefined;

  const coverStatus = coverBusy
    ? 'Reading the image…'
    : cover?.error
      ? cover.error
      : cover?.info
        ? `Image: ${describeImage(cover.info)}`
        : undefined;

  const progressPercent =
    ocrProgress && ocrProgress.fraction > 0 ? Math.round(ocrProgress.fraction * 100) : null;

  return (
    <main className="page">
      <header className="masthead">
        <pre className="spiral" aria-hidden="true">{SPIRAL}</pre>
        <h1>
          <span className="visually-hidden">Metadata Validation Program</span>
          <pre className="ascii" aria-hidden="true">{ASCII_TITLE}</pre>
        </h1>
        <p className="lede">Check your release before you upload.</p>
        <p className="note">
          Validate your audio, artwork and metadata before uploading to Spotify, Apple Music, or Distrokid. All checks are done in browser. Nothing is Uploaded. No this is not AI.
        </p>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onCheck();
        }}
      >
        <FileDrop
          step="1"
          title="Upload audio"
          hint="Drag a WAV, FLAC, or MP3 here, or click to browse."
          accept=".wav,.flac,.mp3,.wma,audio/*"
          inputTestId="audio-input"
          statusTestId="audio-status"
          fileName={audio?.file.name}
          status={audioStatus}
          tone={audio?.error ? 'error' : 'neutral'}
          busy={audioBusy}
          onFile={(file) => void onAudio(file)}
          onClear={audio ? clearAudio : undefined}
        />
        <FileDrop
          step="2"
          title="Upload cover art"
          hint="Drag a JPG, PNG, or TIFF here, or click to browse."
          accept=".jpg,.jpeg,.png,.tif,.tiff,image/*"
          inputTestId="cover-input"
          statusTestId="cover-status"
          fileName={cover?.file.name}
          status={coverStatus}
          tone={cover?.error ? 'error' : 'neutral'}
          busy={coverBusy}
          previewUrl={cover?.previewUrl}
          onFile={(file) => void onCover(file)}
          onClear={cover ? clearCover : undefined}
        />
        <MetadataForm value={metadata} onChange={setMetadata} />

        <button
          className="submit"
          type="submit"
          data-testid="check-release"
          disabled={running || audioBusy || coverBusy}
        >
          {running ? 'Checking…' : 'Check my release'}
        </button>
        {running ? (
          <div className="progress" role="status">
            <div className="progress-track">
              <div
                className={`progress-fill${progressPercent == null ? ' is-indeterminate' : ''}`}
                style={progressPercent == null ? undefined : { width: `${progressPercent}%` }}
              />
            </div>
            <p>
              {ocrProgress
                ? `${ocrProgress.label}${progressPercent == null ? '' : ` ${progressPercent}%`}`
                : 'Checking audio, artwork, and metadata…'}
            </p>
          </div>
        ) : (
          <p className="quiet">
            The first check loads a text-recognition library that ships with this app. Your files stay on this
            device.
          </p>
        )}
      </form>

      <div aria-live="polite">
        {checked && !running ? (
          <>
            <ResultsList results={results} ocrText={ocrText} headingRef={resultsRef} />
            <SkeletonExport
              hasErrors={hasErrors}
              audioIncomplete={audioDetailsArePlaceholders(audio?.info ?? null)}
              ocrFailed={ocrFailed}
              exportError={exportError}
              onDownload={onDownloadSkeleton}
            />
          </>
        ) : null}
      </div>

      <section className="limitations">
        <h2>What this does not check</h2>
        <ul>
          <li>Loudness (LUFS) and true peak. Your master might sound quieter or louder than intended on streaming.</li>
          <li>Clipping, or silence at the start or end of the file.</li>
          <li>Copyright, sample clearance, and AI disclosure.</li>
          <li>Apple Music artist ID matching.</li>
          <li>Whether the DDEX skeleton matches the official schema. The download is a structural example, not a delivery file.</li>
          <li>Cover art color space. Browsers cannot reliably tell whether an image is sRGB.</li>
          <li>OCR is imperfect. If it can&apos;t read text, text-consistency checks are skipped.</li>
          <li>
            The explicit yes/no choice is for your notes. Apple adds that label itself. This check only flags the
            words Explicit or Parental Advisory when they are printed on the cover.
          </li>
        </ul>
        <p>
          Rules are based on publicly available guidelines as of {GUIDELINES_AS_OF}. Platforms change rules without
          notice.
        </p>
      </section>
    </main>
  );
}
