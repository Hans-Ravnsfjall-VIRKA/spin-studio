import { useSyncExternalStore } from 'react';
import { spotify, type SpotifySnapshot } from './controller';

export function useSpotify(): SpotifySnapshot {
  return useSyncExternalStore(spotify.subscribe, spotify.getSnapshot, spotify.getSnapshot);
}
