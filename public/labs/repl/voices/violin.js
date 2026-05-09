// Iowa Violin voice — first-class sampled string instrument for seb's REPL.
// Uses a generated local manifest at public/instruments/iowa-violin/manifest.full.json.
// Iowa MIS Violin ships only ff samples (no pp/mf layers), but four strings
// (sul G/D/A/E) and two articulations (arco, pizz). This voice synthesizes pp/mf
// from the single ff layer via filter + gain shaping, loops the steady-state
// region of arco samples for indefinite sustain, drives bow tone via highshelf,
// and adds vibrato, tremolo, body resonance, sympathetic open-string ringing,
// portamento, and humanization.

(function (root) {
  'use strict';

  const DEFAULT_MANIFEST_URL = './public/instruments/iowa-violin/manifest.full.json';
  const ARTICULATIONS = ['arco', 'pizz'];
  const STRINGS_HIGH_TO_LOW = ['E', 'A', 'D', 'G'];
  const DEFAULT_MAX_VOICES = 32;
  const MAX_BODY_VOICES = 24;
  const TRANSIENT_PROTECT_S = 0.012;
  const SIBLING_WINDOW_S = 0.040;
  const SIBLING_TRACK_LIMIT = 16;
    

  const _buffers = new Map();
  const _pendingBuffers = new Map();
  const _activeVoices = new Set();
  const _bodyVoices = new Set();
  const _recentByBlock = new Map();
    const _heldByKey = new Map();
    const _heldGroupsByBlock = new Map();
    let _chordCounter = 0;

  let _manifest = null;
  let _manifestUrl = DEFAULT_MANIFEST_URL;
  let _manifestPromise = null;

  function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return n < lo ? lo : n > hi ? hi : n;
  }

  function clamp01(v) { return clamp(v, 0, 1); }

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

  function randomBetween(lo, hi) { return lo + Math.random() * (hi - lo); }

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

  function absoluteUrl(baseUrl, relUrl) {
    try {
      return new URL(relUrl, new URL(baseUrl, window.location.href)).toString();
    } catch (_) {
      return relUrl;
    }
  }

  function normalizeArticulation(value) {
    const s = String(value || '').toLowerCase().trim();
    if (s === 'arco' || s === 'bow' || s === 'bowed') return 'arco';
    if (s === 'pizz' || s === 'pizzicato' || s === 'pluck') return 'pizz';
    return null;
  }

  function normalizeString(value) {
    const s = String(value || '').toUpperCase().trim();
    if (s === 'G' || s === 'D' || s === 'A' || s === 'E') return s;
    if (s === 'SULG' || s === 'SUL G') return 'G';
    if (s === 'SULD' || s === 'SUL D') return 'D';
    if (s === 'SULA' || s === 'SUL A') return 'A';
    if (s === 'SULE' || s === 'SUL E') return 'E';
    return null;
  }

  function normalizeManifest(data) {
    const samples = data && data.samples && typeof data.samples === 'object' ? data.samples : {};
    const normalized = { arco: { G: [], D: [], A: [], E: [] }, pizz: { G: [], D: [], A: [], E: [] } };
    const flatByArtic = { arco: [], pizz: [] };

    for (const artic of ARTICULATIONS) {
      const byString = samples[artic] && typeof samples[artic] === 'object' ? samples[artic] : {};
      for (const str of STRINGS_HIGH_TO_LOW) {
        const byNote = byString[str] && typeof byString[str] === 'object' ? byString[str] : {};
        const list = [];
        for (const [note, raw] of Object.entries(byNote)) {
          if (!raw || !raw.url) continue;
          const midi = Number.isFinite(Number(raw.midi)) ? Number(raw.midi) : noteNameToMidi(note);
          if (!Number.isFinite(midi)) continue;
          const frequency = Number.isFinite(Number(raw.frequency)) ? Number(raw.frequency) : midiToFreq(midi);
          const sampleRate = Number.isFinite(Number(raw.sampleRate)) ? Number(raw.sampleRate) : 44100;
          const entry = {
            note,
            midi,
            frequency,
            url: String(raw.url),
            sourceFile: raw.sourceFile || null,
            sampleRate,
            articulation: artic,
            string: str,
            loopStartSample: artic === 'arco' && Number.isFinite(Number(raw.loopStartSample)) ? Number(raw.loopStartSample) : null,
            loopEndSample: artic === 'arco' && Number.isFinite(Number(raw.loopEndSample)) ? Number(raw.loopEndSample) : null,
          };
          list.push(entry);
          flatByArtic[artic].push(entry);
        }
        list.sort((a, b) => a.midi - b.midi);
        normalized[artic][str] = list;
      }
      flatByArtic[artic].sort((a, b) => a.midi - b.midi);
    }

    return {
      id: String((data && data.id) || 'iowa-violin'),
      name: String((data && data.name) || 'Iowa Violin'),
      source: String((data && data.source) || 'University of Iowa Musical Instrument Samples'),
      instrument: String((data && data.instrument) || 'Solo violin'),
      format: data && data.format ? data.format : {},
      license: data && data.license ? data.license : {},
      articulations: ARTICULATIONS.slice(),
      strings: STRINGS_HIGH_TO_LOW.slice(),
      openStrings: data && data.openStrings ? data.openStrings : { G: 55, D: 62, A: 69, E: 76 },
      range: data && data.range ? data.range : {},
      missing: Array.isArray(data && data.missing) ? data.missing.slice() : [],
      samples: normalized,
      flat: flatByArtic,
    };
  }

  function loadManifest(url) {
    const targetUrl = url || DEFAULT_MANIFEST_URL;
    if (_manifestPromise && targetUrl === _manifestUrl) return _manifestPromise;

    _manifestUrl = targetUrl;
    _manifestPromise = fetch(targetUrl, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error('violin manifest http ' + r.status);
        return r.json();
      })
      .then((data) => {
        _manifest = normalizeManifest(data);
        return _manifest;
      })
      .catch((err) => {
        _manifest = normalizeManifest(null);
        console.warn('[repl] violin manifest load failed:', err);
        return _manifest;
      });

    return _manifestPromise;
  }

  function ready() { return loadManifest(_manifestUrl); }

  function manifestReady() {
    if (!_manifest) return false;
    return Boolean(_manifest.flat && (_manifest.flat.arco.length || _manifest.flat.pizz.length));
  }

  // -------------------- string + sample resolution --------------------

  function stringSupportsMidi(string, midi) {
    if (!_manifest) return false;
    const list = _manifest.samples.arco[string] || [];
    if (!list.length) return false;
    const lo = list[0].midi - 1;
    const hi = list[list.length - 1].midi + 1;
    return midi >= lo && midi <= hi;
  }

  function autoPickString(midi, blockId) {
    if (!_manifest) return 'A';

    const candidates = STRINGS_HIGH_TO_LOW.filter((s) => stringSupportsMidi(s, midi));
    if (!candidates.length) return 'G';

    // Prefer string not used in the last sibling window (helps double-stops choose distinct strings).
    const recents = _recentByBlock.get(blockId) || [];
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : Date.now() / 1000;
    const stale = now - SIBLING_WINDOW_S;
    const busy = new Set(recents.filter((r) => r.t >= stale).map((r) => r.string));

    for (const s of candidates) {
      if (!busy.has(s)) return s;
    }
    // All candidates busy: still pick the highest available.
    return candidates[0];
  }

    function heldKey(opts, midi, string, articulation) {
      return [
        opts && opts.blockId ? opts.blockId : 'global',
        articulation || 'arco',
        string || 'auto',
        Math.round(Number(midi)),
      ].join(':');
    }

    function heldPrefix(opts, midi, articulation) {
      return [
        opts && opts.blockId ? opts.blockId : 'global',
        articulation || 'arco',
        '',
        Math.round(Number(midi)),
      ];
    }

    function findHeldActive(opts, midi, articulation, preferredString) {
      const exactString = normalizeString(preferredString);
      if (exactString) {
        const exactKey = heldKey(opts, midi, exactString, articulation);
        const exact = _heldByKey.get(exactKey);
        if (exact) return exact;
      }

      const blockId = opts && opts.blockId ? opts.blockId : 'global';
      const midiRounded = Math.round(Number(midi));

      for (const active of _heldByKey.values()) {
        if (!active) continue;
        if (active.blockId !== blockId) continue;
        if (active.articulation !== articulation) continue;
        if (Math.round(Number(active.targetMidi)) !== midiRounded) continue;
        return active;
      }

      return null;
    }

    function clearReleaseTimer(active) {
      if (!active) return;
      if (active.releaseTimer) {
        clearTimeout(active.releaseTimer);
        active.releaseTimer = null;
      }
      if (active.loopTimer) {
        clearTimeout(active.loopTimer);
        active.loopTimer = null;
      }
      if (active.stopTimer) {
        clearTimeout(active.stopTimer);
        active.stopTimer = null;
      }
    }

    function msUntil(audioCtx, audioTime) {
      if (!audioCtx) return 0;
      return Math.max(0, (Number(audioTime) - audioCtx.currentTime) * 1000);
    }

    function releaseActive(active, when) {
      if (!active || active.released) return false;

      const audioCtx = active.audioCtx;
      const t = Number.isFinite(Number(when))
        ? Math.max(Number(when), audioCtx ? audioCtx.currentTime : 0)
        : (audioCtx ? audioCtx.currentTime : 0);

      active.released = true;
      clearReleaseTimer(active);

      if (active.source && active.hasLoop) {
        active.loopTimer = setTimeout(() => {
          try { active.source.loop = false; } catch (_) {}
        }, msUntil(audioCtx, t));
      }

      if (active.gain && active.gain.gain) {
        try {
            const current = Math.max(0.0001, active.gain.gain.value || active.targetGain || 0.0001);
          active.gain.gain.cancelScheduledValues(t);
          active.gain.gain.setValueAtTime(current, t);
          active.gain.gain.exponentialRampToValueAtTime(0.0001, t + active.releaseSec);
        } catch (_) {
          try { active.gain.gain.value = 0.0001; } catch (__) {}
        }
      }

      if (active.source) {
        try { active.source.stop(t + active.releaseSec + 0.05); } catch (_) {}
      }

      if (active.heldKey && _heldByKey.get(active.heldKey) === active) {
        _heldByKey.delete(active.heldKey);
      }

      return true;
    }

    function scheduleHeldRelease(active, until) {
      if (!active || !active.audioCtx) return;

      const audioCtx = active.audioCtx;
      const holdUntil = Number.isFinite(Number(until)) ? Number(until) : audioCtx.currentTime;

      // Never shorten a held bowed state.
      active.holdUntil = Math.max(active.holdUntil || 0, holdUntil);

      if (active.releaseTimer) clearTimeout(active.releaseTimer);

      active.releaseTimer = setTimeout(() => {
        releaseActive(active, active.holdUntil);
      }, msUntil(audioCtx, active.holdUntil));
    }

    function extendActive(active, until) {
      if (!active || active.released) return false;
      scheduleHeldRelease(active, until);
      return true;
    }
    
    function blockKeyFromOpts(opts) {
      return opts && opts.blockId ? opts.blockId : 'global';
    }

    function unregisterHeldGroupForBlock(blockId) {
      const key = blockId || 'global';
      _heldGroupsByBlock.delete(key);
    }

    function releaseHeldGroup(group, when) {
      if (!group || !Array.isArray(group.actives)) return false;

      let released = false;

      for (const active of group.actives) {
        if (!active || active.released) continue;
        released = releaseActive(active, when) || released;
      }

      return released;
    }

    function registerHeldGroup(opts, kind, actives) {
      const blockId = blockKeyFromOpts(opts);
      const liveActives = Array.isArray(actives)
        ? actives.filter((active) => active && !active.released)
        : [];

      if (!liveActives.length) return null;

      const previous = _heldGroupsByBlock.get(blockId);
        if (previous && previous.actives && previous.actives.length) {
          const t = liveActives[0] && liveActives[0].audioCtx
            ? liveActives[0].audioCtx.currentTime
            : 0;

          releaseHeldGroup(previous, t);
        }

      const group = {
        blockId,
        kind: kind || 'note',
        actives: liveActives,
        startedAt: Math.min(...liveActives.map((active) => active.startedAt || 0)),
      };

      for (const active of liveActives) {
        active.heldGroupBlockId = blockId;
      }

      _heldGroupsByBlock.set(blockId, group);
      return group;
    }

    function deleteActiveFromHeldGroups(active) {
      if (!active || !active.heldGroupBlockId) return;

      const group = _heldGroupsByBlock.get(active.heldGroupBlockId);
      if (!group || !Array.isArray(group.actives)) return;

      group.actives = group.actives.filter((candidate) => candidate && candidate !== active && !candidate.released);

      if (!group.actives.length) {
        _heldGroupsByBlock.delete(active.heldGroupBlockId);
      }
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
        extended = extendActive(active, until) || extended;
      }

      if (!group.actives.length) {
        _heldGroupsByBlock.delete(blockId);
      }

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

      if (Array.isArray(group.actives)) {
        for (const active of group.actives) {
          if (!active || active.released) continue;
          if (Number.isFinite(Number(active.holdUntil))) {
            latestHold = Math.max(latestHold, Number(active.holdUntil));
          }
        }
      }

      const when = audioCtx
        ? Math.max(audioCtx.currentTime, latestHold)
        : latestHold;

      const released = releaseHeldGroup(group, when);
      _heldGroupsByBlock.delete(blockId);
      return released;
    }

    function playableStringsForMidi(midi) {
      return STRINGS_HIGH_TO_LOW.filter((str) => stringSupportsMidi(str, midi));
    }

    function stringAdjacencyScore(strings) {
      const lowToHigh = ['G', 'D', 'A', 'E'];
      const indexes = strings
        .map((str) => lowToHigh.indexOf(str))
        .filter((idx) => idx >= 0)
        .sort((a, b) => a - b);

      if (indexes.length < 2) return 0;

      let span = indexes[indexes.length - 1] - indexes[0];
      let gaps = 0;
      for (let i = 1; i < indexes.length; i++) {
        gaps += Math.max(0, indexes[i] - indexes[i - 1] - 1);
      }

      return span * 8 + gaps * 4;
    }

    function chooseChordPlans(articulation, notes, explicitString) {
      const requestedString = normalizeString(explicitString);
      const normalized = notes
        .map((note, index) => {
          const targetFreq = Number(note.freq);
          const targetMidi = Number.isFinite(Number(note.midi))
            ? Math.round(Number(note.midi))
            : Math.round(69 + 12 * Math.log2(targetFreq / 440));

          if (!Number.isFinite(targetFreq) || !Number.isFinite(targetMidi)) return null;

          const candidateStrings = requestedString
            ? [requestedString]
            : playableStringsForMidi(targetMidi);

          const candidates = candidateStrings
            .map((str) => {
              const entry = resolveSampleEntry(articulation, str, targetMidi);
              if (!entry) return null;
              return {
                note,
                index,
                targetFreq,
                targetMidi,
                string: entry.string,
                entry,
                distance: Math.abs(Number(entry.midi) - targetMidi),
              };
            })
            .filter(Boolean);

          return {
            note,
            index,
            targetFreq,
            targetMidi,
            candidates,
          };
        })
        .filter(Boolean);

      if (normalized.length < 2) return [];

      let best = null;

      function visit(i, usedStrings, chosen) {
        if (i >= normalized.length) {
          const strings = chosen.map((p) => p.string);
          const distanceScore = chosen.reduce((sum, p) => sum + p.distance, 0);
          const score = distanceScore * 10 + stringAdjacencyScore(strings);

          if (!best || score < best.score) {
            best = { score, chosen: chosen.slice() };
          }

          return;
        }

        const item = normalized[i];
        for (const candidate of item.candidates) {
          if (usedStrings.has(candidate.string)) continue;
          usedStrings.add(candidate.string);
          chosen.push(candidate);
          visit(i + 1, usedStrings, chosen);
          chosen.pop();
          usedStrings.delete(candidate.string);
        }
      }

      visit(0, new Set(), []);

      if (best && best.chosen.length === normalized.length) {
        return best.chosen;
      }

      // Fallback: if the requested voicing is physically overfull/impossible,
      // still schedule sound, but prefer distinct strings as much as possible.
      const fallback = [];
      const used = new Set();

      for (const item of normalized) {
        const distinct = item.candidates.find((candidate) => !used.has(candidate.string));
        const chosen = distinct || item.candidates[0];
        if (chosen) {
          used.add(chosen.string);
          fallback.push(chosen);
        }
      }

      return fallback;
    }
    
  function recordRecentString(blockId, string) {
    if (blockId == null) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : Date.now() / 1000;
    let arr = _recentByBlock.get(blockId);
    if (!arr) { arr = []; _recentByBlock.set(blockId, arr); }
    arr.push({ string, t: now });
    if (arr.length > SIBLING_TRACK_LIMIT) arr.splice(0, arr.length - SIBLING_TRACK_LIMIT);
  }

  function nearestEntryInList(list, targetMidi, maxDist) {
    let best = null;
    let bestDist = Infinity;
    for (const e of list) {
      const d = Math.abs(e.midi - targetMidi);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    if (!best) return null;
    if (Number.isFinite(maxDist) && bestDist > maxDist) return null;
    return best;
  }

  function resolveSampleEntry(articulation, preferredString, midi) {
    if (!manifestReady()) return null;

    // 1. Exact (artic, preferredString, midi)
    if (preferredString) {
      const list = _manifest.samples[articulation][preferredString] || [];
      const exact = list.find((e) => e.midi === midi);
      if (exact) return exact;
    }

    // 2. Exact (artic, *, midi) — keep articulation, lose preferred string
    const flat = _manifest.flat[articulation] || [];
    const flatExact = flat.find((e) => e.midi === midi);
    if (flatExact) return flatExact;

    // 3. Nearest (artic, preferredString, midi) within ±2 semitones
    if (preferredString) {
      const list = _manifest.samples[articulation][preferredString] || [];
      const near = nearestEntryInList(list, midi, 2);
      if (near) return near;
    }

    // 4. Nearest (artic, *, midi)
    return nearestEntryInList(flat, midi, Infinity);
  }

  function bufferKey(entry) { return entry && entry.url ? entry.url : ''; }

  function loadBuffer(audioCtx, entry) {
    if (!audioCtx || !entry || !entry.url) return Promise.resolve(null);
    const key = bufferKey(entry);
    if (_buffers.has(key)) return Promise.resolve(_buffers.get(key));
    if (_pendingBuffers.has(key)) return _pendingBuffers.get(key);

    const url = absoluteUrl(_manifestUrl, entry.url);
    const promise = fetch(url, { credentials: 'omit' })
      .then((r) => { if (!r.ok) throw new Error('violin sample http ' + r.status); return r.arrayBuffer(); })
      .then((bytes) => audioCtx.decodeAudioData(bytes))
      .then((buffer) => {
        _buffers.set(key, buffer);
        _pendingBuffers.delete(key);
        return buffer;
      })
      .catch((err) => {
        _pendingBuffers.delete(key);
        console.warn('[repl] violin sample load failed:', entry.sourceFile || entry.url, err);
        return null;
      });

    _pendingBuffers.set(key, promise);
    return promise;
  }

  // -------------------- tone shaping --------------------

  function applyDynamicsAndTone(audioCtx, signal, opts) {
    const force = clamp01(numericParamValue(opts.force, 0.7));
    const bow = clamp01(numericParamValue(opts.bow, 0.5));

    // Synthesize pp→ff: lowpass darkening + bow-noise highpass + bow position highshelf.
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = clamp(1500 + Math.pow(force, 0.85) * 12500, 1200, 16000);
    lowpass.Q.value = 0.5;

    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = clamp(90 - force * 70, 20, 120);
    highpass.Q.value = 0.5;

    const tilt = audioCtx.createBiquadFilter();
    tilt.type = 'highshelf';
    tilt.frequency.value = 3000;
    // bow=0 (sul tasto) softens highs; bow=1 (sul ponticello) brightens.
    tilt.gain.value = (bow - 0.5) * 8.0;

    signal.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(tilt);
    return tilt;
  }

  function applyPan(audioCtx, signal, panValue) {
    if (!audioCtx.createStereoPanner) return signal;
    const pan = audioCtx.createStereoPanner();
    pan.pan.value = clamp(numericParamValue(panValue, 0), -1, 1);
    signal.connect(pan);
    return pan;
  }

  // -------------------- envelopes --------------------

  function scheduleArcoGain(param, time, target, attack, hold, release) {
    const t0 = Math.max(0, Number(time) || 0);
    const a = Math.max(0.001, attack);
    const h = Math.max(a + 0.001, hold);
    const r = Math.max(0.030, release);
    const stop = t0 + h + r;
    try {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(0.0001, t0);
      param.linearRampToValueAtTime(target, t0 + a);
      param.setValueAtTime(target, t0 + h);
      param.exponentialRampToValueAtTime(0.0001, stop);
    } catch (_) {
      try { param.value = target; } catch (__) {}
    }
    return stop;
  }

  function schedulePizzGain(param, time, target, decaySec) {
    const t0 = Math.max(0, Number(time) || 0);
    const a = 0.0028;
    const stop = t0 + Math.max(0.10, decaySec);
    try {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(0.0001, t0);
      param.linearRampToValueAtTime(target, t0 + a);
      param.exponentialRampToValueAtTime(0.0001, stop);
    } catch (_) {
      try { param.value = target; } catch (__) {}
    }
    return stop;
  }

  // -------------------- modulation: vibrato, tremolo --------------------

  function attachVibrato(audioCtx, src, opts, time, gateEnd, basePlaybackRate) {
    const depthNorm = clamp01(numericParamValue(opts.vibrato, 0));
    if (depthNorm <= 0.0001) return null;

    const rate = clamp(numericParamValue(opts.vibratoRate, 5.5), 1, 12);
    const onsetFrac = clamp01(numericParamValue(opts.vibratoOnset, 0.25));
    const peakCents = depthNorm * 35; // 0–35¢
    // playbackRate offset for ±peakCents
    const depthRate = basePlaybackRate * (Math.pow(2, peakCents / 1200) - 1);

    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0;

    const onsetEnd = Math.min(gateEnd, time + Math.max(0.05, (gateEnd - time) * onsetFrac));
    try {
      lfoGain.gain.setValueAtTime(0, time);
      lfoGain.gain.linearRampToValueAtTime(depthRate, onsetEnd);
      lfoGain.gain.setValueAtTime(depthRate, gateEnd);
    } catch (_) { lfoGain.gain.value = depthRate; }

    lfo.connect(lfoGain);
    try { lfoGain.connect(src.playbackRate); } catch (_) {}

    try { lfo.start(time); } catch (_) {}
    try { lfo.stop(gateEnd + 0.5); } catch (_) {}

    return { lfo, lfoGain };
  }

  function attachTremolo(audioCtx, signal, opts, time, gateEnd) {
    const depth = clamp01(numericParamValue(opts.tremolo, 0));
    if (depth <= 0.0001) return { node: signal, lfo: null, lfoGain: null };

    const rate = clamp(numericParamValue(opts.tremoloRate, 10), 4, 24);
    const tremGain = audioCtx.createGain();
    tremGain.gain.value = 1; // base passthrough; LFO adds ±depth*0.5

    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = depth * 0.5;

    lfo.connect(lfoGain);
    try { lfoGain.connect(tremGain.gain); } catch (_) {}

    signal.connect(tremGain);

    try { lfo.start(time); } catch (_) {}
    try { lfo.stop(gateEnd + 0.5); } catch (_) {}

    return { node: tremGain, lfo, lfoGain };
  }

  // -------------------- body + sympathetic resonance --------------------

  function connectBodyResonance(audioCtx, drySignal, masterBus, opts) {
    const amount = clamp01(numericParamValue(opts.wood, 0));
    if (amount <= 0.0001) return [];

    const send = audioCtx.createGain();
    send.gain.value = amount * 0.22;

    const air = audioCtx.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = 280;
    air.Q.value = 4.5;

    const wood = audioCtx.createBiquadFilter();
    wood.type = 'bandpass';
    wood.frequency.value = 470;
    wood.Q.value = 5.0;

    const bridge = audioCtx.createBiquadFilter();
    bridge.type = 'bandpass';
    bridge.frequency.value = 1320;
    bridge.Q.value = 3.0;

    drySignal.connect(send);
    send.connect(air);
    send.connect(wood);
    send.connect(bridge);
    air.connect(masterBus);
    wood.connect(masterBus);
    bridge.connect(masterBus);

    return [send, air, wood, bridge];
  }

  function connectSympathetic(audioCtx, drySignal, masterBus, opts) {
    const amount = clamp01(numericParamValue(opts.sympathetic, 0));
    if (amount <= 0.0001) return [];

    const send = audioCtx.createGain();
    send.gain.value = amount * 0.18;

    const delay = audioCtx.createDelay(0.12);
    delay.delayTime.value = 0.022;

    const openFreqs = [196.0, 293.7, 440.0, 659.3];
    const filters = [];
    drySignal.connect(send);
    send.connect(delay);
    for (const f of openFreqs) {
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 18;
      delay.connect(bp);
      bp.connect(masterBus);
      filters.push(bp);
    }

    return [send, delay, ...filters];
  }

  // -------------------- voice lifecycle --------------------

    function unregister(active) {
      if (!active) return;

      clearReleaseTimer(active);

      if (active.heldKey && _heldByKey.get(active.heldKey) === active) {
        _heldByKey.delete(active.heldKey);
      }
        
        deleteActiveFromHeldGroups(active);

      if (active.bodyNodes) {
        for (const node of active.bodyNodes) {
          try { node.disconnect(); } catch (_) {}
        }
      }

      if (active.lfos) {
        for (const lfo of active.lfos) {
          if (!lfo) continue;
          try { lfo.disconnect(); } catch (_) {}
        }
      }

      _activeVoices.delete(active);
      _bodyVoices.delete(active);
    }

    function stopActive(active, when) {
      if (!active) return;
      if (releaseActive(active, when)) return;

      const t = Number.isFinite(Number(when)) ? Number(when) : 0;

      if (active.gain && active.gain.gain) {
        try {
          const cur = Math.max(0.0001, active.gain.gain.value || 0.0001);
          active.gain.gain.cancelScheduledValues(t);
          active.gain.gain.setValueAtTime(cur, t);
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
    const limit = clamp(Math.round(Number(maxVoices) || DEFAULT_MAX_VOICES), 4, 96);
    while (_activeVoices.size >= limit) {
      let victim = null;
      for (const v of _activeVoices) {
        if (!victim) { victim = v; continue; }
        if ((v.released && !victim.released) || v.startedAt < victim.startedAt) victim = v;
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

  function humanize(opts) {
    const human = clamp01(numericParamValue(opts.human, 0));
    if (human <= 0) {
      return { timeOffset: 0, gainMul: 1, cents: 0, vibratoJitter: 0 };
    }
    return {
      timeOffset: randomBetween(-0.015, 0.015) * human,
      gainMul: Math.pow(10, randomBetween(-1.5, 1.5) * human / 20),
      cents: randomBetween(-5, 5) * human,
      vibratoJitter: randomBetween(-0.15, 0.15) * human,
    };
  }

  function dynamicsGainMul(force) {
    const f = clamp01(force);
    // ~−18 dB at f=0, 0 dB at f=1, with a slightly compressed mid.
    return Math.max(0.05, Math.pow(f, 1.4) * 0.87 + 0.13);
  }

  // -------------------- core scheduler --------------------

    function scheduleArcoHoldGain(param, time, target, attack) {
      const t0 = Math.max(0, Number(time) || 0);
      const a = Math.max(0.004, Number(attack) || 0.04);

      try {
        param.cancelScheduledValues(t0);
        param.setValueAtTime(0.0001, t0);
        param.linearRampToValueAtTime(target, t0 + a);
        param.setValueAtTime(target, t0 + a + 0.001);
      } catch (_) {
        try { param.value = target; } catch (__) {}
      }
    }

    function scheduleNote(opts, plan) {
      const audioCtx = opts.audioCtx;
      const masterBus = opts.masterBus;
      const buffer = plan.buffer;
      const entry = plan.entry;
      if (!audioCtx || !masterBus || !buffer || !entry) return false;

      const articulation = plan.articulation;
      const h = opts.sharedHuman || humanize(opts);
      const time = Math.max(audioCtx.currentTime, Number(opts.time) + h.timeOffset);
      const force = clamp01(numericParamValue(opts.force, 0.7));
      const gainParam = clamp(numericParamValue(opts.gain, 1), 0, 1.5);
      const releaseParam = clamp01(numericParamValue(opts.release, 0.25));
      const chordGainMul = Number.isFinite(Number(opts.chordGainMul)) ? Number(opts.chordGainMul) : 1;

      const targetFreq = plan.targetFreq;
      const targetMidi = Number.isFinite(Number(plan.targetMidi))
        ? Math.round(Number(plan.targetMidi))
        : Math.round(69 + 12 * Math.log2(targetFreq / 440));

      const sourceFreq = entry.frequency || midiToFreq(entry.midi);
      const cents = h.cents;
      const basePlaybackRate = (targetFreq / sourceFreq) * Math.pow(2, cents / 1200);

      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = clamp(basePlaybackRate, 0.125, 8);

      const sr = entry.sampleRate || buffer.sampleRate || 44100;
      const hasLoop = articulation === 'arco'
        && Number.isFinite(Number(entry.loopStartSample))
        && Number.isFinite(Number(entry.loopEndSample))
        && entry.loopEndSample > entry.loopStartSample;

      if (hasLoop) {
        src.loop = true;
        src.loopStart = entry.loopStartSample / sr;
        src.loopEnd = entry.loopEndSample / sr;
      } else {
        src.loop = false;
      }

      const amp = audioCtx.createGain();
      amp.gain.value = 0.0001;

      const dyn = dynamicsGainMul(force);
      const targetGain = clamp(gainParam * dyn * h.gainMul * chordGainMul, 0, 1.5);

      let signal = src;
      signal = applyDynamicsAndTone(audioCtx, signal, opts);
      signal.connect(amp);
      signal = amp;

      const gateDuration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
        ? Number(opts.gateDuration)
        : Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
          ? Number(opts.eventDuration)
          : (articulation === 'pizz' ? 0.6 : 1.0);

      const gateEnd = time + gateDuration;

      const trem = attachTremolo(audioCtx, signal, opts, time, gateEnd);
      signal = trem.node;

      if (root.ReplCrush && root.ReplCrush.connect) {
        signal = root.ReplCrush.connect(audioCtx, signal, {
          crush: opts.crush,
          resolution: opts.resolution,
        });
      }

      signal = applyPan(audioCtx, signal, opts.pan);
      signal.connect(masterBus);

      const glideSec = Number(opts.glideSec) || 0;
      const freqStart = Number(opts.freqStart);
      const freqEnd = Number(opts.freqEnd);

      if (glideSec > 0 && Number.isFinite(freqStart) && Number.isFinite(freqEnd) && freqStart > 0 && freqEnd > 0) {
        try {
          const startRate = (freqStart / sourceFreq) * Math.pow(2, cents / 1200);
          const endRate = (freqEnd / sourceFreq) * Math.pow(2, cents / 1200);
          src.playbackRate.cancelScheduledValues(time);
          src.playbackRate.setValueAtTime(clamp(startRate, 0.125, 8), time);
          src.playbackRate.linearRampToValueAtTime(clamp(endRate, 0.125, 8), time + glideSec);
        } catch (_) {}
      }

      const vib = articulation === 'arco'
        ? attachVibrato(audioCtx, src, opts, time, gateEnd, basePlaybackRate)
        : null;

      const dryForResonance = amp;
      const bodyNodes = connectBodyResonance(audioCtx, dryForResonance, masterBus, opts);
      const sympNodes = connectSympathetic(audioCtx, dryForResonance, masterBus, opts);
      const allBodyNodes = bodyNodes.concat(sympNodes);

      const releaseSec = articulation === 'arco'
        ? clamp(0.05 + releaseParam * 1.45, 0.05, 1.5)
        : clamp(0.9 + releaseParam * 1.5, 0.4, 3.0);

      const key = articulation === 'arco'
        ? heldKey(opts, targetMidi, entry.string, articulation)
        : null;

      if (key) {
        const previous = _heldByKey.get(key);
        if (previous && !previous.released) {
          releaseActive(previous, Math.max(audioCtx.currentTime, time - 0.006));
        }
      }

      const active = {
        audioCtx,
        source: src,
        gain: amp,
        targetGain,
        releaseSec,
        holdUntil: gateEnd,
        releaseTimer: null,
        loopTimer: null,
        stopTimer: null,
        hasLoop,
        bodyNodes: allBodyNodes,
        lfos: [vib ? vib.lfo : null, trem.lfo].filter(Boolean),
        startedAt: time,
        released: false,
        heldKey: key,
        blockId: opts.blockId || 'global',
        articulation,
        string: entry.string,
        targetMidi,
        chordId: opts.chordId || null,
      };

      _activeVoices.add(active);
      if (allBodyNodes.length) _bodyVoices.add(active);
      if (key) _heldByKey.set(key, active);

      src.onended = () => unregister(active);

        try {
          src.start(time);

          if (articulation === 'arco') {
            const attack = clamp(0.030 + (1 - force) * 0.090, 0.018, 0.180);
            scheduleArcoHoldGain(amp.gain, time, targetGain, attack);
            scheduleHeldRelease(active, gateEnd);
          } else {
            const decaySec = Math.min(releaseSec, Math.max(0.18, gateDuration + 0.5));
            const stopAt = schedulePizzGain(amp.gain, time, targetGain, decaySec);
            const maxStop = Math.min(time + buffer.duration / Math.max(0.001, src.playbackRate.value), stopAt + 0.05);
            src.stop(maxStop);
          }

          return active;
        } catch (err) {
        unregister(active);
        console.warn('[repl] violin start failed:', err);
        return false;
      }
    }

  // -------------------- public play API --------------------

  function prewarm(audioCtx, notes) {
    if (!audioCtx) return Promise.resolve([]);
    return ready().then(() => {
      if (!manifestReady()) return [];
      const wants = Array.isArray(notes) && notes.length ? notes : ['G3', 'D4', 'A4', 'E5', 'A5'];
      const loads = [];
      for (const n of wants) {
        const midi = noteNameToMidi(n);
        if (!Number.isFinite(midi)) continue;
          const arcoEntry = resolveSampleEntry('arco', null, midi);
          const pizzEntry = resolveSampleEntry('pizz', null, midi);

          if (arcoEntry) loads.push(loadBuffer(audioCtx, arcoEntry));
          if (pizzEntry) loads.push(loadBuffer(audioCtx, pizzEntry));
      }
      return Promise.all(loads);
    });
  }

    function playViolin(opts) {
      const audioCtx = opts && opts.audioCtx;
      const masterBus = opts && opts.masterBus;
      if (!audioCtx || !masterBus) return false;

      const targetFreq = Number(opts.freq);
      if (!Number.isFinite(targetFreq) || targetFreq <= 0) return false;

      if (!manifestReady()) {
        loadManifest(_manifestUrl).then(() => prewarm(audioCtx));
        return false;
      }

      const targetMidi = Number.isFinite(Number(opts.midi))
        ? Math.round(Number(opts.midi))
        : Math.round(69 + 12 * Math.log2(targetFreq / 440));

      const articulation = normalizeArticulation(opts.articulation) || 'arco';

      let preferredString = normalizeString(opts.string);
      if (!preferredString) preferredString = autoPickString(targetMidi, opts.blockId);

      const entry = resolveSampleEntry(articulation, preferredString, targetMidi);
      if (!entry) return false;

      const key = bufferKey(entry);
        if (!_buffers.has(key)) {
          loadBuffer(audioCtx, entry).then((buffer) => {
            if (!buffer) return;
            playViolin({
              ...opts,
              time: Math.max(audioCtx.currentTime + 0.025, Number(opts.time) || audioCtx.currentTime),
            });
          });
          return false;
        }

      const buffer = _buffers.get(key);

      enforcePolyphony(audioCtx, opts.poly);
      recordRecentString(opts.blockId, entry.string);

      const active = scheduleNote(opts, {
        articulation,
        entry,
        buffer,
        targetFreq,
        targetMidi,
      });

      if (active && articulation === 'arco') {
        registerHeldGroup(opts, 'note', [active]);
      }

      return Boolean(active);
    }
    
    function extendViolin(opts) {
      const audioCtx = opts && opts.audioCtx;
      if (!audioCtx) return false;

      const targetFreq = Number(opts.freq);
      if (!Number.isFinite(targetFreq) || targetFreq <= 0) return false;

      const targetMidi = Number.isFinite(Number(opts.midi))
        ? Math.round(Number(opts.midi))
        : Math.round(69 + 12 * Math.log2(targetFreq / 440));

      const articulation = normalizeArticulation(opts.articulation) || 'arco';

      // Pizzicato cannot be tied as a bowed sustain. Let tied pizz leaves decay.
      if (articulation !== 'arco') return false;

      const active = findHeldActive(opts, targetMidi, articulation, opts.string);
      if (!active) return false;

      const gateDuration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
        ? Number(opts.gateDuration)
        : Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
          ? Number(opts.eventDuration)
          : 1.0;

      const until = Math.max(audioCtx.currentTime, Number(opts.time) || audioCtx.currentTime) + gateDuration;
      return extendActive(active, until);
    }

    function playViolinChord(opts) {
      const audioCtx = opts && opts.audioCtx;
      const masterBus = opts && opts.masterBus;
      if (!audioCtx || !masterBus) return false;

      const rawNotes = Array.isArray(opts.notes) ? opts.notes : [];
      const notes = rawNotes
        .map((note) => {
          const freq = Number(note && note.freq);
          const midi = Number.isFinite(Number(note && note.midi))
            ? Math.round(Number(note.midi))
            : Math.round(69 + 12 * Math.log2(freq / 440));

          if (!Number.isFinite(freq) || freq <= 0 || !Number.isFinite(midi)) return null;
          return { ...note, freq, midi };
        })
        .filter(Boolean);

      if (notes.length < 2) return false;

      if (!manifestReady()) {
        loadManifest(_manifestUrl).then(() => prewarm(audioCtx));
        return false;
      }

      const articulation = normalizeArticulation(opts.articulation) || 'arco';
      const plans = chooseChordPlans(articulation, notes, opts.string);
      if (plans.length < 2) return false;

      let allReady = true;
      const readyPlans = [];

      for (const plan of plans) {
        const key = bufferKey(plan.entry);
          if (!_buffers.has(key)) {
            loadBuffer(audioCtx, plan.entry);
            allReady = false;
            continue;
          }

        readyPlans.push({
          ...plan,
          buffer: _buffers.get(key),
        });
      }

      if (!allReady || readyPlans.length < 2) return false;

      enforcePolyphony(audioCtx, opts.poly);

      const chordId = `violin-chord-${++_chordCounter}`;
      const sharedHuman = humanize(opts);
      const chordGainMul = clamp(1 / Math.sqrt(readyPlans.length) * 0.82, 0.35, 0.72);

      let scheduled = false;
      const actives = [];

      for (const plan of readyPlans) {
        recordRecentString(opts.blockId, plan.entry.string);

        const active = scheduleNote({
          ...opts,
          freq: plan.targetFreq,
          midi: plan.targetMidi,
          sharedHuman,
          chordGainMul,
          chordId,
        }, {
          articulation,
          entry: plan.entry,
          buffer: plan.buffer,
          targetFreq: plan.targetFreq,
          targetMidi: plan.targetMidi,
        });

        if (active) {
          actives.push(active);
          scheduled = true;
        }
      }

      if (scheduled && articulation === 'arco') {
        registerHeldGroup(opts, 'chord', actives);
      }

      return scheduled;
    }

    function extendViolinChord(opts) {
      const audioCtx = opts && opts.audioCtx;
      if (!audioCtx) return false;

      const rawNotes = Array.isArray(opts.notes) ? opts.notes : [];
      const notes = rawNotes
        .map((note) => {
          const freq = Number(note && note.freq);
          const midi = Number.isFinite(Number(note && note.midi))
            ? Math.round(Number(note.midi))
            : Math.round(69 + 12 * Math.log2(freq / 440));

          if (!Number.isFinite(freq) || freq <= 0 || !Number.isFinite(midi)) return null;
          return { ...note, freq, midi };
        })
        .filter(Boolean);

      if (notes.length < 2) return false;

      let extended = false;

      for (const note of notes) {
        extended = extendViolin({
          ...opts,
          freq: note.freq,
          midi: note.midi,
        }) || extended;
      }

      return extended;
    }

    function stopAll(when) {
      const t = Number.isFinite(Number(when)) ? Number(when) : 0;

      _heldGroupsByBlock.clear();

      for (const active of Array.from(_activeVoices)) {
        stopActive(active, t);
      }
    }

  function status() {
    return {
      loaded: _buffers.size,
      pending: _pendingBuffers.size,
      manifest: _manifest ? _manifest.id : null,
      arcoNotes: _manifest && _manifest.flat ? _manifest.flat.arco.length : 0,
      pizzNotes: _manifest && _manifest.flat ? _manifest.flat.pizz.length : 0,
        active: _activeVoices.size,
        held: _heldByKey.size,
        heldGroups: _heldGroupsByBlock.size,
    };
  }

    root.ViolinVoice = {
      loadManifest,
      ready,
      prewarm,
      playViolin,
      playViolinChord,
      extendViolin,
      extendViolinChord,
      extendLastForBlock,
      releaseLastForBlock,
      stopAll,
      status,
    };
})(window);
