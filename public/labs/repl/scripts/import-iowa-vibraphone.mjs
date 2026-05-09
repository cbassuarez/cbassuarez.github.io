import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const SOURCE_URL = 'https://theremin.music.uiowa.edu/MIS-Pitches-2012/MISVibraphone2012.html';
const AUDIO_BASE_URL = 'https://theremin.music.uiowa.edu/sound%20files/MIS%20Pitches%20-%202014/Percussion/Vibraphone/';
const ROOT = resolve(process.cwd());
const RAW_DIR = join(ROOT, 'source/iowa-vibraphone/raw');
const TRIMMED_DIR = join(ROOT, 'source/iowa-vibraphone/trimmed');
const OUT_DIR = join(ROOT, 'public/instruments/iowa-vibraphone');
const AUDIO_DIR = join(OUT_DIR, 'audio');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.full.json');
const README_PATH = join(OUT_DIR, 'README.md');

const DO_TRIM = !process.argv.includes('--no-trim');

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
      write(chunk) { ws.write(Buffer.from(chunk)); },
      close() { ws.end(resolvePromise); },
      abort(err) { ws.destroy(err); rejectPromise(err); },
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

function parseVibraphoneFile(file) {
  let m = String(file || '').match(/^Vibraphone\.(sustain|shortsustain|dampen)\.ff\.([A-G](?:b)?-?\d{1,2})\.stereo\.aiff?$/i);
  if (m) {
    return { articulation: m[1].toLowerCase(), note: m[2] };
  }

  m = String(file || '').match(/^Vibraphone\.bow\.([A-G](?:b)?-?\d{1,2})\.stereo\.aiff?$/i);
  if (m) {
    return { articulation: 'bow', note: m[1] };
  }

  return null;
}

function displayFileName(file) {
  return String(file || '').replace(/\.aif$/i, '.aiff');
}

function downloadFileName(file) {
  return String(file || '').replace(/\.aiff$/i, '.aif');
}

