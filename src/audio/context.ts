let ctx: AudioContext | null = null;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** One shared AudioContext for playback, preview and decoding. */
export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) throw new Error('This browser does not support Web Audio.');
    ctx = new Ctor({ latencyHint: 'playback' });
  }
  return ctx;
}
