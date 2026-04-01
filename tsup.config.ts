import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/entry/cli.ts'],
  format: ['esm'],
  outDir: 'dist',
  outExtension: () => ({ js: '.mjs' }),
  target: 'node18',
  clean: true,
  sourcemap: true,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  async onSuccess() {
    const { cpSync, mkdirSync } = await import('fs');
    mkdirSync('dist/templates', { recursive: true });
    cpSync('templates', 'dist/templates', { recursive: true });
    console.log('✅ Build complete');
  },
});
