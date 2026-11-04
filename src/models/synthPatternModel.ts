export type DrumVoice = 'kick' | 'clap' | 'hat' | 'ghost';

export interface StepEvents {
  drums: DrumVoice[];
  /** MIDI note or null. */
  bass: number | null;
  /** MIDI note or null. */
  lead: number | null;
  /** True on the first step of a bar. */
  accent: boolean;
}

/** Semitone offsets of the chord root per bar, a four bar loop. */
export const CHORD_OFFSETS = [0, -4, -7, -2];
const ARP = [0, 3, 7, 12];

export const STEPS_PER_BAR = 16;

/** Seconds per sixteenth note step. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Deterministic pattern. The kick falls on every beat at every energy level so
 * riders can always pedal to it. Higher energy adds claps, hats, octave bass and a lead arpeggio.
 */
export function stepEvents(stepIndex: number, root: number, energy: number): StepEvents {
  const inBar = ((stepIndex % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  const bar = Math.floor(stepIndex / STEPS_PER_BAR);
  const chord = CHORD_OFFSETS[((bar % CHORD_OFFSETS.length) + CHORD_OFFSETS.length) % CHORD_OFFSETS.length];

  const drums: DrumVoice[] = [];
  if (inBar % 4 === 0) drums.push('kick');
  if (energy >= 2 && (inBar === 4 || inBar === 12)) drums.push('clap');
  if (inBar % 4 === 2) drums.push('hat');
  if (energy >= 4 && inBar % 2 === 1) drums.push('ghost');

  let bass: number | null = null;
  if (inBar % 4 === 2) {
    bass = root + chord;
    if (energy >= 3 && (inBar === 6 || inBar === 14)) bass += 12;
  }

  let lead: number | null = null;
  if (energy >= 4 && inBar % 2 === 0) {
    lead = root + 24 + chord + ARP[(inBar / 2) % ARP.length];
  } else if (energy === 3 && inBar % 4 === 3) {
    lead = root + 24 + chord + ARP[((inBar - 3) / 4) % ARP.length];
  }

  return { drums, bass, lead, accent: inBar === 0 };
}