function extractLinks(html) {
  const links = [];
  const seen = new Set();

  const hrefRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m = null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]*>/g, ' ');
    const combined = `${href} ${text}`;
    const fileMatch = combined.match(/Vibraphone\.(?:(?:sustain|shortsustain|dampen)\.ff\.[A-G](?:b)?-?\d{1,2}|bow\.[A-G](?:b)?-?\d{1,2})\.stereo\.aiff?/i);
    if (!fileMatch) continue;

    const file = displayFileName(fileMatch[0].split('/').pop());
    const parsed = parseVibraphoneFile(file);
    if (!parsed) continue;

    const hrefUrl = new URL(href, SOURCE_URL).toString();
    const url = /\.aiff?($|[?#])/i.test(href) ? hrefUrl : new URL(downloadFileName(file), AUDIO_BASE_URL).toString();
    const key = `${parsed.articulation}|${parsed.note}|${file}`;
    if (seen.has(key)) continue;
    seen.add(key);

    links.push({ url, file, downloadFile: downloadFileName(file), ...parsed });
  }

  if (!links.length) {
    const fileRe = /Vibraphone\.(?:(sustain|shortsustain|dampen)\.ff\.([A-G](?:b)?-?\d{1,2})|bow\.([A-G](?:b)?-?\d{1,2}))\.stereo\.aiff/gi;
    let f = null;
    while ((f = fileRe.exec(html)) !== null) {
      const file = displayFileName(f[0]);
      const parsed = parseVibraphoneFile(file);
      if (!parsed) continue;
      const key = `${parsed.articulation}|${parsed.note}|${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ url: new URL(downloadFileName(file), AUDIO_BASE_URL).toString(), file, downloadFile: downloadFileName(file), ...parsed });
    }
  }

  links.sort((a, b) => {
    const ma = midiFromNote(a.note) ?? 0;
    const mb = midiFromNote(b.note) ?? 0;
    if (ma !== mb) return ma - mb;
    return a.articulation.localeCompare(b.articulation);
  });

  return links;
}

async function convertToOgg(srcPath, destPath, articulation) {
  if (await exists(destPath)) return false;
  await mkdir(dirname(destPath), { recursive: true });

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', srcPath];
  if (DO_TRIM) {
    const threshold = articulation === 'bow' || articulation === 'sustain' ? '-60dB' : '-55dB';
    const silence = articulation === 'bow' ? '0.020' : articulation === 'sustain' ? '0.015' : '0.005';
    args.push('-af', `silenceremove=start_periods=1:start_threshold=${threshold}:start_silence=${silence}`);
  }
  args.push('-vn', '-acodec', 'libvorbis', '-q:a', '5', destPath);
  await run('ffmpeg', args);
  return true;
}

async function main() {
  console.log(`Iowa Vibraphone import — fetching ${SOURCE_URL}`);
  console.log(`  trim leading silence: ${DO_TRIM ? 'on (pass --no-trim to disable)' : 'off (pass --trim to enable)'}`);

  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(TRIMMED_DIR, { recursive: true });
  await mkdir(AUDIO_DIR, { recursive: true });

  const html = await fetchText(SOURCE_URL);
  const links = extractLinks(html);

  if (!links.length) {
    console.error('Fetched page, but could not extract vibraphone filenames. First 500 chars:');
    console.error(html.slice(0, 500));
    throw new Error('No Vibraphone AIFF links found.');
  }

  console.log(`  per-file aif links found: ${links.length}`);
  console.log(`  first: ${links[0].file}`);
  console.log(`  last: ${links[links.length - 1].file}`);

  const notes = {};
  const missing = [];
  let downloaded = 0;
  let converted = 0;

  for (const item of links) {
    const rawPath = join(RAW_DIR, item.downloadFile || item.file);
    const outRel = `audio/${item.articulation}/${item.file.replace(/\.aiff$/i, '.ogg')}`;
    const outPath = join(OUT_DIR, outRel);

    if (await download(item.url, rawPath)) downloaded += 1;
    if (await convertToOgg(rawPath, outPath, item.articulation)) converted += 1;

    const midi = midiFromNote(item.note);
    if (!Number.isFinite(midi)) continue;

    if (!notes[item.note]) {
      notes[item.note] = {
        midi,
        frequency: Number(freqFromMidi(midi).toFixed(6)),
        articulations: {},
      };
    }

    notes[item.note].articulations[item.articulation] = {
      url: outRel,
      sourceFile: item.file,
      downloadFile: item.downloadFile || item.file,
      rootNote: item.note,
      rootMidi: midi,
    };
  }

  for (const [note, entry] of Object.entries(notes)) {
    for (const articulation of ['sustain', 'shortsustain', 'dampen', 'bow']) {
      if (!entry.articulations[articulation]) missing.push(`${note}:${articulation}`);
    }
  }

  const noteNames = Object.keys(notes).sort((a, b) => notes[a].midi - notes[b].midi);
  const manifest = {
    id: 'iowa-vibraphone-2012',
    name: 'Iowa Vibraphone 2012',
    source: 'University of Iowa Musical Instrument Samples',
    instrument: 'Vibraphone',
    performer: 'Andrew Thierauf',
    recordedAt: 'Anechoic Chamber',
    sourceUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    format: {
      source: '24-bit / 44.1 kHz stereo AIFF',
      delivery: 'Ogg Vorbis q5',
    },
    articulations: ['sustain', 'shortsustain', 'dampen', 'bow'],
    range: {
      low: noteNames[0] || '',
      high: noteNames[noteNames.length - 1] || '',
    },
    missing,
    fallbackPolicy: 'nearest-same-articulation-else-nearest-articulation',
    notes,
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(README_PATH, `# Iowa Vibraphone 2012\n\nThis folder contains browser-delivery conversions of the University of Iowa Electronic Music Studios Musical Instrument Samples vibraphone recordings.\n\nSource: ${SOURCE_URL}\n\nInstrument: Vibraphone  \nPerformer: Andrew Thierauf  \nLocation: Anechoic Chamber  \nMicrophone: Earthworks QTC40  \nInterface: Metric Halo 2882  \nRecording format listed by Iowa EMS: 24-bit / 44.1 kHz stereo AIFF  \nBrowser delivery format generated here: Ogg Vorbis q5\n\nArticulation families:\n\n\`\`\`text\nsustain\nshortsustain\ndampen\nbow\n\`\`\`\n\nRaw AIFF downloads should remain in:\n\n\`\`\`text\nsource/iowa-vibraphone/raw/\n\`\`\`\n\nGenerated browser assets live in:\n\n\`\`\`text\npublic/instruments/iowa-vibraphone/audio/\npublic/instruments/iowa-vibraphone/manifest.full.json\n\`\`\`\n\nGenerated: ${new Date().toISOString()}\n`);

  const manifestText = await readFile(MANIFEST_PATH, 'utf8');
  console.log('');
  console.log('Iowa Vibraphone import complete');
  console.log('');
  console.log(`source links: ${links.length}`);
  console.log(`downloaded this run: ${downloaded}`);
  console.log(`converted this run: ${converted}`);
  console.log(`notes: ${noteNames.length}`);
  console.log(`missing articulation entries: ${missing.length}`);
  console.log(`manifest bytes: ${manifestText.length}`);
  console.log(`manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
