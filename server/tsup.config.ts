import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // gemeinsamer Code wird mitgebündelt, npm-Pakete bleiben extern
  noExternal: ['@happywalkers/shared'],
});
