import { mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
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
const BOW_REPORT_PATH = join(OUT_DIR, 'bow-arrival-report.json');

const DO_TRIM = !process.argv.includes('--no-trim');
const FORCE = process.argv.includes('--force');
const WRITE_BOW_REPORT = process.argv.includes('--bow-report') || process.argv.includes('--arrival-report');
const FFMPEG = argValue('--ffmpeg', process.env.FFMPEG || 'ffmpeg');
const FFPROBE = argValue('--ffprobe', process.env.FFPROBE || 'ffprobe');
const ANALYSIS_SAMPLE_RATE = 44100;
const BOW_ONSET_VERSION = 'vibes-bow-arrival-v1';
const BOW_DEFAULT_LEAD_SEC = 0.16;

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const pref = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(pref));
  return found ? found.slice(pref.length) : fallback;
}

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

function audioEncodeArgs() {
  // Prefer real libvorbis when available, but Homebrew's standard ffmpeg
  // often only exposes the native experimental Vorbis encoder.
  //
  // Fallback chain:
  //   1. libvorbis: best Ogg Vorbis path
  //   2. vorbis + -strict -2: native ffmpeg Vorbis encoder
  //   3. libopus: safe Ogg fallback if Vorbis is unavailable
  const preferred = String(process.env.VIBES_OGG_ENCODER || process.env.OGG_ENCODER || 'auto').toLowerCase();

  if (preferred === 'libvorbis') {
    return ['-c:a', 'libvorbis', '-q:a', '5'];
  }

  if (preferred === 'vorbis') {
    return ['-c:a', 'vorbis', '-strict', '-2', '-q:a', '5'];
  }

  if (preferred === 'opus' || preferred === 'libopus') {
    return ['-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on'];
  }

  // Your current ffmpeg reports native "vorbis" but not "libvorbis".
  // This keeps the .ogg delivery and avoids the missing libvorbis crash.
  return ['-c:a', 'vorbis', '-strict', '-2', '-q:a', '5'];
}


function run(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'pipe'] });
    const stderr = [];

    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        const message = Buffer.concat(stderr).toString('utf8').trim();
        rejectPromise(new Error(`${cmd} exited ${code}${message ? `\n${message}` : ''}`));
      }
    });
  });
}

function runCapture(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(Buffer.concat(stdout));
      } else {
        rejectPromise(new Error(`${cmd} exited ${code}
${Buffer.concat(stderr).toString('utf8')}`));
      }
    });
  });
}

function dbFromAmp(v) {
  const n = Math.max(Number(v) || 0, 1e-12);
  return 20 * Math.log10(n);
}

function ampFromDb(db) {
  return Math.pow(10, Number(db) / 20);
}

function median(values) {
  const list = values.filter((v) => Number.isFinite(Number(v))).map(Number).sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function percentile(values, amount) {
  const list = values.filter((v) => Number.isFinite(Number(v))).map(Number).sort((a, b) => a - b);
  if (!list.length) return 0;
  const idx = Math.max(0, Math.min(list.length - 1, Math.round((list.length - 1) * amount)));
  return list[idx];
}

async function decodeMonoFloat32(srcPath) {
  const bytes = await runCapture(FFMPEG, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    srcPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(ANALYSIS_SAMPLE_RATE),
    '-f',
    'f32le',
    'pipe:1',
  ]);

  const length = Math.floor(bytes.length / 4);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = bytes.readFloatLE(i * 4);
  return out;
}

async function audioDurationSec(srcPath) {
  try {
    const out = await runCapture(FFPROBE, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      srcPath,
    ]);
    const n = Number(out.toString('utf8').trim());
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

function rmsWindows(samples, sampleRate) {
  const win = Math.max(128, Math.round(sampleRate * 0.010));
  const hop = Math.max(64, Math.round(sampleRate * 0.005));
  const frames = [];

  for (let start = 0; start < samples.length; start += hop) {
    const end = Math.min(samples.length, start + win);
    if (end <= start) break;
    let sum = 0;
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const v = Number(samples[i]) || 0;
      sum += v * v;
      const av = Math.abs(v);
      if (av > peak) peak = av;
    }
    frames.push({
      time: start / sampleRate,
      rms: Math.sqrt(sum / Math.max(1, end - start)),
      peak,
    });
  }

  return frames;
}

function firstHeldFrame(frames, threshold, holdFrames, startIndex = 0) {
  for (let i = Math.max(0, startIndex); i < frames.length; i += 1) {
    let ok = true;
    for (let j = 0; j < holdFrames; j += 1) {
      const frame = frames[i + j];
      if (!frame || frame.rms < threshold) {
        ok = false;
        break;
      }
    }
    if (ok) return frames[i];
  }
  return null;
}

function fallbackBowArrival(durationSec) {
  const arrivalSec = Math.max(0.06, Math.min(0.35, durationSec ? durationSec * 0.08 : BOW_DEFAULT_LEAD_SEC));
  return {
    version: BOW_ONSET_VERSION,
    trimStartSec: 0,
    audibleStartSec: 0,
    arrivalSec,
    preRollSec: 0,
    scheduleLeadSec: arrivalSec,
    noiseFloorDb: null,
    peakDb: null,
    sustainDb: null,
    arrivalThresholdDb: null,
    detected: false,
    fallback: true,
  };
}

