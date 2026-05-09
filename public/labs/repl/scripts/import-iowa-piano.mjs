#!/usr/bin/env node

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const SOURCE_URL = 'https://theremin.music.uiowa.edu/MISpiano.html';
const ROOT = resolve(process.cwd());
const RAW_DIR = join(ROOT, 'source/iowa/raw');
const OUT_DIR = join(ROOT, 'public/instruments/iowa-piano');
const AUDIO_DIR = join(OUT_DIR, 'audio');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.full.json');
const README_PATH = join(OUT_DIR, 'README.md');

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

function extractLinks(html) {
  const links = [];
  const re = /href="([^"]*Piano\.(pp|mf|ff)\.([A-G](?:b)?-?\d{1,2})\.aiff)"/g;
  let m = null;

  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const layer = m[2];
    const note = m[3];
    const file = href.split('/').pop();
    const url = new URL(href, SOURCE_URL).toString();
    links.push({ url, file, layer, note });
  }

  links.sort((a, b) => {
    const ma = midiFromNote(a.note) ?? 0;
    const mb = midiFromNote(b.note) ?? 0;
    if (ma !== mb) return ma - mb;
    return a.layer.localeCompare(b.layer);
  });

  return links;
}

async function convertAiffToOgg(srcPath, destPath) {
  if (await exists(destPath)) return false;
  await mkdir(dirname(destPath), { recursive: true });
  await run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    srcPath,
    '-vn',
    '-acodec',
    'libvorbis',
    '-q:a',
    '5',
    destPath,
  ]);
  return true;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(AUDIO_DIR, { recursive: true });

  const html = await fetchText(SOURCE_URL);
  const links = extractLinks(html);

  if (!links.length) {
    throw new Error('No Piano.pp/mf/ff AIFF links found.');
  }

  const notes = {};
  const missing = [];
  let downloaded = 0;
  let converted = 0;

  for (const item of links) {
    const rawPath = join(RAW_DIR, item.file);
    const outRel = `audio/${item.layer}/${item.file.replace(/\.aiff$/i, '.ogg')}`;
    const outPath = join(OUT_DIR, outRel);

    if (await download(item.url, rawPath)) downloaded += 1;
    if (await convertAiffToOgg(rawPath, outPath)) converted += 1;

    const midi = midiFromNote(item.note);
    if (!Number.isFinite(midi)) continue;

    if (!notes[item.note]) {
      notes[item.note] = {
        midi,
        frequency: Number(freqFromMidi(midi).toFixed(6)),
        layers: {},
      };
    }

    notes[item.note].layers[item.layer] = {
      url: outRel,
      sourceFile: item.file,
      rootNote: item.note,
      rootMidi: midi,
    };
  }

  for (const [note, entry] of Object.entries(notes)) {
    for (const layer of ['pp', 'mf', 'ff']) {
      if (!entry.layers[layer]) missing.push(`${note}:${layer}`);
    }
  }

  const noteNames = Object.keys(notes).sort((a, b) => notes[a].midi - notes[b].midi);
  const manifest = {
    id: 'iowa-piano',
    name: 'Iowa Piano',
    source: 'University of Iowa Musical Instrument Samples',
    instrument: 'Steinway & Sons model B',
    sourceUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    format: {
      source: '16-bit / 44.1 kHz stereo AIFF',
      delivery: 'Ogg Vorbis q5',
    },
    license: {
      summary: 'University of Iowa EMS describes these recordings as freely available for download and use in projects.',
      url: 'https://theremin.music.uiowa.edu/MIS.html',
    },
    layers: ['pp', 'mf', 'ff'],
    range: {
      low: noteNames[0] || '',
      high: noteNames[noteNames.length - 1] || '',
    },
    missing,
    fallbackPolicy: 'nearest-same-layer-else-nearest-layer',
    notes,
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  await writeFile(README_PATH, `# Iowa Piano

This folder contains browser-delivery conversions of the University of Iowa Electronic Music Studios Musical Instrument Samples piano recordings.

Source: ${SOURCE_URL}

Instrument: Steinway & Sons model B
Performer: Evan Mazunik
Recording format listed by Iowa EMS: 16-bit / 44.1 kHz stereo AIFF
Browser delivery format generated here: Ogg Vorbis q5

These files are used by the REPL as a first-class \`piano\` voice, not as generic one-shot sample-bank material.

Raw AIFF downloads should remain in:

\`\`\`text
source/iowa/raw/
\`\`\`

Generated browser assets live in:

\`\`\`text
public/instruments/iowa-piano/audio/
public/instruments/iowa-piano/manifest.full.json
\`\`\`

Generated: ${new Date().toISOString()}
`);

  const manifestText = await readFile(MANIFEST_PATH, 'utf8');
  console.log('');
  console.log('Iowa Piano import complete');
  console.log('');
  console.log(`source links: ${links.length}`);
  console.log(`downloaded this run: ${downloaded}`);
  console.log(`converted this run: ${converted}`);
  console.log(`notes: ${noteNames.length}`);
  console.log(`missing layer entries: ${missing.length}`);
  console.log(`manifest bytes: ${manifestText.length}`);
  console.log(`manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
