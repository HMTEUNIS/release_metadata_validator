'use client';

import type { Ref } from 'react';
import { FixLoudnessButton } from './FixLoudnessButton';
import { loudnessTarget } from '../lib/fixLoudness';
import type { TagPlan } from '../lib/releaseTags';
import { PLATFORM_LABEL } from '../lib/rules/platformSpecs';
import type { ValidationResult } from '../lib/types';

const SEVERITY_MARK = {
  error: '×',
  warning: '!',
  pass: '✓',
} as const;

const SEVERITY_LABEL = {
  error: 'Error',
  warning: 'Warning',
  pass: 'Pass',
} as const;

function ResultItem({
  result,
  audioFile,
  plan,
}: {
  result: ValidationResult;
  audioFile?: File | null;
  plan: TagPlan;
}) {
  return (
    <li
      className={`result is-${result.severity}`}
      data-testid={`result-${result.id}`}
      data-severity={result.severity}
    >
      <div className="kicker">
        <span className="severity">
          <span aria-hidden="true">{SEVERITY_MARK[result.severity]} </span>
          {SEVERITY_LABEL[result.severity]}
        </span>
        <span className="platform">({PLATFORM_LABEL[result.platform]})</span>
        <span className="rule-id">{result.id}</span>
      </div>
      <p className="message">{result.message}</p>
      {result.details ? <p className="details">{result.details}</p> : null}
      {result.severity !== 'pass' && result.fix ? (
        <p className="fix">
          <span className="fix-label">Fix:</span> {result.fix}
        </p>
      ) : null}
      {audioFile && loudnessTarget(result.id) && (result.severity === 'error' || result.severity === 'warning') ? (
        <FixLoudnessButton file={audioFile} ruleId={result.id} plan={plan} />
      ) : null}
    </li>
  );
}

export function ResultsList({
  results,
  ocrText,
  headingRef,
  audioFile,
  plan,
}: {
  results: ValidationResult[];
  ocrText: string | null;
  headingRef?: Ref<HTMLHeadingElement>;
  audioFile?: File | null;
  plan: TagPlan;
}) {
  const errors = results.filter((result) => result.severity === 'error');
  const warnings = results.filter((result) => result.severity === 'warning');
  const passes = results.filter((result) => result.severity === 'pass');
  const clear = errors.length === 0 && warnings.length === 0;

  return (
    <section className="section results" data-testid="results">
      <h2 tabIndex={-1} id="results-heading" ref={headingRef}>
        Results
      </h2>
      {clear ? <p className="all-clear">No errors or warnings.</p> : null}
      {errors.length > 0 ? (
        <ul className="result-list">
          {errors.map((result) => (
            <ResultItem key={`${result.id}-${result.message}`} result={result} audioFile={audioFile} plan={plan} />
          ))}
        </ul>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="result-list">
          {warnings.map((result) => (
            <ResultItem key={`${result.id}-${result.message}`} result={result} audioFile={audioFile} plan={plan} />
          ))}
        </ul>
      ) : null}
      {passes.length > 0 ? (
        <details className="passes">
          <summary>Passed checks ({passes.length})</summary>
          <ul className="result-list">
            {passes.map((result) => (
              <ResultItem key={`${result.id}-${result.message}`} result={result} audioFile={audioFile} plan={plan} />
            ))}
          </ul>
        </details>
      ) : null}
      {ocrText ? (
        <details className="ocr-text">
          <summary>Text read from the cover</summary>
          <p>{ocrText}</p>
        </details>
      ) : null}
    </section>
  );
}
