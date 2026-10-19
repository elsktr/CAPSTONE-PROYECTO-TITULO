import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rockstar.pos',
  appName: 'Rockstar POS',
  webDir: 'dist',
  // El backend corre en la red local y se publica por HTTP, sin certificado. La app se
  // carga desde `https://localhost`, así que hay que permitirle ese tráfico, igual que en
  // la app de bodega. Con un backend publicado por HTTPS, estas dos opciones deben quitarse.
  server: {
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
