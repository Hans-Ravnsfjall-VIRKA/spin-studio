import { describe, expect, it } from 'vitest';
import {
  RESISTANCE_LEVELS,
  RESISTANCE_ZONES,
  clampResistance,
  resistanceColor,
  resistanceGradient,
  resistanceName,
  resistancePercent,
  resistanceZone,
  zoneRangeLabel,
} from './resistanceModel';

describe('resistanceModel', () => {
  it('clamps and rounds levels', () => {
    expect(clampResistance(0)).toBe(1);
    expect(clampResistance(11)).toBe(10);
    expect(clampResistance(4.6)).toBe(5);
    expect(clampResistance(Number.NaN)).toBe(1);
  });

  it('covers every level with exactly one zone, in order', () => {
    for (const l of RESISTANCE_LEVELS) {
      expect(RESISTANCE_ZONES.filter((z) => l >= z.from && l <= z.to)).toHaveLength(1);
    }
    expect(RESISTANCE_ZONES.map((z) => z.id)).toEqual(['white', 'blue', 'green', 'yellow', 'red']);
  });

  it('puts the levels in the agreed zones', () => {
    expect(resistanceZone(1).id).toBe('white');
    expect([2, 3].map((l) => resistanceZone(l).id)).toEqual(['blue', 'blue']);
    expect([4, 5].map((l) => resistanceZone(l).id)).toEqual(['green', 'green']);
    expect([6, 7].map((l) => resistanceZone(l).id)).toEqual(['yellow', 'yellow']);
    expect([8, 9, 10].map((l) => resistanceZone(l).id)).toEqual(['red', 'red', 'red']);
    expect(resistanceName(1)).toBe('White');
    expect(resistanceName(10)).toBe('Red');
    expect(resistanceName(99)).toBe('Red');
  });

  it('labels zone ranges', () => {
    expect(zoneRangeLabel(RESISTANCE_ZONES[0])).toBe('1');
    expect(zoneRangeLabel(RESISTANCE_ZONES[4])).toBe('8 to 10');
  });

  it('colors level 1 white and the top level red', () => {
    expect(resistanceColor(1)).toBe('hsl(0 0% 96%)');
    expect(resistanceColor(2)).toBe('hsl(215 85% 68%)');
    expect(resistanceColor(10)).toBe('hsl(0 85% 50%)');
  });

  it('keeps one hue per zone and deepens inside a zone', () => {
    expect(resistanceColor(8)).toBe('hsl(0 85% 66%)');
    expect(resistanceColor(9)).toBe('hsl(0 85% 58%)');
    expect(resistanceColor(4)).toContain('hsl(140 65%');
    expect(resistanceColor(7)).toContain('hsl(50 95%');
  });

  it('shifts lightness and keeps it in range', () => {
    expect(resistanceColor(2, 10)).toBe('hsl(215 85% 78%)');
    expect(resistanceColor(1, 20)).toBe('hsl(0 0% 100%)');
    expect(resistanceColor(10, -80)).toBe('hsl(0 85% 0%)');
  });

  it('places markers over the middle of their slot', () => {
    expect(resistancePercent(1)).toBe(5);
    expect(resistancePercent(10)).toBe(95);
  });

  it('builds one band per level', () => {
    const g = resistanceGradient();
    expect(g.startsWith('linear-gradient(to right, hsl(0 0% 96%) 0% 10%')).toBe(true);
    expect(g.match(/hsl\(/g)).toHaveLength(10);
    expect(g.endsWith('90% 100%)')).toBe(true);
  });
});
