import { describe, expect, it } from 'vitest';
import { NATIVE_REDIRECT_URI, queryFromUrl, redirectUriProblem } from './spotifyAuthModel';

describe('app link sign-in', () => {
  it('reads the query from an app link', () => {
    expect(queryFromUrl('spinstudio://callback?code=abc&state=xyz')).toBe('?code=abc&state=xyz');
    expect(queryFromUrl('spinstudio://callback?code=abc#frag')).toBe('?code=abc');
    expect(queryFromUrl('spinstudio://callback')).toBe('');
  });
  it('accepts the app address as a redirect', () => {
    expect(redirectUriProblem(NATIVE_REDIRECT_URI)).toBeNull();
    expect(redirectUriProblem('http://example.com/x')).not.toBeNull();
  });
});
