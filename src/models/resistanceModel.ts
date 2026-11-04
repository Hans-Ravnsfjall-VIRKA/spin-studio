export const MIN_RESISTANCE = 1;
export const MAX_RESISTANCE = 10;
export const RESISTANCE_LEVELS: number[] = Array.from({ length: 10 }, (_, i) => i + 1);

const NAMES = ['Blue', 'Sky', 'Teal', 'Mint', 'Green', 'Lime', 'Yellow', 'Amber', 'Orange', 'Red'];

export function clampResistance(level: number): number {
  if (!Number.isFinite(level)) return MIN_RESISTANCE;
  return Math.min(MAX_RESISTANCE, Math.max(MIN_RESISTANCE, Math.round(level)));
}

/** Hue runs from blue (220) at level 1 down to red (0) at level 10. */
export function resistanceHue(level: number): number {
  const t = (clampResistance(level) - MIN_RESISTANCE) / (MAX_RESISTANCE - MIN_RESISTANCE);
  return Math.round(220 - 220 * t);
}

export function resistanceColor(level: number, lightness = 55): string {
  return `hsl(${resistanceHue(level)} 85% ${lightness}%)`;
}

export function resistanceName(level: number): string {
  return NAMES[clampResistance(level) - 1];
}

/** Position along the blue to red scale as a percentage, 0 to 100. */
export function resistancePercent(level: number): number {
  return ((clampResistance(level) - MIN_RESISTANCE) / (MAX_RESISTANCE - MIN_RESISTANCE)) * 100;
}

export function resistanceGradient(direction = 'to right'): string {
  const stops = RESISTANCE_LEVELS.map(
    (l) => `${resistanceColor(l)} ${resistancePercent(l).toFixed(1)}%`,
  );
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
