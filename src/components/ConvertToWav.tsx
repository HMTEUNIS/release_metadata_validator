'use client';

import { useEffect, useState } from 'react';
import { downloadBlob } from '../lib/downloadXml';
import { canUseLoudnessFix, convertToWav, ISOLATION_MESSAGE, pcmCodec } from '../lib/fixLoudness';
import { releaseWavFilename, tagSignature, type TagPlan } from '../lib/releaseTags';
import { ReleaseTagNote } from './ReleaseTagNote';

export function ConvertToWav({
  file,
  kind,
  bitsPerSample,
  plan,
}: {
  file: File;
  kind: 'mp3' | 'flac';
  bitsPerSample?: number;
  plan: TagPlan;
}) {
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'running' | 'done' | 'error'>('idle');
  const [ratio, setRatio] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filename = releaseWavFilename(file.name, plan.tags.title);
  const isolated = canUseLoudnessFix();
  const percent = Math.round(ratio * 100);
  const signature = tagSignature(plan.tags);
  const codec = kind === 'mp3' ? 'pcm_s16le' : pcmCodec(bitsPerSample);
  const reason =
    kind === 'mp3'
      ? 'Distributors that take a master, including DistroKid’s documented standard, want a WAV. An MP3 is compressed. Making a WAV does not restore what the MP3 threw away. It gives you a 16-bit WAV you can hand over.'
      : `Distributors that take a master, including DistroKid’s documented standard, want a WAV. FLAC is lossless, so this keeps the audio and puts it in a ${codec === 'pcm_s16le' ? '16-bit' : codec === 'pcm_s24le' ? '24-bit' : '32-bit'} WAV.`;

  useEffect(() => {
    setPhase('idle');
    setRatio(0);
    setBlob(null);
    setError(null);
  }, [file, kind, bitsPerSample, signature]);

  async function onConvert() {
    setError(null);
    setBlob(null);
    setRatio(0);
    setPhase('preparing');
    try {
      const bits = kind === 'mp3' ? 16 : bitsPerSample;
      const next = await convertToWav(file, bits, (update) => {
        if (update.phase === 'preparing') {
          setPhase('preparing');
          return;
        }
        setPhase('running');
        setRatio(update.ratio);
      }, plan.tags);
      setBlob(next);
      setPhase('done');
    } catch (caught) {
      setPhase('error');
      setError(caught instanceof Error ? caught.message : ISOLATION_MESSAGE);
    }
  }

  return (
    <section className="section loudness-fix" data-testid="convert-wav">
      <h2>Make a WAV</h2>
      <p>{reason}</p>
      <ReleaseTagNote plan={plan} />
      <p className="loudness-offer">Listen to the file and see if you like it.</p>
      {phase === 'preparing' ? (
        <div className="progress" role="status">
          <div className="progress-track">
            <div className="progress-fill is-indeterminate" />
          </div>
          <p>Preparing…</p>
        </div>
      ) : null}
      {phase === 'running' ? (
        <div className="progress" role="status">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p>Converting… {percent}%</p>
        </div>
      ) : null}
      {phase === 'done' && blob ? (
        <div className="loudness-ready">
          <p>WAV file is ready.</p>
          <button type="button" className="fix-button" onClick={() => downloadBlob(blob, filename)}>
            Download {filename}
          </button>
        </div>
      ) : null}
      {phase === 'error' && error ? <p className="status is-error">{error}</p> : null}
      {phase === 'idle' || phase === 'error' ? (
        isolated ? (
          <button type="button" className="fix-button" data-testid="convert-wav-button" onClick={() => void onConvert()}>
            Convert to WAV
          </button>
        ) : (
          <p className="status is-error">{ISOLATION_MESSAGE}</p>
        )
      ) : null}
    </section>
  );
}
