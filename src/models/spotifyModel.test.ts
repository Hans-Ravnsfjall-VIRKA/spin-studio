import { describe, expect, it } from 'vitest';
import {
  hasMorePages,
  newSpotifyTracks,
  normalizeDevices,
  normalizePlaylistItems,
  normalizePlaylists,
  normalizeSpotifySearch,
  parseBpmInput,
  spotifyPlaylistItemsPath,
  spotifyPlaylistsPath,
  spotifySearchPath,
  trackFromSpotify,
  type SpotifyTrackInfo,
} from './spotifyModel';
import type { Track } from './trackModel';

const rawTrack = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'track',
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  duration_ms: 215000,
  artists: [{ name: 'ABBA' }, { name: 'Guest' }],
  album: { name: 'Album', images: [{ url: 'https://i/big.jpg' }, { url: 'https://i/small.jpg' }] },
  external_urls: { spotify: `https://open.spotify.com/track/${id}` },
  ...extra,
});

describe('paths', () => {
  it('builds search and playlist paths', () => {
    const s = new URL('https://x' + spotifySearchPath(' abba ', 10));
    expect(s.pathname).toBe('/search');
    expect(s.searchParams.get('q')).toBe('abba');
    expect(s.searchParams.get('type')).toBe('track');
    expect(s.searchParams.get('offset')).toBe('10');
    expect(s.searchParams.get('market')).toBe('from_token');
    expect(spotifyPlaylistsPath(50)).toBe('/me/playlists?limit=50&offset=50');
    const i = new URL('https://x' + spotifyPlaylistItemsPath('a b', 100));
    expect(i.pathname).toBe('/playlists/a%20b/items');
    expect(i.searchParams.get('offset')).toBe('100');
    expect(spotifyPlaylistItemsPath('p1', 0, 'tracks')).toContain('/playlists/p1/tracks?');
  });
});

describe('responses', () => {
  it('normalizes search results and skips unplayable rows', () => {
    const json = {
      tracks: {
        items: [
          rawTrack('a'),
          rawTrack('b', { is_playable: false }),
          rawTrack('c', { is_local: true }),
          rawTrack('d', { type: 'episode' }),
          rawTrack('e', { uri: 'spotify:episode:e' }),
          rawTrack('f', { duration_ms: 0 }),
          'junk',
        ],
      },
    };
    const out = normalizeSpotifySearch(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'a',
      uri: 'spotify:track:a',
      title: 'Song a',
      artist: 'ABBA, Guest',
      album: 'Album',
      durationSec: 215,
      imageUrl: 'https://i/small.jpg',
      url: 'https://open.spotify.com/track/a',
    });
    expect(normalizeSpotifySearch(null)).toEqual([]);
    expect(normalizeSpotifySearch({ tracks: {} })).toEqual([]);
  });

  it('normalizes playlists in both count shapes', () => {
    const out = normalizePlaylists({
      items: [
        { id: 'p1', name: 'Hill climbs', owner: { display_name: 'Hans' }, tracks: { total: 24 }, images: [{ url: 'https://i/p.jpg' }] },
        { id: 'p2', name: 'New shape', owner: { id: 'u2' }, items: { total: 7 } },
        { name: 'no id' },
        null,
      ],
    });
    expect(out).toEqual([
      { id: 'p1', name: 'Hill climbs', owner: 'Hans', trackCount: 24, imageUrl: 'https://i/p.jpg' },
      { id: 'p2', name: 'New shape', owner: 'u2', trackCount: 7, imageUrl: null },
    ]);
  });

  it('reads playlist rows from either the track or item field', () => {
    const out = normalizePlaylistItems({
      items: [{ track: rawTrack('t1') }, { item: rawTrack('t2') }, { track: null }, { track: rawTrack('t3', { is_local: true }) }],
    });
    expect(out.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('detects further pages', () => {
    expect(hasMorePages({ next: 'https://api.spotify.com/v1/x?offset=50' })).toBe(true);
    expect(hasMorePages({ next: null })).toBe(false);
    expect(hasMorePages(undefined)).toBe(false);
  });
});

describe('tempo and tracks', () => {
  it('parses bpm input', () => {
    expect(parseBpmInput('128')).toBe(128);
    expect(parseBpmInput(' 127,5 ')).toBe(127.5);
    expect(parseBpmInput('39')).toBeNull();
    expect(parseBpmInput('221')).toBeNull();
    expect(parseBpmInput('')).toBeNull();
    expect(parseBpmInput('fast')).toBeNull();
  });

  const info: SpotifyTrackInfo = {
    id: 'a',
    uri: 'spotify:track:a',
    title: 'Dancing Queen',
    artist: 'ABBA',
    album: 'Arrival',
    durationSec: 231,
    imageUrl: null,
    url: 'https://open.spotify.com/track/a',
  };

  it('builds a spotify track, with the tempo known or not', () => {
    const known = trackFromSpotify(info, 101, 'sp-1');
    expect(known).toMatchObject({ source: 'spotify', spotifyUri: 'spotify:track:a', bpm: 101, bpmKnown: true, duration: 231, beatOffset: 0 });
    const unknown = trackFromSpotify(info, null, 'sp-2');
    expect(unknown.bpmKnown).toBe(false);
    expect(unknown.bpm).toBe(120);
  });

  it('skips songs that are already in the library or repeated', () => {
    const existing: Track[] = [trackFromSpotify(info, 101, 'sp-1')];
    const other = { ...info, id: 'b', uri: 'spotify:track:b' };
    expect(newSpotifyTracks([info, other, other], existing).map((t) => t.id)).toEqual(['b']);
  });
});

describe('normalizeDevices', () => {
  it('keeps playable devices and skips restricted or id-less ones', () => {
    const out = normalizeDevices({
      devices: [
        { id: 'a', name: 'Hans iPhone', type: 'Smartphone', is_active: true },
        { id: 'b', name: 'Locked', type: 'Speaker', is_restricted: true },
        { name: 'No id' },
        null,
      ],
    });
    expect(out).toEqual([{ id: 'a', name: 'Hans iPhone', type: 'Smartphone', isActive: true }]);
    expect(normalizeDevices({})).toEqual([]);
    expect(normalizeDevices(null)).toEqual([]);
  });
});
