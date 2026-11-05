/**
 * How Spotify songs reach the speakers.
 * auto: this app starts each song in Spotify.
 * manual: the instructor starts each song in the Spotify app, and this app shows the program and holds between songs.
 */
export type MusicMode = 'auto' | 'manual';

export function parseMusicMode(value: unknown): MusicMode | null {
  return value === 'auto' || value === 'manual' ? value : null;
}

/**
 * In Safari on an iPhone, Spotify cannot be controlled reliably, so start with manual.
 * The installed app uses Spotify's iOS SDK and plays on its own.
 */
export function defaultMusicMode(remote: boolean, native = false): MusicMode {
  return remote && !native ? 'manual' : 'auto';
}
