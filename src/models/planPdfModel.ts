import type { CustomCue, CustomSegment } from './customPlanModel';
import { sitLabel, standLabel } from './patternModel';
import type { PlanTemplate, TemplateItem } from './planImportModel';
import { normalizeText } from './planImportModel';
import type { ZoneId } from './resistanceModel';
import type { SegmentType } from './segmentModel';
import { ZONE_ORDER } from './sectionEditModel';

/* ---------- words ---------- */

const ZONE_WORDS: [RegExp, ZoneId][] = [
  [/^hvit/, 'white'],
  [/^bla/, 'blue'],
  [/^gron/, 'green'],
  [/^gul/, 'yellow'],
  [/^rey[dt]/, 'red'],
];

/** Every zone named in the text, in order of appearance. "spurta" means red. */
export function zonesIn(text: string): ZoneId[] {
  const out: ZoneId[] = [];
  for (const w of normalizeText(text).split(' ')) {
    if (w === 'spurta' || w === 'spurtur') {
      out.push('red');
      continue;
    }
    const hit = ZONE_WORDS.find(([re]) => re.test(w));
    if (hit) out.push(hit[1]);
  }
  return out;
}

function highest(zones: ZoneId[]): ZoneId | null {
  if (zones.length === 0) return null;
  return zones.reduce((a, b) => (ZONE_ORDER.indexOf(b) > ZONE_ORDER.indexOf(a) ? b : a));
}

function posture(text: string): 'sit' | 'stand' | null {
  const w = normalizeText(text).split(' ');
  if (w.includes('sita')) return 'sit';
  if (w.includes('standa')) return 'stand';
  return null;
}

function isOnlyZoneWord(text: string): boolean {
  const words = normalizeText(text).split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => zonesIn(w).length > 0 && w !== 'spurta');
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ---------- lines ---------- */

const SONG = /^\s*(\d+)\.\s+(.*)$/;
const SUB = /^\s*([a-z])\.\s+(.*)$/;
const ENDS_WITH_LENGTH = /\(\s*\d+:\d+\s*\)\s*:?\s*$/;
const RANGE = /\(\s*(\d+):(\d{2})\s*[–—-]\s*(\d+):(\d{2})\s*\)/;
const LENGTH_MIN = /^(\d+):(\d{2})\s*min\b/i;

interface RawSong {
  header: string;
  subs: string[];
}

function collect(text: string): { title: string | null; songs: RawSong[] } {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  const songs: RawSong[] = [];
  let title: string | null = null;
  let current: RawSong | null = null;
  let headerOpen = false;

  for (const line of lines) {
    if (!line) continue;
    const song = SONG.exec(line);
    const sub = SUB.exec(line);
    if (song) {
      current = { header: song[2], subs: [] };
      songs.push(current);
      headerOpen = true;
    } else if (sub && current) {
      current.subs.push(sub[2]);
      headerOpen = false;
    } else if (ENDS_WITH_LENGTH.test(line)) {
      // A section heading such as "Spurtir í tveir sangir (7:04):".
      headerOpen = false;
    } else if (headerOpen && current) {
      // A song name that wrapped onto the next line.
      current.header = `${current.header} ${line}`;
    } else if (title === null && songs.length === 0) {
      title = line;
    }
  }
  return { title, songs };
}

/* ---------- one song ---------- */

function parseHeader(header: string): {
  descriptor: string;
  artist: string;
  title: string;
} | null {
  const parts = header.split(/\s*:\s+/);
  if (parts.length < 3) return null;
  const title = parts[parts.length - 1].trim();
  const artist = parts[parts.length - 2].trim();
  const descriptor = parts.slice(0, -2).join(': ');
  if (!title || !artist) return null;
  return { descriptor, artist, title };
}

function subLabel(text: string, zone: ZoneId, base: string | null): string {
  const clean = text.replace(/^[\s:–—-]+/, '').trim();
  if (isOnlyZoneWord(clean) && base) {
    const p = posture(base);
    if (p === 'stand') return standLabel(zone);
    if (p === 'sit') return sitLabel(zone);
  }
  return capitalize(clean);
}

function typeFor(zones: ZoneId[], text: string, pause: boolean): SegmentType {
  if (pause) return 'flat';
  if (normalizeText(text).includes('spurta')) return 'sprint';
  const top = highest(zones);
  if (top === 'red' || top === 'yellow') return 'climb';
  return 'endurance';
}

