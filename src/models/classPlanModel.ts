import {
  cadenceScore,
  pickCadence,
  type PedalFactor,
} from './cadenceModel';
import {
  SEGMENT_SPECS,
  buildCues,
  type Cue,
  type SegmentType,
} from './segmentModel';
import { customCuesToCues, customDuration, type CustomSegment } from './customPlanModel';
import { resistanceName } from './resistanceModel';
import { isTempoKnown, type Track } from './trackModel';

export interface PlanItem {
  id: string;
  trackId: string;
  type: SegmentType;
  /** Set when the instructor's own plan gives the RPM and color changes for this song. */
  custom?: CustomSegment;
}

export interface ClassPlan {
  id: string;
  name: string;
  items: PlanItem[];
  createdAt: number;
}

export interface TimelineEntry {
  item: PlanItem;
  track: Track;
  index: number;
  start: number;
  end: number;
  duration: number;
  /** Pedal revolutions per minute the rider should hold. */
  cadence: number;
  pedalFactor: PedalFactor;
  cadenceInRange: boolean;
  /** Cues with absolute class times. */
  cues: Cue[];
}

/* ---------- matching ---------- */

export interface TrackMatch {
  track: Track;
  /** 0 to 1. */
  score: number;
  cadence: number;
  pedalFactor: PedalFactor;
  cadenceInRange: boolean;
}

export function matchTrack(track: Track, type: SegmentType): TrackMatch {
  const spec = SEGMENT_SPECS[type];
  const pick = pickCadence(track.bpm, spec.cadence);
  const cadence = cadenceScore(pick, spec.cadence);
  const energy = 1 - Math.min(1, Math.abs(track.energy - spec.energy) / 4);
  return {
    track,
    score: 0.8 * cadence + 0.2 * energy,
    cadence: pick.cadence,
    pedalFactor: pick.factor,
    cadenceInRange: pick.inRange,
  };
}

export function rankTracks(tracks: Track[], type: SegmentType): TrackMatch[] {
  return tracks
    .filter(isTempoKnown)
    .map((t) => matchTrack(t, type))
    .sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title));
}

/* ---------- timeline ---------- */

export function buildTimeline(items: PlanItem[], tracks: Track[]): TimelineEntry[] {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const entries: TimelineEntry[] = [];
  let clock = 0;
  for (const item of items) {
    const track = byId.get(item.trackId);
    if (!track || track.duration <= 0) continue;
    const match = matchTrack(track, item.type);
    const custom = item.custom;
    const duration = custom ? customDuration(track.duration, custom) : track.duration;
    const start = clock;
    const end = start + duration;
    const baseCues = custom
      ? customCuesToCues(custom.cues, duration)
      : buildCues(item.type, duration, track.bpm, track.beatOffset);
    const cues = baseCues.map((c) => ({
      ...c,
      start: c.start + start,
      end: c.end + start,
    }));
    entries.push({
      item,
      track,
      index: entries.length,
      start,
      end,
      duration,
      cadence: custom ? (custom.rpm ?? 0) : match.cadence,
      pedalFactor: custom ? 1 : match.pedalFactor,
      cadenceInRange: custom ? true : match.cadenceInRange,
      cues,
    });
    clock = end;
  }
  return entries;
}

export function totalDuration(timeline: TimelineEntry[]): number {
  return timeline.length === 0 ? 0 : timeline[timeline.length - 1].end;
}

export interface PlaybackState {
  finished: boolean;
  elapsed: number;
  total: number;
  entry: TimelineEntry | null;
  entryIndex: number;
  cue: Cue | null;
  cueIndex: number;
  cueRemaining: number;
  entryElapsed: number;
  entryRemaining: number;
  nextCue: Cue | null;
  nextEntry: TimelineEntry | null;
}

