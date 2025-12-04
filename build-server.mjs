#!/usr/bin/env node
// Build script for server that properly excludes vite.config.ts and all dev dependencies
import { build } from 'esbuild';
import { excludeVitePlugin } from './esbuild-plugin-exclude-vite.js';

try {
  await build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir: 'dist',
    packages: 'external',
    external: [
      'vite',
      '@vitejs/plugin-react',
      '@replit/vite-plugin-runtime-error-modal',
      '@replit/vite-plugin-cartographer',
    ],
    plugins: [excludeVitePlugin],
  });
  console.log('✓ Server build complete');
} catch (error) {
  console.error('✗ Build failed:', error);
  process.exit(1);
}

