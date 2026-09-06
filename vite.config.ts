import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
  },
  worker: { format: 'es' },
  optimizeDeps: {
    // duckdb-wasm ships its own workers; keep esbuild from mangling them
    exclude: ['@duckdb/duckdb-wasm'],
  },
});
