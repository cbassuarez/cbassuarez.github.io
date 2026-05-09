#!/usr/bin/env node

import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(process.cwd());
const OUT_DIR = join(ROOT, 'public/instruments/espeak-robotvoice');
const AUDIO_DIR = join(OUT_DIR, 'audio');

const VOWELS = ['ah', 'eh', 'ee', 'oh', 'oo', 'uh', 'mm', 'nn'];
const SYLLABLES = ['ba', 'da', 'ga', 'ka', 'la', 'ma', 'na', 'ra', 'sa', 'ta', 'va', 'za', 'sha', 'tha', 'kha', 'zha'];
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'input', 'output', 'signal', 'error', 'null', 'void', 'memory', 'body', 'breath', 'mouth', 'open', 'close', 'start', 'stop', 'again'];
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC_TO_SEMITONE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const pref = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(pref));
  return found ? found.slice(pref.length) : fallback;
}

function argList(name, fallback) {
  const raw = argValue(name, fallback);
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

const VOICE_ALIASES = {
  'english-us': 'en-us',
  'english_us': 'en-us',
  english: 'en',
  'english-rp': 'en-gb',
  english_rp: 'en-gb',
  'british': 'en-gb',
  'us': 'en-us',
  'uk': 'en-gb',
};

function normalizeVoiceId(voice) {
  const raw = String(voice || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  return VOICE_ALIASES[lower] || raw;
}

const ESPEAK = argValue('--espeak', process.env.ESPEAK_NG || 'espeak-ng');
let VOICES = uniqueList([
  ...argList('--voices', ''),
  argValue('--voice', ''),
].map(normalizeVoiceId)).filter(Boolean);

if (!VOICES.length) VOICES.push('en-us');

const MATERIALS = uniqueList(argList('--materials', 'vowel,syllable,word'))
  .filter((item) => ['vowel', 'syllable', 'word'].includes(item));

const DURATIONS = uniqueList(argList('--durations', '1.5'))
  .map((item) => Number(item))
  .filter((item) => Number.isFinite(item) && item > 0.05);

const LOW = argValue('--low', 'C2');
const HIGH = argValue('--high', 'C6');
const STEP = Math.max(1, Math.round(Number(argValue('--step', '3')) || 3));
const SPEED = String(argValue('--speed', '120'));
const GAP = String(argValue('--gap', '8'));
const CLEAR = process.argv.includes('--clear');
const OGG_ENCODER = argValue('--ogg-encoder', 'libopus');

function midiFromNote(note) {
  const m = String(note || '').match(/^([A-G](?:#|b)?)(-?\d{1,2})$/);
  if (!m) return null;
  const pc = m[1];
  const oct = Number(m[2]);
  if (!Object.prototype.hasOwnProperty.call(PC_TO_SEMITONE, pc)) return null;
  return (oct + 1) * 12 + PC_TO_SEMITONE[pc];
}

function noteFromMidi(midi) {
  const n = Math.round(Number(midi));
  const pc = ((n % 12) + 12) % 12;
  const oct = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

function freqFromMidi(midi) {
  return 440 * Math.pow(2, (Number(midi) - 69) / 12);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function run(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', rejectPromise);
    child.on('exit', (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(`${cmd} exited ${code}`)));
  });
}

function runCapture(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', rejectPromise);

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
      } else {
        rejectPromise(new Error(`${cmd} exited ${code}\n${stderr}`));
      }
    });
  });
}

async function installedEspeakVoices() {
  let out = '';

  try {
    out = await runCapture(ESPEAK, ['--voices']);
  } catch (err) {
    console.warn(`WARN could not list eSpeak voices; continuing without validation.`);
    return null;
  }

  const voices = new Set();

  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^Pty\b/i.test(trimmed)) continue;

    const parts = trimmed.split(/\s+/);

    // Typical columns:
    // Pty Language Age/Gender VoiceName File ...
    // We want both Language and VoiceName/File-ish tokens where useful.
    for (const part of parts) {
      if (/^[a-z]{2}(?:[-_][a-z0-9]+)?$/i.test(part)) {
        voices.add(part);
      }
    }
  }

  return voices;
}

