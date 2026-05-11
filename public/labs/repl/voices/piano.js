// Iowa Piano voice — first-class sampled pitched instrument for seb's REPL.
// Uses a generated local manifest at public/instruments/iowa-piano/manifest.full.json.
// This is not the generic sample voice: it resolves notes to piano sample roots,
// maps force to pp/mf/ff layers, applies playback-rate pitch correction,
// models pedal/release/lid/una/body behavior, and routes through the scheduler bus.

(function (root) {
  'use strict';

  const DEFAULT_MANIFEST_URL =
    (typeof window !== 'undefined' && typeof window.replAudioUrl === 'function')
      ? window.replAudioUrl('instrument-manifest', 'iowa-piano')
      : './public/instruments/iowa-piano/manifest.full.json';
  const LAYERS = ['pp', 'mf', 'ff'];
  const DEFAULT_MAX_VOICES = 64;
  const MAX_BODY_VOICES = 32;
  const TRANSIENT_PROTECT_S = 0.018;

  const _buffers = new Map();
  const _pendingBuffers = new Map();
  const _activeVoices = new Set();
  const _bodyVoices = new Set();

  let _manifest = null;
  let _manifestUrl = DEFAULT_MANIFEST_URL;
  let _manifestPromise = null;

  function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return n < lo ? lo : n > hi ? hi : n;
  }

  function clamp01(v) {
    return clamp(v, 0, 1);
  }

  function isParamGesture(v) {
    return v && typeof v === 'object' && v.kind === 'param-gesture';
  }

  function numericParamValue(v, fallback) {
    if (isParamGesture(v)) {
      const from = Number(v.from);
      return Number.isFinite(from) ? from : fallback;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function randomBetween(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (Number(midi) - 69) / 12);
  }

  function noteNameToMidi(noteName) {
    const m = String(noteName || '').match(/^([A-Ga-g])([#b])?(-?\d{1,2})$/);
    if (!m) return null;
    const pc = m[1].toUpperCase();
    const accidental = m[2] || '';
    const octave = Number(m[3]);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[pc];
    if (!Number.isFinite(base) || !Number.isFinite(octave)) return null;
    const acc = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
    return (octave + 1) * 12 + base + acc;
  }

  function normalizeNoteName(name) {
    const raw = String(name || '').trim();
    const m = raw.match(/^([A-Ga-g])([#b])?(-?\d{1,2})$/);
    if (!m) return raw;
    return `${m[1].toUpperCase()}${m[2] || ''}${m[3]}`;
  }

  function absoluteUrl(baseUrl, relUrl) {
    try {
      return new URL(relUrl, new URL(baseUrl, window.location.href)).toString();
    } catch (_) {
      return relUrl;
    }
  }

  function normalizeManifest(data) {
    const notes = data && data.notes && typeof data.notes === 'object' ? data.notes : {};
    const normalizedNotes = {};
    const noteList = [];

    for (const [rawName, rawEntry] of Object.entries(notes)) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const note = normalizeNoteName(rawName);
      const midi = Number.isFinite(Number(rawEntry.midi)) ? Number(rawEntry.midi) : noteNameToMidi(note);
      if (!Number.isFinite(midi)) continue;
      const frequency = Number.isFinite(Number(rawEntry.frequency)) ? Number(rawEntry.frequency) : midiToFreq(midi);
      const layers = rawEntry.layers && typeof rawEntry.layers === 'object' ? rawEntry.layers : {};
      normalizedNotes[note] = {
        ...rawEntry,
        note,
        midi,
        frequency,
        layers,
      };
      noteList.push({ note, midi, frequency });
    }

    noteList.sort((a, b) => a.midi - b.midi);

    return {
      id: String((data && data.id) || 'iowa-piano'),
      name: String((data && data.name) || 'Iowa Piano'),
      source: String((data && data.source) || 'University of Iowa Musical Instrument Samples'),
      instrument: String((data && data.instrument) || 'Steinway & Sons model B'),
      format: data && data.format ? data.format : {},
      license: data && data.license ? data.license : {},
      layers: Array.isArray(data && data.layers) ? data.layers.slice() : LAYERS.slice(),
      range: data && data.range ? data.range : {},
      notes: normalizedNotes,
      noteList,
      missing: Array.isArray(data && data.missing) ? data.missing.slice() : [],
      fallbackPolicy: String((data && data.fallbackPolicy) || 'nearest-same-layer-else-nearest-layer'),
    };
  }

  function loadManifest(url) {
    const targetUrl = url || DEFAULT_MANIFEST_URL;
    if (_manifestPromise && targetUrl === _manifestUrl) return _manifestPromise;

    _manifestUrl = targetUrl;
    _manifestPromise = fetch(targetUrl, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error('piano manifest http ' + r.status);
        return r.json();
      })
      .then((data) => {
        _manifest = normalizeManifest(data);
        return _manifest;
      })
      .catch((err) => {
        _manifest = normalizeManifest(null);
        console.warn('[repl] piano manifest load failed:', err);
        return _manifest;
      });

    return _manifestPromise;
  }

  function ready() {
    return loadManifest(_manifestUrl);
  }

  function manifestReady() {
    return _manifest && _manifest.noteList && _manifest.noteList.length > 0;
  }

  function layerFromForce(force, mode) {
    if (typeof force === 'string') {
      const lower = force.toLowerCase();
      if (LAYERS.includes(lower)) return lower;
    }

    if (mode === 'random') {
      const roll = Math.random();
      const f = clamp(numericParamValue(force, 0.7), 0, 1);
      if (roll < Math.max(0.08, 0.45 - f * 0.30)) return 'pp';
      if (roll < Math.max(0.32, 0.85 - f * 0.20)) return 'mf';
      return 'ff';
    }

    const f = clamp(numericParamValue(force, 0.7), 0, 1);
    if (f <= 0.34) return 'pp';
    if (f <= 0.72) return 'mf';
    return 'ff';
  }

  function xfadeLayerPlan(force) {
    const f = clamp(numericParamValue(force, 0.7), 0, 1);

    if (f <= 0.34) {
      const t = clamp(f / 0.34, 0, 1);
      return [
        { layer: 'pp', gain: 1 - t * 0.35 },
        { layer: 'mf', gain: t * 0.35 },
      ].filter((x) => x.gain > 0.001);
    }

    if (f <= 0.72) {
      const t = clamp((f - 0.34) / 0.38, 0, 1);
      return [
        { layer: 'pp', gain: Math.max(0, 0.25 * (1 - t)) },
        { layer: 'mf', gain: 0.75 + 0.15 * (1 - Math.abs(t - 0.5) * 2) },
        { layer: 'ff', gain: Math.max(0, 0.25 * t) },
      ].filter((x) => x.gain > 0.001);
    }

    const t = clamp((f - 0.72) / 0.28, 0, 1);
    return [
      { layer: 'mf', gain: 1 - t * 0.45 },
      { layer: 'ff', gain: 0.45 + t * 0.55 },
    ].filter((x) => x.gain > 0.001);
  }

  function noteEntryByMidi(targetMidi) {
    if (!manifestReady()) return null;

    let exact = null;
    for (const item of _manifest.noteList) {
      if (Math.round(item.midi) === Math.round(targetMidi)) {
        exact = _manifest.notes[item.note];
        break;
      }
    }
    if (exact) return { entry: exact, exact: true };

    let best = null;
    let bestDist = Infinity;
    for (const item of _manifest.noteList) {
      const dist = Math.abs(Number(item.midi) - Number(targetMidi));
      if (dist < bestDist) {
        best = _manifest.notes[item.note];
        bestDist = dist;
      }
    }

    return best ? { entry: best, exact: false } : null;
  }

  function layerEntry(noteEntry, desiredLayer) {
    if (!noteEntry || !noteEntry.layers) return null;
    if (noteEntry.layers[desiredLayer]) return { layer: desiredLayer, entry: noteEntry.layers[desiredLayer] };

    for (const layer of LAYERS) {
      if (noteEntry.layers[layer]) return { layer, entry: noteEntry.layers[layer] };
    }

    return null;
  }

  function bufferKey(sample) {
    return sample && sample.url ? sample.url : '';
  }

  function loadBuffer(audioCtx, sample) {
    if (!audioCtx || !sample || !sample.url) return Promise.resolve(null);

    const key = bufferKey(sample);
    if (_buffers.has(key)) return Promise.resolve(_buffers.get(key));
    if (_pendingBuffers.has(key)) return _pendingBuffers.get(key);

    const url = absoluteUrl(_manifestUrl, sample.url);
    const promise = fetch(url, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error('piano sample http ' + r.status);
        return r.arrayBuffer();
      })
      .then((bytes) => audioCtx.decodeAudioData(bytes))
      .then((buffer) => {
        _buffers.set(key, buffer);
        _pendingBuffers.delete(key);
        return buffer;
      })
      .catch((err) => {
        _pendingBuffers.delete(key);
        console.warn('[repl] piano sample load failed:', sample.sourceFile || sample.url, err);
        return null;
      });

    _pendingBuffers.set(key, promise);
    return promise;
  }

  function scheduleGain(param, time, targetGain, attack, hold, release) {
    const t0 = Math.max(0, Number(time) || 0);
    const a = Math.max(0.001, Number(attack) || 0.006);
    const h = Math.max(a + 0.001, Number(hold) || 0.25);
    const r = Math.max(0.012, Number(release) || 0.18);
    const stop = t0 + h + r;

    try {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(0, t0);
      param.linearRampToValueAtTime(targetGain, t0 + a);
      param.setValueAtTime(targetGain, t0 + h);
      param.exponentialRampToValueAtTime(0.0001, stop);
    } catch (_) {
      try { param.value = targetGain; } catch (__) {}
    }

    return stop;
  }

  function applyToneShape(audioCtx, signal, opts) {
    const una = clamp01(numericParamValue(opts.una, 0));
    const lid = clamp01(numericParamValue(opts.lid, 0.72));
    const force = clamp01(numericParamValue(opts.force, 0.7));

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = clamp(3200 + lid * 8500 + force * 2800 - una * 4200, 1200, 16000);
    lowpass.Q.value = 0.42 + lid * 0.35;

    const highShelf = audioCtx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 2600;
    highShelf.gain.value = -5.0 * una + 3.25 * lid + 1.4 * force;

    signal.connect(lowpass);
    lowpass.connect(highShelf);

    return highShelf;
  }

  function applyPan(audioCtx, signal, panValue) {
    if (!audioCtx.createStereoPanner) return signal;
    const pan = audioCtx.createStereoPanner();
    pan.pan.value = clamp(numericParamValue(panValue, 0), -1, 1);
    signal.connect(pan);
    return pan;
  }

  function unregister(active) {
    if (!active) return;
    if (active.bodyNodes) {
      for (const node of active.bodyNodes) {
        try { node.disconnect(); } catch (_) {}
      }
    }
    _activeVoices.delete(active);
    _bodyVoices.delete(active);
  }

  function stopActive(active, when) {
    if (!active) return;
    const t = Number.isFinite(Number(when)) ? Number(when) : 0;
    if (active.gain && active.gain.gain) {
      try {
        const current = Math.max(0.0001, active.gain.gain.value || 0.0001);
        active.gain.gain.cancelScheduledValues(t);
        active.gain.gain.setValueAtTime(current, t);
        active.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      } catch (_) {
        try { active.gain.gain.value = 0.0001; } catch (__) {}
      }
    }
    if (active.source) {
      try { active.source.stop(t + 0.035); } catch (_) {}
    }
    unregister(active);
  }

  function enforcePolyphony(audioCtx, maxVoices) {
    const limit = clamp(Math.round(Number(maxVoices) || DEFAULT_MAX_VOICES), 8, 128);
    while (_activeVoices.size >= limit) {
      let victim = null;
      for (const active of _activeVoices) {
        if (!victim) {
          victim = active;
          continue;
        }
        if ((active.released && !victim.released) || active.startedAt < victim.startedAt) {
          victim = active;
        }
      }
      if (!victim) break;
      stopActive(victim, audioCtx.currentTime);
    }

    while (_bodyVoices.size > MAX_BODY_VOICES) {
      const oldest = _bodyVoices.values().next().value;
      if (!oldest) break;
      stopActive(oldest, audioCtx.currentTime);
    }
  }

  function stretchFreq(freq, midi, stretch) {
    const amount = clamp01(numericParamValue(stretch, 0));
    if (amount <= 0 || !Number.isFinite(Number(midi))) return freq;

    const distance = Number(midi) - 60;
    const cents = Math.sign(distance) * Math.pow(Math.abs(distance) / 48, 2) * 9 * amount;
    return freq * Math.pow(2, cents / 1200);
  }

  function humanize(opts) {
    const human = clamp01(numericParamValue(opts.human, 0));
    if (human <= 0) {
      return {
        timeOffset: 0,
        gainMul: 1,
        cents: 0,
        startOffset: 0,
        layerJitter: 0,
      };
    }

    return {
      timeOffset: randomBetween(-0.020, 0.020) * human,
      gainMul: Math.pow(10, randomBetween(-2, 2) * human / 20),
      cents: randomBetween(-8, 8) * human,
      startOffset: randomBetween(0, 0.012) * human,
      layerJitter: Math.random() < human * 0.10 ? (Math.random() < 0.5 ? -1 : 1) : 0,
    };
  }

  function jitterLayer(layer, jitter) {
    if (!jitter) return layer;
    const idx = LAYERS.indexOf(layer);
    if (idx < 0) return layer;
    return LAYERS[clamp(idx + jitter, 0, LAYERS.length - 1)];
  }

  function connectSympatheticBody(audioCtx, drySignal, masterBus, opts) {
    const amount = clamp01(numericParamValue(opts.sympathetic, 0));
    if (amount <= 0.0001) return [];

    const bodyGain = audioCtx.createGain();
    bodyGain.gain.value = amount * clamp(0.18 + (1 - clamp01(numericParamValue(opts.lid, 0.72))) * 0.12, 0.08, 0.34);

    const delayL = audioCtx.createDelay(0.18);
    const delayR = audioCtx.createDelay(0.18);
    delayL.delayTime.value = 0.031;
    delayR.delayTime.value = 0.047;

    const merger = audioCtx.createChannelMerger(2);
    const filterA = audioCtx.createBiquadFilter();
    const filterB = audioCtx.createBiquadFilter();
    const filterC = audioCtx.createBiquadFilter();

    filterA.type = 'bandpass';
    filterA.frequency.value = clamp(numericParamValue(opts.freq, 220) * 0.5, 55, 880);
    filterA.Q.value = 3.5;

    filterB.type = 'bandpass';
    filterB.frequency.value = clamp(numericParamValue(opts.freq, 220), 110, 2200);
    filterB.Q.value = 4.2;

    filterC.type = 'bandpass';
    filterC.frequency.value = clamp(numericParamValue(opts.freq, 220) * 2.01, 220, 5000);
    filterC.Q.value = 2.2;

    drySignal.connect(bodyGain);
    bodyGain.connect(delayL);
    bodyGain.connect(delayR);
    delayL.connect(filterA);
    delayR.connect(filterB);
    bodyGain.connect(filterC);
    filterA.connect(merger, 0, 0);
    filterB.connect(merger, 0, 1);
    filterC.connect(masterBus);
    merger.connect(masterBus);

    return [bodyGain, delayL, delayR, filterA, filterB, filterC, merger];
  }

  function scheduleOneLayer(opts, notePlan, layerPlan) {
    const audioCtx = opts.audioCtx;
    const masterBus = opts.masterBus;
    const buffer = layerPlan.buffer;
    if (!audioCtx || !masterBus || !buffer) return false;

    const h = humanize(opts);
    const time = Math.max(audioCtx.currentTime, Number(opts.time) + h.timeOffset);
    const force = clamp01(numericParamValue(opts.force, 0.7));
    const pedal = clamp01(numericParamValue(opts.pedal, 0));
    const una = clamp01(numericParamValue(opts.una, 0));
    const lid = clamp01(numericParamValue(opts.lid, 0.72));
    const releaseParam = clamp01(numericParamValue(opts.release, 0.35));
    const gainParam = clamp(numericParamValue(opts.gain, 1), 0, 1.5);
    const layerGain = Number.isFinite(Number(layerPlan.gain)) ? Number(layerPlan.gain) : 1;

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    const cents = h.cents;
    const playbackRate = notePlan.playbackRate * Math.pow(2, cents / 1200);
    src.playbackRate.value = clamp(playbackRate, 0.125, 8);

    const amp = audioCtx.createGain();
    const layerTrim = layerPlan.layer === 'pp' ? 0.82 : layerPlan.layer === 'ff' ? 1.05 : 0.94;
    const targetGain = clamp(gainParam * layerGain * layerTrim * h.gainMul * (0.55 + force * 0.55) * (1 - una * 0.22), 0, 1.7);
    amp.gain.value = 0.0001;

    let signal = src;
    signal = applyToneShape(audioCtx, signal, { ...opts, force, una, lid });
    signal.connect(amp);
    signal = amp;

    if (root.ReplCrush && root.ReplCrush.connect) {
      signal = root.ReplCrush.connect(audioCtx, signal, {
        crush: opts.crush,
        resolution: opts.resolution,
      });
    }

    signal = applyPan(audioCtx, signal, opts.pan);
    signal.connect(masterBus);

    const nominalDuration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
      ? Number(opts.gateDuration)
      : Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
        ? Number(opts.eventDuration)
        : 0.7;

    const attack = clamp(0.004 + una * 0.012 - force * 0.002, 0.002, 0.026);
    const hold = clamp(nominalDuration * (0.80 + pedal * 1.85), 0.10, 9.0);
    const release = clamp(0.10 + releaseParam * 1.85 + pedal * 3.2, 0.06, 6.0);
    const stopAt = scheduleGain(amp.gain, time, targetGain, attack, hold, release);

    const bodyNodes = connectSympatheticBody(audioCtx, signal, masterBus, {
      ...opts,
      freq: opts.freq,
      lid,
      sympathetic: opts.sympathetic,
    });

    const active = {
      source: src,
      gain: amp,
      bodyNodes,
      startedAt: time,
      released: false,
    };

    _activeVoices.add(active);
    if (bodyNodes.length) _bodyVoices.add(active);

    src.onended = () => unregister(active);

    try {
      src.start(time, Math.min(Math.max(0, h.startOffset), Math.max(0, buffer.duration - TRANSIENT_PROTECT_S)));
      src.stop(Math.min(time + buffer.duration / Math.max(0.001, src.playbackRate.value), stopAt + 0.05));
      return true;
    } catch (err) {
      unregister(active);
      console.warn('[repl] piano start failed:', err);
      return false;
    }
  }

  function resolveLayerPlans(noteEntry, force, layerMode) {
    if (layerMode === 'xfade') {
      return xfadeLayerPlan(force)
        .map((p) => {
          const le = layerEntry(noteEntry, p.layer);
          return le ? { layer: le.layer, sample: le.entry, gain: p.gain } : null;
        })
        .filter(Boolean);
    }

    const selected = layerFromForce(force, layerMode);
    const jittered = selected;
    const le = layerEntry(noteEntry, jittered);
    return le ? [{ layer: le.layer, sample: le.entry, gain: 1 }] : [];
  }

  function prewarm(audioCtx, notes) {
    if (!audioCtx) return Promise.resolve([]);
    return ready().then(() => {
      if (!manifestReady()) return [];
      const wants = Array.isArray(notes) && notes.length ? notes : ['C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5'];
      const loads = [];
      for (const noteName of wants) {
        const midi = noteNameToMidi(noteName);
        if (!Number.isFinite(midi)) continue;
        const resolved = noteEntryByMidi(midi);
        if (!resolved || !resolved.entry) continue;
        const le = layerEntry(resolved.entry, 'mf');
        if (le && le.entry) loads.push(loadBuffer(audioCtx, le.entry));
      }
      return Promise.all(loads);
    });
  }

  function playPiano(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;

    const targetMidi = Number(opts.midi);
    const targetFreqRaw = Number(opts.freq);
    if (!Number.isFinite(targetFreqRaw) || targetFreqRaw <= 0) return false;

    if (!manifestReady()) {
      loadManifest(_manifestUrl).then(() => prewarm(audioCtx));
      return false;
    }

    const midiForLookup = Number.isFinite(targetMidi)
      ? targetMidi
      : 69 + 12 * Math.log2(targetFreqRaw / 440);

    const resolved = noteEntryByMidi(midiForLookup);
    if (!resolved || !resolved.entry) return false;

    const targetFreq = stretchFreq(targetFreqRaw, midiForLookup, opts.stretch);
    const sourceMidi = Number.isFinite(Number(resolved.entry.midi)) ? Number(resolved.entry.midi) : midiForLookup;
    const sourceFreq = Number.isFinite(Number(resolved.entry.frequency)) ? Number(resolved.entry.frequency) : midiToFreq(sourceMidi);
    const playbackRate = targetFreq / sourceFreq;

    const h = humanize(opts);
    const layerMode = String(opts.layer || 'hard').toLowerCase();
    const rawLayerPlans = resolveLayerPlans(resolved.entry, opts.force, layerMode);

    if (!rawLayerPlans.length) return false;

    let allReady = true;
    const readyPlans = [];

    for (const rawPlan of rawLayerPlans) {
      const effectiveLayer = jitterLayer(rawPlan.layer, h.layerJitter);
      const effectiveEntry = layerEntry(resolved.entry, effectiveLayer) || { layer: rawPlan.layer, entry: rawPlan.sample };
      const key = bufferKey(effectiveEntry.entry);

      if (!_buffers.has(key)) {
        allReady = false;
        loadBuffer(audioCtx, effectiveEntry.entry);
        continue;
      }

      readyPlans.push({
        layer: effectiveEntry.layer,
        sample: effectiveEntry.entry,
        gain: rawPlan.gain,
        buffer: _buffers.get(key),
      });
    }

    if (!allReady || !readyPlans.length) return false;

    enforcePolyphony(audioCtx, opts.poly);

    let scheduled = false;
    for (const plan of readyPlans) {
      scheduled = scheduleOneLayer({
        ...opts,
        freq: targetFreq,
      }, {
        noteEntry: resolved.entry,
        exact: resolved.exact,
        sourceMidi,
        sourceFreq,
        playbackRate,
      }, plan) || scheduled;
    }

    return scheduled;
  }

  function stopAll(when) {
    const t = Number.isFinite(Number(when)) ? Number(when) : 0;
    for (const active of Array.from(_activeVoices)) {
      stopActive(active, t);
    }
  }

  function status() {
    return {
      loaded: _buffers.size,
      pending: _pendingBuffers.size,
      manifest: _manifest ? _manifest.id : null,
      notes: _manifest && _manifest.noteList ? _manifest.noteList.length : 0,
      active: _activeVoices.size,
    };
  }

  root.PianoVoice = {
    loadManifest,
    ready,
    prewarm,
    playPiano,
    stopAll,
    status,
  };
})(window);
