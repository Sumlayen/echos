import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: false,
    host: '127.0.0.1'
  },
  preview: {
    port: 4173,
    strictPort: false,
    host: '127.0.0.1'
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000
  },
  esbuild: {
    sourcemap: true
  }
});
