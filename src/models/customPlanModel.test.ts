import { describe, expect, it } from 'vitest';
import { buildTimeline, pedalPhaseAt, stateAt, type PlanItem } from './classPlanModel';
import { ZONE_LEVEL, customCuesToCues, customDuration, type CustomSegment } from './customPlanModel';
import type { Track } from './trackModel';

const track = (id: string, duration: number): Track => ({
  id,
  title: id,
  artist: 'x',
  bpm: 100,
  duration,
  beatOffset: 0,
  energy: 3,
  source: 'spotify',
  spotifyUri: `spotify:track:${id}`,
  bpmKnown: false,
});

describe('customCuesToCues', () => {
  it('makes contiguous cues from 0 to the song length', () => {
    const cues = customCuesToCues(
      [
        { at: 0, zone: 'blue', label: 'a' },
        { at: 39, zone: 'green', label: 'b' },
        { at: 65, zone: 'blue', label: 'c' },
      ],
      193,
    );
    expect(cues.map((c) => [c.start, c.end, c.zone, c.label])).toEqual([
      [0, 39, 'blue', 'a'],
      [39, 65, 'green', 'b'],
      [65, 193, 'blue', 'c'],
    ]);
    expect(cues[0].resistance).toBe(ZONE_LEVEL.blue);
    expect(cues[1].resistance).toBe(ZONE_LEVEL.green);
  });

  it('starts at zero even when the first cue is later, and sorts input', () => {
    const cues = customCuesToCues(
      [
        { at: 50, zone: 'red', label: 'late' },
        { at: 5, zone: 'white', label: 'early' },
      ],
      100,
    );
    expect(cues.map((c) => [c.start, c.end, c.label])).toEqual([
      [0, 50, 'early'],
      [50, 100, 'late'],
    ]);
  });

  it('drops cues past the end and falls back to white when none are left', () => {
    expect(customCuesToCues([{ at: 500, zone: 'red', label: 'x' }], 100)).toEqual([
      { start: 0, end: 100, resistance: 1, zone: 'white', label: '' },
    ]);
    expect(customCuesToCues([], 100)).toHaveLength(1);
    expect(customCuesToCues([], 0)).toEqual([]);
  });

  it('skips cues that start at the same moment', () => {
    const cues = customCuesToCues(
      [
        { at: 0, zone: 'blue', label: 'a' },
        { at: 30, zone: 'green', label: 'dup' },
        { at: 30, zone: 'yellow', label: 'b' },
      ],
      60,
    );
    expect(cues.map((c) => c.label)).toEqual(['a', 'b']);
    expect(cues[0].end).toBe(30);
    expect(cues[1].start).toBe(30);
  });
});

describe('custom segments in a timeline', () => {
  const custom: CustomSegment = {
    rpm: 75,
    cues: [
      { at: 0, zone: 'blue', label: 'sit' },
      { at: 39, zone: 'green', label: 'stand' },
    ],
  };
  const item: PlanItem = { id: 'i1', trackId: 't1', type: 'endurance', custom };

  it('takes RPM from the plan and ignores the song tempo', () => {
    const tl = buildTimeline([item], [track('t1', 193)]);
    expect(tl[0].cadence).toBe(75);
    expect(tl[0].pedalFactor).toBe(1);
    expect(tl[0].cadenceInRange).toBe(true);
    expect(tl[0].duration).toBe(193);
    expect(tl[0].cues.map((c) => c.zone)).toEqual(['blue', 'green']);
  });

  it('places cues on the class clock after earlier songs', () => {
    const tl = buildTimeline(
      [
        { id: 'a', trackId: 't0', type: 'flat' },
        { ...item, id: 'b' },
      ],
      [track('t0', 100), track('t1', 193)],
    );
    expect(tl[1].start).toBe(100);
    expect(tl[1].cues[1].start).toBe(139);
    const s = stateAt(tl, 150);
    expect(s.cue?.label).toBe('stand');
    expect(s.cue?.zone).toBe('green');
  });

  it('plays only part of a song when asked', () => {
    const part: PlanItem = { ...item, custom: { ...custom, playSeconds: 120 } };
    expect(customDuration(250, { cues: [], playSeconds: 120 })).toBe(120);
    expect(customDuration(90, { cues: [], playSeconds: 120 })).toBe(90);
    expect(customDuration(250, { cues: [] })).toBe(250);
    const tl = buildTimeline([part], [track('t1', 250)]);
    expect(tl[0].end).toBe(120);
    expect(tl[0].cues[tl[0].cues.length - 1].end).toBe(120);
  });

  it('pulses at the plan RPM, not the song beat', () => {
    const tl = buildTimeline([item], [track('t1', 193)]);
    const period = 60 / 75;
    expect(pedalPhaseAt(tl[0], 0)).toBeCloseTo(0, 6);
    expect(pedalPhaseAt(tl[0], period / 2)).toBeCloseTo(0.5, 6);
    expect(pedalPhaseAt(tl[0], period)).toBeCloseTo(0, 6);
  });

  it('reports no cadence for songs without an RPM', () => {
    const none = buildTimeline([{ ...item, custom: { cues: custom.cues } }], [track('t1', 100)]);
    expect(none[0].cadence).toBe(0);
  });
});