export function stateAt(timeline: TimelineEntry[], elapsed: number): PlaybackState {
  const total = totalDuration(timeline);
  const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const empty: PlaybackState = {
    finished: true,
    elapsed: Math.min(t, total),
    total,
    entry: null,
    entryIndex: -1,
    cue: null,
    cueIndex: -1,
    cueRemaining: 0,
    entryElapsed: 0,
    entryRemaining: 0,
    nextCue: null,
    nextEntry: null,
  };
  if (timeline.length === 0 || t >= total) return empty;

  const entryIndex = timeline.findIndex((e) => t >= e.start && t < e.end);
  if (entryIndex < 0) return empty;
  const entry = timeline[entryIndex];
  let cueIndex = entry.cues.findIndex((c) => t >= c.start && t < c.end);
  if (cueIndex < 0) cueIndex = entry.cues.length - 1;
  const cue = entry.cues[cueIndex] ?? null;
  const nextEntry = timeline[entryIndex + 1] ?? null;
  const nextCue = entry.cues[cueIndex + 1] ?? nextEntry?.cues[0] ?? null;

  return {
    finished: false,
    elapsed: t,
    total,
    entry,
    entryIndex,
    cue,
    cueIndex,
    cueRemaining: cue ? Math.max(0, cue.end - t) : 0,
    entryElapsed: t - entry.start,
    entryRemaining: entry.end - t,
    nextCue,
    nextEntry,
  };
}

/** Class time where a song ends and the class should wait, or null in the last song. */
export function holdPointAt(timeline: TimelineEntry[], elapsed: number): number | null {
  const i = timeline.findIndex((e) => elapsed >= e.start && elapsed < e.end);
  if (i < 0 || i >= timeline.length - 1) return null;
  return timeline[i].end;
}

export interface ChangeAhead {
  /** Seconds until the change. */
  seconds: number;
  cue: Cue;
}

/**
 * The next zone change when it is within `windowSec`. Cues that keep the same zone
 * are not reported, except in written plans where each cue is an instruction (sit, stand, sprint).
 */
export function changeAhead(state: PlaybackState, windowSec: number): ChangeAhead | null {
  const { cue, nextCue } = state;
  if (!cue || !nextCue || state.cueRemaining > windowSec) return null;
  const sameZone = resistanceName(cue.resistance) === resistanceName(nextCue.resistance);
  const instruction = cue.zone !== undefined && nextCue.zone !== undefined && cue.label !== nextCue.label;
  if (sameZone && !instruction) return null;
  return { seconds: state.cueRemaining, cue: nextCue };
}

