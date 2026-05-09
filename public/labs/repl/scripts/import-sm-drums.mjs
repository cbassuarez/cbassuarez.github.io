import { mkdir, readdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(process.cwd());
const DEFAULT_SOURCE_DIR = '/Users/seb/Downloads/SMDrums_Sforzando_1.2/Samples';
const DEFAULT_PUBLIC_AUDIO_DIR = resolve(ROOT, '../../audio/rock');
const MANIFEST_PATH = join(ROOT, 'samples/manifest.json');

const AUDIO_EXTENSIONS = new Set(['.wav', '.wave', '.aif', '.aiff', '.flac', '.ogg', '.mp3', '.m4a']);
const COPY_EXTENSIONS = new Set(['.wav', '.wave', '.ogg', '.mp3', '.m4a']);
const LANE_ORDER = ['k', 's', 'h', 'o', 't', 'r', 'c'];
const LANE_LABELS = {
  k: 'kick',
  s: 'snare',
  h: 'hat',
  o: 'other',
  t: 'tom',
  r: 'ride',
  c: 'crash',
};

function argValue(name, fallback) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixed) return prefixed.slice(flag.length + 1);
  return fallback;
}

const SOURCE_DIR = resolve(argValue('source', DEFAULT_SOURCE_DIR));
const AUDIO_DIR = resolve(argValue('out', DEFAULT_PUBLIC_AUDIO_DIR));
const URL_PREFIX = argValue('url-prefix', '/audio/rock');
const CONVERT = process.argv.includes('--convert') || process.argv.includes('--ogg');
const DRY_RUN = process.argv.includes('--dry-run');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (AUDIO_EXTENSIONS.has(ext)) out.push(full);
  }
  return out;
}

function tokenize(relPath) {
  const lower = relPath.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]+/g, ' ');
  const tokens = compact.split(/\s+/).filter(Boolean);
  return { lower, tokens, set: new Set(tokens) };
}

function hasAny(info, words) {
  return words.some((word) => info.set.has(word) || info.lower.includes(word));
}

function inferArticulation(info) {
  const { lower } = info;
  if (/brush|swirl|sweep|stir|sizzle/.test(lower)) return 'brush';
  if (/cross[\s_-]*stick|sidestick|side[\s_-]*stick|xstick|rim[\s_-]*click/.test(lower)) return 'cross-stick';
  if (/rimshot|rim[\s_-]*shot/.test(lower)) return 'rimshot';
  if (/bell/.test(lower)) return 'bell';
  if (/edge/.test(lower)) return 'edge';
  if (/tip/.test(lower)) return 'tip';
  if (/open/.test(lower) && /hat|hh|hihat|hi[\s_-]*hat/.test(lower)) return 'open';
  if (/closed|tight|chick|pedal|foot/.test(lower) && /hat|hh|hihat|hi[\s_-]*hat/.test(lower)) return 'closed';
  if (/center|centre/.test(lower)) return 'center';
  return 'hit';
}

function inferVelocity(info) {
  const { lower, tokens } = info;
  const direct = lower.match(/(?:vel|velocity|v|dyn|dynamic)[\s_-]*(\d{1,3})/i);
  if (direct) return Math.max(1, Math.min(127, Number(direct[1])));
  const standalone = tokens.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 127);
  if (standalone.length) return standalone[standalone.length - 1];
  if (/fff|fortissimo|hard|loud/.test(lower)) return 118;
  if (/ff/.test(lower)) return 108;
  if (/\bf\b|forte/.test(lower)) return 96;
  if (/mf|mezzo[\s_-]*forte/.test(lower)) return 82;
  if (/mp|mezzo[\s_-]*piano/.test(lower)) return 66;
  if (/ppp|very[\s_-]*soft/.test(lower)) return 28;
  if (/pp/.test(lower)) return 38;
  if (/\bp\b|piano|soft/.test(lower)) return 50;
  return null;
}

