import type { ZoneId } from './resistanceModel';
import type { Cue } from './segmentModel';

/** One instruction inside a song: from `at` seconds on, ride in this color zone. */
export interface CustomCue {
  at: number;
  zone: ZoneId;
  /** Shown to the rider, in the instructor's own words. */
  label: string;
  /** RPM for this section only. */
  rpm?: number;
}

/** A song whose RPM and color changes come from the instructor's own plan. */
export interface CustomSegment {
  /** Pedal revolutions per minute. Leave out for songs with no set RPM. */
  rpm?: number;
  cues: CustomCue[];
  /** Seconds to play, when only part of the song is used. */
  playSeconds?: number;
  note?: string;
}

/** A plan gives colors, not numbers, so each zone stands for one level on the 1 to 10 scale. */
export const ZONE_LEVEL: Record<ZoneId, number> = { white: 1, blue: 3, green: 5, yellow: 7, red: 9 };

export function customDuration(trackDuration: number, custom: CustomSegment): number {
  const play = custom.playSeconds;
  return play !== undefined && play > 0 ? Math.min(trackDuration, play) : trackDuration;
}

/**
 * Turns timed cues into contiguous cues from 0 to `duration`. Each cue lasts until
 * the next one starts, so small gaps in a written plan (0:38 then 0:39) do not matter.
 */
export function customCuesToCues(cues: CustomCue[], duration: number): Cue[] {
  if (duration <= 0) return [];
  const sorted = cues.filter((c) => Number.isFinite(c.at) && c.at < duration).sort((a, b) => a.at - b.at);
  if (sorted.length === 0) {
    return [{ start: 0, end: duration, resistance: ZONE_LEVEL.white, zone: 'white', label: '' }];
  }
  const out: Cue[] = [];
  sorted.forEach((c, i) => {
    const start = i === 0 ? 0 : Math.max(0, c.at);
    const end = i + 1 < sorted.length ? Math.max(0, sorted[i + 1].at) : duration;
    if (end > start) {
      out.push({
        start,
        end,
        resistance: ZONE_LEVEL[c.zone],
        zone: c.zone,
        label: c.label,
        ...(c.rpm ? { rpm: c.rpm } : {}),
      });
    }
  });
  return out;
}
