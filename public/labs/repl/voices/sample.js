// Sample voice — one-shot player. Loads PCM/MP3/OGG buffers from the sample
// bank (samples/manifest.json + samples/<name>.<ext>) lazily and caches the
// decoded AudioBuffer for the session.
//
// Exposes:
//   SampleVoice.loadManifest(url)        // returns Promise<manifest>
//   SampleVoice.setOverlayBank({ samples, groups })
//   SampleVoice.clearOverlayBank()
//   SampleVoice.playSample({ audioCtx, masterBus, time, name, params, gateDuration })
//   SampleVoice.has(name)                // true if name is in manifest
//   SampleVoice.list()                   // array of known names
//
// On a missing name the function calls onMissing(name) (if provided) so the
// REPL can warn once and substitute.

(function (root) {
  'use strict';

    const _buffers = new Map();       // name → AudioBuffer
    const _pending = new Map();       // name → Promise<AudioBuffer>
    const _activeSources = new Set(); // currently playing AudioBufferSourceNodes

    // Session-only quarantine for broken production assets.
    // If a manifest points to a 404 / bad / undecodable sample, do not hammer
    // that URL every loop. Mark it unavailable, remove it from future kit/lane
    // choices, and warn once.
    const _failedSampleIds = new Set();
    const _failedSampleUrls = new Set();
    const _warnedSampleFailures = new Set();

    let _manifest = null;             // shipped manifest { version, samples, kits, groups }
    let _manifestUrl = '';
    let _manifestPromise = null;
    let _overlay = { samples: [], groups: [] }; // runtime-only local sample overlay
    let _overlayByName = new Map();

  function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return n < lo ? lo : n > hi ? hi : n;
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

    function applyAudioParamValue(param, value, time, duration, lo, hi, fallback) {
      if (!param) return;

      const start = Number.isFinite(time) ? time : 0;
      const min = Number.isFinite(lo) ? lo : -Infinity;
      const max = Number.isFinite(hi) ? hi : Infinity;
      const fb = Number.isFinite(fallback) ? fallback : 0;

      if (isParamGesture(value)) {
        const dur = Number(duration);
        const end = start + (Number.isFinite(dur) && dur > 0 ? dur : 0.25);
        const mode = value.mode || value.op || '';

        if (mode === 'continuous-random') {
          const gestureLo = Number.isFinite(Number(value.lo)) ? Number(value.lo) : min;
          const gestureHi = Number.isFinite(Number(value.hi)) ? Number(value.hi) : max;
          const safeLo = Number.isFinite(gestureLo) ? gestureLo : min;
          const safeHi = Number.isFinite(gestureHi) ? gestureHi : max;
          const rateHz = Number.isFinite(Number(value.rateHz)) ? Number(value.rateHz) : 8;
          const step = Math.max(0.025, Math.min(0.25, 1 / rateHz));

          let t = start;
          let current = clamp(numericParamValue(value, fb), safeLo, safeHi);

          try {
            param.cancelScheduledValues(start);
            param.setValueAtTime(current, start);

            while (t < end - 0.0001) {
              const nextT = Math.min(end, t + step);
              const next = clamp(randomBetween(safeLo, safeHi), safeLo, safeHi);
              param.linearRampToValueAtTime(next, Math.max(start + 0.006, nextT));
              current = next;
              t = nextT;
            }

            return;
          } catch (_) {
            try { param.value = current; } catch (__) {}
            return;
          }
        }

        const from = clamp(numericParamValue(value.from, fb), min, max);
        const to = clamp(numericParamValue(value.to, from), min, max);

        try {
          param.cancelScheduledValues(start);
          param.setValueAtTime(from, start);
          param.linearRampToValueAtTime(to, Math.max(start + 0.006, end));
          return;
        } catch (_) {
          try { param.value = from; } catch (__) {}
          return;
        }
      }

      const scalar = clamp(numericParamValue(value, fb), min, max);

      try {
        param.setValueAtTime(scalar, start);
      } catch (_) {
        try { param.value = scalar; } catch (__) {}
      }
    }

  function normalizeManifestData(data) {
    if (!data || !Array.isArray(data.samples)) {
      return { version: 1, samples: [], kits: [], groups: [] };
    }
    return {
      version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
      samples: data.samples.slice(),
      kits: Array.isArray(data.kits) ? data.kits.slice() : [],
      groups: Array.isArray(data.groups) ? data.groups.slice() : [],
    };
  }

  function normalizeOverlayData(data) {
    if (!data || typeof data !== 'object') return { samples: [], groups: [] };
    return {
      samples: Array.isArray(data.samples) ? data.samples.filter(Boolean).slice() : [],
      groups: Array.isArray(data.groups) ? data.groups.filter(Boolean).slice() : [],
    };
  }

  function clearCachedBuffers(names) {
    for (const name of names) {
      if (!name) continue;
      _buffers.delete(name);
      _pending.delete(name);
    }
  }

  function setOverlayBank(data) {
    const prevNames = Array.from(_overlayByName.keys());
    _overlay = normalizeOverlayData(data);
    _overlayByName = new Map();
    for (const entry of _overlay.samples) {
      if (!entry || typeof entry.name !== 'string' || !entry.name) continue;
      _overlayByName.set(entry.name, entry);
    }

    const nextNames = Array.from(_overlayByName.keys());
    clearCachedBuffers(new Set(prevNames.concat(nextNames)));
  }

  function clearOverlayBank() {
    setOverlayBank({ samples: [], groups: [] });
  }

    function sampleFailureKey(name, url) {
      const n = String(name || '').trim();
      const u = String(url || '').trim();
      return `${n}::${u}`;
    }

    function isUrlUnavailable(url) {
      const u = String(url || '').trim();
      return Boolean(u && _failedSampleUrls.has(u));
    }

    function isUnavailable(name) {
      const n = String(name || '').trim();
      if (!n) return false;
      if (_failedSampleIds.has(n)) return true;

      const entry = _overlayByName.has(n) ? _overlayByName.get(n) : baseManifestEntry(n);
      if (!entry) return false;

      try {
        return isUrlUnavailable(resolveSampleUrl(entry));
      } catch (_) {
        return false;
      }
    }

    function markSampleUnavailable(name, url, err) {
      const n = String(name || '').trim();
      const u = String(url || '').trim();

      if (n) {
        _failedSampleIds.add(n);
        _buffers.delete(n);
        _pending.delete(n);
      }

      if (u) _failedSampleUrls.add(u);

      const key = sampleFailureKey(n, u);
      if (_warnedSampleFailures.has(key)) return;
      _warnedSampleFailures.add(key);

      // eslint-disable-next-line no-console
      console.warn('[repl] sample quarantined:', n || '(unnamed)', u || '(no url)', err || '');
    }

    function unavailable() {
      return {
        samples: Array.from(_failedSampleIds),
        urls: Array.from(_failedSampleUrls),
      };
    }
    
  function loadManifest(url) {
    if (_manifestPromise) return _manifestPromise;
    _manifestUrl = url;
    _manifestPromise = fetch(url, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error('manifest http ' + r.status);
        return r.json();
      })
      .then((data) => {
        _manifest = normalizeManifestData(data);
        return _manifest;
      })
      .catch(() => {
        _manifest = normalizeManifestData(null);
        return _manifest;
      });
    return _manifestPromise;
  }

  function baseManifestEntry(name) {
    if (!_manifest || !Array.isArray(_manifest.samples)) return null;
    return _manifest.samples.find((s) => s && s.name === name) || null;
  }

    function manifestEntry(name) {
      const n = String(name || '').trim();
      if (!n || isUnavailable(n)) return null;

      const entry = _overlayByName.has(n) ? _overlayByName.get(n) : baseManifestEntry(n);
      if (!entry) return null;

      try {
        const url = resolveSampleUrl(entry);
        if (isUrlUnavailable(url)) return null;
      } catch (_) {}

      return entry;
    }

    function has(name) {
      return Boolean(manifestEntry(name)) && !isUnavailable(name);
    }

    function list() {
      const out = [];
      const seen = new Set();

      if (_manifest && Array.isArray(_manifest.samples)) {
        for (const s of _manifest.samples) {
          const name = s && s.name;
          if (!name || seen.has(name) || isUnavailable(name)) continue;
          seen.add(name);
          out.push(name);
        }
      }

      for (const s of _overlay.samples) {
        const name = s && s.name;
        if (!name || seen.has(name) || isUnavailable(name)) continue;
        seen.add(name);
        out.push(name);
      }

      return out;
    }

    function baseHas(name) {
      return Boolean(baseManifestEntry(name)) && !isUnavailable(name);
    }

  function mapGroups(rawGroups, allowedNames) {
    if (!Array.isArray(rawGroups)) return [];
    return rawGroups
      .filter((g) => g && Array.isArray(g.samples) && g.samples.length > 0)
      .map((g) => {
        const src = g.samples.slice();
        const samples = src.filter((n) => typeof n === 'string' && (!allowedNames || allowedNames.has(n)));
        const first = samples[0] || '';
        const prefix = typeof first === 'string' && first.includes('-')
          ? first.split('-')[0]
          : '';
        return {
          id: String(g.id || ''),
          label: String(g.label || g.id || ''),
          prefix,
          samples,
        };
      })
      .filter((g) => g.samples.length > 0);
  }

  // Returns the group structure from the manifest (or [] if absent / not yet
  // loaded). Each group: { id, label, samples: [name, name, ...] }.
  function groups() {
    const allowed = new Set(list());
    return mapGroups((_manifest && _manifest.groups) || [], allowed)
      .concat(mapGroups(_overlay.groups, allowed));
  }

  function normalizeKitLaneEntries(entries) {
    if (!_manifest || !Array.isArray(entries)) return [];
    const byName = new Map();

    const add = (name, weight) => {
      if (!name || !baseHas(name)) return;
      const w = Number.isFinite(Number(weight)) && Number(weight) > 0 ? Number(weight) : 1;
      const current = byName.get(name);
      byName.set(name, (current || 0) + w);
    };

    for (const entry of entries) {
      if (typeof entry === 'string') {
        const raw = entry.trim();
        if (!raw) continue;
        if (raw.endsWith('*')) {
          const prefix = raw.slice(0, -1);
          for (const expanded of expandBasePrefix(prefix)) add(expanded, 1);
          continue;
        }
        add(raw, 1);
        continue;
      }

      if (entry && typeof entry === 'object') {
        const rawName = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!rawName) continue;
        const weight = Number(entry.weight);
        if (rawName.endsWith('*')) {
          const prefix = rawName.slice(0, -1);
          for (const expanded of expandBasePrefix(prefix)) add(expanded, weight);
          continue;
        }
        add(rawName, weight);
      }
    }

    return Array.from(byName.entries()).map(([name, weight]) => ({ name, weight }));
  }

  function normalizeKit(rawKit) {
    if (!rawKit || typeof rawKit !== 'object') return null;
    const id = String(rawKit.id || '').trim().toLowerCase();
    if (!id) return null;
    const label = String(rawKit.label || rawKit.id || id);
    const lanesRaw = rawKit.lanes && typeof rawKit.lanes === 'object' ? rawKit.lanes : {};

    const lanes = {
      k: normalizeKitLaneEntries(lanesRaw.k),
      s: normalizeKitLaneEntries(lanesRaw.s),
      h: normalizeKitLaneEntries(lanesRaw.h),
      o: normalizeKitLaneEntries(lanesRaw.o),
      t: normalizeKitLaneEntries(lanesRaw.t),
      r: normalizeKitLaneEntries(lanesRaw.r),
      c: normalizeKitLaneEntries(lanesRaw.c),
    };

    const poolByName = new Map();
    for (const laneName of ['k', 's', 'h', 'o', 't', 'r', 'c']) {
      const lane = lanes[laneName] || [];
      for (const item of lane) {
        if (!item || !item.name) continue;
        const prev = poolByName.get(item.name) || 0;
        poolByName.set(item.name, prev + (Number(item.weight) || 1));
      }
    }

    const pool = Array.from(poolByName.entries()).map(([name, weight]) => ({ name, weight }));
    const bpmRaw = Number(rawKit.bpm);
    const bpm = Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : null;
    const rawType = String(rawKit.kitType || rawKit.type || '').trim().toLowerCase();
    const inferredType = id === '808' || id === 'rock' ? 'one-shot' : (id === 'breakcore' || id === 'bk' ? 'phrase' : 'one-shot');
    const kitType = rawType === 'phrase' || rawType === 'chopped' || rawType === 'chop'
      ? 'phrase'
      : (rawType === 'one-shot' || rawType === 'oneshot' || rawType === 'drum-kit' ? 'one-shot' : inferredType);
    const source = String(rawKit.source || (id === '808' ? 'Wave Alchemy 808 Tape' : '') || '');
    const lanesMeta = rawKit.lanesMeta && typeof rawKit.lanesMeta === 'object'
      ? { ...rawKit.lanesMeta }
      : (rawKit.laneMeta && typeof rawKit.laneMeta === 'object' ? { ...rawKit.laneMeta } : {});
    return { id, label, lanes, pool, bpm, kitType, source, lanesMeta };
  }

  function kits() {
    if (!_manifest || !Array.isArray(_manifest.kits)) return [];
    const out = [];
    for (const raw of _manifest.kits) {
      const kit = normalizeKit(raw);
      if (!kit) continue;
      out.push({
        id: kit.id,
        label: kit.label,
        kitType: kit.kitType,
        source: kit.source || '',
      });
    }
    return out;
  }

  function kitById(id) {
    if (!_manifest || !Array.isArray(_manifest.kits)) return null;
    const target = String(id || '').trim().toLowerCase();
    if (!target) return null;
    for (const raw of _manifest.kits) {
      if (!raw) continue;
      const rawId = String(raw.id || '').trim().toLowerCase();
      if (rawId === target) return normalizeKit(raw);
      if (Array.isArray(raw.aliases)) {
        for (const alias of raw.aliases) {
          if (String(alias || '').trim().toLowerCase() === target) return normalizeKit(raw);
        }
      }
    }
    return null;
  }

  // Resolves once the manifest has been fetched (success or empty fallback).
  function ready() {
    if (_manifestPromise) return _manifestPromise;
    return Promise.resolve(_manifest || { samples: [] });
  }

  // Returns the names of every sample whose id starts with `prefix`. Empty
  // prefix matches all. Used by the DSL's wildcard selectors.
    function expandPrefix(prefix) {
      const p = String(prefix || '');
      const out = [];
      const seen = new Set();

      for (const s of (_manifest && Array.isArray(_manifest.samples) ? _manifest.samples : [])) {
        if (!s || typeof s.name !== 'string') continue;
        if (p !== '' && !s.name.startsWith(p)) continue;
        if (seen.has(s.name) || isUnavailable(s.name)) continue;
        seen.add(s.name);
        out.push(s.name);
      }

      for (const s of _overlay.samples) {
        if (!s || typeof s.name !== 'string') continue;
        if (p !== '' && !s.name.startsWith(p)) continue;
        if (seen.has(s.name) || isUnavailable(s.name)) continue;
        seen.add(s.name);
        out.push(s.name);
      }

      return out;
    }

    function expandBasePrefix(prefix) {
      if (!_manifest || !Array.isArray(_manifest.samples)) return [];
      const p = String(prefix || '');
      const out = [];

      for (const s of _manifest.samples) {
        if (!s || typeof s.name !== 'string') continue;
        if (isUnavailable(s.name)) continue;
        if (p === '' || s.name.startsWith(p)) out.push(s.name);
      }

      return out;
    }

  function resolveSampleUrl(entry) {
    if (!entry) return '';
    if (entry.url) return entry.url;
    const file = entry.file || (entry.name + '.mp3');
    // Resolve relative to the manifest URL if known, else the page.
    const base = _manifestUrl || (window.location.pathname.replace(/[^/]+$/, '') + 'samples/manifest.json');
    return new URL('./' + file.replace(/^\.?\/*/, ''), new URL(base, window.location.href)).toString();
  }

    function loadBuffer(audioCtx, name) {
      const sampleName = String(name || '').trim();

      if (!sampleName || isUnavailable(sampleName)) {
        return Promise.resolve(null);
      }

      if (_buffers.has(sampleName)) return Promise.resolve(_buffers.get(sampleName));
      if (_pending.has(sampleName)) return _pending.get(sampleName);

      const entry = manifestEntry(sampleName);
      if (!entry) return Promise.resolve(null);

      const url = resolveSampleUrl(entry);

      if (isUrlUnavailable(url)) {
        markSampleUnavailable(sampleName, url, new Error('sample url previously failed'));
        return Promise.resolve(null);
      }

      const promise = fetch(url, { credentials: 'omit' })
        .then((r) => {
          if (r.ok) return r.arrayBuffer();
          throw new Error('sample http ' + r.status);
        })
        .then((bytes) => audioCtx.decodeAudioData(bytes))
        .then((buffer) => {
          _buffers.set(sampleName, buffer);
          _pending.delete(sampleName);
          return buffer;
        })
        .catch((err) => {
          _pending.delete(sampleName);
          markSampleUnavailable(sampleName, url, err);
          return null;
        });

      _pending.set(sampleName, promise);
      return promise;
    }

  // Synchronous trigger: schedules the buffer if it's already cached, otherwise
  // kicks off a load and silently drops THIS event (the next time the slot
  // fires it'll play). This keeps scheduling non-blocking.
  function playSample(opts) {
    const audioCtx = opts.audioCtx;
    const masterBus = opts.masterBus;
    if (!audioCtx || !masterBus) return false;
      const name = String(opts.name || '').trim();

      if (!name || isUnavailable(name)) {
        if (root.__REPL_DRUM_DEBUG) {
          console.log('[drum-debug] playSample:unavailable', { name });
        }
        return false;
      }

      const entry = manifestEntry(name);
      if (!entry) {
        if (root.__REPL_DRUM_DEBUG) {
          console.log('[drum-debug] playSample:no-entry', { name });
        }
        if (typeof opts.onMissing === 'function') opts.onMissing(name);
        return false;
      }

    const time = Number.isFinite(opts.time) ? Math.max(opts.time, audioCtx.currentTime) : audioCtx.currentTime;

    if (root.__REPL_DRUM_DEBUG) {
      console.log('[drum-debug] playSample:enter', {
        name,
        time: Number(time).toFixed(4),
        audioNow: audioCtx.currentTime.toFixed(4),
        hasBuffer: _buffers.has(name),
        pending: _pending.has(name),
      });
    }

      if (!_buffers.has(name)) {
        // Kick off load, but do not permanently drop the hit. Acoustic drum kits
        // with large variance pools otherwise sound "mostly silent" because each
        // loop may choose a different not-yet-decoded sample.
        loadBuffer(audioCtx, name).then((buffer) => {
          if (!buffer) {
            if (root.__REPL_DRUM_DEBUG) {
              console.log('[drum-debug] playSample:load-failed', { name });
            }
            return;
          }

          const retryTime = Math.max(audioCtx.currentTime + 0.025, time);
          if (root.__REPL_DRUM_DEBUG) {
            console.log('[drum-debug] playSample:retry-after-decode', {
              name,
              originalTime: Number(time).toFixed(4),
              retryTime: Number(retryTime).toFixed(4),
            });
          }
          playSample({
            ...opts,
            time: retryTime,
          });
        });

        return false;
      }

    const buffer = _buffers.get(name);
    if (!buffer) return false;

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
      const rateMul = Number.isFinite(Number(opts.rateMul)) && Number(opts.rateMul) > 0
        ? Number(opts.rateMul)
        : 1;
      const userRate = clamp(numericParamValue(opts.rate, 1), 0.25, 4);
      const rateVal = userRate * rateMul;
      const rateGestureDuration = Number.isFinite(Number(opts.rateGestureDuration)) && Number(opts.rateGestureDuration) > 0
        ? Number(opts.rateGestureDuration)
        : null;

      if (rateMul !== 1) {
        try { src.playbackRate.value = rateVal; } catch (_) {}
      } else {
        applyAudioParamValue(src.playbackRate, opts.rate, time, rateGestureDuration, 0.25, 4, rateVal);
      }

      const gainNode = audioCtx.createGain();
      const targetGain = clamp(numericParamValue(opts.gain, 1), 0, 1.5);
      gainNode.gain.value = targetGain;

      let signal = src;
      signal.connect(gainNode);
      signal = gainNode;
      let crushNode = null;

      if (root.ReplCrush && root.ReplCrush.connect) {
        signal = root.ReplCrush.connect(audioCtx, signal, {
          crush: opts.crush,
          resolution: opts.resolution,
        });
        if (signal && signal._replCrushActive) crushNode = signal;
      }

      if (audioCtx.createStereoPanner) {
        const pan = audioCtx.createStereoPanner();
        const panVal = clamp(numericParamValue(opts.pan, 0), -1, 1);
        const panGestureDuration = Number.isFinite(Number(opts.panGestureDuration)) && Number(opts.panGestureDuration) > 0
          ? Number(opts.panGestureDuration)
          : null;

        applyAudioParamValue(pan.pan, opts.pan, time, panGestureDuration, -1, 1, panVal);

        signal.connect(pan);
        signal = pan;
      }
    signal.connect(masterBus);

      const start = clamp(numericParamValue(opts.start, 0), 0, Math.max(0, buffer.duration - 0.01));
      const remaining = Math.max(0.001, buffer.duration - start);
      const rawGateDuration = Number(opts.gateDuration);
      const gateDuration = Number.isFinite(rawGateDuration) && rawGateDuration > 0
        ? Math.min(rawGateDuration, remaining)
        : null;

      try {
        gainNode.gain.cancelScheduledValues(time);

        if (gateDuration != null) {
          const attack = Math.min(0.005, Math.max(0.001, gateDuration * 0.2));
          const release = Math.min(0.02, Math.max(0.005, gateDuration * 0.25));
          const stopTime = time + gateDuration;
          const releaseStart = Math.max(time + attack, stopTime - release);

          gainNode.gain.setValueAtTime(0, time);
          gainNode.gain.linearRampToValueAtTime(targetGain, time + attack);
          gainNode.gain.setValueAtTime(targetGain, releaseStart);
          gainNode.gain.linearRampToValueAtTime(0, stopTime);
        } else {
          gainNode.gain.setValueAtTime(targetGain, time);
        }
      } catch {
        gainNode.gain.value = targetGain;
      }

      _activeSources.add(src);
      src._replCrushNode = crushNode;
      src.onended = () => {
        if (crushNode) {
          try { crushNode.disconnect(); } catch (_) {}
          crushNode = null;
        }
        _activeSources.delete(src);
      };

      try {
        src.start(time, start);

        if (gateDuration != null) {
          src.stop(time + gateDuration + 0.005);
        }
        if (root.__REPL_DRUM_DEBUG) {
          console.log('[drum-debug] playSample:started', {
            name,
            time: Number(time).toFixed(4),
            audioNow: audioCtx.currentTime.toFixed(4),
          });
        }
        return true;
      } catch (err) {
        _activeSources.delete(src);
        // eslint-disable-next-line no-console
        console.warn('[repl] sample start failed:', name, err);
        if (root.__REPL_DRUM_DEBUG) {
          console.log('[drum-debug] playSample:start-threw', { name, err: String(err) });
        }
        return false;
      }
  }
    function preloadKit(audioCtx, kitId) {
      if (!audioCtx || typeof kitById !== 'function') return Promise.resolve([]);

      const kit = kitById(kitId);
      if (!kit) return Promise.resolve([]);

      const names = new Set();

      if (kit.lanes) {
        for (const lane of ['k', 's', 'h', 'o', 't', 'r', 'c']) {
          const entries = Array.isArray(kit.lanes[lane]) ? kit.lanes[lane] : [];
          for (const item of entries) {
            if (typeof item === 'string') names.add(item);
            else if (item && item.name) names.add(item.name);
          }
        }
      }

      if (Array.isArray(kit.pool)) {
        for (const item of kit.pool) {
          if (typeof item === 'string') names.add(item);
          else if (item && item.name) names.add(item.name);
        }
      }

        return Promise.all(
          Array.from(names)
            .filter((name) => !isUnavailable(name))
            .map((name) => loadBuffer(audioCtx, name))
        );
    }
    function stopAll(when) {
      const t = Number.isFinite(when) ? when : 0;

      for (const src of Array.from(_activeSources)) {
        if (src && src._replCrushNode) {
          try { src._replCrushNode.disconnect(); } catch (_) {}
          src._replCrushNode = null;
        }
        try {
          src.stop(t + 0.025);
        } catch {
          // Ignore sources that already ended or were already stopped.
        }
        _activeSources.delete(src);
      }
    }

  // Pre-warm: resolve manifest + start fetching every named sample now.
  function preload(audioCtx) {
    if (!_manifest) return Promise.resolve();
    return Promise.all(list().map((n) => loadBuffer(audioCtx, n)));
  }

    root.SampleVoice = {
      loadManifest,
      playSample,
      stopAll,
      has,
      list,
      groups,
      kits,
      kitById,
      ready,
      preload,
        preloadKit,
        expandPrefix,
        isUnavailable,
        unavailable,
        setOverlayBank,
        clearOverlayBank,
    };
})(window);
