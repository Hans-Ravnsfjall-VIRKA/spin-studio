import type { TimelineEntry } from './classPlanModel';

export type ExternalAction =
  | { kind: 'none' }
  | { kind: 'play'; index: number; uri: string; positionSec: number }
  | { kind: 'pause' };

/**
 * Songs that play through an outside player (Spotify) cannot be scheduled on the
 * audio clock. This says what the outside player should do at class time `elapsed`,
 * given which timeline entry it is currently playing (null for none).
 */
export function externalAction(timeline: TimelineEntry[], elapsed: number, active: number | null): ExternalAction {
  const index = timeline.findIndex((e) => e.track.source === 'spotify' && elapsed >= e.start && elapsed < e.end);
  if (index >= 0) {
    if (index === active) return { kind: 'none' };
    const entry = timeline[index];
    const uri = entry.track.spotifyUri ?? '';
    if (!uri) return { kind: 'none' };
    const into = Math.max(0, elapsed - entry.start);
    return { kind: 'play', index, uri, positionSec: into < 0.5 ? 0 : into };
  }
  return active !== null ? { kind: 'pause' } : { kind: 'none' };
}

export function usesExternalPlayer(timeline: TimelineEntry[]): boolean {
  return timeline.some((e) => e.track.source === 'spotify');
}