function classify(relPath) {
  const info = tokenize(relPath);
  const { lower } = info;
  const articulation = inferArticulation(info);
  const velocity = inferVelocity(info);

  // Normalize common drum-library spellings before broad cymbal/snare checks.
  const isKick =
    /(^|[^a-z0-9])(kick|kik|kck|bd|bdrum|bassdrum|bass[\s_-]*drum|bass[\s_-]*dr|kickdrum|kick[\s_-]*drum)([^a-z0-9]|$)/.test(lower);

  const isSnare =
    /(^|[^a-z0-9])(snare|sd|sn|snr|snaredrum|snare[\s_-]*drum)([^a-z0-9]|$)/.test(lower);

  const isHat =
    /hi[\s_-]*hat|hihat|high[\s_-]*hat|(^|[^a-z0-9])hh([^a-z0-9]|$)|(^|[^a-z0-9])hat([^a-z0-9]|$)/.test(lower);

  const isRide =
    /ride[\s_-]*bell|bell[\s_-]*ride|ride[\s_-]*cymbal|(^|[^a-z0-9])ride([^a-z0-9]|$)/.test(lower);

  const isCrash =
    /crash|splash|china|chinese|gong|crash[\s_-]*cymbal/.test(lower);

  const isTom =
    /floor[\s_-]*tom|rack[\s_-]*tom|(^|[^a-z0-9])tom([^a-z0-9]|$)|tom\d|(^|[^a-z0-9])ft([^a-z0-9]|$)|(^|[^a-z0-9])rt([^a-z0-9]|$)/.test(lower);

  // Specific cymbal types first.
  if (/ride[\s_-]*bell|bell[\s_-]*ride/.test(lower)) {
    return { lane: 'r', family: 'ride', articulation: 'bell', velocity };
  }

  if (isRide) {
    return { lane: 'r', family: 'ride', articulation, velocity };
  }

  if (isHat) {
    const isOpen = /open|loose|half|slosh/.test(lower);
    const isClosed = /closed|close|tight|pedal|foot|chick/.test(lower);

    return {
      lane: isOpen && !isClosed ? 'o' : 'h',
      family: 'hat',
      articulation: isOpen && !isClosed ? 'open' : articulation,
      velocity,
    };
  }

  // Kick before snare/other because some sample folders contain generic words
  // like "drum" that should not steal the bass drum lane.
  if (isKick) {
    return { lane: 'k', family: 'kick', articulation, velocity };
  }

  if (/cross[\s_-]*stick|sidestick|side[\s_-]*stick|xstick|rim[\s_-]*click|stick[\s_-]*click/.test(lower)) {
    return { lane: 'o', family: 'snare', articulation: 'cross-stick', velocity };
  }

  if (/rimshot|rim[\s_-]*shot/.test(lower)) {
    return { lane: 's', family: 'snare', articulation: 'rimshot', velocity };
  }

  if (isSnare) {
    return { lane: 's', family: 'snare', articulation, velocity };
  }

  if (isTom) {
    return { lane: 't', family: 'tom', articulation, velocity };
  }

  if (isCrash) {
    return { lane: 'c', family: 'crash', articulation, velocity };
  }

  if (/brush|swirl|sweep|clap|perc|percussion|cowbell|tamb|tambourine|clave|rim/.test(lower)) {
    return { lane: 'o', family: 'other', articulation, velocity };
  }

  // If it only says cymbal and is not ride/hat/crash, treat it as crash-color.
  if (/cymbal|cym/.test(lower)) {
    return { lane: 'c', family: 'crash', articulation, velocity };
  }

  return { lane: 'o', family: 'unknown', articulation, velocity, unknown: true };
}

function lanePrefix(lane) {
  return ({ k: 'k', s: 's', h: 'h', o: 'o', t: 't', r: 'r', c: 'c' })[lane] || 'o';
}

