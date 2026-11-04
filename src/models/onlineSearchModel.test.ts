import { describe, expect, it } from 'vitest';
import {
  creditFor,
  creditLine,
  jamendoError,
  jamendoSearchUrl,
  keepUsable,
  normalizeJamendo,
  normalizeOpenverse,
  openverseSearchUrl,
  type OnlineTrack,
} from './onlineSearchModel';

const openverseSample = {
  result_count: 3,
  results: [
    {
      id: 'abc-1',
      title: 'Night Drive',
      creator: 'Some Artist',
      url: 'https://example.org/audio/night-drive.mp3',
      license: 'by',
      license_version: '4.0',
      foreign_landing_url: 'https://example.org/track/night-drive',
      duration: 215000,
      genres: ['electronic', 'dance'],
    },
    {
      id: 'abc-2',
      title: 'Short Jingle',
      creator: 'Other',
      url: 'https://example.org/audio/jingle.mp3',
      license: 'cc0',
      license_version: '1.0',
      duration: 20000,
    },
    { id: 'abc-3', title: 'No Url' },
    'garbage',
  ],
};

const jamendoSample = {
  headers: { status: 'success', code: 0, error_message: '', results_count: 3 },
  results: [
    {
      id: '1001',
      name: 'Rise Up',
      duration: 240,
      artist_name: 'Band One',
      audio: 'https://prod-1.storage.jamendo.com/?trackid=1001&format=mp32',
      shareurl: 'https://www.jamendo.com/track/1001',
      license_ccurl: 'http://creativecommons.org/licenses/by-sa/3.0/',
      musicinfo: { speed: 'high', tags: { genres: ['house'], instruments: ['synthesizer'] } },
    },
    {
      id: '1002',
      name: 'Noncommercial Only',
      duration: 200,
      artist_name: 'Band Two',
      audio: 'https://prod-1.storage.jamendo.com/?trackid=1002&format=mp32',
      license_ccurl: 'http://creativecommons.org/licenses/by-nc-nd/3.0/',
    },
    { id: '1003', name: 'No audio', license_ccurl: 'http://creativecommons.org/licenses/by/3.0/' },
  ],
};

describe('openverse', () => {
  it('builds a commercial music search url', () => {
    const url = new URL(openverseSearchUrl({ query: 'workout', genre: 'house', page: 2 }));
    expect(url.origin + url.pathname).toBe('https://api.openverse.org/v1/audio/');
    expect(url.searchParams.get('q')).toBe('workout house');
    expect(url.searchParams.get('license_type')).toBe('commercial');
    expect(url.searchParams.get('category')).toBe('music');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe('20');
  });

  it('falls back to a default query', () => {
    expect(new URL(openverseSearchUrl({ query: '  ' })).searchParams.get('q')).toBe('music');
  });

  it('normalizes results and skips unusable rows', () => {
    const tracks = normalizeOpenverse(openverseSample);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      key: 'openverse:abc-1',
      provider: 'openverse',
      title: 'Night Drive',
      creator: 'Some Artist',
      durationSec: 215,
      sourceUrl: 'https://example.org/track/night-drive',
      tags: ['electronic', 'dance'],
      license: { code: 'by', version: '4.0' },
    });
    expect(tracks[1].sourceUrl).toBe('https://example.org/audio/jingle.mp3');
  });

  it('tolerates bad input', () => {
    expect(normalizeOpenverse(null)).toEqual([]);
    expect(normalizeOpenverse({})).toEqual([]);
    expect(normalizeOpenverse({ results: 'x' })).toEqual([]);
  });
});

describe('jamendo', () => {
  it('builds a search url', () => {
    const url = new URL(
      jamendoSearchUrl({ clientId: 'abc123', query: 'drive', genre: 'electronic', speed: 'high', page: 3, limit: 20 }),
    );
    expect(url.origin + url.pathname).toBe('https://api.jamendo.com/v3.0/tracks/');
    expect(url.searchParams.get('client_id')).toBe('abc123');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('search')).toBe('drive');
    expect(url.searchParams.get('tags')).toBe('electronic');
    expect(url.searchParams.get('speed')).toBe('high');
    expect(url.searchParams.get('offset')).toBe('40');
    expect(url.searchParams.get('include')).toBe('musicinfo');
    expect(url.searchParams.get('callback')).toBeNull();
  });

  it('omits empty filters and adds a callback when asked', () => {
    const url = new URL(jamendoSearchUrl({ clientId: 'k', query: ' ', speed: '', callback: 'cb1' }));
    expect(url.searchParams.has('search')).toBe(false);
    expect(url.searchParams.has('tags')).toBe(false);
    expect(url.searchParams.has('speed')).toBe(false);
    expect(url.searchParams.get('callback')).toBe('cb1');
  });

  it('reads errors from the header', () => {
    expect(jamendoError(jamendoSample)).toBeNull();
    expect(jamendoError({ headers: { status: 'failed', error_message: 'Invalid client_id' } })).toBe('Invalid client_id');
    expect(jamendoError({ headers: { status: 'failed' } })).toBe('Jamendo refused the request.');
    expect(jamendoError(null)).toBe('Unexpected answer from Jamendo.');
  });

  it('normalizes results', () => {
    const tracks = normalizeJamendo(jamendoSample);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      key: 'jamendo:1001',
      title: 'Rise Up',
      creator: 'Band One',
      durationSec: 240,
      license: { code: 'by-sa', version: '3.0' },
      tags: ['house', 'synthesizer'],
    });
    expect(tracks[1].sourceUrl).toBe('https://www.jamendo.com/track/1002');
  });
});

describe('keepUsable and credits', () => {
  const base: OnlineTrack = {
    key: 'k1',
    provider: 'openverse',
    title: 'T',
    creator: 'C',
    durationSec: 200,
    audioUrl: 'https://example.org/a.mp3',
    sourceUrl: 'https://example.org/t',
    license: { code: 'by', version: '4.0' },
    tags: [],
  };

  it('drops non commercial licenses, short tracks, repeats and non http urls', () => {
    const list = keepUsable([
      base,
      { ...base },
      { ...base, key: 'k2', license: { code: 'by-nc', version: '4.0' } },
      { ...base, key: 'k3', license: { code: 'by-nd', version: '4.0' } },
      { ...base, key: 'k4', license: { code: 'unknown', version: '' } },
      { ...base, key: 'k5', durationSec: 30 },
      { ...base, key: 'k6', audioUrl: 'ftp://example.org/a.mp3' },
      { ...base, key: 'k7', durationSec: null },
      { ...base, key: 'k8', license: { code: 'cc0', version: '1.0' } },
    ]);
    expect(list.map((t) => t.key)).toEqual(['k1', 'k7', 'k8']);
  });

  it('builds credits', () => {
    const credit = creditFor(base);
    expect(credit).toEqual({
      provider: 'openverse',
      creator: 'C',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://example.org/t',
    });
    expect(creditLine(credit)).toBe('C, CC BY 4.0');
  });
});
