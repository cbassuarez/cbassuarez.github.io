#!/usr/bin/env node
// Bundle the "this person" lab pages into static IIFE bundles for
// /labs/this-person. The lab is served from public/ as static assets, so it
// cannot import npm packages (qrcode) at runtime — they are bundled in here.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const entryDir = resolve(root, 'scripts/this-person');
const outdir = resolve(root, 'public/labs/this-person');

await build({
  entryPoints: [
    resolve(entryDir, 'landing.ts'),
    resolve(entryDir, 'gallery.ts'),
    resolve(entryDir, 'wall.ts'),
    resolve(entryDir, 'admin.ts'),
    resolve(entryDir, 'return.ts'),
  ],
  outdir,
  entryNames: '[name].bundle',
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'info',
});

console.log('wrote this-person bundles to', outdir);
