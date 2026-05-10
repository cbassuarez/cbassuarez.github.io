#!/usr/bin/env node
//
//  validate-sample-assets.mjs
//  
//
//  Created by Sebastian Suarez-Solis on 5/9/26.
//



import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac', '.aif', '.aiff']);

function parseArgs(argv) {
  const args = {
    manifests: [],
    report: 'sample-assets.report.json',
    root: process.cwd(),
    siteRoot: path.resolve(process.cwd(), '../..'),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--manifest' && argv[i + 1]) {
      args.manifests.push(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === '--report' && argv[i + 1]) {
      args.report = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--root' && argv[i + 1]) {
      args.root = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === '--site-root' && argv[i + 1]) {
      args.siteRoot = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.manifests.length === 0) {
    const defaultManifest = path.join(args.root, 'samples', 'manifest.json');
    if (fs.existsSync(defaultManifest)) args.manifests.push(defaultManifest);
  }

  return args;
}

function printHelp() {
  console.log(`
validate-sample-assets.mjs

Usage:
  node scripts/validate-sample-assets.mjs --manifest samples/manifest.json --report sample-assets.report.json

Options:
  --manifest <path>   Manifest JSON to validate. Can be passed multiple times.
  --report <path>     Output report JSON. Default: sample-assets.report.json
  --root <path>       REPL root. Default: current working directory.
  --site-root <path>  Public/site root for absolute /audio/... URLs. Default: ../..
`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hashFile(file) {
  const bytes = fs.readFileSync(file);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function normalizeUrlish(value) {
  return String(value || '').trim().replace(/\\/g, '/');
}

function isExternalUrl(url) {
  return /^(https?:|data:|blob:|file:)/i.test(url);
}

function exactCaseExists(file) {
  const absolute = path.resolve(file);
  const parsed = path.parse(absolute);
  let current = parsed.root;

  const parts = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);

  for (const part of parts) {
    let entries;
    try {
      entries = fs.readdirSync(current);
    } catch (_) {
      return false;
    }

    if (!entries.includes(part)) return false;
    current = path.join(current, part);
  }

  return true;
}

function resolveSamplePath(entry, manifestPath, args) {
  const name = normalizeUrlish(entry && entry.name);
  const rawUrl = normalizeUrlish(entry && entry.url);
  const rawFile = normalizeUrlish(entry && entry.file);

  if (rawUrl && isExternalUrl(rawUrl)) {
    return {
      skipped: true,
      reason: 'external-url',
      sample: name,
      url: rawUrl,
      file: '',
    };
  }

  if (rawUrl.startsWith('/')) {
    return {
      skipped: false,
      reason: '',
      sample: name,
      url: rawUrl,
      file: path.resolve(args.siteRoot, rawUrl.replace(/^\/+/, '')),
    };
  }

  const manifestDir = path.dirname(path.resolve(manifestPath));
  const rel = rawUrl || rawFile || `${name}.mp3`;

  return {
    skipped: false,
    reason: '',
    sample: name,
    url: rawUrl || rawFile || rel,
    file: path.resolve(manifestDir, rel.replace(/^\.?\/*/, '')),
  };
}

function collectAudioFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectAudioFiles(full, out);
      continue;
    }

    if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }

  return out;
}

function sampleNames(manifest) {
  return new Set(
    Array.isArray(manifest.samples)
      ? manifest.samples.map((s) => s && s.name).filter(Boolean)
      : []
  );
}

function expandManifestPrefix(names, prefix) {
  return Array.from(names).filter((name) => name.startsWith(prefix));
}

function validateKitRefs(manifest, manifestPath, names, issues) {
  const kits = Array.isArray(manifest.kits) ? manifest.kits : [];

  for (const kit of kits) {
    if (!kit || typeof kit !== 'object') continue;
    const kitId = String(kit.id || '(unnamed-kit)');
    const lanes = kit.lanes && typeof kit.lanes === 'object' ? kit.lanes : {};

    for (const [lane, entries] of Object.entries(lanes)) {
      if (!Array.isArray(entries)) continue;

      for (const raw of entries) {
        const name = typeof raw === 'string'
          ? raw
          : (raw && typeof raw.name === 'string' ? raw.name : '');

        if (!name) continue;

        if (name.endsWith('*')) {
          const prefix = name.slice(0, -1);
          const matches = expandManifestPrefix(names, prefix);
          if (matches.length === 0) {
            issues.badKitRefs.push({
              manifest: manifestPath,
              kit: kitId,
              lane,
              ref: name,
              reason: 'wildcard matched zero samples',
            });
          }
          continue;
        }

        if (!names.has(name)) {
          issues.badKitRefs.push({
            manifest: manifestPath,
            kit: kitId,
            lane,
            ref: name,
            reason: 'sample not found in manifest.samples',
          });
        }
      }
    }
  }
}

function validateManifest(manifestPath, args) {
  const absoluteManifest = path.resolve(manifestPath);
  const manifest = readJson(absoluteManifest);
  const names = sampleNames(manifest);

  const report = {
    manifest: absoluteManifest,
    manifestHash: hashFile(absoluteManifest),
    totalSamples: Array.isArray(manifest.samples) ? manifest.samples.length : 0,
    validatedSamples: 0,
    skippedSamples: [],
    missingSamples: [],
    zeroByteSamples: [],
    caseMismatchSamples: [],
    badKitRefs: [],
    orphanAudioFiles: [],
  };

  const referencedFiles = new Set();

  for (const entry of Array.isArray(manifest.samples) ? manifest.samples : []) {
    const resolved = resolveSamplePath(entry, absoluteManifest, args);

    if (resolved.skipped) {
      report.skippedSamples.push(resolved);
      continue;
    }

    referencedFiles.add(path.resolve(resolved.file));

    if (!fs.existsSync(resolved.file)) {
      report.missingSamples.push(resolved);
      continue;
    }

    if (!exactCaseExists(resolved.file)) {
      report.caseMismatchSamples.push(resolved);
      continue;
    }

    const stat = fs.statSync(resolved.file);
    if (stat.size <= 0) {
      report.zeroByteSamples.push({
        ...resolved,
        size: stat.size,
      });
      continue;
    }

    report.validatedSamples += 1;
  }

  validateKitRefs(manifest, absoluteManifest, names, report);

  const manifestDir = path.dirname(absoluteManifest);
  const audioFiles = collectAudioFiles(manifestDir);
  for (const file of audioFiles) {
    const resolved = path.resolve(file);
    if (!referencedFiles.has(resolved)) {
      report.orphanAudioFiles.push(resolved);
    }
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.manifests.length === 0) {
    throw new Error('No manifests found. Pass --manifest samples/manifest.json');
  }

  const reports = args.manifests.map((manifestPath) => validateManifest(manifestPath, args));

  const summary = {
    generatedAt: new Date().toISOString(),
    root: path.resolve(args.root),
    siteRoot: path.resolve(args.siteRoot),
    manifests: reports,
    totals: {
      manifests: reports.length,
      totalSamples: reports.reduce((sum, r) => sum + r.totalSamples, 0),
      validatedSamples: reports.reduce((sum, r) => sum + r.validatedSamples, 0),
      missingSamples: reports.reduce((sum, r) => sum + r.missingSamples.length, 0),
      zeroByteSamples: reports.reduce((sum, r) => sum + r.zeroByteSamples.length, 0),
      caseMismatchSamples: reports.reduce((sum, r) => sum + r.caseMismatchSamples.length, 0),
      badKitRefs: reports.reduce((sum, r) => sum + r.badKitRefs.length, 0),
      orphanAudioFiles: reports.reduce((sum, r) => sum + r.orphanAudioFiles.length, 0),
    },
  };

  fs.writeFileSync(path.resolve(args.report), JSON.stringify(summary, null, 2) + '\n');

  const broken =
    summary.totals.missingSamples > 0 ||
    summary.totals.zeroByteSamples > 0 ||
    summary.totals.caseMismatchSamples > 0 ||
    summary.totals.badKitRefs > 0;

  console.log(`[sample-assets] manifests: ${summary.totals.manifests}`);
  console.log(`[sample-assets] validated samples: ${summary.totals.validatedSamples}/${summary.totals.totalSamples}`);
  console.log(`[sample-assets] missing: ${summary.totals.missingSamples}`);
  console.log(`[sample-assets] zero-byte: ${summary.totals.zeroByteSamples}`);
  console.log(`[sample-assets] case mismatch: ${summary.totals.caseMismatchSamples}`);
  console.log(`[sample-assets] bad kit refs: ${summary.totals.badKitRefs}`);
  console.log(`[sample-assets] report: ${path.resolve(args.report)}`);

  if (broken) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  console.error('[sample-assets] validation failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
}
