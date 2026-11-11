'use client';

import { useLayoutEffect, useRef, useState } from 'react';

export function FitArt({ text, className }: { text: string; className: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLPreElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const fit = () => {
      const available = outer.clientWidth;
      const needed = inner.scrollWidth;
      const next = needed > available && available > 0 ? available / needed : 1;
      setScale(next);
      setHeight(Math.ceil(inner.scrollHeight * next));
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="art-fit" ref={outerRef} style={height == null ? undefined : { height }}>
      <pre ref={innerRef} className={className} aria-hidden="true" style={{ transform: `scale(${scale})` }}>
        {text}
      </pre>
    </div>
  );
}
