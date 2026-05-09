#!/usr/bin/env node
//
//  import-iowa-marimba.mjs
//  
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
const OUT_DIR = join(ROOT, 'public/instruments/iowa-marimba');
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
      console.error('Fetched page, but could not extract marimba filenames.');
      console.error('First 500 chars:');
      console.error(html.slice(0, 500));
      throw new Error('No Marimba yarn/cord/rubber AIFF links found.');
    }

    console.log(`found marimba source files: ${links.length}`);
    console.log(`first: ${links[0].file}`);
    console.log(`last: ${links[links.length - 1].file}`);

  const notes = {};
  const missing = [];
  let downloaded = 0;
  let converted = 0;

  for (const item of links) {
      const rawPath = join(RAW_DIR, item.downloadFile || item.file);
    const outRel = `audio/${item.mallet}/${item.file.replace(/\.aiff$/i, '.ogg')}`;
    const outPath = join(OUT_DIR, outRel);

    if (await download(item.url, rawPath)) downloaded += 1;
    if (await convertAiffToOgg(rawPath, outPath)) converted += 1;

    const midi = midiFromNote(item.note);
    if (!Number.isFinite(midi)) continue;

    if (!notes[item.note]) {
      notes[item.note] = {
        midi,
        frequency: Number(freqFromMidi(midi).toFixed(6)),
        mallets: {},
      };
    }

    notes[item.note].mallets[item.mallet] = {
      url: outRel,
        sourceFile: item.file,
        downloadFile: item.downloadFile || item.file,
      rootNote: item.note,
      rootMidi: midi,
    };
  }

  for (const [note, entry] of Object.entries(notes)) {
    for (const mallet of ['yarn', 'cord', 'rubber']) {
      if (!entry.mallets[mallet]) missing.push(`${note}:${mallet}`);
    }
  }

  const noteNames = Object.keys(notes).sort((a, b) => notes[a].midi - notes[b].midi);

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
      delivery: 'Ogg Vorbis q5',
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

  await writeFile(README_PATH, `# Iowa Marimba 2012

This folder contains browser-delivery conversions of the University of Iowa Electronic Music Studios Musical Instrument Samples marimba recordings.

Source: ${SOURCE_URL}

Instrument: Marimba  
Performer: Andrew Thierauf  
Location: Anechoic Chamber  
Microphone: Earthworks QTC40  
Interface: Metric Halo 2882  
Recording format listed by Iowa EMS: 24-bit / 44.1 kHz stereo AIFF  
Browser delivery format generated here: Ogg Vorbis q5

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
  console.log(`manifest bytes: ${manifestText.length}`);
  console.log(`manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
