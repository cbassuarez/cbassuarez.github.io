// eSpeak/robot voice for the REPL.
// `voice` is a synthetic mouth-machine instrument; `vox` is a DSL alias.
// It can use an optional generated eSpeak corpus, but never goes silent: if
// samples are absent it falls back to browser-native formant synthesis.

(function (root) {
  'use strict';

  const MANIFEST_URL = './public/instruments/espeak-robotvoice/manifest.full.json';
    const DEFAULT_MAX_VOICES = 32;
    const MAX_PENDING_SAMPLE_LOADS = 12;
    const MAX_PREWARM_VARIANTS = 16;
    const VOWELS = ['ah', 'eh', 'ee', 'oh', 'oo', 'uh', 'mm', 'nn'];
    const MATERIALS = ['vowel', 'syllable', 'word'];

  const buffers = new Map();
  const pending = new Map();
  const activeVoices = new Set();
  const heldByBlock = new Map();
    const noiseBuffers = new WeakMap();
  let manifest = null;
  let manifestPromise = null;

  function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return n < lo ? lo : n > hi ? hi : n;
  }

  function clamp01(v) { return clamp(v, 0, 1); }

  function value(v, fallback) {
    if (v && typeof v === 'object' && v.kind === 'param-gesture') {
      const n = Number(v.from);
      return Number.isFinite(n) ? n : fallback;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function midiToFreq(midi) { return 440 * Math.pow(2, (Number(midi) - 69) / 12); }

  function noteNameToMidi(name) {
    const m = String(name || '').match(/^([A-Ga-g])([#b])?(-?\d{1,2})$/);
    if (!m) return null;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    const oct = Number(m[3]);
    if (!Number.isFinite(base) || !Number.isFinite(oct)) return null;
    return (oct + 1) * 12 + base + acc;
  }

  function normalizeVowel(v) {
    const s = String(v || 'ah').toLowerCase();
    if (s === 'a' || s === 'aa') return 'ah';
    if (s === 'e') return 'eh';
    if (s === 'i' || s === 'ii') return 'ee';
    if (s === 'o') return 'oh';
    if (s === 'u' || s === 'ou') return 'oo';
    if (s === 'm') return 'mm';
    if (s === 'n') return 'nn';
    return VOWELS.includes(s) ? s : 'ah';
  }

  function normalizeCarrier(v) {
    const s = String(v || 'sample').toLowerCase();
    if (s === 'sawtooth') return 'saw';
    if (['sample', 'sine', 'saw', 'square', 'pulse', 'noise'].includes(s)) return s;
    return 'sample';
  }

    function normalizeSyllable(v, vowel) {
      const raw = String(v || vowel || 'ah').trim().toLowerCase();
      return raw.replace(/[^a-z0-9_-]+/g, '') || normalizeVowel(vowel || 'ah');
    }

  function absoluteUrl(rel) {
    return new URL(rel, new URL(MANIFEST_URL, window.location.href)).toString();
  }

    function normalizeManifest(json) {
      const notes = {};
      const noteList = [];
      const rawNotes = json && json.notes && typeof json.notes === 'object' ? json.notes : {};
      const tokensByMaterial = {
        vowel: new Set(),
        syllable: new Set(),
        word: new Set(),
      };

      for (const [name, entry] of Object.entries(rawNotes)) {
        if (!entry || typeof entry !== 'object') continue;

        const midi = Number.isFinite(Number(entry.midi)) ? Number(entry.midi) : noteNameToMidi(name);
        if (!Number.isFinite(midi)) continue;

        const frequency = Number.isFinite(Number(entry.frequency)) ? Number(entry.frequency) : midiToFreq(midi);
        const variants = Array.isArray(entry.variants) ? entry.variants.slice() : [];

        const index = {
          all: variants,
          byMaterial: Object.create(null),
          byToken: Object.create(null),
          byMaterialToken: Object.create(null),
        };

        for (const variant of variants) {
          const material = String(variant && variant.material || '').toLowerCase() || 'vowel';
          const token = String(variant && variant.token || variant && variant.vowel || '').toLowerCase();

          if (!index.byMaterial[material]) index.byMaterial[material] = [];
          index.byMaterial[material].push(variant);

          if (token) {
            if (!index.byToken[token]) index.byToken[token] = [];
            index.byToken[token].push(variant);

            const key = `${material}:${token}`;
            if (!index.byMaterialToken[key]) index.byMaterialToken[key] = [];
            index.byMaterialToken[key].push(variant);

            if (tokensByMaterial[material]) tokensByMaterial[material].add(token);
          }
        }

        notes[name] = { ...entry, note: name, midi, frequency, variants, index };
        noteList.push({ note: name, midi, frequency });
      }

      noteList.sort((a, b) => a.midi - b.midi);

      return {
        id: String((json && json.id) || 'espeak-robotvoice'),
        name: String((json && json.name) || 'eSpeak Robot Voice'),
        vowels: Array.isArray(json && json.vowels) ? json.vowels : VOWELS.slice(),
        materials: Array.isArray(json && json.materials) ? json.materials : MATERIALS.slice(),
        tokensByMaterial,
        notes,
        noteList,
      };
    }
    
    function manifestTokensByMaterial(material) {
      if (!manifest || !manifest.tokensByMaterial) return [];
      const set = manifest.tokensByMaterial[String(material || '').toLowerCase()];
      return set && set.size ? Array.from(set).sort() : [];
    }

    function availableVowels() {
      const fromManifest = manifestTokensByMaterial('vowel');
      return fromManifest.length ? fromManifest : VOWELS.slice();
    }

    function availableSyllables() {
      const out = new Set();

      for (const material of ['syllable', 'word', 'vowel']) {
        for (const token of manifestTokensByMaterial(material)) out.add(token);
      }

      return out.size
        ? Array.from(out).sort()
        : ['ah', 'ma', 'na', 'ra', 'za', 'null', 'input', 'output', 'signal', 'error'];
    }

    function nearestAvailableToken(requested, available, fallback) {
      const req = String(requested || '').toLowerCase();
      if (available.includes(req)) return req;

      const normalized = normalizeVowel(req);
      if (available.includes(normalized)) return normalized;

      return available.includes(fallback) ? fallback : (available[0] || fallback);
    }

  function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetch(MANIFEST_URL, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error(`voice manifest HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        manifest = normalizeManifest(json);
        return manifest;
      })
      .catch((err) => {
        // Corpus is optional. Do not make the voice fail if it has not been generated.
        console.info('[repl] eSpeak voice corpus unavailable; using synth fallback.', err && err.message ? err.message : err);
        manifest = normalizeManifest(null);
        return manifest;
      });
    return manifestPromise;
  }

  function ready() { return loadManifest(); }
  function hasManifest() { return manifest && Array.isArray(manifest.noteList) && manifest.noteList.length > 0; }

  function noteEntryByMidi(midi) {
    if (!hasManifest()) return null;
    let exact = null;
    for (const item of manifest.noteList) {
      if (Math.round(item.midi) === Math.round(midi)) {
        exact = manifest.notes[item.note];
        break;
      }
    }
    if (exact) return { entry: exact, exact: true };
    let best = null;
    let bestDist = Infinity;
    for (const item of manifest.noteList) {
      const dist = Math.abs(Number(item.midi) - Number(midi));
      if (dist < bestDist) {
        best = manifest.notes[item.note];
        bestDist = dist;
      }
    }
    return best ? { entry: best, exact: false } : null;
  }

  function variantScore(variant, opts) {
    if (!variant) return -Infinity;
      const vowelOptions = availableVowels();
      const syllableOptions = availableSyllables();
      const vowel = nearestAvailableToken(normalizeVowel(opts.vowel), vowelOptions, 'ah');
      const syllable = nearestAvailableToken(normalizeSyllable(opts.syllable, vowel), syllableOptions, vowel);
    let score = 0;
    if (normalizeVowel(variant.vowel || variant.token) === vowel) score += 8;
    if (String(variant.token || '').toLowerCase() === syllable) score += 6;
    if (String(variant.material || '').toLowerCase() === 'vowel' && syllable === vowel) score += 2;
    if (String(variant.material || '').toLowerCase() === 'syllable' && syllable !== vowel) score += 2;
    if (String(variant.voice || '').toLowerCase() === String(opts.engineVoice || 'en-us').toLowerCase()) score += 1;
    return score;
  }

    function chooseFromList(list, opts) {
      const src = Array.isArray(list) ? list.filter(Boolean) : [];
      if (!src.length) return null;

      const human = clamp01(value(opts.human, 0));
      const ensemble = clamp01(value(opts.ensemble, 0));

      if (human <= 0.001 && ensemble <= 0.001) return src[0];

      const limit = Math.max(1, Math.min(src.length, 1 + Math.round((human + ensemble) * 4)));
      return src[Math.floor(Math.random() * limit)] || src[0];
    }

    function chooseVariant(entry, opts) {
      if (!entry || !entry.index) {
        const variants = entry && Array.isArray(entry.variants) ? entry.variants : [];
        return chooseFromList(variants, opts);
      }

      const vowelOptions = availableVowels();
      const syllableOptions = availableSyllables();
      const vowel = nearestAvailableToken(normalizeVowel(opts.vowel), vowelOptions, 'ah');
      const syllable = nearestAvailableToken(normalizeSyllable(opts.syllable, vowel), syllableOptions, vowel);

      const index = entry.index;

      // Fast exact paths. No per-leaf full sort.
      const materialPreference = syllable === vowel
        ? [`vowel:${vowel}`, `syllable:${syllable}`, `word:${syllable}`]
        : [`syllable:${syllable}`, `word:${syllable}`, `vowel:${vowel}`];

      for (const key of materialPreference) {
        const hit = chooseFromList(index.byMaterialToken[key], opts);
        if (hit) return hit;
      }

      const tokenHit = chooseFromList(index.byToken[syllable], opts)
        || chooseFromList(index.byToken[vowel], opts);
      if (tokenHit) return tokenHit;

      return chooseFromList(index.byMaterial.vowel, opts)
        || chooseFromList(index.byMaterial.syllable, opts)
        || chooseFromList(index.all, opts);
    }

    function resolveCorpusVariantFor(opts, midi) {
      if (!manifest) return null;

      const resolved = noteEntryByMidi(midi);
      if (!resolved || !resolved.entry) return null;

      return chooseVariant(resolved.entry, opts);
    }
    function loadBuffer(audioCtx, variant, opts) {
      if (!audioCtx || !variant || !variant.url) return Promise.resolve(null);

      if (pending.size >= MAX_PENDING_SAMPLE_LOADS && !pending.has(variant.url)) {
        if (!(opts && opts.silent)) {
          console.warn('[repl] voice sample preload throttled:', variant.url);
        }
        return Promise.resolve(null);
      }
    const key = variant.url;
    if (buffers.has(key)) return Promise.resolve(buffers.get(key));
    if (pending.has(key)) return pending.get(key);
    const promise = fetch(absoluteUrl(variant.url), { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error(`voice sample HTTP ${r.status}: ${variant.url}`);
        return r.arrayBuffer();
      })
      .then((bytes) => audioCtx.decodeAudioData(bytes))
      .then((buffer) => {
        buffers.set(key, buffer);
        pending.delete(key);
        return buffer;
      })
      .catch((err) => {
        pending.delete(key);
        console.warn('[repl] voice sample load failed:', err);
        return null;
      });
    pending.set(key, promise);
    return promise;
  }

  const FORMANTS = {
    ah: [[730, 1.0], [1090, 0.56], [2440, 0.22]],
    eh: [[530, 1.0], [1840, 0.62], [2480, 0.18]],
    ee: [[270, 0.95], [2290, 0.72], [3010, 0.16]],
    oh: [[570, 0.95], [840, 0.58], [2410, 0.18]],
    oo: [[300, 0.9], [870, 0.50], [2240, 0.14]],
    uh: [[440, 0.95], [1020, 0.46], [2240, 0.14]],
    mm: [[250, 0.7], [1100, 0.22], [2100, 0.10]],
    nn: [[300, 0.7], [1700, 0.20], [2600, 0.10]],
  };

    function makeNoiseBuffer(audioCtx) {
      if (noiseBuffers.has(audioCtx)) return noiseBuffers.get(audioCtx);

      const len = Math.max(1, Math.floor(audioCtx.sampleRate * 1.0));
      const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < len; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }

      noiseBuffers.set(audioCtx, buffer);
      return buffer;
    }
    
    function maxVoicesFor(opts) {
      const n = Math.round(value(opts && opts.poly, DEFAULT_MAX_VOICES));
      return clamp(Number.isFinite(n) ? n : DEFAULT_MAX_VOICES, 8, 128);
    }

    function oldestActiveVoice() {
      let best = null;
      let bestTime = Infinity;

      for (const v of activeVoices) {
        if (!v || v.released) continue;
        const t = Number.isFinite(Number(v.startedAt)) ? Number(v.startedAt) : 0;
        if (t < bestTime) {
          best = v;
          bestTime = t;
        }
      }

      return best;
    }

    function enforceVoiceLimit(opts, audioCtx) {
      const max = maxVoicesFor(opts);

      while (activeVoices.size >= max) {
        const victim = oldestActiveVoice();
        if (!victim) break;
        releaseVoice(victim, audioCtx.currentTime);
        break;
      }
    }

    function makeCarrier(audioCtx, opts, freq, when, duration, variant) {
      const carrier = normalizeCarrier(opts.carrier);

      if (carrier === 'sample' && variant && variant.buffer) {
        const src = audioCtx.createBufferSource();
        src.buffer = variant.buffer;
        src.loop = false;

        const sourceFreq = Number.isFinite(Number(variant.rootFrequency))
          ? Number(variant.rootFrequency)
          : Number.isFinite(Number(variant.frequency))
            ? Number(variant.frequency)
            : midiToFreq(Number(variant.rootMidi || opts.midi || 60));

          const rate = clamp(freq / Math.max(1e-6, sourceFreq), 0.125, 8);
          src.playbackRate.setValueAtTime(rate, when);

        return {
          node: src,
          source: src,
          sourceKind: 'sample',
          naturalEnd: when + (src.buffer.duration / Math.max(1e-6, src.playbackRate.value)),
        };
      }

      if (carrier === 'noise') {
        const src = audioCtx.createBufferSource();
        src.buffer = makeNoiseBuffer(audioCtx);
        src.loop = true;

        return {
          node: src,
          source: src,
          sourceKind: 'noise',
          naturalEnd: Infinity,
        };
      }

      // If carrier === "sample" but no sample is ready, use a synth fallback.
      // Never set oscillator.type = "sample"; that is invalid and can silence
      // the whole event.
      const osc = audioCtx.createOscillator();
        const synthCarrier = carrier === 'sample' ? 'sine' : carrier;

      osc.type = synthCarrier === 'saw'
        ? 'sawtooth'
        : synthCarrier === 'pulse'
          ? 'square'
          : synthCarrier;

        osc.frequency.setValueAtTime(freq, when);

      return {
        node: osc,
        source: osc,
        sourceKind: 'synth',
        naturalEnd: Infinity,
      };
    }

    function connectFormants(audioCtx, input, opts) {
      const vowel = normalizeVowel(opts.vowel);
      const mouth = clamp01(value(opts.mouth, 0.55));
      const formant = clamp(value(opts.formant, 0), -1, 1);
      const roughness = clamp01(value(opts.roughness, 0));
      const vocoder = clamp01(value(opts.vocoder, 0));
      const body = clamp01(value(opts.body, 0.35));
      const carrier = normalizeCarrier(opts.carrier);
      const shift = Math.pow(2, formant * 0.55);

      const master = audioCtx.createGain();
      master.gain.value = 1.0;

      const specs = FORMANTS[vowel] || FORMANTS.ah;

      // Normal robot voice does not need all three formant bands per hit.
      // Add the third band only when the user asks for more banded/vocoder color.
      const activeSpecs = vocoder > 0.18 ? specs : specs.slice(0, 2);

      for (const [hz, amp] of activeSpecs) {
        const f = audioCtx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = clamp(hz * shift * (0.75 + mouth * 0.55), 80, 7800);
        f.Q.value = 3.2 + mouth * 3.8 + roughness * 1.8 + vocoder * 2.2;

        const g = audioCtx.createGain();
        g.gain.value = amp * (0.16 + mouth * 0.58) * (1 + vocoder * 0.55);

        input.connect(f);
        f.connect(g);
        g.connect(master);
      }

      const low = audioCtx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = clamp(1600 + mouth * 6800 + body * 900 - roughness * 450, 420, 12000);
      low.Q.value = 0.25 + body * 0.45;

      const dry = audioCtx.createGain();

      // Non-sample carriers need more direct audibility. Otherwise the formant
      // bank can make saw/square/pulse read as vague filtered energy.
      dry.gain.value = carrier === 'sample'
        ? 0.24 * (1 - vocoder * 0.35)
        : 0.58 * (1 - vocoder * 0.28);

      input.connect(low);
      low.connect(dry);
      dry.connect(master);

      return master;
    }

    function applyRobotMod(audioCtx, input, opts, when, duration) {
      const robot = clamp01(value(opts.robot, 0));
      const roughness = clamp01(value(opts.roughness, 0));

      if (robot <= 0.0001 && roughness <= 0.0001) return input;

      const modGain = audioCtx.createGain();
      modGain.gain.value = 1;

      const lfo = audioCtx.createOscillator();
      lfo.type = robot > 0.65 ? 'square' : 'sawtooth';
      lfo.frequency.value = 4 + robot * 18 + roughness * 8;

      const lfoAmp = audioCtx.createGain();
      lfoAmp.gain.value = 0.035 + robot * 0.18 + roughness * 0.055;

      lfo.connect(lfoAmp);
      lfoAmp.connect(modGain.gain);
      input.connect(modGain);

      const stopAt = when + Math.max(0.15, Number(duration) || 0.25) + 0.25;

      try {
        lfo.start(when);
        lfo.stop(stopAt);
      } catch (_) {}

      return modGain;
    }

    function oscillatorTypeForCarrier(carrier) {
      const c = normalizeCarrier(carrier);
      if (c === 'saw') return 'sawtooth';
      if (c === 'pulse') return 'square';
      if (c === 'sample') return 'sine';
      if (c === 'noise') return 'sine';
      return c;
    }

    function applyCarrierFrequencyDrive(audioCtx, input, opts, freq, when, duration) {
      const amount = clamp01(value(opts.vocoder, 0));
      if (amount <= 0.0001) return { node: input, sources: [] };

      const driven = audioCtx.createGain();

      // Keep the original syllable/source audible. The carrier should drive it,
      // not replace it.
      driven.gain.setValueAtTime(Math.max(0.08, 1 - amount * 0.42), when);

      const carrierOsc = audioCtx.createOscillator();
      carrierOsc.type = oscillatorTypeForCarrier(opts.carrier);
      carrierOsc.frequency.setValueAtTime(freq, when);

      const driveDepth = audioCtx.createGain();
      driveDepth.gain.setValueAtTime(amount * 0.48, when);

      carrierOsc.connect(driveDepth);
      driveDepth.connect(driven.gain);

      input.connect(driven);

      try {
        carrierOsc.start(when);
        carrierOsc.stop(when + Math.max(0.1, Number(duration) || 0.25) + 0.2);
      } catch (_) {}

      return { node: driven, sources: [carrierOsc] };
    }
    
    function addDrivenCorpusBranch(audioCtx, opts, variant, freq, when, duration, amount, target) {
      if (!audioCtx || !variant || !variant.buffer || !target) return [];

      const wet = clamp01(amount);
      if (wet <= 0.0001) return [];

      const sourceInfo = makeCarrier(
        audioCtx,
        { ...opts, carrier: 'sample' },
        freq,
        when,
        duration,
        variant
      );

      if (!sourceInfo || !sourceInfo.source || !sourceInfo.node) return [];

      const driven = applyCarrierFrequencyDrive(
        audioCtx,
        sourceInfo.node,
        opts,
        freq,
        when,
        duration
      );

      const wetGain = audioCtx.createGain();
      wetGain.gain.setValueAtTime(wet, when);

      driven.node.connect(wetGain);
      wetGain.connect(target);

      try {
        sourceInfo.source.start(when);
      } catch (_) {}

      const sources = [sourceInfo.source];
      for (const src of driven.sources || []) sources.push(src);

      return sources;
    }
    
    function addBreath(audioCtx, target, opts, when, duration) {
      const breath = clamp01(value(opts.breath, 0));

      // Hard opt-in. Values like scheduler fallbacks, stale examples, or accidental
      // tiny params should not create hiss on every leaf.
      if (breath < 0.035) return null;

      const src = audioCtx.createBufferSource();
      src.buffer = makeNoiseBuffer(audioCtx);
      src.loop = true;

      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400 + clamp01(value(opts.mouth, 0.55)) * 2400;

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6500;

      const g = audioCtx.createGain();
      g.gain.value = breath * 0.045;

      src.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(target);

      try {
        src.start(when);
        src.stop(when + duration + 0.2);
      } catch (_) {}

      return src;
    }

  function forceGain(force) {
    const named = { ppp: 0.22, pp: 0.30, p: 0.42, mp: 0.55, mf: 0.72, f: 0.9, ff: 1.0, fff: 1.12 };
    if (typeof force === 'string' && named[force.toLowerCase()] != null) return named[force.toLowerCase()];
    return clamp(0.35 + clamp01(value(force, 0.72)) * 0.82, 0.12, 1.35);
  }

    function releaseVoice(v, when) {
      if (!v || v.released) return false;

      const t = Math.max(
        v.audioCtx.currentTime,
        Number.isFinite(Number(when)) ? Number(when) : v.audioCtx.currentTime
      );

      v.released = true;

      if (v.timer) {
        clearTimeout(v.timer);
        v.timer = null;
      }

      try {
        const current = Math.max(0.0001, v.gain.gain.value || v.targetGain || 0.0001);
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(current, t);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, t + v.releaseSec);
      } catch (_) {}

      try {
        v.source.stop(t + v.releaseSec + 0.05);
      } catch (_) {}

      if (v.extraSources) {
        for (const src of v.extraSources) {
          try {
            src.stop(t + v.releaseSec + 0.05);
          } catch (_) {}
        }
      }

      return true;
    }

  function unregister(v) {
    if (!v) return;
    if (v.timer) clearTimeout(v.timer);
    activeVoices.delete(v);
    const group = heldByBlock.get(v.blockId);
    if (group && Array.isArray(group.voices)) {
      group.voices = group.voices.filter((x) => x && x !== v && !x.released);
      if (!group.voices.length) heldByBlock.delete(v.blockId);
    }
  }

    function scheduleRelease(v, until) {
      if (!v || !v.audioCtx || v.released) return;

      const nextUntil = Number.isFinite(Number(until))
        ? Number(until)
        : v.audioCtx.currentTime + 0.25;

      v.holdUntil = Math.max(v.holdUntil || 0, nextUntil);

      if (v.timer) clearTimeout(v.timer);

      v.timer = setTimeout(() => {
        releaseVoice(v, v.holdUntil);
      }, Math.max(0, (v.holdUntil - v.audioCtx.currentTime) * 1000));
    }

  function registerGroup(opts, kind, voices) {
    const blockId = opts.blockId || 'global';
    const live = (Array.isArray(voices) ? voices : []).filter(Boolean);
    if (!live.length) return;
    const prev = heldByBlock.get(blockId);
    if (prev && Array.isArray(prev.voices)) {
      const now = live[0].audioCtx.currentTime;
      for (const v of prev.voices) releaseVoice(v, now);
    }
    for (const v of live) v.blockId = blockId;
    heldByBlock.set(blockId, { kind, voices: live });
  }

  function playOne(opts, noteLike, extra) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;
      enforceVoiceLimit(opts, audioCtx);
    const freq = Number(noteLike && noteLike.freq);
    if (!Number.isFinite(freq) || freq <= 0) return false;

      const midi = Number.isFinite(Number(noteLike && noteLike.midi))
        ? Number(noteLike.midi)
        : Math.round(69 + 12 * Math.log2(freq / 440));

      const targetMidi = midi;
      const carrier = normalizeCarrier(opts.carrier);
      const time = Math.max(audioCtx.currentTime, Number(opts.time) || audioCtx.currentTime);
      const human = clamp01(value(opts.human, 0));
      const robot = clamp01(value(opts.robot, 0));
      const vocoderAmount = clamp01(value(opts.vocoder, 0));

      const gate = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
        ? Number(opts.gateDuration)
        : Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
          ? Number(opts.eventDuration)
          : 0.8;

      const releaseSec = clamp(0.05 + clamp01(value(opts.release, 0.35)) * 0.9, 0.035, 1.25);
      const duration = Math.max(0.05, gate + releaseSec);
      const spreadSec = extra && Number.isFinite(Number(extra.spreadSec)) ? Number(extra.spreadSec) : 0;
      const t0 = time + spreadSec;

      const detuneCents = ((Math.random() * 2 - 1) * 7 * human) + ((Math.random() * 2 - 1) * 5 * robot);
      const targetFreq = freq * Math.pow(2, detuneCents / 1200);

      let variant = null;
      const wantsCorpus = carrier === 'sample' || vocoderAmount > 0.001;

      if (wantsCorpus) {
        if (!manifestPromise) loadManifest();

        if (!manifest) {
          // Pure sample playback must wait for the corpus. Synth carriers may
          // still play dry while the corpus warms.
          if (carrier === 'sample') return false;
        } else {
          variant = resolveCorpusVariantFor(opts, targetMidi);

          if (variant && buffers.has(variant.url)) {
            variant = { ...variant, buffer: buffers.get(variant.url) };
          } else if (variant) {
            loadBuffer(audioCtx, variant, { silent: true }).catch(() => {});

            // carrier sample is corpus-only; dry synth carriers should continue
            // and gain the vocoder branch once the sample is decoded.
            if (carrier === 'sample') return false;

            variant = null;
          } else if (carrier === 'sample') {
            return false;
          }
        }
      }

      const sourceOpts = carrier === 'sample'
        ? { ...opts, carrier: 'sample' }
        : opts;

      const sourceInfo = makeCarrier(audioCtx, sourceOpts, targetFreq, t0, duration, variant);
      const isSampleSource = sourceInfo.sourceKind === 'sample';

      const formantOut = isSampleSource
        ? sourceInfo.node
        : connectFormants(audioCtx, sourceInfo.node, opts);

      let pitchRef = null;
      let carrierDriveSources = [];
      let modOut = formantOut;

      if (isSampleSource && vocoderAmount > 0.001) {
        const driven = applyCarrierFrequencyDrive(
          audioCtx,
          formantOut,
          opts,
          targetFreq,
          t0,
          duration + releaseSec
        );

        modOut = driven.node;
        carrierDriveSources = driven.sources || [];
      } else if (!isSampleSource) {
        if (normalizeCarrier(opts.carrier) !== 'sine') {
          pitchRef = audioCtx.createOscillator();
          pitchRef.type = 'sine';
          pitchRef.frequency.setValueAtTime(targetFreq, t0);

          const pitchRefGain = audioCtx.createGain();
          pitchRefGain.gain.setValueAtTime(0.0001, t0);
          pitchRefGain.gain.linearRampToValueAtTime(0.055, t0 + 0.012);

          pitchRef.connect(pitchRefGain);
          pitchRefGain.connect(formantOut);
        }

        modOut = applyRobotMod(audioCtx, formantOut, opts, t0, duration + releaseSec);
      }
      const amp = audioCtx.createGain();
      amp.gain.value = 0.0001;

      const chordMul = extra && Number.isFinite(Number(extra.chordMul)) ? Number(extra.chordMul) : 1;
      const targetGain = clamp(value(opts.gain, 1) * forceGain(opts.force) * chordMul, 0, 1.4);

      const extraSources = [];
      if (pitchRef) extraSources.push(pitchRef);

      const dryGain = audioCtx.createGain();

      // `vocoder` is a wet/dry blend, not a mode switch.
      // 0   = dry carrier/sample
      // .5  = dry source + driven eSpeak source
      // 1   = fully source-driven eSpeak branch, if corpus is ready
      const hasWetCorpus = variant && variant.buffer && vocoderAmount > 0.001 && carrier !== 'sample';
      const dryLevel = hasWetCorpus
        ? clamp(1 - vocoderAmount, 0, 1)
        : 1;

      dryGain.gain.setValueAtTime(dryLevel, t0);
      modOut.connect(dryGain);
      dryGain.connect(amp);

      if (hasWetCorpus) {
        const wetSources = addDrivenCorpusBranch(
          audioCtx,
          opts,
          variant,
          targetFreq,
          t0,
          duration + releaseSec,
          vocoderAmount,
          amp
        );

        for (const src of wetSources) extraSources.push(src);
      }

      const breathSrc = addBreath(audioCtx, amp, opts, t0, duration);
      if (breathSrc) extraSources.push(breathSrc);

      let signal = amp;

      if (root.ReplCrush && root.ReplCrush.connect) {
        signal = root.ReplCrush.connect(audioCtx, signal, {
          crush: opts.crush,
          resolution: opts.resolution,
        });
      }

      if (audioCtx.createStereoPanner) {
        const pan = audioCtx.createStereoPanner();
        pan.pan.value = clamp(value(opts.pan, 0), -1, 1);
        signal.connect(pan);
        signal = pan;
      }

      signal.connect(masterBus);

      const attack = clamp(
        0.01 + robot * 0.018 + (1 - clamp01(value(opts.force, 0.72))) * 0.015,
        0.004,
        0.06
      );

      const holdUntil = t0 + Math.max(0.05, gate);

      try {
        amp.gain.cancelScheduledValues(t0);
        amp.gain.setValueAtTime(0.0001, t0);
        amp.gain.linearRampToValueAtTime(targetGain, t0 + attack);

        amp.gain.setTargetAtTime(
          Math.max(0.0001, targetGain * (0.75 - robot * 0.18)),
          t0 + attack,
          0.09
        );
      } catch (_) {}

      const v = {
        audioCtx,
        source: sourceInfo.source,
        sourceKind: sourceInfo.sourceKind,
        extraSources,
        gain: amp,
        targetGain,
        holdUntil,
        releaseSec,
        startedAt: t0,
        blockId: opts.blockId || 'global',
        released: false,
        timer: null,
      };

      activeVoices.add(v);
      sourceInfo.source.onended = () => unregister(v);

      try {
        sourceInfo.source.start(t0);
          if (pitchRef) {
            try { pitchRef.start(t0); } catch (_) {}
          }
        // Do not pre-schedule oscillator/noise stop. releaseVoice() owns that.
        // For one-shot samples, the buffer may naturally end before a long tie;
        // that is okay for corpus mode because synth fallback is the reliable
        // sustained path.
        if (sourceInfo.sourceKind === 'sample' && Number.isFinite(sourceInfo.naturalEnd)) {
          // Do not call stop() here either; AudioBufferSourceNode naturally ends.
        }

        scheduleRelease(v, holdUntil);
        return v;
      } catch (err) {
        unregister(v);
        console.warn('[repl] voice start failed:', err);
        return false;
      }
  }

  function playVoice(opts) {
    if (!opts || !opts.audioCtx || !opts.masterBus) return false;
    if (!manifestPromise) loadManifest();
      const base = playOne(opts, {
        freq: opts.freq,
        midi: opts.midi,
        name: opts.name,
      }, { chordMul: 1, spreadSec: 0 });
    const voices = base ? [base] : [];
    const ensemble = clamp01(value(opts.ensemble, 0));
    const copies = Math.round(ensemble * 3);
    for (let i = 0; i < copies; i += 1) {
      const cents = (i - (copies - 1) / 2) * (5 + ensemble * 9);
      const f = Number(opts.freq) * Math.pow(2, cents / 1200);
        const v = playOne({
          ...opts,
          freq: f,
          formant: clamp(value(opts.formant, 0) + (i - copies / 2) * 0.045, -1, 1),
        }, {
          freq: f,
          midi: opts.midi,
          name: opts.name,
        }, {
          chordMul: 0.48,
          spreadSec: (i + 1) * 0.012 * ensemble,
        });
      if (v) voices.push(v);
    }
    if (voices.length) registerGroup(opts, 'voice', voices);
    return voices.length > 0;
  }

  function playVoiceChord(opts) {
    if (!opts || !Array.isArray(opts.notes) || !opts.notes.length) return false;
    if (!manifestPromise) loadManifest();
    const notes = opts.notes.filter(Boolean);
    const spread = clamp01(value(opts.spread, 0.025));
    const chordMul = clamp(1 / Math.sqrt(Math.max(1, notes.length)) * 0.9, 0.28, 0.8);
    const voices = [];
    notes.forEach((note, i) => {
      const spreadSec = notes.length <= 1 ? 0 : (i / Math.max(1, notes.length - 1)) * spread * 0.22;
      const v = playOne(opts, note, { chordMul, spreadSec });
      if (v) voices.push(v);
    });
    if (voices.length) registerGroup(opts, 'chord', voices);
    return voices.length > 0;
  }

  function extendLastForBlock(opts) {
    const audioCtx = opts && opts.audioCtx;
    const blockId = opts && opts.blockId ? opts.blockId : 'global';
    const group = heldByBlock.get(blockId);
    if (!audioCtx || !group || !Array.isArray(group.voices)) return false;
    const gate = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
      ? Number(opts.gateDuration)
      : Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0 ? Number(opts.eventDuration) : 1;
    const until = Math.max(audioCtx.currentTime, Number(opts.time) || audioCtx.currentTime) + gate;
    let ok = false;
    for (const v of group.voices) {
      if (!v || v.released) continue;
      scheduleRelease(v, until);
      ok = true;
    }
    return ok;
  }

  function releaseLastForBlock(opts) {
    const audioCtx = opts && opts.audioCtx;
    const blockId = opts && opts.blockId ? opts.blockId : 'global';
    const group = heldByBlock.get(blockId);
    if (!audioCtx || !group) return false;
    let when = Number.isFinite(Number(opts.time)) ? Math.max(audioCtx.currentTime, Number(opts.time)) : audioCtx.currentTime;
    for (const v of group.voices || []) if (v && Number.isFinite(Number(v.holdUntil))) when = Math.max(when, v.holdUntil);
    for (const v of group.voices || []) releaseVoice(v, when);
    heldByBlock.delete(blockId);
    return true;
  }

    function prewarm(audioCtx, opts) {
      return loadManifest().then(() => {
        if (!audioCtx || !hasManifest()) return [];

        const vowels = ['ah', 'oo'];
        const syllables = ['ah', 'input', 'null'];
        const notes = ['C2', 'G2', 'C3', 'G3', 'C4', 'G4'];
        const loads = [];

        for (const note of notes) {
          if (loads.length >= MAX_PREWARM_VARIANTS) break;

          const entry = noteEntryByMidi(noteNameToMidi(note));
          if (!entry) continue;

          for (const syllable of syllables) {
            if (loads.length >= MAX_PREWARM_VARIANTS) break;

            const variant = chooseVariant(entry.entry, {
              ...(opts || {}),
              vowel: vowels.includes(syllable) ? syllable : 'ah',
              syllable,
              carrier: 'sample',
              human: 0,
              ensemble: 0,
            });

            if (variant) loads.push(loadBuffer(audioCtx, variant, { silent: true }));
          }
        }

        return Promise.all(loads);
      });
    }

  function stopAll(when) {
    const t = Number.isFinite(Number(when)) ? Number(when) : 0;
    heldByBlock.clear();
    for (const v of Array.from(activeVoices)) releaseVoice(v, t);
  }

    function status() {
      return {
        manifest: manifest ? manifest.id : null,
        notes: manifest && manifest.noteList ? manifest.noteList.length : 0,
        vowels: availableVowels(),
        syllables: availableSyllables(),
        loaded: buffers.size,
        pending: pending.size,
        maxPending: MAX_PENDING_SAMPLE_LOADS,
        active: activeVoices.size,
        heldGroups: heldByBlock.size,
        fallback: !hasManifest(),
      };
    }

    const api = {
      loadManifest,
      ready,
      prewarm,

      playVoice,
      playRobotVoice: playVoice,
      playVocal: playVoice,

      playVoiceChord,
      playRobotVoiceChord: playVoiceChord,
      playVocalChord: playVoiceChord,

      extendLastForBlock,
      releaseLastForBlock,
      stopAll,
      status,
    };

    root.VoiceVoice = api;
    root.RobotVoice = api;
    root.VocalVoice = api;
  })(window);
