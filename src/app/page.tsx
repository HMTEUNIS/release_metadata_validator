'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckConsole } from '../components/CheckConsole';
import { FitArt } from '../components/FitArt';
import { FileDrop } from '../components/FileDrop';
import { MetadataForm } from '../components/MetadataForm';
import { ResultsList } from '../components/ResultsList';
import { RulesChart } from '../components/RulesChart';
import { SkeletonExport } from '../components/SkeletonExport';
import { ConvertToWav } from '../components/ConvertToWav';
import { FitCoverDownloads } from '../components/FitCoverDownloads';
import { WriteReleaseArt } from '../components/WriteReleaseArt';
import { WriteReleaseMetadata } from '../components/WriteReleaseMetadata';
import { imageNeedsRelease, planReleaseTags, tagsAlreadyMatch } from '../lib/releaseTags';
import { actualKind } from '../lib/rules/audioRules';
import { analyzeAudioFile } from '../lib/analyzeAudioFile';
import { audioDetailsArePlaceholders, buildSkeletonXml } from '../lib/ddexSkeleton';
import { downloadXml } from '../lib/downloadXml';
import { describeAudio, describeImage } from '../lib/format';
import { GUIDELINES_AS_OF } from '../lib/guidelines';
import { runStaticChecks } from '../lib/runChecks';
import type { AudioInfo, ImageInfo, ReleaseMetadata, ValidationResult } from '../lib/types';
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
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [consoleFraction, setConsoleFraction] = useState(0);
  const consoleCeiling = useRef(0);
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

  useEffect(() => {
    if (!running) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    const timer = window.setInterval(() => {
      setConsoleFraction((current) => Math.min(consoleCeiling.current, current + 0.015));
    }, 160);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('beforeunload', warn);
      window.clearInterval(timer);
    };
  }, [running]);

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

  function pushConsole(line: string) {
    setConsoleLines((current) => [...current, line]);
  }

  function paintConsole() {
    return new Promise((resolve) => window.setTimeout(resolve, 60));
  }

  async function onCheck() {
    if (running || audioBusy || coverBusy) return;
    setRunning(true);
    setOcrText(null);
    setConsoleLines(['Starting the check.']);
    setConsoleFraction(0.04);
    consoleCeiling.current = audio?.file ? 0.42 : 0.12;
    if (audio?.file) pushConsole('Measuring loudness, clipping, and silence…');
    await paintConsole();
    const measured = audio?.file ? await analyzeAudioFile(audio.file, audio.info?.sampleRate) : [];
    if (audio?.file) pushConsole('Loudness, clipping, and silence measured.');
    else pushConsole('No audio file. Skipping loudness.');
    setConsoleFraction(0.46);
    consoleCeiling.current = 0.5;
    pushConsole('Checking audio, artwork, and metadata…');
    const staticResults = [
      ...runStaticChecks({
        hasAudioFile: Boolean(audio),
        audio: audio?.info ?? null,
        audioError: audio?.error ?? null,
        hasImageFile: Boolean(cover),
        image: cover?.info ?? null,
        imageError: cover?.error ?? null,
        imageFileName: cover?.file.name ?? null,
        imageBytes: cover?.file.size ?? null,
        metadata,
      }),
      ...measured,
    ];
    pushConsole('Platform rules finished.');
    setConsoleFraction(0.58);
    consoleCeiling.current = 0.62;
    await paintConsole();
    try {
      if (cover?.file && cover.info) {
        pushConsole('Reading cover text…');
        consoleCeiling.current = 0.96;
        let lastLabel = '';
        const outcome = await recognizeCover(cover.file, metadata, (progress) => {
          const next = 0.58 + Math.min(1, Math.max(0, progress.fraction)) * 0.36;
          consoleCeiling.current = Math.max(0.62, next);
          setConsoleFraction((current) => Math.max(current, next));
          if (progress.label && progress.label !== lastLabel) {
            lastLabel = progress.label;
            pushConsole(progress.label);
          }
        });
        setOcrText(outcome.text);
        setResults([...staticResults, ...outcome.results]);
        pushConsole(outcome.text ? 'Cover text read.' : 'Cover text could not be read.');
      } else {
        pushConsole('No cover art. Skipping text recognition.');
        setResults(staticResults);
      }
      setConsoleFraction(1);
      consoleCeiling.current = 1;
      pushConsole('Checks finished.');
      await paintConsole();
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
      pushConsole('Cover text could not be read.');
      setConsoleFraction(1);
      consoleCeiling.current = 1;
      setChecked(true);
    } finally {
      setRunning(false);
    }
  }

  function onDownloadSkeleton() {
    try {
      downloadXml(buildSkeletonXml({ metadata, audio: audio?.info ?? null, imageFileName: cover?.file.name ?? null }));
      setExportError(null);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not build the XML file.');
    }
  }

  const hasErrors = results.some((result) => result.severity === 'error');
  const sourceKind = audio?.info
    ? actualKind(audio.info)
    : audio?.file.name.toLowerCase().endsWith('.flac')
      ? 'flac'
      : audio?.file.name.toLowerCase().endsWith('.mp3')
        ? 'mp3'
        : null;
  const convertKind = sourceKind === 'mp3' || sourceKind === 'flac' ? sourceKind : null;
  const tagPlan = planReleaseTags(metadata);
  const writeMetadata =
    Boolean(audio?.file) && sourceKind === 'wav' && !tagsAlreadyMatch(audio?.info?.tags, tagPlan.tags);
  const writeArt = cover?.file ? imageNeedsRelease(cover.file.name, cover.info?.tags, tagPlan.tags) : false;
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

  return (
    <main className="page">
        <header className="masthead">
        <FitArt text={SPIRAL} className="spiral" />
        <h1>
          <span className="visually-hidden">Metadata Validation Program</span>
          <FitArt text={ASCII_TITLE} className="ascii" />
        </h1>
        <p className="lede">Check your release before you upload.</p>
        <p className="note">
          Validate your audio, artwork and metadata before uploading to Spotify, Apple Music, DistroKid, TuneCore, or CD Baby. All checks are done in browser. Nothing is Uploaded. No this is not AI.
        </p>
      </header>

      <section className="section capabilities">
        <h2>What you can do</h2>
        <ul>
          <li>Check audio, cover art, and the form against Spotify, Apple Music, DistroKid, TuneCore, and CD Baby.</li>
          <li>Measure loudness, clipping, and silence. Download a WAV fixed for Spotify or Apple Music.</li>
          <li>Turn an MP3 or FLAC into a WAV. An MP3 conversion does not restore the audio the MP3 discarded.</li>
          <li>Download audio and cover art whose metadata matches the form. The original files stay as they are.</li>
          <li>Download a square JPEG sized for each platform. A wide or tall image is cropped from the center.</li>
          <li>
            Download an ERN 4.3 XML base file. Known values are filled in. Empty elements are left blank for you to
            complete.
          </li>
        </ul>
      </section>

      <RulesChart />

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
          {running ? 'Checking…' : 'Check My Release'}
        </button>
        <p className="quiet">
          The first check loads a text-recognition library that ships with this app. Your files stay on this device.
        </p>
        {running ? <CheckConsole lines={consoleLines} fraction={consoleFraction} /> : null}
      </form>

      <div aria-live="polite">
        {checked && !running ? (
          <>
            <ResultsList
              results={results}
              ocrText={ocrText}
              headingRef={resultsRef}
              audioFile={audio?.file}
              plan={tagPlan}
            />
            {audio?.file && convertKind ? (
              <ConvertToWav
                file={audio.file}
                kind={convertKind}
                bitsPerSample={audio.info?.bitsPerSample}
                plan={tagPlan}
              />
            ) : null}
            {audio?.file && writeMetadata ? (
              <WriteReleaseMetadata file={audio.file} plan={tagPlan} embeddedTitle={audio.info?.tags?.title} />
            ) : null}
            {cover?.file && writeArt ? <WriteReleaseArt file={cover.file} plan={tagPlan} /> : null}
            {cover?.file && cover.info ? (
              <FitCoverDownloads file={cover.file} width={cover.info.width} height={cover.info.height} plan={tagPlan} />
            ) : null}
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
          <li>Copyright, sample clearance, and AI disclosure.</li>
          <li>Apple Music artist ID matching.</li>
          <li>
            Whether a distributor will accept the XML. It is a base file. Empty elements for the UPC, label, genre,
            deal, and file hash are left for you to fill. Workbench may reject those blanks.
          </li>
          <li>Cover art color space and DPI. Browsers cannot reliably tell whether an image is sRGB or CMYK, or read TuneCore&apos;s 72 dpi minimum.</li>
          <li>TuneCore and CD Baby have stricter cover art size ranges than Spotify. An image that passes Spotify may fail TuneCore.</li>
          <li>Enlarging a small cover does not add detail. Look at the fitted JPEG and see if you like it.</li>
          <li>CD Baby&apos;s file name rule is checked here. The upload to CD Baby is still done by your distributor.</li>
          <li>Text matching on cover art is best-effort. TuneCore and CD Baby require an exact match. Mismatches are warnings for you to review.</li>
          <li>OCR is imperfect. If it can&apos;t read text, text-consistency checks are skipped.</li>
          <li>Silence detection uses a threshold of -60 dBFS. Very quiet passages may be flagged as silence.</li>
          <li>A loudness fix changes level. It does not restore dynamics that were limited away.</li>
          <li>
            The explicit yes/no choice is written into corrected files and the XML. This check flags the words Explicit
            or Parental Advisory when they are printed on the cover. Apple adds that label itself.
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
