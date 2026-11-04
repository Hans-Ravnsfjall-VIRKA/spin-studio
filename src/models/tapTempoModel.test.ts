import { describe, expect, it } from 'vitest';
import { TAP_MAX, addTap, bpmFromTaps } from './tapTempoModel';

const tapsAt = (bpm: number, count: number, start = 0) =>
  Array.from({ length: count }, (_, i) => start + (i * 60000) / bpm);

describe('tapTempoModel', () => {
  it('needs four taps', () => {
    expect(bpmFromTaps([])).toBeNull();
    expect(bpmFromTaps(tapsAt(120, 3))).toBeNull();
    expect(bpmFromTaps(tapsAt(120, 4))).toBe(120);
  });

  it('measures steady tempos', () => {
    expect(bpmFromTaps(tapsAt(96, 8))).toBe(96);
    expect(bpmFromTaps(tapsAt(128.5, 10))).toBeCloseTo(128.5, 1);
  });

  it('averages out slightly uneven taps', () => {
    const base = tapsAt(100, 9);
    const wobble = base.map((t, i) => t + (i % 2 === 0 ? 15 : -15));
    expect(Math.abs((bpmFromTaps(wobble) as number) - 100)).toBeLessThan(3);
  });

  it('rejects tempos outside 40 to 220', () => {
    expect(bpmFromTaps([0, 100, 200, 300])).toBeNull();
    expect(bpmFromTaps([0, 3000, 6000, 9000])).toBeNull();
  });

  it('restarts after a pause or a clock that went backwards', () => {
    let taps = addTap([], 0);
    taps = addTap(taps, 500);
    expect(taps).toEqual([0, 500]);
    expect(addTap(taps, 5000)).toEqual([5000]);
    expect(addTap(taps, 100)).toEqual([100]);
  });

  it('keeps only the latest taps', () => {
    let taps: number[] = [];
    for (let i = 0; i < 40; i++) taps = addTap(taps, i * 500);
    expect(taps).toHaveLength(TAP_MAX);
    expect(taps[taps.length - 1]).toBe(39 * 500);
    expect(bpmFromTaps(taps)).toBe(120);
  });
});