async function validateRequestedVoices(requested) {
  const installed = await installedEspeakVoices();
  if (!installed || !installed.size) return requested;

  const valid = [];
  const missing = [];

  for (const voice of requested) {
    if (installed.has(voice)) {
      valid.push(voice);
    } else {
      missing.push(voice);
    }
  }

  if (missing.length) {
    console.warn(`WARN skipping unavailable eSpeak voices: ${missing.join(', ')}`);
    console.warn(`     Try: ${ESPEAK} --voices`);
  }

  if (!valid.length) {
    const fallback = installed.has('en-us') ? 'en-us' : installed.has('en') ? 'en' : Array.from(installed)[0];
    console.warn(`WARN no requested voices were available; falling back to ${fallback}`);
    return [fallback];
  }

  return valid;
}

async function ffprobeDuration(path) {
  const out = await runCapture('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ]);

  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

function audioEncodeArgs(encoder) {
  const name = String(encoder || 'libopus').toLowerCase();

  if (name === 'vorbis') {
    return ['-c:a', 'vorbis', '-strict', '-2', '-q:a', '5'];
  }

  if (name === 'libvorbis') {
    return ['-c:a', 'libvorbis', '-q:a', '5'];
  }

  if (name === 'opus' || name === 'libopus') {
    return ['-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on'];
  }

  return ['-c:a', name];
}

function speakToken(token, material) {
  const map = {
    ah: 'aah', eh: 'eh', ee: 'ee', oh: 'oh', oo: 'oo', uh: 'uh', mm: 'mmm', nn: 'nnn',
  };
  if (material === 'vowel') return map[token] || token;
  return token;
}

function rateForMidi(midi) {
  // eSpeak is not a musical oscillator, but -p gives useful timbral variation.
  // Keep values in eSpeak's practical 0..99 range.
  return Math.max(5, Math.min(95, Math.round(18 + (Number(midi) - 36) * 1.15)));
}

async function renderToken({ token, material, midi, note, voice, duration }) {
  const durationLabel = `${String(duration).replace('.', 'p')}s`;
  const voiceSafe = String(voice).replace(/[^a-zA-Z0-9_.-]+/g, '-');
  const dir = join(AUDIO_DIR, material, token, voiceSafe, durationLabel);
  await mkdir(dir, { recursive: true });

  const basename = `espeak-${voiceSafe}-${material}-${token}-${durationLabel}-${note}`.replace(/[^a-zA-Z0-9_.-]+/g, '-');
  const wavPath = join(dir, `${basename}.wav`);
  const paddedWavPath = join(dir, `${basename}.padded.wav`);
  const oggPath = join(dir, `${basename}.ogg`);
  const rel = `audio/${material}/${token}/${voiceSafe}/${durationLabel}/${basename}.ogg`;

  if (!(await exists(oggPath))) {
    await run(ESPEAK, [
      '-v', voice,
      '-s', SPEED,
      '-g', GAP,
      '-p', String(rateForMidi(midi)),
      '-w', wavPath,
      speakToken(token, material),
    ]);

    const rawDuration = await ffprobeDuration(wavPath);
    const targetDuration = Math.max(Number(duration) || 0.5, rawDuration || 0.05);
    const padDuration = Math.max(0, targetDuration - rawDuration);

    // Make short eSpeak utterances instrument-like by padding controlled silence
    // before trimming/fading/conversion. This gives the REPL a stable root
    // sample for longer tied notes while still allowing synth fallback.
    await run('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      wavPath,
      '-af',
      `apad=pad_dur=${padDuration.toFixed(4)}`,
      '-t',
      targetDuration.toFixed(4),
      '-ar',
      '44100',
      '-ac',
      '2',
      paddedWavPath,
    ]);

    const measuredDuration = await ffprobeDuration(paddedWavPath);
    const fadeIn = Math.min(0.010, Math.max(0.002, measuredDuration * 0.10));
    const fadeOut = Math.min(0.100, Math.max(0.010, measuredDuration * 0.25));
    const fadeOutStart = Math.max(0, measuredDuration - fadeOut);

    await run('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      paddedWavPath,
      '-af',
      [
        'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.005',
        'areverse',
        'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.040',
        'areverse',
        `afade=t=in:st=0:d=${fadeIn.toFixed(4)}`,
        `afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${fadeOut.toFixed(4)}`,
      ].join(','),
      ...audioEncodeArgs(OGG_ENCODER),
      oggPath,
    ]);

    await rm(wavPath, { force: true }).catch(() => {});
    await rm(paddedWavPath, { force: true }).catch(() => {});
  }

  return {
    url: rel,
    rootNote: note,
    rootMidi: midi,
    rootFrequency: Number(freqFromMidi(midi).toFixed(6)),
    material,
    token,
    vowel: material === 'vowel' ? token : null,
    voice,
    durationSec: duration,
  };
}

