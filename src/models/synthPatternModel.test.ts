import { describe, expect, it } from 'vitest';
import { STEPS_PER_BAR, midiToFreq, stepDuration, stepEvents } from './synthPatternModel';

describe('synthPatternModel', () => {
  it('converts midi to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(57)).toBeCloseTo(220, 6);
  });

  it('computes a sixteenth step', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125, 9);
  });

  it('puts a kick on every beat at every energy', () => {
    for (let energy = 1; energy <= 5; energy++) {
      for (let step = 0; step < STEPS_PER_BAR * 8; step++) {
        const ev = stepEvents(step, 45, energy);
        expect(ev.drums.includes('kick')).toBe(step % 4 === 0);
      }
    }
  });

  it('flags the first step of each bar', () => {
    expect(stepEvents(0, 45, 3).accent).toBe(true);
    expect(stepEvents(16, 45, 3).accent).toBe(true);
    expect(stepEvents(5, 45, 3).accent).toBe(false);
  });

  it('is deterministic', () => {
    expect(stepEvents(37, 45, 4)).toEqual(stepEvents(37, 45, 4));
  });

  it('adds more events at higher energy', () => {
    const count = (energy: number) => {
      let n = 0;
      for (let step = 0; step < STEPS_PER_BAR * 4; step++) {
        const ev = stepEvents(step, 45, energy);
        n += ev.drums.length + (ev.bass !== null ? 1 : 0) + (ev.lead !== null ? 1 : 0);
      }
      return n;
    };
    expect(count(1)).toBeLessThan(count(2));
    expect(count(2)).toBeLessThan(count(3));
    expect(count(3)).toBeLessThan(count(5));
  });

  it('puts bass on offbeats and follows the chord loop', () => {
    expect(stepEvents(0, 45, 2).bass).toBeNull();
    expect(stepEvents(2, 45, 2).bass).toBe(45);
    expect(stepEvents(STEPS_PER_BAR + 2, 45, 2).bass).toBe(41);
    expect(stepEvents(STEPS_PER_BAR * 4 + 2, 45, 2).bass).toBe(45);
    expect(stepEvents(6, 45, 3).bass).toBe(57);
  });
});
