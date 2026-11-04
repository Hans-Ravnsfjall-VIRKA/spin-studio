export const MIN_RESISTANCE = 1;
export const MAX_RESISTANCE = 10;
export const RESISTANCE_LEVELS: number[] = Array.from({ length: 10 }, (_, i) => i + 1);

export type ZoneId = 'white' | 'blue' | 'green' | 'yellow' | 'red';

export interface ResistanceZone {
  id: ZoneId;
  name: string;
  /** First and last level of the zone. */
  from: number;
  to: number;
  hue: number;
  saturation: number;
  /** Lightness at the first and last level, so harder levels read a little deeper. */
  lightnessFrom: number;
  lightnessTo: number;
}

/** White is no resistance. Then blue, green, yellow and red as it gets harder. */
export const RESISTANCE_ZONES: ResistanceZone[] = [
  { id: 'white', name: 'White', from: 1, to: 1, hue: 0, saturation: 0, lightnessFrom: 96, lightnessTo: 96 },
  { id: 'blue', name: 'Blue', from: 2, to: 3, hue: 215, saturation: 85, lightnessFrom: 68, lightnessTo: 56 },
  { id: 'green', name: 'Green', from: 4, to: 5, hue: 140, saturation: 65, lightnessFrom: 60, lightnessTo: 46 },
  { id: 'yellow', name: 'Yellow', from: 6, to: 7, hue: 50, saturation: 95, lightnessFrom: 62, lightnessTo: 50 },
  { id: 'red', name: 'Red', from: 8, to: 10, hue: 0, saturation: 85, lightnessFrom: 66, lightnessTo: 50 },
];

export function clampResistance(level: number): number {
  if (!Number.isFinite(level)) return MIN_RESISTANCE;
  return Math.min(MAX_RESISTANCE, Math.max(MIN_RESISTANCE, Math.round(level)));
}

export function resistanceZone(level: number): ResistanceZone {
  const l = clampResistance(level);
  return RESISTANCE_ZONES.find((z) => l >= z.from && l <= z.to) as ResistanceZone;
}

export function resistanceName(level: number): string {
  return resistanceZone(level).name;
}

/** Text such as "2 to 3" or "1" for the levels in a zone. */
export function zoneRangeLabel(zone: ResistanceZone): string {
  return zone.from === zone.to ? String(zone.from) : `${zone.from} to ${zone.to}`;
}

function lightnessAt(zone: ResistanceZone, level: number): number {
  if (zone.from === zone.to) return zone.lightnessFrom;
  const t = (level - zone.from) / (zone.to - zone.from);
  return zone.lightnessFrom + (zone.lightnessTo - zone.lightnessFrom) * t;
}

/** Color for a level. `lightnessDelta` makes it lighter (positive) or deeper (negative). */
export function resistanceColor(level: number, lightnessDelta = 0): string {
  const l = clampResistance(level);
  const zone = resistanceZone(l);
  const lightness = Math.max(0, Math.min(100, lightnessAt(zone, l) + lightnessDelta));
  return `hsl(${zone.hue} ${zone.saturation}% ${Math.round(lightness * 10) / 10}%)`;
}

/** Center of the level's slot along the scale, as a percentage, so markers sit over their tick. */
export function resistancePercent(level: number): number {
  return (clampResistance(level) - 0.5) * 10;
}

/** One hard-edged band per level, so the zones read as zones. */
export function resistanceGradient(direction = 'to right'): string {
  const stops = RESISTANCE_LEVELS.map((l) => `${resistanceColor(l)} ${(l - 1) * 10}% ${l * 10}%`);
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
