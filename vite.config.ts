import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kerb/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
