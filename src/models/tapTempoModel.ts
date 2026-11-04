import { MAX_BPM, MIN_BPM } from './trackModel';

/** A pause longer than this starts a new count. */
export const TAP_RESET_MS = 2000;
export const TAP_MAX = 16;
/** Four taps give three beat gaps, enough for a usable estimate. */
export const TAP_MIN = 4;

/** Adds a tap time (milliseconds). Starts over after a long pause. */
export function addTap(taps: number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const base = last === undefined || now - last > TAP_RESET_MS || now < last ? [] : taps;
  return [...base, now].slice(-TAP_MAX);
}

/** Average tempo over all taps, or null until there are enough taps in a sensible range. */
export function bpmFromTaps(taps: number[]): number | null {
  if (taps.length < TAP_MIN) return null;
  const span = taps[taps.length - 1] - taps[0];
  if (span <= 0) return null;
  const bpm = (60000 * (taps.length - 1)) / span;
  const rounded = Math.round(bpm * 10) / 10;
  return rounded >= MIN_BPM && rounded <= MAX_BPM ? rounded : null;
}
