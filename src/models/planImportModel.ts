import type { PlanItem } from './classPlanModel';
import type { CustomSegment } from './customPlanModel';
import type { SegmentType } from './segmentModel';
import type { Track } from './trackModel';

/** A written class plan: songs by name, each with its own RPM and color changes. */
export interface TemplateItem {
  title: string;
  artist: string;
  type: SegmentType;
  custom: CustomSegment;
}

export interface PlanTemplate {
  id: string;
  name: string;
  items: TemplateItem[];
}

/* ---------- text matching ---------- */

const MAP: Record<string, string> = { ð: 'd', þ: 'th', æ: 'ae', ø: 'o', œ: 'oe', ß: 'ss' };
const ARTIST_STOP = new Set(['feat', 'ft', 'featuring', 'og', 'and', 'with', 'the', 'x']);

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ðþæøœß]/g, (c) => MAP[c] ?? c)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(text: string, stop?: Set<string>): string[] {
  const t = normalizeText(text).split(' ').filter(Boolean);
  return stop ? t.filter((w) => !stop.has(w)) : t;
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function tokenSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  if (len < 4) return false;
  return editDistance(a, b) <= (len >= 8 ? 2 : 1);
}

/** Share of the wanted words that appear (allowing small spelling slips) in the candidate. 0 to 1. */
function coverage(want: string[], have: string[]): number {
  if (want.length === 0) return 0;
  let hit = 0;
  for (const w of want) if (have.some((h) => tokenSimilar(w, h))) hit++;
  return hit / want.length;
}

function textScore(want: string, have: string, stop?: Set<string>): number {
  const w = tokens(want, stop);
  const h = tokens(have, stop);
  const base = coverage(w, h);
  const compactW = w.join('');
  const compactH = h.join('');
  if (compactW.length >= 8 && (compactH.includes(compactW) || compactW.includes(compactH)) && compactH.length >= 8) {
    return Math.max(base, 1);
  }
  const extra = Math.max(0, h.length - w.length);
  return Math.max(0, base - 0.01 * extra);
}

export interface TrackMatchResult {
  track: Track;
  score: number;
}

/** Best library song for a plan entry, or null. Synth songs are never matched. */
export function findTrack(title: string, artist: string, tracks: Track[]): TrackMatchResult | null {
  let best: TrackMatchResult | null = null;
  for (const t of tracks) {
    if (t.source === 'synth') continue;
    const ts = textScore(title, t.title);
    if (ts < 0.75) continue;
    const as = textScore(artist, t.artist, ARTIST_STOP);
    const score = 0.7 * ts + 0.3 * as;
    if (score < 0.6) continue;
    if (!best || score > best.score) best = { track: t, score };
  }
  return best;
}

/** Plan items for a template. Songs not found get an empty trackId and are picked by hand. */
export function instantiatePlan(
  template: PlanTemplate,
  tracks: Track[],
  newId: () => string,
): PlanItem[] {
  const used = new Set<string>();
  return template.items.map((it) => {
    const pool = tracks.filter((t) => !used.has(t.id));
    const found = findTrack(it.title, it.artist, pool);
    if (found) used.add(found.track.id);
    return {
      id: newId(),
      trackId: found ? found.track.id : '',
      type: it.type,
      custom: it.custom,
    };
  });
}

export function unresolvedCount(items: PlanItem[], tracks: Track[]): number {
  const ids = new Set(tracks.map((t) => t.id));
  return items.filter((i) => !ids.has(i.trackId)).length;
}