function parseSong(raw: RawSong): TemplateItem | null {
  const head = parseHeader(raw.header);
  if (!head) return null;
  const rpmMatch = /RPM\s+(\d+)/i.exec(head.descriptor);
  const rpm = rpmMatch ? Number(rpmMatch[1]) : undefined;
  const minutes = /(\d+)\s*-\s*(\d+)\s*minut/i.exec(head.descriptor);
  const playSeconds = minutes ? Number(minutes[2]) * 60 : undefined;
  const pause = /pausus/i.test(normalizeText(head.descriptor));

  const headerZone = highest(zonesIn(head.descriptor));
  // A song with no color at all: easy white when it has no RPM, otherwise blue.
  const fallback: ZoneId = headerZone ?? (rpm === undefined ? 'white' : 'blue');

  const cues: CustomCue[] = [];
  let clock = 0;
  let base: string | null = null;
  const allText: string[] = [raw.header];

  for (const sub of raw.subs) {
    allText.push(sub);
    const range = RANGE.exec(sub);
    const length = range ? null : LENGTH_MIN.exec(sub);
    let at = 0;
    let rest = sub;
    if (range) {
      at = Number(range[1]) * 60 + Number(range[2]);
      rest = sub.slice((range.index ?? 0) + range[0].length);
    } else if (length) {
      at = clock;
      clock += Number(length[1]) * 60 + Number(length[2]);
      rest = sub.slice(length[0].length);
    } else {
      // A line about the whole song, such as "Sita allan sangin".
      base = sub.trim();
    }
    const zone = highest(zonesIn(rest)) ?? fallback;
    cues.push({ at, zone, label: subLabel(rest, zone, base) });
    if (range) clock = Number(range[3]) * 60 + Number(range[4]) + 1;
  }

  if (cues.length === 0) cues.push({ at: 0, zone: fallback, label: '' });
  cues.sort((a, b) => a.at - b.at);

  // A "whole song" line and a timed cue can both start at 0. The timed one wins.
  const merged: CustomCue[] = [];
  for (const c of cues) {
    const last = merged[merged.length - 1];
    if (last && last.at === c.at) merged[merged.length - 1] = c;
    else merged.push(c);
  }
  if (merged[0].at !== 0) merged[0] = { ...merged[0], at: 0 };

  const custom: CustomSegment = {
    ...(rpm !== undefined ? { rpm } : {}),
    cues: merged,
    ...(playSeconds !== undefined ? { playSeconds } : {}),
    ...(pause ? { note: 'Paususangur' } : {}),
  };
  return {
    title: head.title,
    artist: head.artist,
    type: typeFor(
      merged.map((c) => c.zone),
      allText.join(' '),
      pause && rpm === undefined,
    ),
    custom,
  };
}

/* ---------- whole plan ---------- */

export function slug(text: string): string {
  return normalizeText(text).replace(/\s+/g, '-') || 'plan';
}

/**
 * Reads the text of a class plan written like: "1. RPM 62 í bláum (5:15): Artist: Title",
 * then sub lines such as "a. 38 sek (0:00 – 0:38): sita í bláum".
 * Returns null when no songs are found.
 */
export function parsePlanText(text: string, fallbackName = 'Imported plan'): PlanTemplate | null {
  const { title, songs } = collect(text);
  const items = songs.map(parseSong).filter((i): i is TemplateItem => i !== null);
  if (items.length === 0) return null;
  const name = title ?? fallbackName;
  return { id: `imported-${slug(name)}`, name, items };
}

/* ---------- pdf text lines ---------- */

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  /** Width on the page. When given, pieces that touch are joined without a space. */
  width?: number;
}

/** Groups pieces of text into lines by height, left to right, top of the page first. */
export function itemsToLines(items: PdfTextItem[]): string[] {
  const rows: { y: number; parts: PdfTextItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2.5);
    if (row) row.parts.push(it);
    else rows.push({ y: it.y, parts: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const parts = r.parts.sort((a, b) => a.x - b.x);
    let line = '';
    parts.forEach((p, i) => {
      const prev = parts[i - 1];
      if (i > 0) {
        const touching = prev.width !== undefined && p.x - (prev.x + prev.width) < 1;
        const hasSpace = line.endsWith(' ') || p.str.startsWith(' ');
        if (!touching && !hasSpace) line += ' ';
      }
      line += p.str;
    });
    return line;
  });
}
