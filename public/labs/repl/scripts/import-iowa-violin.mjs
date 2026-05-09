#!/usr/bin/env node

import { mkdir, writeFile, readFile, readdir, access, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';

const SOURCE_URL = 'https://theremin.music.uiowa.edu/MIS-Pitches-2012/MISViolin2012.html';
const ROOT = resolve(process.cwd());
const RAW_DIR = join(ROOT, 'source/iowa/raw-violin');
const ZIP_DIR = join(RAW_DIR, 'zips');
const OUT_DIR = join(ROOT, 'public/instruments/iowa-violin');
const AUDIO_DIR = join(OUT_DIR, 'audio');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.full.json');
const README_PATH = join(OUT_DIR, 'README.md');

const ARTICULATIONS = ['arco', 'pizz'];
const STRINGS = ['G', 'D', 'A', 'E'];
const OPEN_STRING_MIDI = { G: 55, D: 62, A: 69, E: 76 };

const NOTE_TO_SEMITONE = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11,
};

function midiFromNote(note) {
  const m = String(note || '').match(/^([A-G](?:b|#)?)(-?\d{1,2})$/);
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
  try { await access(path); return true; } catch { return false; }
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
      write(chunk) { ws.write(Buffer.from(chunk)); },
      close() { ws.end(resolvePromise); },
      abort(err) { ws.destroy(err); rejectPromise(err); },
    })).catch(rejectPromise);
  });
  return true;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${cmd} exited ${code}`));
    });
  });
}

function runQuiet(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${cmd} exited ${code}\n${stderr}`));
    });
  });
}

// Iowa pages quote hrefs with literal spaces; we URL-encode while preserving
// the path structure when resolving against the source URL.
function resolveHref(href) {
  try {
    const safe = href.replace(/ /g, '%20');
    return new URL(safe, SOURCE_URL).toString();
  } catch (_) {
    return href;
  }
}

function extractZipLinks(html) {
  const out = [];
  const re = /href\s*=\s*"([^"]*Violin\.(arco|pizz)\.ff\.sul([GDAE])\.stereo\.zip)"/gi;
  let m = null;
  while ((m = re.exec(html)) !== null) {
    out.push({
      url: resolveHref(m[1]),
      file: basename(m[1]),
      articulation: m[2].toLowerCase(),
      string: m[3].toUpperCase(),
    });
  }
  return out;
}

