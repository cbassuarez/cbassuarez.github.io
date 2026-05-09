#!/usr/bin/env node

import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(process.cwd());
const RAW_DIR = join(ROOT, 'source/iowa/raw');
const OUT_DIR = join(ROOT, 'public/instruments/iowa-piano/audio');

const PEAK_HEADROOM_DB = 25;
const THRESHOLD_MIN_DB = -60;
const THRESHOLD_MAX_DB = -30;
const SILENCE_MIN_DURATION_S = 0.001;
const PRE_ROLL_S = 0.003;
const FADE_IN_S = 0.002;
const VORBIS_QUALITY = '5';
const CONCURRENCY = 8;

function runCapture(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`${cmd} exited ${code}\n${stderr}`));
    });
  });
}

async function peakLevelDb(aiffPath) {
  const { stderr } = await runCapture('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i', aiffPath,
    '-af', 'astats=measure_overall=Peak_level:measure_perchannel=0',
    '-f', 'null',
    '-',
  ]);

  const m = stderr.match(/Peak level dB:\s*(-?\d+(?:\.\d+)?|-inf)/);
  if (!m) return -90;
  const v = m[1] === '-inf' ? -Infinity : Number(m[1]);
  return Number.isFinite(v) ? v : -90;
}

function thresholdForPeak(peakDb) {
  const raw = peakDb - PEAK_HEADROOM_DB;
  if (!Number.isFinite(raw)) return THRESHOLD_MIN_DB;
  return Math.max(THRESHOLD_MIN_DB, Math.min(THRESHOLD_MAX_DB, raw));
}

async function detectAttackStart(aiffPath, thresholdDb) {
  const { stderr } = await runCapture('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i', aiffPath,
    '-af', `silencedetect=noise=${thresholdDb}dB:d=${SILENCE_MIN_DURATION_S}`,
    '-f', 'null',
    '-',
  ]);

  const startMatch = stderr.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
  const endMatch = stderr.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);

  if (!startMatch) return 0;
  const firstStart = Number(startMatch[1]);

  if (firstStart > 0.001) return 0;
  if (!endMatch) return 0;

  const firstEnd = Number(endMatch[1]);
  if (!Number.isFinite(firstEnd) || firstEnd <= 0) return 0;

  return Math.max(0, firstEnd - PRE_ROLL_S);
}

async function trimToOgg(aiffPath, outPath, trimStart) {
  await mkdir(join(outPath, '..'), { recursive: true });

  const filterParts = [];
  if (trimStart > 0) {
    filterParts.push(`atrim=start=${trimStart.toFixed(6)}`);
    filterParts.push('asetpts=PTS-STARTPTS');
  }
  filterParts.push(`afade=t=in:st=0:d=${FADE_IN_S}`);

  const filter = filterParts.join(',');

  await runCapture('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', aiffPath,
    '-vn',
    '-af', filter,
    '-acodec', 'libvorbis',
    '-q:a', VORBIS_QUALITY,
    outPath,
  ]);
}

function parseFile(file) {
  const m = file.match(/^Piano\.(pp|mf|ff)\.([A-G](?:b)?-?\d{1,2})\.aiff$/);
  if (!m) return null;
  return { layer: m[1], note: m[2], file };
}

async function processOne(item) {
  const aiffPath = join(RAW_DIR, item.file);
  const outFile = item.file.replace(/\.aiff$/i, '.ogg');
  const outPath = join(OUT_DIR, item.layer, outFile);

  const peakDb = await peakLevelDb(aiffPath);
  const thresholdDb = thresholdForPeak(peakDb);
  const trimStart = await detectAttackStart(aiffPath, thresholdDb);
  await trimToOgg(aiffPath, outPath, trimStart);

  return { ...item, peakDb, thresholdDb, trimStart, outPath };
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const total = items.length;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]);
      } catch (err) {
        results[i] = { error: err, item: items[i] };
      }
      done += 1;
      if (done % 20 === 0 || done === total) {
        process.stdout.write(`  ${done}/${total}\n`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(n, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function main() {
  const dirStat = await stat(RAW_DIR).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) {
    throw new Error(`raw dir not found: ${RAW_DIR}`);
  }

  const all = await readdir(RAW_DIR);
  const items = all.map(parseFile).filter(Boolean);
  if (!items.length) throw new Error('no Piano.*.aiff files found');

  console.log(`Trimming ${items.length} samples from ${RAW_DIR} -> ${OUT_DIR}`);
  console.log(`  peak-relative threshold (peak-${PEAK_HEADROOM_DB}dB clamped to [${THRESHOLD_MIN_DB},${THRESHOLD_MAX_DB}] dB)`);
  console.log(`  pre-roll ${PRE_ROLL_S * 1000}ms, fade-in ${FADE_IN_S * 1000}ms`);

  const results = await pool(items, CONCURRENCY, processOne);

  const errors = results.filter((r) => r && r.error);
  const ok = results.filter((r) => r && !r.error);

  let trimSum = 0;
  let trimMax = 0;
  let trimMaxFile = '';
  const suspicious = [];
  for (const r of ok) {
    trimSum += r.trimStart;
    if (r.trimStart > trimMax) {
      trimMax = r.trimStart;
      trimMaxFile = r.file;
    }
    if (r.trimStart > 5) suspicious.push(r);
  }

  console.log('');
  console.log(`processed: ${ok.length}`);
  console.log(`errors:    ${errors.length}`);
  console.log(`avg trim:  ${(trimSum / Math.max(1, ok.length) * 1000).toFixed(1)} ms`);
  console.log(`max trim:  ${(trimMax * 1000).toFixed(1)} ms (${trimMaxFile})`);

  if (suspicious.length) {
    console.log('');
    console.log(`samples with >5s trim (review):`);
    for (const s of suspicious) {
      console.log(`  ${s.file}  peak=${s.peakDb.toFixed(1)}dB  thr=${s.thresholdDb.toFixed(1)}dB  trim=${(s.trimStart * 1000).toFixed(0)}ms`);
    }
  }

  if (errors.length) {
    console.log('');
    for (const e of errors) {
      console.log(`  FAIL ${e.item.file}: ${e.error.message.split('\n')[0]}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
