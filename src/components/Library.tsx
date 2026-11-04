import { useMemo, useRef, useState } from 'react';
import type { Library as LibraryState } from '../hooks/useLibrary';
import { matchTrack, rankTracks } from '../models/classPlanModel';
import { formatClock } from '../models/formatModel';
import { SEGMENT_SPECS, SEGMENT_TYPES, type SegmentType } from '../models/segmentModel';
import { clampBpm, type Track } from '../models/trackModel';

interface Props {
  library: LibraryState;
  onPreview: (track: Track) => void;
  previewingId: string | null;
  previewDisabled: boolean;
}

type Filter = 'all' | SegmentType;

export function Library({ library, onPreview, previewingId, previewDisabled }: Props) {
  const { tracks, imports, addFiles, updateTrack, removeTrack } = library;
  const [filter, setFilter] = useState<Filter>('all');
  const input = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    if (filter === 'all') return [...tracks].sort((a, b) => a.bpm - b.bpm);
    return rankTracks(tracks, filter)
      .filter((m) => m.cadenceInRange)
      .map((m) => m.track);
  }, [tracks, filter]);

  return (
    <section className="library">
      <div className="panel">
        <div className="row wrap between">
          <div>
            <h2>Music</h2>
            <p className="muted small-text">
              Built in practice tracks work with no files. Add your own songs and the tempo is detected automatically.
              Fix a wrong tempo with the ½ and ×2 buttons.
            </p>
          </div>
          <div className="row">
            <input
              ref={input}
              type="file"
              accept="audio/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button className="btn primary" onClick={() => input.current?.click()}>
              Add your music
            </button>
          </div>
        </div>

        {imports.length > 0 && (
          <div className="imports">
            {imports.slice(-6).map((p, i) => (
              <div key={`${p.name}-${i}`} className={`import ${p.state}`}>
                <span className="grow">{p.name}</span>
                <span>{p.state === 'working' ? 'Analyzing tempo...' : p.message}</span>
              </div>
            ))}
          </div>
        )}

        <label className="field filter">
          <span>Show songs that fit</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">All songs, slowest first</option>
            {SEGMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {SEGMENT_SPECS[t].label} ({SEGMENT_SPECS[t].cadence.min} to {SEGMENT_SPECS[t].cadence.max} rpm)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel">
        {rows.length === 0 && <p className="muted">No songs fit that segment yet. Add some music in that tempo range.</p>}
        {rows.map((t) => {
          const mine = t.source === 'file';
          const fits = SEGMENT_TYPES.filter((type) => matchTrack(t, type).cadenceInRange);
          const playing = previewingId === `lib-${t.id}`;
          return (
            <div className="trow" key={t.id}>
              <button
                className="btn icon"
                onClick={() => onPreview(t)}
                disabled={previewDisabled}
                aria-label={playing ? 'Stop preview' : `Preview ${t.title}`}
              >
                {playing ? '■' : '▶'}
              </button>
              <div className="tinfo">
                <div className="ttitle">{t.title}</div>
                <div className="muted small-text">
                  {t.artist} · {formatClock(t.duration)} · {t.credit ? 'Free music' : mine ? 'Your file' : 'Built in'}
                  {t.credit && (
                    <>
                      {' · '}
                      <a href={t.credit.licenseUrl || t.credit.sourceUrl} target="_blank" rel="noreferrer">
                        {t.credit.license}
                      </a>
                      {' · '}
                      <a href={t.credit.sourceUrl} target="_blank" rel="noreferrer">
                        Source page
                      </a>
                    </>
                  )}
                </div>
                <div className="chips">
                  {fits.length === 0 && <span className="chip small dim">No segment fits</span>}
                  {fits.map((type) => {
                    const m = matchTrack(t, type);
                    return (
                      <span className="chip small" key={type}>
                        {SEGMENT_SPECS[type].label} {Math.round(m.cadence)}
                        {m.pedalFactor === 0.5 ? ' ½' : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="tcontrols">
                {mine ? (
                  <>
                    <div className="bpmbox">
                      <button className="btn icon" onClick={() => updateTrack(t.id, { bpm: clampBpm(t.bpm / 2) })} aria-label="Halve tempo">
                        ½
                      </button>
                      <input
                        type="number"
                        min={40}
                        max={220}
                        step={0.1}
                        value={t.bpm}
                        onChange={(e) => updateTrack(t.id, { bpm: Number(e.target.value) })}
                        aria-label="BPM"
                      />
                      <button className="btn icon" onClick={() => updateTrack(t.id, { bpm: clampBpm(t.bpm * 2) })} aria-label="Double tempo">
                        ×2
                      </button>
                      <span className="muted">BPM</span>
                    </div>
                    <label className="energy">
                      Energy
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={t.energy}
                        onChange={(e) => updateTrack(t.id, { energy: Number(e.target.value) })}
                      />
                      <span>{t.energy}</span>
                    </label>
                    <button className="btn icon" onClick={() => void removeTrack(t.id)} aria-label={`Remove ${t.title}`}>
                      ✕
                    </button>
                  </>
                ) : (
                  <div className="muted tnum">
                    {t.bpm} BPM · energy {t.energy}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
