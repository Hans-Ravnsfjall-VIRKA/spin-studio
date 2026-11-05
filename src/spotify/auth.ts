import { Browser } from '@capacitor/browser';
import {
  NATIVE_REDIRECT_URI,
  SPOTIFY_TOKEN_URL,
  authCodeBody,
  authorizeUrl,
  parseRedirect,
  queryFromUrl,
  pkceChallenge,
  randomString,
  redirectUriFor,
  refreshBody,
  tokensFromResponse,
  type Tokens,
} from '../models/spotifyAuthModel';
import { isNativeApp } from '../native';
import { clearPending, clearSession, loadPending, saveClientId, savePending, saveSession } from './session';

/** Sends the browser to Spotify to sign in (authorization code flow with PKCE, no server needed). */
export async function beginLogin(clientId: string): Promise<void> {
  const verifier = randomString(crypto.getRandomValues(new Uint8Array(64)));
  const state = randomString(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = await pkceChallenge(verifier);
  const native = isNativeApp();
  const redirectUri = native ? NATIVE_REDIRECT_URI : redirectUriFor(window.location);
  saveClientId(clientId);
  savePending({ verifier, state, redirectUri, clientId });
  const url = authorizeUrl({ clientId, redirectUri, challenge, state });
  // In the installed app the sign-in opens in Safari and returns through the spinstudio:// link.
  if (native) await Browser.open({ url });
  else window.location.assign(url);
}

export type LoginResult = { kind: 'none' } | { kind: 'connected' } | { kind: 'error'; message: string };

async function postToken(body: string): Promise<unknown> {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Spotify refused the sign-in (${res.status}).`);
  return res.json();
}

/** Call once on page load. Completes a sign-in when the page was opened by Spotify's redirect. */
export async function finishLoginFromUrl(): Promise<LoginResult> {
  return finishLogin(window.location.search, true);
}

/** The installed app got a spinstudio://callback link back from Spotify. */
export async function finishLoginFromAppLink(url: string): Promise<LoginResult> {
  void Browser.close().catch(() => undefined);
  return finishLogin(queryFromUrl(url), false);
}

async function finishLogin(search: string, cleanAddress: boolean): Promise<LoginResult> {
  const pending = loadPending();
  const result = parseRedirect(search, pending ? pending.state : null);
  if (result.kind === 'none') return { kind: 'none' };

  // Clean the address first so a reload or a second call cannot reuse the one-time code.
  if (cleanAddress) window.history.replaceState(null, '', window.location.pathname);
  clearPending();
  if (result.kind === 'error') return { kind: 'error', message: result.message };
  if (!pending) return { kind: 'none' };

  try {
    const json = await postToken(
      authCodeBody({
        clientId: pending.clientId,
        code: result.code,
        verifier: pending.verifier,
        redirectUri: pending.redirectUri,
      }),
    );
    const tokens = tokensFromResponse(json, Date.now());
    if (!tokens) return { kind: 'error', message: 'Spotify sent an answer this app could not read.' };
    saveSession(tokens);
    return { kind: 'connected' };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'The Spotify sign-in failed.' };
  }
}

export async function refreshTokens(clientId: string, refreshToken: string): Promise<Tokens> {
  try {
    const json = await postToken(refreshBody({ clientId, refreshToken }));
    const tokens = tokensFromResponse(json, Date.now(), refreshToken);
    if (!tokens) throw new Error('unreadable');
    saveSession(tokens);
    return tokens;
  } catch {
    clearSession();
    throw new Error('Your Spotify sign-in expired. Connect again.');
  }
}
