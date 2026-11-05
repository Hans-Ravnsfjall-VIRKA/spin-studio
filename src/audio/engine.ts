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
const LOOKAHEAD_SEC = 0.25;
/** Start loading a file this many seconds before it is needed. */
const PRELOAD_SEC = 25;

/**
 * Plays a class timeline. Synth songs are scheduled step by step on the audio
 * clock. File songs are decoded just in time, started on the audio clock, and
 * released after they finish, so a full class never holds every song in memory.
 *
 * Class time is ctx.currentTime minus t0. Suspending the context freezes it,
 * which is how pause works.
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

  /** When true the class waits at the end of each song until the instructor presses play. */
  pauseBetween = false;
  private holdAt: number | null = null;
  private holding = false;

  onFinished: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;

  getStatus(): EngineStatus {
    return this.status;
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

  get elapsed(): number {
    if (this.status === 'idle') return 0;
    if (this.status === 'finished') return this.total;
    const t = getAudioContext().currentTime - this.t0;
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
    if (this.timeline.some((e) => e.track.source !== 'spotify')) unlockAudio();
    const ctx = getAudioContext();
    this.ensureGraph(ctx);
    await ctx.resume();
    const start = Math.max(0, Math.min(fromElapsed, this.total - 0.001));
    this.t0 = ctx.currentTime - start;
    this.status = 'playing';
    this.holding = false;
    this.updateHold(start);
    this.schedule(start);
    this.startTimer();
  }

  async pause(): Promise<void> {
    if (this.status !== 'playing') return;
    await getAudioContext().suspend();
    this.status = 'paused';
    await this.pauseExternal();
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return;
    await getAudioContext().resume();
    this.status = 'playing';
    this.holding = false;
    this.updateHold(this.elapsed);
    if (this.extActive !== null && this.external) {
      try {
        await this.external.resume();
      } catch {
        /* the next tick will not restart it, the rider can press play again */
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
    const ctx = getAudioContext();
    const target = Math.max(0, Math.min(elapsed, this.total - 0.001));
    this.t0 = ctx.currentTime - target;
    this.updateHold(target);
    this.schedule(target);
  }

  async stop(): Promise<void> {
    this.holding = false;
    this.teardown();
    this.status = 'idle';
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
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

  private schedule(elapsed: number): void {
    const ctx = getAudioContext();
    this.epoch++;
    this.clearSources();
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
    const elapsed = ctx.currentTime - this.t0;

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
