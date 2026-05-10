#!/usr/bin/env node
//
//  import-iowa-marimba.mjs
//
//  Created by Sebastian Suarez-Solis on 5/8/26.
//

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const SOURCE_URL = 'https://theremin.music.uiowa.edu/MIS-Pitches-2012/MISMarimba2012.html';
const AUDIO_BASE_URL = 'https://theremin.music.uiowa.edu/sound%20files/MIS%20Pitches%20-%202014/Percussion/Marimba/';
const ROOT = resolve(process.cwd());
const RAW_DIR = join(ROOT, 'source/iowa-marimba/raw');
const TRIM_DIR = join(ROOT, 'source/iowa-marimba/trimmed');
const OUT_DIR = join(ROOT, 'public/instruments/iowa-marimba');
const AUDIO_DIR = join(OUT_DIR, 'audio');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.full.json');
const README_PATH = join(OUT_DIR, 'README.md');
const TRIM_REPORT_PATH = join(OUT_DIR, 'trim-report.json');
const TRIM_VERSION = 'marimba-onset-v1';
const ANALYSIS_SAMPLE_RATE = 44100;

const NOTE_TO_SEMITONE = {
  C: 0,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  Gb: 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
};

const TRIM_PROFILES = {
  yarn: {
    preRollMs: 7,
    fadeInMs: 2,
    floorOffsetDb: 15,
    absoluteFloorDb: -62,
    holdMs: 4,
    floorWindowMs: 260,
    maxTrimMs: 650,
  },
  cord: {
    preRollMs: 5,
    fadeInMs: 1.5,
    floorOffsetDb: 18,
    absoluteFloorDb: -58,
    holdMs: 3,
    floorWindowMs: 220,
    maxTrimMs: 600,
  },
  rubber: {
    preRollMs: 4,
    fadeInMs: 1,
    floorOffsetDb: 20,
    absoluteFloorDb: -55,
    holdMs: 2,
    floorWindowMs: 200,
    maxTrimMs: 550,
  },
};

function argHas(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const pref = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(pref));
  return found ? found.slice(pref.length) : fallback;
}

const FORCE = argHas('--force');
const TRIM_ENABLED = !argHas('--no-trim');
const WRITE_TRIM_REPORT = argHas('--trim-report') || TRIM_ENABLED;
const FFMPEG = argValue('--ffmpeg', process.env.FFMPEG || 'ffmpeg');
const FFPROBE = argValue('--ffprobe', process.env.FFPROBE || 'ffprobe');

function midiFromNote(note) {
  const m = String(note || '').match(/^([A-G](?:b)?)(-?\d{1,2})$/);
  if (!m) return null;
  const pc = m[1];
  const octave = Number(m[2]);
  if (!Object.prototype.hasOwnProperty.call(NOTE_TO_SEMITONE, pc)) return null;
  return (octave + 1) * 12 + NOTE_TO_SEMITONE[pc];
}

function freqFromMidi(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

async function download(url, path) {
  if (await exists(path)) return false;

  await mkdir(dirname(path), { recursive: true });

  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} for ${url}`);

  await new Promise((resolvePromise, rejectPromise) => {
    const ws = createWriteStream(path);
    r.body.pipeTo(new WritableStream({
      write(chunk) {
        ws.write(Buffer.from(chunk));
      },
      close() {
        ws.end(resolvePromise);
      },
      abort(err) {
        ws.destroy(err);
        rejectPromise(err);
      },
    })).catch(rejectPromise);
  });

  return true;
}

function run(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${cmd} exited ${code}`));
    });
  });
}

function runCapture(cmd, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        const buffer = Buffer.concat(stdout);
        resolvePromise(options.text ? buffer.toString('utf8') : buffer);
      } else {
        const message = Buffer.concat(stderr).toString('utf8').trim();
        rejectPromise(new Error(`${cmd} exited ${code}${message ? `\n${message}` : ''}`));
      }
    });
  });
}

