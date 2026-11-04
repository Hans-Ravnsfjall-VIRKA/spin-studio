import { describe, expect, it } from 'vitest';
import { BUILTIN_TRACKS } from '../data/builtinTracks';
import {
  CLASS_TEMPLATES,
  TEMPLATE_IDS,
  addItem,
  autoBuildClass,
  buildSegmentTypes,
  buildTimeline,
  matchTrack,
  moveItem,
  mulberry32,
  pedalPhaseAt,
  planDuration,
  rankTracks,
  removeItem,
  stateAt,
  totalDuration,
  updateItem,
  type PlanItem,
} from './classPlanModel';
import type { Track } from './trackModel';

function counter() {
  let n = 0;
  return () => `id${++n}`;
}

const track = (id: string, bpm: number, energy = 3, duration = 200, beatOffset = 0): Track => ({
  id,
  title: id,
  artist: 'x',
  bpm,
  duration,
  beatOffset,
  energy,
  source: 'synth',
});

describe('matching', () => {
  it('prefers songs whose cadence fits the segment', () => {
    const tracks = [track('slow', 70, 1), track('mid', 100, 2), track('fast', 140, 3)];
    expect(rankTracks(tracks, 'climb')[0].track.id).toBe('fast');
    expect(rankTracks(tracks, 'flat')[0].track.id).toBe('mid');
    expect(rankTracks(tracks, 'cooldown')[0].track.id).toBe('slow');
  });

  it('reports half time for climbs', () => {
    const m = matchTrack(track('fast', 140, 4), 'climb');
    expect(m.cadence).toBe(70);
    expect(m.pedalFactor).toBe(0.5);
    expect(m.cadenceInRange).toBe(true);
    expect(m.score).toBeGreaterThan(0.9);
  });

  it('keeps scores between 0 and 1', () => {
    for (const t of BUILTIN_TRACKS) {
      for (const type of ['warmup', 'climb', 'sprint', 'cooldown'] as const) {
        const s = matchTrack(t, type).score;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('timeline and state', () => {
  const tracks = [track('a', 90, 1, 100), track('b', 140, 4, 120)];
  const items: PlanItem[] = [
    { id: 'i1', trackId: 'a', type: 'warmup' },
    { id: 'i2', trackId: 'b', type: 'climb' },
  ];
  const tl = buildTimeline(items, tracks);

  it('lays entries end to end with absolute cues', () => {
    expect(tl).toHaveLength(2);
    expect(tl[0].start).toBe(0);
    expect(tl[0].end).toBe(100);
    expect(tl[1].start).toBe(100);
    expect(tl[1].end).toBe(220);
    expect(totalDuration(tl)).toBe(220);
    expect(tl[1].cues[0].start).toBe(100);
    expect(tl[1].cues[tl[1].cues.length - 1].end).toBe(220);
  });

  it('skips items whose track is missing', () => {
    const t2 = buildTimeline([...items, { id: 'x', trackId: 'gone', type: 'flat' }], tracks);
    expect(t2).toHaveLength(2);
    expect(planDuration(items, tracks)).toBe(220);
  });

  it('reads the state at a time', () => {
    const s = stateAt(tl, 10);
    expect(s.finished).toBe(false);
    expect(s.entryIndex).toBe(0);
    expect(s.cue?.start).toBe(0);
    expect(s.entryElapsed).toBe(10);
    expect(s.entryRemaining).toBe(90);
    expect(s.nextEntry?.item.id).toBe('i2');
    expect(s.nextCue).not.toBeNull();
  });

  it('crosses into the next segment and next cue', () => {
    const s = stateAt(tl, 100);
    expect(s.entryIndex).toBe(1);
    expect(s.cueIndex).toBe(0);
    expect(s.cue?.label).toBe('Start climbing');
    expect(s.nextEntry).toBeNull();
    expect(s.nextCue?.start).toBe(tl[1].cues[0].end);
  });

  it('finishes at and past the end, and handles empty timelines', () => {
    expect(stateAt(tl, 220).finished).toBe(true);
    expect(stateAt(tl, 999).elapsed).toBe(220);
    expect(stateAt(tl, -5).entryIndex).toBe(0);
    const empty = stateAt([], 3);
    expect(empty.finished).toBe(true);
    expect(empty.entry).toBeNull();
  });

  it('computes pedal phase on the beat', () => {
    const e = buildTimeline([{ id: 'p', trackId: 'q', type: 'flat' }], [track('q', 120, 2, 100, 0.25)])[0];
    expect(pedalPhaseAt(e, 0.25)).toBeCloseTo(0, 6);
    expect(pedalPhaseAt(e, 0.5)).toBeCloseTo(0.5, 6);
    expect(pedalPhaseAt(e, 0.75)).toBeCloseTo(0, 6);
    expect(pedalPhaseAt(e, 0)).toBeGreaterThanOrEqual(0);
    expect(pedalPhaseAt(e, 0)).toBeLessThan(1);
    const half = buildTimeline([{ id: 'p', trackId: 'q', type: 'climb' }], [track('q', 140, 4, 100)])[0];
    expect(half.pedalFactor).toBe(0.5);
    const period = 60 / 140 / 0.5;
    expect(pedalPhaseAt(half, period)).toBeCloseTo(0, 6);
    expect(pedalPhaseAt(half, period / 2)).toBeCloseTo(0.5, 6);
  });
});

describe('editing helpers', () => {
  const a: PlanItem = { id: 'a', trackId: 't1', type: 'flat' };
  const b: PlanItem = { id: 'b', trackId: 't2', type: 'climb' };
  const c: PlanItem = { id: 'c', trackId: 't3', type: 'sprint' };

  it('adds, removes and updates without mutating', () => {
    const base = [a, b];
    expect(addItem(base, c).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(addItem(base, c, 1).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(addItem(base, c, 99).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(removeItem(base, 'a').map((i) => i.id)).toEqual(['b']);
    expect(updateItem(base, 'b', { type: 'sprint' })[1].type).toBe('sprint');
    expect(base[1].type).toBe('climb');
  });

  it('moves items and ignores edges', () => {
    expect(moveItem([a, b, c], 'b', -1).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(moveItem([a, b, c], 'b', 1).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    const same = [a, b, c];
    expect(moveItem(same, 'a', -1)).toBe(same);
    expect(moveItem(same, 'c', 1)).toBe(same);
    expect(moveItem(same, 'zzz', 1)).toBe(same);
  });
});

describe('auto build', () => {
  it('builds segment types from a template', () => {
    const types = buildSegmentTypes(CLASS_TEMPLATES.hills, 7);
    expect(types).toHaveLength(7);
    expect(types[0]).toBe('warmup');
    expect(types[types.length - 1]).toBe('cooldown');
    expect(types.slice(2, 6)).toEqual(['climb', 'flat', 'climb', 'flat']);
    expect(buildSegmentTypes(CLASS_TEMPLATES.hills, 1)).toHaveLength(4);
  });

  it('is deterministic for a seed', () => {
    const a = autoBuildClass(BUILTIN_TRACKS, 'mixed', 45, { seed: 7, newId: counter() });
    const b = autoBuildClass(BUILTIN_TRACKS, 'mixed', 45, { seed: 7, newId: counter() });
    expect(a.map((i) => [i.trackId, i.type])).toEqual(b.map((i) => [i.trackId, i.type]));
    const r = mulberry32(5);
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('opens with a warm up, closes with a cool down and lands near the length', () => {
    for (const id of TEMPLATE_IDS) {
      for (const minutes of [30, 45, 60]) {
        const items = autoBuildClass(BUILTIN_TRACKS, id, minutes, { seed: 3, newId: counter() });
        expect(items[0].type).toBe('warmup');
        expect(items[items.length - 1].type).toBe('cooldown');
        const total = planDuration(items, BUILTIN_TRACKS);
        expect(Math.abs(total - minutes * 60)).toBeLessThan(minutes * 60 * 0.15);
      }
    }
  });

  it('matches cadence for every segment with the built in library', () => {
    for (const id of TEMPLATE_IDS) {
      const items = autoBuildClass(BUILTIN_TRACKS, id, 45, { seed: 11, newId: counter() });
      const tl = buildTimeline(items, BUILTIN_TRACKS);
      for (const e of tl) expect(e.cadenceInRange).toBe(true);
    }
  });

  it('avoids repeating a song while fresh ones remain', () => {
    const items = autoBuildClass(BUILTIN_TRACKS, 'mixed', 30, { seed: 2, newId: counter() });
    const ids = items.map((i) => i.trackId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('copes with a tiny library and an empty one', () => {
    const one = [track('only', 100)];
    const items = autoBuildClass(one, 'hills', 30, { seed: 1, newId: counter() });
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) {
      expect(items[i].trackId).toBe('only');
    }
    expect(autoBuildClass([], 'hills', 30, { newId: counter() })).toEqual([]);
  });
});
