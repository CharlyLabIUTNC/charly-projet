import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: true, // Autorise tous les hôtes (utile pour zrok, ngrok, etc.)
    host: true,         // Écoute sur toutes les interfaces réseau
  },
  optimizeDeps: {
    exclude: ['three']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three-mesh-bvh')) {
            return 'bvh';
          }
          if (id.includes('node_modules/three')) {
            return 'three';
          }
          if (id.includes('node_modules/html2canvas')) {
            return 'html2canvas';
          }
        }
      }
    }
  }
});
