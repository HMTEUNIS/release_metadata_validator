'use client';

import { useEffect, useState } from 'react';
import { downloadBlob } from '../lib/downloadXml';
import { writeReleaseImage } from '../lib/imageTags';
import { extensionOf } from '../lib/format';
import { fileStem, hasReleaseTags, releaseDownloadName, tagSignature, type TagPlan } from '../lib/releaseTags';
import { ReleaseTagNote } from './ReleaseTagNote';

export function WriteReleaseArt({ file, plan }: { file: File; plan: TagPlan }) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const extension = extensionOf(file.name) || 'jpg';
  const filename = releaseDownloadName(plan.tags.title, file.name, extension);
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
      const next = await writeReleaseImage(file, plan.tags);
      setBlob(next);
      setPhase('done');
    } catch (caught) {
      setPhase('error');
      setError(caught instanceof Error ? caught.message : 'The art export failed.');
    }
  }

  return (
    <section className="section loudness-fix" data-testid="write-release-art">
      <h2>Correct the art metadata</h2>
      <p>
        This cover is named {fileStem(file.name)}. The corrected image keeps the picture and replaces its metadata
        with the form fields. The download is named from the title.
      </p>
      <ReleaseTagNote plan={plan} />
      {phase === 'running' ? <p role="status">Writing metadata…</p> : null}
      {phase === 'done' && blob ? (
        <div className="loudness-ready">
          <p>Cover file is ready.</p>
          <button type="button" className="fix-button" onClick={() => downloadBlob(blob, filename)}>
            Download {filename}
          </button>
        </div>
      ) : null}
      {phase === 'error' && error ? <p className="status is-error">{error}</p> : null}
      {phase === 'idle' || phase === 'error' ? (
        hasReleaseTags(plan.tags) ? (
          <button type="button" className="fix-button" data-testid="write-release-art-button" onClick={() => void onWrite()}>
            Export art with release metadata
          </button>
        ) : null
      ) : null}
    </section>
  );
}
