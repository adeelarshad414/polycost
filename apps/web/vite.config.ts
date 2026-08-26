import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/')) {
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/scheduler/')
            ) {
              return 'react-vendor';
            }

            // FE-4: recharts and its d3 deps are used ONLY by the lazily
            // imported Charts module. Returning undefined leaves them to
            // automatic chunking so they land in the on-demand Charts chunk. A
            // named manual chunk (even a separate 'charts' one) becomes part of
            // the static graph and gets modulepreloaded on first paint, which
            // defeats the lazy import.
            if (
              id.includes('/node_modules/recharts/') ||
              id.includes('/node_modules/d3-') ||
              id.includes('/node_modules/victory-vendor/')
            ) {
              return undefined;
            }

            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
});
