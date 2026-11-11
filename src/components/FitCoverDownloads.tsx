'use client';

import { useEffect, useState } from 'react';
import { downloadBlob } from '../lib/downloadXml';
import { fitCoverFile } from '../lib/fitCover';
import { fileStem, sanitizeStem, type TagPlan } from '../lib/releaseTags';
import { COVER_PLATFORMS, coverExportEdge, coverFileLimitMB, PLATFORM_LABEL, type CoverPlatform } from '../lib/rules/platformSpecs';

export function FitCoverDownloads({
  file,
  width,
  height,
  plan,
}: {
  file: File;
  width: number;
  height: number;
  plan: TagPlan;
}) {
  const [busy, setBusy] = useState<CoverPlatform | null>(null);
  const [blobs, setBlobs] = useState<Partial<Record<CoverPlatform, Blob>>>({});
  const [errors, setErrors] = useState<Partial<Record<CoverPlatform, string>>>({});
  const stem = sanitizeStem(plan.tags.title) || fileStem(file.name);
  const signature = `${file.name}:${file.size}:${width}:${height}:${stem}`;

  useEffect(() => {
    setBusy(null);
    setBlobs({});
    setErrors({});
  }, [signature]);

  async function onFit(platform: CoverPlatform) {
    setErrors((current) => ({ ...current, [platform]: undefined }));
    setBusy(platform);
    try {
      const next = await fitCoverFile(file, platform, width, height, plan.tags);
      setBlobs((current) => ({ ...current, [platform]: next }));
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [platform]: caught instanceof Error ? caught.message : 'The cover export failed.',
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="section loudness-fix" data-testid="fit-covers">
      <h2>Fit the cover to each platform</h2>
      <p>
        Each download is a square JPEG sized for that platform. A wide or tall image is cropped from the center.
        Enlarging a small image does not add detail. The form fields are written into the file. Look at the file
        and see if you like it.
      </p>
      <ul className="fit-covers">
        {COVER_PLATFORMS.map((platform) => {
          const edge = coverExportEdge(platform, width, height);
          const blob = blobs[platform];
          const filename = `${stem}-${platform}.jpg`;
          const enlarged = edge > Math.min(width, height);
          const limit = coverFileLimitMB(platform);
          return (
            <li key={platform}>
              <p>
                {PLATFORM_LABEL[platform]} · {edge}×{edge} JPEG
                {enlarged ? ' · enlarged' : ''}
                {limit ? ` · under ${limit} MB` : ''}
              </p>
              {busy === platform ? <p role="status">Making the JPEG…</p> : null}
              {errors[platform] ? <p className="status is-error">{errors[platform]}</p> : null}
              {blob ? (
                <button type="button" className="fix-button" onClick={() => downloadBlob(blob, filename)}>
                  Download {filename}
                </button>
              ) : (
                <button
                  type="button"
                  className="fix-button"
                  data-testid={`fit-cover-${platform}`}
                  disabled={busy != null}
                  onClick={() => void onFit(platform)}
                >
                  Make {PLATFORM_LABEL[platform]} cover
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
