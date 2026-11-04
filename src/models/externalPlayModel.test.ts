import { describe, expect, it } from 'vitest';
import { buildTimeline } from './classPlanModel';
import { externalAction, usesExternalPlayer } from './externalPlayModel';
import type { Track } from './trackModel';

const track = (id: string, source: Track['source'], duration: number): Track => ({
  id,
  title: id,
  artist: 'x',
  bpm: 100,
  duration,
  beatOffset: 0,
  energy: 3,
  source,
  spotifyUri: source === 'spotify' ? `spotify:track:${id}` : undefined,
});

const tracks = [track('s1', 'spotify', 100), track('syn', 'synth', 60), track('s2', 'spotify', 80)];
const tl = buildTimeline(
  [
    { id: 'a', trackId: 's1', type: 'flat' },
    { id: 'b', trackId: 'syn', type: 'flat' },
    { id: 'c', trackId: 's2', type: 'flat' },
  ],
  tracks,
);

describe('externalAction', () => {
  it('starts a spotify song at its beginning', () => {
    expect(externalAction(tl, 0, null)).toEqual({ kind: 'play', index: 0, uri: 'spotify:track:s1', positionSec: 0 });
    expect(externalAction(tl, 0.3, null)).toMatchObject({ kind: 'play', positionSec: 0 });
  });

  it('does nothing while the right song is already playing', () => {
    expect(externalAction(tl, 50, 0)).toEqual({ kind: 'none' });
  });

  it('seeks into a song when joined mid way', () => {
    expect(externalAction(tl, 190, null)).toEqual({ kind: 'play', index: 2, uri: 'spotify:track:s2', positionSec: 30 });
  });

  it('pauses when a non spotify song takes over', () => {
    expect(externalAction(tl, 120, 0)).toEqual({ kind: 'pause' });
    expect(externalAction(tl, 120, null)).toEqual({ kind: 'none' });
  });

  it('switches directly from one spotify song to the next', () => {
    expect(externalAction(tl, 160, 0)).toMatchObject({ kind: 'play', index: 2 });
  });

  it('pauses after the last song and ignores songs without a uri', () => {
    expect(externalAction(tl, 240, 2)).toEqual({ kind: 'pause' });
    const broken = buildTimeline([{ id: 'x', trackId: 'n', type: 'flat' }], [{ ...track('n', 'spotify', 50), spotifyUri: undefined }]);
    expect(externalAction(broken, 1, null)).toEqual({ kind: 'none' });
  });

  it('detects timelines that need the outside player', () => {
    expect(usesExternalPlayer(tl)).toBe(true);
    expect(usesExternalPlayer(buildTimeline([{ id: 'b', trackId: 'syn', type: 'flat' }], tracks))).toBe(false);
  });
});
