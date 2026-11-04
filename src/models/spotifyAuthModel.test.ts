import { describe, expect, it } from 'vitest';
import {
  SPOTIFY_SCOPES,
  authCodeBody,
  authorizeUrl,
  base64Url,
  needsRefresh,
  parseRedirect,
  pkceChallenge,
  randomString,
  redirectUriFor,
  redirectUriProblem,
  refreshBody,
  tokensFromResponse,
} from './spotifyAuthModel';

describe('pkce helpers', () => {
  it('encodes base64url without padding', () => {
    expect(base64Url(new Uint8Array([251, 255, 254]))).toBe('-__-');
    expect(base64Url(new Uint8Array([255]))).toBe('_w');
    expect(base64Url(new Uint8Array([]))).toBe('');
  });

  it('builds random strings from the allowed alphabet', () => {
    const s = randomString(Uint8Array.from({ length: 64 }, (_, i) => i * 4));
    expect(s).toHaveLength(64);
    expect(s).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('matches the RFC 7636 challenge example', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('redirect uri', () => {
  it('joins origin and path', () => {
    expect(redirectUriFor({ origin: 'https://a.github.io', pathname: '/spin-studio/' })).toBe(
      'https://a.github.io/spin-studio/',
    );
  });

  it('accepts https and loopback, explains the rest', () => {
    expect(redirectUriProblem('https://a.github.io/spin-studio/')).toBeNull();
    expect(redirectUriProblem('http://127.0.0.1:5173/')).toBeNull();
    expect(redirectUriProblem('http://[::1]:5173/')).toBeNull();
    expect(redirectUriProblem('http://localhost:5173/')).toContain('127.0.0.1');
    expect(redirectUriProblem('http://example.com/')).toContain('https');
    expect(redirectUriProblem('nonsense')).toContain('not valid');
  });
});

describe('authorize url and bodies', () => {
  it('builds the authorize url', () => {
    const url = new URL(
      authorizeUrl({ clientId: 'cid', redirectUri: 'https://a.io/app/', challenge: 'chal', state: 'st' }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('redirect_uri')).toBe('https://a.io/app/');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(SPOTIFY_SCOPES);
  });

  it('includes playlist scopes', () => {
    expect(SPOTIFY_SCOPES).toContain('playlist-read-private');
    expect(SPOTIFY_SCOPES).toContain('streaming');
  });

  it('builds token request bodies', () => {
    const a = new URLSearchParams(authCodeBody({ clientId: 'c', code: 'k', verifier: 'v', redirectUri: 'https://a.io/' }));
    expect(a.get('grant_type')).toBe('authorization_code');
    expect(a.get('code')).toBe('k');
    expect(a.get('code_verifier')).toBe('v');
    expect(a.get('client_id')).toBe('c');
    const r = new URLSearchParams(refreshBody({ clientId: 'c', refreshToken: 'rt' }));
    expect(r.get('grant_type')).toBe('refresh_token');
    expect(r.get('refresh_token')).toBe('rt');
  });
});

describe('parseRedirect', () => {
  it('ignores pages that are not an answer from Spotify', () => {
    expect(parseRedirect('', 'st')).toEqual({ kind: 'none' });
    expect(parseRedirect('?foo=1', 'st')).toEqual({ kind: 'none' });
    expect(parseRedirect('?code=abc&state=st', null)).toEqual({ kind: 'none' });
  });

  it('returns the code when the state matches', () => {
    expect(parseRedirect('?code=abc&state=st', 'st')).toEqual({ kind: 'code', code: 'abc' });
  });

  it('rejects a wrong state', () => {
    expect(parseRedirect('?code=abc&state=evil', 'st').kind).toBe('error');
  });

  it('reports cancelled and failed sign-ins', () => {
    expect(parseRedirect('?error=access_denied&state=st', 'st')).toEqual({
      kind: 'error',
      message: 'Spotify sign-in was cancelled.',
    });
    const other = parseRedirect('?error=server_error&state=st', 'st');
    expect(other.kind === 'error' && other.message).toContain('server_error');
  });
});

describe('tokens', () => {
  it('reads a token response', () => {
    expect(tokensFromResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, 1000)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 1000 + 3_600_000,
    });
  });

  it('keeps the old refresh token when none is returned', () => {
    expect(tokensFromResponse({ access_token: 'a', expires_in: 60 }, 0, 'old')?.refreshToken).toBe('old');
  });

  it('rejects incomplete responses', () => {
    expect(tokensFromResponse({ access_token: 'a', expires_in: 60 }, 0)).toBeNull();
    expect(tokensFromResponse({ refresh_token: 'r', expires_in: 60 }, 0)).toBeNull();
    expect(tokensFromResponse({ access_token: 'a', refresh_token: 'r' }, 0)).toBeNull();
    expect(tokensFromResponse(null, 0)).toBeNull();
  });

  it('refreshes a minute before expiry', () => {
    expect(needsRefresh(100_000, 30_000)).toBe(false);
    expect(needsRefresh(100_000, 40_000)).toBe(true);
    expect(needsRefresh(100_000, 200_000)).toBe(true);
  });
});
