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
        This is a structural starting point, not a delivery-ready file. Your distributor generates the real DDEX
        message.
      </p>
      {audioIncomplete ? (
        <p className="skeleton-note">
          Audio details in this file are placeholders because the audio header could not be read.
        </p>
      ) : null}
      {ocrFailed ? (
        <p className="skeleton-note">
          Cover text could not be read. This file is built from the form and the audio header, not from the cover.
        </p>
      ) : null}
      <ul>
        <li>The DPIDs in this file are placeholders. A real delivery requires registered DDEX Party IDs.</li>
        <li>The UPC/EAN is the placeholder 0000000000000. A real release needs a valid identifier.</li>
        <li>The DealList is a generic placeholder. Real deals depend on your distributor and territory.</li>
        <li>The file name is a placeholder, and there is no hash. A real delivery references the actual audio file on a file server.</li>
        <li>This file is for understanding the format, not for submission.</li>
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
