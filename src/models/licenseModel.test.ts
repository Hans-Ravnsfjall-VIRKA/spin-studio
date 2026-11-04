import { describe, expect, it } from 'vitest';
import {
  isCommercialSafe,
  licenseLabel,
  licenseUrl,
  normalizeLicenseCode,
  parseLicenseUrl,
} from './licenseModel';

describe('licenseModel', () => {
  it('normalizes license codes', () => {
    expect(normalizeLicenseCode('by')).toBe('by');
    expect(normalizeLicenseCode(' BY-SA ')).toBe('by-sa');
    expect(normalizeLicenseCode('CC BY-NC')).toBe('by-nc');
    expect(normalizeLicenseCode('cc-by-nc-nd')).toBe('by-nc-nd');
    expect(normalizeLicenseCode('zero')).toBe('cc0');
    expect(normalizeLicenseCode('cc0')).toBe('cc0');
    expect(normalizeLicenseCode('pdm')).toBe('pdm');
    expect(normalizeLicenseCode('all rights reserved')).toBe('unknown');
    expect(normalizeLicenseCode(null)).toBe('unknown');
    expect(normalizeLicenseCode('')).toBe('unknown');
  });

  it('parses creativecommons urls', () => {
    expect(parseLicenseUrl('http://creativecommons.org/licenses/by-nc-nd/3.0/')).toEqual({
      code: 'by-nc-nd',
      version: '3.0',
    });
    expect(parseLicenseUrl('https://creativecommons.org/licenses/by-sa/4.0/deed.en')).toEqual({
      code: 'by-sa',
      version: '4.0',
    });
    expect(parseLicenseUrl('https://creativecommons.org/publicdomain/zero/1.0/').code).toBe('cc0');
    expect(parseLicenseUrl('https://creativecommons.org/publicdomain/mark/1.0/').code).toBe('pdm');
    expect(parseLicenseUrl('https://example.com/license').code).toBe('unknown');
    expect(parseLicenseUrl(undefined).code).toBe('unknown');
  });

  it('only allows licenses that permit commercial use without conditions on the work itself', () => {
    expect(isCommercialSafe('cc0')).toBe(true);
    expect(isCommercialSafe('pdm')).toBe(true);
    expect(isCommercialSafe('by')).toBe(true);
    expect(isCommercialSafe('by-sa')).toBe(true);
    expect(isCommercialSafe('by-nd')).toBe(false);
    expect(isCommercialSafe('by-nc')).toBe(false);
    expect(isCommercialSafe('by-nc-sa')).toBe(false);
    expect(isCommercialSafe('by-nc-nd')).toBe(false);
    expect(isCommercialSafe('unknown')).toBe(false);
  });

  it('labels and links licenses', () => {
    expect(licenseLabel({ code: 'by-sa', version: '4.0' })).toBe('CC BY-SA 4.0');
    expect(licenseLabel({ code: 'by', version: '' })).toBe('CC BY');
    expect(licenseLabel({ code: 'cc0', version: '1.0' })).toBe('CC0');
    expect(licenseLabel({ code: 'pdm', version: '' })).toBe('Public domain');
    expect(licenseLabel({ code: 'unknown', version: '' })).toBe('Unknown license');
    expect(licenseUrl({ code: 'by', version: '3.0' })).toBe('https://creativecommons.org/licenses/by/3.0/');
    expect(licenseUrl({ code: 'cc0', version: '1.0' })).toContain('publicdomain/zero');
    expect(licenseUrl({ code: 'unknown', version: '' })).toBe('');
  });
});
