import { describe, expect, it } from 'vitest';
import { defaultMusicMode, parseMusicMode } from './musicModeModel';

describe('musicMode', () => {
  it('reads only known values', () => {
    expect(parseMusicMode('auto')).toBe('auto');
    expect(parseMusicMode('manual')).toBe('manual');
    expect(parseMusicMode('x')).toBeNull();
    expect(parseMusicMode(null)).toBeNull();
  });
  it('starts manual on iPhone and automatic elsewhere', () => {
    expect(defaultMusicMode(true)).toBe('manual');
    expect(defaultMusicMode(false)).toBe('auto');
    expect(defaultMusicMode(true, true)).toBe('auto');
  });
});
