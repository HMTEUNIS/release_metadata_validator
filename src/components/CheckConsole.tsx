'use client';

import { useEffect, useRef } from 'react';

function hashBar(fraction: number, width = 24): string {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export function CheckConsole({ lines, fraction }: { lines: string[]; fraction: number }) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [lines]);

  return (
    <div className="console-backdrop" role="dialog" aria-modal="true" aria-labelledby="check-console-title">
      <div className="console-window" data-testid="check-console">
        <p className="console-title" id="check-console-title">
          check
        </p>
        <pre className="console-log" ref={logRef}>
          {lines.map((line) => `> ${line}`).join('\n')}
        </pre>
        <p className="console-bar" data-testid="check-console-bar">
          {hashBar(fraction)}
        </p>
        <p className="console-stay">Do not close this page.</p>
      </div>
    </div>
  );
}
