import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: false,
  clean: false,
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
});
