import { STEPS_PER_BAR, midiToFreq, stepDuration, stepEvents } from '../models/synthPatternModel';
import type { TimelineEntry } from '../models/classPlanModel';
import { holdPointAt, totalDuration } from '../models/classPlanModel';
import { externalAction } from '../models/externalPlayModel';
import type { Track } from '../models/trackModel';
import { getAudioContext, unlockAudio } from './context';
import {
  makeNoiseBuffer,
  playBass,
  playClap,
  playHat,
  playKick,
  playLead,
} from './synthVoices';

export type EngineStatus = 'idle' | 'playing' | 'paused' | 'finished';

export type BufferLoader = (track: Track) => Promise<AudioBuffer | null>;

/** A player the browser audio clock cannot schedule, such as Spotify's. */
export interface ExternalPlayer {
  isReady(): boolean;
  play(uri: string, positionSec: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(volume: number): void;
}

const TICK_MS = 40;
/** iOS can leave an audio context call pending while another app has the sound. Never wait on it for long. */
function settle(p: Promise<void>, ms = 500): Promise<void> {
  return Promise.race([p.catch(() => undefined), new Promise<void>((resolve) => window.setTimeout(resolve, ms))]);
}
/** Longest the class clock waits for the first Spotify song to start. */
const START_WAIT_MS = 6000;
const LOOKAHEAD_SEC = 0.25;
/** Start loading a file this many seconds before it is needed. */
const PRELOAD_SEC = 25;

/**
 * Plays a class timeline. Synth songs are scheduled step by step on the audio
 * clock. File songs are decoded just in time, started on the audio clock, and
 * released after they finish, so a full class never holds every song in memory.
 *
 * Class time is the clock minus t0. The clock is ctx.currentTime, and suspending the
 * context freezes it, which is how pause works. A class of only Spotify songs plays no
 * sound here, so it uses the wall clock: iOS interrupts the audio context while the
 * Spotify app is in front, and an interrupted context would freeze the countdown.
 */
export class ClassEngine {
  private timeline: TimelineEntry[] = [];
  private loader: BufferLoader | null = null;
  private status: EngineStatus = 'idle';
  private t0 = 0;
  private epoch = 0;
  private timer: number | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.9;
  private sources: AudioBufferSourceNode[] = [];
  private synthNext = new Map<number, number>();
  private fileStarted = new Set<number>();
  private buffers = new Map<string, AudioBuffer>();
  private external: ExternalPlayer | null = null;
  /** Index of the timeline entry the external player is playing, or null. */
  private extActive: number | null = null;
  private wall = false;
  private pausedElapsed = 0;

  /** When true the class waits at the end of each song until the instructor presses play. */
  pauseBetween = false;
  private holdAt: number | null = null;
  private holding = false;

  onFinished: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;

  getStatus(): EngineStatus {
    return this.status;
  }

  /** What the browser's audio is doing, for the More panel. */
  audioState(): string {
    try {
      return getAudioContext().state;
    } catch {
      return 'unavailable';
    }
  }

  /** True while the class waits between two songs. */
  isHolding(): boolean {
    return this.holding && this.status === 'paused';
  }

  setPauseBetween(on: boolean): void {
    this.pauseBetween = on;
    this.updateHold(this.elapsed);
  }

  private updateHold(elapsed: number): void {
    this.holdAt = this.pauseBetween ? holdPointAt(this.timeline, elapsed) : null;
  }

  getTimeline(): TimelineEntry[] {
    return this.timeline;
  }

  setExternal(player: ExternalPlayer | null): void {
    this.external = player;
  }

  get total(): number {
    return totalDuration(this.timeline);
  }

  private lastCtx = 0;
  private lastWall = 0;
  private interrupted = false;

  /**
   * Class clock. Normally the audio clock. While iOS has interrupted the audio context (the
   * Spotify app is in front) the audio clock stands still, so the wall clock keeps time and
   * the class clock stays continuous when the audio clock comes back.
   */
  private now(): number {
    const w = performance.now() / 1000;
    if (this.wall) return w;
    const ctx = getAudioContext();
    if (ctx.state === 'running') {
      if (this.interrupted) {
        const e = this.lastCtx + (w - this.lastWall);
        this.t0 += ctx.currentTime - e;
        this.interrupted = false;
      }
      this.lastCtx = ctx.currentTime;
      this.lastWall = w;
      return ctx.currentTime;
    }
    if (this.status === 'playing') {
      this.interrupted = true;
      return this.lastCtx + (w - this.lastWall);
    }
    return this.lastCtx;
  }

  get elapsed(): number {
    if (this.status === 'idle') return 0;
    if (this.status === 'finished') return this.total;
    if (this.wall && this.status === 'paused') return Math.max(0, Math.min(this.total, this.pausedElapsed));
    const t = this.now() - this.t0;
    return Math.max(0, Math.min(this.total, t));
  }

  load(timeline: TimelineEntry[], loader: BufferLoader): void {
    this.teardown();
    this.holding = false;
    this.timeline = timeline;
    this.loader = loader;
    this.status = 'idle';
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.value = this.volume;
    this.external?.setVolume(this.volume);
  }

