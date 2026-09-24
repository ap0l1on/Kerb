import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Kerb/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
