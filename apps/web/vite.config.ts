import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/*
  The dev proxy has to follow API_HOST_PORT rather than hardcode the default.

  docker-compose publishes the API on `${API_HOST_PORT:-3001}`, so anyone whose
  3001 is already taken sets API_HOST_PORT in .env and the API moves - but the
  proxy did not move with it, and `npm run dev` then talked to whatever else was
  on 3001. That is worse than a connection refused: on a machine where 3001 is
  an unrelated service (an SSH tunnel, say) the dev server gets real responses
  from the wrong application, which reads as an API bug in this one. It cost a
  bogus routing-bug report on #218 before the port was noticed.

  Read with an empty prefix from the repo root, because API_HOST_PORT lives in
  the root .env and is not a VITE_-prefixed client variable.
*/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL('../..', import.meta.url).pathname, '');
  const apiOrigin = `http://localhost:${env.API_HOST_PORT || '3001'}`;

  return {
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
        '/api': apiOrigin,
        '/health': apiOrigin,
      },
    },
  };
});
