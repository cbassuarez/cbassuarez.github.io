#!/usr/bin/env node
// Compile the "this person" worker unit tests (TypeScript) with esbuild, then
// run them with the built-in node:test runner. esbuild is already available in
// the repo, so this needs no extra test-framework dependency.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const tmp = resolve(root, 'scripts/this-person/.tmp-tests');
const outfile = resolve(tmp, 'units.test.mjs');

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

await build({
  entryPoints: [resolve(root, 'worker/src/this-person/__tests__/units.test.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node18'],
  logLevel: 'warning',
});

const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
process.exit(result.status ?? 1);
