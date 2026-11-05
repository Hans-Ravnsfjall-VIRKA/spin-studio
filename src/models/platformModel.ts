/** iPhone, iPad and iPod, including iPads that report as a Mac. */
export function isIos(userAgent: string, platform: string, touchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return platform === 'MacIntel' && touchPoints > 1;
}
