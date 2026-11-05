import type { ExternalPlayer } from '../audio/engine';
import { isIos } from '../models/platformModel';
import { needsRefresh, type Tokens } from '../models/spotifyAuthModel';
import {
  SPOTIFY_PAGE_SIZE,
  hasMorePages,
  normalizePlaylistItems,
  normalizeDevices,
  normalizePlaylists,
  normalizeSpotifySearch,
  spotifyPlaylistItemsPath,
  spotifyPlaylistsPath,
  spotifySearchPath,
  type SpotifyDevice,
  type SpotifyPlaylistInfo,
  type SpotifyTrackInfo,
} from '../models/spotifyModel';
import { refreshTokens } from './auth';
import { clearSession, loadClientId, loadSession } from './session';

interface SpEvent {
  device_id?: string;
  message?: string;
}

interface SpPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: SpEvent) => void): boolean;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  activateElement(): Promise<void>;
}

interface SpPlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

declare global {
  interface Window {
    Spotify?: { Player: new (options: SpPlayerOptions) => SpPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const API = 'https://api.spotify.com/v1';
const MAX_PLAYLIST_PAGES = 6;
const MAX_LIST_PAGES = 4;

export interface SpotifySnapshot {
  phase: 'off' | 'connecting' | 'ready' | 'error';
  message: string;
  displayName: string;
  product: string;
  /** True when this browser cannot play Spotify itself (iPhone, iPad). The Spotify app on a device plays instead. */
  remote: boolean;
  /** Name of the device chosen to play on, in remote mode. */
  deviceName: string;
}

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('The Spotify player did not load. Check your connection.')), 15000);
    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('The Spotify player could not be loaded. An ad blocker may be stopping it.'));
    };
    document.body.appendChild(script);
  });
}

function apiError(res: Response): Error {
  switch (res.status) {
    case 401:
      return new Error('Your Spotify sign-in expired. Connect again.');
    case 403:
      return new Error(
        'Spotify refused this (403). You need Premium, your account must be added under User Management in the Spotify developer dashboard, and some playlists can only be read by their owner.',
      );
    case 404:
      return new Error('Spotify could not find that. Reload the page and connect again.');
    case 429:
      return new Error('Spotify says too many requests. Wait a minute and try again.');
    default:
      return new Error(`Spotify answered with an error (${res.status}).`);
  }
}

class SpotifyController implements ExternalPlayer {
  private snap: SpotifySnapshot = { phase: 'off', message: '', displayName: '', product: '', remote: false, deviceName: '' };
  private listeners = new Set<() => void>();
  private player: SpPlayer | null = null;
  private deviceId: string | null = null;
  private starting: Promise<void> | null = null;
  private refreshing: Promise<Tokens> | null = null;
  private volume = 0.9;
  private remoteId: string | null = null;

