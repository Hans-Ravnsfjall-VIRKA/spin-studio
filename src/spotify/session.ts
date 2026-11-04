import type { Tokens } from '../models/spotifyAuthModel';

const SESSION_KEY = 'spin-studio.spotify.session.v1';
const CLIENT_KEY = 'spin-studio.spotify.client.v1';
const PENDING_KEY = 'spin-studio.spotify.pending';

export interface PendingLogin {
  verifier: string;
  state: string;
  redirectUri: string;
  clientId: string;
}

function readJson<T>(store: Storage, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(store: Storage, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked, the sign-in just will not persist */
  }
}

export function loadClientId(): string {
  try {
    return localStorage.getItem(CLIENT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveClientId(id: string): void {
  try {
    localStorage.setItem(CLIENT_KEY, id);
  } catch {
    /* ignore */
  }
}

export const loadSession = (): Tokens | null => readJson<Tokens>(localStorage, SESSION_KEY);
export const saveSession = (tokens: Tokens): void => writeJson(localStorage, SESSION_KEY, tokens);

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export const loadPending = (): PendingLogin | null => readJson<PendingLogin>(sessionStorage, PENDING_KEY);
export const savePending = (p: PendingLogin): void => writeJson(sessionStorage, PENDING_KEY, p);

export function clearPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