/** Position within the current pedal stroke, 0 up to 1, so the UI can pulse on the beat. */
export function pedalPhaseAt(entry: TimelineEntry, elapsed: number): number {
  const custom = entry.item.custom;
  if (custom) {
    const cue = entry.cues.find((c) => elapsed >= c.start && elapsed < c.end);
    const own = cue?.rpm ?? custom.rpm;
    const rpm = own && own > 0 ? own : 60;
    const p = ((elapsed - entry.start) / (60 / rpm)) % 1;
    return p < 0 ? p + 1 : p;
  }
  const beat = 60 / entry.track.bpm;
  const period = beat / entry.pedalFactor;
  const local = elapsed - entry.start - entry.track.beatOffset;
  const phase = (local / period) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/* ---------- editing helpers ---------- */

export function addItem(items: PlanItem[], item: PlanItem, index?: number): PlanItem[] {
  const at = index === undefined ? items.length : Math.max(0, Math.min(items.length, index));
  return [...items.slice(0, at), item, ...items.slice(at)];
}

export function removeItem(items: PlanItem[], id: string): PlanItem[] {
  return items.filter((i) => i.id !== id);
}

export function updateItem(
  items: PlanItem[],
  id: string,
  patch: Partial<Pick<PlanItem, 'trackId' | 'type' | 'custom'>>,
): PlanItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

export function moveItem(items: PlanItem[], id: string, direction: -1 | 1): PlanItem[] {
  const from = items.findIndex((i) => i.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const copy = [...items];
  [copy[from], copy[to]] = [copy[to], copy[from]];
  return copy;
}

export function planDuration(items: PlanItem[], tracks: Track[]): number {
  return totalDuration(buildTimeline(items, tracks));
}

/* ---------- auto build ---------- */

export type TemplateId = 'hills' | 'intervals' | 'endurance' | 'mixed';

export interface ClassTemplate {
  id: TemplateId;
  name: string;
  blurb: string;
  opening: SegmentType[];
  cycle: SegmentType[];
  closing: SegmentType[];
}

export const CLASS_TEMPLATES: Record<TemplateId, ClassTemplate> = {
  hills: {
    id: 'hills',
    name: 'Hills',
    blurb: 'Climbs with flat recovery between',
    opening: ['warmup', 'flat'],
    cycle: ['climb', 'flat'],
    closing: ['cooldown'],
  },
  intervals: {
    id: 'intervals',
    name: 'Intervals',
    blurb: 'Push and recover blocks with sprints',
    opening: ['warmup', 'flat'],
    cycle: ['intervals', 'sprint'],
    closing: ['cooldown'],
  },
  endurance: {
    id: 'endurance',
    name: 'Endurance',
    blurb: 'Long steady work, gentle variety',
    opening: ['warmup'],
    cycle: ['endurance', 'flat'],
    closing: ['cooldown'],
  },
  mixed: {
    id: 'mixed',
    name: 'Mixed ride',
    blurb: 'A bit of everything',
    opening: ['warmup', 'flat'],
    cycle: ['climb', 'intervals', 'flat', 'sprint'],
    closing: ['cooldown'],
  },
};

export const TEMPLATE_IDS: TemplateId[] = ['hills', 'intervals', 'endurance', 'mixed'];

/** Typical song length used to estimate how many segments fit a class. */
export const AVG_SEGMENT_SEC = 240;

export function buildSegmentTypes(template: ClassTemplate, count: number): SegmentType[] {
  const fixed = template.opening.length + template.closing.length;
  const middle = Math.max(1, count - fixed);
  const types: SegmentType[] = [...template.opening];
  for (let i = 0; i < middle; i++) types.push(template.cycle[i % template.cycle.length]);
  types.push(...template.closing);
  return types;
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTrack(
  tracks: Track[],
  type: SegmentType,
  used: Set<string>,
  previousId: string | null,
  rng: () => number,
): Track {
  const ranked = rankTracks(tracks, type);
  const fresh = ranked.filter((r) => !used.has(r.track.id));
  const notPrevious = ranked.filter((r) => r.track.id !== previousId);
  const pool = fresh.length > 0 ? fresh : notPrevious.length > 0 ? notPrevious : ranked;
  const best = pool[0].score;
  const top = pool.filter((r) => best - r.score <= 0.08);
  return top[Math.floor(rng() * top.length)].track;
}

export interface AutoBuildOptions {
  seed?: number;
  newId: () => string;
}

/**
 * Fill a class from a template. Picks the best cadence and energy match for each
 * segment, avoids repeats, and chooses the segment count that lands nearest the
 * wanted length.
 */
export function autoBuildClass(
  tracks: Track[],
  templateId: TemplateId,
  targetMinutes: number,
  options: AutoBuildOptions,
): PlanItem[] {
  if (tracks.length === 0) return [];
  const template = CLASS_TEMPLATES[templateId];
  const minCount = template.opening.length + template.closing.length + 1;
  const base = Math.max(minCount, Math.round((targetMinutes * 60) / AVG_SEGMENT_SEC));
  const seed = options.seed ?? 1;
  const targetSec = targetMinutes * 60;

  let best: PlanItem[] = [];
  let bestDiff = Infinity;
  for (const count of [base - 1, base, base + 1]) {
    if (count < minCount) continue;
    const rng = mulberry32(seed);
    const used = new Set<string>();
    let previousId: string | null = null;
    const items: PlanItem[] = [];
    let total = 0;
    for (const type of buildSegmentTypes(template, count)) {
      const track = pickTrack(tracks, type, used, previousId, rng);
      used.add(track.id);
      previousId = track.id;
      items.push({ id: options.newId(), trackId: track.id, type });
      total += track.duration;
    }
    const diff = Math.abs(total - targetSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = items;
    }
  }
  return best;
}
