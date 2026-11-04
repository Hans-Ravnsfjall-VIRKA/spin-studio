import { useMemo, useState } from 'react';
import { newId } from '../lib/id';
import {
  CLASS_TEMPLATES,
  TEMPLATE_IDS,
  addItem,
  autoBuildClass,
  buildTimeline,
  moveItem,
  rankTracks,
  removeItem,
  totalDuration,
  updateItem,
  type ClassPlan,
  type PlanItem,
  type TemplateId,
} from '../models/classPlanModel';
import { formatClock, formatPercent } from '../models/formatModel';
import { resistanceColor } from '../models/resistanceModel';
import { SEGMENT_SPECS, SEGMENT_TYPES, resistanceSpan, type SegmentType } from '../models/segmentModel';
import type { Track } from '../models/trackModel';
import { SegmentStrip } from './SegmentStrip';

interface Props {
  tracks: Track[];
  draft: ClassPlan;
  onChange: (patch: Partial<ClassPlan>) => void;
  classes: ClassPlan[];
  onSave: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onStart: () => void;
  onPreview: (itemId: string, trackId: string, type: SegmentType) => void;
  previewingId: string | null;
  previewDisabled: boolean;
}

const LENGTHS = [30, 45, 60];

export function Builder({
  tracks,
  draft,
  onChange,
  classes,
  onSave,
  onLoad,
  onDelete,
  onStart,
  onPreview,
  previewingId,
  previewDisabled,
}: Props) {
  const [template, setTemplate] = useState<TemplateId>('mixed');
  const [minutes, setMinutes] = useState(45);
  const [addType, setAddType] = useState<SegmentType>('flat');

  const timeline = useMemo(() => buildTimeline(draft.items, tracks), [draft.items, tracks]);
  const total = totalDuration(timeline);
  const entryById = useMemo(() => new Map(timeline.map((e) => [e.item.id, e])), [timeline]);
  const outOfRange = timeline.filter((e) => !e.cadenceInRange).length;

  const generate = () => {
    const items = autoBuildClass(tracks, template, minutes, {
      seed: Math.floor(Math.random() * 1e9),
      newId: () => newId('seg'),
    });
    onChange({ items });
  };

  const addSegment = () => {
    const used = new Set(draft.items.map((i) => i.trackId));
    const ranked = rankTracks(tracks, addType);
    const pick = ranked.find((r) => !used.has(r.track.id)) ?? ranked[0];
    if (!pick) return;
    const item: PlanItem = { id: newId('seg'), trackId: pick.track.id, type: addType };
    // New segments go before the final cool down when there is one.
    const last = draft.items[draft.items.length - 1];
    const index = last && last.type === 'cooldown' && addType !== 'cooldown' ? draft.items.length - 1 : undefined;
    onChange({ items: addItem(draft.items, item, index) });
  };

  const changeType = (id: string, type: SegmentType) => {
    const current = draft.items.find((i) => i.id === id);
    if (!current) return;
    const best = rankTracks(tracks, type)[0];
    const currentFits = rankTracks(tracks, type).find((r) => r.track.id === current.trackId);
    // Keep the song if it still fits the new type, otherwise swap to the best match.
    const trackId = currentFits && currentFits.cadenceInRange ? current.trackId : best.track.id;
    onChange({ items: updateItem(draft.items, id, { type, trackId }) });
  };

  return (
    <section className="build">
      <div className="panel">
        <div className="row wrap">
          <label className="field grow">
            <span>Class name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Class name"
            />
          </label>
          <label className="field">
            <span>Style</span>
            <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)}>
              {TEMPLATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {CLASS_TEMPLATES[id].name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Length</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={generate}>
            Generate class
          </button>
        </div>
        <p className="muted small-text">{CLASS_TEMPLATES[template].blurb}. Songs are matched to each segment by cadence and energy.</p>
      </div>

      <div className="panel">
        <div className="row between">
          <div>
            <strong>{timeline.length}</strong> songs, <strong>{formatClock(total)}</strong>
            {outOfRange > 0 && (
              <span className="warn-text"> · {outOfRange} off cadence</span>
            )}
          </div>
          <div className="row">
            <button className="btn" onClick={onSave} disabled={timeline.length === 0}>
              Save class
            </button>
            <button className="btn primary" onClick={onStart} disabled={timeline.length === 0}>
              Start class
            </button>
          </div>
        </div>
        <SegmentStrip timeline={timeline} height={84} />
        <div className="strip-legend">
          <span>Bar height and color show resistance, blue to red</span>
        </div>
      </div>

      <div className="panel">
        <div className="seglist">
          {draft.items.map((item, idx) => {
            const entry = entryById.get(item.id);
            const ranked = rankTracks(tracks, item.type);
            const span = entry ? resistanceSpan(entry.cues) : { low: 1, high: 1 };
            const playing = previewingId === item.id;
            return (
              <div className="segrow" key={item.id}>
                <div className="segnum">{idx + 1}</div>
                <select
                  className="segtype"
                  value={item.type}
                  onChange={(e) => changeType(item.id, e.target.value as SegmentType)}
                  aria-label="Segment type"
                >
                  {SEGMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SEGMENT_SPECS[t].label}
                    </option>
                  ))}
                </select>
                <select
                  className="segtrack"
                  value={item.trackId}
                  onChange={(e) => onChange({ items: updateItem(draft.items, item.id, { trackId: e.target.value }) })}
                  aria-label="Song"
                >
                  {ranked.map((r) => (
                    <option key={r.track.id} value={r.track.id}>
                      {r.track.title} · {r.track.bpm} BPM · {Math.round(r.cadence)} rpm · {formatPercent(r.score)}
                    </option>
                  ))}
                </select>
                <div
                  className={`badge${entry && !entry.cadenceInRange ? ' warn' : ''}`}
                  title={
                    entry && !entry.cadenceInRange
                      ? 'This song does not land in the usual cadence range for this segment'
                      : entry?.pedalFactor === 0.5
                        ? 'Half time: pedal on every second beat'
                        : 'Pedal on every beat'
                  }
                >
                  {entry ? Math.round(entry.cadence) : '-'} rpm{entry?.pedalFactor === 0.5 ? ' ½' : ''}
                </div>
                <div
                  className="span"
                  style={{
                    background: `linear-gradient(90deg, ${resistanceColor(span.low)}, ${resistanceColor(span.high)})`,
                  }}
                  title={`Resistance ${span.low} to ${span.high}`}
                >
                  {span.low === span.high ? span.low : `${span.low} to ${span.high}`}
                </div>
                <div className="muted time">{entry ? formatClock(entry.duration) : ''}</div>
                <div className="row tight">
                  <button
                    className="btn icon"
                    onClick={() => onPreview(item.id, item.trackId, item.type)}
                    disabled={previewDisabled}
                    aria-label={playing ? 'Stop preview' : 'Preview song'}
                    title="Preview"
                  >
                    {playing ? '■' : '▶'}
                  </button>
                  <button
                    className="btn icon"
                    onClick={() => onChange({ items: moveItem(draft.items, item.id, -1) })}
                    disabled={idx === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="btn icon"
                    onClick={() => onChange({ items: moveItem(draft.items, item.id, 1) })}
                    disabled={idx === draft.items.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className="btn icon"
                    onClick={() => onChange({ items: removeItem(draft.items, item.id) })}
                    aria-label="Remove segment"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
          {draft.items.length === 0 && <p className="muted">No segments yet. Generate a class or add one below.</p>}
        </div>
        <div className="row add">
          <select value={addType} onChange={(e) => setAddType(e.target.value as SegmentType)} aria-label="Segment type to add">
            {SEGMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {SEGMENT_SPECS[t].label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={addSegment}>
            Add segment
          </button>
          <span className="muted small-text">{SEGMENT_SPECS[addType].blurb}</span>
        </div>
      </div>

      {classes.length > 0 && (
        <div className="panel">
          <h3>Saved classes</h3>
          {classes.map((c) => (
            <div className="saved" key={c.id}>
              <span className="grow">{c.name}</span>
              <span className="muted">{c.items.length} songs</span>
              <button className="btn" onClick={() => onLoad(c.id)}>
                Open
              </button>
              <button className="btn" onClick={() => onDelete(c.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
