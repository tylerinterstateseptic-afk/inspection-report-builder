import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.interstateseptic.inspection',
  appName: 'ISS Inspection',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#3d6b35',
    },
    StatusBar: {
      backgroundColor: '#3d6b35',
      style: 'LIGHT',
    },
  },
};

export default config;
