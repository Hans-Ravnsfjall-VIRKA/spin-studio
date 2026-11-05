import type { CustomCue } from './customPlanModel';
import type { ZoneId } from './resistanceModel';
import { ZONE_ORDER } from './sectionEditModel';

export type PatternId = 'steady' | 'stepUp' | 'stepDown' | 'pyramid' | 'intervals' | 'sitStand' | 'surge';

export interface PatternInfo {
  id: PatternId;
  name: string;
  blurb: string;
  /** Which settings the pattern uses. */
  uses: { peak: boolean; step: boolean };
}

export const PATTERNS: PatternInfo[] = [
  { id: 'steady', name: 'Steady', blurb: 'One zone all song', uses: { peak: false, step: false } },
  { id: 'stepUp', name: 'Steps up', blurb: 'Climb one zone at a time', uses: { peak: true, step: false } },
  { id: 'stepDown', name: 'Steps down', blurb: 'Start high and ease down a zone at a time', uses: { peak: true, step: false } },
  { id: 'pyramid', name: 'Pyramid', blurb: 'Up to the top and back down', uses: { peak: true, step: false } },
  { id: 'intervals', name: 'Intervals', blurb: 'Base, then hard, repeating', uses: { peak: true, step: true } },
  { id: 'sitStand', name: 'Sit and stand', blurb: 'Alternate in one zone', uses: { peak: false, step: true } },
  { id: 'surge', name: 'Finish strong', blurb: 'Base, then the top zone at the end', uses: { peak: true, step: true } },
];

export interface PatternParams {
  /** Seconds the song plays. */
  duration: number;
  base: ZoneId;
  peak: ZoneId;
  /** Seconds per block for patterns that repeat. */
  stepSec: number;
}

/** Faroese words from the plans: dative of each zone color. */
const DATIVE: Record<ZoneId, string> = {
  white: 'hvítum',
  blue: 'bláum',
  green: 'grønum',
  yellow: 'gulum',
  red: 'reyðum',
};

export function sitLabel(zone: ZoneId): string {
  return `Sita í ${DATIVE[zone]}`;
}
export function standLabel(zone: ZoneId): string {
  return `Standa í ${DATIVE[zone]}`;
}

function zonesBetween(from: ZoneId, to: ZoneId): ZoneId[] {
  const a = ZONE_ORDER.indexOf(from);
  const b = ZONE_ORDER.indexOf(to);
  const out: ZoneId[] = [];
  const dir = a <= b ? 1 : -1;
  for (let i = a; i !== b + dir; i += dir) out.push(ZONE_ORDER[i]);
  return out;
}

/** Splits `duration` into equal whole-second blocks, one per zone. */
function evenBlocks(zones: ZoneId[], duration: number, label: (z: ZoneId, i: number) => string): CustomCue[] {
  const n = Math.max(1, Math.min(zones.length, Math.floor(duration / 5)));
  const use = zones.length === n ? zones : zones.filter((_, i) => i < n);
  return use.map((zone, i) => ({
    at: Math.round((duration * i) / use.length),
    zone,
    label: label(zone, i),
  }));
}

export function applyPattern(id: PatternId, p: PatternParams): CustomCue[] {
  const duration = Math.max(1, p.duration);
  const step = Math.max(5, Math.round(p.stepSec));
  const base = p.base;
  const peak = p.peak;

  switch (id) {
    case 'steady':
      return [{ at: 0, zone: base, label: sitLabel(base) }];
    case 'stepUp':
      return evenBlocks(zonesBetween(base, peak), duration, (z) => sitLabel(z));
    case 'stepDown':
      return evenBlocks(zonesBetween(peak, base), duration, (z) => sitLabel(z));
    case 'pyramid': {
      const up = zonesBetween(base, peak);
      const down = up.slice(0, -1).reverse();
      return evenBlocks([...up, ...down], duration, (z) => sitLabel(z));
    }
    case 'intervals': {
      const out: CustomCue[] = [];
      for (let t = 0, i = 0; t < duration - 1; t += step, i++) {
        const hard = i % 2 === 1;
        out.push({ at: t, zone: hard ? peak : base, label: hard ? standLabel(peak) : sitLabel(base) });
      }
      return out;
    }
    case 'sitStand': {
      const out: CustomCue[] = [];
      for (let t = 0, i = 0; t < duration - 1; t += step, i++) {
        out.push({ at: t, zone: base, label: i % 2 === 0 ? sitLabel(base) : standLabel(base) });
      }
      return out;
    }
    case 'surge': {
      const at = Math.max(1, Math.round(duration - step));
      if (at >= duration) return [{ at: 0, zone: base, label: sitLabel(base) }];
      return [
        { at: 0, zone: base, label: sitLabel(base) },
        { at, zone: peak, label: standLabel(peak) },
      ];
    }
  }
}
