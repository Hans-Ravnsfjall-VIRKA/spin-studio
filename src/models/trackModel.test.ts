import { describe, expect, it } from 'vitest';
import {
  clampBpm,
  clampEnergy,
  phraseBars,
  synthDuration,
  titleFromFileName,
  trackFromAnalysis,
} from './trackModel';

describe('trackModel', () => {
  it('clamps bpm and energy', () => {
    expect(clampBpm(10)).toBe(40);
    expect(clampBpm(500)).toBe(220);
    expect(clampBpm(120.04)).toBe(120);
    expect(clampBpm(Number.NaN)).toBe(120);
    expect(clampEnergy(0)).toBe(1);
    expect(clampEnergy(9)).toBe(5);
    expect(clampEnergy(Number.NaN)).toBe(3);
  });

  it('computes whole phrases and duration', () => {
    expect(phraseBars(100, 4)).toBe(104);
    expect(phraseBars(60, 0.1)).toBe(8);
    const bars = phraseBars(120, 4);
    expect(bars % 8).toBe(0);
    expect(synthDuration(bars, 120)).toBeCloseTo((bars * 240) / 120, 9);
    expect(Math.abs(synthDuration(bars, 120) - 240)).toBeLessThan(10);
  });

  it('cleans file names into titles', () => {
    expect(titleFromFileName('Great_Song  Name.mp3')).toBe('Great Song Name');
    expect(titleFromFileName('.mp3')).toBe('Untitled');
    expect(titleFromFileName('a.b.c.wav')).toBe('a.b.c');
  });

  it('builds a file track from analysis', () => {
    const t = trackFromAnalysis({
      id: 'x',
      fileName: 'Ride_On.m4a',
      duration: 200,
      bpm: 128.04,
      beatOffset: -1,
    });
    expect(t.source).toBe('file');
    expect(t.title).toBe('Ride On');
    expect(t.bpm).toBe(128);
    expect(t.beatOffset).toBe(0);
    expect(t.energy).toBe(3);
    expect(t.credit).toBeUndefined();
  });

  it('keeps title, artist and credit from an online source', () => {
    const credit = {
      provider: 'jamendo' as const,
      creator: 'Some Artist',
      license: 'CC BY 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
      sourceUrl: 'https://www.jamendo.com/track/1',
    };
    const t = trackFromAnalysis({
      id: 'y',
      fileName: 'online-1.mp3',
      duration: 210,
      bpm: 126,
      beatOffset: 0.1,
      title: ' Night Drive ',
      artist: 'Some Artist',
      credit,
    });
    expect(t.title).toBe('Night Drive');
    expect(t.artist).toBe('Some Artist');
    expect(t.credit).toEqual(credit);
  });
});