async function main() {
  const low = midiFromNote(LOW);
  const high = midiFromNote(HIGH);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) {
    throw new Error(`invalid range ${LOW}..${HIGH}`);
  }

    VOICES = await validateRequestedVoices(VOICES);

    if (CLEAR) await rm(OUT_DIR, { recursive: true, force: true });
    await mkdir(AUDIO_DIR, { recursive: true });

    const notes = {};
    const jobs = [];

    const materialTokens = [];
    if (MATERIALS.includes('vowel')) {
      materialTokens.push(...VOWELS.map((token) => ({ material: 'vowel', token })));
    }
    if (MATERIALS.includes('syllable')) {
      materialTokens.push(...SYLLABLES.map((token) => ({ material: 'syllable', token })));
    }
    if (MATERIALS.includes('word')) {
      materialTokens.push(...WORDS.map((token) => ({ material: 'word', token })));
    }

    for (let midi = low; midi <= high; midi += STEP) {
      const note = noteFromMidi(midi);
      for (const voice of VOICES) {
        for (const duration of DURATIONS) {
          for (const item of materialTokens) {
            jobs.push({ ...item, midi, note, voice, duration });
          }
        }
      }
    }

  console.log(`eSpeak robot voice generation`);
  console.log(`  engine: ${ESPEAK}`);
    console.log(`  voices: ${VOICES.join(', ')}`);
    console.log(`  materials: ${MATERIALS.join(', ')}`);
    console.log(`  durations: ${DURATIONS.join(', ')}s`);
    console.log(`  ogg encoder: ${OGG_ENCODER}`);
    console.log(`  range: ${LOW}..${HIGH}, step ${STEP}`);
  console.log(`  jobs: ${jobs.length}`);

  let count = 0;
    const failedJobs = [];

    for (const job of jobs) {
      let variant = null;

      try {
        variant = await renderToken(job);
      } catch (err) {
        failedJobs.push({
          note: job.note,
          midi: job.midi,
          material: job.material,
          token: job.token,
          voice: job.voice,
          duration: job.duration,
          error: String(err && err.message ? err.message : err),
        });

        if (failedJobs.length <= 12) {
          console.warn(`WARN skipped ${job.voice}/${job.material}/${job.token}/${job.note}: ${err.message || err}`);
        }

        continue;
      }

      if (!notes[job.note]) {
      notes[job.note] = {
        midi: job.midi,
        frequency: Number(freqFromMidi(job.midi).toFixed(6)),
        variants: [],
      };
    }
    notes[job.note].variants.push(variant);
    count += 1;
    if (count % 50 === 0) console.log(`  rendered ${count}/${jobs.length}`);
  }

  const manifest = {
    id: 'espeak-robotvoice',
    name: 'eSpeak Robot Voice',
    source: 'eSpeak NG',
    type: 'synthetic speech/formant voice',
    engine: {
      name: 'eSpeak NG',
      executable: ESPEAK,
        voices: VOICES,
      url: 'https://github.com/espeak-ng/espeak-ng',
      license: 'GPL-3.0-or-later',
    },
    generatedAt: new Date().toISOString(),
      materials: MATERIALS,
    vowels: VOWELS,
    syllables: SYLLABLES,
    words: WORDS,
      range: { low: LOW, high: HIGH, step: STEP },
      durations: DURATIONS,
    notes,
  };
    await writeFile(join(OUT_DIR, 'failed-jobs.json'), JSON.stringify(failedJobs, null, 2) + '\n');
  await writeFile(join(OUT_DIR, 'manifest.full.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(OUT_DIR, 'README.md'), `# eSpeak Robot Voice\n\nGenerated synthetic robot-voice corpus for the REPL.\n\nSource engine: eSpeak NG\nEngine URL: https://github.com/espeak-ng/espeak-ng\nVoices: ${VOICES.join(', ')}\nMaterials: ${MATERIALS.join(', ')}\nDurations: ${DURATIONS.join(', ')}s\nOGG encoder: ${OGG_ENCODER}\nRange: ${LOW}..${HIGH}, step ${STEP}\nGenerated: ${new Date().toISOString()}\n\nThis corpus is intended as a controlled synthetic mouth-machine source, not as a human singer or TTS/lyrics subsystem.\n`);

  console.log(`\neSpeak robot voice complete`);
    console.log(`  variants: ${count}`);
    console.log(`  failed jobs: ${failedJobs.length}`);
    console.log(`  failed jobs report: ${join(OUT_DIR, 'failed-jobs.json')}`);
    console.log(`  manifest: ${join(OUT_DIR, 'manifest.full.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
