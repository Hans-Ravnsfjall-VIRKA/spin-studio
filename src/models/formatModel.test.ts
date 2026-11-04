import { describe, expect, it } from 'vitest';
import { formatClock, formatPercent } from './formatModel';

describe('formatModel', () => {
  it('formats clock values', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-4)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });

  it('formats percentages', () => {
    expect(formatPercent(0.876)).toBe('88%');
    expect(formatPercent(2)).toBe('100%');
    expect(formatPercent(-1)).toBe('0%');
  });
});
