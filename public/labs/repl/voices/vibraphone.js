// Iowa Vibraphone 2012 voice — metal bar / pedal / motor / damp / bow.
// Local manifest: public/instruments/iowa-vibraphone/manifest.full.json
// Semantics:
//   vibraphone C4    = strike or bow one bar
//   vibes C4+G4      = shared chord gesture
//   ~                = visual hold; tied span is folded into original gate
//   .                = damp/release current held group

(function (root) {
  'use strict';

  const DEFAULT_MANIFEST_URL = './public/instruments/iowa-vibraphone/manifest.full.json';
  const ARTICULATIONS = ['sustain', 'shortsustain', 'dampen', 'bow'];
  const DEFAULT_MAX_VOICES = 96;

  const _buffers = new Map();
  const _pendingBuffers = new Map();
  const _activeVoices = new Set();
  const _heldGroupsByBlock = new Map();

  let _manifest = null;
  let _manifestUrl = DEFAULT_MANIFEST_URL;
  let _manifestPromise = null;

  function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return n < lo ? lo : n > hi ? hi : n;
  }

  function clamp01(v) { return clamp(v, 0, 1); }

  function isParamGesture(v) { return v && typeof v === 'object' && v.kind === 'param-gesture'; }

  function numericParamValue(v, fallback) {
    if (isParamGesture(v)) {
      const from = Number(v.from);
      return Number.isFinite(from) ? from : fallback;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function randomBetween(lo, hi) { return lo + Math.random() * (hi - lo); }

  function midiToFreq(midi) { return 440 * Math.pow(2, (Number(midi) - 69) / 12); }

  function noteNameToMidi(noteName) {
    const m = String(noteName || '').match(/^([A-Ga-g])([#b])?(-?\d{1,2})$/);
    if (!m) return null;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    const octave = Number(m[3]);
    if (!Number.isFinite(base) || !Number.isFinite(octave)) return null;
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return (octave + 1) * 12 + base + acc;
  }

  function normalizeNoteName(name) {
    const raw = String(name || '').trim();
    const m = raw.match(/^([A-Ga-g])([#b])?(-?\d{1,2})$/);
    if (!m) return raw;
    return `${m[1].toUpperCase()}${m[2] || ''}${m[3]}`;
  }

  function normalizeArticulation(value) {
    const s = String(value || 'sustain').toLowerCase().trim();
    if (s === 'sustain' || s === 'sus' || s === 'open' || s === 'pedal' || s === 'arco') return 'sustain';
    if (s === 'short' || s === 'shortsustain' || s === 'short-sustain') return 'shortsustain';
    if (s === 'damp' || s === 'dampen' || s === 'muted' || s === 'stop') return 'dampen';
    if (s === 'bow' || s === 'bowed') return 'bow';
    return 'sustain';
  }

  function absoluteUrl(baseUrl, relUrl) {
    try { return new URL(relUrl, new URL(baseUrl, window.location.href)).toString(); }
    catch (_) { return relUrl; }
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
      const articulations = rawEntry.articulations && typeof rawEntry.articulations === 'object' ? rawEntry.articulations : {};
      normalizedNotes[note] = { ...rawEntry, note, midi, frequency, articulations };
      noteList.push({ note, midi, frequency });
    }

    noteList.sort((a, b) => a.midi - b.midi);

    return {
      id: String((data && data.id) || 'iowa-vibraphone-2012'),
      name: String((data && data.name) || 'Iowa Vibraphone 2012'),
      source: String((data && data.source) || 'University of Iowa Musical Instrument Samples'),
      instrument: String((data && data.instrument) || 'Vibraphone'),
      articulations: Array.isArray(data && data.articulations) ? data.articulations.slice() : ARTICULATIONS.slice(),
      range: data && data.range ? data.range : {},
      notes: normalizedNotes,
      noteList,
      missing: Array.isArray(data && data.missing) ? data.missing.slice() : [],
      fallbackPolicy: String((data && data.fallbackPolicy) || 'nearest-same-articulation-else-nearest-articulation'),
    };
  }

  function loadManifest(url) {
    const targetUrl = url || DEFAULT_MANIFEST_URL;
    if (_manifestPromise && targetUrl === _manifestUrl) return _manifestPromise;
    _manifestUrl = targetUrl;
    _manifestPromise = fetch(targetUrl, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error('vibraphone manifest http ' + r.status);
        return r.json();
      })
      .then((data) => {
        _manifest = normalizeManifest(data);
        return _manifest;
      })
      .catch((err) => {
        _manifest = normalizeManifest(null);
        console.warn('[repl] vibraphone manifest load failed:', err);
        return _manifest;
      });
    return _manifestPromise;
  }

  function ready() { return loadManifest(_manifestUrl); }
  function manifestReady() { return _manifest && _manifest.noteList && _manifest.noteList.length > 0; }

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

  function articulationEntry(noteEntry, requestedArticulation) {
    if (!noteEntry || !noteEntry.articulations) return null;
    const articulation = normalizeArticulation(requestedArticulation);
    if (noteEntry.articulations[articulation]) return { articulation, entry: noteEntry.articulations[articulation] };
    for (const alt of ARTICULATIONS) {
      if (noteEntry.articulations[alt]) return { articulation: alt, entry: noteEntry.articulations[alt] };
    }
    return null;
  }

  function bufferKey(sample) { return sample && sample.url ? sample.url : ''; }

  function loadBuffer(audioCtx, sample) {
    if (!audioCtx || !sample || !sample.url) return Promise.resolve(null);
    const key = bufferKey(sample);
    if (_buffers.has(key)) return Promise.resolve(_buffers.get(key));
    if (_pendingBuffers.has(key)) return _pendingBuffers.get(key);
    const url = absoluteUrl(_manifestUrl, sample.url);
    const promise = fetch(url, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error('vibraphone sample http ' + r.status);
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
        console.warn('[repl] vibraphone sample load failed:', sample.sourceFile || sample.url, err);
        return null;
      });
    _pendingBuffers.set(key, promise);
    return promise;
  }

  function forceGain(force) {
    const named = { ppp: 0.22, pp: 0.30, p: 0.42, mp: 0.56, mf: 0.72, f: 0.90, ff: 1.0, fff: 1.12 };
    if (typeof force === 'string') {
      const lower = force.toLowerCase();
      if (named[lower] != null) return named[lower];
    }
    return clamp(0.35 + clamp01(numericParamValue(force, 0.72)) * 0.82, 0.15, 1.35);
  }

  function humanize(opts) {
    const human = clamp01(numericParamValue(opts.human, 0));
    if (human <= 0) return { timeOffset: 0, gainMul: 1, cents: 0 };
    return {
      timeOffset: randomBetween(-0.018, 0.018) * human,
      gainMul: Math.pow(10, randomBetween(-1.8, 1.8) * human / 20),
      cents: randomBetween(-5, 5) * human,
    };
  }

  function applyTone(audioCtx, signal, opts, articulation) {
    const pedal = clamp01(numericParamValue(opts.pedal, 0.85));
    const damp = clamp01(numericParamValue(opts.damp, articulation === 'dampen' ? 0.75 : 0));
    const bowpressure = clamp01(numericParamValue(opts.bowpressure, 0.45));
    const body = clamp01(numericParamValue(opts.body, 0.45));
    const force = clamp01(numericParamValue(opts.force, 0.72));

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    const base = articulation === 'bow' ? 7600 + bowpressure * 5200 : 9200 + force * 4200;
    lowpass.frequency.value = clamp(base + pedal * 1400 - damp * 4200, 1800, 16000);
    lowpass.Q.value = 0.28 + body * 0.35;

    const metal = audioCtx.createBiquadFilter();
    metal.type = 'peaking';
    metal.frequency.value = articulation === 'bow' ? 1700 : 2500;
    metal.Q.value = 0.85;
    metal.gain.value = (articulation === 'bow' ? 2.5 + bowpressure * 3.5 : 2.0) + body * 1.5 - damp * 2.2;

    const bodyPeak = audioCtx.createBiquadFilter();
    bodyPeak.type = 'peaking';
    bodyPeak.frequency.value = 360;
    bodyPeak.Q.value = 0.7;
    bodyPeak.gain.value = body * 4.5 + pedal * 1.2 - damp * 2.5;

    signal.connect(lowpass);
    lowpass.connect(metal);
    metal.connect(bodyPeak);
    return bodyPeak;
  }

  function applyMotor(audioCtx, signal, opts, time, endTime) {
    const motor = clamp01(numericParamValue(opts.motor, 0));
    const depth = clamp01(numericParamValue(opts.depth, 0.35)) * motor;
    if (motor <= 0.0001 || depth <= 0.0001) return { node: signal, lfo: null, lfoGain: null };

    const motorGain = audioCtx.createGain();
    motorGain.gain.value = 1;
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 1.2 + motor * 8.5;
    lfoGain.gain.value = depth * 0.42;
    lfo.connect(lfoGain);
    lfoGain.connect(motorGain.gain);
    signal.connect(motorGain);
    try {
      lfo.start(time);
      lfo.stop(Math.max(time + 0.05, endTime + 0.1));
    } catch (_) {}
    return { node: motorGain, lfo, lfoGain };
  }

  function applyPan(audioCtx, signal, panValue) {
    if (!audioCtx.createStereoPanner) return signal;
    const pan = audioCtx.createStereoPanner();
    pan.pan.value = clamp(numericParamValue(panValue, 0), -1, 1);
    signal.connect(pan);
    return pan;
  }

  function scheduleEnvelope(param, time, targetGain, opts, articulation) {
    const pedal = clamp01(numericParamValue(opts.pedal, 0.85));
    const damp = clamp01(numericParamValue(opts.damp, articulation === 'dampen' ? 0.75 : 0));
    const release = clamp01(numericParamValue(opts.release, 0.45));
    const decay = clamp(numericParamValue(opts.decay, 4.2), 0.05, 14);
    const bowpressure = clamp01(numericParamValue(opts.bowpressure, 0.45));

    let attack = 0.003 + (1 - clamp01(numericParamValue(opts.force, 0.72))) * 0.006;
    let ringMul = 0.25 + pedal * 0.85;
    let tail = 0.08 + release * 1.15 + pedal * 1.4;
    let sustainLevel = 0.14 + pedal * 0.12;

    if (articulation === 'shortsustain') {
      ringMul *= 0.42;
      tail *= 0.65;
    } else if (articulation === 'dampen') {
      ringMul *= 0.18;
      tail *= 0.35;
      sustainLevel *= 0.35;
    } else if (articulation === 'bow') {
      attack = 0.08 + (1 - bowpressure) * 0.26;
      ringMul *= 1.25;
      tail *= 1.2;
      sustainLevel = 0.32 + pedal * 0.18;
    }

    const ring = clamp(decay * ringMul * (1 - damp * 0.92), 0.045, 10.5);
    tail = clamp(tail * (1 - damp * 0.76), 0.035, 3.2);

    const t0 = Math.max(0, Number(time) || 0);
    const t1 = t0 + attack;
    const t2 = t0 + ring;
    const t3 = t2 + tail;

    try {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(0.0001, t0);
      param.linearRampToValueAtTime(targetGain, t1);
      if (articulation === 'bow') {
        param.setValueAtTime(targetGain, Math.max(t1, t2 - tail));
      } else {
        param.exponentialRampToValueAtTime(Math.max(0.0001, targetGain * sustainLevel), t2);
      }
      param.exponentialRampToValueAtTime(0.0001, t3);
    } catch (_) {
      try { param.value = targetGain; } catch (__) {}
    }

    return t3;
  }

  function connectSympathetic(audioCtx, signal, masterBus, opts) {
    const amount = clamp01(numericParamValue(opts.sympathetic, 0));
    if (amount <= 0.0001) return [];
    const send = audioCtx.createGain();
    send.gain.value = amount * 0.18;
    const delay = audioCtx.createDelay(0.18);
    delay.delayTime.value = 0.024 + amount * 0.035;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 480 + amount * 1200;
    filter.Q.value = 1.4;
    signal.connect(send);
    send.connect(delay);
    delay.connect(filter);
    filter.connect(masterBus);
    return [send, delay, filter];
  }

  function unregister(active) {
    if (!active) return;
    if (active.releaseTimer) clearTimeout(active.releaseTimer);
    if (active.stopTimer) clearTimeout(active.stopTimer);
    if (active.bodyNodes) {
      for (const node of active.bodyNodes) {
        try { node.disconnect(); } catch (_) {}
      }
    }
    if (active.lfos) {
      for (const node of active.lfos) {
        try { node.disconnect(); } catch (_) {}
      }
    }
    _activeVoices.delete(active);
    if (active.blockId) {
      const group = _heldGroupsByBlock.get(active.blockId);
      if (group && Array.isArray(group.actives)) {
        group.actives = group.actives.filter((candidate) => candidate && candidate !== active && !candidate.released);
        if (!group.actives.length) _heldGroupsByBlock.delete(active.blockId);
      }
    }
  }

  function releaseActive(active, when) {
    if (!active || active.released) return false;
    const audioCtx = active.audioCtx;
    const t = Number.isFinite(Number(when)) ? Math.max(Number(when), audioCtx ? audioCtx.currentTime : 0) : (audioCtx ? audioCtx.currentTime : 0);
    active.released = true;
    if (active.releaseTimer) {
      clearTimeout(active.releaseTimer);
      active.releaseTimer = null;
    }
    if (active.gain && active.gain.gain) {
      try {
        const current = Math.max(0.0001, active.gain.gain.value || active.targetGain || 0.0001);
        active.gain.gain.cancelScheduledValues(t);
        active.gain.gain.setValueAtTime(current, t);
        active.gain.gain.exponentialRampToValueAtTime(0.0001, t + active.dampSec);
      } catch (_) {}
    }
    if (active.source) {
      try { active.source.stop(t + active.dampSec + 0.04); } catch (_) {}
    }
    return true;
  }

  function stopActive(active, when) {
    if (!active) return;
    if (releaseActive(active, when)) return;
    const t = Number.isFinite(Number(when)) ? Number(when) : 0;
    if (active.source) {
      try { active.source.stop(t + 0.025); } catch (_) {}
    }
    unregister(active);
  }

  function msUntil(audioCtx, audioTime) {
    if (!audioCtx) return 0;
    return Math.max(0, (Number(audioTime) - audioCtx.currentTime) * 1000);
  }

  function scheduleRelease(active, until) {
    if (!active || !active.audioCtx) return;
    active.holdUntil = Math.max(active.holdUntil || 0, until);
    if (active.releaseTimer) clearTimeout(active.releaseTimer);
    active.releaseTimer = setTimeout(() => releaseActive(active, active.holdUntil), msUntil(active.audioCtx, active.holdUntil));
  }

  function blockKeyFromOpts(opts) { return opts && opts.blockId ? opts.blockId : 'global'; }

  function registerHeldGroup(opts, kind, actives) {
    const blockId = blockKeyFromOpts(opts);
    const liveActives = Array.isArray(actives) ? actives.filter(Boolean) : [];
    if (!liveActives.length) return null;
    const previous = _heldGroupsByBlock.get(blockId);
    if (previous && Array.isArray(previous.actives)) {
      const t = liveActives[0].audioCtx ? liveActives[0].audioCtx.currentTime : 0;
      for (const active of previous.actives) releaseActive(active, t);
    }
    const group = { blockId, kind, actives: liveActives, startedAt: Math.min(...liveActives.map((active) => active.startedAt || 0)) };
    for (const active of liveActives) active.blockId = blockId;
    _heldGroupsByBlock.set(blockId, group);
    return group;
  }

  function extendLastForBlock(opts) {
    const audioCtx = opts && opts.audioCtx;
    if (!audioCtx) return false;
    const blockId = blockKeyFromOpts(opts);
    const group = _heldGroupsByBlock.get(blockId);
    if (!group || !Array.isArray(group.actives) || !group.actives.length) return false;
    const gateDuration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
      ? Number(opts.gateDuration)
      : Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
        ? Number(opts.eventDuration)
        : 1.0;
    const until = Math.max(audioCtx.currentTime, Number(opts.time) || audioCtx.currentTime) + gateDuration;
    let extended = false;
    group.actives = group.actives.filter((active) => active && !active.released);
    for (const active of group.actives) {
      scheduleRelease(active, until);
      extended = true;
    }
    if (!group.actives.length) _heldGroupsByBlock.delete(blockId);
    return extended;
  }

  function releaseLastForBlock(opts) {
    const audioCtx = opts && opts.audioCtx;
    const blockId = blockKeyFromOpts(opts);
    const group = _heldGroupsByBlock.get(blockId);
    if (!group) return false;
    const requestedWhen = Number.isFinite(Number(opts && opts.time)) ? Number(opts.time) : (audioCtx ? audioCtx.currentTime : 0);
    let latestHold = requestedWhen;
    for (const active of group.actives || []) {
      if (!active || active.released) continue;
      if (Number.isFinite(Number(active.holdUntil))) latestHold = Math.max(latestHold, Number(active.holdUntil));
    }
    const when = audioCtx ? Math.max(audioCtx.currentTime, latestHold) : latestHold;
    let released = false;
    for (const active of group.actives || []) released = releaseActive(active, when) || released;
    _heldGroupsByBlock.delete(blockId);
    return released;
  }

  function enforcePolyphony(audioCtx, maxVoices) {
    const limit = clamp(Math.round(Number(maxVoices) || DEFAULT_MAX_VOICES), 8, 160);
    while (_activeVoices.size >= limit) {
      let victim = null;
      for (const active of _activeVoices) {
        if (!victim || active.startedAt < victim.startedAt) victim = active;
      }
      if (!victim) break;
      stopActive(victim, audioCtx.currentTime);
    }
  }

  function resolvePlan(opts, note) {
    const targetFreq = Number(note && note.freq);
    if (!Number.isFinite(targetFreq) || targetFreq <= 0) return null;
    const targetMidi = Number.isFinite(Number(note && note.midi))
      ? Math.round(Number(note.midi))
      : Math.round(69 + 12 * Math.log2(targetFreq / 440));
    const resolved = noteEntryByMidi(targetMidi);
    if (!resolved || !resolved.entry) return null;
    const articulation = articulationEntry(resolved.entry, opts.articulation);
    if (!articulation || !articulation.entry) return null;
    const sourceFreq = Number.isFinite(Number(resolved.entry.frequency)) ? Number(resolved.entry.frequency) : midiToFreq(Number(resolved.entry.midi));
    return { targetFreq, targetMidi, sourceFreq, exact: resolved.exact, noteEntry: resolved.entry, articulation: articulation.articulation, sample: articulation.entry };
  }

  function scheduleBar(opts, plan, extra) {
    const audioCtx = opts.audioCtx;
    const masterBus = opts.masterBus;
    const buffer = plan.buffer;
    if (!audioCtx || !masterBus || !buffer) return false;

    const h = opts.sharedHuman || humanize(opts);
    const spreadSec = Number.isFinite(Number(opts.spreadSec)) ? Number(opts.spreadSec) : 0;
    const time = Math.max(audioCtx.currentTime, Number(opts.time) + h.timeOffset + spreadSec);
    const playbackRate = clamp((plan.targetFreq / plan.sourceFreq) * Math.pow(2, h.cents / 1200), 0.125, 8);

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = false;
    src.playbackRate.value = playbackRate;

    const amp = audioCtx.createGain();
    amp.gain.value = 0.0001;

    const chordMul = extra && Number.isFinite(Number(extra.chordGainMul)) ? Number(extra.chordGainMul) : 1;
    const targetGain = clamp(numericParamValue(opts.gain, 1) * forceGain(opts.force) * h.gainMul * chordMul, 0, 1.55);

    let signal = src;
    signal = applyTone(audioCtx, signal, opts, plan.articulation);
    signal.connect(amp);
    signal = amp;

    if (root.ReplCrush && root.ReplCrush.connect) {
      signal = root.ReplCrush.connect(audioCtx, signal, { crush: opts.crush, resolution: opts.resolution });
    }

    const gateDuration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
      ? Number(opts.gateDuration)
      : Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
        ? Number(opts.eventDuration)
        : 0.75;

    const provisionalEnd = time + Math.max(0.25, gateDuration) + 3.5;
    const motor = applyMotor(audioCtx, signal, opts, time, provisionalEnd);
    signal = motor.node;
    signal = applyPan(audioCtx, signal, opts.pan);
    signal.connect(masterBus);

    const bodyNodes = connectSympathetic(audioCtx, amp, masterBus, opts);
    const stopAt = scheduleEnvelope(amp.gain, time, targetGain, opts, plan.articulation);
    const damp = clamp01(numericParamValue(opts.damp, plan.articulation === 'dampen' ? 0.75 : 0));
    const dampSec = clamp(0.055 + damp * 0.28, 0.035, 0.38);

    const active = {
      audioCtx,
      source: src,
      gain: amp,
      targetGain,
      bodyNodes,
      lfos: [motor.lfo, motor.lfoGain].filter(Boolean),
      startedAt: time,
      holdUntil: stopAt,
      dampSec,
      releaseTimer: null,
      stopTimer: null,
      released: false,
      blockId: opts.blockId || 'global',
    };

    _activeVoices.add(active);
    src.onended = () => unregister(active);

    try {
      src.start(time, 0);
      src.stop(Math.min(time + buffer.duration / Math.max(0.001, playbackRate), stopAt + 0.08));
      scheduleRelease(active, stopAt);
      return active;
    } catch (err) {
      unregister(active);
      console.warn('[repl] vibraphone start failed:', err);
      return false;
    }
  }

  function prewarm(audioCtx, notes) {
    if (!audioCtx) return Promise.resolve([]);
    return ready().then(() => {
      if (!manifestReady()) return [];
      const wants = Array.isArray(notes) && notes.length ? notes : ['C3', 'E3', 'G3', 'C4', 'E4', 'G4'];
      const loads = [];
      for (const noteName of wants) {
        const midi = noteNameToMidi(noteName);
        if (!Number.isFinite(midi)) continue;
        const resolved = noteEntryByMidi(midi);
        if (!resolved || !resolved.entry) continue;
        for (const articulation of ['sustain', 'dampen', 'shortsustain', 'bow']) {
          const ae = articulationEntry(resolved.entry, articulation);
          if (ae && ae.entry) loads.push(loadBuffer(audioCtx, ae.entry));
        }
      }
      return Promise.all(loads);
    });
  }

  function playVibraphone(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;

    if (!manifestReady()) {
      loadManifest(_manifestUrl).then(() => prewarm(audioCtx));
      return false;
    }

    const plan = resolvePlan(opts, opts);
    if (!plan) return false;
    const key = bufferKey(plan.sample);
    if (!_buffers.has(key)) {
      loadBuffer(audioCtx, plan.sample).then((buffer) => {
        if (!buffer) return;
        playVibraphone({ ...opts, time: Math.max(audioCtx.currentTime + 0.025, Number(opts.time) || audioCtx.currentTime) });
      });
      return false;
    }

    plan.buffer = _buffers.get(key);
    enforcePolyphony(audioCtx, opts.poly);
    const active = scheduleBar(opts, plan, { chordGainMul: 1 });
    if (active) registerHeldGroup(opts, plan.articulation === 'bow' ? 'bow' : 'note', [active]);
    return Boolean(active);
  }

  function playVibraphoneChord(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;

    if (!manifestReady()) {
      loadManifest(_manifestUrl).then(() => prewarm(audioCtx));
      return false;
    }

    const notes = Array.isArray(opts.notes) ? opts.notes : [];
    const plans = notes.map((note) => resolvePlan(opts, note)).filter(Boolean);
    if (plans.length < 2) return false;

    let allReady = true;
    for (const plan of plans) {
      const key = bufferKey(plan.sample);
      if (!_buffers.has(key)) {
        loadBuffer(audioCtx, plan.sample);
        allReady = false;
        continue;
      }
      plan.buffer = _buffers.get(key);
    }
    if (!allReady) return false;

    enforcePolyphony(audioCtx, opts.poly);
    const sharedHuman = humanize(opts);
    const spread = clamp01(numericParamValue(opts.spread, 0.018));
    const maxSpread = spread * 0.22;
    const chordGainMul = clamp(1 / Math.sqrt(plans.length) * 0.9, 0.34, 0.78);
    const actives = [];

    plans.forEach((plan, index) => {
      const spreadSec = plans.length <= 1 ? 0 : (index / Math.max(1, plans.length - 1)) * maxSpread;
      const active = scheduleBar({ ...opts, freq: plan.targetFreq, midi: plan.targetMidi, sharedHuman, spreadSec }, plan, { chordGainMul });
      if (active) actives.push(active);
    });

    if (actives.length) registerHeldGroup(opts, 'chord', actives);
    return actives.length > 0;
  }

  function stopAll(when) {
    const t = Number.isFinite(Number(when)) ? Number(when) : 0;
    _heldGroupsByBlock.clear();
    for (const active of Array.from(_activeVoices)) stopActive(active, t);
  }

  function status() {
    return {
      loaded: _buffers.size,
      pending: _pendingBuffers.size,
      manifest: _manifest ? _manifest.id : null,
      notes: _manifest && _manifest.noteList ? _manifest.noteList.length : 0,
      active: _activeVoices.size,
      heldGroups: _heldGroupsByBlock.size,
    };
  }

  root.VibraphoneVoice = {
    loadManifest,
    ready,
    prewarm,
    playVibraphone,
    playVibraphoneChord,
    extendLastForBlock,
    releaseLastForBlock,
    stopAll,
    status,
  };
})(window);
