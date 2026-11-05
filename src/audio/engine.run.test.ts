import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline } from '../models/classPlanModel';
import type { Track } from '../models/trackModel';

const node = (): unknown =>
  new Proxy(function () {}, {
    get: (_t, p) => (p === 'then' ? undefined : node()),
    apply: () => node(),
    set: () => true,
  });

class FakeCtx {
  currentTime = 0;
  state = 'suspended';
  destination = node();
  async resume() {
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  createGain = () => node();
  createDynamicsCompressor = () => node();
  createBuffer = () => node();
  createBufferSource = () => node();
  createOscillator = () => node();
  createBiquadFilter = () => node();
  sampleRate = 44100;
}

const synth = (id: string, duration: number): Track => ({
  id, title: id, artist: 'x', bpm: 120, duration, beatOffset: 0, energy: 3, source: 'synth', synthRoot: 43,
});

let ctx: FakeCtx;
let audioCreated = 0;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  ctx = new FakeCtx();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = globalThis;
  g.AudioContext = function () {
    return ctx;
  };
  audioCreated = 0;
  g.Audio = class {
    constructor() {
      audioCreated++;
    }
    loop = false;
    setAttribute() {}
    play() {
      return Promise.resolve();
    }
  };
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
});
afterEach(() => vi.useRealTimers());

async function tickTo(seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / 0.04); i++) {
    if (ctx.state === 'running') ctx.currentTime += 0.04;
    await vi.advanceTimersByTimeAsync(40);
  }
}

describe('ClassEngine run', () => {
  it('leaves the phone audio alone when every song is Spotify', async () => {
    const { ClassEngine } = await import('./engine');
    const sp = (id: string): Track => ({ ...synth(id, 10), source: 'spotify', spotifyUri: `spotify:track:${id}` });
    const tl = buildTimeline([{ id: '1', trackId: 'a', type: 'flat' }], [sp('a')]);
    const engine = new ClassEngine();
    const calls: string[] = [];
    engine.setExternal({
      isReady: () => true,
      play: async (uri) => void calls.push(uri),
      pause: async () => undefined,
      resume: async () => undefined,
      setVolume: () => undefined,
    });
    engine.load(tl, async () => null);
    await engine.toggle();
    await tickTo(1);
    expect(audioCreated).toBe(0);
    expect(calls).toEqual(['spotify:track:a']);
  });

  it('plays, holds at the end of a song, and continues on resume', async () => {
    const { ClassEngine } = await import('./engine');
    const tracks = [synth('a', 10), synth('b', 10)];
    const tl = buildTimeline(
      [{ id: '1', trackId: 'a', type: 'flat' }, { id: '2', trackId: 'b', type: 'flat' }],
      tracks,
    );
    const engine = new ClassEngine();
    engine.setPauseBetween(true);
    engine.load(tl, async () => null);
    await engine.toggle();
    expect(engine.getStatus()).toBe('playing');
    await tickTo(5);
    expect(engine.getStatus()).toBe('playing');
    await tickTo(6);
    expect(engine.getStatus()).toBe('paused');
    expect(engine.isHolding()).toBe(true);
    expect(engine.elapsed).toBeGreaterThanOrEqual(10);
    expect(engine.elapsed).toBeLessThan(10.2);
    await engine.toggle();
    expect(engine.getStatus()).toBe('playing');
    expect(engine.isHolding()).toBe(false);
    await tickTo(11);
    expect(engine.getStatus()).toBe('finished');
  });

  it('does not hold when stop between songs is off', async () => {
    const { ClassEngine } = await import('./engine');
    const tl = buildTimeline(
      [{ id: '1', trackId: 'a', type: 'flat' }, { id: '2', trackId: 'b', type: 'flat' }],
      [synth('a', 10), synth('b', 10)],
    );
    const engine = new ClassEngine();
    engine.setPauseBetween(false);
    engine.load(tl, async () => null);
    await engine.toggle();
    await tickTo(12);
    expect(engine.getStatus()).toBe('playing');
  });
});
