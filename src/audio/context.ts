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

let unlocked = false;
let keepAlive: HTMLAudioElement | null = null;

/** A short silent WAV, so iOS treats the page as playing media. */
function silentWavUrl(): string {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * iPhone and iPad keep Web Audio quiet when the ring switch is on silent, and only
 * start it from a tap. Playing a silent media element and asking for the playback
 * audio session lifts both limits. Call this from a tap, before the first sound.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    /* not supported */
  }
  try {
    const el = new Audio(silentWavUrl());
    el.loop = true;
    el.setAttribute('playsinline', '');
    void el.play().then(
      () => {
        keepAlive = el;
        unlocked = true;
      },
      () => undefined,
    );
  } catch {
    /* the sound will still work with the ring switch on */
  }
  void keepAlive;
}
