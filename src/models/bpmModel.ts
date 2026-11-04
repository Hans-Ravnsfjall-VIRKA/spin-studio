export interface BpmAnalysis {
  bpm: number;
  /** Seconds from the start of the audio to the first beat, 0 up to one beat period. */
  offset: number;
  /** 0 to 1, rough. Low values mean the tempo is a guess. */
  confidence: number;
}

export const BPM_FOLD_MIN = 80;
export const BPM_FOLD_MAX = 160;

const ANALYSIS_WINDOW_SEC = 40;
const MIN_AUDIO_SEC = 3;
const COARSE_STEP = 0.02;
const FINE_STEP = 0.002;
const FINE_SPAN = 0.04;

interface Envelope {
  env: Float32Array;
  frameRate: number;
  hop: number;
  frame: number;
}

/** Positive log energy flux, smoothed. One value per hop. */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): Envelope {
  const hop = Math.max(32, Math.round(sampleRate / 150));
  const frame = hop * 2;
  const nFrames = Math.max(0, Math.floor((samples.length - frame) / hop) + 1);
  const energy = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    let sum = 0;
    const start = i * hop;
    for (let j = 0; j < frame; j++) {
      const v = samples[start + j];
      sum += v * v;
    }
    energy[i] = Math.log(1 + 1000 * Math.sqrt(sum / frame));
  }
  const flux = new Float32Array(nFrames);
  for (let i = 1; i < nFrames; i++) {
    const d = energy[i] - energy[i - 1];
    flux[i] = d > 0 ? d : 0;
  }
  const kernel = [1, 2, 3, 2, 1];
  const norm = 9;
  const env = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < nFrames) s += flux[idx] * kernel[k + 2];
    }
    env[i] = s / norm;
  }
  return { env, frameRate: sampleRate / hop, hop, frame };
}

/** Best comb score over all phases for a period given in frames. */
function combScore(env: Float32Array, period: number): { score: number; phase: number } {
  const n = env.length;
  let best = -1;
  let bestPhase = 0;
  const phases = Math.max(1, Math.floor(period));
  for (let p = 0; p < phases; p++) {
    let sum = 0;
    let count = 0;
    for (let pos = p; pos < n; pos += period) {
      sum += env[Math.round(pos)] ?? 0;
      count++;
    }
    const mean = count > 0 ? sum / count : 0;
    if (mean > best) {
      best = mean;
      bestPhase = p;
    }
  }
  return { score: best, phase: bestPhase };
}

export function foldBpm(bpm: number): number {
  let b = bpm;
  if (!Number.isFinite(b) || b <= 0) return 120;
  while (b < BPM_FOLD_MIN) b *= 2;
  while (b >= BPM_FOLD_MAX) b /= 2;
  return b;
}

/**
 * Estimate tempo and first beat position from mono samples.
 * Looks at up to 40 seconds from the middle of the song, scans a comb filter
 * over 80 to 160 BPM, then refines. Returns null for audio shorter than 3 seconds.
 * Tempo is folded into 80 to 160, so half and double time can be fixed by the user.
 */
export function detectBpm(samples: Float32Array, sampleRate: number): BpmAnalysis | null {
  if (samples.length < MIN_AUDIO_SEC * sampleRate) return null;

  const windowSamples = Math.min(samples.length, Math.round(ANALYSIS_WINDOW_SEC * sampleRate));
  const startSample = Math.max(0, Math.floor((samples.length - windowSamples) / 2));
  const windowed = samples.subarray(startSample, startSample + windowSamples);
  const { env, frameRate, hop, frame } = onsetEnvelope(windowed, sampleRate);
  if (env.length < 10) return null;

  const periodFor = (bpm: number) => (60 * frameRate) / bpm;

  let bestBpm = 120;
  let bestScore = -1;
  let total = 0;
  let count = 0;
  for (let bpm = BPM_FOLD_MIN; bpm < BPM_FOLD_MAX; bpm += COARSE_STEP) {
    const { score } = combScore(env, periodFor(bpm));
    total += score;
    count++;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  if (bestScore <= 0) return { bpm: 120, offset: 0, confidence: 0 };

  const coarse = bestBpm;
  for (let bpm = coarse - FINE_SPAN; bpm <= coarse + FINE_SPAN; bpm += FINE_STEP) {
    if (bpm < BPM_FOLD_MIN || bpm >= BPM_FOLD_MAX) continue;
    const { score } = combScore(env, periodFor(bpm));
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  const mean = total / count;
  const confidence = Math.max(0, Math.min(1, (bestScore - mean) / bestScore));

  const period = periodFor(bestBpm);
  const { phase } = combScore(env, period);
  // The flux peak sits in the first frame that contains the onset, which is
  // about three quarters of a frame after the frame start.
  const windowStartSec = startSample / sampleRate;
  const onsetSec = windowStartSec + (phase * hop + 0.75 * frame) / sampleRate;
  const beatSec = 60 / bestBpm;
  const offset = ((onsetSec % beatSec) + beatSec) % beatSec;

  return {
    bpm: Math.round(bestBpm * 10) / 10,
    offset,
    confidence,
  };
}

/** Average all channels into one mono Float32Array. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const out = new Float32Array(len);
  for (const ch of channels) {
    for (let i = 0; i < len; i++) out[i] += ch[i];
  }
  const inv = 1 / channels.length;
  for (let i = 0; i < len; i++) out[i] *= inv;
  return out;
}
