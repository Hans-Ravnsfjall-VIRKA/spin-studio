import { describe, expect, it } from 'vitest';
import { cadenceScore, distanceToRange, pickCadence } from './cadenceModel';

describe('cadenceModel', () => {
  const climb = { min: 60, max: 75 };
  const flat = { min: 85, max: 100 };

  it('measures distance to a range', () => {
    expect(distanceToRange(70, climb)).toBe(0);
    expect(distanceToRange(50, climb)).toBe(10);
    expect(distanceToRange(80, climb)).toBe(5);
  });

  it('uses half time for fast songs on climbs', () => {
    const p = pickCadence(140, climb);
    expect(p.cadence).toBe(70);
    expect(p.factor).toBe(0.5);
    expect(p.inRange).toBe(true);
  });

  it('uses one stroke per beat when that fits', () => {
    const p = pickCadence(96, flat);
    expect(p.cadence).toBe(96);
    expect(p.factor).toBe(1);
    expect(p.inRange).toBe(true);
  });

  it('flags songs that cannot fit', () => {
    const p = pickCadence(128, flat);
    expect(p.inRange).toBe(false);
    expect(cadenceScore(p, flat)).toBeLessThan(0.7);
  });

  it('scores the center of the range highest', () => {
    const center = cadenceScore(pickCadence(92.5, flat), flat);
    const edge = cadenceScore(pickCadence(85, flat), flat);
    expect(center).toBeGreaterThan(edge);
    expect(center).toBeLessThanOrEqual(1);
    expect(edge).toBeGreaterThanOrEqual(0.7);
  });
});
