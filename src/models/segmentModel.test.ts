import { describe, expect, it } from 'vitest';
import {
  SEGMENT_TYPES,
  blockSeconds,
  buildCues,
  resistanceSpan,
} from './segmentModel';

describe('segmentModel', () => {
  it('covers the whole song with contiguous cues for every type', () => {
    for (const type of SEGMENT_TYPES) {
      const cues = buildCues(type, 240, 120);
      expect(cues.length).toBeGreaterThan(0);
      expect(cues[0].start).toBe(0);
      expect(cues[cues.length - 1].end).toBe(240);
      for (let i = 1; i < cues.length; i++) {
        expect(cues[i].start).toBeCloseTo(cues[i - 1].end, 9);
      }
      for (const c of cues) {
        expect(c.resistance).toBeGreaterThanOrEqual(1);
        expect(c.resistance).toBeLessThanOrEqual(10);
        expect(c.end).toBeGreaterThan(c.start);
      }
    }
  });

  it('places inner boundaries on whole blocks of bars', () => {
    const len = blockSeconds('climb', 140);
    const cues = buildCues('climb', 240, 140);
    expect(cues[0].end).toBeCloseTo(len, 9);
    expect(cues[1].end).toBeCloseTo(len * 2, 9);
  });

  it('shifts boundaries by the beat offset', () => {
    const len = blockSeconds('climb', 140);
    const cues = buildCues('climb', 240, 140, 0.3);
    expect(cues[0].end).toBeCloseTo(len + 0.3, 9);
  });

  it('climbs ramp up without dropping', () => {
    const cues = buildCues('climb', 240, 136);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].resistance).toBeGreaterThanOrEqual(cues[i - 1].resistance);
    }
    expect(cues[0].resistance).toBe(5);
    expect(cues[cues.length - 1].resistance).toBe(9);
  });

  it('cool downs ramp down to the lightest level', () => {
    const cues = buildCues('cooldown', 240, 72);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].resistance).toBeLessThanOrEqual(cues[i - 1].resistance);
    }
    expect(cues[cues.length - 1].resistance).toBe(1);
  });

  it('intervals alternate recover and push', () => {
    const cues = buildCues('intervals', 240, 108);
    expect(cues[0].label).toBe('Recover');
    expect(cues[1].label).toBe('Push');
    expect(cues[1].resistance).toBeGreaterThan(cues[0].resistance);
    for (let i = 2; i < cues.length; i++) {
      expect(cues[i].resistance).toBe(cues[i - 2].resistance);
    }
  });

  it('handles very short songs with a single cue', () => {
    const cues = buildCues('endurance', 5, 90);
    expect(cues).toHaveLength(1);
    expect(cues[0].end).toBe(5);
  });

  it('returns nothing for zero length and reports spans', () => {
    expect(buildCues('flat', 0, 100)).toEqual([]);
    expect(resistanceSpan(buildCues('climb', 240, 136))).toEqual({ low: 5, high: 9 });
    expect(resistanceSpan([])).toEqual({ low: 1, high: 1 });
  });
});
