import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(process.cwd());
const DEFAULT_SOURCE_DIR = '/Users/seb/Downloads/wa_808_tape';
const DEFAULT_PUBLIC_AUDIO_DIR = resolve(ROOT, '../../audio/wa-808');
const MANIFEST_PATH = join(ROOT, 'samples/manifest.json');

const AUDIO_EXTENSIONS = new Set(['.wav', '.wave', '.aif', '.aiff', '.flac', '.ogg', '.mp3', '.m4a']);
const COPY_EXTENSIONS = new Set(['.wav', '.wave', '.ogg', '.mp3', '.m4a']);
const LANE_ORDER = ['k', 's', 'h', 'o', 't', 'r', 'c'];
const LANE_LABELS = {
  k: 'kick',
  s: 'snare-clap',
  h: 'closed-hat',
  o: 'open-hat-other',
  t: 'tom-conga',
  r: 'ride',
  c: 'cymbal-crash',
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
const URL_PREFIX = argValue('url-prefix', '/audio/wa-808');
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

function inferVariation(info) {
  const { lower, tokens } = info;
  const direct = lower.match(/(?:rr|round|var|variation|take|alt)[\s_-]*(\d{1,3})/i);
  if (direct) return Number(direct[1]);
  const numeric = tokens.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 999);
  return numeric.length ? numeric[numeric.length - 1] : null;
}

function inferTone(info) {
  const { lower } = info;
  if (/clean|dry/.test(lower)) return 'clean';
  if (/low|lo|soft|warm|round/.test(lower)) return 'low saturation';
  if (/med|medium|mid|tape/.test(lower)) return 'tape';
  if (/hot|high|hi|dist|drive|sat|satur/.test(lower)) return 'saturated';
  return 'tape';
}

function classify(relPath) {
  const info = tokenize(relPath);
  const { lower } = info;
  const variation = inferVariation(info);
  const articulation = inferTone(info);

  if (/(^|[^a-z0-9])(bd|bassdrum|bass[\s_-]*drum|kick|kik)([^a-z0-9]|$)/.test(lower)) {
    return { lane: 'k', family: 'kick', articulation, variation };
  }

  if (/(^|[^a-z0-9])(sd|sn|snare)([^a-z0-9]|$)/.test(lower)) {
    return { lane: 's', family: 'snare', articulation, variation };
  }

  if (/(^|[^a-z0-9])(cp|clap|handclap|hand[\s_-]*clap)([^a-z0-9]|$)/.test(lower)) {
    return { lane: 's', family: 'clap', articulation, variation };
  }

  if (/(^|[^a-z0-9])(rim|rs|rimshot|rim[\s_-]*shot|stick|sidestick)([^a-z0-9]|$)/.test(lower)) {
    return { lane: 's', family: 'rimshot', articulation, variation };
  }

  if (/(^|[^a-z0-9])(ch|clhat|closedhat|closed[\s_-]*hat|closed[\s_-]*hh|hhc|hat[\s_-]*closed)([^a-z0-9]|$)/.test(lower)) {
    return { lane: 'h', family: 'hi-hat', articulation: 'closed', variation };
  }

  if (/(^|[^a-z0-9])(oh|ophat|openhat|open[\s_-]*hat|open[\s_-]*hh|hho|hat[\s_-]*open)([^a-z0-9]|$)/.test(lower)) {
    return { lane: 'o', family: 'hi-hat', articulation: 'open', variation };
  }

  if (/hi[\s_-]*hat|hihat|(^|[^a-z0-9])hh([^a-z0-9]|$)|(^|[^a-z0-9])hat([^a-z0-9]|$)/.test(lower)) {
    return { lane: /open/.test(lower) ? 'o' : 'h', family: 'hi-hat', articulation: /open/.test(lower) ? 'open' : 'closed', variation };
  }

  if (/(^|[^a-z0-9])(cy|cym|cymbal|cr|crash|ride|rd)([^a-z0-9]|$)/.test(lower)) {
    const isRide = /(^|[^a-z0-9])(ride|rd)([^a-z0-9]|$)/.test(lower);
    return { lane: isRide ? 'r' : 'c', family: isRide ? 'ride' : 'cymbal', articulation, variation };
  }

  if (/(^|[^a-z0-9])(tom|lt|mt|ht|conga|cong|cg|lowtom|midtom|hitom)([^a-z0-9]|$)/.test(lower)) {
    return { lane: 't', family: /conga|cong|cg/.test(lower) ? 'conga' : 'tom', articulation, variation };
  }

  if (/(^|[^a-z0-9])(cb|cowbell|clave|clv|ma|maracas|shaker|perc|percussion)([^a-z0-9]|$)/.test(lower)) {
    return { lane: 'o', family: 'other', articulation, variation };
  }

  return { lane: 'o', family: 'unknown', articulation, variation, unknown: true };
}