function isAudibleVelocity(sample) {
  const vel = Number(sample.velocity);
  if (!Number.isFinite(vel)) return true;

  // The REPL drum grammar has no explicit velocity row for kit lanes yet.
  // Keep the playable kit from randomly choosing ghost/near-silent layers.
  return vel >= 58;
}

function laneCandidateScore(sample) {
  const lane = sample.lane;
  const art = String(sample.articulation || '').toLowerCase();
  const fam = String(sample.family || '').toLowerCase();
  const src = String(sample.sourceFile || '').toLowerCase();
  const vel = Number(sample.velocity);
  let score = 1;

  if (Number.isFinite(vel)) {
    // Prefer strong, useful middle/high layers. Very soft layers are not wrong,
    // but they make this one-token drum grammar sound like it is skipping.
    score += Math.max(0, 2.5 - Math.abs(vel - 96) / 28);
    if (vel < 50) score -= 6;
    else if (vel < 58) score -= 3.5;
    else if (vel < 68) score -= 1.0;
    if (vel > 124) score -= 0.8;
  } else {
    score += 0.8;
  }

  if (lane === 'k') {
    score += 5.0;
    if (/kick|bass[\s_-]*drum|bassdrum|(^|[^a-z0-9])bd([^a-z0-9]|$)/.test(src)) score += 3.0;
    if (/soft|ghost|brush/.test(src)) score -= 4.0;
  }

  if (lane === 's') {
    score += /center|centre|hit/.test(art) ? 2.6 : /rimshot/.test(art) ? 2.0 : /cross/.test(art) ? 0.5 : 1.3;
    if (/snare|snr|sd/.test(src)) score += 1.5;
  }

  if (lane === 'h') {
    score += /closed|tight|pedal|foot|chick/.test(art) ? 3.4 : 0.6;
    if (/open|loose|slosh/.test(art)) score -= 2.0;
  }

  if (lane === 'o') {
    score += /open|brush|cross|side/.test(art) ? 2.0 : 0.6;
  }

  if (lane === 'r') {
    score += /bell/.test(art) ? 1.2 : 4.0;
    if (/ride/.test(src)) score += 2.0;
  }

  if (lane === 'c') {
    score += /crash|splash|china/.test(`${fam} ${art} ${src}`) ? 2.0 : 0.8;
  }

  if (lane === 't') {
    score += 2.0;
    if (/floor|rack|tom/.test(src)) score += 1.5;
  }

  if (sample.unknown) score -= 4.0;

  return score;
}

function curateLane(samples, lane) {
  const laneSamples = samples.filter((sample) => sample.lane === lane);
  if (!laneSamples.length) return [];

  const preferred = laneSamples
    .filter(isAudibleVelocity)
    .sort((a, b) => laneCandidateScore(b) - laneCandidateScore(a));

  const fallback = laneSamples
    .slice()
    .sort((a, b) => laneCandidateScore(b) - laneCandidateScore(a));

  const src = preferred.length ? preferred : fallback;

  // Keep the playable kit small enough to cache quickly and reliable enough
  // that variance feels like round-robin, not "sometimes nothing happens."
  const cap = ({
    k: 16,
    s: 24,
    h: 20,
    o: 18,
    t: 24,
    r: 24,
    c: 18,
  })[lane] || 16;

  return src.slice(0, cap);
}