async function ffprobeDuration(path) {
  try {
    const out = await runCapture(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      path,
    ], { text: true });
    const n = Number(String(out).trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function chooseAudioEncoder() {
  let encoders = '';
  try {
    encoders = await runCapture(FFMPEG, ['-hide_banner', '-encoders'], { text: true });
  } catch {
    encoders = '';
  }

  if (/\blibvorbis\b/.test(encoders)) {
    return {
      id: 'libvorbis',
      delivery: 'Ogg Vorbis q5',
      args: ['-c:a', 'libvorbis', '-q:a', '5'],
    };
  }

  if (/\bvorbis\b/.test(encoders)) {
    return {
      id: 'vorbis',
      delivery: 'Ogg Vorbis q5 (native ffmpeg encoder)',
      args: ['-c:a', 'vorbis', '-strict', '-2', '-q:a', '5'],
    };
  }

  if (/\blibopus\b/.test(encoders)) {
    return {
      id: 'libopus',
      delivery: 'Ogg Opus 112k',
      args: ['-c:a', 'libopus', '-b:a', '112k', '-vbr', 'on'],
    };
  }

  if (/\bopus\b/.test(encoders)) {
    return {
      id: 'opus',
      delivery: 'Ogg Opus 112k (native ffmpeg encoder)',
      args: ['-c:a', 'opus', '-strict', '-2', '-b:a', '112k'],
    };
  }

  throw new Error('No usable Ogg audio encoder found. Install ffmpeg with libvorbis or libopus support.');
}

function extractLinks(html) {
  const links = [];
  const seen = new Set();

  // The page text displays .aiff, but the actual linked files are .aif
  // inside /sound files/MIS Pitches - 2014/Percussion/Marimba/.
  const fileRe = /Marimba\.(yarn|cord|rubber)\.ff\.([A-G](?:b)?-?\d{1,2})\.stereo\.aiff/gi;

  let m = null;

  while ((m = fileRe.exec(html)) !== null) {
    const displayFile = m[0];
    const downloadFile = displayFile.replace(/\.aiff$/i, '.aif');
    const mallet = m[1].toLowerCase();
    const note = m[2];

    if (seen.has(downloadFile)) continue;
    seen.add(downloadFile);

    links.push({
      url: new URL(downloadFile, AUDIO_BASE_URL).toString(),
      file: displayFile,
      downloadFile,
      mallet,
      note,
    });
  }

  links.sort((a, b) => {
    const ma = midiFromNote(a.note) ?? 0;
    const mb = midiFromNote(b.note) ?? 0;
    if (ma !== mb) return ma - mb;
    return a.mallet.localeCompare(b.mallet);
  });

  return links;
}

function ampToDb(v) {
  const n = Math.max(1e-9, Number(v) || 0);
  return 20 * Math.log10(n);
}

function rmsOfRange(samples, start, end) {
  const lo = Math.max(0, Math.min(samples.length, start | 0));
  const hi = Math.max(lo + 1, Math.min(samples.length, end | 0));
  let sum = 0;
  for (let i = lo; i < hi; i += 1) {
    const v = samples[i];
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, hi - lo));
}

function peakOfRange(samples, start, end) {
  const lo = Math.max(0, Math.min(samples.length, start | 0));
  const hi = Math.max(lo + 1, Math.min(samples.length, end | 0));
  let peak = 0;
  for (let i = lo; i < hi; i += 1) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

function findQuietCrossing(samples, index, searchSamples) {
  const start = Math.max(0, index - searchSamples);
  let best = index;
  let bestAbs = Math.abs(samples[index] || 0);

  for (let i = index; i >= start + 1; i -= 1) {
    const prev = samples[i - 1] || 0;
    const cur = samples[i] || 0;
    const abs = Math.abs(cur);
    if (abs < bestAbs) {
      best = i;
      bestAbs = abs;
    }
    if ((prev <= 0 && cur >= 0) || (prev >= 0 && cur <= 0)) return i;
  }

  return best;
}

function analyzeOnset(samples, sampleRate, item) {
  const profile = TRIM_PROFILES[item.mallet] || TRIM_PROFILES.cord;
  const len = samples.length;
  const originalDurationSec = len / sampleRate;
  const floorWindowSamples = Math.max(1, Math.min(len, Math.round(sampleRate * profile.floorWindowMs / 1000)));
  const noiseFloorAmp = rmsOfRange(samples, 0, floorWindowSamples);
  const noiseFloorDb = ampToDb(noiseFloorAmp);
  const peak = peakOfRange(samples, 0, len);
  const peakDb = ampToDb(peak);

  let thresholdDb = Math.max(profile.absoluteFloorDb, noiseFloorDb + profile.floorOffsetDb);
  // Avoid setting the dynamic threshold above a real-but-soft attack.
  thresholdDb = Math.min(thresholdDb, peakDb - 10);
  const thresholdAmp = Math.pow(10, thresholdDb / 20);

  const windowSamples = Math.max(32, Math.round(sampleRate * 0.0015));
  const hopSamples = Math.max(16, Math.round(sampleRate * 0.00075));
  const holdSamples = Math.max(1, Math.round(sampleRate * profile.holdMs / 1000));
  const holdWindows = Math.max(1, Math.ceil(holdSamples / hopSamples));
  const maxSearchSample = Math.min(len, Math.round(sampleRate * profile.maxTrimMs / 1000));

  let onsetIndex = 0;
  let consecutive = 0;

  for (let i = 0; i < maxSearchSample; i += hopSamples) {
    const rms = rmsOfRange(samples, i, i + windowSamples);
    const peakWindow = peakOfRange(samples, i, i + windowSamples);
    const crosses = rms >= thresholdAmp || peakWindow >= thresholdAmp * 1.65;

    if (crosses) {
      consecutive += 1;
      if (consecutive >= holdWindows) {
        onsetIndex = Math.max(0, i - (consecutive - 1) * hopSamples);
        break;
      }
    } else {
      consecutive = 0;
    }
  }

  if (onsetIndex <= 0 && peak > 0) {
    // Fallback: first sample above a conservative fraction of the peak.
    const fallbackThreshold = Math.max(thresholdAmp * 0.65, peak * 0.015);
    for (let i = 0; i < maxSearchSample; i += 1) {
      if (Math.abs(samples[i]) >= fallbackThreshold) {
        onsetIndex = i;
        break;
      }
    }
  }

  const preRollSamples = Math.round(sampleRate * profile.preRollMs / 1000);
  const roughTrimIndex = Math.max(0, onsetIndex - preRollSamples);
  const trimIndex = findQuietCrossing(samples, roughTrimIndex, Math.round(sampleRate * 0.006));
  const trimStartSec = Math.max(0, trimIndex / sampleRate);
  const detectedOnsetSec = Math.max(0, onsetIndex / sampleRate);
  const preRollSec = Math.max(0, detectedOnsetSec - trimStartSec);
  const fadeInSec = Math.max(0.0005, profile.fadeInMs / 1000);

  return {
    version: TRIM_VERSION,
    enabled: true,
    mallet: item.mallet,
    trimStartSec: Number(trimStartSec.toFixed(6)),
    preRollSec: Number(preRollSec.toFixed(6)),
    fadeInSec: Number(fadeInSec.toFixed(6)),
    originalDurationSec: Number(originalDurationSec.toFixed(6)),
    deliveredDurationSec: Number(Math.max(0, originalDurationSec - trimStartSec).toFixed(6)),
    detectedOnsetSec: Number(detectedOnsetSec.toFixed(6)),
    noiseFloorDb: Number(noiseFloorDb.toFixed(2)),
    peakDb: Number(peakDb.toFixed(2)),
    thresholdDb: Number(thresholdDb.toFixed(2)),
    profile: {
      preRollMs: profile.preRollMs,
      fadeInMs: profile.fadeInMs,
      floorOffsetDb: profile.floorOffsetDb,
      absoluteFloorDb: profile.absoluteFloorDb,
      holdMs: profile.holdMs,
    },
  };
}

async function decodeMonoF32(srcPath) {
  const raw = await runCapture(FFMPEG, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', srcPath,
    '-vn',
    '-ac', '1',
    '-ar', String(ANALYSIS_SAMPLE_RATE),
    '-f', 'f32le',
    'pipe:1',
  ]);

  return new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
}

function existingTrimFor(existingManifest, item) {
  const entry = existingManifest && existingManifest.notes && existingManifest.notes[item.note];
  const mallet = entry && entry.mallets && entry.mallets[item.mallet];
  const trim = mallet && mallet.trim;
  return trim && trim.version === TRIM_VERSION ? trim : null;
}

async function convertAiffToOgg(srcPath, destPath, item, encoder, existingManifest) {
  const destExists = await exists(destPath);
  const existingTrim = existingTrimFor(existingManifest, item);
  const shouldAnalyze = TRIM_ENABLED || WRITE_TRIM_REPORT;
  let trim = existingTrim;

  if (shouldAnalyze && (!trim || FORCE || !destExists)) {
    const samples = await decodeMonoF32(srcPath);
    trim = analyzeOnset(samples, ANALYSIS_SAMPLE_RATE, item);
  } else if (!TRIM_ENABLED) {
    const duration = await ffprobeDuration(srcPath);
    trim = {
      version: TRIM_VERSION,
      enabled: false,
      mallet: item.mallet,
      trimStartSec: 0,
      preRollSec: 0,
      fadeInSec: 0,
      originalDurationSec: Number(duration.toFixed(6)),
      deliveredDurationSec: Number(duration.toFixed(6)),
    };
  }

  const needsUpgrade = TRIM_ENABLED && !existingTrim;
  const shouldConvert = FORCE || !destExists || needsUpgrade;

  if (!shouldConvert) {
    return { converted: false, trim };
  }

  await mkdir(dirname(destPath), { recursive: true });

  const filters = [];
  if (TRIM_ENABLED && trim && trim.trimStartSec > 0) {
    filters.push(`atrim=start=${trim.trimStartSec.toFixed(6)}`);
    filters.push('asetpts=PTS-STARTPTS');
  }
  if (TRIM_ENABLED && trim && trim.fadeInSec > 0) {
    filters.push(`afade=t=in:st=0:d=${trim.fadeInSec.toFixed(6)}`);
  }

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', srcPath,
    '-vn',
  ];

  if (filters.length) args.push('-af', filters.join(','));
  args.push('-ar', '44100', '-ac', '2', ...encoder.args, destPath);

  await run(FFMPEG, args);

  if (trim) {
    const delivered = await ffprobeDuration(destPath);
    if (delivered > 0) trim.deliveredDurationSec = Number(delivered.toFixed(6));
  }

  if (TRIM_ENABLED && trim) {
    const trimmedDebugPath = join(TRIM_DIR, item.mallet, item.file.replace(/\.aiff$/i, '.trim.json'));
    await mkdir(dirname(trimmedDebugPath), { recursive: true });
    await writeFile(trimmedDebugPath, JSON.stringify({ sourceFile: item.file, downloadFile: item.downloadFile, ...trim }, null, 2) + '\n');
  }

  return { converted: true, trim };
}

