'use client';

import { useEffect, useState } from 'react';
import { downloadBlob } from '../lib/downloadXml';
import { fileStem, hasReleaseTags, releaseWavFilename, tagSignature, type TagPlan } from '../lib/releaseTags';
import { writeReleaseWav } from '../lib/wavTags';
import { ReleaseTagNote } from './ReleaseTagNote';

export function WriteReleaseMetadata({
  file,
  plan,
  embeddedTitle,
}: {
  file: File;
  plan: TagPlan;
  embeddedTitle?: string;
}) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filename = releaseWavFilename(file.name, plan.tags.title);
  const signature = tagSignature(plan.tags);

  useEffect(() => {
    setPhase('idle');
    setBlob(null);
    setError(null);
  }, [file, signature]);

  async function onWrite() {
    setError(null);
    setBlob(null);
    setPhase('running');
    try {
      const next = await writeReleaseWav(file, plan.tags);
      setBlob(next);
      setPhase('done');
    } catch (caught) {
      setPhase('error');
      setError(caught instanceof Error ? caught.message : 'The metadata export failed.');
    }
  }

  return (
    <section className="section loudness-fix" data-testid="write-release-metadata">
      <h2>Correct the audio metadata</h2>
      <p>
        {embeddedTitle
          ? `This file's metadata title is ${embeddedTitle}. The form title is ${plan.tags.title ?? 'blank'}.`
          : `This file is named ${fileStem(file.name)} and its metadata does not match the form.`}{' '}
        This copies the sound unchanged and writes the form fields into a new WAV.
      </p>
      <ReleaseTagNote plan={plan} />
      <p className="loudness-offer">Listen to the file and see if you like it.</p>
      {phase === 'running' ? (
        <p role="status">Writing metadata…</p>
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
        hasReleaseTags(plan.tags) ? (
          <button type="button" className="fix-button" data-testid="write-release-metadata-button" onClick={() => void onWrite()}>
            Export WAV with release metadata
          </button>
        ) : null
      ) : null}
    </section>
  );
}