function weightFor(sample) {
  const lane = sample.lane;
  const art = String(sample.articulation || '').toLowerCase();
  const src = String(sample.sourceFile || '').toLowerCase();
  const vel = Number(sample.velocity);
  let weight = 1;

  if (lane === 'k') {
    weight = 5.0;
  } else if (lane === 's') {
    weight = /cross/.test(art) ? 0.8 : /rimshot/.test(art) ? 1.8 : 4.0;
  } else if (lane === 'h') {
    weight = /closed|tight|pedal|foot|chick/.test(art) ? 4.2 : 0.8;
  } else if (lane === 'o') {
    weight = /open/.test(art) ? 3.2 : /cross|side|brush/.test(art) ? 2.2 : 0.8;
  } else if (lane === 'r') {
    weight = /bell/.test(art) ? 1.0 : 5.0;
  } else if (lane === 'c') {
    weight = /crash|splash|china/.test(`${art} ${src}`) ? 2.0 : 0.8;
  } else if (lane === 't') {
    weight = 2.5;
  }

  if (Number.isFinite(vel)) {
    if (vel < 50) weight *= 0.01;
    else if (vel < 58) weight *= 0.08;
    else if (vel < 68) weight *= 0.35;
    else if (vel >= 78 && vel <= 114) weight *= 1.65;
    else if (vel > 124) weight *= 0.7;
  }

  return Math.max(0.05, Number(weight.toFixed(2)));
}

function laneEntry(sample) {
  const weight = weightFor(sample);
  return weight === 1 ? sample.name : { name: sample.name, weight };
}

function buildRockKit(samples) {
  const lanes = {};
  for (const lane of LANE_ORDER) {
    lanes[lane] = curateLane(samples, lane).map(laneEntry);
  }
  return {
    id: 'rock',
    aliases: ['smdrums', 'smd', 'sm', 'kit'],
    label: 'Rock kit',
    bpm: null,
    lanes,
  };
}

function rockGroupIds() {
  return new Set([
    'rock',
    'smdrums',
    ...LANE_ORDER.map((lane) => `rock_${LANE_LABELS[lane]}`),
    ...LANE_ORDER.map((lane) => `smdrums_${LANE_LABELS[lane]}`),
  ]);
}

function removeOldDrumImports(manifest) {
  const kitIds = new Set(['rock', 'smdrums', 'smdrums-jazz', 'smdrums-tight', 'smdrums-all', 'smdrums-brush']);
  const groupIds = rockGroupIds();
  manifest.samples = (manifest.samples || []).filter((sample) => {
    const name = String(sample && sample.name || '');
    return !(name.startsWith('smd-') || name.startsWith('rock-'));
  });
  manifest.kits = (manifest.kits || []).filter((kit) => !(kit && kitIds.has(String(kit.id || '').toLowerCase())));
  manifest.groups = (manifest.groups || []).filter((group) => !(group && groupIds.has(String(group.id || '').toLowerCase())));
}

async function convertOrCopy(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  const ext = extname(src).toLowerCase();
  if (!CONVERT && COPY_EXTENSIONS.has(ext)) {
    await copyFile(src, dest);
    return;
  }
  if (CONVERT || !COPY_EXTENSIONS.has(ext)) {
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-acodec', 'libvorbis', '-q:a', '5', dest.replace(/\.[^.]+$/, '.ogg')]);
    return;
  }
  await copyFile(src, dest);
}

