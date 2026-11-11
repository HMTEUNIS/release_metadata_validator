'use client';

import type { ReleaseMetadata } from '../lib/types';

interface MetadataFormProps {
  value: ReleaseMetadata;
  onChange: (value: ReleaseMetadata) => void;
}

export function MetadataForm({ value, onChange }: MetadataFormProps) {
  function set<K extends keyof ReleaseMetadata>(key: K, next: ReleaseMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <section className="section">
      <h2>
        <span className="step">3</span>
        Release metadata
      </h2>
      <div className="fields">
        <div className="field">
          <label htmlFor="release-title">Title</label>
          <input
            id="release-title"
            value={value.title}
            autoComplete="off"
            placeholder="Song title"
            onChange={(event) => set('title', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="release-artist">Artist</label>
          <input
            id="release-artist"
            value={value.artist}
            autoComplete="off"
            placeholder="Main artist name"
            onChange={(event) => set('artist', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="release-featuring">Featuring</label>
          <input
            id="release-featuring"
            value={value.featuring}
            autoComplete="off"
            placeholder="Optional. Not the main artist field."
            onChange={(event) => set('featuring', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="release-isrc">ISRC</label>
          <input
            id="release-isrc"
            value={value.isrc ?? ''}
            autoComplete="off"
            placeholder="Optional. A blank ISRC stays empty in the XML."
            onChange={(event) => set('isrc', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="release-composer">Composer</label>
          <input
            id="release-composer"
            value={value.composer}
            autoComplete="off"
            placeholder="Full legal name"
            onChange={(event) => set('composer', event.target.value)}
          />
        </div>
        <div className="field">
          <span id="explicit-label">Explicit</span>
          <div className="radios" role="radiogroup" aria-labelledby="explicit-label">
            <label>
              <input
                type="radio"
                name="explicit"
                checked={value.explicit === true}
                onChange={() => set('explicit', true)}
              />
              Yes
            </label>
            <label>
              <input
                type="radio"
                name="explicit"
                checked={value.explicit === false}
                onChange={() => set('explicit', false)}
              />
              No
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
