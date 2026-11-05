import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fo.virka.spinstudio',
  appName: 'Spin Studio',
  webDir: 'dist',
  backgroundColor: '#0b0d12',
  ios: {
    // The page draws under the notch and home bar and pads itself with env(safe-area-inset-*).
    contentInset: 'never',
    backgroundColor: '#0b0d12',
    scrollEnabled: true,
  },
};

export default config;
