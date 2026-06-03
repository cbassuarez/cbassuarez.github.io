#!/usr/bin/env node
// Bundle the "this person" lab pages into static IIFE bundles for
// /labs/this-person. The lab is served from public/ as static assets, so it
// cannot import npm packages (qrcode) at runtime — they are bundled in here.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

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

// Cache-bust: the bundles have stable filenames, and Cloudflare edge-caches
// them for hours, so a fresh deploy keeps serving the old code until the TTL
// expires. Stamp each page's <script src> with a content-hash query (?v=…) so
// every content change is a new cache key — the short-cached HTML picks it up
// immediately. Runs on every build, so it self-maintains.
const pages = [
  { name: 'landing', html: 'index.html' },
  { name: 'gallery', html: 'gallery/index.html' },
  { name: 'wall', html: 'wall/index.html' },
  { name: 'admin', html: 'admin/index.html' },
  { name: 'return', html: 'return/index.html' },
];
for (const { name, html } of pages) {
  const bundlePath = resolve(outdir, `${name}.bundle.js`);
  const hash = createHash('sha256').update(readFileSync(bundlePath)).digest('hex').slice(0, 10);
  const htmlPath = resolve(outdir, html);
  const before = readFileSync(htmlPath, 'utf8');
  // Match the reference regardless of path prefix or an existing ?v= query.
  const re = new RegExp(`(${name}\\.bundle\\.js)(\\?v=[0-9a-f]+)?`, 'g');
  const after = before.replace(re, `$1?v=${hash}`);
  if (after !== before) {
    writeFileSync(htmlPath, after);
    console.log(`stamped ${html} -> ${name}.bundle.js?v=${hash}`);
  }
}

console.log('wrote this-person bundles to', outdir);
