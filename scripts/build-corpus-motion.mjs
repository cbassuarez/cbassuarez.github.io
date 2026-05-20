#!/usr/bin/env node
// Bundle the Framer Motion acceptance layer into a static global for
// /labs/corpus. The lab is served from public/ as static assets, so it cannot
// import npm packages at runtime.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const entry = resolve(root, 'scripts/corpus-motion-entry.jsx');
const out = resolve(root, 'public/labs/corpus/corpus-motion.bundle.js');

await build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  format: 'iife',
  globalName: 'CorpusAcceptanceMotion',
  target: ['es2020'],
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'info',
});

console.log('wrote', out);
