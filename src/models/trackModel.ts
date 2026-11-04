export type TrackSource = 'synth' | 'file';

/** Attribution for tracks that came from a free music catalog. */
export interface TrackCredit {
  provider: 'openverse' | 'jamendo';
  creator: string;
  /** Short label such as "CC BY 4.0". */
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  /** Seconds. */
  duration: number;
  /** Seconds from the start of the song to the first beat. */
  beatOffset: number;
  /** 1 (calm) to 5 (all out). */
  energy: number;
  source: TrackSource;
  /** Synth tracks only: MIDI root note for the bass line. */
  synthRoot?: number;
  /** File tracks only: original file name. */
  fileName?: string;
  /** Present on tracks fetched from a free music catalog. */
  credit?: TrackCredit;
}

export const MIN_BPM = 40;
export const MAX_BPM = 220;

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 120;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm * 10) / 10));
}

export function clampEnergy(energy: number): number {
  if (!Number.isFinite(energy)) return 3;
  return Math.min(5, Math.max(1, Math.round(energy)));
}

/**
 * Bar count, in whole 8 bar phrases, that lands closest to the wanted length in
 * minutes. One bar is 4 beats, so duration in seconds is bars * 240 / bpm.
 */
export function phraseBars(bpm: number, minutes: number): number {
  const bars = (bpm * minutes) / 4;
  return Math.max(8, Math.round(bars / 8) * 8);
}

export function synthDuration(bars: number, bpm: number): number {
  return (bars * 4 * 60) / bpm;
}

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, '');
  const cleaned = base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : 'Untitled';
}

export interface AnalysisInput {
  id: string;
  fileName: string;
  duration: number;
  bpm: number;
  beatOffset: number;
  /** Overrides the title taken from the file name. */
  title?: string;
  artist?: string;
  credit?: TrackCredit;
}

export function trackFromAnalysis(input: AnalysisInput): Track {
  const title = input.title?.trim();
  const artist = input.artist?.trim();
  const track: Track = {
    id: input.id,
    title: title ? title : titleFromFileName(input.fileName),
    artist: artist ? artist : 'My music',
    bpm: clampBpm(input.bpm),
    duration: input.duration,
    beatOffset: Math.max(0, input.beatOffset),
    energy: 3,
    source: 'file',
    fileName: input.fileName,
  };
  if (input.credit) track.credit = input.credit;
  return track;
}
