import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/entry/cli.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node18',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Copy templates to dist
  async onSuccess() {
    const { cpSync, mkdirSync } = await import('fs');
    mkdirSync('dist/templates', { recursive: true });
    cpSync('templates', 'dist/templates', { recursive: true });
    console.log('✅ Templates copied to dist/templates/');
  },
});
