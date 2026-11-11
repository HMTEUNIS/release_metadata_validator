import type { TagPlan } from '../lib/releaseTags';

export function ReleaseTagNote({ plan }: { plan: TagPlan }) {
  const ready = plan.written.length > 0;
  return (
    <>
      <p>
        {ready
          ? 'The form fields are the source of truth. Title, artist, featuring, composer, ISRC, and explicit are written as you entered them. The same values go into the XML, and a blank field stays blank there.'
          : 'The form fields are empty, so there is no release metadata to write.'}
      </p>
      <ul>
        {plan.written.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {plan.omitted.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}