async function analyzeBowArrival(srcPath) {
  let durationSec = await audioDurationSec(srcPath);

  try {
    const samples = await decodeMonoFloat32(srcPath);
    if (!samples.length) return fallbackBowArrival(durationSec);
    durationSec = durationSec || samples.length / ANALYSIS_SAMPLE_RATE;

    const frames = rmsWindows(samples, ANALYSIS_SAMPLE_RATE);
    if (!frames.length) return fallbackBowArrival(durationSec);

    const noiseFrames = frames.filter((frame) => frame.time <= Math.min(0.28, Math.max(0.08, durationSec * 0.08)));
    const noiseRms = Math.max(median(noiseFrames.map((frame) => frame.rms)), ampFromDb(-96));
    const allRms = frames.map((frame) => frame.rms);
    const peakRms = Math.max(...allRms, ampFromDb(-96));
    const postAttack = frames.filter((frame) => frame.time >= 0.05 && frame.time <= Math.max(0.25, durationSec * 0.75));
    const sustainRms = Math.max(percentile(postAttack.map((frame) => frame.rms), 0.82), peakRms * 0.45, noiseRms);

    const audibleThreshold = Math.max(noiseRms * Math.pow(10, 10 / 20), peakRms * 0.012, ampFromDb(-72));
    const arrivalThreshold = Math.max(noiseRms * Math.pow(10, 20 / 20), sustainRms * 0.42, peakRms * 0.22, ampFromDb(-58));

    const audibleFrame = firstHeldFrame(frames, audibleThreshold, 2) || frames.find((frame) => frame.peak >= audibleThreshold);
    const audibleStartSec = audibleFrame ? audibleFrame.time : 0;
    const audibleIndex = audibleFrame ? frames.indexOf(audibleFrame) : 0;
    const arrivalFrame = firstHeldFrame(frames, arrivalThreshold, 8, Math.max(0, audibleIndex - 1))
      || firstHeldFrame(frames, Math.max(audibleThreshold, sustainRms * 0.32), 5, audibleIndex)
      || audibleFrame;

    const rawArrivalSec = arrivalFrame ? arrivalFrame.time : BOW_DEFAULT_LEAD_SEC;
    const arrivalSec = Math.max(0.06, Math.min(0.35, rawArrivalSec));
    const preRollSec = 0.025;
    const trimStartSec = Math.max(0, audibleStartSec - preRollSec);
    const scheduleLeadSec = Math.max(0.02, Math.min(0.38, arrivalSec - trimStartSec));

    return {
      version: BOW_ONSET_VERSION,
      trimStartSec: Number(trimStartSec.toFixed(6)),
      audibleStartSec: Number(audibleStartSec.toFixed(6)),
      arrivalSec: Number(arrivalSec.toFixed(6)),
      preRollSec,
      scheduleLeadSec: Number(scheduleLeadSec.toFixed(6)),
      originalDurationSec: Number(durationSec.toFixed(6)),
      noiseFloorDb: Number(dbFromAmp(noiseRms).toFixed(2)),
      peakDb: Number(dbFromAmp(peakRms).toFixed(2)),
      sustainDb: Number(dbFromAmp(sustainRms).toFixed(2)),
      audibleThresholdDb: Number(dbFromAmp(audibleThreshold).toFixed(2)),
      arrivalThresholdDb: Number(dbFromAmp(arrivalThreshold).toFixed(2)),
      detected: true,
    };
  } catch (err) {
    console.warn(`[vibraphone] bow arrival analysis failed for ${srcPath}:`, err && err.message ? err.message : err);
    return fallbackBowArrival(durationSec);
  }
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
  const bowOnset = articulation === 'bow' ? await analyzeBowArrival(srcPath) : null;

  if ((await exists(destPath)) && !FORCE) {
    return { converted: false, bowOnset };
  }

  if (FORCE) await rm(destPath, { force: true }).catch(() => {});
  await mkdir(dirname(destPath), { recursive: true });

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', srcPath];

  if (DO_TRIM) {
    if (articulation === 'bow') {
      // Bowed vibraphone is not transient-trimmed. We trim only dead air
      // before the bow noise, preserve the physical lead-in, and store the
      // tone-arrival offset so the runtime can schedule the sample early.
      const trimStart = Math.max(0, Number(bowOnset && bowOnset.trimStartSec) || 0);
      const filters = [];
      if (trimStart > 0.0005) filters.push(`atrim=start=${trimStart.toFixed(6)}`, 'asetpts=N/SR/TB');
      filters.push('afade=t=in:st=0:d=0.002');
      args.push('-af', filters.join(','));
    } else {
      const threshold = articulation === 'sustain' ? '-60dB' : '-55dB';
      const silence = articulation === 'sustain' ? '0.015' : '0.005';
      args.push('-af', `silenceremove=start_periods=1:start_threshold=${threshold}:start_silence=${silence}`);
    }
  }

  args.push('-vn', ...audioEncodeArgs(), destPath);
  await run(FFMPEG, args);

  return { converted: true, bowOnset };
}

