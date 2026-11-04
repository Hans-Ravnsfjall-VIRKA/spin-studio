export interface CadenceRange {
  min: number;
  max: number;
}

/** 1 = pedal on every beat, 0.5 = pedal on every second beat (half time). */
export type PedalFactor = 1 | 0.5;

export interface CadencePick {
  cadence: number;
  factor: PedalFactor;
  inRange: boolean;
  distance: number;
}

export function distanceToRange(cadence: number, range: CadenceRange): number {
  if (cadence < range.min) return range.min - cadence;
  if (cadence > range.max) return cadence - range.max;
  return 0;
}

/**
 * A rider can pedal once per beat or once per two beats. Pick whichever lands
 * closest to the wanted cadence range. Ties prefer one pedal stroke per beat.
 */
export function pickCadence(bpm: number, range: CadenceRange): CadencePick {
  const options: { cadence: number; factor: PedalFactor }[] = [
    { cadence: bpm, factor: 1 },
    { cadence: bpm / 2, factor: 0.5 },
  ];
  let best: CadencePick | null = null;
  for (const o of options) {
    const distance = distanceToRange(o.cadence, range);
    const candidate: CadencePick = {
      cadence: Math.round(o.cadence * 10) / 10,
      factor: o.factor,
      inRange: distance === 0,
      distance,
    };
    if (best === null || candidate.distance < best.distance) best = candidate;
  }
  return best as CadencePick;
}

/** 0 to 1. In range scores 0.7 to 1 (center is best), out of range falls off by distance. */
export function cadenceScore(pick: CadencePick, range: CadenceRange): number {
  if (pick.inRange) {
    const center = (range.min + range.max) / 2;
    const half = Math.max(1, (range.max - range.min) / 2);
    const off = Math.min(1, Math.abs(pick.cadence - center) / half);
    return 0.7 + 0.3 * (1 - off);
  }
  return Math.max(0, 0.7 - pick.distance * 0.05);
}
