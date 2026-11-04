import { describe, expect, it } from 'vitest';
import { detectBpm, foldBpm, mixToMono } from './bpmModel';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Click track: a short decaying 1 kHz burst on every beat, optional noise floor. */
function clickTrack(bpm: number, seconds: number, sampleRate: number, offsetSec = 0, noise = 0) {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const rnd = lcg(42);
  if (noise > 0) {
    for (let i = 0; i < out.length; i++) out[i] = (rnd() * 2 - 1) * noise;
  }
  const period = 60 / bpm;
  const burst = Math.round(0.012 * sampleRate);
  for (let t = offsetSec; t < seconds; t += period) {
    const start = Math.round(t * sampleRate);
    for (let j = 0; j < burst && start + j < out.length; j++) {
      const tt = j / sampleRate;
      out[start + j] += Math.sin(2 * Math.PI * 1000 * tt) * Math.exp(-tt * 300);
    }
  }
  return out;
}

describe('bpmModel', () => {
  const sr = 22050;

  it('detects clean click tracks', () => {
    for (const bpm of [92, 100, 120, 128, 140]) {
      const r = detectBpm(clickTrack(bpm, 30, sr), sr);
      expect(r).not.toBeNull();
      expect(Math.abs((r as { bpm: number }).bpm - bpm)).toBeLessThan(0.6);
      expect((r as { confidence: number }).confidence).toBeGreaterThan(0);
    }
  });

  it('survives a noise floor', () => {
    const r = detectBpm(clickTrack(110, 30, sr, 0, 0.05), sr);
    expect(Math.abs((r as { bpm: number }).bpm - 110)).toBeLessThan(0.8);
  });

  it('folds slow tempos into the working range', () => {
    const r = detectBpm(clickTrack(70, 30, sr), sr);
    expect(Math.abs((r as { bpm: number }).bpm - 140)).toBeLessThan(1);
    expect(foldBpm(70)).toBe(140);
    expect(foldBpm(240)).toBe(120);
    expect(foldBpm(120)).toBe(120);
    expect(foldBpm(-3)).toBe(120);
  });

  it('finds the first beat position', () => {
    const bpm = 120;
    const r = detectBpm(clickTrack(bpm, 30, sr, 0.3), sr) as { offset: number };
    const period = 60 / bpm;
    const diff = Math.abs(r.offset - 0.3);
    expect(Math.min(diff, period - diff)).toBeLessThan(0.06);
    expect(r.offset).toBeGreaterThanOrEqual(0);
    expect(r.offset).toBeLessThan(period);
  });

  it('returns null for very short audio and a safe value for silence', () => {
    expect(detectBpm(new Float32Array(sr), sr)).toBeNull();
    const silent = detectBpm(new Float32Array(sr * 10), sr);
    expect(silent).toEqual({ bpm: 120, offset: 0, confidence: 0 });
  });

  it('mixes channels to mono', () => {
    const a = Float32Array.from([1, 1, 1]);
    const b = Float32Array.from([0, 0.5, -1]);
    expect(Array.from(mixToMono([a, b]))).toEqual([0.5, 0.75, 0]);
    expect(mixToMono([a])).toBe(a);
    expect(mixToMono([])).toHaveLength(0);
  });
});
