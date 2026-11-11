'use client';

import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

interface FileDropProps {
  step: string;
  title: string;
  hint: string;
  accept: string;
  inputTestId: string;
  statusTestId: string;
  fileName?: string;
  status?: string;
  tone?: 'neutral' | 'error';
  busy?: boolean;
  previewUrl?: string | null;
  onFile: (file: File) => void;
  onClear?: () => void;
}

export function FileDrop({
  step,
  title,
  hint,
  accept,
  inputTestId,
  statusTestId,
  fileName,
  status,
  tone = 'neutral',
  busy = false,
  previewUrl,
  onFile,
  onClear,
}: FileDropProps) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);

  function onDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    depth.current += 1;
    setActive(true);
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setActive(false);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    depth.current = 0;
    setActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <section className="section">
      <h2>
        <span className="step">{step}</span>
        {title}
      </h2>
      <div className="picker">
        <label
          className={`drop${active ? ' is-active' : ''}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            className="visually-hidden"
            data-testid={inputTestId}
            type="file"
            accept={accept}
            aria-busy={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onFile(file);
            }}
          />
          <span className="drop-title">{hint}</span>
          {previewUrl ? <img className="preview" src={previewUrl} alt="Uploaded cover preview" /> : null}
        </label>
        {fileName && onClear ? (
          <button type="button" className="remove" onClick={onClear}>
            Remove
          </button>
        ) : null}
        {status ? (
          <p className={`status${tone === 'error' ? ' is-error' : ''}`} data-testid={statusTestId}>
            {status}
          </p>
        ) : null}
      </div>
    </section>
  );
}
