import { useMemo, useRef, useState } from 'react';
import { PLAN_TEMPLATES } from '../data/plans';
import { readPdfText } from '../pdf/readPdf';
import { loadPlans, savePlans } from '../storage/planStorage';
import { parsePlanText } from '../models/planPdfModel';
import { toCustom } from '../models/sectionEditModel';
import { SectionEditor } from './SectionEditor';
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
import { instantiatePlan, unresolvedCount } from '../models/planImportModel';
import { resistanceColor, resistanceName } from '../models/resistanceModel';
import { SEGMENT_SPECS, SEGMENT_TYPES, resistanceSpan, type SegmentType } from '../models/segmentModel';
import type { Track } from '../models/trackModel';
import type { CustomSegment } from '../models/customPlanModel';
import { SegmentStrip } from './SegmentStrip';

interface Props {
  tracks: Track[];
  draft: ClassPlan;
  onChange: (patch: Partial<ClassPlan>) => void;
  /** Reads a playlist into the library and returns the songs that were new. */
  onImportPlaylist: (link: string) => Promise<Track[]>;
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

function zoneSpanLabel(levels: number[]): string {
  if (levels.length === 0) return '';
  const low = resistanceName(Math.min(...levels));
  const high = resistanceName(Math.max(...levels));
  return low === high ? low : `${low} to ${high}`;
}

export function Builder({
  tracks,
  draft,
  onChange,
  onImportPlaylist,
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
  const [planId, setPlanId] = useState(PLAN_TEMPLATES[0].id);
  const [savedPlans, setSavedPlans] = useState(() => loadPlans());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const allPlans = useMemo(() => [...PLAN_TEMPLATES, ...savedPlans], [savedPlans]);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);

  const timeline = useMemo(() => buildTimeline(draft.items, tracks), [draft.items, tracks]);
  const total = totalDuration(timeline);
  const entryById = useMemo(() => new Map(timeline.map((e) => [e.item.id, e])), [timeline]);
  const outOfRange = timeline.filter((e) => !e.cadenceInRange).length;

  const unresolved = unresolvedCount(draft.items, tracks);
  const pickable = useMemo(
    () => tracks.filter((t) => t.source !== 'synth').sort((a, b) => a.title.localeCompare(b.title)),
    [tracks],
  );

  const loadPlan = async () => {
    const plan = allPlans.find((p) => p.id === planId);
    if (!plan) return;
    let pool = tracks;
    let message: string | null = null;
    if (link.trim()) {
      setLoading(true);
      try {
        const added = await onImportPlaylist(link);
        pool = [...tracks, ...added];
      } catch (e) {
        message = `${e instanceof Error ? e.message : 'The playlist could not be read.'} The plan was loaded without it.`;
      } finally {
        setLoading(false);
      }
    }
    const items = instantiatePlan(plan, pool, () => newId('seg'));
    const missing = unresolvedCount(items, pool);
    onChange({ name: plan.name, items });
    setLoadMessage(message ?? (missing === 0 ? 'All songs found.' : `${missing} songs were not found. Pick them below.`));
  };

  const importPdf = async (file: File) => {
    setPdfBusy(true);
    setLoadMessage(null);
    try {
      const plan = parsePlanText(await readPdfText(file), file.name.replace(/\.pdf$/i, ''));
      if (!plan) {
        setLoadMessage(
          'No songs found in that PDF. It needs numbered lines like "1. RPM 62 í bláum (5:15): Artist: Title", with timed lines under them.',
        );
        return;
      }
      const rest = savedPlans.filter((p) => p.id !== plan.id);
      const next = [...rest, plan];
      setSavedPlans(next);
      savePlans(next);
      setPlanId(plan.id);
      setLoadMessage(`Read ${plan.items.length} songs from "${plan.name}". Tap Load plan to use it.`);
    } catch {
      setLoadMessage('That PDF could not be read.');
    } finally {
      setPdfBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setCustom = (id: string, custom: CustomSegment) =>
    onChange({ items: updateItem(draft.items, id, { custom }) });

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
        <div className="row wrap planload">
          <label className="field grow">
            <span>Written plan</span>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {allPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row wrap planload">
          <label className="field grow">
            <span>Spotify playlist link (optional, reads the songs first)</span>
            <input
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
            />
          </label>
          <button className="btn primary" onClick={() => void loadPlan()} disabled={loading}>
            {loading ? 'Reading playlist...' : 'Load plan'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importPdf(f);
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={pdfBusy}>
            {pdfBusy ? 'Reading PDF...' : 'Import program from PDF'}
          </button>
        </div>
        {loadMessage && <div className="notice">{loadMessage}</div>}
        <p className="muted small-text">
          A written plan keeps your RPM and color changes. Its songs are found in your library by title and artist.
        </p>
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
            <button className="btn primary" onClick={onStart} disabled={timeline.length === 0 || unresolved > 0}>
              Start class
            </button>
          </div>
        </div>
        {unresolved > 0 && (
          <div className="notice warn">
            {unresolved} {unresolved === 1 ? 'song is' : 'songs are'} not picked yet. Add them from the Spotify tab, then
            choose each one below.
          </div>
        )}
        <SegmentStrip timeline={timeline} height={84} />
        <div className="strip-legend">
          <span>Bar height and color show resistance: white is none, then blue, green, yellow and red</span>
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
              <div className="segwrap" key={item.id}>
              <div className="segrow">
                <div className="segnum">{idx + 1}</div>
                {item.custom && (
                  <span className="chip plan" title={item.custom.note ?? 'From your written plan'}>
                    Plan
                  </span>
                )}
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
                  className={`segtrack${item.custom && !entry ? ' missing' : ''}`}
                  value={item.trackId}
                  onChange={(e) => onChange({ items: updateItem(draft.items, item.id, { trackId: e.target.value }) })}
                  aria-label="Song"
                >
                  {item.custom ? (
                    <>
                      {!entry && <option value="">Pick a song</option>}
                      {pickable.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} · {t.artist}
                        </option>
                      ))}
                    </>
                  ) : null}
                  {(item.custom ? [] : ranked).map((r) => (
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
                  {item.custom && !item.custom.rpm
                    ? 'no rpm'
                    : `${entry ? Math.round(entry.cadence) : '-'} rpm${entry?.pedalFactor === 0.5 ? ' ½' : ''}`}
                </div>
                <div
                  className="span"
                  style={{
                    background: `linear-gradient(90deg, ${resistanceColor(span.low)}, ${resistanceColor(span.high)})`,
                  }}
                  title={`Resistance ${span.low} to ${span.high}`}
                >
                  {item.custom
                    ? zoneSpanLabel(entry?.cues.map((c) => c.resistance) ?? [])
                    : span.low === span.high
                      ? span.low
                      : `${span.low} to ${span.high}`}
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
                    className="btn"
                    onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                    disabled={!entry}
                    aria-expanded={editingId === item.id}
                  >
                    {editingId === item.id ? 'Close' : 'Edit'}
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
              {editingId === item.id && entry && (
                <SectionEditor
                  custom={item.custom ?? toCustom(entry)}
                  duration={entry.duration}
                  onChange={(c) => setCustom(item.id, c)}
                />
              )}
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
