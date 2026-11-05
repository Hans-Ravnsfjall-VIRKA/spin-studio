import { describe, expect, it } from 'vitest';
import { buildTimeline, changeAhead, holdPointAt, stateAt, type PlanItem } from './classPlanModel';
import type { Track } from './trackModel';

const track = (id: string, duration: number): Track => ({
  id, title: id, artist: 'x', bpm: 100, duration, beatOffset: 0, energy: 3, source: 'spotify', spotifyUri: `spotify:track:${id}`, bpmKnown: false,
});
const plan = (cues: [number, 'blue' | 'green' | 'yellow', string][]): PlanItem => ({
  id: 'p', trackId: 'a', type: 'flat', custom: { rpm: 70, cues: cues.map(([at, zone, label]) => ({ at, zone, label })) },
});

describe('holdPointAt', () => {
  const tl = buildTimeline(
    [{ id: '1', trackId: 'a', type: 'flat' }, { id: '2', trackId: 'b', type: 'flat' }, { id: '3', trackId: 'c', type: 'flat' }],
    [track('a', 100), track('b', 50), track('c', 70)],
  );
  it('is the end of the current song except in the last one', () => {
    expect(holdPointAt(tl, 0)).toBe(100);
    expect(holdPointAt(tl, 99.9)).toBe(100);
    expect(holdPointAt(tl, 100)).toBe(150);
    expect(holdPointAt(tl, 160)).toBeNull();
    expect(holdPointAt([], 0)).toBeNull();
  });
});

describe('changeAhead', () => {
  const tl = buildTimeline(
    [plan([[0, 'blue', 'sit'], [39, 'green', 'stand'], [65, 'green', 'sit']])],
    [track('a', 100)],
  );
  it('reports a zone change inside the window only', () => {
    expect(changeAhead(stateAt(tl, 20), 5)).toBeNull();
    const c = changeAhead(stateAt(tl, 36), 5);
    expect(c?.cue.label).toBe('stand');
    expect(c?.seconds).toBeCloseTo(3, 6);
  });
  it('reports sit and stand instructions in a plan even in the same zone', () => {
    expect(changeAhead(stateAt(tl, 62), 5)?.cue.label).toBe('sit');
  });
  it('ignores same-zone steps in generated cues', () => {
    const gen = buildTimeline([{ id: '1', trackId: 'a', type: 'endurance' }], [{ ...track('a', 200), bpm: 120 }]);
    const s = stateAt(gen, gen[0].cues[0].end - 1);
    expect(changeAhead(s, 5)).toBeNull();
  });
});
