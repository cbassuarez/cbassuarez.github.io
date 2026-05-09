#!/usr/bin/env node

import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(process.cwd());
const RAW_DIR = join(ROOT, 'source/iowa/raw-violin');
const OUT_DIR = join(ROOT, 'public/instruments/iowa-violin');
const AUDIO_DIR = join(OUT_DIR, 'audio');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.full.json');

// Leading-silence trim (mirrors trim-iowa-piano.mjs)
const PEAK_HEADROOM_DB = 25;
const THRESHOLD_MIN_DB = -60;
const THRESHOLD_MAX_DB = -30;
const SILENCE_MIN_DURATION_S = 0.001;
const PRE_ROLL_S = 0.003;
const FADE_IN_S = 0.002;
const VORBIS_QUALITY = '5';
const TRIM_CONCURRENCY = 8;

// Loop detection (arco only)
const ANALYSIS_RATE = 44100;          // matches Iowa source sample rate
const ATTACK_SKIP_S = 0.30;           // ignore first 300 ms (bow attack)
const RELEASE_SKIP_S = 0.50;          // ignore last 500 ms (release tail)
const RMS_WINDOW_S = 0.020;           // 20 ms RMS windows (resolves vibrato envelope)
const SUSTAIN_MEDIAN_RATIO = 0.65;    // window is "sustained" if rms >= 65 % of median
const SUSTAIN_PEAK_RATIO = 0.18;      // …and at least 18 % of peak (suppresses release/silence)
const TARGET_LOOP_S = 0.50;           // aim for ~500 ms loop body
const MIN_LOOP_S = 0.20;              // refuse loops shorter than this
const VIBRATO_MIN_HZ = 3.5;
const VIBRATO_MAX_HZ = 8.0;
const ZERO_CROSS_SEARCH_S = 0.020;    // ±20 ms snap window

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

function runCaptureBinary(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', (b) => { chunks.push(b); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise(Buffer.concat(chunks));
      else rejectPromise(new Error(`${cmd} exited ${code}\n${stderr}`));
    });
  });
}

