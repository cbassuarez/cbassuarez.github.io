// ReplTunings — local tuning catalog loader + conversion helpers.
(function (root) {
  'use strict';

  const CATALOG_PATH = './tunings/catalog.json?v=20260507r4';

  let _catalog = null;
  let _loadError = null;

  const SEMITONE_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function clampNumber(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function canonicalizePresetEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const id = String(raw.id || '').trim();
    if (!id) return null;

    const aliases = Array.isArray(raw.aliases)
      ? raw.aliases.map((x) => String(x || '').trim()).filter(Boolean)
      : [];

    const pitchCents = Array.isArray(raw.pitchCents)
      ? raw.pitchCents.map((x) => Number(x)).filter((x) => Number.isFinite(x))
      : [];
    if (pitchCents.length === 0) return null;

    const noteCount = Number.isFinite(Number(raw.noteCount))
      ? Math.max(1, Math.floor(Number(raw.noteCount)))
      : pitchCents.length;

    const octaveCents = Number.isFinite(Number(raw.octaveCents)) && Number(raw.octaveCents) > 0
      ? Number(raw.octaveCents)
      : 1200;

    const referencePitchIndex = Number.isFinite(Number(raw.referencePitchIndex))
      ? Math.floor(Number(raw.referencePitchIndex))
      : 0;

    const referencePitchFrequency = Number.isFinite(Number(raw.referencePitchFrequency)) && Number(raw.referencePitchFrequency) > 0
      ? Number(raw.referencePitchFrequency)
      : 440;

    const noteNames = Array.isArray(raw.noteNames)
      ? raw.noteNames.map((x) => String(x || '')).filter(Boolean)
      : [];

    return {
      id,
      aliases,
      title: String(raw.title || id),
      family: String(raw.family || ''),
      path: String(raw.path || ''),
      url: String(raw.url || ''),
      patchId: String(raw.patchId || ''),
      type: String(raw.type || 'Scala'),
      noteCount,
      pitchCents: pitchCents.slice(0, noteCount),
      octaveCents,
      referencePitchIndex,
      referencePitchFrequency,
      noteNames,
      sourceText: typeof raw.sourceText === 'string' ? raw.sourceText : '',
    };
  }

  function buildCatalogIndexes(data) {
    const rawPresets = data && Array.isArray(data.presets) ? data.presets : [];
    const presets = [];
    const byId = Object.create(null);

    for (const raw of rawPresets) {
      const preset = canonicalizePresetEntry(raw);
      if (!preset) continue;
      presets.push(preset);
    }

    // Canonical IDs first.
    for (const preset of presets) {
      byId[String(preset.id).toLowerCase()] = preset;
    }

    // Then aliases if there is no collision.
    for (const preset of presets) {
      for (const alias of preset.aliases) {
        const key = String(alias || '').toLowerCase();
        if (!key) continue;
        if (!byId[key]) byId[key] = preset;
      }
    }

    return {
      version: Number.isFinite(Number(data && data.version)) ? Number(data.version) : 1,
      generatedAt: String((data && data.generatedAt) || ''),
      source: String((data && data.source) || ''),
      presets,
      byId,
    };
  }

  function loadCatalogSync() {
    if (_catalog) return _catalog;

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', CATALOG_PATH, false);
      xhr.send(null);

      if (xhr.status !== 200 && xhr.status !== 0) {
        throw new Error(`catalog load failed: HTTP ${xhr.status}`);
      }

      const parsed = JSON.parse(xhr.responseText || '{}');
      _catalog = buildCatalogIndexes(parsed);
      _loadError = null;
      return _catalog;
    } catch (err) {
      _loadError = err;
      _catalog = {
        version: 0,
        generatedAt: '',
        source: '',
        presets: [],
        byId: Object.create(null),
      };
      return _catalog;
    }
  }

  function getCatalog() {
    return loadCatalogSync();
  }

  function getLoadError() {
    loadCatalogSync();
    return _loadError;
  }

  function normalizePresetKey(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function resolvePreset(id) {
    if (id == null) return null;
    const catalog = loadCatalogSync();
    const key = String(id).trim().toLowerCase();
    if (!key) return null;
    if (catalog.byId[key]) return catalog.byId[key];

    const normalized = normalizePresetKey(key);
    if (normalized && catalog.byId[normalized]) return catalog.byId[normalized];
    if (!normalized || normalized.length < 3) return null;

    const seen = new Set();
    const matches = [];
    for (const candidateKey of Object.keys(catalog.byId)) {
      if (!candidateKey || !candidateKey.startsWith(normalized)) continue;
      const preset = catalog.byId[candidateKey];
      if (!preset || !preset.id) continue;
      if (seen.has(preset.id)) continue;
      seen.add(preset.id);
      matches.push(preset);
      if (matches.length > 1) break;
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function listPresetIds(limit) {
    const catalog = loadCatalogSync();
    const ids = catalog.presets.map((p) => p.id).sort();
    const n = Number(limit);
    if (Number.isFinite(n) && n > 0) return ids.slice(0, Math.floor(n));
    return ids;
  }

  function normalizeA4Hz(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    return n;
  }

  function inferReferenceMidi(referencePitchFrequency) {
    const hz = Number(referencePitchFrequency);
    if (!Number.isFinite(hz) || hz <= 0) return 69;
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    if (!Number.isFinite(midi)) return 69;
    return midi;
  }

  function noteToMidi(name, accidental, octave) {
    const base = SEMITONE_OFFSETS[String(name || '').toUpperCase()];
    if (!Number.isFinite(base)) return null;

    let semis = base;
    if (accidental === '#') semis += 1;
    if (accidental === 'b') semis -= 1;

    const oct = Number(octave);
    if (!Number.isFinite(oct)) return null;

    return (oct + 1) * 12 + semis;
  }

  function mod(value, n) {
    if (!Number.isFinite(value) || !Number.isFinite(n) || n <= 0) return 0;
    let out = value % n;
    if (out < 0) out += n;
    return out;
  }

  function floorDiv(value, n) {
    if (!Number.isFinite(value) || !Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(value / n);
  }

  function centsAtStep(runtime, absoluteIndex) {
    if (!runtime) return null;
    const noteCount = Math.max(1, Number(runtime.noteCount) || 1);
    const octaveCents = Number.isFinite(Number(runtime.octaveCents)) && Number(runtime.octaveCents) > 0
      ? Number(runtime.octaveCents)
      : 1200;
    const pitchCents = Array.isArray(runtime.pitchCents) ? runtime.pitchCents : [];
    if (pitchCents.length === 0) return null;
    const deg = mod(absoluteIndex, noteCount);
    const oct = floorDiv(absoluteIndex, noteCount);
    const degreeCents = Number.isFinite(Number(pitchCents[deg])) ? Number(pitchCents[deg]) : 0;
    return oct * octaveCents + degreeCents;
  }

  function baseFrequencyFromMidi(runtime, midiNum) {
    if (!runtime) return null;
    const midi = Number(midiNum);
    if (!Number.isFinite(midi)) return null;
    const refMidi = Number.isFinite(Number(runtime.referenceMidi))
      ? Math.floor(Number(runtime.referenceMidi))
      : 69;
    const refIndex = Number.isFinite(Number(runtime.referencePitchIndex))
      ? Math.floor(Number(runtime.referencePitchIndex))
      : 0;
    const refFreq = Number.isFinite(Number(runtime.referencePitchFrequency)) && Number(runtime.referencePitchFrequency) > 0
      ? Number(runtime.referencePitchFrequency)
      : 440;

    const absoluteIndex = refIndex + (midi - refMidi);
    const cents = centsAtStep(runtime, absoluteIndex);
    const refCents = centsAtStep(runtime, refIndex);
    if (!Number.isFinite(cents) || !Number.isFinite(refCents)) return null;
    return refFreq * Math.pow(2, (cents - refCents) / 1200);
  }

  function tuningToRuntime(tuning) {
    if (!tuning || typeof tuning !== 'object') return null;

    const pitchCents = Array.isArray(tuning.pitchCents)
      ? tuning.pitchCents.map((x) => Number(x)).filter((x) => Number.isFinite(x))
      : [];
    if (pitchCents.length === 0) return null;

    const noteCount = Number.isFinite(Number(tuning.noteCount))
      ? Math.max(1, Math.floor(Number(tuning.noteCount)))
      : pitchCents.length;

    const octaveCents = Number.isFinite(Number(tuning.octaveCents)) && Number(tuning.octaveCents) > 0
      ? Number(tuning.octaveCents)
      : 1200;

    const refIndex = Number.isFinite(Number(tuning.referencePitchIndex))
      ? Math.floor(Number(tuning.referencePitchIndex))
      : 0;

    const refFreqBase = Number.isFinite(Number(tuning.referencePitchFrequency)) && Number(tuning.referencePitchFrequency) > 0
      ? Number(tuning.referencePitchFrequency)
      : 440;

    const referenceMidi = Number.isFinite(Number(tuning.referenceMidi))
      ? Math.floor(Number(tuning.referenceMidi))
      : inferReferenceMidi(refFreqBase);

    const a4Hz = normalizeA4Hz(tuning.a4Hz);
    const runtime = {
      id: String(tuning.id || ''),
      title: String(tuning.title || ''),
      family: String(tuning.family || ''),
      noteCount,
      pitchCents: pitchCents.slice(0, noteCount),
      octaveCents,
      referencePitchIndex: refIndex,
      referencePitchFrequency: refFreqBase,
      referenceMidi,
      a4Hz,
      non12: noteCount !== 12,
      noteNames: Array.isArray(tuning.noteNames) ? tuning.noteNames.slice() : [],
      sourceText: typeof tuning.sourceText === 'string' ? tuning.sourceText : '',
      path: String(tuning.path || ''),
      url: String(tuning.url || ''),
    };

    const baseA4 = baseFrequencyFromMidi(runtime, 69);
    runtime.a4BaseFrequency = Number.isFinite(baseA4) && baseA4 > 0 ? baseA4 : null;
    if (runtime.a4BaseFrequency && a4Hz != null) {
      const scalar = a4Hz / runtime.a4BaseFrequency;
      runtime.a4Scalar = Number.isFinite(scalar) && scalar > 0 ? scalar : 1;
    } else {
      runtime.a4Scalar = 1;
    }
    return runtime;
  }

  function midiToFreq(midi, runtimeTuning) {
    const midiNum = Number(midi);
    if (!Number.isFinite(midiNum)) return null;

    const tuning = tuningToRuntime(runtimeTuning);
    if (!tuning) {
      return 440 * Math.pow(2, (midiNum - 69) / 12);
    }

    const base = baseFrequencyFromMidi(tuning, midiNum);
    if (!Number.isFinite(base) || base <= 0) {
      return 440 * Math.pow(2, (midiNum - 69) / 12);
    }

    const scalar = Number.isFinite(Number(tuning.a4Scalar)) && Number(tuning.a4Scalar) > 0
      ? Number(tuning.a4Scalar)
      : 1;
    return base * scalar;
  }

  function buildProgramTuning(preset, a4Hz) {
    if (!preset) return null;
    return {
      id: preset.id,
      title: preset.title,
      family: preset.family,
      path: preset.path,
      url: preset.url,
      noteCount: preset.noteCount,
      pitchCents: preset.pitchCents.slice(),
      octaveCents: preset.octaveCents,
      referencePitchIndex: preset.referencePitchIndex,
      referencePitchFrequency: preset.referencePitchFrequency,
      referenceMidi: inferReferenceMidi(preset.referencePitchFrequency),
      noteNames: preset.noteNames.slice(),
      sourceText: preset.sourceText,
      a4Hz: normalizeA4Hz(a4Hz),
      non12: preset.noteCount !== 12,
    };
  }

  root.ReplTunings = {
    getCatalog,
    getLoadError,
    resolvePreset,
    listPresetIds,
    normalizeA4Hz,
    noteToMidi,
    midiToFreq,
    tuningToRuntime,
    buildProgramTuning,
  };
})(window);
