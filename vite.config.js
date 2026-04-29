import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: true, // Autorise tous les hôtes (utile pour zrok, ngrok, etc.)
    host: true,         // Écoute sur toutes les interfaces réseau
  },
  optimizeDeps: {
    exclude: ['three']
  }
});
