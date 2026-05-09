#!/usr/bin/env node

import { mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';

const SOURCE_URL = 'https://theremin.music.uiowa.edu/MIS-Pitches-2012/MISCello2012.html';
const ROOT = resolve(process.cwd());
const RAW_DIR = join(ROOT, 'source/iowa-cello/raw');
const ZIP_DIR = join(RAW_DIR, 'zips');
const INDIVIDUAL_DIR = join(RAW_DIR, 'individual');
const OUT_DIR = join(ROOT, 'public/instruments/iowa-cello');
const AUDIO_DIR = join(OUT_DIR, 'audio');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.full.json');
const README_PATH = join(OUT_DIR, 'README.md');

const ARTICULATIONS = ['arco', 'pizz'];
const STRINGS = ['C', 'G', 'D', 'A'];
const OPEN_STRING_MIDI = { C: 36, G: 43, D: 50, A: 57 };

const NOTE_TO_SEMITONE = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11,
};

const TRIM = process.argv.includes('--trim') && !process.argv.includes('--no-trim');

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

function resolveHref(href) {
  try {
    return new URL(String(href || '').replace(/ /g, '%20'), SOURCE_URL).toString();
  } catch (_) {
    return href;
  }
}

function extractZipLinks(html) {
  const out = [];
  const re = /href\s*=\s*"([^"]*Cello\.(arco|pizz)\.ff\.sul([CGDA])\.stereo\.zip)"/gi;
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
  const seen = new Set();
  const hrefRe = /href\s*=\s*"([^"]*Cello\.(arco|pizz)\.ff\.sul([CGDA])\.([A-G](?:b|#)?-?\d{1,2})\.stereo\.aiff?)"/gi;
  let m = null;
  while ((m = hrefRe.exec(html)) !== null) {
    const file = basename(m[1]);
    const key = file.replace(/\.aiff$/i, '.aif');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url: resolveHref(m[1]),
      file,
      articulation: m[2].toLowerCase(),
      string: m[3].toUpperCase(),
      note: m[4],
    });
  }

  // Fallback for pages that render file names in text but hide actual hrefs.
  const textRe = /Cello\.(arco|pizz)\.ff\.sul([CGDA])\.([A-G](?:b|#)?-?\d{1,2})\.stereo\.aiff?/gi;
  while ((m = textRe.exec(html)) !== null) {
    const displayFile = m[0];
    const file = displayFile.replace(/\.aiff$/i, '.aif');
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({
      url: resolveHref(`../sound files/MIS Pitches - 2014/Strings/Cello/${file}`),
      file: displayFile,
      downloadFile: file,
      articulation: m[1].toLowerCase(),
      string: m[2].toUpperCase(),
      note: m[3],
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
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await findAifFiles(full));
    else if (ent.isFile() && /\.aiff?$/i.test(ent.name)) out.push(full);
  }
  return out;
}

function parseAifFilename(file) {
  const base = basename(file);
  const m = base.match(/^Cello\.(arco|pizz)\.ff\.sul([CGDA])\.([A-G](?:b|#)?-?\d{1,2})\.stereo\.aiff?$/i);
  if (!m) return null;
  return {
    file: base,
    articulation: m[1].toLowerCase(),
    string: m[2].toUpperCase(),
    note: m[3],
  };
}

async function convertAifToOgg(srcPath, destPath, articulation) {
  if (await exists(destPath)) return false;
  await mkdir(dirname(destPath), { recursive: true });

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', srcPath, '-vn'];
  if (TRIM) {
    args.push('-af', articulation === 'pizz'
      ? 'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.005'
      : 'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.015');
  }
  args.push('-acodec', 'libvorbis', '-q:a', '5', destPath);
  await runQuiet('ffmpeg', args);
  return true;
}

function approxLoopForArco(midi) {
  // Metadata only. The v1 cello voice does not rely on native hard loops.
  const start = 44100;
  const length = midi < 48 ? 44100 : midi < 60 ? 33075 : 22050;
  return { loopStartSample: start, loopEndSample: start + length, loopMethod: 'approx-register-window-v1' };
}

async function gatherSamplesFromZips(zips) {
  const items = [];
  for (const z of zips) {
    const zipPath = join(ZIP_DIR, z.file);
    try {
      if (await download(z.url, zipPath)) process.stdout.write(`  fetched ${z.file}\n`);
      const extractDir = join(RAW_DIR, `${z.articulation}_sul${z.string}`);
      if (!(await exists(extractDir))) await extractZip(zipPath, extractDir);
      const aifs = await findAifFiles(extractDir);
      for (const aifPath of aifs) {
        const parsed = parseAifFilename(aifPath);
        if (!parsed) continue;
        items.push({ ...parsed, srcPath: aifPath });
      }
    } catch (err) {
      process.stdout.write(`  WARN ${z.file}: ${err.message}\n`);
    }
  }
  return items;
}

async function gatherSamplesFromAifLinks(aifLinks) {
  const items = [];
  for (const link of aifLinks) {
    const file = link.downloadFile || link.file;
    const srcPath = join(INDIVIDUAL_DIR, file);
    try {
      if (await download(link.url, srcPath)) process.stdout.write(`  fetched ${file}\n`);
      items.push({ ...link, file: basename(file), srcPath });
    } catch (err) {
      process.stdout.write(`  WARN ${file}: ${err.message}\n`);
    }
  }
  return items;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(ZIP_DIR, { recursive: true });
  await mkdir(INDIVIDUAL_DIR, { recursive: true });
  await mkdir(AUDIO_DIR, { recursive: true });

  console.log(`Iowa Cello import — fetching ${SOURCE_URL}`);
  console.log(`  trim leading silence: ${TRIM ? 'on' : 'off'} (pass --trim to enable)`);
  const html = await fetchText(SOURCE_URL);
  const zipLinks = extractZipLinks(html);
  const aifLinks = extractAifLinks(html);
  console.log(`  zip bundles found: ${zipLinks.length}`);
  console.log(`  per-file aif links found: ${aifLinks.length}`);

  let samples = [];
  if (zipLinks.length) samples = await gatherSamplesFromZips(zipLinks);

  const haveCombo = new Set(samples.map((s) => `${s.articulation}|${s.string}`));
  const missingCombos = new Set();
  for (const link of aifLinks) {
    const key = `${link.articulation}|${link.string}`;
    if (!haveCombo.has(key)) missingCombos.add(key);
  }
  if (missingCombos.size || !samples.length) {
    const fallback = samples.length ? aifLinks.filter((l) => missingCombos.has(`${l.articulation}|${l.string}`)) : aifLinks;
    const more = await gatherSamplesFromAifLinks(fallback);
    samples.push(...more);
  }

  if (!samples.length) throw new Error('No cello samples gathered. Check Iowa page link extraction.');

  const seen = new Set();
  const dedup = [];
  for (const s of samples) {
    const key = `${s.articulation}|${s.string}|${s.note}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(s);
  }

  const samplesByArtic = { arco: { C: {}, G: {}, D: {}, A: {} }, pizz: { C: {}, G: {}, D: {}, A: {} } };
  let lowMidi = Infinity, highMidi = -Infinity, lowName = '', highName = '', converted = 0;

  for (const s of dedup) {
    const midi = midiFromNote(s.note);
    if (!Number.isFinite(midi)) continue;
    const outRel = `audio/${s.articulation}/sul${s.string}/Cello.${s.articulation}.ff.sul${s.string}.${s.note}.stereo.ogg`;
    const outPath = join(OUT_DIR, outRel);
    if (await convertAifToOgg(s.srcPath, outPath, s.articulation)) converted += 1;

    const entry = {
      midi,
      frequency: Number(freqFromMidi(midi).toFixed(6)),
      url: outRel,
      sourceFile: s.file,
      rootNote: s.note,
      rootMidi: midi,
      sampleRate: 44100,
    };
    if (s.articulation === 'arco') Object.assign(entry, approxLoopForArco(midi));
    samplesByArtic[s.articulation][s.string][s.note] = entry;
    if (midi < lowMidi) { lowMidi = midi; lowName = s.note; }
    if (midi > highMidi) { highMidi = midi; highName = s.note; }
  }

  const sortedSamples = { arco: {}, pizz: {} };
  for (const artic of ARTICULATIONS) {
    for (const str of STRINGS) {
      const bucket = samplesByArtic[artic][str] || {};
      sortedSamples[artic][str] = Object.keys(bucket)
        .sort((a, b) => bucket[a].midi - bucket[b].midi)
        .reduce((acc, note) => { acc[note] = bucket[note]; return acc; }, {});
    }
  }

  const missing = [];
  for (const artic of ARTICULATIONS) {
    for (const str of STRINGS) {
      const vals = Object.values(sortedSamples[artic][str]);
      if (!vals.length) missing.push(`${artic}:sul${str}:empty`);
    }
  }

  const manifest = {
    id: 'iowa-cello-2012',
    name: 'Iowa Cello 2012',
    source: 'University of Iowa Musical Instrument Samples',
    instrument: 'Cello — Charles Quenoil (1923)',
    performer: 'Yoo-Jung Chang',
    recordedAt: 'Anechoic Chamber',
    sourceUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    format: { source: '24-bit / 44.1 kHz stereo AIFF', delivery: 'Ogg Vorbis q5' },
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
  await writeFile(README_PATH, `# Iowa Cello 2012\n\nBrowser-delivery conversions of the University of Iowa Electronic Music Studios MIS Cello 2012 recordings.\n\nSource: ${SOURCE_URL}\n\nInstrument: Cello, Charles Quenoil (1923)\nPerformer: Yoo-Jung Chang\nLocation: Anechoic Chamber\nMicrophone: Earthworks QTC40\nInterface: Metric Halo 2882\nRecording format listed by Iowa EMS: 24-bit / 44.1 kHz stereo AIFF\nBrowser delivery format generated here: Ogg Vorbis q5\n\nArticulations: arco, pizzicato\nStrings: sulC, sulG, sulD, sulA\n\nRaw downloads live in:\n\n\`\`\`text\nsource/iowa-cello/raw/\n\`\`\`\n\nGenerated assets live in:\n\n\`\`\`text\npublic/instruments/iowa-cello/audio/\npublic/instruments/iowa-cello/manifest.full.json\n\`\`\`\n\nGenerated: ${new Date().toISOString()}\n`);

  const manifestText = await readFile(MANIFEST_PATH, 'utf8');
  console.log('');
  console.log('Iowa Cello import complete');
  console.log('');
  console.log(`unique samples:        ${dedup.length}`);
  console.log(`converted this run:    ${converted}`);
  console.log(`pitch range:           ${lowName} … ${highName}`);
  console.log(`empty buckets:         ${missing.length}`);
  console.log(`manifest bytes:        ${manifestText.length}`);
  console.log(`manifest:              ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