  private activeDevice(): string | null {
    return this.snap.remote ? this.remoteId : this.deviceId;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SpotifySnapshot => this.snap;

  private set(patch: Partial<SpotifySnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  reportError(message: string): void {
    this.set({ phase: 'error', message });
  }

  hasSession(): boolean {
    return loadSession() !== null;
  }

  isReady(): boolean {
    return this.snap.phase === 'ready' && this.activeDevice() !== null;
  }

  /** Starts the player when a sign-in is already stored. */
  resumeIfSignedIn(): void {
    if (this.hasSession() && this.snap.phase === 'off') void this.start();
  }

  start(): Promise<void> {
    if (!this.starting) {
      this.starting = this.doStart().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  private async doStart(): Promise<void> {
    this.set({ phase: 'connecting', message: 'Connecting to Spotify...' });
    try {
      const me = await this.api<{ display_name?: string; product?: string }>('/me');
      const product = me.product ?? '';
      const displayName = me.display_name ?? '';
      if (product !== 'premium') {
        this.set({
          phase: 'error',
          displayName,
          product,
          message: 'Playing music in this app needs Spotify Premium. This account is on the free plan.',
        });
        return;
      }
      const remote = isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
      if (remote) {
        // Safari on iPhone cannot run Spotify's player. The Spotify app does the playing.
        this.set({ phase: 'ready', message: '', displayName, product, remote: true });
        return;
      }
      await loadSdk();
      await this.createPlayer();
      this.set({ phase: 'ready', message: '', displayName, product, remote: false });
    } catch (err) {
      this.set({ phase: 'error', message: err instanceof Error ? err.message : 'Could not connect to Spotify.' });
    }
  }

  private createPlayer(): Promise<void> {
    if (this.player) {
      this.player.disconnect();
      this.player = null;
      this.deviceId = null;
    }
    return new Promise<void>((resolve, reject) => {
      const sdk = window.Spotify;
      if (!sdk) {
        reject(new Error('The Spotify player did not load.'));
        return;
      }
      const timer = window.setTimeout(() => reject(new Error('The Spotify player did not start in time.')), 15000);
      const fail = (message: string) => {
        window.clearTimeout(timer);
        this.set({ phase: 'error', message });
        reject(new Error(message));
      };
      const player = new sdk.Player({
        name: 'Spin Studio',
        volume: this.volume,
        getOAuthToken: (cb) => {
          void this.token()
            .then(cb)
            .catch((e: unknown) => this.reportError(e instanceof Error ? e.message : 'Sign-in problem.'));
        },
      });
      player.addListener('ready', (d) => {
        window.clearTimeout(timer);
        this.deviceId = d.device_id ?? null;
        resolve();
      });
      player.addListener('not_ready', () => {
        this.deviceId = null;
      });
      player.addListener('initialization_error', (d) => fail(d.message ?? 'This browser cannot play Spotify.'));
      player.addListener('authentication_error', (d) => fail(d.message ?? 'Spotify sign-in problem.'));
      player.addListener('account_error', (d) => fail(d.message ?? 'This Spotify account cannot stream here.'));
      player.addListener('playback_error', (d) => this.set({ message: d.message ?? 'Spotify could not play that song.' }));
      this.player = player;
      void player.connect();
    });
  }

  /* ---------- tokens and requests ---------- */

  private async token(force = false): Promise<string> {
    const session = loadSession();
    if (!session) throw new Error('Not signed in to Spotify.');
    if (!force && !needsRefresh(session.expiresAt, Date.now())) return session.accessToken;
    if (!this.refreshing) {
      this.refreshing = refreshTokens(loadClientId(), session.refreshToken).finally(() => {
        this.refreshing = null;
      });
    }
    return (await this.refreshing).accessToken;
  }

  private async request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const token = await this.token(!retry);
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401 && retry) return this.request(path, init, false);
    return res;
  }

  private async api<T>(path: string): Promise<T> {
    const res = await this.request(path);
    if (!res.ok) throw apiError(res);
    return (await res.json()) as T;
  }

  /* ---------- library access ---------- */

  async search(query: string, offset = 0): Promise<SpotifyTrackInfo[]> {
    return normalizeSpotifySearch(await this.api<unknown>(spotifySearchPath(query, offset)));
  }

  async listPlaylists(): Promise<SpotifyPlaylistInfo[]> {
    const out: SpotifyPlaylistInfo[] = [];
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const json = await this.api<unknown>(spotifyPlaylistsPath(page * SPOTIFY_PAGE_SIZE));
      out.push(...normalizePlaylists(json));
      if (!hasMorePages(json)) break;
    }
    return out;
  }

  async playlistName(playlistId: string): Promise<string> {
    const json = await this.api<{ name?: unknown }>(`/playlists/${encodeURIComponent(playlistId)}?fields=name`);
    return typeof json.name === 'string' && json.name ? json.name : 'Playlist';
  }

  async playlistTracks(playlistId: string): Promise<SpotifyTrackInfo[]> {
    const out: SpotifyTrackInfo[] = [];
    let kind: 'items' | 'tracks' = 'items';
    for (let page = 0; page < MAX_PLAYLIST_PAGES; page++) {
      const offset = page * SPOTIFY_PAGE_SIZE;
      let res = await this.request(spotifyPlaylistItemsPath(playlistId, offset, kind));
      if (res.status === 404 && kind === 'items' && page === 0) {
        kind = 'tracks';
        res = await this.request(spotifyPlaylistItemsPath(playlistId, offset, kind));
      }
      if (!res.ok) throw apiError(res);
      const json: unknown = await res.json();
      out.push(...normalizePlaylistItems(json));
      if (!hasMorePages(json)) break;
    }
    return out;
  }

  /* ---------- ExternalPlayer ---------- */

  /** Must run inside a click so the browser allows sound later. */
  activate(): void {
    void this.player?.activateElement().catch(() => undefined);
  }

  async play(uri: string, positionSec: number): Promise<void> {
    const device = this.activeDevice();
    if (!device) throw new Error('Spotify is not connected. Open the Spotify tab, connect and pick where to play.');
    const send = () =>
      this.request(`/me/player/play?device_id=${encodeURIComponent(device)}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [uri], position_ms: Math.round(positionSec * 1000) }),
      });
    let res = await send();
    if (this.snap.remote && [404, 502, 503].includes(res.status)) {
      // The Spotify app on the phone is asleep or not the active device. Wake it by moving playback to it, then try again.
      await this.request('/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [device], play: false }),
      }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 1200));
      res = await send();
      if (!res.ok && res.status !== 204) {
        throw new Error(
          `Spotify could not reach ${this.snap.deviceName || 'the device'} (${res.status}). Open the Spotify app on it, play any song for a few seconds, then try again.`,
        );
      }
      return;
    }
    if (!res.ok && res.status !== 204) throw apiError(res);
  }

  async pause(): Promise<void> {
    if (this.snap.remote) {
      const device = this.remoteId;
      if (device) await this.request(`/me/player/pause?device_id=${encodeURIComponent(device)}`, { method: 'PUT' });
      return;
    }
    await this.player?.pause();
  }

  async resume(): Promise<void> {
    if (this.snap.remote) {
      const device = this.remoteId;
      if (device) await this.request(`/me/player/play?device_id=${encodeURIComponent(device)}`, { method: 'PUT' });
      return;
    }
    await this.player?.resume();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.snap.remote) {
      const device = this.remoteId;
      if (device) {
        void this.request(
          `/me/player/volume?volume_percent=${Math.round(volume * 100)}&device_id=${encodeURIComponent(device)}`,
          { method: 'PUT' },
        ).catch(() => undefined);
      }
      return;
    }
    void this.player?.setVolume(volume).catch(() => undefined);
  }

  /* ---------- playing on another device ---------- */

  async devices(): Promise<SpotifyDevice[]> {
    return normalizeDevices(await this.api<unknown>('/me/player/devices'));
  }

  chooseDevice(device: SpotifyDevice | null): void {
    this.remoteId = device ? device.id : null;
    this.set({ deviceName: device ? device.name : '' });
  }

  logout(): void {
    this.player?.disconnect();
    this.player = null;
    this.deviceId = null;
    this.remoteId = null;
    clearSession();
    this.set({ phase: 'off', message: '', displayName: '', product: '', remote: false, deviceName: '' });
  }
}

export const spotify = new SpotifyController();
