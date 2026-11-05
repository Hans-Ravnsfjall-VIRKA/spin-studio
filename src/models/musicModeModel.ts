/**
 * How Spotify songs reach the speakers.
 * auto: this app starts each song in Spotify.
 * manual: the instructor starts each song in the Spotify app, and this app shows the program and holds between songs.
 */
export type MusicMode = 'auto' | 'manual';

export function parseMusicMode(value: unknown): MusicMode | null {
  return value === 'auto' || value === 'manual' ? value : null;
}

/** On an iPhone, Spotify cannot be controlled reliably from another app, so start with manual. */
export function defaultMusicMode(remote: boolean): MusicMode {
  return remote ? 'manual' : 'auto';
}