async function peakLevelDb(srcPath) {
  const { stderr } = await runCapture('ffmpeg', [
    '-hide_banner', '-nostats',
    '-i', srcPath,
    '-af', 'astats=measure_overall=Peak_level:measure_perchannel=0',
    '-f', 'null', '-',
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

async function detectAttackStart(srcPath, thresholdDb) {
  const { stderr } = await runCapture('ffmpeg', [
    '-hide_banner', '-nostats',
    '-i', srcPath,
    '-af', `silencedetect=noise=${thresholdDb}dB:d=${SILENCE_MIN_DURATION_S}`,
    '-f', 'null', '-',
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

async function trimToOgg(srcPath, outPath, trimStart) {
  await mkdir(join(outPath, '..'), { recursive: true });
  const filterParts = [];
  if (trimStart > 0) {
    filterParts.push(`atrim=start=${trimStart.toFixed(6)}`);
    filterParts.push('asetpts=PTS-STARTPTS');
  }
  filterParts.push(`afade=t=in:st=0:d=${FADE_IN_S}`);
  await runCapture('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', srcPath,
    '-vn',
    '-af', filterParts.join(','),
    '-acodec', 'libvorbis',
    '-q:a', VORBIS_QUALITY,
    outPath,
  ]);
}

async function decodeMonoF32(oggPath) {
  const buf = await runCaptureBinary('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', oggPath,
    '-vn', '-ac', '1', '-ar', String(ANALYSIS_RATE),
    '-f', 'f32le', '-',
  ]);
  // Buffer may not be 4-byte aligned with the underlying ArrayBuffer; copy if so.
  const aligned = buf.byteOffset % 4 === 0 && buf.byteLength % 4 === 0
    ? new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    : new Float32Array(new Uint8Array(buf).buffer, 0, Math.floor(buf.byteLength / 4));
  return aligned;
}

function nearestZeroCrossing(samples, target, range) {
  const lo = Math.max(1, target - range);
  const hi = Math.min(samples.length - 1, target + range);
  let bestIdx = target;
  let bestDist = Infinity;
  for (let i = lo; i <= hi; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const crosses = (a <= 0 && b > 0) || (a >= 0 && b < 0);
    if (!crosses) continue;
    const d = Math.abs(i - target);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

// Estimate vibrato period (in seconds) by autocorrelating the high-pass-filtered
// RMS envelope. Returns null if no clear period in 3.5–8 Hz is found.
function estimateVibratoPeriod(rmsValues, windowSec) {
  if (rmsValues.length < 16) return null;

  // High-pass: subtract a moving average to suppress slow envelope drift.
  const smoothSpan = Math.max(3, Math.floor(0.4 / windowSec));
  const detrended = new Array(rmsValues.length).fill(0);
  for (let i = 0; i < rmsValues.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = i - smoothSpan; j <= i + smoothSpan; j += 1) {
      if (j >= 0 && j < rmsValues.length) { sum += rmsValues[j]; count += 1; }
    }
    detrended[i] = rmsValues[i] - (sum / count);
  }

  const minLag = Math.max(1, Math.floor(1 / (VIBRATO_MAX_HZ * windowSec)));
  const maxLag = Math.min(rmsValues.length - 1, Math.floor(1 / (VIBRATO_MIN_HZ * windowSec)));
  if (maxLag <= minLag) return null;

  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let corr = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i + lag < detrended.length; i += 1) {
      const a = detrended[i];
      const b = detrended[i + lag];
      corr += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denom = Math.sqrt(normA * normB) || 1e-12;
    const norm = corr / denom;
    if (norm > bestCorr) { bestCorr = norm; bestLag = lag; }
  }

  if (bestCorr < 0.25 || bestLag <= 0) return null;
  return bestLag * windowSec;
}

function detectArcoLoop(samples, sampleRate) {
  const total = samples.length;
  if (total < sampleRate * 1.0) return { ok: false, reason: 'sample-too-short' };

  const winSize = Math.max(1, Math.floor(sampleRate * RMS_WINDOW_S));
  const skipStart = Math.floor(sampleRate * ATTACK_SKIP_S);
  const skipEnd = total - Math.floor(sampleRate * RELEASE_SKIP_S);
  if (skipEnd - skipStart < winSize * 16) return { ok: false, reason: 'analysis-window-too-short' };

  // Compute RMS per window inside the analysis region.
  const rms = [];
  for (let i = skipStart; i + winSize <= skipEnd; i += winSize) {
    let sum = 0;
    for (let j = 0; j < winSize; j += 1) {
      const s = samples[i + j];
      sum += s * s;
    }
    rms.push({ start: i, rms: Math.sqrt(sum / winSize) });
  }
  if (rms.length < 16) return { ok: false, reason: 'too-few-windows' };

  // Find the longest run of "sustained" windows. Threshold combines a median-relative
  // floor (robust to bow-attack peaks dominating) and a peak-relative floor (suppresses
  // residual silence/release tail when median itself is low).
  let peak = 0;
  for (const r of rms) { if (r.rms > peak) peak = r.rms; }
  if (peak < 1e-4) return { ok: false, reason: 'too-quiet' };
  const sortedRms = rms.map((r) => r.rms).slice().sort((a, b) => a - b);
  const median = sortedRms[Math.floor(sortedRms.length / 2)];
  const threshold = Math.max(median * SUSTAIN_MEDIAN_RATIO, peak * SUSTAIN_PEAK_RATIO);

  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < rms.length; i += 1) {
    if (rms[i].rms >= threshold) {
      if (curStart < 0) curStart = i;
      curLen += 1;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }
  const sustainSeconds = bestLen * RMS_WINDOW_S;
  if (sustainSeconds < MIN_LOOP_S + 0.10) {
    return { ok: false, reason: 'sustain-too-short', sustainSeconds };
  }

  // Estimate vibrato period across the sustain region.
  const sustainRms = rms.slice(bestStart, bestStart + bestLen).map((r) => r.rms);
  const vibratoPeriod = estimateVibratoPeriod(sustainRms, RMS_WINDOW_S);

  // Choose loop length: a multiple of the vibrato period when known, else TARGET_LOOP_S.
  let loopSec = TARGET_LOOP_S;
  if (Number.isFinite(vibratoPeriod) && vibratoPeriod > 0) {
    const cycles = Math.max(1, Math.round(TARGET_LOOP_S / vibratoPeriod));
    loopSec = cycles * vibratoPeriod;
    if (loopSec < MIN_LOOP_S) {
      loopSec = Math.ceil(MIN_LOOP_S / vibratoPeriod) * vibratoPeriod;
    }
  }
  loopSec = Math.min(loopSec, sustainSeconds - 0.05);
  if (loopSec < MIN_LOOP_S) {
    return { ok: false, reason: 'loop-target-too-short' };
  }

  // Place loop so it starts ~25% into the sustain region (after settling) and fits.
  const sustainStartSample = rms[bestStart].start;
  const sustainEndSample = rms[bestStart + bestLen - 1].start + winSize;
  const loopSamples = Math.floor(loopSec * sampleRate);
  const placementOffset = Math.floor((sustainEndSample - sustainStartSample - loopSamples) * 0.25);
  let loopStart = sustainStartSample + Math.max(0, placementOffset);
  let loopEnd = loopStart + loopSamples;

  if (loopEnd > sustainEndSample) loopEnd = sustainEndSample;
  if (loopEnd - loopStart < sampleRate * MIN_LOOP_S) {
    return { ok: false, reason: 'loop-window-collapsed' };
  }

  // Snap to zero crossings (search wider when vibrato makes phases harder to align).
  const snapRange = Math.floor(sampleRate * ZERO_CROSS_SEARCH_S);
  loopStart = nearestZeroCrossing(samples, loopStart, snapRange);
  loopEnd = nearestZeroCrossing(samples, loopEnd, snapRange);

  if (loopEnd - loopStart < sampleRate * MIN_LOOP_S) {
    return { ok: false, reason: 'loop-after-snap-too-short' };
  }

  return {
    ok: true,
    loopStartSample: loopStart,
    loopEndSample: loopEnd,
    sustainSeconds,
    vibratoPeriod: vibratoPeriod || null,
    loopSeconds: (loopEnd - loopStart) / sampleRate,
  };
}

async function findRawAif(item) {
  // Could live in any extracted directory or in `individual/`. Walk RAW_DIR.
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return null; }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (ent.isFile() && ent.name.toLowerCase() === item.sourceFile.toLowerCase()) {
        return full;
      }
    }
    return null;
  }
  return walk(RAW_DIR);
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
      try { results[i] = await fn(items[i], i); }
      catch (err) { results[i] = { error: err, item: items[i] }; }
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

function flattenManifest(manifest) {
  const items = [];
  const samples = manifest && manifest.samples ? manifest.samples : {};
  for (const articulation of Object.keys(samples)) {
    const byString = samples[articulation] || {};
    for (const string of Object.keys(byString)) {
      const byNote = byString[string] || {};
      for (const note of Object.keys(byNote)) {
        const entry = byNote[note];
        if (!entry || !entry.url || !entry.sourceFile) continue;
        items.push({ articulation, string, note, entry });
      }
    }
  }
  return items;
}

async function main() {
  const dirStat = await stat(RAW_DIR).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) {
    throw new Error(`raw violin dir not found: ${RAW_DIR}\nRun scripts/import-iowa-violin.mjs first.`);
  }

  const manifestText = await readFile(MANIFEST_PATH, 'utf8').catch(() => null);
  if (!manifestText) {
    throw new Error(`manifest not found: ${MANIFEST_PATH}\nRun scripts/import-iowa-violin.mjs first.`);
  }
  const manifest = JSON.parse(manifestText);

  const items = flattenManifest(manifest);
  console.log(`Trimming ${items.length} samples (raw aif → public ogg).`);
  console.log(`  peak-relative threshold (peak-${PEAK_HEADROOM_DB}dB clamped to [${THRESHOLD_MIN_DB},${THRESHOLD_MAX_DB}] dB)`);
  console.log(`  pre-roll ${PRE_ROLL_S * 1000}ms, fade-in ${FADE_IN_S * 1000}ms`);

  const trimResults = await pool(items, TRIM_CONCURRENCY, async (item) => {
    const aifPath = await findRawAif(item.entry);
    if (!aifPath) throw new Error(`raw aif not found for ${item.entry.sourceFile}`);
    const outPath = join(OUT_DIR, item.entry.url);
    const peakDb = await peakLevelDb(aifPath);
    const thresholdDb = thresholdForPeak(peakDb);
    const trimStart = await detectAttackStart(aifPath, thresholdDb);
    await trimToOgg(aifPath, outPath, trimStart);
    return { item, aifPath, outPath, peakDb, thresholdDb, trimStart };
  });

  const trimErrors = trimResults.filter((r) => r && r.error);
  const trimOk = trimResults.filter((r) => r && !r.error);

  let trimSum = 0;
  let trimMax = 0;
  let trimMaxFile = '';
  const suspicious = [];
  for (const r of trimOk) {
    trimSum += r.trimStart;
    if (r.trimStart > trimMax) { trimMax = r.trimStart; trimMaxFile = r.item.entry.sourceFile; }
    if (r.trimStart > 5) suspicious.push(r);
  }

  console.log('');
  console.log(`trimmed:   ${trimOk.length}`);
  console.log(`errors:    ${trimErrors.length}`);
  console.log(`avg trim:  ${(trimSum / Math.max(1, trimOk.length) * 1000).toFixed(1)} ms`);
  console.log(`max trim:  ${(trimMax * 1000).toFixed(1)} ms (${trimMaxFile})`);
  if (suspicious.length) {
    console.log(`samples with >5s leading silence (review):`);
    for (const s of suspicious) {
      console.log(`  ${s.item.entry.sourceFile}  peak=${s.peakDb.toFixed(1)}dB  thr=${s.thresholdDb.toFixed(1)}dB  trim=${(s.trimStart * 1000).toFixed(0)}ms`);
    }
  }
  if (trimErrors.length) {
    for (const e of trimErrors) {
      console.log(`  FAIL trim ${e.item.entry.sourceFile}: ${e.error.message.split('\n')[0]}`);
    }
    process.exit(1);
  }

  // Loop detection (arco only). Run serially to keep memory bounded.
  const arcoItems = trimOk.filter((r) => r.item.articulation === 'arco');
  console.log('');
  console.log(`Detecting loop points for ${arcoItems.length} arco samples…`);

  let loopOk = 0;
  let loopSkipped = 0;
  const loopSuspicious = [];
  let processed = 0;

  for (const r of arcoItems) {
    try {
      const samples = await decodeMonoF32(r.outPath);
      const det = detectArcoLoop(samples, ANALYSIS_RATE);
      if (det.ok) {
        r.item.entry.loopStartSample = det.loopStartSample;
        r.item.entry.loopEndSample = det.loopEndSample;
        r.item.entry.sampleRate = ANALYSIS_RATE;
        loopOk += 1;
        const loopMs = ((det.loopEndSample - det.loopStartSample) / ANALYSIS_RATE) * 1000;
        if (loopMs < 350) {
          loopSuspicious.push({ file: r.item.entry.sourceFile, reason: `short loop ${loopMs.toFixed(0)} ms` });
        }
      } else {
        r.item.entry.loopStartSample = null;
        r.item.entry.loopEndSample = null;
        r.item.entry.sampleRate = ANALYSIS_RATE;
        loopSkipped += 1;
        loopSuspicious.push({ file: r.item.entry.sourceFile, reason: det.reason });
      }
    } catch (err) {
      loopSkipped += 1;
      loopSuspicious.push({ file: r.item.entry.sourceFile, reason: `decode-fail: ${err.message.split('\n')[0]}` });
    }
    processed += 1;
    if (processed % 10 === 0 || processed === arcoItems.length) {
      process.stdout.write(`  ${processed}/${arcoItems.length}\n`);
    }
  }

  // Pizz entries don't carry loop fields (importer leaves them undefined).
  // Make sure the manifest doesn't have stale loop fields on pizz entries.
  for (const item of items) {
    if (item.articulation === 'pizz') {
      delete item.entry.loopStartSample;
      delete item.entry.loopEndSample;
    }
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log('');
  console.log(`arco with loop points: ${loopOk}`);
  console.log(`arco without loop:     ${loopSkipped} (voice falls back to play-through)`);
  if (loopSuspicious.length) {
    console.log('arco loop notes:');
    for (const s of loopSuspicious.slice(0, 30)) {
      console.log(`  ${s.file}  ${s.reason}`);
    }
    if (loopSuspicious.length > 30) {
      console.log(`  …and ${loopSuspicious.length - 30} more`);
    }
  }
  console.log(`manifest updated: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
