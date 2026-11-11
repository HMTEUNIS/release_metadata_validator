'use client';

interface SkeletonExportProps {
  hasErrors: boolean;
  audioIncomplete: boolean;
  ocrFailed: boolean;
  exportError: string | null;
  onDownload: () => void;
}

export function SkeletonExport({
  hasErrors,
  audioIncomplete,
  ocrFailed,
  exportError,
  onDownload,
}: SkeletonExportProps) {
  return (
    <section className="skeleton" data-testid="ddex-export">
      {hasErrors ? (
        <p className="skeleton-warning" data-testid="ddex-warning">
          Fix the errors above before using this file.
        </p>
      ) : null}
      <button
        type="button"
        className={`download${hasErrors ? ' is-caution' : ''}`}
        data-testid="ddex-download"
        onClick={onDownload}
      >
        Download DDEX Skeleton (.xml)
      </button>
      {exportError ? <p className="status is-error">{exportError}</p> : null}
      <p className="skeleton-disclaimer" data-testid="ddex-disclaimer">
        This is a base file, not a delivery-ready message. Filled elements come from the form and the files you
        checked. Empty elements are left for you to complete.
      </p>
      {audioIncomplete ? (
        <p className="skeleton-note">
          Sample rate, bit depth, channel count, or duration is empty because the audio header could not be read.
        </p>
      ) : null}
      {ocrFailed ? (
        <p className="skeleton-note">
          Cover text could not be read. This file is built from the form and the audio header, not from the cover.
        </p>
      ) : null}
      <ul>
        <li>Title, artist, featuring, composer, ISRC, and explicit are written when the form has them. A blank stays blank.</li>
        <li>The label, UPC, genre, deal territory, start date, commercial model, usage, and file hash are empty.</li>
        <li>The DPIDs are placeholders. A real delivery requires registered DDEX Party IDs.</li>
        <li>The file URI is the uploaded file name. There is no hash until you add one.</li>
        <li>Your distributor still generates the message that gets delivered. Workbench may reject the empty fields until you fill them.</li>
      </ul>
      <p className="coffee">
        <span aria-hidden="true">☕ </span>
        This tool is free and open source. If it saved you a rejection,{' '}
        <a
          href="https://buymeacoffee.com/hollyteunis"
          target="_blank"
          rel="noreferrer"
          data-testid="coffee-link"
        >
          buy me a coffee
        </a>.
      </p>
    </section>
  );
}
