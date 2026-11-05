import { registerPlugin } from '@capacitor/core';

/** Spotify's own redirect for App Remote. Must match the dashboard exactly. */
export const APP_REMOTE_REDIRECT = 'spinstudio://spotify-callback';

interface SpotifyRemotePlugin {
  configure(options: { clientId: string; redirectUri: string }): Promise<void>;
  connect(options: { uri: string }): Promise<{ connected: boolean }>;
  play(options: { uri: string; positionSec: number }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;
  handleUrl(options: { url: string }): Promise<void>;
}

export const SpotifyRemote = registerPlugin<SpotifyRemotePlugin>('SpotifyRemote');

export function isAppRemoteLink(url: string): boolean {
  return url.startsWith(APP_REMOTE_REDIRECT);
}

let configuredFor = '';

export async function configureRemote(clientId: string): Promise<void> {
  if (configuredFor === clientId) return;
  await SpotifyRemote.configure({ clientId, redirectUri: APP_REMOTE_REDIRECT });
  configuredFor = clientId;
}