async function main() {
  if (!(await exists(SOURCE_DIR))) {
    throw new Error(`SMDrums source folder not found: ${SOURCE_DIR}\nUse --source /path/to/SMDrums_Sforzando_1.2/Samples`);
  }
  if (!(await exists(MANIFEST_PATH))) {
    throw new Error(`samples manifest not found: ${MANIFEST_PATH}`);
  }

  console.log('Rock kit import from SMDrums');
  console.log(`  source: ${SOURCE_DIR}`);
  console.log(`  audio out: ${AUDIO_DIR}`);
  console.log(`  url prefix: ${URL_PREFIX}`);
  console.log(`  conversion: ${CONVERT ? 'ogg via ffmpeg' : 'copy wav/ogg/mp3, convert non-web files'}`);
  if (DRY_RUN) console.log('  dry run: manifest/audio not written');

  const files = await walk(SOURCE_DIR);
  if (!files.length) throw new Error('No audio files found in SMDrums source folder.');

  const counters = Object.fromEntries(LANE_ORDER.map((lane) => [lane, 0]));
  const outputNames = new Set();
  const samples = [];
  const unknowns = [];

  for (const src of files) {
    const rel = relative(SOURCE_DIR, src).split('\\').join('/');
    const info = classify(rel);
    const lane = LANE_ORDER.includes(info.lane) ? info.lane : 'o';
    counters[lane] += 1;
    const serial = String(counters[lane]).padStart(4, '0');
    const id = `rock-${lanePrefix(lane)}-${serial}`;
    const originalExt = extname(src).toLowerCase();
    const outExt = (CONVERT || !COPY_EXTENSIONS.has(originalExt)) ? '.ogg' : (originalExt === '.wave' ? '.wav' : originalExt);
    let outFile = `${id}${outExt}`;
    let suffix = 2;
    while (outputNames.has(outFile)) outFile = `${id}-${suffix++}${outExt}`;
    outputNames.add(outFile);

    const dest = join(AUDIO_DIR, outFile);
    if (!DRY_RUN) await convertOrCopy(src, dest);

    const sample = {
      name: id,
      url: `${URL_PREFIX.replace(/\/+$/, '')}/${outFile}`,
      group: `rock_${LANE_LABELS[lane]}`,
      sourceFile: rel,
      lane,
      family: info.family,
      articulation: info.articulation,
    };
    if (Number.isFinite(Number(info.velocity))) sample.velocity = Number(info.velocity);
    samples.push(sample);
    if (info.unknown) unknowns.push(rel);
  }

    const laneReport = Object.fromEntries(LANE_ORDER.map((lane) => [lane, samples.filter((s) => s.lane === lane).length]));
    const curatedReport = Object.fromEntries(LANE_ORDER.map((lane) => [lane, curateLane(samples, lane).length]));
    console.log('  source lane counts:', laneReport);
    console.log('  curated playable lane counts:', curatedReport);

    const emptyCriticalLanes = ['k', 's', 'h', 'r', 'c'].filter((lane) => curatedReport[lane] <= 0);
    if (emptyCriticalLanes.length) {
      console.log('');
      console.log(`  WARN critical drum lanes are empty after classification: ${emptyCriticalLanes.join(', ')}`);
      console.log('  Showing first 40 source filenames to help tune classifier:');
      files.slice(0, 40).forEach((file) => {
        console.log(`    ${relative(SOURCE_DIR, file).split('\\').join('/')}`);
      });
      console.log('');
    }
  if (unknowns.length) {
    console.log(`  unknown/other classifications: ${unknowns.length}`);
    unknowns.slice(0, 20).forEach((u) => console.log(`    other: ${u}`));
    if (unknowns.length > 20) console.log(`    ... ${unknowns.length - 20} more`);
  }

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  manifest.version = manifest.version || 1;
  manifest.source = manifest.source || 'public/audio/';
  removeOldDrumImports(manifest);

  const groups = LANE_ORDER.map((lane) => ({
    id: `rock_${LANE_LABELS[lane]}`,
    label: `Rock kit ${LANE_LABELS[lane]}`,
    samples: samples.filter((s) => s.lane === lane).map((s) => s.name),
  }));
  groups.unshift({ id: 'rock', label: 'Rock kit', samples: samples.map((s) => s.name) });

  const kit = buildRockKit(samples);
  manifest.groups = [...(manifest.groups || []), ...groups];
  manifest.samples = [...(manifest.samples || []), ...samples];
  manifest.kits = [...(manifest.kits || []), kit];
  manifest.generatedAt = new Date().toISOString();

  if (!DRY_RUN) await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log('');
  console.log('Rock kit import complete');
  console.log(`  audio files scanned: ${files.length}`);
  console.log(`  samples added: ${samples.length}`);
  console.log(`  kit added: ${kit.id}`);
  console.log(`  aliases: ${kit.aliases.join(', ')}`);
  console.log(`  manifest: ${MANIFEST_PATH}`);
  console.log('');
  console.log('Try:');
  console.log('  drum r h r h | r h s h');
  console.log('  kit rock');
  console.log('  variance .25');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
