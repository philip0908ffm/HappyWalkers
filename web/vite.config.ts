/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:3000', changeOrigin: false } },
  },
  build: {
    // ältere Laptops: moderat moderne Zielplattform, kleine Pakete
    target: ['es2020', 'safari14', 'firefox90', 'chrome90', 'edge90'],
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
