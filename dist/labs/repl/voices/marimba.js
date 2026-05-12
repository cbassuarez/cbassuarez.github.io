console.info('[repl] LOADING voices/marimba.js', new Date().toISOString());
// Iowa Marimba 2012 voice — first-class pitched percussion instrument.
// Local manifest: public/instruments/iowa-marimba/manifest.full.json
// Semantics:
//   note/chord = strike resonant bar(s)
//   ~          = extend ring / defer damping; optional roll continues
//   .          = damp/release current block group

(function (root) {
  'use strict';

  const DEFAULT_MANIFEST_URL =
    (typeof window !== 'undefined' && typeof window.replAudioUrl === 'function')
      ? window.replAudioUrl('instrument-manifest', 'iowa-marimba')
      : './public/instruments/iowa-marimba/manifest.full.json';
  const MALLETS = ['yarn', 'cord', 'rubber'];
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

  function normalizeMallet(v) {
    const lower = String(v || 'yarn').toLowerCase();
    if (lower === 'soft') return 'yarn';
    if (lower === 'medium') return 'cord';
    if (lower === 'hard') return 'rubber';
    return MALLETS.includes(lower) ? lower : 'yarn';
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
      const mallets = rawEntry.mallets && typeof rawEntry.mallets === 'object' ? rawEntry.mallets : {};

      normalizedNotes[note] = {
        ...rawEntry,
        note,
        midi,
        frequency,
        mallets,
      };

      noteList.push({ note, midi, frequency });
    }

    noteList.sort((a, b) => a.midi - b.midi);

    return {
      id: String((data && data.id) || 'iowa-marimba-2012'),
      name: String((data && data.name) || 'Iowa Marimba 2012'),
      source: String((data && data.source) || 'University of Iowa Musical Instrument Samples'),
      instrument: String((data && data.instrument) || 'Marimba'),
      format: data && data.format ? data.format : {},
      mallets: Array.isArray(data && data.mallets) ? data.mallets.slice() : MALLETS.slice(),
      range: data && data.range ? data.range : {},
      notes: normalizedNotes,
      noteList,
      missing: Array.isArray(data && data.missing) ? data.missing.slice() : [],
      fallbackPolicy: String((data && data.fallbackPolicy) || 'nearest-same-mallet-else-nearest-mallet'),
    };
  }

  function loadManifest(url) {
    const targetUrl = url || DEFAULT_MANIFEST_URL;
    if (_manifestPromise && targetUrl === _manifestUrl) return _manifestPromise;

    _manifestUrl = targetUrl;
    _manifestPromise = fetch(targetUrl, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error('marimba manifest http ' + r.status);
        return r.json();
      })
      .then((data) => {
        _manifest = normalizeManifest(data);
        return _manifest;
      })
      .catch((err) => {
        _manifest = normalizeManifest(null);
        console.warn('[repl] marimba manifest load failed:', err);
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

  function malletEntry(noteEntry, requestedMallet) {
    if (!noteEntry || !noteEntry.mallets) return null;

    const mallet = normalizeMallet(requestedMallet);
    if (noteEntry.mallets[mallet]) return { mallet, entry: noteEntry.mallets[mallet] };

    for (const alt of MALLETS) {
      if (noteEntry.mallets[alt]) return { mallet: alt, entry: noteEntry.mallets[alt] };
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
        if (!r.ok) throw new Error('marimba sample http ' + r.status);
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
        console.warn('[repl] marimba sample load failed:', sample.sourceFile || sample.url, err);
        return null;
      });

    _pendingBuffers.set(key, promise);
    return promise;
  }

    function forceGain(force) {
      const named = {
        ppp: 0.22,
        pp: 0.30,
        p: 0.42,
        mp: 0.55,
        mf: 0.72,
        f: 0.90,
        ff: 1.00,
        fff: 1.12,
      };

      if (typeof force === 'string') {
        const lower = force.toLowerCase();
        if (named[lower] != null) return named[lower];
      }

      const f = clamp(numericParamValue(force, 0.72), 0, 1.2);
      return clamp(0.35 + f * 0.82, 0.18, 1.35);
    }

  function humanize(opts) {
    const human = clamp01(numericParamValue(opts.human, 0));
    if (human <= 0) {
      return { timeOffset: 0, gainMul: 1, cents: 0 };
    }

    return {
      timeOffset: randomBetween(-0.020, 0.020) * human,
      gainMul: Math.pow(10, randomBetween(-2.2, 2.2) * human / 20),
      cents: randomBetween(-7, 7) * human,
    };
  }

  function applyTone(audioCtx, signal, opts) {
    const mallet = normalizeMallet(opts.mallet);
    const force = clamp01(numericParamValue(opts.force, 0.72));
    const body = clamp01(numericParamValue(opts.body, 0.35));
    const deadstroke = clamp01(numericParamValue(opts.deadstroke, 0));

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';

      const malletBase = mallet === 'rubber' ? 13500 : mallet === 'cord' ? 9600 : 6200;
      lowpass.frequency.value = clamp(malletBase + force * 3000 - deadstroke * 2200, 1800, 16000);
    lowpass.Q.value = 0.28 + body * 0.55;

    const bodyPeak = audioCtx.createBiquadFilter();
    bodyPeak.type = 'peaking';
    bodyPeak.frequency.value = 260;
    bodyPeak.Q.value = 0.75;
      bodyPeak.gain.value = body * (mallet === 'yarn' ? 6.5 : mallet === 'cord' ? 4.8 : 3.2) - deadstroke * 2.4;

    signal.connect(lowpass);
    lowpass.connect(bodyPeak);
    return bodyPeak;
  }

  function applyPan(audioCtx, signal, panValue) {
    if (!audioCtx.createStereoPanner) return signal;
    const pan = audioCtx.createStereoPanner();
    pan.pan.value = clamp(numericParamValue(panValue, 0), -1, 1);
    signal.connect(pan);
    return pan;
  }

  function scheduleEnvelope(param, time, targetGain, opts) {
    const resonance = clamp01(numericParamValue(opts.resonance, 0.55));
    const release = clamp01(numericParamValue(opts.release, 0.35));
    const deadstroke = clamp01(numericParamValue(opts.deadstroke, 0));
    const decay = Number.isFinite(Number(opts.decay)) ? Number(opts.decay) : 4.2;

    const attack = clamp(0.002 + (1 - clamp01(numericParamValue(opts.force, 0.72))) * 0.006, 0.0015, 0.012);
      const sustain = clamp(decay * (0.18 + resonance * 0.60) * (1 - deadstroke * 0.92), 0.035, 7.5);
      const tail = clamp((0.08 + release * 1.25 + resonance * 0.85) * (1 - deadstroke * 0.72), 0.035, 2.3);

    const t0 = Math.max(0, Number(time) || 0);
    const t1 = t0 + attack;
    const t2 = t0 + sustain;
    const t3 = t2 + tail;

    try {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(0.0001, t0);
      param.linearRampToValueAtTime(targetGain, t1);
      param.exponentialRampToValueAtTime(Math.max(0.0001, targetGain * 0.18), t2);
      param.exponentialRampToValueAtTime(0.0001, t3);
    } catch (_) {
      try { param.value = targetGain; } catch (__) {}
    }

    return t3;
  }

  function connectBody(audioCtx, signal, masterBus, opts) {
    const amount = clamp01(numericParamValue(opts.body, 0.35));
    if (amount <= 0.0001) return [];

    const send = audioCtx.createGain();
    send.gain.value = amount * 0.22;

    const delay = audioCtx.createDelay(0.12);
    delay.delayTime.value = 0.018 + amount * 0.024;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 220 + amount * 180;
    filter.Q.value = 1.15;

    signal.connect(send);
    send.connect(delay);
    delay.connect(filter);
    filter.connect(masterBus);

    return [send, delay, filter];
  }

  function unregister(active) {
    if (!active) return;

    if (active.releaseTimer) {
      clearTimeout(active.releaseTimer);
      active.releaseTimer = null;
    }

    if (active.stopTimer) {
      clearTimeout(active.stopTimer);
      active.stopTimer = null;
    }

    if (active.bodyNodes) {
      for (const node of active.bodyNodes) {
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
    const t = Number.isFinite(Number(when))
      ? Math.max(Number(when), audioCtx ? audioCtx.currentTime : 0)
      : (audioCtx ? audioCtx.currentTime : 0);

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
      } catch (_) {
        try { active.gain.gain.value = 0.0001; } catch (__) {}
      }
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

    active.releaseTimer = setTimeout(() => {
      releaseActive(active, active.holdUntil);
    }, msUntil(active.audioCtx, active.holdUntil));
  }

  function blockKeyFromOpts(opts) {
    return opts && opts.blockId ? opts.blockId : 'global';
  }

  function registerHeldGroup(opts, kind, actives) {
    const blockId = blockKeyFromOpts(opts);
    const liveActives = Array.isArray(actives) ? actives.filter(Boolean) : [];
    if (!liveActives.length) return null;

    const previous = _heldGroupsByBlock.get(blockId);
    if (previous && Array.isArray(previous.actives)) {
      const t = liveActives[0].audioCtx ? liveActives[0].audioCtx.currentTime : 0;
      for (const active of previous.actives) releaseActive(active, t);
    }

    const group = {
      blockId,
      kind,
      actives: liveActives,
      startedAt: Math.min(...liveActives.map((active) => active.startedAt || 0)),
    };

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

    const requestedWhen = Number.isFinite(Number(opts && opts.time))
      ? Number(opts.time)
      : (audioCtx ? audioCtx.currentTime : 0);

    let latestHold = requestedWhen;

    for (const active of group.actives || []) {
      if (!active || active.released) continue;
      if (Number.isFinite(Number(active.holdUntil))) {
        latestHold = Math.max(latestHold, Number(active.holdUntil));
      }
    }

    const when = audioCtx ? Math.max(audioCtx.currentTime, latestHold) : latestHold;

    let released = false;
    for (const active of group.actives || []) {
      released = releaseActive(active, when) || released;
    }

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

    const mallet = malletEntry(resolved.entry, opts.mallet);
    if (!mallet || !mallet.entry) return null;

    const sourceFreq = Number.isFinite(Number(resolved.entry.frequency))
      ? Number(resolved.entry.frequency)
      : midiToFreq(Number(resolved.entry.midi));

    return {
      targetFreq,
      targetMidi,
      sourceFreq,
      exact: resolved.exact,
      noteEntry: resolved.entry,
      mallet: mallet.mallet,
      sample: mallet.entry,
    };
  }

  function scheduleStrike(opts, plan, extra) {
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
    const rollMul = extra && Number.isFinite(Number(extra.rollGainMul)) ? Number(extra.rollGainMul) : 1;
    const targetGain = clamp(numericParamValue(opts.gain, 1) * forceGain(opts.force) * h.gainMul * chordMul * rollMul, 0, 1.7);

    let signal = src;
    signal = applyTone(audioCtx, signal, opts);
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

    const bodyNodes = connectBody(audioCtx, amp, masterBus, opts);
    const stopAt = scheduleEnvelope(amp.gain, time, targetGain, opts);
    const dampSec = clamp(0.05 + clamp01(numericParamValue(opts.deadstroke, 0)) * 0.24, 0.035, 0.35);

    const active = {
      audioCtx,
      source: src,
      gain: amp,
      targetGain,
      bodyNodes,
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
      console.warn('[repl] marimba start failed:', err);
      return false;
    }
  }

  function scheduleRoll(opts, plan, baseActive, chordGainMul) {
    const audioCtx = opts.audioCtx;
    const roll = clamp01(numericParamValue(opts.roll, 0));
    if (!audioCtx || roll <= 0.0001) return [];

    const gateDuration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
      ? Number(opts.gateDuration)
      : Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
        ? Number(opts.eventDuration)
        : 0.75;

      const density = 4 + roll * 18;
      const interval = clamp(1 / density, 0.038, 0.22);
    const start = Number(opts.time) + interval * randomBetween(0.55, 0.9);
    const end = Number(opts.time) + gateDuration;
    const actives = [];

    for (let t = start; t < end; t += interval * randomBetween(0.82, 1.18)) {
      const active = scheduleStrike({
        ...opts,
        time: t,
          force: Math.max(0.06, numericParamValue(opts.force, 0.72) * randomBetween(0.30, 0.58)),
          pan: clamp(numericParamValue(opts.pan, 0) + randomBetween(-0.06, 0.06), -1, 1),
      }, plan, {
        chordGainMul,
          rollGainMul: clamp(0.16 + roll * 0.26, 0.14, 0.44),
      });

      if (active) actives.push(active);
    }

    if (baseActive) actives.unshift(baseActive);
    return actives;
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
        const me = malletEntry(resolved.entry, 'yarn');
        if (me && me.entry) loads.push(loadBuffer(audioCtx, me.entry));
      }

      return Promise.all(loads);
    });
  }

  function playMarimba(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;

    function scheduleResolvedPlan(plan, timeOverride) {
      if (!plan || !plan.buffer) return false;
      enforcePolyphony(audioCtx, opts.poly);
      const scheduledOpts = Number.isFinite(Number(timeOverride))
        ? { ...opts, time: Math.max(audioCtx.currentTime, Number(timeOverride)) }
        : opts;
      const baseActive = scheduleStrike(scheduledOpts, plan, { chordGainMul: 1, rollGainMul: 1 });
      if (!baseActive) return false;
      const actives = scheduleRoll(scheduledOpts, plan, baseActive, 1);
      registerHeldGroup(scheduledOpts, 'note', actives.length ? actives : [baseActive]);
      return true;
    }

    function resolveAndScheduleAfterLoad() {
      const plan = resolvePlan(opts, opts);
      if (!plan) return false;
      return loadBuffer(audioCtx, plan.sample).then((buffer) => {
        if (!buffer) return false;
        plan.buffer = buffer;
        return scheduleResolvedPlan(plan, audioCtx.currentTime + 0.035);
      });
    }

    if (!manifestReady()) {
      loadManifest(_manifestUrl).then(resolveAndScheduleAfterLoad);
      return false;
    }

    const plan = resolvePlan(opts, opts);
    if (!plan) return false;

    const key = bufferKey(plan.sample);
    if (!_buffers.has(key)) {
      loadBuffer(audioCtx, plan.sample).then((buffer) => {
        if (!buffer) return;
        plan.buffer = buffer;
        scheduleResolvedPlan(plan, audioCtx.currentTime + 0.035);
      });
      return false;
    }

    plan.buffer = _buffers.get(key);
    return scheduleResolvedPlan(plan, null);
  }

  function playMarimbaChord(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;

    const notes = Array.isArray(opts.notes) ? opts.notes : [];
    if (notes.length < 2) return false;

    function schedulePlans(plans, timeOverride) {
      if (!Array.isArray(plans) || plans.length < 2) return false;
      enforcePolyphony(audioCtx, opts.poly);

      const scheduledOpts = Number.isFinite(Number(timeOverride))
        ? { ...opts, time: Math.max(audioCtx.currentTime, Number(timeOverride)) }
        : opts;
      const sharedHuman = humanize(scheduledOpts);
      const spread = clamp01(numericParamValue(scheduledOpts.spread, 0.012));
      const maxSpread = spread * 0.18;
      const chordGainMul = clamp(1 / Math.sqrt(plans.length) * 0.9, 0.34, 0.78);
      const actives = [];

      plans.forEach((plan, index) => {
        const spreadSec = plans.length <= 1 ? 0 : (index / Math.max(1, plans.length - 1)) * maxSpread;
        const baseActive = scheduleStrike({
          ...scheduledOpts,
          freq: plan.targetFreq,
          midi: plan.targetMidi,
          sharedHuman,
          spreadSec,
        }, plan, { chordGainMul, rollGainMul: 1 });

        if (baseActive) {
          actives.push(...scheduleRoll({
            ...scheduledOpts,
            freq: plan.targetFreq,
            midi: plan.targetMidi,
            sharedHuman,
            spreadSec,
          }, plan, baseActive, chordGainMul));
        }
      });

      if (actives.length) registerHeldGroup(scheduledOpts, 'chord', actives);
      return actives.length > 0;
    }

    function resolvePlans() {
      return notes.map((note) => resolvePlan(opts, note)).filter(Boolean);
    }

    function loadPlansAndSchedule() {
      const plans = resolvePlans();
      if (plans.length < 2) return false;
      return Promise.all(plans.map((plan) => loadBuffer(audioCtx, plan.sample))).then((buffers) => {
        let ready = true;
        plans.forEach((plan, index) => {
          if (!buffers[index]) ready = false;
          plan.buffer = buffers[index];
        });
        if (!ready) return false;
        return schedulePlans(plans, audioCtx.currentTime + 0.035);
      });
    }

    if (!manifestReady()) {
      loadManifest(_manifestUrl).then(loadPlansAndSchedule);
      return false;
    }

    const plans = resolvePlans();
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

    if (!allReady) {
      Promise.all(plans.map((plan) => loadBuffer(audioCtx, plan.sample))).then((buffers) => {
        let ready = true;
        plans.forEach((plan, index) => {
          if (!buffers[index]) ready = false;
          plan.buffer = buffers[index];
        });
        if (ready) schedulePlans(plans, audioCtx.currentTime + 0.035);
      });
      return false;
    }

    return schedulePlans(plans, null);
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

    root.MarimbaVoice = {
      loadManifest,
      ready,
      prewarm,
      playMarimba,
      playMarimbaChord,
      extendLastForBlock,
      releaseLastForBlock,
      stopAll,
      status,
    };
  })(window);
console.info('[repl] DONE voices/marimba.js; window.MarimbaVoice =', window.MarimbaVoice);
