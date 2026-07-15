import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'labs/chunk-surfer/index.html');
const source = readFileSync(sourcePath, 'utf8');
const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
const config = readFileSync(join(root, 'vite.config.js'), 'utf8');
const enhancement = readFileSync(join(root, 'src/chunk-surfer/main.tsx'), 'utf8');
const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');

test('the download route is a standalone, crawlable Vite entry', () => {
  assert.match(config, /labs\/chunk-surfer\/index\.html/);
  assert.match(source, /<main>/);
  assert.match(source, /<h1 id="page-title">CHUNK SURFER<\/h1>/);
  assert.ok(source.indexOf('Five rooms. Five clean takes.') < source.indexOf('/src/chunk-surfer/main.tsx'));
  assert.doesNotMatch(source, /<iframe\b/i);
  assert.doesNotMatch(app, /function\s+ChunkSurferLabPage/);
  assert.doesNotMatch(app, /<iframe[^>]+chunk-surfer/i);
  assert.equal(existsSync(join(root, 'public/labs/chunk-surfer')), false, 'retired browser bundle must stay deleted');
});

test('canonical, search, and social metadata are route-specific', () => {
  assert.match(source, /<title>Chunk Surfer — 3D Psychological Horror Game<\/title>/);
  assert.match(source, /rel="canonical" href="https:\/\/cbassuarez\.com\/labs\/chunk-surfer\/"/);
  assert.match(source, /name="robots" content="index, follow, max-image-preview:large"/);
  assert.match(source, /property="og:image" content="https:\/\/cbassuarez\.com\/media\/chunk-surfer\/og-chunk-surfer\.png"/);
  assert.match(sitemap, /<loc>https:\/\/cbassuarez\.com\/labs\/chunk-surfer\/<\/loc>/);
});

test('VideoGame JSON-LD contains verified project interfaces', () => {
  const match = source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'JSON-LD block is required');
  const data = JSON.parse(match[1]);
  assert.equal(data['@type'], 'VideoGame');
  assert.equal(data.name, 'Chunk Surfer');
  assert.equal(data.url, 'https://cbassuarez.com/labs/chunk-surfer/');
  assert.equal(data.downloadUrl, 'https://cbassuarez.itch.io/chunk-surfer');
  assert.deepEqual(data.operatingSystem, ['macOS', 'Windows', 'Linux']);
  assert.ok(data.sameAs.includes('https://github.com/cbassuarez/chunk-surfer'));
});

test('visible copy preserves the narrow, qualified renderer claim', () => {
  assert.match(source, /to our knowledge, the only 3D psychological horror game with a local Stable Diffusion material renderer that keeps generating during play/i);
  assert.match(source, /every 5–15 seconds/);
  assert.match(source, /crossfaded into the building over 6–12 seconds/);
  assert.match(source, /layers AI-generated hallucinations over authored PBR materials/i);
  assert.match(source, /entire visual lens runs locally and offline/i);
  assert.doesNotMatch(source, /only game(?: ever)?/i);
});

test('download, privacy, hardware, signing, and warning copy remain explicit', () => {
  assert.ok((source.match(/https:\/\/cbassuarez\.itch\.io\/chunk-surfer/g) ?? []).length >= 4);
  assert.match(source, /DOWNLOAD THE BETA/);
  assert.match(source, /PUBLIC BETA<\/strong> UNSIGNED · LARGE OFFLINE BUILD/);
  assert.match(source, /Windows:<\/strong> x64 with NVIDIA\/CUDA-capable hardware/);
  assert.match(source, /Desktop beta builds are unsigned/);
  assert.match(source, /CONTENT WARNING/);
  assert.match(source, /sudden loud sounds/);
  assert.match(source, /It never records, stores, transmits, uploads, or plays back microphone audio/);
  assert.match(source, /complete the game without microphone input/);
});

test('audio and shader enhancement honors the performance contract', () => {
  assert.match(source, /<audio id="titleAudio" preload="none"/);
  assert.match(enhancement, /brown \* 0\.985/);
  assert.match(enhancement, /\* 0\.34 \+ brown \* 0\.22/);
  assert.match(enhancement, /highPass\.frequency\.value = 900/);
  assert.match(enhancement, /lowPass\.frequency\.value = 7_800/);
  assert.match(enhancement, /gain\.gain\.value = 0\.018/);
  assert.match(enhancement, /maxPixelCount=\{921_600\}/);
  assert.match(enhancement, /maxPixelCount=\{518_400\}/);
  assert.match(enhancement, /IntersectionObserver/);
  assert.doesNotMatch(enhancement, /localStorage|sessionStorage|document\.cookie/);
});

test('authentic public media and built static HTML are present', () => {
  const assets = [
    'title-screen.png',
    'conservatory-lit.png',
    'redaction-battle.png',
    'source-space.png',
    'source-space.webm',
    'title-song.mp3',
    'og-chunk-surfer.png'
  ];

  for (const asset of assets) {
    const path = join(root, 'public/media/chunk-surfer', asset);
    assert.ok(existsSync(path), `${asset} is required`);
    assert.ok(statSync(path).size > 1_000, `${asset} must not be empty`);
  }

  const builtPath = join(root, 'dist/labs/chunk-surfer/index.html');
  assert.ok(existsSync(builtPath), 'production build must emit the nested page');
  const built = readFileSync(builtPath, 'utf8');
  assert.match(built, /FIVE ROOM TONES\. ONE BUILDING LISTENING\./);
  assert.match(built, /to our knowledge, the only 3D psychological horror game/);
  assert.match(built, /<main>[\s\S]*DOWNLOAD THE BETA[\s\S]*<\/main>/);
  assert.match(built, /<script type="module" crossorigin/);
  assert.doesNotMatch(built, /<iframe\b/i);
});