function lanePrefix(lane) {
  return ({ k: 'k', s: 's', h: 'h', o: 'o', t: 't', r: 'r', c: 'c' })[lane] || 'o';
}

function laneCandidateScore(sample) {
  const src = String(sample.sourceFile || '').toLowerCase();
  const fam = String(sample.family || '').toLowerCase();
  const art = String(sample.articulation || '').toLowerCase();
  let score = 1;

  if (sample.lane === 'k') score += 5;
  if (sample.lane === 's') score += /snare/.test(fam) ? 4 : /clap/.test(fam) ? 3.2 : 2.2;
  if (sample.lane === 'h') score += /closed/.test(art) ? 4.5 : 2;
  if (sample.lane === 'o') score += /open/.test(art) ? 3.5 : /cowbell|clave|maracas/.test(src) ? 1.8 : 1;
  if (sample.lane === 't') score += 2.4;
  if (sample.lane === 'r') score += 2.2;
  if (sample.lane === 'c') score += 2.4;

  if (/clean|dry/.test(src)) score += 0.4;
  if (/hot|dist|drive|sat/.test(src)) score += 0.3;
  if (sample.unknown) score -= 4;
  return score;
}

function curateLane(samples, lane) {
  const cap = ({ k: 24, s: 28, h: 24, o: 28, t: 20, r: 12, c: 18 })[lane] || 16;
  return samples
    .filter((sample) => sample.lane === lane)
    .slice()
    .sort((a, b) => laneCandidateScore(b) - laneCandidateScore(a) || String(a.name).localeCompare(String(b.name)))
    .slice(0, cap);
}

function weightFor(sample) {
  const lane = sample.lane;
  const fam = String(sample.family || '').toLowerCase();
  let weight = 1;
  if (lane === 'k') weight = 5;
  else if (lane === 's') weight = /clap/.test(fam) ? 2.6 : /rim/.test(fam) ? 1.2 : 4.2;
  else if (lane === 'h') weight = 4.4;
  else if (lane === 'o') weight = /hi-hat/.test(fam) ? 3.4 : 1.6;
  else if (lane === 't') weight = 2;
  else if (lane === 'r') weight = 1.4;
  else if (lane === 'c') weight = 2;
  return Number(weight.toFixed(2));
}

function laneEntry(sample) {
  const weight = weightFor(sample);
  return weight === 1 ? sample.name : { name: sample.name, weight };
}

function build808Kit(samples) {
  const lanes = {};
  for (const lane of LANE_ORDER) lanes[lane] = curateLane(samples, lane).map(laneEntry);
  return {
    id: '808',
    aliases: ['wa808', 'wa-808', '808-tape', 'tr808', 'tr-808', 'tape808'],
    label: '808 Tape kit',
    bpm: null,
    lanes,
  };
}

function old808GroupIds() {
  return new Set([
    '808',
    'wa808',
    'wa-808',
    'tr808',
    ...LANE_ORDER.map((lane) => `wa808_${LANE_LABELS[lane]}`),
    ...LANE_ORDER.map((lane) => `808_${LANE_LABELS[lane]}`),
  ]);
}

function removeOld808Imports(manifest) {
  const groupIds = old808GroupIds();
  manifest.samples = (manifest.samples || []).filter((sample) => {
    const name = String(sample && sample.name || '');
    return !(name.startsWith('wa808-') || name.startsWith('tr808-') || name.startsWith('808-'));
  });
  manifest.kits = (manifest.kits || []).filter((kit) => {
    const id = String(kit && kit.id || '').toLowerCase();
    const aliases = Array.isArray(kit && kit.aliases) ? kit.aliases.map((a) => String(a || '').toLowerCase()) : [];
    return id !== '808' && !aliases.some((alias) => ['wa808', 'wa-808', '808-tape', 'tr808', 'tr-808'].includes(alias));
  });
  manifest.groups = (manifest.groups || []).filter((group) => !(group && groupIds.has(String(group.id || '').toLowerCase())));
}

async function convertOrCopy(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  const ext = extname(src).toLowerCase();
  if (!CONVERT && COPY_EXTENSIONS.has(ext)) {
    await copyFile(src, dest);
    return dest;
  }
  if (CONVERT || !COPY_EXTENSIONS.has(ext)) {
    const oggDest = dest.replace(/\.[^.]+$/, '.ogg');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-acodec', 'libvorbis', '-q:a', '5', oggDest]);
    return oggDest;
  }
  await copyFile(src, dest);
  return dest;
}

