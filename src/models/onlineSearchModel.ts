import {
  isCommercialSafe,
  licenseLabel,
  licenseUrl,
  normalizeLicenseCode,
  parseLicenseUrl,
  type License,
} from './licenseModel';
import type { TrackCredit } from './trackModel';

export type OnlineProvider = 'openverse' | 'jamendo';

export interface OnlineTrack {
  /** Unique across providers. */
  key: string;
  provider: OnlineProvider;
  title: string;
  creator: string;
  durationSec: number | null;
  /** Direct audio file or stream. */
  audioUrl: string;
  /** Page where the track lives, for attribution. */
  sourceUrl: string;
  license: License;
  tags: string[];
}

export const OPENVERSE_AUDIO_URL = 'https://api.openverse.org/v1/audio/';
export const JAMENDO_TRACKS_URL = 'https://api.jamendo.com/v3.0/tracks/';

/** Songs shorter than this do not fill a spinning segment. */
export const MIN_TRACK_SEC = 90;

export const GENRE_PRESETS = ['electronic', 'house', 'techno', 'dance', 'pop', 'rock', 'hiphop', 'chillout'];

export type JamendoSpeed = 'verylow' | 'low' | 'medium' | 'high' | 'veryhigh';
export const JAMENDO_SPEEDS: JamendoSpeed[] = ['verylow', 'low', 'medium', 'high', 'veryhigh'];

/* ---------- small guards ---------- */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v : rec(v) ? str((v as Rec).name) : ''))
    .filter((s) => s.length > 0);
}

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/* ---------- Openverse ---------- */

export interface OpenverseQuery {
  query: string;
  genre?: string;
  page?: number;
  pageSize?: number;
}

/** license_type=commercial asks Openverse for works that may be used commercially. */
export function openverseSearchUrl(q: OpenverseQuery): string {
  const text = [q.query.trim(), q.genre ?? ''].filter(Boolean).join(' ');
  const params = new URLSearchParams({
    q: text.length > 0 ? text : 'music',
    category: 'music',
    license_type: 'commercial',
    page: String(q.page ?? 1),
    page_size: String(q.pageSize ?? 20),
  });
  return `${OPENVERSE_AUDIO_URL}?${params.toString()}`;
}

export function normalizeOpenverse(json: unknown): OnlineTrack[] {
  const root = rec(json);
  const results = root && Array.isArray(root.results) ? root.results : [];
  const out: OnlineTrack[] = [];
  for (const item of results) {
    const r = rec(item);
    if (!r) continue;
    const audioUrl = str(r.url);
    const id = str(r.id);
    if (!audioUrl || !id) continue;
    const durationMs = num(r.duration);
    const licenseFromCode = normalizeLicenseCode(str(r.license));
    const license: License =
      licenseFromCode !== 'unknown'
        ? { code: licenseFromCode, version: str(r.license_version) }
        : parseLicenseUrl(str(r.license_url));
    out.push({
      key: `openverse:${id}`,
      provider: 'openverse',
      title: str(r.title) || 'Untitled',
      creator: str(r.creator) || 'Unknown artist',
      durationSec: durationMs !== null ? durationMs / 1000 : null,
      audioUrl,
      sourceUrl: str(r.foreign_landing_url) || audioUrl,
      license,
      tags: strings(r.genres),
    });
  }
  return out;
}

/* ---------- Jamendo ---------- */

export interface JamendoQuery {
  clientId: string;
  query: string;
  genre?: string;
  speed?: JamendoSpeed | '';
  page?: number;
  limit?: number;
  /** JSONP callback name, used when the browser blocks a plain request. */
  callback?: string;
}

export function jamendoSearchUrl(q: JamendoQuery): string {
  const limit = q.limit ?? 30;
  const page = q.page ?? 1;
  const params = new URLSearchParams({
    client_id: q.clientId,
    format: 'json',
    limit: String(limit),
    offset: String((page - 1) * limit),
    include: 'musicinfo',
    audioformat: 'mp32',
    order: 'popularity_month',
    durationbetween: `${MIN_TRACK_SEC}_900`,
  });
  if (q.query.trim()) params.set('search', q.query.trim());
  if (q.genre) params.set('tags', q.genre);
  if (q.speed) params.set('speed', q.speed);
  if (q.callback) params.set('callback', q.callback);
  return `${JAMENDO_TRACKS_URL}?${params.toString()}`;
}

/** Jamendo reports failures inside a 200 response. Returns the message, or null when fine. */
export function jamendoError(json: unknown): string | null {
  const root = rec(json);
  const headers = root ? rec(root.headers) : null;
  if (!headers) return 'Unexpected answer from Jamendo.';
  if (str(headers.status) === 'success') return null;
  return str(headers.error_message) || 'Jamendo refused the request.';
}

export function normalizeJamendo(json: unknown): OnlineTrack[] {
  const root = rec(json);
  const results = root && Array.isArray(root.results) ? root.results : [];
  const out: OnlineTrack[] = [];
  for (const item of results) {
    const r = rec(item);
    if (!r) continue;
    const id = str(r.id);
    const audioUrl = str(r.audio);
    if (!id || !audioUrl) continue;
    const info = rec(r.musicinfo);
    const infoTags = info ? rec(info.tags) : null;
    const tags = infoTags ? [...strings(infoTags.genres), ...strings(infoTags.instruments)] : [];
    out.push({
      key: `jamendo:${id}`,
      provider: 'jamendo',
      title: str(r.name) || 'Untitled',
      creator: str(r.artist_name) || 'Unknown artist',
      durationSec: num(r.duration),
      audioUrl,
      sourceUrl: str(r.shareurl) || `https://www.jamendo.com/track/${id}`,
      license: parseLicenseUrl(str(r.license_ccurl)),
      tags,
    });
  }
  return out;
}

/* ---------- shared ---------- */

/**
 * Keep only tracks with an http audio url, a commercial safe license, and a
 * usable length. Removes repeats by key.
 */
export function keepUsable(tracks: OnlineTrack[]): OnlineTrack[] {
  const seen = new Set<string>();
  const out: OnlineTrack[] = [];
  for (const t of tracks) {
    if (seen.has(t.key)) continue;
    if (!isHttp(t.audioUrl)) continue;
    if (!isCommercialSafe(t.license.code)) continue;
    if (t.durationSec !== null && t.durationSec < MIN_TRACK_SEC) continue;
    seen.add(t.key);
    out.push(t);
  }
  return out;
}

export function creditFor(t: OnlineTrack): TrackCredit {
  return {
    provider: t.provider,
    creator: t.creator,
    license: licenseLabel(t.license),
    licenseUrl: licenseUrl(t.license),
    sourceUrl: t.sourceUrl,
  };
}

/** One line a rider or instructor can read: "Creator, CC BY 4.0". */
export function creditLine(credit: TrackCredit): string {
  return `${credit.creator}, ${credit.license}`;
}