async function main() {
  console.log(`Iowa Vibraphone import — fetching ${SOURCE_URL}`);
  console.log(`  trim leading silence: ${DO_TRIM ? 'on (pass --no-trim to disable)' : 'off (default is on)'}`);
  console.log(`  force regenerate: ${FORCE ? 'on' : 'off (pass --force to replace existing OGGs)'}`);
  console.log(`  bow arrival report: ${WRITE_BOW_REPORT ? 'on' : 'off (pass --bow-report to write)'}`);

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
  const bowReports = [];

  for (const item of links) {
    const rawPath = join(RAW_DIR, item.downloadFile || item.file);
    const outRel = `audio/${item.articulation}/${item.file.replace(/\.aiff$/i, '.ogg')}`;
    const outPath = join(OUT_DIR, outRel);

    if (await download(item.url, rawPath)) downloaded += 1;
    const conversion = await convertToOgg(rawPath, outPath, item.articulation);
    if (conversion.converted) converted += 1;
    if (conversion.bowOnset) {
      bowReports.push({
        file: item.file,
        note: item.note,
        articulation: item.articulation,
        url: outRel,
        ...conversion.bowOnset,
      });
    }

    const midi = midiFromNote(item.note);
    if (!Number.isFinite(midi)) continue;

    if (!notes[item.note]) {
      notes[item.note] = {
        midi,
        frequency: Number(freqFromMidi(midi).toFixed(6)),
        articulations: {},
      };
    }

    const manifestEntry = {
      url: outRel,
      sourceFile: item.file,
      downloadFile: item.downloadFile || item.file,
      rootNote: item.note,
      rootMidi: midi,
    };

    if (conversion.bowOnset) manifestEntry.onset = conversion.bowOnset;

    notes[item.note].articulations[item.articulation] = manifestEntry;
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
    onsetPolicy: {
      bow: 'preserve bow lead-in; schedule early by onset.scheduleLeadSec so tone arrival lands on grid',
      version: BOW_ONSET_VERSION,
    },
    notes,
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  if (WRITE_BOW_REPORT) {
    await writeFile(BOW_REPORT_PATH, JSON.stringify({
      version: BOW_ONSET_VERSION,
      generatedAt: new Date().toISOString(),
      sourceUrl: SOURCE_URL,
      count: bowReports.length,
      files: bowReports,
    }, null, 2) + '\n');
  }

  await writeFile(README_PATH, `# Iowa Vibraphone 2012\n\nThis folder contains browser-delivery conversions of the University of Iowa Electronic Music Studios Musical Instrument Samples vibraphone recordings.\n\nSource: ${SOURCE_URL}\n\nInstrument: Vibraphone  \nPerformer: Andrew Thierauf  \nLocation: Anechoic Chamber  \nMicrophone: Earthworks QTC40  \nInterface: Metric Halo 2882  \nRecording format listed by Iowa EMS: 24-bit / 44.1 kHz stereo AIFF  \nBrowser delivery format generated here: Ogg Vorbis q5\n\nBowed articulation timing:\n\nBowed samples preserve their physical bow lead-in. The importer stores \`onset.scheduleLeadSec\` metadata on bow entries so the runtime can start the sample before the grid leaf while the bowed tone blooms on the leaf.\n\nArticulation families:\n\n\`\`\`text\nsustain\nshortsustain\ndampen\nbow\n\`\`\`\n\nRaw AIFF downloads should remain in:\n\n\`\`\`text\nsource/iowa-vibraphone/raw/\n\`\`\`\n\nGenerated browser assets live in:\n\n\`\`\`text\npublic/instruments/iowa-vibraphone/audio/\npublic/instruments/iowa-vibraphone/manifest.full.json\n\`\`\`\n\nGenerated: ${new Date().toISOString()}\n`);

  const manifestText = await readFile(MANIFEST_PATH, 'utf8');
  console.log('');
  console.log('Iowa Vibraphone import complete');
  console.log('');
  console.log(`source links: ${links.length}`);
  console.log(`downloaded this run: ${downloaded}`);
  console.log(`converted this run: ${converted}`);
  console.log(`notes: ${noteNames.length}`);
  console.log(`missing articulation entries: ${missing.length}`);
  if (bowReports.length) {
    const leads = bowReports.map((item) => Number(item.scheduleLeadSec)).filter(Number.isFinite).sort((a, b) => a - b);
    const mid = leads.length ? leads[Math.floor(leads.length / 2)] : 0;
    const max = leads.length ? leads[leads.length - 1] : 0;
    console.log(`bow arrival entries: ${bowReports.length}`);
    console.log(`bow schedule lead median/max: ${(mid * 1000).toFixed(1)}ms / ${(max * 1000).toFixed(1)}ms`);
    if (WRITE_BOW_REPORT) console.log(`bow report: ${BOW_REPORT_PATH}`);
  }
  console.log(`manifest bytes: ${manifestText.length}`);
  console.log(`manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