function extractAifLinks(html) {
  const out = [];
  const re = /href\s*=\s*"([^"]*Violin\.(arco|pizz)\.ff\.sul([GDAE])\.([A-G](?:b|#)?-?\d{1,2})\.stereo\.aiff?)"/gi;
  let m = null;
  while ((m = re.exec(html)) !== null) {
    out.push({
      url: resolveHref(m[1]),
      file: basename(m[1]),
      articulation: m[2].toLowerCase(),
      string: m[3].toUpperCase(),
      note: m[4],
    });
  }
  return out;
}

async function extractZip(zipPath, destDir) {
  await mkdir(destDir, { recursive: true });
  await runQuiet('unzip', ['-o', '-q', zipPath, '-d', destDir]);
}

async function findAifFiles(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      const nested = await findAifFiles(full);
      out.push(...nested);
    } else if (ent.isFile() && /\.aiff?$/i.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

function parseAifFilename(file) {
  const base = basename(file);
  const m = base.match(/^Violin\.(arco|pizz)\.ff\.sul([GDAE])\.([A-G](?:b|#)?-?\d{1,2})\.stereo\.aiff?$/i);
  if (!m) return null;
  return {
    file: base,
    articulation: m[1].toLowerCase(),
    string: m[2].toUpperCase(),
    note: m[3],
  };
}

async function convertAifToOgg(srcPath, destPath) {
  if (await exists(destPath)) return false;
  await mkdir(dirname(destPath), { recursive: true });
  await runQuiet('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', srcPath,
    '-vn',
    '-acodec', 'libvorbis',
    '-q:a', '5',
    destPath,
  ]);
  return true;
}

async function tryDownloadZips(zipLinks) {
  const downloaded = [];
  for (const z of zipLinks) {
    const zipPath = join(ZIP_DIR, z.file);
    try {
      if (await download(z.url, zipPath)) {
        process.stdout.write(`  fetched ${z.file}\n`);
      }
      downloaded.push({ ...z, zipPath });
    } catch (err) {
      process.stdout.write(`  WARN ${z.file}: ${err.message}\n`);
    }
  }
  return downloaded;
}

async function gatherSamplesFromZips(zips) {
  const items = [];
  for (const z of zips) {
    const extractDir = join(RAW_DIR, `${z.articulation}_sul${z.string}`);
    if (!(await exists(extractDir))) {
      await extractZip(z.zipPath, extractDir);
    }
    const aifs = await findAifFiles(extractDir);
    for (const aifPath of aifs) {
      const parsed = parseAifFilename(aifPath);
      if (!parsed) continue;
      if (parsed.articulation !== z.articulation || parsed.string !== z.string) continue;
      items.push({ ...parsed, srcPath: aifPath });
    }
  }
  return items;
}

async function gatherSamplesFromAifLinks(aifLinks) {
  const items = [];
  for (const link of aifLinks) {
    const srcPath = join(RAW_DIR, 'individual', link.file);
    try {
      if (await download(link.url, srcPath)) {
        process.stdout.write(`  fetched ${link.file}\n`);
      }
      items.push({ ...link, srcPath });
    } catch (err) {
      process.stdout.write(`  WARN ${link.file}: ${err.message}\n`);
    }
  }
  return items;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(ZIP_DIR, { recursive: true });
  await mkdir(AUDIO_DIR, { recursive: true });

  console.log(`Iowa Violin import — fetching ${SOURCE_URL}`);
  const html = await fetchText(SOURCE_URL);

  const zipLinks = extractZipLinks(html);
  const aifLinks = extractAifLinks(html);

  console.log(`  zip bundles found: ${zipLinks.length}`);
  console.log(`  per-file aif links found: ${aifLinks.length}`);

  let samples = [];

  if (zipLinks.length) {
    console.log('Downloading ZIP bundles…');
    const downloadedZips = await tryDownloadZips(zipLinks);
    console.log(`Extracting ${downloadedZips.length} bundles…`);
    samples = await gatherSamplesFromZips(downloadedZips);
  }

  // If zips missed any (artic, string) we have aif links for, fill in.
  const haveCombo = new Set(samples.map((s) => `${s.articulation}|${s.string}`));
  const missingCombos = new Set();
  for (const link of aifLinks) {
    const key = `${link.articulation}|${link.string}`;
    if (!haveCombo.has(key)) missingCombos.add(key);
  }
  if (missingCombos.size) {
    console.log(`Falling back to per-file fetch for ${missingCombos.size} (artic,string) combo(s)…`);
    const fallbackLinks = aifLinks.filter((l) => missingCombos.has(`${l.articulation}|${l.string}`));
    const more = await gatherSamplesFromAifLinks(fallbackLinks);
    samples.push(...more);
  }

  if (!samples.length) {
    throw new Error('No violin samples gathered — neither ZIPs nor per-file links resolved.');
  }

  console.log(`Converting ${samples.length} samples to OGG…`);
  let converted = 0;
  const seen = new Set();
  const dedup = [];
  for (const s of samples) {
    const key = `${s.articulation}|${s.string}|${s.note}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(s);
  }

  const samplesByArtic = { arco: { G: {}, D: {}, A: {}, E: {} }, pizz: { G: {}, D: {}, A: {}, E: {} } };
  let lowMidi = Infinity;
  let highMidi = -Infinity;
  let lowName = '';
  let highName = '';

  for (const s of dedup) {
    const midi = midiFromNote(s.note);
    if (!Number.isFinite(midi)) continue;

    const outRel = `audio/${s.articulation}/sul${s.string}/Violin.${s.articulation}.ff.sul${s.string}.${s.note}.ogg`;
    const outPath = join(OUT_DIR, outRel);
    if (await convertAifToOgg(s.srcPath, outPath)) converted += 1;

    const entry = {
      midi,
      frequency: Number(freqFromMidi(midi).toFixed(6)),
      url: outRel,
      sourceFile: s.file,
      rootNote: s.note,
      rootMidi: midi,
      sampleRate: 44100,
    };
    if (s.articulation === 'arco') {
      entry.loopStartSample = null;
      entry.loopEndSample = null;
    }

    samplesByArtic[s.articulation][s.string][s.note] = entry;

    if (midi < lowMidi) { lowMidi = midi; lowName = s.note; }
    if (midi > highMidi) { highMidi = midi; highName = s.note; }
  }

  // Sort each (articulation, string) bucket by MIDI for stable JSON output.
  const sortedSamples = { arco: {}, pizz: {} };
  for (const artic of ARTICULATIONS) {
    for (const str of STRINGS) {
      const bucket = samplesByArtic[artic][str] || {};
      const ordered = Object.keys(bucket)
        .sort((a, b) => bucket[a].midi - bucket[b].midi)
        .reduce((acc, n) => { acc[n] = bucket[n]; return acc; }, {});
      sortedSamples[artic][str] = ordered;
    }
  }

  // Detect missing (artic, string, pitch) gaps inside each string's covered range.
  const missing = [];
  for (const artic of ARTICULATIONS) {
    for (const str of STRINGS) {
      const bucket = sortedSamples[artic][str];
      const midis = Object.values(bucket).map((e) => e.midi).sort((a, b) => a - b);
      if (!midis.length) continue;
      for (let m = midis[0]; m <= midis[midis.length - 1]; m += 1) {
        const found = midis.includes(m);
        if (!found) {
          missing.push(`${artic}:sul${str}:midi${m}`);
        }
      }
    }
  }

  const manifest = {
    id: 'iowa-violin',
    name: 'Iowa Violin',
    source: 'University of Iowa Musical Instrument Samples',
    instrument: 'Solo violin (Iowa MIS Violin 2012 set)',
    sourceUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    format: {
      source: '24-bit / 44.1 kHz stereo AIFF',
      delivery: 'Ogg Vorbis q5',
    },
    license: {
      summary: 'University of Iowa EMS describes these recordings as freely available for download and use in projects.',
      url: 'https://theremin.music.uiowa.edu/MIS.html',
    },
    articulations: ARTICULATIONS,
    strings: STRINGS,
    openStrings: OPEN_STRING_MIDI,
    range: { low: lowName, high: highName },
    missing,
    fallbackPolicy: 'exact(artic,string,pitch) -> exact(artic,*,pitch) -> nearest(artic,string,pitch) -> nearest(artic,*,pitch)',
    samples: sortedSamples,
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  await writeFile(README_PATH, `# Iowa Violin

Browser-delivery conversions of the University of Iowa Electronic Music Studios MIS Violin 2012 recordings.

Source: ${SOURCE_URL}

Recording format listed by Iowa EMS: 24-bit / 44.1 kHz stereo AIFF (\`.aif\`)
Browser delivery format generated here: Ogg Vorbis q5

Two articulations (arco, pizzicato) at one dynamic level (ff), recorded across four strings (sul G, D, A, E). The REPL voice synthesizes pp/mf from this single ff layer via filter + gain shaping.

Raw downloads (zip bundles + extracted aifs) live in:

\`\`\`text
source/iowa/raw-violin/
\`\`\`

Generated browser assets:

\`\`\`text
public/instruments/iowa-violin/audio/
public/instruments/iowa-violin/manifest.full.json
\`\`\`

Loop points (\`loopStartSample\`, \`loopEndSample\`) for arco entries are filled in by \`scripts/trim-iowa-violin.mjs\`, run after this importer.

Generated: ${new Date().toISOString()}
`);

  const manifestText = await readFile(MANIFEST_PATH, 'utf8');
  console.log('');
  console.log('Iowa Violin import complete');
  console.log('');
  console.log(`unique samples:        ${dedup.length}`);
  console.log(`converted this run:    ${converted}`);
  console.log(`pitch range:           ${lowName} … ${highName}`);
  console.log(`gaps inside coverage:  ${missing.length}`);
  console.log(`manifest bytes:        ${manifestText.length}`);
  console.log(`manifest:              ${MANIFEST_PATH}`);
  console.log('');
  console.log('Next: run scripts/trim-iowa-violin.mjs to trim leading silence and detect arco loop points.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
