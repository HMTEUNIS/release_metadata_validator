'use client';

import { useEffect, useState } from 'react';
import { downloadBlob } from '../lib/downloadXml';
import {
  canUseLoudnessFix,
  fixLoudness,
  ISOLATION_MESSAGE,
  loudnessTarget,
  normalizedFilename,
} from '../lib/fixLoudness';
import { tagSignature, type TagPlan } from '../lib/releaseTags';
import { ReleaseTagNote } from './ReleaseTagNote';

const LIMITS = [
  'Normalization adjusts level, not dynamics. If your master was heavily limited, the fix cannot restore the original punch.',
  'Output is WAV. If you need MP3 or FLAC for your distributor, convert after downloading.',
  "The fix uses FFmpeg's loudnorm filter (EBU R128) with LRA=11. LRA is the loudness range it steers toward, not just the integrated level.",
  'First use downloads about 32 MB. Later fixes in the same session are faster.',
];

export function FixLoudnessButton({ file, ruleId, plan }: { file: File; ruleId: string; plan: TagPlan }) {
  const target = loudnessTarget(ruleId);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'running' | 'done' | 'error'>('idle');
  const [ratio, setRatio] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signature = tagSignature(plan.tags);

  useEffect(() => {
    setPhase('idle');
    setRatio(0);
    setBlob(null);
    setError(null);
  }, [file, signature]);

  if (!target) return null;
  const chosen = target;
  const filename = normalizedFilename(file.name, chosen.lufs, plan.tags.title);
  const isolated = canUseLoudnessFix();
  const percent = Math.round(ratio * 100);

  async function onFix() {
    setError(null);
    setBlob(null);
    setRatio(0);
    setPhase('preparing');
    try {
      const next = await fixLoudness(file, chosen.lufs, (update) => {
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
    <div className="loudness-fix" data-testid={`fix-${ruleId}`}>
      <ul>
        <li>
          The fix targets {chosen.lufs} LUFS with a standard dynamic range. It may not preserve the exact character of
          your original master.
        </li>
        {LIMITS.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
      <ReleaseTagNote plan={plan} />
      <p className="loudness-offer">Here is a possible fix. Listen to the file and see if you like it.</p>
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
          <p>Normalizing… {percent}%</p>
        </div>
      ) : null}
      {phase === 'done' && blob ? (
        <div className="loudness-ready">
          <p>Fixed. Your {chosen.lufs} LUFS file is ready.</p>
          <button type="button" className="fix-button" onClick={() => downloadBlob(blob, filename)}>
            Download {filename}
          </button>
        </div>
      ) : null}
      {phase === 'error' && error ? <p className="status is-error">{error}</p> : null}
      {phase === 'idle' || phase === 'error' ? (
        isolated ? (
          <button type="button" className="fix-button" data-testid={`fix-button-${ruleId}`} onClick={() => void onFix()}>
            Fix Loudness for {chosen.platform}
          </button>
        ) : (
          <p className="status is-error">{ISOLATION_MESSAGE}</p>
        )
      ) : null}
    </div>
  );
}
