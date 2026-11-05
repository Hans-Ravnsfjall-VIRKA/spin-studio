import { clampBpm, MAX_BPM, MIN_BPM, type Track } from './trackModel';

export interface SpotifyTrackInfo {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  imageUrl: string | null;
  url: string;
}

export interface SpotifyPlaylistInfo {
  id: string;
  name: string;
  owner: string;
  trackCount: number;
  imageUrl: string | null;
}

export const SPOTIFY_PAGE_SIZE = 50;
export const SPOTIFY_SEARCH_LIMIT = 10;

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lastImage(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const img = rec(value[value.length - 1]);
  const url = img ? str(img.url) : '';
  return url || null;
}

/* ---------- paths (relative to https://api.spotify.com/v1) ---------- */

export function spotifySearchPath(query: string, offset = 0, limit = SPOTIFY_SEARCH_LIMIT): string {
  const params = new URLSearchParams({
    q: query.trim(),
    type: 'track',
    limit: String(limit),
    offset: String(offset),
    market: 'from_token',
  });
  return `/search?${params.toString()}`;
}

export function spotifyPlaylistsPath(offset = 0, limit = SPOTIFY_PAGE_SIZE): string {
  return `/me/playlists?limit=${limit}&offset=${offset}`;
}

/**
 * Spotify has been renaming playlist "tracks" to "items". The panel tries "items"
 * first and falls back to "tracks".
 */
export function spotifyPlaylistItemsPath(
  playlistId: string,
  offset = 0,
  kind: 'items' | 'tracks' = 'items',
  limit = SPOTIFY_PAGE_SIZE,
): string {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), market: 'from_token' });
  return `/playlists/${encodeURIComponent(playlistId)}/${kind}?${params.toString()}`;
}

/* ---------- responses ---------- */

function trackFromObject(o: Rec | null): SpotifyTrackInfo | null {
  if (!o) return null;
  const type = str(o.type);
  if (type && type !== 'track') return null;
  if (o.is_local === true || o.is_playable === false) return null;
  const id = str(o.id);
  const uri = str(o.uri);
  const durationMs = typeof o.duration_ms === 'number' ? o.duration_ms : NaN;
  if (!id || !uri.startsWith('spotify:track:') || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const artists = Array.isArray(o.artists)
    ? o.artists
        .map((a) => (rec(a) ? str((a as Rec).name) : ''))
        .filter(Boolean)
        .join(', ')
    : '';
  const album = rec(o.album);
  const external = rec(o.external_urls);
  return {
    id,
    uri,
    title: str(o.name) || 'Untitled',
    artist: artists || 'Unknown artist',
    album: album ? str(album.name) : '',
    durationSec: durationMs / 1000,
    imageUrl: album ? lastImage(album.images) : null,
    url: (external ? str(external.spotify) : '') || `https://open.spotify.com/track/${id}`,
  };
}

export function normalizeSpotifySearch(json: unknown): SpotifyTrackInfo[] {
  const tracks = rec(rec(json)?.tracks);
  const items = tracks && Array.isArray(tracks.items) ? tracks.items : [];
  return items.map((i) => trackFromObject(rec(i))).filter((t): t is SpotifyTrackInfo => t !== null);
}

export function normalizePlaylists(json: unknown): SpotifyPlaylistInfo[] {
  const root = rec(json);
  const items = root && Array.isArray(root.items) ? root.items : [];
  const out: SpotifyPlaylistInfo[] = [];
  for (const raw of items) {
    const p = rec(raw);
    if (!p) continue;
    const id = str(p.id);
    if (!id) continue;
    const count = rec(p.tracks) ?? rec(p.items);
    const owner = rec(p.owner);
    out.push({
      id,
      name: str(p.name) || 'Untitled playlist',
      owner: owner ? str(owner.display_name) || str(owner.id) : '',
      trackCount: count && typeof count.total === 'number' ? count.total : 0,
      imageUrl: lastImage(p.images),
    });
  }
  return out;
}

/** Playlist rows hold the song under "track" (older shape) or "item" (newer shape). */
export function normalizePlaylistItems(json: unknown): SpotifyTrackInfo[] {
  const root = rec(json);
  const items = root && Array.isArray(root.items) ? root.items : [];
  const out: SpotifyTrackInfo[] = [];
  for (const raw of items) {
    const row = rec(raw);
    if (!row) continue;
    const t = trackFromObject(rec(row.track) ?? rec(row.item));
    if (t) out.push(t);
  }
  return out;
}

export function hasMorePages(json: unknown): boolean {
  const root = rec(json);
  return !!root && typeof root.next === 'string' && root.next.length > 0;
}

/** Playlist id from a share link, a spotify:playlist: uri or a bare 22 character id. */
export function parsePlaylistId(text: string): string | null {
  const s = text.trim();
  const m = /playlist[/:]([A-Za-z0-9]{22})(?![A-Za-z0-9])/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9]{22}$/.test(s) ? s : null;
}

/* ---------- tempo and tracks ---------- */

/** Accepts "128", "127.5" and "127,5". Returns null outside 40 to 220. */
export function parseBpmInput(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(n) || text.trim() === '') return null;
  if (n < MIN_BPM || n > MAX_BPM) return null;
  return clampBpm(n);
}

/** bpm null means the tempo is not known yet: the song stays out of automatic matching. */
export function trackFromSpotify(info: SpotifyTrackInfo, bpm: number | null, id: string): Track {
  return {
    id,
    title: info.title,
    artist: info.artist,
    bpm: bpm === null ? 120 : clampBpm(bpm),
    bpmKnown: bpm !== null,
    duration: info.durationSec,
    beatOffset: 0,
    energy: 3,
    source: 'spotify',
    spotifyUri: info.uri,
  };
}

/** Songs already in the library, so a playlist can be imported twice without duplicates. */
export function newSpotifyTracks(infos: SpotifyTrackInfo[], existing: Track[]): SpotifyTrackInfo[] {
  const have = new Set(existing.map((t) => t.spotifyUri).filter(Boolean));
  const seen = new Set<string>();
  const out: SpotifyTrackInfo[] = [];
  for (const i of infos) {
    if (have.has(i.uri) || seen.has(i.uri)) continue;
    seen.add(i.uri);
    out.push(i);
  }
  return out;
}

/* ---------- devices ---------- */

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

/** Devices that can play right now: the Spotify app on a phone, a speaker, a computer. */
export function normalizeDevices(json: unknown): SpotifyDevice[] {
  const list = rec(json) && Array.isArray((json as Rec).devices) ? ((json as Rec).devices as unknown[]) : [];
  const out: SpotifyDevice[] = [];
  for (const d of list) {
    const r = rec(d);
    if (!r) continue;
    const id = str(r.id);
    if (!id || r.is_restricted === true) continue;
    out.push({ id, name: str(r.name) || 'Unnamed device', type: str(r.type), isActive: r.is_active === true });
  }
  return out;
}
