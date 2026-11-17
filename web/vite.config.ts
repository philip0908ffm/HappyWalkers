/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { DEFAULT_APP_NAME } from '../shared/src/brand';

// Projektname: eine Variable (APP_NAME) für Server und Oberfläche
const APP_NAME = process.env.APP_NAME?.trim() || DEFAULT_APP_NAME;
const escapeHtml = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export default defineConfig({
  plugins: [
    react(),
    { name: 'app-name', transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', escapeHtml(APP_NAME)) },
  ],
  define: { __APP_NAME__: JSON.stringify(APP_NAME) },
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
