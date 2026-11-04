import { describe, expect, it } from 'vitest';
import {
  clampResistance,
  resistanceColor,
  resistanceGradient,
  resistanceHue,
  resistanceName,
  resistancePercent,
} from './resistanceModel';

describe('resistanceModel', () => {
  it('clamps and rounds levels', () => {
    expect(clampResistance(0)).toBe(1);
    expect(clampResistance(11)).toBe(10);
    expect(clampResistance(4.6)).toBe(5);
    expect(clampResistance(Number.NaN)).toBe(1);
  });

  it('runs from blue to red', () => {
    expect(resistanceHue(1)).toBe(220);
    expect(resistanceHue(10)).toBe(0);
    expect(resistanceName(1)).toBe('Blue');
    expect(resistanceName(10)).toBe('Red');
  });

  it('hue never increases as resistance rises', () => {
    for (let l = 2; l <= 10; l++) {
      expect(resistanceHue(l)).toBeLessThan(resistanceHue(l - 1));
    }
  });

  it('builds colors and gradient', () => {
    expect(resistanceColor(1)).toBe('hsl(220 85% 55%)');
    expect(resistanceGradient()).toContain('linear-gradient(to right');
    expect(resistancePercent(1)).toBe(0);
    expect(resistancePercent(10)).toBe(100);
  });
});