function trimReportWarnings(records) {
  const trims = records
    .filter((r) => r && r.trim && r.trim.enabled)
    .map((r) => ({ ...r, ms: Number(r.trim.trimStartSec || 0) * 1000 }))
    .sort((a, b) => a.ms - b.ms);

  if (!trims.length) return { longLeadingSilence: [], possibleClippedOnset: [] };

  const longLeadingSilence = trims
    .filter((r) => r.ms >= 100)
    .slice(-20)
    .sort((a, b) => b.ms - a.ms);

  const possibleClippedOnset = trims
    .filter((r) => r.ms <= 2)
    .slice(0, 20);

  return { longLeadingSilence, possibleClippedOnset };
}

function median(values) {
  const xs = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(TRIM_DIR, { recursive: true });
  await mkdir(AUDIO_DIR, { recursive: true });

  const encoder = await chooseAudioEncoder();
  const existingManifest = await readJsonIfExists(MANIFEST_PATH);
  const html = await fetchText(SOURCE_URL);
  const links = extractLinks(html);

  if (!links.length) {
    console.error('Fetched page, but could not extract marimba filenames.');
    console.error('First 500 chars:');
    console.error(html.slice(0, 500));
    throw new Error('No Marimba yarn/cord/rubber AIFF links found.');
  }

  console.log(`found marimba source files: ${links.length}`);
  console.log(`first: ${links[0].file}`);
  console.log(`last: ${links[links.length - 1].file}`);
  console.log(`trim leading silence: ${TRIM_ENABLED ? 'on' : 'off'}${TRIM_ENABLED ? ' (pass --no-trim to disable)' : ' (pass --trim or omit --no-trim to enable)'}`);
  console.log(`force reconvert: ${FORCE ? 'on' : 'off'}${FORCE ? '' : ' (pass --force to regenerate existing audio)'}`);
  console.log(`ogg encoder: ${encoder.id}`);

  const notes = {};
  const missing = [];
  const trimRecords = [];
  let downloaded = 0;
  let converted = 0;

  for (const item of links) {
    const rawPath = join(RAW_DIR, item.downloadFile || item.file);
    const outRel = `audio/${item.mallet}/${item.file.replace(/\.aiff$/i, '.ogg')}`;
    const outPath = join(OUT_DIR, outRel);

    if (await download(item.url, rawPath)) downloaded += 1;

    const result = await convertAiffToOgg(rawPath, outPath, item, encoder, existingManifest);
    if (result.converted) converted += 1;

    const midi = midiFromNote(item.note);
    if (!Number.isFinite(midi)) continue;

    if (!notes[item.note]) {
      notes[item.note] = {
        midi,
        frequency: Number(freqFromMidi(midi).toFixed(6)),
        mallets: {},
      };
    }

    const sample = {
      url: outRel,
      sourceFile: item.file,
      downloadFile: item.downloadFile || item.file,
      rootNote: item.note,
      rootMidi: midi,
    };

    if (result.trim) sample.trim = result.trim;

    notes[item.note].mallets[item.mallet] = sample;

    if (result.trim) {
      trimRecords.push({
        sourceFile: item.file,
        downloadFile: item.downloadFile || item.file,
        mallet: item.mallet,
        note: item.note,
        output: outRel,
        converted: result.converted,
        trim: result.trim,
      });
    }
  }

  for (const [note, entry] of Object.entries(notes)) {
    for (const mallet of ['yarn', 'cord', 'rubber']) {
      if (!entry.mallets[mallet]) missing.push(`${note}:${mallet}`);
    }
  }

  const noteNames = Object.keys(notes).sort((a, b) => notes[a].midi - notes[b].midi);
  const trimMs = trimRecords
    .filter((r) => r.trim && r.trim.enabled)
    .map((r) => Number(r.trim.trimStartSec || 0) * 1000);

  const manifest = {
    id: 'iowa-marimba-2012',
    name: 'Iowa Marimba 2012',
    source: 'University of Iowa Musical Instrument Samples',
    instrument: 'Marimba',
    recordedAt: 'Anechoic Chamber',
    performer: 'Andrew Thierauf',
    sourceUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    format: {
      source: '24-bit / 44.1 kHz stereo AIFF',
      delivery: encoder.delivery,
    },
    trim: {
      version: TRIM_VERSION,
      enabled: TRIM_ENABLED,
      policy: TRIM_ENABLED
        ? 'dynamic onset trim; preserve physical mallet pre-roll and full decay tail'
        : 'disabled; converted from raw source without onset trim',
      profiles: TRIM_PROFILES,
      report: 'trim-report.json',
    },
    mallets: ['yarn', 'cord', 'rubber'],
    range: {
      low: noteNames[0] || '',
      high: noteNames[noteNames.length - 1] || '',
    },
    missing,
    fallbackPolicy: 'nearest-same-mallet-else-nearest-mallet',
    notes,
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  const reportWarnings = trimReportWarnings(trimRecords);
  const trimReport = {
    version: TRIM_VERSION,
    generatedAt: new Date().toISOString(),
    enabled: TRIM_ENABLED,
    sourceFiles: links.length,
    convertedThisRun: converted,
    encoder: encoder.id,
    summary: {
      count: trimMs.length,
      minTrimMs: trimMs.length ? Number(Math.min(...trimMs).toFixed(3)) : 0,
      medianTrimMs: trimMs.length ? Number(median(trimMs).toFixed(3)) : 0,
      maxTrimMs: trimMs.length ? Number(Math.max(...trimMs).toFixed(3)) : 0,
    },
    warnings: {
      longLeadingSilence: reportWarnings.longLeadingSilence.map((r) => ({
        sourceFile: r.sourceFile,
        mallet: r.mallet,
        note: r.note,
        trimMs: Number(r.ms.toFixed(3)),
      })),
      possibleClippedOnset: reportWarnings.possibleClippedOnset.map((r) => ({
        sourceFile: r.sourceFile,
        mallet: r.mallet,
        note: r.note,
        trimMs: Number(r.ms.toFixed(3)),
      })),
    },
    records: trimRecords,
  };

  if (WRITE_TRIM_REPORT) {
    await writeFile(TRIM_REPORT_PATH, JSON.stringify(trimReport, null, 2) + '\n');
  }

  await writeFile(README_PATH, `# Iowa Marimba 2012

This folder contains browser-delivery conversions of the University of Iowa Electronic Music Studios Musical Instrument Samples marimba recordings.

Source: ${SOURCE_URL}

Instrument: Marimba  
Performer: Andrew Thierauf  
Location: Anechoic Chamber  
Microphone: Earthworks QTC40  
Interface: Metric Halo 2882  
Recording format listed by Iowa EMS: 24-bit / 44.1 kHz stereo AIFF  
Browser delivery format generated here: ${encoder.delivery}

Mallet families:

\`\`\`text
yarn
cord
rubber
\`\`\`

Raw AIFF downloads should remain in:

\`\`\`text
source/iowa-marimba/raw/
\`\`\`

Generated browser assets live in:

\`\`\`text
public/instruments/iowa-marimba/audio/
public/instruments/iowa-marimba/manifest.full.json
public/instruments/iowa-marimba/trim-report.json
\`\`\`

Onset trimming:

\`\`\`text
version: ${TRIM_VERSION}
enabled: ${TRIM_ENABLED ? 'yes' : 'no'}
policy: dynamic floor-relative onset trim; preserve mallet pre-roll and full decay tail
\`\`\`

Useful commands:

\`\`\`bash
node scripts/import-iowa-marimba.mjs --force --trim-report
node scripts/import-iowa-marimba.mjs --no-trim --force
\`\`\`

Generated: ${new Date().toISOString()}
`);

  const manifestText = await readFile(MANIFEST_PATH, 'utf8');

  console.log('');
  console.log('Iowa Marimba import complete');
  console.log('');
  console.log(`source links: ${links.length}`);
  console.log(`downloaded this run: ${downloaded}`);
  console.log(`converted this run: ${converted}`);
  console.log(`notes: ${noteNames.length}`);
  console.log(`missing mallet entries: ${missing.length}`);
  if (trimMs.length) {
    console.log(`trim median: ${median(trimMs).toFixed(1)} ms`);
    console.log(`trim min/max: ${Math.min(...trimMs).toFixed(1)} / ${Math.max(...trimMs).toFixed(1)} ms`);
  }
  if (reportWarnings.longLeadingSilence.length) {
    console.log('');
    console.log('WARN unusually long leading silence:');
    for (const r of reportWarnings.longLeadingSilence.slice(0, 8)) {
      console.log(`  ${r.sourceFile} ${r.ms.toFixed(1)} ms`);
    }
  }
  if (reportWarnings.possibleClippedOnset.length) {
    console.log('');
    console.log('WARN possible clipped onset:');
    for (const r of reportWarnings.possibleClippedOnset.slice(0, 8)) {
      console.log(`  ${r.sourceFile} ${r.ms.toFixed(1)} ms`);
    }
  }
  console.log(`manifest bytes: ${manifestText.length}`);
  console.log(`manifest: ${MANIFEST_PATH}`);
  if (WRITE_TRIM_REPORT) console.log(`trim report: ${TRIM_REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