  async play(fromElapsed = 0): Promise<void> {
    if (this.timeline.length === 0) return;
    // Taking over the phone's audio would stop the Spotify app, so only do it for songs this page plays.
    // A class of only Spotify songs must not take over the phone's audio, or the Spotify app goes quiet.
    console.log('[engine] play pressed');
    // Any Spotify song in the class means sharing the phone's audio with the Spotify app.
    unlockAudio(!this.timeline.some((e) => e.track.source === 'spotify'));
    const ctx = getAudioContext();
    this.wall = this.timeline.every((e) => e.track.source === 'spotify');
    this.ensureGraph(ctx);
    if (this.wall) void ctx.resume().catch(() => undefined);
    else await settle(ctx.resume());
    const start = Math.max(0, Math.min(fromElapsed, this.total - 0.001));
    // A song that starts right away is started first, so the countdown begins when the music does.
    // Connecting to the Spotify app can take a few seconds the first time.
    const first = this.external ? externalAction(this.timeline, start, null) : { kind: 'none' as const };
    let startedIdx: number | null = null;
    if (first.kind === 'play' && this.external) {
      startedIdx = first.index;
      // Wait for Spotify, but never more than a few seconds: the class clock must start.
      const sent = this.external.play(first.uri, first.positionSec).catch((err: unknown) => {
        this.onError?.(err instanceof Error && err.message ? err.message : 'Spotify could not start the song.');
      });
      await Promise.race([sent, new Promise<void>((resolve) => window.setTimeout(resolve, START_WAIT_MS))]);
      void ctx.resume().catch(() => undefined);
    }
    console.log(`[engine] clock starts, wall=${this.wall}, audio=${ctx.state}`);
    // Anchor the fallback clock to the audio clock before the first reading.
    this.lastCtx = ctx.currentTime;
    this.lastWall = performance.now() / 1000;
    this.interrupted = false;
    this.t0 = this.now() - start;
    this.status = 'playing';
    this.holding = false;
    this.updateHold(start);
    this.schedule(start, startedIdx);
    this.startTimer();
  }

  async pause(): Promise<void> {
    if (this.status !== 'playing') return;
    if (this.wall) this.pausedElapsed = this.now() - this.t0;
    else await settle(getAudioContext().suspend());
    this.status = 'paused';
    await this.pauseExternal();
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return;
    if (this.wall) this.t0 = this.now() - this.pausedElapsed;
    else await settle(getAudioContext().resume());
    this.status = 'playing';
    this.holding = false;
    this.updateHold(this.elapsed);
    if (this.extActive !== null && this.external) {
      try {
        await this.external.resume();
      } catch {
        // Spotify lost the song: start it again at the right place.
        this.extActive = null;
        this.tickExternal(this.elapsed);
      }
    }
  }

  async toggle(): Promise<void> {
    if (this.status === 'playing') await this.pause();
    else if (this.status === 'paused') await this.resume();
    else await this.play(0);
  }

  async seek(elapsed: number): Promise<void> {
    if (this.status === 'idle' || this.status === 'finished') {
      await this.play(elapsed);
      return;
    }
    const target = Math.max(0, Math.min(elapsed, this.total - 0.001));
    this.t0 = this.now() - target;
    this.updateHold(target);
    this.schedule(target);
  }

  async stop(): Promise<void> {
    this.holding = false;
    this.teardown();
    this.status = 'idle';
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await settle(ctx.resume());
  }

  /* ---------- internals ---------- */

  private ensureGraph(ctx: AudioContext): void {
    if (this.master) return;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(compressor).connect(ctx.destination);
    this.noise = makeNoiseBuffer(ctx);
  }

  private clearSources(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    this.sources = [];
    if (this.bus) {
      this.bus.disconnect();
      this.bus = null;
    }
    this.synthNext.clear();
    this.fileStarted.clear();
    if (this.extActive !== null) {
      void this.pauseExternal();
      this.extActive = null;
    }
  }

  private async pauseExternal(): Promise<void> {
    if (this.extActive === null || !this.external) return;
    try {
      await this.external.pause();
    } catch {
      /* already paused or disconnected */
    }
  }

  private teardown(): void {
    this.epoch++;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.clearSources();
    this.buffers.clear();
  }

  private schedule(elapsed: number, externalStarted: number | null = null): void {
    const ctx = getAudioContext();
    this.epoch++;
    this.clearSources();
    // Clearing stops the outside player. A song that was just started there keeps playing.
    this.extActive = externalStarted;
    this.bus = ctx.createGain();
    this.bus.connect(this.master as GainNode);

    this.timeline.forEach((entry, idx) => {
      if (entry.end <= elapsed || entry.track.source !== 'synth') return;
      const sd = stepDuration(entry.track.bpm);
      const first = Math.max(0, Math.ceil((elapsed - entry.start) / sd - 1e-9));
      this.synthNext.set(idx, first);
    });
    this.tick();
  }

