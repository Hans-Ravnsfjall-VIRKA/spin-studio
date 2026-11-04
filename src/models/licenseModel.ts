export type LicenseCode =
  | 'cc0'
  | 'pdm'
  | 'by'
  | 'by-sa'
  | 'by-nd'
  | 'by-nc'
  | 'by-nc-sa'
  | 'by-nc-nd'
  | 'unknown';

export interface License {
  code: LicenseCode;
  /** Empty for CC0 and public domain marks. */
  version: string;
}

const KNOWN: LicenseCode[] = ['cc0', 'pdm', 'by', 'by-sa', 'by-nd', 'by-nc', 'by-nc-sa', 'by-nc-nd'];

export function normalizeLicenseCode(raw: string | null | undefined): LicenseCode {
  if (!raw) return 'unknown';
  const code = raw
    .trim()
    .toLowerCase()
    .replace(/^cc[\s_-]*/, '')
    .replace(/[\s_]+/g, '-');
  if (code === 'zero' || code === '0') return 'cc0';
  if (code === 'mark') return 'pdm';
  return (KNOWN as string[]).includes(code) ? (code as LicenseCode) : 'unknown';
}

/** Reads creativecommons.org license and public domain URLs. */
export function parseLicenseUrl(url: string | null | undefined): License {
  if (!url) return { code: 'unknown', version: '' };
  const m = /creativecommons\.org\/licenses\/([a-z-]+)\/([0-9.]+)/i.exec(url);
  if (m) return { code: normalizeLicenseCode(m[1]), version: m[2] };
  if (/creativecommons\.org\/publicdomain\/zero/i.test(url)) return { code: 'cc0', version: '1.0' };
  if (/creativecommons\.org\/publicdomain\/mark/i.test(url)) return { code: 'pdm', version: '1.0' };
  return { code: 'unknown', version: '' };
}

/**
 * Licenses this app will offer. Non commercial (NC) and no derivatives (ND)
 * licenses are left out, so anything listed is fine to play in a paid class
 * as long as the creator is credited.
 */
export function isCommercialSafe(code: LicenseCode): boolean {
  return code === 'cc0' || code === 'pdm' || code === 'by' || code === 'by-sa';
}

export function licenseLabel(license: License): string {
  switch (license.code) {
    case 'cc0':
      return 'CC0';
    case 'pdm':
      return 'Public domain';
    case 'unknown':
      return 'Unknown license';
    default:
      return `CC ${license.code.toUpperCase()}${license.version ? ` ${license.version}` : ''}`;
  }
}

export function licenseUrl(license: License): string {
  switch (license.code) {
    case 'cc0':
      return 'https://creativecommons.org/publicdomain/zero/1.0/';
    case 'pdm':
      return 'https://creativecommons.org/publicdomain/mark/1.0/';
    case 'unknown':
      return '';
    default:
      return `https://creativecommons.org/licenses/${license.code}/${license.version || '4.0'}/`;
  }
}
