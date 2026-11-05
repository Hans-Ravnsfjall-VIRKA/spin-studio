import { Capacitor } from '@capacitor/core';

/** True inside the installed iPhone app, false in a browser. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