async function main() {
  if (!(await exists(SOURCE_DIR))) {
    throw new Error(`Wave Alchemy 808 Tape source folder not found: ${SOURCE_DIR}\nUse --source /path/to/wa_808_tape`);
  }
  if (!(await exists(MANIFEST_PATH))) {
    throw new Error(`samples manifest not found: ${MANIFEST_PATH}`);
  }

  console.log('Wave Alchemy 808 Tape import');
  console.log(`  source: ${SOURCE_DIR}`);
  console.log(`  audio out: ${AUDIO_DIR}`);
  console.log(`  url prefix: ${URL_PREFIX}`);
  console.log(`  conversion: ${CONVERT ? 'ogg via ffmpeg' : 'copy wav/ogg/mp3, convert non-web files'}`);
  if (DRY_RUN) console.log('  dry run: manifest/audio not written');

  const files = await walk(SOURCE_DIR);
  if (!files.length) throw new Error('No audio files found in the Wave Alchemy 808 Tape source folder.');

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
    const id = `wa808-${lanePrefix(lane)}-${serial}`;
    const originalExt = extname(src).toLowerCase();
    const outExt = (CONVERT || !COPY_EXTENSIONS.has(originalExt)) ? '.ogg' : (originalExt === '.wave' ? '.wav' : originalExt);
    let outFile = `${id}${outExt}`;
    let suffix = 2;
    while (outputNames.has(outFile)) outFile = `${id}-${suffix++}${outExt}`;
    outputNames.add(outFile);

    let finalFile = outFile;
    if (!DRY_RUN) {
      const written = await convertOrCopy(src, join(AUDIO_DIR, outFile));
      finalFile = written.split('/').pop();
    }

    const sample = {
      name: id,
      url: `${URL_PREFIX.replace(/\/+$/, '')}/${finalFile}`,
      group: `wa808_${LANE_LABELS[lane]}`,
      kit: '808',
      sourceFile: rel,
      lane,
      family: info.family,
      articulation: info.articulation,
    };
    if (Number.isFinite(Number(info.variation))) sample.variation = Number(info.variation);
    samples.push(sample);
    if (info.unknown) unknowns.push(rel);
  }

  const laneReport = Object.fromEntries(LANE_ORDER.map((lane) => [lane, samples.filter((s) => s.lane === lane).length]));
  const curatedReport = Object.fromEntries(LANE_ORDER.map((lane) => [lane, curateLane(samples, lane).length]));
  console.log('  source lane counts:', laneReport);
  console.log('  curated playable lane counts:', curatedReport);

  const emptyCoreLanes = ['k', 's', 'h'].filter((lane) => curatedReport[lane] <= 0);
  if (emptyCoreLanes.length) {
    console.log('');
    console.log(`  WARN core 808 lanes are empty after classification: ${emptyCoreLanes.join(', ')}`);
    console.log('  First 40 source filenames:');
    files.slice(0, 40).forEach((file) => console.log(`    ${relative(SOURCE_DIR, file).split('\\').join('/')}`));
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
  removeOld808Imports(manifest);

  const groups = LANE_ORDER.map((lane) => ({
    id: `wa808_${LANE_LABELS[lane]}`,
    label: `808 Tape ${LANE_LABELS[lane].replace(/-/g, ' ')}`,
    samples: samples.filter((s) => s.lane === lane).map((s) => s.name),
  }));
  groups.unshift({ id: 'wa808', label: '808 Tape kit', samples: samples.map((s) => s.name) });

  const kit = build808Kit(samples);
  manifest.groups = [...(manifest.groups || []), ...groups];
  manifest.samples = [...(manifest.samples || []), ...samples];
  manifest.kits = [...(manifest.kits || []), kit];
  manifest.generatedAt = new Date().toISOString();

  if (!DRY_RUN) await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log('');
  console.log('808 Tape import complete');
  console.log(`  audio files scanned: ${files.length}`);
  console.log(`  samples added: ${samples.length}`);
  console.log(`  kit added: ${kit.id}`);
  console.log(`  aliases: ${kit.aliases.join(', ')}`);
  console.log(`  manifest: ${MANIFEST_PATH}`);
  console.log('');
  console.log('Try:');
  console.log('  drum k h s h | k o s c');
  console.log('  kit 808');
  console.log('  variance .35');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
