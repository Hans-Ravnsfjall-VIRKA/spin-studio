/** Small drum and synth voices for the built in practice tracks. */

export function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  return buffer;
}

export function playKick(ctx: AudioContext, dest: AudioNode, t: number, gain = 1): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.3);
}

export function playClap(ctx: AudioContext, dest: AudioNode, t: number, noise: AudioBuffer, gain = 0.5): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  src.connect(filter).connect(g).connect(dest);
  src.start(t, 0.1);
  src.stop(t + 0.18);
}

export function playHat(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  noise: AudioBuffer,
  gain = 0.18,
  length = 0.05,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + length);
  src.connect(filter).connect(g).connect(dest);
  src.start(t, 0.3);
  src.stop(t + length + 0.02);
}

export function playBass(ctx: AudioContext, dest: AudioNode, t: number, freq: number, length: number, gain = 0.32): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(220, t + length);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(filter).connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

export function playLead(ctx: AudioContext, dest: AudioNode, t: number, freq: number, length: number, gain = 0.1): void {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(filter).connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + length + 0.02);
}
