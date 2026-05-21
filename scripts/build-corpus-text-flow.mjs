#!/usr/bin/env node
// Bundle the Pretext-backed corpus layout transition into a static global for
// /labs/corpus. The lab is served from public/ as static assets, so it cannot
// import npm packages at runtime.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const entry = resolve(root, 'scripts/corpus-text-flow-entry.js');
const out = resolve(root, 'public/labs/corpus/corpus-text-flow.bundle.js');

await build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  format: 'iife',
  globalName: 'CorpusTextFlow',
  target: ['es2020'],
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'info',
});

console.log('wrote', out);