  private startTimer(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    if (this.status !== 'playing') return;
    const ctx = getAudioContext();
    // Switching to the Spotify app can interrupt the audio clock. Restart it when we are back.
    if (!this.wall && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    const elapsed = this.now() - this.t0;

    if (elapsed >= this.total) {
      this.finish();
      return;
    }

    if (this.holdAt !== null && elapsed >= this.holdAt) {
      void this.hold();
      return;
    }

    this.tickSynth(ctx);
    this.tickFiles(ctx, elapsed);
    this.tickExternal(elapsed);
    this.releaseBuffers(elapsed);
  }

  /** Wait at the end of a song. The next song starts when the instructor presses play. */
  private async hold(): Promise<void> {
    this.holdAt = null;
    this.holding = true;
    await this.pause();
    // The song just ended. Forget it so the next song starts fresh after resume.
    this.extActive = null;
  }

  private finish(): void {
    this.epoch++;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.clearSources();
    this.buffers.clear();
    this.status = 'finished';
    this.onFinished?.();
  }

  private tickSynth(ctx: AudioContext): void {
    const bus = this.bus;
    const noise = this.noise;
    if (!bus || !noise) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD_SEC;

    for (const [idx, startStep] of [...this.synthNext.entries()]) {
      const entry = this.timeline[idx];
      const track = entry.track;
      const sd = stepDuration(track.bpm);
      const root = track.synthRoot ?? 43;
      const endTime = this.t0 + entry.end;
      let step = startStep;

      for (;;) {
        const time = this.t0 + entry.start + step * sd;
        if (time >= endTime - 1e-6) {
          this.synthNext.delete(idx);
          break;
        }
        if (time > horizon) {
          this.synthNext.set(idx, step);
          break;
        }
        if (time >= now - 0.03) this.fireStep(ctx, bus, noise, track, step, root, Math.max(time, now), sd);
        step++;
      }
    }
  }

  private fireStep(
    ctx: AudioContext,
    bus: AudioNode,
    noise: AudioBuffer,
    track: Track,
    step: number,
    root: number,
    time: number,
    sd: number,
  ): void {
    const ev = stepEvents(step, root, track.energy);
    const bar = step % STEPS_PER_BAR === 0;
    for (const voice of ev.drums) {
      if (voice === 'kick') playKick(ctx, bus, time, bar ? 1 : 0.85);
      else if (voice === 'clap') playClap(ctx, bus, time, noise, 0.45);
      else if (voice === 'hat') playHat(ctx, bus, time, noise, 0.16, 0.06);
      else playHat(ctx, bus, time, noise, 0.07, 0.03);
    }
    if (ev.bass !== null) playBass(ctx, bus, time, midiToFreq(ev.bass), sd * 3, 0.3);
    if (ev.lead !== null) playLead(ctx, bus, time, midiToFreq(ev.lead), sd * 1.6, 0.08);
  }

  private tickFiles(ctx: AudioContext, elapsed: number): void {
    this.timeline.forEach((entry, idx) => {
      if (entry.track.source !== 'file') return;
      if (this.fileStarted.has(idx)) return;
      if (entry.end <= elapsed) return;
      if (entry.start - elapsed > PRELOAD_SEC) return;
      this.fileStarted.add(idx);
      void this.startFile(ctx, entry, this.epoch);
    });
  }

  private async startFile(ctx: AudioContext, entry: TimelineEntry, epoch: number): Promise<void> {
    let buffer = this.buffers.get(entry.track.id) ?? null;
    if (!buffer) {
      try {
        buffer = this.loader ? await this.loader(entry.track) : null;
      } catch {
        buffer = null;
      }
      if (epoch !== this.epoch) return;
      if (!buffer) {
        this.onError?.(`Could not load "${entry.track.title}". Skipping it.`);
        return;
      }
      this.buffers.set(entry.track.id, buffer);
    }
    const bus = this.bus;
    if (!bus || epoch !== this.epoch) return;

    const now = ctx.currentTime;
    const startAt = this.t0 + entry.start;
    let when = startAt;
    let offset = 0;
    if (startAt < now) {
      when = now;
      offset = now - startAt;
    }
    if (offset >= buffer.duration - 0.05) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(bus);
    src.start(when, offset);
    this.sources.push(src);
  }

  private tickExternal(elapsed: number): void {
    const ext = this.external;
    if (!ext) return;
    const action = externalAction(this.timeline, elapsed, this.extActive);
    if (action.kind === 'play') {
      this.extActive = action.index;
      const title = this.timeline[action.index].track.title;
      ext.play(action.uri, action.positionSec).catch((err: unknown) => {
        this.onError?.(err instanceof Error && err.message ? err.message : `Spotify could not play "${title}".`);
      });
    } else if (action.kind === 'pause') {
      this.extActive = null;
      ext.pause().catch(() => undefined);
    }
  }

  private releaseBuffers(elapsed: number): void {
    if (this.buffers.size === 0) return;
    const live = new Set<string>();
    for (const e of this.timeline) {
      if (e.track.source === 'file' && e.end > elapsed - 1) live.add(e.track.id);
    }
    for (const id of [...this.buffers.keys()]) {
      if (!live.has(id)) this.buffers.delete(id);
    }
  }
}
