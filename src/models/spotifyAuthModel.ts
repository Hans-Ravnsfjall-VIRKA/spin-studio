export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Maps random bytes to a string of letters and digits, one character per byte. */
export function randomString(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE S256 challenge: base64url of the SHA-256 of the verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** The address the installed iPhone app gets Spotify's answer on. Add it in the Spotify dashboard. */
export const NATIVE_REDIRECT_URI = 'spinstudio://callback';

/** The part after "?" of a link, so the web sign-in code can read an app link. */
export function queryFromUrl(url: string): string {
  const i = url.indexOf('?');
  if (i < 0) return '';
  const hash = url.indexOf('#', i);
  return url.slice(i, hash < 0 ? undefined : hash);
}

export function redirectUriFor(loc: { origin: string; pathname: string }): string {
  return `${loc.origin}${loc.pathname}`;
}

/** Spotify only accepts https redirects, or http on the loopback address 127.0.0.1. */
export function redirectUriProblem(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return 'This address is not valid.';
  }
  if (uri === NATIVE_REDIRECT_URI) return null;
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '[::1]')) return null;
  if (url.hostname === 'localhost') {
    return 'Spotify does not accept "localhost". Open the app at http://127.0.0.1 with the same port instead.';
  }
  return 'Spotify only accepts https addresses, or http://127.0.0.1 for local testing.';
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}

export function authorizeUrl(p: AuthorizeParams): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    scope: SPOTIFY_SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: p.challenge,
    redirect_uri: p.redirectUri,
    state: p.state,
  });
  return `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
}

export type RedirectResult =
  | { kind: 'none' }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string };

/**
 * Reads the query string Spotify sends the browser back with. Without a pending
 * sign-in (expectedState null) nothing is treated as a Spotify answer.
 */
export function parseRedirect(search: string, expectedState: string | null): RedirectResult {
  const p = new URLSearchParams(search);
  const error = p.get('error');
  const code = p.get('code');
  if (!error && !code) return { kind: 'none' };
  if (expectedState === null) return { kind: 'none' };
  if (p.get('state') !== expectedState) {
    return { kind: 'error', message: 'The Spotify sign-in could not be verified. Try connecting again.' };
  }
  if (error) {
    return {
      kind: 'error',
      message: error === 'access_denied' ? 'Spotify sign-in was cancelled.' : `Spotify sign-in failed (${error}).`,
    };
  }
  return { kind: 'code', code: code as string };
}

export function authCodeBody(p: { clientId: string; code: string; verifier: string; redirectUri: string }): string {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: p.verifier,
  }).toString();
}

export function refreshBody(p: { clientId: string; refreshToken: string }): string {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: p.refreshToken,
    client_id: p.clientId,
  }).toString();
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** Spotify may leave out refresh_token on a refresh, in which case the old one stays valid. */
export function tokensFromResponse(json: unknown, now: number, previousRefresh = ''): Tokens | null {
  if (json === null || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  const accessToken = typeof r.access_token === 'string' ? r.access_token : '';
  const expiresIn = typeof r.expires_in === 'number' ? r.expires_in : NaN;
  const refreshToken = typeof r.refresh_token === 'string' && r.refresh_token ? r.refresh_token : previousRefresh;
  if (!accessToken || !Number.isFinite(expiresIn) || !refreshToken) return null;
  return { accessToken, refreshToken, expiresAt: now + expiresIn * 1000 };
}

export function needsRefresh(expiresAt: number, now: number, skewMs = 60_000): boolean {
  return now >= expiresAt - skewMs;
}
