import type { CadenceRange } from './cadenceModel';
import { clampResistance } from './resistanceModel';

export type SegmentType =
  | 'warmup'
  | 'endurance'
  | 'flat'
  | 'climb'
  | 'intervals'
  | 'sprint'
  | 'cooldown';

export const SEGMENT_TYPES: SegmentType[] = [
  'warmup',
  'endurance',
  'flat',
  'climb',
  'intervals',
  'sprint',
  'cooldown',
];

export interface SegmentSpec {
  type: SegmentType;
  label: string;
  blurb: string;
  cadence: CadenceRange;
  /** Wanted song energy, 1 to 5. */
  energy: number;
  /** Resistance span on the 1 to 10 scale (white, blue, green, yellow, red). */
  resistance: { low: number; high: number };
}

export const SEGMENT_SPECS: Record<SegmentType, SegmentSpec> = {
  warmup: {
    type: 'warmup',
    label: 'Warm up',
    blurb: 'Easy spin, settle in',
    cadence: { min: 70, max: 90 },
    energy: 1,
    resistance: { low: 2, high: 4 },
  },
  endurance: {
    type: 'endurance',
    label: 'Endurance',
    blurb: 'Steady seated effort',
    cadence: { min: 80, max: 95 },
    energy: 3,
    resistance: { low: 5, high: 5 },
  },
  flat: {
    type: 'flat',
    label: 'Flat road',
    blurb: 'Seated, smooth and quick',
    cadence: { min: 85, max: 100 },
    energy: 2,
    resistance: { low: 4, high: 5 },
  },
  climb: {
    type: 'climb',
    label: 'Climb',
    blurb: 'Heavy and slow, keep adding resistance',
    cadence: { min: 60, max: 75 },
    energy: 4,
    resistance: { low: 5, high: 9 },
  },
  intervals: {
    type: 'intervals',
    label: 'Intervals',
    blurb: 'Push, then recover, on the bar',
    cadence: { min: 85, max: 110 },
    energy: 4,
    resistance: { low: 3, high: 7 },
  },
  sprint: {
    type: 'sprint',
    label: 'Sprint',
    blurb: 'Short fast bursts',
    cadence: { min: 100, max: 120 },
    energy: 5,
    resistance: { low: 3, high: 5 },
  },
  cooldown: {
    type: 'cooldown',
    label: 'Cool down',
    blurb: 'Ease off and breathe',
    cadence: { min: 60, max: 80 },
    energy: 1,
    resistance: { low: 1, high: 4 },
  },
};

/** One resistance instruction, timed in seconds. */
export interface Cue {
  start: number;
  end: number;
  resistance: number;
  label: string;
}

/** Block length in bars (4 beats per bar). Cues change on bar boundaries of the song. */
const BLOCK_BARS: Record<SegmentType, number> = {
  warmup: 8,
  endurance: 16,
  flat: 16,
  climb: 8,
  intervals: 8,
  sprint: 4,
  cooldown: 8,
};

export function blockSeconds(type: SegmentType, bpm: number): number {
  return (BLOCK_BARS[type] * 4 * 60) / bpm;
}

function ramp(from: number, to: number, i: number, n: number): number {
  if (n <= 1) return Math.round((from + to) / 2);
  return Math.round(from + ((to - from) * i) / (n - 1));
}

function resistanceFor(type: SegmentType, i: number, n: number): number {
  const { low, high } = SEGMENT_SPECS[type].resistance;
  switch (type) {
    case 'warmup':
    case 'climb':
      return ramp(low, high, i, n);
    case 'cooldown':
      return ramp(high, low, i, n);
    case 'endurance':
      return low;
    case 'flat':
    case 'intervals':
    case 'sprint':
      return i % 2 === 0 ? low : high;
  }
}

function labelFor(type: SegmentType, i: number, n: number, resistance: number, prev: number | null): string {
  switch (type) {
    case 'warmup':
      return i === 0 ? 'Easy spin' : 'Add a little';
    case 'endurance':
      return 'Steady';
    case 'flat':
      return 'Flat road';
    case 'climb':
      if (i === 0) return 'Start climbing';
      if (i === n - 1 && n > 1) return 'Summit push';
      return prev !== null && resistance > prev ? 'Add resistance' : 'Hold the climb';
    case 'intervals':
      return resistance === SEGMENT_SPECS.intervals.resistance.high ? 'Push' : 'Recover';
    case 'sprint':
      return resistance === SEGMENT_SPECS.sprint.resistance.high ? 'Sprint' : 'Recover';
    case 'cooldown':
      return i === n - 1 ? 'Easy' : 'Ease off';
  }
}

/**
 * Build the resistance cues for one song. Cues are contiguous from 0 to
 * durationSec and every boundary after the first falls on a bar of the song,
 * so resistance changes land on the music.
 */
export function buildCues(
  type: SegmentType,
  durationSec: number,
  bpm: number,
  beatOffset = 0,
): Cue[] {
  if (durationSec <= 0) return [];
  const len = blockSeconds(type, bpm);
  const offset = Math.max(0, Math.min(beatOffset, len - 0.001));
  const edges = [0];
  let t = offset + len;
  while (t < durationSec - len * 0.5) {
    edges.push(t);
    t += len;
  }
  edges.push(durationSec);

  const n = edges.length - 1;
  const cues: Cue[] = [];
  let prev: number | null = null;
  for (let i = 0; i < n; i++) {
    const resistance = clampResistance(resistanceFor(type, i, n));
    cues.push({
      start: edges[i],
      end: edges[i + 1],
      resistance,
      label: labelFor(type, i, n, resistance, prev),
    });
    prev = resistance;
  }
  return cues;
}

export function resistanceSpan(cues: Cue[]): { low: number; high: number } {
  if (cues.length === 0) return { low: 1, high: 1 };
  let low = Infinity;
  let high = -Infinity;
  for (const c of cues) {
    low = Math.min(low, c.resistance);
    high = Math.max(high, c.resistance);
  }
  return { low, high };
}
