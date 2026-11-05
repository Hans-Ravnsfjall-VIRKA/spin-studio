import { describe, expect, it } from 'vitest';
import { INNISUKKLING_240226 } from '../data/plans';
import { buildTimeline } from './classPlanModel';
import { findTrack, instantiatePlan, normalizeText, unresolvedCount } from './planImportModel';
import { parsePlaylistId } from './spotifyModel';
import type { Track } from './trackModel';

const sp = (id: string, title: string, artist: string, duration = 200): Track => ({
  id,
  title,
  artist,
  bpm: 120,
  bpmKnown: false,
  duration,
  beatOffset: 0,
  energy: 3,
  source: 'spotify',
  spotifyUri: `spotify:track:${id}`,
});

describe('normalizeText', () => {
  it('folds case, accents, Faroese letters and punctuation', () => {
    expect(normalizeText('Vágaverk')).toBe('vagaverk');
    expect(normalizeText('Reyðagull')).toBe('reydagull');
    expect(normalizeText("That’s What Makes You Beautiful")).toBe('thats what makes you beautiful');
    expect(normalizeText('Everylittle-thing!')).toBe('everylittle thing');
  });
});

describe('findTrack', () => {
  const lib = [
    sp('1', 'Rasputin - Single Version', 'Boney M.'),
    sp('2', 'Wellerman - Sea Shanty', 'Nathan Evans'),
    sp('3', 'Stor Mand', 'Tobias Rahim, Andreas Odbjerg'),
    sp('4', 'Every Little Thing', 'Carlene Carter'),
    sp('5', 'Totally Different', 'Nobody'),
  ];

  it('matches despite extra words and artist noise', () => {
    expect(findTrack('Rasputin', 'Boney M', lib)?.track.id).toBe('1');
    expect(findTrack('Stor mand', 'Tobias Rahim feat. Andreas Odbjerg', lib)?.track.id).toBe('3');
  });

  it('tolerates a one word slip in the plan', () => {
    expect(findTrack('Wallerman', 'Nathan Evans', lib)?.track.id).toBe('2');
    expect(findTrack('Everylittle thing', 'Carlene Carter', lib)?.track.id).toBe('4');
  });

  it('returns null when nothing fits and never matches synth tracks', () => {
    expect(findTrack('Blinding lights', 'The Weeknd', lib)).toBeNull();
    const synth: Track = { ...sp('s', 'Rasputin', 'Boney M'), source: 'synth' };
    expect(findTrack('Rasputin', 'Boney M', [synth])).toBeNull();
  });

  it('does not match on the artist alone', () => {
    expect(findTrack('Hvar Baby', 'Nathan Evans', lib)).toBeNull();
  });
});

describe('instantiatePlan', () => {
  it('fills found songs, leaves the rest empty and does not reuse a song', () => {
    let n = 0;
    const lib = [sp('a', 'Rasputin', 'Boney M'), sp('b', 'Alla nátt', 'Hjarnar')];
    const items = instantiatePlan(INNISUKKLING_240226, lib, () => `i${n++}`);
    expect(items).toHaveLength(17);
    expect(items[0].trackId).toBe('b');
    expect(items[3].trackId).toBe('a');
    expect(items.filter((i) => i.trackId === '')).toHaveLength(15);
    expect(unresolvedCount(items, lib)).toBe(15);
    expect(items.every((i) => i.custom)).toBe(true);
  });
});

describe('Innisúkkling 240226 plan data', () => {
  it('has 17 songs with sorted cues that start at zero', () => {
    expect(INNISUKKLING_240226.items).toHaveLength(17);
    for (const it of INNISUKKLING_240226.items) {
      expect(it.custom.cues[0].at).toBe(0);
      const ats = it.custom.cues.map((c) => c.at);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
    }
  });

  it('keeps every cue inside the song length given in the plan', () => {
    const lengths = [315, 183, 182, 272, 120, 193, 187, 196, 155, 202, 223, 167, 192, 155, 243, 200, 187];
    INNISUKKLING_240226.items.forEach((it, i) => {
      const last = it.custom.cues[it.custom.cues.length - 1].at;
      expect(last).toBeLessThan(lengths[i]);
    });
  });

  it('builds a timeline when every song exists', () => {
    const lengths = [315, 183, 182, 272, 300, 193, 187, 196, 155, 202, 223, 167, 192, 155, 243, 200, 187];
    const lib = INNISUKKLING_240226.items.map((it, i) => sp(`t${i}`, it.title, it.artist, lengths[i]));
    const items = instantiatePlan(INNISUKKLING_240226, lib, (() => {
      let n = 0;
      return () => `i${n++}`;
    })());
    expect(unresolvedCount(items, lib)).toBe(0);
    const tl = buildTimeline(items, lib);
    expect(tl).toHaveLength(17);
    expect(tl[4].duration).toBe(120);
    expect(tl[4].cadence).toBe(0);
  });
});

describe('parsePlaylistId', () => {
  const id = '4EClEakb9fu69lhOmSdQLm';
  it('reads share links, uris and bare ids', () => {
    expect(parsePlaylistId(`https://open.spotify.com/playlist/${id}?si=abc&utm_source=x`)).toBe(id);
    expect(parsePlaylistId(`spotify:playlist:${id}`)).toBe(id);
    expect(parsePlaylistId(` ${id} `)).toBe(id);
    expect(parsePlaylistId(`https://open.spotify.com/intl-fo/playlist/${id}`)).toBe(id);
  });
  it('rejects other text', () => {
    expect(parsePlaylistId('hello')).toBeNull();
    expect(parsePlaylistId('https://open.spotify.com/track/' + id)).toBeNull();
  });
});
