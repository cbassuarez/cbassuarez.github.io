// repl-editor.js — CodeMirror 6 editor adapter for /labs/repl.
//
// The CodeMirror runtime is bundled into window.CMRepl by
// scripts/build-repl-cm.mjs (entry: scripts/repl-cm-entry.js). The repl is
// served as static assets under public/, so we can't import from npm at
// runtime; this file consumes the bundle and exposes window.createReplEditor.
//
// Adapter contract is documented at the bottom of the file (createReplEditor).
// repl.js owns transport and only ever reads/writes the document through
// the returned API — never touching the contentDOM directly.

(function (root) {
  'use strict';

  if (!root.CMRepl) {
    // Bundle missing — fail loud so the page still renders something useful.
    // repl.js will detect a missing window.createReplEditor and warn.
    console.warn('[repl] codemirror.bundle.js missing; CodeMirror editor disabled');
    return;
  }

  const CM = root.CMRepl;
  const {
    EditorState, Compartment, Prec, StateEffect,
    EditorView, keymap, drawSelection, highlightActiveLine, placeholder, Decoration, ViewPlugin, RangeSetBuilder, WidgetType,
    defaultKeymap, history, historyKeymap, indentLess,
    HighlightStyle, syntaxHighlighting, StreamLanguage, bracketMatching,
    autocompletion, completionKeymap, acceptCompletion, completionStatus, startCompletion, closeCompletion, moveCompletionSelection,
    linter, lintKeymap,
    searchKeymap,
    toggleLineComment,
    t,
  } = CM;

  // ============================================================================
  // dictionaries — shared between the stream language, completion source, and
  // diagnostics. Keep these in sync with the DSL parser.
  // ============================================================================

  const VOICE_WORDS = ['string', 'sample', 'input', 'sine', 'osc', 'noise', 'pluck', 'pulse', 'drone', 'drum', 'video'];
  const DIRECTIVES = ['tempo', 'meter', 'tuning', 'eval', 'evaluate'];
  const PARAMS = [
    'force', 'decay', 'crush', 'resolution', 'pan', 'gain',
    'tone', 'harm', 'octave', 'rate', 'start', 'speed', 'glide', 'kit', 'variance',
    'monitor', 'listen',
    'opacity', 'threshold', 'edges', 'posterize', 'invert', 'contrast',
    'saturate', 'displace', 'feedback', 'delay', 'slitscan', 'trail',
    'mask', 'key', 'color', 'blend',
    'style', 'seed', 'duration', 'cache',
  ];
  const EFFECTS = [
    'compress', 'space', 'resonance', 'comb', 'grain',
    'chorus', 'excite', 'blur', 'scar', 'body',
  ];
    const COUPLING = ['attractor', 'source', 'every', 'fade', 'time', 'beat', 'leaf', 'choose', 'trigger'];
  const ATTRACTORS = [
    'weather', 'weather.dew', 'weather.frost', 'weather.visibility',
    'quake', 'tide', 'solar', 'air', 'traffic', 'grid', 'orbit',
    'civic', 'archive', 'tub', 'room', 'audience', 'mic', 'body',
    'interface', 'tab', 'input', 'camera', 'screen', 'file', 'video',
    'memory', 'habit', 'error', 'feedback',
  ];
  const SOURCE_KEYS = ['station', 'feed', 'body', 'region', 'city', 'coords'];
  const DYNAMICS = ['pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
  const PAN_VALUES = ['left', 'center', 'right'];
  const GAIN_VALUES = ['quiet', 'half', 'full', 'loud'];
  const TONE_VALUES = ['dark', 'bright'];
  const HARM_VALUES = ['simple', 'pair', 'triad', 'rich'];
  const EFFECT_MODES = [
    'wood', 'metal', 'glass', 'room', 'tub', 'paper', 'stone',
    'memory', 'weather', 'rupture', 'feedback', 'glue', 'clamp',
    'drift', 'swarm', 'shimmer', 'solar', 'electric', 'smoke',
    'haze', 'ghost',
  ];
  const LIVE_SOURCES = ['mic', 'interface', 'tab', 'input', 'camera', 'screen', 'file', 'video'];
  const VIDEO_LIVE_SOURCES = new Set(['camera', 'screen', 'file', 'video']);
  const NON_VIDEO_LIVE_SOURCES = LIVE_SOURCES.filter((src) => !VIDEO_LIVE_SOURCES.has(src));
  const LIVE_FEATURES = [
    'intensity', 'rms', 'loudness', 'volatility', 'flux', 'pressure',
    'density', 'periodicity', 'rupture', 'onset', 'age', 'silence',
    'confidence', 'brightness', 'centroid', 'noisiness', 'flatness', 'roughness',
    'motion', 'presence', 'contrast', 'colorTemp', 'saturation', 'edges',
    'flowX', 'flowY', 'stillness', 'flicker', 'centroidX', 'centroidY',
    'faces', 'body', 'depth',
  ];
  const LIVE_SOURCE_SET = new Set(LIVE_SOURCES);
  const LIVE_FEATURE_SET = new Set(LIVE_FEATURES.map((f) => String(f).toLowerCase()));
  const LIVE_REF_RE = /^(mic|interface|tab|input|camera|screen|file|video)\.([a-zA-Z][a-zA-Z0-9_-]*)$/i;

  const COMMON_OPERATORS = ['*', '*!', '*~', '*&8', '*&16', '*&30', '~', '_'];

  const HEAD_VOICE = new Set(VOICE_WORDS);
  const HEAD_DIRECTIVE = new Set(DIRECTIVES);
  const HEAD_PARAM = new Set(PARAMS);
  const HEAD_EFFECT = new Set(EFFECTS);
  const HEAD_COUPLING = new Set(COUPLING);
  const ATTRACTOR_SET = new Set(ATTRACTORS.map((a) => a.toLowerCase()));

  const NAMED_VALUE_SET = new Set([
    ...DYNAMICS, ...PAN_VALUES, ...GAIN_VALUES,
    ...TONE_VALUES, ...HARM_VALUES, ...EFFECT_MODES,
  ]);

  // Param → legal named values for completion context.
  const PARAM_NAMED = {
    force: DYNAMICS,
    crush: ['off'],
    resolution: ['off'],
    variance: ['off'],
    pan: PAN_VALUES,
    gain: GAIN_VALUES,
    tone: TONE_VALUES,
    harm: HARM_VALUES,
    monitor: ['on', 'off'],
    listen: ['on', 'off'],
    blend: ['normal', 'source-over', 'screen', 'multiply', 'overlay', 'difference', 'lighter'],
    style: ['surveillance', 'thermal', 'collage', 'ghost'],
    cache: ['live', 'memory', 'hold'],
  };

  const EFFECT_NAMED = EFFECT_MODES;
  const PARAM_NUMERIC_HINTS = {
    force: ['0.25', '0.5', '0.85'],
    decay: ['0.4', '2', '6'],
    crush: ['0', '8', '12'],
    resolution: ['0', '0.25', '0.75'],
    variance: ['0', '0.35', '1'],
    pan: ['-0.7', '0', '0.7'],
    gain: ['0.35', '0.7', '1'],
    tone: ['0.2', '0.85'],
    harm: ['0', '1', '2', '3', '4'],
    octave: ['-1', '0', '1'],
    rate: ['0.5', '1', '2'],
    start: ['0', '0.25', '0.75'],
    speed: ['0.5', '1', '2'],
    monitor: ['0', '1'],
    listen: ['0', '1'],
    opacity: ['0.25', '0.6', '1'],
    threshold: ['0.2', '0.5', '0.8'],
    edges: ['0.1', '0.4', '0.7'],
    posterize: ['0.2', '0.45', '0.75'],
    invert: ['0', '1'],
    contrast: ['0.2', '0.5', '0.9'],
    saturate: ['0.2', '0.6', '1'],
    displace: ['0.1', '0.35', '0.7'],
    feedback: ['0.2', '0.45', '0.8'],
    delay: ['0.1', '0.3', '0.6'],
    slitscan: ['0.15', '0.4', '0.8'],
    trail: ['0.1', '0.4', '0.75'],
    mask: ['0.2', '0.5', '0.8'],
    key: ['0.2', '0.5', '0.8'],
    color: ['0.2', '0.5', '0.85'],
    blend: ['0', '0.5', '1'],
  };
  const PARAM_NUMERIC_DETAIL = {
    force: '0..1 dynamic',
    decay: 'seconds 0.4..8',
    crush: 'off/0 or 4..16',
    resolution: 'off or 0..1',
    variance: 'off or 0..1',
    pan: '-1..1',
    gain: '0..1.5',
    tone: '0..1',
    harm: '0..4 or simple/pair/triad/rich',
    octave: '-2..2',
    rate: '0.25..4',
    start: '>= 0',
    speed: '0.0625..16',
    monitor: 'on/off or 0..1',
    listen: 'on/off or 0..1',
    opacity: '0..1',
    threshold: '0..1',
    edges: '0..1',
    posterize: '0..1',
    invert: '0..1',
    contrast: '0..1',
    saturate: '0..1',
    displace: '0..1',
    feedback: '0..1',
    delay: '0..1',
    slitscan: '0..1',
    trail: '0..1',
    mask: '0..1',
    key: '0..1',
    color: '0..1',
    blend: '0..1 or blend mode',
  };

  // ============================================================================
  // stream language — token classification by line head + per-token shape.
  // This is intentionally a stream tokenizer rather than a full Lezer grammar.
  // It can be replaced with a grammar later without touching the rest.
  // ============================================================================

  function classifyHead(word) {
    const lower = word.toLowerCase();
    if (HEAD_VOICE.has(lower)) return 'voice';
    if (HEAD_DIRECTIVE.has(lower)) return 'directive';
    if (HEAD_PARAM.has(lower)) return 'param';
    if (HEAD_EFFECT.has(lower)) return 'effect';
    if (HEAD_COUPLING.has(lower)) return 'coupling';
    return null;
  }

  // Patterns for body tokens — order matters: longer/specific first.
  // Returns a tag string (matched in our HighlightStyle below).
  function tokenBody(stream, state) {
    // Comments and metadata lines (also accepted mid-line for //).
    if (stream.match(/^\/\/.*$/)) return 'comment';
    if (stream.sol() && stream.match(/^#.*$/)) return 'comment';

    // Operators in priority order. Invalid forms emit 'invalid' so they
    // can wear a dotted underline without blocking input.
    if (stream.match(/^\*&\d+!/)) return 'operator';      // *&30!
    if (stream.match(/^\*&\d+/)) return 'operator';       // *&30
    if (stream.match(/^\*!\d+/)) return 'operator';       // *!4
    if (stream.match(/^\*~/)) return 'operator';
    if (stream.match(/^\*!/)) return 'operator';
    if (stream.match(/^\*\*/)) return 'invalid';          // **
    if (stream.match(/^\*\d+!/)) return 'invalid';        // *4! (must be *!4)
    if (stream.match(/^\*\d+/)) return 'operator';        // *4
    if (stream.match(/^\*[A-G]/)) {                        // *A is invalid
      // Back up one so the pitch check can pick A up after we mark *.
      return 'invalid';
    }
    if (stream.match(/^\*/)) return 'operator';

    if (stream.match(/^\|/)) return 'separator';
    if (stream.match(/^[()]/)) return 'bracket';
    if (stream.match(/^[~_]/)) return 'operator';
    if (stream.match(/^;/)) return 'operator';
    if (stream.match(/^\//)) return 'operator';            // sample-pool union
    if (stream.match(/^-(?!\d)/)) return 'operator';       // rest token
    // rest
    if (stream.match(/^\.(?!\d)/)) return 'operator';

    // Coupling-line names (attractor / source-key / every)
    if (state.lineHeadKind === 'coupling') {
      if (state.lineHead === 'attractor') {
        if (stream.match(/^[a-zA-Z][a-zA-Z0-9_.-]*/)) {
          const word = stream.current().toLowerCase();
          if (LIVE_REF_RE.test(word)) return 'liveRef';
          return ATTRACTOR_SET.has(word) ? 'attractor' : 'invalid';
        }
      }
      if (state.lineHead === 'time' || state.lineHead === 'beat' || state.lineHead === 'leaf' || state.lineHead === 'choose' || state.lineHead === 'trigger') {
        if (stream.match(/^[a-zA-Z][a-zA-Z0-9_.-]*/)) {
          const word = stream.current().toLowerCase();
          if (LIVE_REF_RE.test(word)) return 'liveRef';
          return LIVE_SOURCE_SET.has(word) ? 'liveSource' : 'atom';
        }
      }
      if (state.lineHead === 'source') {
        if (stream.match(/^[a-zA-Z][a-zA-Z0-9_.-]*/)) {
          const word = stream.current().toLowerCase();
          if (state.couplingPos === 0) {
            state.couplingPos++;
            return SOURCE_KEYS.includes(word) ? 'definition' : 'string';
          }
          state.couplingPos++;
          return 'string';
        }
      }
      if (state.lineHead === 'every') {
        if (stream.match(/^\d+/)) return 'number';
        if (stream.match(/^[a-zA-Z]+/)) return 'atom';
      }
    }

    // Numbers (fractions, decimals, integers, pi expressions)
    if (stream.match(/^-?\d+\/\d+/)) return 'number';
    if (stream.match(/^-?\d*\.\d+/)) return 'number';
    if (stream.match(/^pi\/\d+\b/)) return 'number';
    if (stream.match(/^\d+\*pi\b/)) return 'number';
    if (stream.match(/^pi\b/)) return 'number';
    if (stream.match(/^-?\d+(?![.\w])/)) return 'number';

    // Pitched voices: pitches and pitch wildcards.
    if (state.voiceLine === 'string' || state.voiceLine === 'sine' || state.voiceLine === 'osc' || state.voiceLine === 'pluck' || state.voiceLine === 'drone' || state.lineHeadKind === 'param' || state.lineHeadKind === 'effect') {
      // Pitch-span starts: <A4, >A*, <<*!4, >>6*
      if (stream.match(/^(?:<<|>>|<|>)(?:[A-G][b#]?-?\d+|[A-G][b#]?\*!?|\*!\d|\*\d|\*!|\*|[0-8]\*)(?![A-Za-z0-9])/)) return 'pitch';
      if (stream.match(/^(?:<<|>>|<|>)[^\s()|;]+/)) return 'invalid';
      // Pitch-span ends: G%, Bb%, C#%
      if (stream.match(/^[A-G][b#]?%(?![A-Za-z0-9])/)) return 'pitch';
      if (stream.match(/^[A-G][b#]?(?:%%|%[A-Za-z0-9]+)/)) return 'invalid';
      // Pitch like A3, C#4, Bb-1
      if (stream.match(/^[A-G][b#]?-?\d+(?![A-Za-z0-9])/)) return 'pitch';
      // Pitch wildcard: A*!, C#*, Bb*, A*
      if (stream.match(/^[A-G][b#]?\*!?(?![A-Za-z0-9])/)) return 'operator';
    }

    // Sample selectors
    // Forms: snm-001, tub-xither-forge, snm-*, snm-*!, snm-*&30, snm-*&30!
    if (stream.match(/^[a-zA-Z][a-zA-Z0-9_]*-\*&\d+!?/)) return 'sample';
    if (stream.match(/^[a-zA-Z][a-zA-Z0-9_]*-\*!?/)) return 'sample';
    if (stream.match(/^[a-zA-Z][a-zA-Z0-9_]*-[a-zA-Z0-9_-]+/)) return 'sample';

    if (state.voiceLine === 'drum' && stream.match(/^(?:[kshortc](?:!)?)(?![A-Za-z0-9_.-])/i)) {
      return 'sample';
    }

    // Live input modulation refs: mic.intensity, tab.rupture, interface.silence.
    if (stream.match(/^(?:mic|interface|tab|input|camera|screen|file|video)\.[a-zA-Z][a-zA-Z0-9_-]*/i)) {
      const word = stream.current().toLowerCase();
      const m = word.match(LIVE_REF_RE);
      return m && LIVE_FEATURE_SET.has(m[2]) ? 'liveRef' : 'invalid';
    }

    // Bare named values & identifiers
    if (stream.match(/^[a-zA-Z][a-zA-Z0-9_.-]*/)) {
      const word = stream.current().toLowerCase();
      if (LIVE_SOURCE_SET.has(word)) return 'liveSource';
      if (NAMED_VALUE_SET.has(word)) return 'atom';
      // In a sample voice line, bare ids are sample-bank tokens.
      if (state.voiceLine === 'sample') return 'sample';
      // Otherwise treat as identifier-y atom.
      return 'atom';
    }

    // Anything else: skip a single char so the stream can advance.
    stream.next();
    return null;
  }

  // ============================================================================
  // highlight style — austere palette mapped onto the tags we emit above. Tags
  // that aren't one of the canonical @lezer/highlight tags get a className
  // hook via `class:` so we can target them in CSS.
  // ============================================================================

  const replHighlight = HighlightStyle.define([
    // A restrained fallback palette. The Cybernetic Score decoration layer below
    // adds the high-identity token classes; these rules keep the language legible
    // if decoration support is unavailable.
    { tag: t.keyword, color: '#101114', fontWeight: '700' },
    { tag: t.definition(t.propertyName), color: '#20184f', fontWeight: '700' },
    { tag: t.operator, color: '#6a3bc3', fontWeight: '650' },
    { tag: t.number, color: '#101114', fontWeight: '650' },
    { tag: t.variableName, color: '#7a5200', fontWeight: '700' },
    { tag: t.string, color: '#c8231a', fontWeight: '700' },
    { tag: t.atom, color: '#12805c', fontWeight: '650' },
    { tag: t.annotation, color: '#0f6c4b', fontWeight: '700' },
    { tag: t.typeName, color: '#1463ff', fontWeight: '700' },
    { tag: t.comment, color: '#6f655b', fontStyle: 'italic' },
    { tag: t.bracket, color: '#7d4cff', fontWeight: '700' },
    { tag: t.separator, color: '#101114', fontWeight: '700' },
    { tag: t.invalid, color: '#d7263d', textDecoration: 'underline wavy #d7263d' },
  ]);

  // Map our internal tag-name strings (returned by tokenBody) onto Lezer
  // highlight tags. StreamLanguage's `tokenTable` lets us register custom
  // names so HighlightStyle can target them.
  const tokenTable = {
    voiceHead: t.keyword,
    directiveHead: t.keyword,
    paramHead: t.definition(t.propertyName),
    effectHead: t.definition(t.propertyName),
    couplingHead: t.annotation,
    liveSource: t.typeName,
    liveRef: t.typeName,
    attractor: t.typeName,
    pitch: t.variableName,
    sample: t.string,
    operator: t.operator,
    bracket: t.bracket,
    separator: t.separator,
    number: t.number,
    atom: t.atom,
    comment: t.comment,
    invalid: t.invalid,
    definition: t.definition(t.propertyName),
    string: t.string,
  };
  // StreamLanguage matches token strings against tags by name; our names
  // include camelCase entries (voiceHead, etc.) so we register them via
  // tokenTable.
  const replLanguageWithTags = StreamLanguage.define({
    name: 'repl-score',
    startState() {
      return { lineHead: null, lineHeadKind: null, voiceLine: null, couplingPos: 0 };
    },
    copyState(s) { return { ...s }; },
    token: (stream, state) => tokenizerEntry(stream, state),
    tokenTable,
    languageData: {
      commentTokens: { line: '//' },
      indentOnInput: /^\s*$/,
    },
  });

  // Single tokenizer entry for the bound language above. Mirrors token() on
  // replLanguage but is the canonical path actually used by the editor.
  function tokenizerEntry(stream, state) {
    if (stream.sol()) {
      state.lineHead = null;
      state.lineHeadKind = null;
      state.couplingPos = 0;
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^\/\/.*$/)) return 'comment';

    if (state.lineHead == null) {
      if (stream.match(/^[a-zA-Z][a-zA-Z0-9_.-]*/)) {
        const word = stream.current();
        const kind = classifyHead(word);
        state.lineHead = word.toLowerCase();
        state.lineHeadKind = kind;
        if (kind === 'voice') {
          state.voiceLine = state.lineHead;
          return 'voiceHead';
        }
        if (kind === 'directive') return 'directiveHead';
        if (kind === 'param') return 'paramHead';
        if (kind === 'effect') return 'effectHead';
        if (kind === 'coupling') return 'couplingHead';
        return 'invalid';
      }
      stream.next();
      return null;
    }

    return tokenBody(stream, state);
  }

  // ============================================================================
  // Cybernetic Score decorations — white Memphis/MTA score surface + live pulses.
  //
  // This is deliberately editor-local. The scheduler only emits tiny pulse
  // objects through window.ReplEditorPulse; it never imports CodeMirror and never
  // controls DOM nodes. If the editor is absent, playback stays unaffected.
  // ============================================================================

  const csPulseNudge = StateEffect.define();
  const CS_PULSE_MS = 780;
  const CS_METER_MS = 460;
  const CS_LEAF_RECENT_MS = 720;
  const CS_LEAF_MAX_CELLS = 32;

  function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  function ensurePulseBus() {
    const existing = root.ReplEditorPulse;
    if (existing && typeof existing.emit === 'function' && typeof existing.on === 'function') {
      return existing;
    }

    const listeners = new Set();
    const bus = {
      emit(payload) {
        for (const fn of Array.from(listeners)) {
          try { fn(payload || {}); } catch (err) { console.warn('[repl] editor pulse listener failed', err); }
        }
      },
      on(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    root.ReplEditorPulse = bus;
    return bus;
  }

  function lineHeadKind(head) {
    const h = String(head || '').toLowerCase();
    if (h === '//' || h === '///' || h === '#') return 'metadata';
    if (h === 'string' || h === 'sample' || h === 'input' || h === 'sine' || h === 'osc' || h === 'noise' || h === 'pluck' || h === 'pulse' || h === 'drone' || h === 'drum') return `voice-${h}`;
    if (HEAD_DIRECTIVE.has(h)) return 'directive';
    if (HEAD_PARAM.has(h)) return 'param';
    if (HEAD_EFFECT.has(h)) return 'effect';
    if (h === 'attractor' || h === 'monitor' || h === 'listen') return 'routing';
    if (h === 'time' || h === 'beat' || h === 'leaf' || h === 'choose' || h === 'trigger') return 'live-control';
    if (h === 'source' || h === 'every' || h === 'fade') return 'routing';
    return 'unknown';
  }

  function tokenCssClass(token, isHead) {
    const raw = String(token || '');
    const lower = raw.toLowerCase();
    const headKind = isHead ? lineHeadKind(lower) : '';

    if (isHead) {
      if (headKind === 'voice-string') return 'cs-token cs-head cs-voice cs-voice-string';
      if (headKind === 'voice-sample') return 'cs-token cs-head cs-voice cs-voice-sample';
      if (headKind === 'voice-input') return 'cs-token cs-head cs-voice cs-voice-input';
      if (headKind === 'voice-sine' || headKind === 'voice-osc' || headKind === 'voice-pluck' || headKind === 'voice-drone') return 'cs-token cs-head cs-voice cs-voice-string';
      if (headKind === 'voice-noise' || headKind === 'voice-pulse' || headKind === 'voice-drum') return 'cs-token cs-head cs-voice cs-voice-sample';
      if (headKind === 'directive') return 'cs-token cs-head cs-directive';
      if (headKind === 'param') return 'cs-token cs-head cs-param';
      if (headKind === 'effect') return 'cs-token cs-head cs-effect';
      if (headKind === 'routing') return 'cs-token cs-head cs-routing';
      if (headKind === 'live-control') return 'cs-token cs-head cs-live-control';
      return 'cs-token cs-head cs-invalid';
    }

    const live = lower.match(LIVE_REF_RE);
    if (live) {
      return LIVE_FEATURE_SET.has(live[2])
        ? 'cs-token cs-live-ref'
        : 'cs-token cs-invalid';
    }
    if (LIVE_SOURCE_SET.has(lower)) return 'cs-token cs-live-source';
    if (/^\/\//.test(raw) || /^#/.test(raw)) return 'cs-token cs-comment';
    if (/^[()]/.test(raw)) return 'cs-token cs-bracket';
    if (/^(?:<<|>>|<|>)(?:[A-G][b#]?-?\d+|[A-G][b#]?\*!?|\*!\d|\*\d|\*!|\*|[0-8]\*)$/.test(raw)) return 'cs-token cs-pitch';
    if (/^[A-G][b#]?%$/.test(raw)) return 'cs-token cs-pitch';
    if (/^(?:\*|\*!|\*~|\*&\d+!?|\*!\d+|\*\d+|~|_|\||;|\.|-)$/.test(raw)) return 'cs-token cs-operator';
    if (/^-?\d+\/\d+$/.test(raw) || /^-?\d*\.\d+$/.test(raw) || /^-?\d+$/.test(raw) || /^\d+(?:ms|s)$/.test(raw) || /^pi(?:\/\d+)?$/.test(raw)) return 'cs-token cs-number';
    if (/^[A-G][b#]?-?\d+$/.test(raw) || /^[A-G][b#]?\*!?$/.test(raw)) return 'cs-token cs-pitch';
    if (/^[a-zA-Z][a-zA-Z0-9_]*-(?:\*&\d+!?|\*!?|[a-zA-Z0-9_-]+)$/.test(raw)) return 'cs-token cs-sample-token';
    if (ATTRACTOR_SET.has(lower)) return 'cs-token cs-attractor';
    if (NAMED_VALUE_SET.has(lower)) return 'cs-token cs-atom';
    return 'cs-token cs-atom';
  }

  function tokenRanges(lineText) {
    const ranges = [];
    const commentAt = (() => {
      const hashIdx = lineText.search(/^\s*#/);
      if (hashIdx >= 0) return lineText.indexOf('#', hashIdx);
      const idx = lineText.search(/(^|\s)\/\//);
      return idx < 0 ? -1 : (lineText[idx] === '/' ? idx : idx + 1);
    })();

    const codePart = commentAt >= 0 ? lineText.slice(0, commentAt) : lineText;
    const tokenRe = /[^\s()|;]+|[()|;]/g;
    let m;
    let first = true;
    while ((m = tokenRe.exec(codePart))) {
      const raw = m[0];
      ranges.push({ from: m.index, to: m.index + raw.length, text: raw, isHead: first });
      first = false;
    }

    if (commentAt >= 0) {
      ranges.push({ from: commentAt, to: lineText.length, text: lineText.slice(commentAt), comment: true, isHead: false });
    }

    return ranges;
  }


  function sanitizeLeafClass(value) {
    return String(value || '')
      .replace(/[^a-z0-9_-]/gi, '')
      .toLowerCase() || 'event';
  }

  function leafStateClass(value) {
    const state = sanitizeLeafClass(value || 'hit');
    if (state === 'rest' || state === 'skipped' || state === 'mutated' || state === 'held') return state;
    return 'hit';
  }


  function normalizeLeafToken(value) {
    return String(value || '')
      .trim()
      .replace(/π/g, 'pi')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function isRestLikeLeafToken(value) {
    const token = normalizeLeafToken(value);
    return token === '~' || token === '.' || token === '-' || token === 'rest' || token === 'sustain';
  }

  function isLeafStructuralToken(value) {
    return /^(?:\(|\)|\||;)$/.test(String(value || '').trim());
  }

  function isLeafTokenRange(range) {
    if (!range || range.comment || range.isHead) return false;
    const raw = String(range.text || '').trim();
    if (!raw || isLeafStructuralToken(raw)) return false;
    return true;
  }

  function leafTokenRangesForLine(lineText) {
    return tokenRanges(lineText).filter(isLeafTokenRange);
  }

  function leafTokenMatchesEvent(rangeText, eventToken) {
    const token = normalizeLeafToken(eventToken);
    if (!token) return false;
    const raw = normalizeLeafToken(rangeText);
    if (raw === token) return true;
    if (token === 'note' && /^[a-g][b#]?-?\d+$/.test(raw)) return true;
    if (token === 'sample' && /^[a-z0-9_:-]+-(?:\*&\d+!?|\*!?|[a-z0-9_-]+)$/.test(raw)) return true;
    if (token === '*' && /^\*/.test(raw)) return true;
    return false;
  }

  // Note: this earlier definition is shadowed below by the tree-based variant
  // (see `function locateLeafTokenRange(lineText, payload)` later). The later
  // definition is the one the receiver uses; both strict-drop on out-of-range
  // identity now.
  function locateLeafTokenRangeFlat(lineText, payload) {
    const ranges = leafTokenRangesForLine(lineText);
    if (!ranges.length) return null;
    const leafIndex = Math.max(0, Number(payload && payload.leafIndex) | 0);
    const token = payload && payload.token;
    const matches = token ? ranges.filter((range) => leafTokenMatchesEvent(range.text, token)) : [];
    if (matches.length) return matches[Math.min(matches.length - 1, leafIndex)];
    return null;
  }

  function sanitizeLeafClass(value) {
    return String(value || '')
      .replace(/[^a-z0-9_-]/gi, '')
      .toLowerCase() || 'event';
  }

  function leafStateClass(value) {
    const state = sanitizeLeafClass(value || 'hit');
    if (state === 'rest' || state === 'skipped' || state === 'mutated' || state === 'held') return state;
    return 'hit';
  }

  function isLeafStructuralToken(value) {
    return /^(?:\(|\)|\||;)$/.test(String(value || '').trim());
  }

  function buildLeafSourceTree(lineText) {
    const ranges = tokenRanges(lineText)
      .filter((range) => !range.comment && !range.isHead)
      .map((range) => ({
        from: range.from,
        to: range.to,
        text: range.text,
        structural: isLeafStructuralToken(range.text),
      }));

    let pos = 0;

    function parseList(stopAtClose) {
      const children = [];
      while (pos < ranges.length) {
        const range = ranges[pos];
        const text = String(range.text || '').trim();

        if (text === ')') {
          if (stopAtClose) pos++;
          return children;
        }

        if (text === '|') {
          pos++;
          continue;
        }

        if (text === '(') {
          pos++;
          children.push({ kind: 'group', children: parseList(true), range });
          continue;
        }

        if (!range.structural) {
          children.push({ kind: 'leaf', range });
        }
        pos++;
      }
      return children;
    }

    return parseList(false);
  }

  function flattenLeafSourceTree(nodes, out) {
    const target = out || [];
    for (const node of nodes || []) {
      if (!node) continue;
      if (node.kind === 'leaf' && node.range) target.push(node.range);
      if (node.kind === 'group') flattenLeafSourceTree(node.children, target);
    }
    return target;
  }

  function leafRangeAtPath(nodes, path, depth) {
    const index = Number(path && path[depth]);
    if (!Number.isFinite(index) || index < 0) return null;
    const node = nodes && nodes[index];
    if (!node) return null;
    if (node.kind === 'leaf') return node.range || null;
    if (node.kind === 'group') return leafRangeAtPath(node.children, path, depth + 1);
    return null;
  }


  function voiceHeadForLeafLine(lineText) {
    const head = String(lineText || '').trim().split(/\s+/, 1)[0].toLowerCase();
    if (head === 'string' || head === 'sample' || head === 'input' || head === 'sine' || head === 'osc' || head === 'noise' || head === 'pluck' || head === 'pulse' || head === 'drone' || head === 'drum') return head;
    return '';
  }

  function payloadVoiceMatchesLine(lineText, payload) {
    const lineVoice = voiceHeadForLeafLine(lineText);
    const eventVoice = String((payload && payload.voice) || '').toLowerCase();
    // Strict: a leaf/block-position pulse only paints lines that own a voice
    // declaration matching the event's voice. The previous permissive
    // "either side empty → accept" rule could let a sample-block event land
    // on a non-voice row (or vice versa) when an event's voice tag was
    // missing, which is a cross-block contamination vector. Voice events
    // must arrive on a real voice line.
    if (!eventVoice) return false;
    if (!lineVoice) return false;
    return lineVoice === eventVoice;
  }

  function locateLeafTokenRange(lineText, payload) {
    const tree = buildLeafSourceTree(lineText);
    const flat = flattenLeafSourceTree(tree);
    if (!flat.length) return null;

    const wantsRest = leafStateClass(payload && payload.state) === 'rest' || isRestLikeLeafToken(payload && payload.token);
    const isRestRange = (range) => isRestLikeLeafToken(range && range.text);
    const selectIndexedLeaf = (leaves, index) => {
      if (!Array.isArray(leaves) || !leaves.length) return null;
      const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
      // Strict: never wrap modulo. A sourceLeafIndex outside the slot's leaf
      // count means the event is for a different shape of phrase than what
      // this line currently shows — drop it instead of painting a neighbor.
      if (safeIndex >= leaves.length) return null;
      const selected = leaves[safeIndex];
      if (!wantsRest) return selected || null;
      if (selected && isRestRange(selected)) return selected;
      // Rest/sustain events must stay attached to an actual visible rest cell.
      // Do not silently fall through to a neighboring note; that is what made
      // stale/nonexistent plates appear when patches changed.
      return null;
    };

    const slotIndex = Number(payload && payload.slotIndex);
    const sourceLeafIndex = Number(payload && payload.sourceLeafIndex);

    // Reject events whose top-level slot index is out of range for the line.
    // This is the primary defense against cross-voice subdivision inheritance:
    // a string block with 4 top-level slots that emit slotIndex 0..3 may not
    // paint a sample block whose visible line shows 16 nested cells, and
    // vice versa. Both blocks own their own slot count; the editor refuses
    // to translate one block's index into the other block's range space.
    if (Number.isFinite(slotIndex) && slotIndex >= 0 && slotIndex >= tree.length) {
      return null;
    }

    // The scheduler sends sourceLeafIndex: the leaf ordinal inside the
    // top-level source slot that actually dispatched. Prefer that over global
    // eventIndex or token text; repeated notes and repeated random leaves are
    // otherwise indistinguishable by text.
    if (Number.isFinite(slotIndex) && slotIndex >= 0 && Number.isFinite(sourceLeafIndex) && sourceLeafIndex >= 0) {
      const slot = tree[slotIndex];
      const slotLeaves = slot ? flattenLeafSourceTree([slot]) : [];
      const selected = selectIndexedLeaf(slotLeaves, sourceLeafIndex);
      if (selected) return selected;
      // Strict drop: if the source slot exists but the sub-leaf does not,
      // do not fall through to a path/flat fallback — the event does not
      // map onto a real cell of *this* line.
      return null;
    }

    // Path fallback: preserves nested position when sourceLeafIndex is absent.
    // Still gated on the slot being in range for this line's visible tree.
    const path = payload && Array.isArray(payload.leafPath) ? payload.leafPath : null;
    const byPath = path && path.length ? leafRangeAtPath(tree, path, 0) : null;
    if (byPath && (!wantsRest || isRestRange(byPath))) return byPath;
    if (wantsRest && byPath && !isRestRange(byPath)) return null;

    // Slot fallback: choose the visible top-level slot or its first leaf.
    if (Number.isFinite(slotIndex) && slotIndex >= 0) {
      const slot = tree[slotIndex];
      if (slot && slot.kind === 'leaf' && slot.range) return wantsRest && !isRestRange(slot.range) ? null : slot.range;
      const slotLeaves = slot ? flattenLeafSourceTree([slot]) : [];
      const selected = selectIndexedLeaf(slotLeaves, 0);
      if (selected) return selected;
      return null;
    }

    // No slot index, no path, no source leaf index — we have no committed
    // identity to anchor on. The previous code wrapped a global leafIndex
    // by `flat.length`, which guaranteed *some* token would light up even
    // for events that didn't actually belong to this line's pattern shape.
    // Drop instead.
    return null;
  }


  function hasNonEmptySelection(state) {
    try {
      return state.selection && state.selection.ranges.some((range) => range && !range.empty);
    } catch (_) {
      return false;
    }
  }

  function syncSelectionClass(view) {
    if (!view || !view.dom) return;
    view.dom.classList.toggle('cs-has-selection', hasNonEmptySelection(view.state));
  }

  function isDslTokenChar(ch) {
    return /[A-Za-z0-9*?!&;_.\-\/:#π]/.test(String(ch || ''));
  }

  function dslTokenRangeAt(state, pos) {
    const doc = state && state.doc;
    if (!doc || !doc.length) return null;
    const safePos = Math.max(0, Math.min(doc.length, Number(pos) || 0));
    const line = doc.lineAt(safePos);
    const text = line.text || '';
    if (!text) return null;
    let offset = Math.max(0, Math.min(text.length, safePos - line.from));
    let probe = offset;

    // If the click lands at a token's right edge, prefer the token to the left.
    if (probe >= text.length || !isDslTokenChar(text[probe])) {
      if (probe > 0 && isDslTokenChar(text[probe - 1])) probe -= 1;
    }
    if (probe < 0 || probe >= text.length || !isDslTokenChar(text[probe])) return null;

    let from = probe;
    let to = probe + 1;
    while (from > 0 && isDslTokenChar(text[from - 1])) from -= 1;
    while (to < text.length && isDslTokenChar(text[to])) to += 1;
    if (from === to) return null;
    return { from: line.from + from, to: line.from + to, line };
  }

  function selectDslTokenAtMouse(view, event) {
    if (!view || !event) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    if (pos == null) return false;
    const range = dslTokenRangeAt(view.state, pos);
    if (!range) return false;
    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      scrollIntoView: true,
    });
    return true;
  }

  function selectDslRowAtMouse(view, event) {
    if (!view || !event) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    if (pos == null) return false;
    const line = view.state.doc.lineAt(pos);
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
      scrollIntoView: true,
    });
    return true;
  }

  const dslSelectionMousePlugin = Prec.highest(EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!event || event.button !== 0) return false;
      if (event.detail === 3) {
        if (selectDslRowAtMouse(view, event)) {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      }
      if (event.detail === 2) {
        if (selectDslTokenAtMouse(view, event)) {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      }
      return false;
    },
  }));

  const selectionStateClassPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      syncSelectionClass(view);
    }
    update(update) {
      if (update.selectionSet || update.docChanged || update.focusChanged) syncSelectionClass(update.view);
    }
    destroy() {
      if (this.view && this.view.dom) this.view.dom.classList.remove('cs-has-selection');
    }
  });


  function buildUserSelectionMaskDecorations(state) {
    const selection = state && state.selection;
    if (!selection || !selection.ranges || !selection.ranges.length) return Decoration.none;
    const builder = new RangeSetBuilder();
    const mark = Decoration.mark({ class: 'cs-user-selection-mask' });

    for (const range of selection.ranges) {
      if (!range || range.empty) continue;
      const from = Math.max(0, Math.min(state.doc.length, range.from));
      const to = Math.max(0, Math.min(state.doc.length, range.to));
      if (to <= from) continue;

      // Split by logical line so the mask paints as rectangular edit bands and
      // never asks CodeMirror to style the hidden newline character itself.
      const startLine = state.doc.lineAt(from);
      const endLine = state.doc.lineAt(to);
      for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo += 1) {
        const line = state.doc.line(lineNo);
        const lineFrom = Math.max(from, line.from);
        const lineTo = Math.min(to, line.to);
        if (lineTo > lineFrom) builder.add(lineFrom, lineTo, mark);
      }
    }
    return builder.finish();
  }

  const selectionMaskPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildUserSelectionMaskDecorations(view.state);
    }
    update(update) {
      if (update.selectionSet || update.docChanged) {
        this.decorations = buildUserSelectionMaskDecorations(update.state);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations,
  });

  const setBlockMuteLinesEffect = StateEffect.define();

  function normalizeBlockMuteLines(input) {
    const out = new Map();
    if (!input) return out;

    if (input instanceof Map) {
      for (const [line, state] of input.entries()) {
        const n = Number(line);
        if (!Number.isFinite(n) || n <= 0) continue;
        const s = state || {};
        out.set(Math.floor(n), {
          muted: Boolean(s.muted),
          pending: Boolean(s.pending),
          pendingMuted: s.pendingMuted == null ? Boolean(s.muted) : Boolean(s.pendingMuted),
          tags: Array.isArray(s.tags) ? s.tags.slice() : [],
        });
      }
      return out;
    }

    if (Array.isArray(input)) {
      for (const entry of input) {
        if (!entry) continue;
        const n = Number(entry.line != null ? entry.line : entry.lineNumber);
        if (!Number.isFinite(n) || n <= 0) continue;
        out.set(Math.floor(n), {
          muted: Boolean(entry.muted),
          pending: Boolean(entry.pending),
          pendingMuted: entry.pendingMuted == null ? Boolean(entry.muted) : Boolean(entry.pendingMuted),
          tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
        });
      }
      return out;
    }

    if (typeof input === 'object') {
      for (const key of Object.keys(input)) {
        const n = Number(key);
        if (!Number.isFinite(n) || n <= 0) continue;
        const state = input[key] || {};
        out.set(Math.floor(n), {
          muted: Boolean(state.muted),
          pending: Boolean(state.pending),
          pendingMuted: state.pendingMuted == null ? Boolean(state.muted) : Boolean(state.pendingMuted),
          tags: Array.isArray(state.tags) ? state.tags.slice() : [],
        });
      }
    }

    return out;
  }

  class BlockMuteWidget extends WidgetType {
    constructor(lineNumber, state) {
      super();
      this.lineNumber = lineNumber;
      this.state = state || { muted: false, pending: false, pendingMuted: false, tags: [] };
    }

    eq(other) {
      return other
        && this.lineNumber === other.lineNumber
        && Boolean(this.state.muted) === Boolean(other.state.muted)
        && Boolean(this.state.pending) === Boolean(other.state.pending)
        && Boolean(this.state.pendingMuted) === Boolean(other.state.pendingMuted)
        && String((this.state.tags || []).join(',')) === String((other.state.tags || []).join(','));
    }

    toDOM() {
      const isMuted = Boolean(this.state.muted);
      const isPending = Boolean(this.state.pending);
      const pendingMuted = this.state.pendingMuted == null ? isMuted : Boolean(this.state.pendingMuted);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs-mute-toggle';
      if (isMuted) btn.classList.add('is-muted');
      if (isPending) btn.classList.add('is-pending');
      btn.setAttribute('data-repl-mute-line', String(this.lineNumber));
      btn.setAttribute('aria-label', isMuted ? `Unmute block on line ${this.lineNumber}` : `Mute block on line ${this.lineNumber}`);
      btn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
      btn.appendChild(createMuteGlyph(isMuted));

      if (isPending) {
        const pendingDot = document.createElement('span');
        pendingDot.className = 'cs-mute-pending-dot';
        pendingDot.setAttribute('aria-hidden', 'true');
        btn.appendChild(pendingDot);
      }

      const tags = Array.isArray(this.state.tags) ? this.state.tags.filter(Boolean) : [];
      const titleState = isPending
        ? (pendingMuted ? 'queued mute (next bar)' : 'queued unmute (next bar)')
        : (isMuted ? 'muted' : 'live');
      if (tags.length > 0) {
        btn.title = `${titleState} · tags: ${tags.join(', ')}`;
      } else {
        btn.title = titleState;
      }
      return btn;
    }

    ignoreEvent() {
      return false;
    }
  }

  function buildBlockMuteDecorations(state, muteLines) {
    const lines = muteLines instanceof Map ? muteLines : new Map();
    const builder = new RangeSetBuilder();
    for (let n = 1; n <= state.doc.lines; n++) {
      const line = state.doc.line(n);
      const trimmed = line.text.trim();
      const head = trimmed ? trimmed.split(/\s+/, 1)[0].toLowerCase() : '';
      const kind = lineHeadKind(head);
      if (!/^voice-/.test(kind)) continue;

      const muteState = lines.get(n) || { muted: false, pending: false, pendingMuted: false, tags: [] };
      const lineClasses = [];
      if (muteState.muted) lineClasses.push('cs-line-block-muted');
      if (muteState.pending) lineClasses.push('cs-line-block-mute-pending');
      if (lineClasses.length) {
        builder.add(line.from, line.from, Decoration.line({
          attributes: { class: lineClasses.join(' ') },
        }));
      }

      builder.add(line.from, line.from, Decoration.widget({
        widget: new BlockMuteWidget(n, muteState),
        side: -1,
      }));
    }
    return builder.finish();
  }

  const blockMuteDecorationsPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.muteLines = normalizeBlockMuteLines(editorEnvRef.blockMuteLines || null);
      this.decorations = buildBlockMuteDecorations(view.state, this.muteLines);
    }
    update(update) {
      let changed = false;
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(setBlockMuteLinesEffect)) {
            this.muteLines = normalizeBlockMuteLines(effect.value);
            changed = true;
          }
        }
      }
      if (changed || update.docChanged) {
        this.decorations = buildBlockMuteDecorations(update.state, this.muteLines);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations,
  });

  const blockMuteMousePlugin = Prec.highest(EditorView.domEventHandlers({
    mousedown(event) {
      if (!event || event.button !== 0) return false;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return false;
      const btn = target.closest('[data-repl-mute-line]');
      if (!btn) return false;
      const line = Number(btn.getAttribute('data-repl-mute-line'));
      event.preventDefault();
      event.stopPropagation();
      if (Number.isFinite(line) && line > 0 && typeof editorEnvRef.onToggleBlockMute === 'function') {
        try { editorEnvRef.onToggleBlockMute({ lineNumber: Math.floor(line) }); } catch (_) {}
      }
      return true;
    },
    click(event) {
      const target = event && event.target;
      if (!(target instanceof HTMLElement)) return false;
      const btn = target.closest('[data-repl-mute-line]');
      if (!btn) return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
  }));

  function createMuteGlyph(muted) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'cs-mute-icon');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    if (muted) {
      // Heroicons "speaker-x-mark" (outline).
      path.setAttribute('d', 'M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z');
    } else {
      // Heroicons "speaker-wave" (outline).
      path.setAttribute('d', 'M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z');
    }
    svg.appendChild(path);
    return svg;
  }

  function findCurrentBlockLines(state) {
    const selLine = state.doc.lineAt(state.selection.main.head).number;
    let start = selLine;
    let end = selLine;

    function isBoundary(text) {
      const trimmed = text.trim();
      if (!trimmed) return true;
      if (/^\/\//.test(trimmed)) return false;
      const head = trimmed.split(/\s+/, 1)[0].toLowerCase();
      return head === 'string' || head === 'sample' || head === 'input' || head === 'sine' || head === 'osc' || head === 'noise' || head === 'pluck' || head === 'pulse' || head === 'drone' || head === 'drum' || head === 'tempo' || head === 'meter' || head === 'tuning' || head === 'eval' || head === 'evaluate';
    }

    for (let n = selLine; n >= 1; n--) {
      const text = state.doc.line(n).text;
      if (n !== selLine && isBoundary(text)) {
        if (!text.trim() || /^(tempo|meter|tuning|eval|evaluate)\b/i.test(text.trim())) start = n + 1;
        else start = n;
        break;
      }
      start = n;
    }

    for (let n = selLine + 1; n <= state.doc.lines; n++) {
      const text = state.doc.line(n).text;
      if (isBoundary(text)) {
        end = n - 1;
        break;
      }
      end = n;
    }

    return { start, end };
  }

  function buildCyberneticScoreDecorations(view, pulses, meters, leafStates) {
    const now = Date.now();
    const builder = new RangeSetBuilder();
    const current = findCurrentBlockLines(view.state);

    for (let i = 1; i <= view.state.doc.lines; i++) {
      const line = view.state.doc.line(i);
      const text = line.text;
      const trimmed = text.trim();
      const head = trimmed ? trimmed.split(/\s+/, 1)[0].toLowerCase() : '';
      const kind = /^\s*(?:\/\/\/|\/\/\s*title\s*:|#\s*title\s*:)/i.test(text) ? 'metadata' : lineHeadKind(head);
      const pulse = pulses.get(i);
      const meter = meters.get(i);
      const leafState = leafStates && leafStates.get(i);
      const active = pulse && pulse.expires > now;
      const metered = meter && meter.expires > now;
      const isCurrent = i >= current.start && i <= current.end && trimmed;
      const classes = ['cs-line'];

      if (kind !== 'unknown') classes.push(`cs-line-${kind}`);
      if (isCurrent) classes.push('cs-current-block');
      if (active) {
        classes.push('cs-active-line');
        if (pulse.kind) classes.push(`cs-pulse-${String(pulse.kind).replace(/[^a-z0-9_-]/gi, '').toLowerCase()}`);
        if (pulse.voice) classes.push(`cs-pulse-${String(pulse.voice).replace(/[^a-z0-9_-]/gi, '').toLowerCase()}`);
      }
      if (metered) classes.push('cs-metered-line');

      const attrs = { class: classes.join(' ') };
      const styleParts = [];
      if (metered) {
        const v = clamp01(meter.value);
        styleParts.push(`--cs-meter:${Math.round(v * 100)}%`);
        styleParts.push(`--cs-meter-alpha:${(0.18 + v * 0.42).toFixed(3)}`);
      }
      if (leafState && /^voice-/.test(kind)) {
        const count = Math.max(1, Number(leafState.leafCount) | 0);
        const range = leafState.range || null;
        const left = range ? Math.max(0, Number(range.from) || 0) : 0;
        const width = range ? Math.max(1, (Number(range.to) || left + 1) - left) : 1;
        classes.push('cs-leaf-line-active', `cs-leaf-state-${leafStateClass(leafState.state)}`);
        attrs.class = classes.join(' ');
        styleParts.push(`--cs-leaf-left:${left}ch`);
        styleParts.push(`--cs-leaf-width:${width}ch`);
        styleParts.push(`--cs-leaf-count:${count}`);
      }
      if (styleParts.length) attrs.style = styleParts.join(';') + ';';
      builder.add(line.from, line.from, Decoration.line({ attributes: attrs }));

      const ranges = tokenRanges(text);
      for (const r of ranges) {
        const cls = r.comment ? 'cs-token cs-comment' : tokenCssClass(r.text, r.isHead);
        const tokenPulse = active && r.isHead ? ' cs-token-active' : '';
        // Leaf playback is drawn by an absolute overlay plate owned by the
        // ViewPlugin. Do not add layout-affecting classes to source tokens here:
        // the code text must stay perfectly registered while the runtime stamp
        // moves independently above/below the score grid.
        builder.add(line.from + r.from, line.from + r.to, Decoration.mark({ class: cls + tokenPulse }));
      }
    }

    return builder.finish();
  }

  const cyberneticScorePlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      syncSelectionClass(view);
      this.pulses = new Map();
      this.meters = new Map();
      this.leafStates = new Map();
      this.leafPlates = new Map();
      // line → blockId most-recently observed on a block-position pulse for
      // that line. Used to reject leaf events whose owning block's identity
      // doesn't match the current owner of the line — a defense in depth
      // against a hot-swapped or re-shaped block painting through stale
      // identity.
      this.lineOwners = new Map();
      this.pendingLeafFrame = null;
      this.pendingLeafRestart = false;
      this.timer = null;
      this.currentEpoch = null;
      this.seenLeafEvents = new Set();
      this.overlay = document.createElement('div');
      this.overlay.className = 'cs-leaf-highlight-layer';
      this.overlay.setAttribute('aria-hidden', 'true');
      // Keep the plate plane anchored to the editor viewport, then remeasure
      // against CodeMirror's viewport coordinates on scroll. The plane never
      // receives input and never changes the text DOM.
      const host = view.dom;
      const scrollHost = view.scrollDOM || view.dom;
      this.overlayHost = host;
      this.overlayScrollHost = scrollHost;
      this.onOverlayScroll = () => this.scheduleLeafPlateFlush(false);
      host.appendChild(this.overlay);
      scrollHost.addEventListener('scroll', this.onOverlayScroll, { passive: true });
      this.decorations = buildCyberneticScoreDecorations(view, this.pulses, this.meters, this.leafStates);
      this.unsubscribe = ensurePulseBus().on((payload) => this.receive(payload));
    }

    clearLeafRuntime() {
      this.leafStates.clear();
      this.leafPlates.clear();
      this.seenLeafEvents.clear();
      this.lineOwners.clear();
      if (this.pendingLeafFrame != null) {
        cancelAnimationFrame(this.pendingLeafFrame);
        this.pendingLeafFrame = null;
      }
      this.pendingLeafRestart = false;
      if (this.overlay) this.overlay.replaceChildren();
      this.decorations = buildCyberneticScoreDecorations(this.view, this.pulses, this.meters, this.leafStates);
      try { this.view.dispatch({ effects: csPulseNudge.of(Date.now()) }); } catch (_) {}
    }

    removeLeafPlateElement(key, clearTimer = false) {
      if (!this.overlay) return;
      const plate = this.overlay.querySelector(`[data-leaf-plate="${key}"]`);
      if (!plate) return;
      if (clearTimer) window.clearTimeout(plate._csRemoveTimer);
      if (plate.parentNode) plate.parentNode.removeChild(plate);
    }

    removeLeafPlate(line) {
      const key = String(line);
      this.leafPlates.delete(key);
      this.removeLeafPlateElement(key, true);
    }

    receive(payload) {
      if (payload && payload.kind === 'reset') {
        this.currentEpoch = Number.isFinite(Number(payload.epoch)) ? Number(payload.epoch) : null;
        this.pulses.clear();
        this.meters.clear();
        this.clearLeafRuntime();
        return;
      }
      if (payload && Number.isFinite(Number(payload.epoch))) {
        const epoch = Number(payload.epoch);
        if (this.currentEpoch != null && epoch !== this.currentEpoch) return;
        this.currentEpoch = epoch;
      }
      const line = Math.max(1, Number(payload && payload.line) | 0);
      if (!line || line > this.view.state.doc.lines) return;
      const now = Date.now();
      const intensity = clamp01(payload.intensity == null ? 1 : payload.intensity);
      if (payload && payload.kind === 'block-position') {
        // A block can advance through silent time, rests, or a longer-than-bar
        // cycle without firing a new token. Clear the old plate on the owning
        // line so the editor never displays "last event" as "current event".
        const lineText = this.view.state.doc.line(line).text;
        if (!payloadVoiceMatchesLine(lineText, payload)) return;
        // Record this block as the current owner of this line. Subsequent
        // leaf events whose blockId mismatches this owner are rejected as
        // cross-block strays. Block-position is the canonical "I own this
        // line" signal because it fires once per top-slot of the owning
        // block, regardless of speed/every gating.
        const ownerId = payload.blockId == null ? null : String(payload.blockId);
        if (ownerId) this.lineOwners.set(line, ownerId);
        this.leafStates.delete(line);
        this.removeLeafPlate(line);
        this.requestRefresh();
        return;
      }
      if (payload && payload.kind === 'leaf') {
        const eventId = payload.eventId == null ? '' : `${payload.epoch || ''}:${payload.eventId}`;
        if (eventId && this.seenLeafEvents.has(eventId)) return;
        if (eventId) this.seenLeafEvents.add(eventId);
        if (this.seenLeafEvents.size > 512) this.seenLeafEvents.clear();
        const count = Math.max(1, Number(payload.leafCount) | 0);
        const index = Math.max(0, Math.min(count - 1, Number(payload.leafIndex) | 0));
        const previous = this.leafStates.get(line) || {};
        const lineText = this.view.state.doc.line(line).text;
        if (!payloadVoiceMatchesLine(lineText, payload)) return;
        // BlockId guard: if a line has a recorded owner from block-position,
        // reject leaf events claiming a different blockId. Without this
        // guard, a stale event could land on a hot-swapped line and paint
        // through the new block's tokens.
        const eventBlockId = payload.blockId == null ? null : String(payload.blockId);
        const ownerId = this.lineOwners.get(line) || null;
        if (ownerId && eventBlockId && ownerId !== eventBlockId) return;
        if (eventBlockId && !ownerId) this.lineOwners.set(line, eventBlockId);
        // SlotIndex sanity: scheduler stamps slotsTotal = the owning block's
        // top-level slot count. If slotIndex falls outside that range, the
        // event cannot belong to this block — refuse it.
        const totalSlots = Number(payload.slotsTotal);
        const evtSlot = Number(payload.slotIndex);
        if (Number.isFinite(totalSlots) && totalSlots > 0
            && Number.isFinite(evtSlot) && (evtSlot < 0 || evtSlot >= totalSlots)) return;
        const range = locateLeafTokenRange(lineText, payload);
        if (!range || !range.text) return;
        const payloadToken = normalizeLeafToken(payload && payload.token);
        const rangeToken = normalizeLeafToken(range.text);
        const payloadState = leafStateClass(payload && payload.state);
        const isSilentCellEvent = payloadState === 'rest' || payloadState === 'held' || isRestLikeLeafToken(payload && payload.token);
        const isRestRange = isRestLikeLeafToken(range.text);
        const canAcceptGeneric = payloadToken === 'note' || payloadToken === '*' || payloadToken === 'sample';
        if (isSilentCellEvent && !isRestRange) return;
        if (!isSilentCellEvent && isRestRange) return;
        if (payloadToken && !isSilentCellEvent && !canAcceptGeneric && payloadToken !== rangeToken) return;
        // Rest/sustain leaves are true rhythmic events, but their visual
        // registration must be a short punch, not a full-slot occupancy. A
        // whole-beat rest in one voice can otherwise remain visible while a
        // faster nested group in another voice fires, which reads as if the
        // faster leaf leaked into every block. Keep sounding leaves slightly
        // longer, but make rest plates deliberately quiet and brief.
        const visualFromPayload = Number(payload && payload.visualDurationMs);
        const visualMs = Number.isFinite(visualFromPayload)
          ? Math.max(70, Math.min(360, visualFromPayload))
          : (isSilentCellEvent
              ? 110
              : Math.max(150, Math.min(300, Number(payload.duration) * 360 || CS_LEAF_RECENT_MS)));
        const leafState = {
          leafCount: count,
          currentIndex: index,
          state: payloadState,
          voice: payload.voice || previous.voice || '',
          token: payload.token || '',
          slotIndex: Number.isFinite(Number(payload.slotIndex)) ? Number(payload.slotIndex) : null,
          sourceLeafIndex: Number.isFinite(Number(payload.sourceLeafIndex)) ? Number(payload.sourceLeafIndex) : null,
          range: range ? { from: range.from, to: range.to, text: range.text } : null,
          visualMs,
          expires: now + visualMs,
        };
        this.leafStates.set(line, leafState);
        if (leafState.range) this.queueLeafPlate(line, leafState);
      } else {
        this.pulses.set(line, {
          expires: now + CS_PULSE_MS,
          kind: payload.kind || 'event',
          voice: payload.voice || payload.color || '',
          intensity,
        });
      }
      if (payload.meter || payload.kind === 'mod' || payload.kind === 'input') {
        this.meters.set(line, { expires: now + CS_METER_MS, value: intensity });
      }
      this.requestRefresh();
    }

    requestRefresh() {
      if (!this.view || this.view.destroyed) return;
      this.decorations = buildCyberneticScoreDecorations(this.view, this.pulses, this.meters, this.leafStates);
      try { this.view.dispatch({ effects: csPulseNudge.of(Date.now()) }); } catch (_) {}
      this.armCleanup();
    }

    queueLeafPlate(line, state) {
      if (!state || !state.range || !this.view || this.view.destroyed) return;
      const key = String(line);
      this.leafPlates.set(key, { line, state });
      this.scheduleLeafPlateFlush(true);
    }

    scheduleLeafPlateFlush(restartAnimation) {
      if (!this.view || this.view.destroyed || !this.leafPlates.size) return;
      if (restartAnimation) this.pendingLeafRestart = true;
      if (this.pendingLeafFrame != null) return;
      this.pendingLeafFrame = requestAnimationFrame(() => {
        const shouldRestart = this.pendingLeafRestart;
        this.pendingLeafRestart = false;
        this.pendingLeafFrame = null;
        this.flushLeafPlates(shouldRestart);
      });
    }

    ensureLeafPlate(key) {
      if (!this.overlay) return null;
      let plate = this.overlay.querySelector(`[data-leaf-plate="${key}"]`);
      if (plate) return plate;
      plate = document.createElement('div');
      plate.className = 'cs-leaf-highlight-plate';
      plate.dataset.leafPlate = key;
      // Keep the code DOM immutable, but draw the active token on the overlay
      // itself. The plate sits above CodeMirror text/background layers, so an
      // opaque neo-brutal button can be readable without pushing glyph layout.
      this.overlay.appendChild(plate);
      return plate;
    }

    flushLeafPlates(restartAnimation = true) {
      if (!this.view || this.view.destroyed || !this.overlay) return;
      for (const [key, item] of Array.from(this.leafPlates.entries())) {
        const line = item.line;
        const state = item.state || {};
        if (!state.range || line < 1 || line > this.view.state.doc.lines) continue;
        const docLine = this.view.state.doc.line(line);
        const from = docLine.from + Math.max(0, Number(state.range.from) || 0);
        const to = docLine.from + Math.max(Number(state.range.to) || (Number(state.range.from) || 0) + 1, (Number(state.range.from) || 0) + 1);
        const start = this.view.coordsAtPos(from, 1);
        const end = this.view.coordsAtPos(to, -1) || start;
        const hostRect = (this.overlayHost || this.view.dom).getBoundingClientRect();
        if (!start || !end || !hostRect) {
          this.removeLeafPlateElement(key);
          continue;
        }

        const rawLeft = Math.min(start.left, end.left);
        const rawRight = Math.max(start.right || start.left, end.right || end.left, start.left + 8);
        const rawTop = Math.min(start.top, end.top);
        const rawBottom = Math.max(start.bottom, end.bottom, start.top + 16);
        const padX = 3;
        const padY = 2;
        const left = Math.round(rawLeft - hostRect.left - padX);
        const top = Math.round(rawTop - hostRect.top - padY);
        const width = Math.max(12, Math.round(rawRight - rawLeft + padX * 2));
        const height = Math.max(16, Math.round(rawBottom - rawTop + padY * 2));
        const plate = this.ensureLeafPlate(key);
        if (!plate) continue;
        const stateClass = leafStateClass(state.state);
        const voiceClass = sanitizeLeafClass(state.voice || 'string');
        plate.className = `cs-leaf-highlight-plate cs-leaf-highlight-${stateClass} cs-leaf-highlight-${voiceClass}`;
        plate.textContent = String((state.range && state.range.text) || state.token || '').slice(0, 32);
        plate.style.width = `${width}px`;
        plate.style.height = `${height}px`;
        plate.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        plate.style.setProperty('--cs-leaf-plate-w', `${width}px`);
        plate.style.setProperty('--cs-leaf-plate-ms', `${Math.max(90, Math.min(360, Number(state.visualMs) || 220))}ms`);
        if (restartAnimation) {
          // Restart the relay-punch animation only for new committed leaves.
          // Scroll/geometry refreshes move the plate without extending its life.
          plate.classList.remove('is-firing');
          void plate.offsetWidth;
          plate.classList.add('is-firing');
          window.clearTimeout(plate._csRemoveTimer);
          const removeMs = Math.max(90, Math.min(360, Number(state.visualMs) || 220));
          plate._csRemoveTimer = window.setTimeout(() => {
            if (plate && plate.parentNode) plate.parentNode.removeChild(plate);
            const current = this.leafPlates.get(key);
            if (current && current.state === state) this.leafPlates.delete(key);
          }, removeMs);
        }
      }
    }


    armCleanup() {
      if (this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        const now = Date.now();
        for (const [line, p] of Array.from(this.pulses.entries())) {
          if (!p || p.expires <= now) this.pulses.delete(line);
        }
        for (const [line, m] of Array.from(this.meters.entries())) {
          if (!m || m.expires <= now) this.meters.delete(line);
        }
        for (const [line, state] of Array.from(this.leafStates.entries())) {
          if (!state || state.expires <= now) this.leafStates.delete(line);
        }
        this.decorations = buildCyberneticScoreDecorations(this.view, this.pulses, this.meters, this.leafStates);
        try { this.view.dispatch({ effects: csPulseNudge.of(Date.now()) }); } catch (_) {}
        if (this.pulses.size || this.meters.size || this.leafStates.size) this.armCleanup();
      }, 120);
    }

    update(update) {
      if (update.selectionSet || update.docChanged || update.focusChanged) syncSelectionClass(update.view);
      const pulseNudged = update.transactions.some((tr) => tr.effects.some((e) => e.is(csPulseNudge)));
      if (update.docChanged || update.viewportChanged || update.selectionSet || pulseNudged) {
        this.decorations = buildCyberneticScoreDecorations(update.view, this.pulses, this.meters, this.leafStates);
      }
      if (update.docChanged) {
        this.clearLeafRuntime();
        return;
      }
      if (update.geometryChanged || update.viewportChanged) {
        this.scheduleLeafPlateFlush(false);
      }
    }

    destroy() {
      if (this.unsubscribe) this.unsubscribe();
      if (this.timer) clearTimeout(this.timer);
      if (this.pendingLeafFrame != null) cancelAnimationFrame(this.pendingLeafFrame);
      if (this.overlayScrollHost && this.onOverlayScroll) this.overlayScrollHost.removeEventListener('scroll', this.onOverlayScroll);
      if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    }
  }, {
    decorations: (plugin) => plugin.decorations,
  });

  // ============================================================================
  // theme — Cybernetic Score: white Memphis/MTA instrument-score surface.
  // ============================================================================

  const replTheme = EditorView.theme({
    '&': {
      position: 'relative',
      backgroundColor: '#ffffff',
      color: '#070707',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '14px',
      '--cs-white': '#ffffff',
      '--cs-paper': '#fffefa',
      '--cs-ink': '#070707',
      '--cs-line': '#070707',
      '--cs-red': '#e3342f',
      '--cs-blue': '#0057ff',
      '--cs-yellow': '#ffd400',
      '--cs-green': '#008f5a',
      '--cs-violet': '#6c2cff',
      '--cs-cyan': '#00a8c8',
      '--cs-muted': '#5f6368',
      '--cs-faint': '#d8d8d8',
      '--cs-warning': '#f59e0b',
      '--cs-error': '#d7263d',
      '--cs-string-ink': '#070707',
      '--cs-sample-ink': '#070707',
      '--cs-input-ink': '#070707',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      backgroundColor: '#ffffff',
      backgroundImage:
        'linear-gradient(90deg, rgba(7,7,7,0.035) 1px, transparent 1px), linear-gradient(180deg, rgba(7,7,7,0.028) 1px, transparent 1px)',
      backgroundSize: '32px 32px',
    },
    '.cm-content': {
      caretColor: '#070707',
      padding: '1.05em 1.2em 1.05em 1.05em',
      minHeight: '22em',
      lineHeight: '1.62',
      color: '#070707',
      counterReset: 'cs-line',
    },
    '.cm-line': {
      position: 'relative',
      overflow: 'visible',
      padding: '0 7.5rem 0 3.25rem',
      borderLeft: '4px solid transparent',
      borderRadius: '0',
      transition: 'background-color 90ms ease, border-color 90ms ease, box-shadow 90ms ease, color 90ms ease',
      counterIncrement: 'cs-line',
    },
    '.cm-line::before': {
      content: 'counter(cs-line)',
      position: 'absolute',
      left: '0.36rem',
      top: '0',
      width: '2.08rem',
      color: 'rgba(7,7,7,0.44)',
      fontSize: '0.78em',
      textAlign: 'right',
      pointerEvents: 'none',
      fontWeight: '800',
      letterSpacing: '0.04em',
    },
    '.cm-line.cs-current-block': {
      backgroundColor: '#f7f7f7',
      borderLeftColor: '#070707',
      boxShadow: 'inset 0 -1px 0 rgba(7,7,7,0.08)',
    },
    '.cm-line.cs-line-voice-string': {
      backgroundColor: '#ffffff',
      borderLeftColor: '#ffd400',
      boxShadow: 'inset 0 -2px 0 #ffd400',
    },
    '.cm-line.cs-line-voice-sample, .cm-line.cs-line-voice-drum': {
      backgroundColor: '#ffffff',
      borderLeftColor: '#e3342f',
      boxShadow: 'inset 0 -2px 0 #e3342f',
    },
    '.cm-line.cs-line-voice-input': {
      backgroundColor: '#ffffff',
      borderLeftColor: '#0057ff',
      boxShadow: 'inset 0 -2px 0 #0057ff',
    },
    '.cm-line.cs-line-live-control': {
      backgroundColor: '#ffffff',
      borderLeftColor: '#6c2cff',
    },
    '.cm-line.cs-line-routing': {
      backgroundColor: '#ffffff',
      borderLeftColor: '#008f5a',
    },
    '.cm-line.cs-line-metadata': {
      backgroundColor: '#fbfbfb',
      borderLeftColor: '#070707',
      boxShadow: 'inset 0 -1px 0 rgba(7,7,7,0.08)',
    },
    '.cm-line.cs-line-block-muted': {
      opacity: '0.62',
    },
    '.cm-line.cs-line-block-mute-pending': {
      boxShadow: 'inset 0 -2px 0 #070707, inset 0 0 0 1px rgba(7,7,7,0.3)',
    },
    '.cs-mute-toggle': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      verticalAlign: 'baseline',
      marginLeft: '0.08rem',
      marginRight: '0.46rem',
      width: '1.34rem',
      height: '1.2rem',
      border: '2px solid #070707',
      backgroundColor: '#ffffff',
      color: '#070707',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '0.57rem',
      fontWeight: '900',
      letterSpacing: '0.045em',
      lineHeight: '1',
      padding: '0',
      cursor: 'pointer',
      zIndex: '5',
      textTransform: 'none',
      boxShadow: '2px 2px 0 #070707',
      transform: 'translateY(-0.04rem)',
      transition: 'transform 60ms ease, box-shadow 60ms ease, background-color 80ms ease, color 80ms ease',
    },
    '.cs-mute-toggle:hover': {
      backgroundColor: '#f6f6f6',
      transform: 'translate(-1px, calc(-0.04rem - 1px))',
      boxShadow: '3px 3px 0 #070707',
    },
    '.cs-mute-toggle:active': {
      transform: 'translate(0, -0.04rem)',
      boxShadow: '1px 1px 0 #070707',
    },
    '.cs-mute-toggle.is-muted': {
      backgroundColor: '#e3342f',
      color: '#ffffff',
    },
    '.cs-mute-toggle.is-pending': {
      backgroundImage: 'repeating-linear-gradient(135deg, #ffd400 0 4px, #ffffff 4px 8px)',
      color: '#070707',
    },
    '.cs-mute-toggle.is-pending.is-muted': {
      backgroundImage: 'repeating-linear-gradient(135deg, #ffd400 0 4px, #e3342f 4px 8px)',
      color: '#070707',
    },
    '.cs-mute-icon': {
      width: '0.86rem',
      height: '0.86rem',
      display: 'block',
      stroke: 'currentColor',
      fill: 'none',
      pointerEvents: 'none',
    },
    '.cs-mute-pending-dot': {
      position: 'absolute',
      right: '-0.22rem',
      top: '-0.22rem',
      width: '0.38rem',
      height: '0.38rem',
      border: '2px solid #070707',
      backgroundColor: '#ffd400',
      boxShadow: '1px 1px 0 #070707',
      pointerEvents: 'none',
    },
    '.cs-mute-toggle:focus-visible': {
      outline: '2px solid #0057ff',
      outlineOffset: '1px',
    },
    '.cm-line.cs-line-metadata::after': {
      content: '""',
      position: 'absolute',
      left: '2.54rem',
      top: '0.24em',
      width: '0.18rem',
      height: '1.12em',
      background: '#e3342f',
      border: '0',
      boxShadow: '0.28rem 0 0 #ffd400, 0.56rem 0 0 #070707',
      pointerEvents: 'none',
    },
    '.cm-line.cs-active-line': {
      animation: 'cs-line-stamp 780ms ease-out both',
      boxShadow: 'inset 0 -2px 0 #070707, 3px 3px 0 rgba(7,7,7,0.16)',
    },
    '.cm-line.cs-pulse-string': {
      borderLeftColor: '#ffd400',
      boxShadow: 'inset 0 -2px 0 #ffd400, 3px 3px 0 #070707',
    },
    '.cm-line.cs-pulse-sample, .cm-line.cs-pulse-drum': {
      borderLeftColor: '#e3342f',
      boxShadow: 'inset 0 -2px 0 #e3342f, 3px 3px 0 #070707',
    },
    '.cm-line.cs-pulse-input, .cm-line.cs-pulse-mod': {
      borderLeftColor: '#0057ff',
      boxShadow: 'inset 0 -2px 0 #0057ff, 3px 3px 0 #070707',
    },
    '.cm-line.cs-metered-line::after': {
      content: '""',
      position: 'absolute',
      top: '50%',
      right: '0.72rem',
      width: '5.2rem',
      height: '0.46rem',
      transform: 'translateY(-50%)',
      border: '2px solid #070707',
      background: 'linear-gradient(90deg, #0057ff var(--cs-meter), #ffffff var(--cs-meter))',
      boxShadow: '2px 2px 0 #070707',
      pointerEvents: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: '#f0f0f0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#070707',
      borderLeftWidth: '2px',
      boxShadow: '2px 0 0 #ffd400',
    },
    '.cm-selectionLayer': {
      zIndex: '70',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(255, 212, 0, 0.58)',
      boxShadow: 'inset 0 0 0 1px rgba(7,7,7,0.72)',
    },
    '.cm-content ::selection, .cm-line ::selection, ::selection': {
      backgroundColor: 'rgba(255, 212, 0, 0.62)',
      color: '#070707',
    },
    '.cs-user-selection-mask': {
      backgroundColor: '#ffe45c !important',
      color: '#070707 !important',
      boxShadow: 'inset 0 -2px 0 #070707, inset 0 1px 0 rgba(7,7,7,0.22)',
      outline: '1px solid rgba(7,7,7,0.48)',
      outlineOffset: '-1px',
      textShadow: 'none !important',
      textDecorationColor: '#070707 !important',
      borderRadius: '0',
    },
    '.cs-user-selection-mask *': {
      color: '#070707 !important',
      backgroundColor: 'transparent !important',
      textShadow: 'none !important',
      textDecorationColor: '#070707 !important',
    },
    '&.cs-has-selection .cs-leaf-highlight-layer': {
      opacity: '0.16',
      zIndex: '1',
    },
    '&.cs-has-selection .cm-content': {
      zIndex: '3',
    },
    '.cm-selectionMatch': {
      backgroundColor: '#ffd400',
      color: '#070707',
      outline: '1px solid #070707',
    },
    '.cs-token': {
      position: 'relative',
      zIndex: '1',
      borderRadius: '0',
      textDecorationThickness: '2px',
      textUnderlineOffset: '0.18em',
      transition: 'color 90ms ease, background-color 90ms ease, box-shadow 90ms ease, outline-color 90ms ease',
    },
    '.cs-head': {
      color: '#070707',
      fontWeight: '900',
      letterSpacing: '0.025em',
      textTransform: 'none',
    },
    '.cs-voice-string': {
      color: '#070707',
      textDecoration: 'underline solid #ffd400',
      textDecorationThickness: '3px',
    },
    '.cs-voice-sample, .cs-sample-token': {
      color: '#070707',
      textDecoration: 'underline solid #e3342f',
      textDecorationThickness: '3px',
    },
    '.cs-voice-input': {
      color: '#070707',
      textDecoration: 'underline solid #0057ff',
      textDecorationThickness: '3px',
    },
    '.cs-directive': {
      color: '#070707',
      fontWeight: '900',
      textDecoration: 'underline solid #070707',
    },
    '.cs-param, .cs-effect': {
      color: '#070707',
      fontWeight: '800',
      boxShadow: 'inset 0 -2px 0 rgba(0,87,255,0.32)',
    },
    '.cs-routing, .cs-attractor': {
      color: '#006642',
      fontWeight: '850',
      textDecoration: 'underline solid #008f5a',
    },
    '.cs-live-control': {
      color: '#4e20d4',
      fontWeight: '850',
      textDecoration: 'underline solid #6c2cff',
    },
    '.cs-live-source': {
      color: '#0048d8',
      fontWeight: '850',
      boxShadow: 'inset 0 -2px 0 #00a8c8',
    },
    '.cs-live-ref': {
      color: '#0048d8',
      fontWeight: '900',
      boxShadow: 'inset 0 -3px 0 #00a8c8',
    },
    '.cs-operator, .cs-bracket': {
      color: '#5c20df',
      fontWeight: '900',
    },
    '.cs-number': {
      color: '#070707',
      fontWeight: '800',
      boxShadow: 'inset 0 -2px 0 #d8d8d8',
    },
    '.cs-pitch': {
      color: '#070707',
      fontWeight: '850',
      boxShadow: 'inset 0 -2px 0 #ffd400',
    },
    '.cs-atom': {
      color: '#111111',
      fontWeight: '650',
    },
    '.cs-comment': {
      color: '#5f5147',
      fontStyle: 'italic',
      fontWeight: '650',
      boxShadow: 'inset 0 -2px 0 rgba(7,7,7,0.16)',
    },
    '.cm-line.cs-line-metadata .cs-comment': {
      color: '#3f3832',
      fontStyle: 'italic',
      fontWeight: '800',
      letterSpacing: '0.025em',
      boxShadow: 'inset 0 -2px 0 rgba(0,87,255,0.2)',
    },
    '.cs-invalid': {
      color: '#d7263d',
      textDecoration: 'underline wavy #d7263d',
      fontWeight: '900',
    },
    '.cs-token-active': {
      animation: 'cs-token-stamp 780ms ease-out both',
    },
    '.cm-line.cs-pulse-string .cs-token-active': {
      backgroundColor: '#ffd400',
      color: '#070707',
      outlineColor: '#070707',
    },
    '.cm-line.cs-pulse-sample .cs-token-active, .cm-line.cs-pulse-drum .cs-token-active': {
      backgroundColor: '#e3342f',
      color: '#ffffff',
      outlineColor: '#070707',
    },
    '.cm-line.cs-pulse-input .cs-token-active, .cm-line.cs-pulse-mod .cs-token-active': {
      backgroundColor: '#0057ff',
      color: '#ffffff',
      outlineColor: '#070707',
    },
    '.cm-scroller': {
      position: 'relative',
    },
    '.cm-content': {
      position: 'relative',
      zIndex: '2',
    },
    '.cs-leaf-highlight-layer': {
      position: 'absolute',
      inset: '0',
      zIndex: '40',
      pointerEvents: 'none',
      overflow: 'hidden',
      contain: 'layout style paint',
    },
    '.cm-line.cs-leaf-line-active': {
      backgroundImage: 'none',
      boxShadow: 'none',
    },
    '.cm-line.cs-leaf-state-rest': {
      backgroundImage: 'none',
      boxShadow: 'none',
    },
    '.cs-leaf-highlight-plate': {
      position: 'absolute',
      left: '0',
      top: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid #070707',
      backgroundColor: '#ffd400',
      color: '#070707',
      boxShadow: '4px 4px 0 #070707',
      boxSizing: 'border-box',
      opacity: '0',
      overflow: 'hidden',
      whiteSpace: 'pre',
      font: 'inherit',
      fontWeight: '900',
      letterSpacing: '0',
      lineHeight: '1',
      textAlign: 'center',
      textDecoration: 'none',
      textShadow: 'none',
      willChange: 'transform, opacity',
      transformOrigin: 'left top',
    },
    '.cs-leaf-highlight-plate.is-firing': {
      animation: 'cs-leaf-overlay-punch var(--cs-leaf-plate-ms, 220ms) steps(2, end) both',
    },
    '.cs-leaf-highlight-sample': {
      backgroundColor: '#e3342f',
      color: '#ffffff',
      borderRadius: '999px',
      boxShadow: '4px 4px 0 #070707',
    },
    '.cs-leaf-highlight-input': {
      backgroundColor: '#0057ff',
      color: '#ffffff',
      borderRadius: '0 10px 10px 0',
      boxShadow: '4px 4px 0 #070707',
    },
    '.cs-leaf-highlight-rest': {
      backgroundColor: '#ffffff',
      color: '#070707',
      backgroundImage: 'repeating-linear-gradient(135deg, transparent 0, transparent 5px, rgba(7,7,7,0.26) 5px, rgba(7,7,7,0.26) 7px)',
      borderStyle: 'solid',
      boxShadow: '4px 4px 0 #070707',
    },
    '.cs-leaf-highlight-mutated': {
      backgroundImage: 'repeating-linear-gradient(135deg, #7c3cff 0, #7c3cff 4px, #ffffff 4px, #ffffff 8px)',
    },

    '.cm-tooltip': {
      backgroundColor: '#ffffff',
      border: '2px solid #070707',
      color: '#070707',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '13px',
      boxShadow: '4px 4px 0 #070707',
      zIndex: '120',
      overflow: 'hidden',
    },
    '.cm-tooltip.cm-tooltip-autocomplete': {
      borderRadius: '0',
      minWidth: '13.5rem',
      maxWidth: 'min(30rem, calc(100vw - 2.4rem))',
    },
    '.cm-tooltip-autocomplete > ul': {
      margin: '0',
      padding: '2px 0',
      maxHeight: '15.5rem',
      overflowY: 'auto',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'baseline',
      columnGap: '0.7rem',
      padding: '4px 10px',
      fontFamily: '"Courier New", Courier, monospace',
      borderBottom: '1px solid rgba(7,7,7,0.08)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul > li.cm-repl-suggest': {
      position: 'relative',
      paddingLeft: '4.8rem',
    },
    '.cm-tooltip-autocomplete > ul > li.cm-repl-suggest::before': {
      position: 'absolute',
      left: '0.55rem',
      top: '50%',
      transform: 'translateY(-50%)',
      minWidth: '3.5rem',
      padding: '0.12rem 0.28rem',
      border: '2px solid #070707',
      backgroundColor: '#ffffff',
      color: '#070707',
      fontSize: '0.5rem',
      fontWeight: '900',
      letterSpacing: '0.08em',
      lineHeight: '1',
      textTransform: 'uppercase',
      textAlign: 'center',
      boxShadow: '2px 2px 0 #070707',
      boxSizing: 'border-box',
      content: '""',
      pointerEvents: 'none',
    },
    '.cm-tooltip-autocomplete > ul > li.cm-repl-suggest-voice::before': {
      content: '"voice"',
      backgroundColor: '#fff4c7',
    },
    '.cm-tooltip-autocomplete > ul > li.cm-repl-suggest-directive::before': {
      content: '"directive"',
      backgroundColor: '#dce9ff',
    },
    '.cm-tooltip-autocomplete > ul > li.cm-repl-suggest-param::before': {
      content: '"param"',
      backgroundColor: '#d9ffe8',
    },
    '.cm-tooltip-autocomplete > ul > li.cm-repl-suggest-effect::before': {
      content: '"effect"',
      backgroundColor: '#ffe1d7',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#0057ff',
      color: '#ffffff',
      borderBottomColor: 'rgba(255,255,255,0.22)',
      boxShadow: 'inset 0 2px 0 #070707, inset 0 -2px 0 #070707',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected].cm-repl-suggest::before': {
      backgroundColor: '#ffffff',
      color: '#070707',
      borderColor: '#ffffff',
      boxShadow: '2px 2px 0 rgba(7,7,7,0.75)',
    },
    '.cm-tooltip-autocomplete > ul > li:last-child': {
      borderBottom: '0',
    },
    '.cm-completionIcon': {
      display: 'none',
    },
    '.cm-completionLabel': {
      color: '#070707',
      fontWeight: '900',
      letterSpacing: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    '.cm-completionDetail': {
      color: '#5f6368',
      fontStyle: 'normal',
      fontWeight: '700',
      marginLeft: '0',
      opacity: '0.92',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionLabel': {
      color: '#ffffff',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail': {
      color: '#d8e4ff',
      opacity: '1',
    },
    '.cm-completionMatchedText': {
      textDecoration: 'none',
      fontWeight: '900',
      color: '#0057ff',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionMatchedText': {
      color: '#ffd400',
      textShadow: '1px 1px 0 rgba(7,7,7,0.45)',
    },
    '.cm-diagnostic': {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '13px',
      borderLeft: '0',
      padding: '4px 8px',
    },
    '.cm-diagnostic-error': {
      borderLeft: '6px solid #d7263d',
      backgroundColor: '#ffffff',
      color: '#7a1020',
      boxShadow: 'inset 0 0 0 1px #d7263d',
    },
    '.cm-diagnostic-warning': {
      borderLeft: '6px solid #ffd400',
      backgroundColor: '#ffffff',
      color: '#3f2f00',
      boxShadow: 'inset 0 0 0 1px #070707',
    },
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      borderBottom: '2px wavy #d7263d',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none',
      borderBottom: '2px dotted #070707',
    },
    '.cm-panels': {
      backgroundColor: '#ffffff',
      color: '#070707',
      borderTop: '2px solid #070707',
      fontFamily: '"Courier New", Courier, monospace',
    },
    '.cm-searchMatch': {
      backgroundColor: '#ffd400',
      color: '#070707',
      outline: '1px solid #070707',
    },
    '@keyframes cs-line-stamp': {
      '0%': { backgroundColor: '#ffd400', color: '#070707' },
      '18%': { backgroundColor: '#ffffff', color: '#070707' },
      '36%': { backgroundColor: '#0057ff', color: '#ffffff' },
      '100%': { backgroundColor: 'inherit', color: 'inherit' },
    },
    '@keyframes cs-token-stamp': {
      '0%': { outline: '2px solid #070707', boxShadow: '2px 2px 0 #070707' },
      '100%': { outline: '0 solid transparent', boxShadow: 'none' },
    },
    '@keyframes cs-leaf-overlay-punch': {
      '0%': { opacity: '0', filter: 'none' },
      '8%': { opacity: '1', filter: 'none' },
      '48%': { opacity: '1', filter: 'none' },
      '100%': { opacity: '0', filter: 'none' },
    },
  }, { dark: false });


  // ============================================================================
  // typography sanitizer — normalizes destructive punctuation introduced by
  // the OS/IME without altering user DSL syntax.
  //
  // Anything that re-encodes a literal token (lowercasing, "fixing" spelling,
  // re-pluralizing samples, etc.) is explicitly out of scope for this filter.
  // ============================================================================

  const TYPOGRAPHY_REPLACEMENTS = [
    [' ', ' '],   // NBSP → space
    ['“', '"'],
    ['”', '"'],
    ['‘', "'"],
    ['’', "'"],
    ['–', '-'],   // en dash
    ['—', '-'],   // em dash
  ];

  function sanitizeText(text) {
    let out = text;
    for (const [from, to] of TYPOGRAPHY_REPLACEMENTS) {
      if (out.indexOf(from) !== -1) out = out.split(from).join(to);
    }
    return out;
  }

  const sanitizerFilter = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    let dirty = false;
    const rewritten = [];
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const text = inserted.toString();
      const cleaned = sanitizeText(text);
      if (cleaned !== text) dirty = true;
      rewritten.push({ from: fromA, to: toA, insert: cleaned });
    });
    if (!dirty) return tr;
    // 1-to-1 character substitutions preserve all selection offsets.
    return [{
      changes: rewritten,
      selection: tr.selection,
      effects: tr.effects,
      scrollIntoView: tr.scrollIntoView,
      annotations: tr.annotations,
    }];
  });

  // ============================================================================
  // completion — context-aware. Never auto-applies.
  // ============================================================================

  const COMPLETION_SECTIONS = Object.freeze({
    voice: { name: 'voice', rank: 10 },
    sample: { name: 'sample', rank: 14 },
    directive: { name: 'directive', rank: 20 },
    tuning: { name: 'tuning', rank: 22 },
    coupling: { name: 'coupling', rank: 30 },
    live: { name: 'live', rank: 35 },
    param: { name: 'param', rank: 40 },
    effect: { name: 'effect', rank: 50 },
    value: { name: 'value', rank: 60 },
  });

  const COMPLETION_BOOST = Object.freeze({
    voice: 6,
    sample: 5,
    directive: 5,
    tuning: 6,
    coupling: 3,
    live: 1,
    param: 2,
    effect: 2,
    value: 0,
  });

  function completionCommitToken(label) {
    const raw = String(label || '').trim();
    if (!raw) return '';
    const spaceAt = raw.search(/\s/);
    return spaceAt === -1 ? raw : raw.slice(0, spaceAt);
  }

  function completionApplyTokenSuffix(token) {
    const target = completionCommitToken(token);
    if (!target) return null;
    return (view, _completion, from, to) => {
      const state = view && view.state;
      if (!state || !state.doc) return false;
      const docLen = state.doc.length;
      const safeFrom = Math.max(0, Math.min(Number.isFinite(from) ? from : 0, docLen));
      const safeTo = Math.max(safeFrom, Math.min(Number.isFinite(to) ? to : safeFrom, docLen));
      const current = state.sliceDoc(safeFrom, safeTo);
      const currentLower = String(current).toLowerCase();
      const targetLower = target.toLowerCase();

      if (current && targetLower.startsWith(currentLower)) {
        const suffix = target.slice(current.length);
        if (!suffix) return true;
        view.dispatch({
          changes: { from: safeTo, to: safeTo, insert: suffix },
        });
        return true;
      }

      view.dispatch({
        changes: { from: safeFrom, to: safeTo, insert: target },
      });
      return true;
    };
  }

  function withCompletionCategory(option, category) {
    if (!option) return option;
    const out = { ...option };
    const label = typeof out.label === 'string' ? out.label : '';
    const categoryKey = category || (typeof out.replCategory === 'string' ? out.replCategory : '');
    if (categoryKey) {
      out.replCategory = categoryKey;
      if (!out.section && COMPLETION_SECTIONS[categoryKey]) out.section = COMPLETION_SECTIONS[categoryKey];
      if (!Number.isFinite(out.boost) && Number.isFinite(COMPLETION_BOOST[categoryKey])) out.boost = COMPLETION_BOOST[categoryKey];
    }
    if (typeof out.apply !== 'string' && typeof out.apply !== 'function') {
      const token = completionCommitToken(label);
      if (token) out.apply = completionApplyTokenSuffix(token);
    }
    if (label && /\s/.test(label) && typeof out.info !== 'string') {
      const token = completionCommitToken(label);
      if (token) out.info = `Enter completes '${token}' only. Remaining text is guidance.`;
    }
    return out;
  }

  function withCompletionCategoryList(options, category) {
    if (!Array.isArray(options)) return [];
    return options.map((opt) => withCompletionCategory(opt, category));
  }

  function completionKeyBindingRun(keyName, view) {
    if (!Array.isArray(completionKeymap)) return false;
    for (const binding of completionKeymap) {
      if (!binding) continue;
      if (binding.key !== keyName && binding.mac !== keyName && binding.win !== keyName && binding.linux !== keyName) continue;
      if (typeof binding.run === 'function') {
        return binding.run(view) === true;
      }
      return false;
    }
    return false;
  }

  function completionWordMatch(state, pos, expr) {
    if (!state || !state.doc || !expr) return null;
    const line = state.doc.lineAt(pos);
    const before = line.text.slice(0, Math.max(0, pos - line.from));
    if (!before) return null;
    const flags = String(expr.flags || '').replace(/g/g, '');
    const anchored = new RegExp(`(?:${expr.source})$`, flags);
    const m = anchored.exec(before);
    if (!m || !m[0]) return null;
    return {
      from: line.from + (before.length - m[0].length),
      to: pos,
      text: m[0],
    };
  }

  function isLiveFeatureRefToken(raw) {
    const tok = String(raw || '').trim().toLowerCase();
    if (!tok) return false;
    const m = tok.match(LIVE_REF_RE);
    if (!m) return false;
    return LIVE_FEATURE_SET.has(String(m[2] || '').toLowerCase());
  }

  function isLikelyNumericExpressionToken(raw) {
    const tok = String(raw || '').trim().toLowerCase();
    if (!tok) return false;
    if (/^-?\d+$/.test(tok)) return true;
    if (/^-?\d+\.\d+$/.test(tok)) return true;
    if (/^-?\.\d+$/.test(tok)) return true;
    if (/^-?\d+\/\d+$/.test(tok)) return true;
    return /^-?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+)|pi)(?:[*/]-?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+)|pi))*$/.test(tok);
  }

  function classifyRowValuePhase(tokensSoFar, trailingSpace) {
    const tokens = Array.isArray(tokensSoFar) ? tokensSoFar.slice() : [];
    const committed = trailingSpace ? tokens : tokens.slice(0, -1);
    const active = trailingSpace ? '' : String(tokens[tokens.length - 1] || '');
    const liveRef = committed[0] || '';
    const firstIsLiveRef = isLiveFeatureRefToken(liveRef);

    if (!committed.length && isLiveFeatureRefToken(active)) {
      return { kind: 'live-min', liveRef: active, active };
    }
    if (committed.length === 1 && firstIsLiveRef) {
      return { kind: 'live-min', liveRef, active };
    }
    if (committed.length === 2 && firstIsLiveRef && isLikelyNumericExpressionToken(committed[1])) {
      return { kind: 'live-max', liveRef, active };
    }
    return { kind: 'value', active };
  }

  function paramNumericOptions(param) {
    const hints = PARAM_NUMERIC_HINTS[param] || ['0.25', '0.5', '0.75'];
    const detail = PARAM_NUMERIC_DETAIL[param] || 'numeric value';
    return hints.map((label) => ({ label, type: 'constant', detail }));
  }

  function paramValueContract(param) {
    if (param === 'harm') return 'harm: simple|pair|triad|rich, 0-4, operators, or source.feature min max';
    const named = PARAM_NAMED[param] || [];
    if (named.length > 0) {
      return `${param}: ${named.join('|')}, numeric value, operators, or source.feature min max`;
    }
    return `${param}: numeric value, operators, or source.feature min max`;
  }

  function buildParamBodyCompletion(param) {
    const liveSources = liveSourcesForCompletion();
    const named = PARAM_NAMED[param.name || ''] || [];
    const phase = classifyRowValuePhase(param.tokensSoFar || [], param.trailingSpace === true);

    if (phase.kind === 'live-min' || phase.kind === 'live-max') {
      const numericHint = phase.kind === 'live-min' ? 'modulation min' : 'modulation max';
      const opts = paramNumericOptions(param.name || '').map((opt) => ({
        ...opt,
        detail: `${numericHint} (${opt.detail})`,
      }));
      return {
        from: param.from,
        options: withCompletionCategoryList(opts, 'param'),
        validFor: /^-?(?:\d+(?:\.\d+)?|\.\d+|pi(?:\/\d+)?)?(?:[*/]-?(?:\d+(?:\.\d+)?|\.\d+|pi))*$/,
      };
    }

    const opts = [
      ...named.map((v) => ({ label: v, type: 'constant', detail: param.name })),
      ...paramNumericOptions(param.name || ''),
      ...liveSources.flatMap((src) => LIVE_FEATURES.map((f) => ({
        label: `${src}.${f}`,
        type: 'variable',
        detail: 'live modulation source',
      }))),
      ...COMMON_OPERATORS.map((op) => ({
        label: op,
        type: 'keyword',
        detail: opDescription(op),
      })),
    ];
    return {
      from: param.from,
      options: withCompletionCategoryList(
        opts.map((opt) => ({
          ...opt,
          info: typeof opt.info === 'string' ? opt.info : paramValueContract(param.name || ''),
        })),
        'param'
      ),
    };
  }

  function buildEffectBodyCompletion(effect) {
    const liveSources = liveSourcesForCompletion();
    const phase = classifyRowValuePhase(effect.tokensSoFar || [], effect.trailingSpace === true);

    if (phase.kind === 'live-min' || phase.kind === 'live-max') {
      const hint = phase.kind === 'live-min' ? 'modulation min' : 'modulation max';
      const opts = [
        { label: '0.1', type: 'constant', detail: `${hint} (0..1)` },
        { label: '0.4', type: 'constant', detail: `${hint} (0..1)` },
        { label: '0.8', type: 'constant', detail: `${hint} (0..1)` },
      ];
      return {
        from: effect.from,
        options: withCompletionCategoryList(opts, 'effect'),
        validFor: /^-?(?:\d+(?:\.\d+)?|\.\d+|pi(?:\/\d+)?)?(?:[*/]-?(?:\d+(?:\.\d+)?|\.\d+|pi))*$/,
      };
    }

    const opts = [
      ...EFFECT_NAMED.map((m) => ({ label: m, type: 'constant', detail: effect.name })),
      { label: '0.25', type: 'constant', detail: '0..1' },
      { label: '0.5', type: 'constant', detail: '0..1' },
      { label: '0.75', type: 'constant', detail: '0..1' },
      ...liveSources.flatMap((src) => LIVE_FEATURES.map((f) => ({
        label: `${src}.${f}`,
        type: 'variable',
        detail: 'live modulation source',
      }))),
      ...COMMON_OPERATORS.map((op) => ({
        label: op,
        type: 'keyword',
        detail: opDescription(op),
      })),
    ];
    return {
      from: effect.from,
      options: withCompletionCategoryList(opts, 'effect'),
    };
  }

  function classifyContext(state, pos, ctx) {
    const line = state.doc.lineAt(pos);
    const beforeCursorOnLine = line.text.slice(0, Math.max(0, pos - line.from));

    // Inside a comment? Don't complete.
    const commentIdx = beforeCursorOnLine.indexOf('//');
    if (commentIdx !== -1) return { kind: 'comment' };

    // Word boundary for "from"
    const wordMatch = ctx.matchBefore(/[A-Za-z0-9_.\-#*&!~/]+/);
    const from = wordMatch ? wordMatch.from : pos;

    const trimmed = beforeCursorOnLine.replace(/^\s+/, '');
    const indentLen = beforeCursorOnLine.length - trimmed.length;

    // At line head? "trimmed" is either empty or a single bare word with no
    // trailing whitespace.
    if (trimmed.length === 0 || /^[A-Za-z][A-Za-z0-9_.-]*$/.test(trimmed)) {
      return { kind: 'head', from: line.from + indentLen, headWord: trimmed.toLowerCase() };
    }

    // Determine the line head (first whitespace-bounded token)
    const headMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_.-]*)(\s+)(.*)$/);
    if (!headMatch) return { kind: 'unknown', from };

    const head = headMatch[1].toLowerCase();
    const rest = headMatch[3];
    const trailingSpace = /\s$/.test(rest);
    const tokensSoFar = rest.trim().split(/\s+/).filter(Boolean);

    if (HEAD_COUPLING.has(head)) {
      return {
        kind: 'coupling-body',
        head,
        position: tokensSoFar.length,
        tokensSoFar,
        trailingSpace,
        from,
      };
    }
    if (HEAD_VOICE.has(head)) {
      return { kind: 'voice-body', voice: head, from, tokensSoFar, trailingSpace };
    }
    if (HEAD_PARAM.has(head)) {
      return { kind: 'param-body', param: head, from, tokensSoFar, trailingSpace };
    }
    if (HEAD_EFFECT.has(head)) {
      return { kind: 'effect-body', effect: head, from, tokensSoFar, trailingSpace };
    }
    if (HEAD_DIRECTIVE.has(head)) {
      return { kind: 'directive-body', directive: head, from };
    }
    return { kind: 'unknown', from };
  }

  function classifyContextAt(state, pos) {
    return classifyContext(state, pos, {
      matchBefore: (expr) => completionWordMatch(state, pos, expr),
    });
  }

  function shouldOpenShiftCompletionForContext(here) {
    if (!here || typeof here.kind !== 'string') return false;
    if (here.kind === 'param-body' || here.kind === 'effect-body') return true;
    if (here.kind === 'head' && (HEAD_PARAM.has(here.headWord) || HEAD_EFFECT.has(here.headWord))) return true;
    return false;
  }

  function getSampleNamesSafe() {
    if (!editorEnvRef.getSampleNames) return [];
    try { return editorEnvRef.getSampleNames() || []; } catch (_) { return []; }
  }
  function getSampleGroupsSafe() {
    if (!editorEnvRef.getSampleGroups) return [];
    try { return editorEnvRef.getSampleGroups() || []; } catch (_) { return []; }
  }
  function getDrumKitsSafe() {
    if (!editorEnvRef.getDrumKits) return [];
    try { return editorEnvRef.getDrumKits() || []; } catch (_) { return []; }
  }
  function getGeneratedVideoIdsSafe() {
    if (!editorEnvRef.getVideoGeneratedIds) return [];
    try { return editorEnvRef.getVideoGeneratedIds() || []; } catch (_) { return []; }
  }
  function getTuningPresetIdsSafe() {
    if (root.ReplTunings && typeof root.ReplTunings.listPresetIds === 'function') {
      try { return root.ReplTunings.listPresetIds(200) || []; } catch (_) { return []; }
    }
    return [];
  }

  function videoDebugEnabledInEditor() {
    return editorEnvRef.enableVideoDebug === true;
  }

  function voiceWordsForCompletion() {
    if (videoDebugEnabledInEditor()) return VOICE_WORDS;
    return VOICE_WORDS.filter((w) => w !== 'video');
  }

  function attractorsForCompletion() {
    if (videoDebugEnabledInEditor()) return ATTRACTORS;
    return ATTRACTORS.filter((a) => !VIDEO_LIVE_SOURCES.has(String(a || '').toLowerCase()));
  }

  function liveSourcesForCompletion() {
    return videoDebugEnabledInEditor() ? LIVE_SOURCES : NON_VIDEO_LIVE_SOURCES;
  }

  // The completion source is referenced by language config above, so it must
  // be hoistable. We bind it as a function declaration.
  function completionSource(ctx) {
    const here = classifyContext(ctx.state, ctx.pos, ctx);
    if (here.kind === 'comment') return null;

    const explicit = ctx.explicit;
    const wordMatch = ctx.matchBefore(/[A-Za-z0-9_.\-#*&!~/]+/);
    const from = wordMatch ? wordMatch.from : ctx.pos;

    if (here.kind === 'head') {
      if (here.headWord && HEAD_PARAM.has(here.headWord)) {
        return buildParamBodyCompletion({
          name: here.headWord,
          from: ctx.pos,
          tokensSoFar: [],
          trailingSpace: true,
        });
      }
      if (here.headWord && HEAD_EFFECT.has(here.headWord)) {
        return buildEffectBodyCompletion({
          name: here.headWord,
          from: ctx.pos,
          tokensSoFar: [],
          trailingSpace: true,
        });
      }
      // Don't fire on every keystroke at a blank cursor; only when the user
      // is mid-word or has hit the trigger.
      if (!explicit && !wordMatch) return null;
      const opts = [
        ...voiceWordsForCompletion().map((w) => withCompletionCategory({ label: w, type: 'keyword', detail: 'voice' }, 'voice')),
        ...DIRECTIVES.map((w) => withCompletionCategory({ label: w, type: 'keyword', detail: 'directive' }, 'directive')),
        ...PARAMS.map((w) => withCompletionCategory({ label: w, type: 'property', detail: 'param' }, 'param')),
        ...EFFECTS.map((w) => withCompletionCategory({ label: w, type: 'property', detail: 'effect' }, 'effect')),
        ...COUPLING.map((w) => withCompletionCategory({ label: w, type: 'keyword', detail: 'coupling' }, 'coupling')),
      ];
      return { from: here.from, options: opts, validFor: /^[A-Za-z][A-Za-z0-9_.-]*$/ };
    }

    if (here.kind === 'coupling-body') {
      if (here.head === 'attractor') {
        const opts = attractorsForCompletion().map((a) => ({ label: a, type: 'class', detail: 'attractor' }));
        return { from, options: withCompletionCategoryList(opts, 'coupling'), validFor: /^[A-Za-z][A-Za-z0-9_.-]*$/ };
      }
      if (here.head === 'source') {
        if (here.position === 0) {
          const opts = [
            ...SOURCE_KEYS.map((s) => ({ label: s, type: 'property', detail: 'source key' })),
            ...(videoDebugEnabledInEditor()
              ? [
                  { label: 'camera', type: 'class', detail: 'video gen source' },
                  { label: 'screen', type: 'class', detail: 'video gen source' },
                  { label: 'file', type: 'class', detail: 'video gen source' },
                  ...getGeneratedVideoIdsSafe().map((id) => ({ label: id, type: 'text', detail: 'generated video clip' })),
                ]
              : []),
          ];
          return { from, options: withCompletionCategoryList(opts, 'coupling'), validFor: /^[A-Za-z0-9_.-]*$/ };
        }
        return null;
      }
        if (here.head === 'every') {
          const opts = [
            { label: '4', type: 'constant', detail: 'count for every <N> bars/beats' },
            { label: '8', type: 'constant', detail: 'count for every <N> bars/beats' },
            { label: 'bars', type: 'text', detail: 'unit' },
            { label: 'beats', type: 'text', detail: 'unit' },
          ];
          return { from, options: withCompletionCategoryList(opts, 'coupling') };
        }

        if (here.head === 'time' || here.head === 'beat' || here.head === 'leaf' || here.head === 'choose' || here.head === 'trigger') {
          const liveSources = liveSourcesForCompletion();
          const opts = [
            ...liveSources.map((src) => ({ label: src, type: 'class', detail: 'live source' })),
            ...liveSources.flatMap((src) => LIVE_FEATURES.map((f) => ({ label: `${src}.${f}`, type: 'variable', detail: here.head }))),
          ];
          return { from, options: withCompletionCategoryList(opts, 'live'), validFor: /^[A-Za-z][A-Za-z0-9_.-]*$/ };
        }

        if (here.head === 'fade') {
          const opts = [
            { label: 'in', type: 'function', detail: 'e.g. fade in 30s' },
            { label: 'out', type: 'function', detail: 'e.g. fade out 30s' },
            { label: 'inout', type: 'function', detail: 'e.g. fade inout 30s hold 10s' },
            { label: 'outin', type: 'function', detail: 'e.g. fade outin 8s hold 2s' },
            { label: 'hold', type: 'keyword', detail: 'freeze current fade level' },
            { label: 'clear', type: 'keyword', detail: 'remove fade automation' },
          ];
          return { from, options: withCompletionCategoryList(opts, 'coupling') };
        }

        return null;
    }

    if (here.kind === 'directive-body') {
      if (here.directive === 'eval' || here.directive === 'evaluate') {
        const opts = withCompletionCategoryList([
          { label: 'reset', type: 'keyword', detail: 'queue evaluate at next bar reset when running' },
          { label: 'keep', type: 'keyword', detail: "use with 'eval reset' to keep previous tails (default)" },
          { label: 'cut', type: 'keyword', detail: "use with 'eval reset' to cut previous audio at boundary" },
          { label: 'now', type: 'keyword', detail: 'evaluate immediately (default)' },
        ], 'directive');
        return { from, options: opts };
      }
      if (here.directive === 'meter') {
        const opts = withCompletionCategoryList([
          { label: '4/4', type: 'constant' },
          { label: '3/4', type: 'constant' },
          { label: '6/8', type: 'constant' },
          { label: '5/4', type: 'constant' },
          { label: '7/8', type: 'constant' },
        ], 'directive');
        return { from, options: opts };
      }
      if (here.directive === 'tempo') {
        const opts = withCompletionCategoryList([
          { label: '60', type: 'constant' },
          { label: '84', type: 'constant' },
          { label: '92', type: 'constant' },
          { label: '110', type: 'constant' },
          { label: '120', type: 'constant' },
          { label: '140', type: 'constant' },
        ], 'directive');
        return { from, options: opts };
      }
      if (here.directive === 'tuning') {
        const line = ctx.state.doc.lineAt(ctx.pos);
        const beforeCursorOnLine = line.text.slice(0, Math.max(0, ctx.pos - line.from));
        const directiveArgs = beforeCursorOnLine
          .replace(/^\s*tuning\b/i, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const isSecondArg = directiveArgs.length >= 2
          || (directiveArgs.length === 1 && /[\s]$/.test(beforeCursorOnLine));
        const presetIds = getTuningPresetIdsSafe();
        if (isSecondArg) {
          const opts = withCompletionCategoryList([
            { label: '432', type: 'constant', detail: 'A4 override (Hz)' },
            { label: '440', type: 'constant', detail: 'A4 override (Hz, default)' },
            { label: '500', type: 'constant', detail: 'A4 override (Hz)' },
          ], 'tuning');
          return { from, options: opts, validFor: /^[0-9.]*$/ };
        }
        const opts = withCompletionCategoryList(
          presetIds.length
            ? presetIds.map((id) => ({ label: id, type: 'constant', detail: 'tuning preset id' }))
            : [{ label: 'kirnberger-3', type: 'constant', detail: 'tuning preset id' }],
          'tuning'
        );
        return { from, options: opts, validFor: /^[A-Za-z0-9_.\-/]*$/ };
      }
      return null;
    }

    if (here.kind === 'param-body') {
      if (here.param === 'style') {
        const opts = ['surveillance', 'thermal', 'collage', 'ghost', 'difference']
          .map((label) => ({ label, type: 'constant', detail: 'video gen style' }));
        return { from, options: withCompletionCategoryList(opts, 'param') };
      }
      if (here.param === 'seed') {
        const opts = ['blackbox', 'archive', 'weather', 'camera', 'grid']
          .map((label) => ({ label, type: 'text', detail: 'video gen seed' }));
        return { from, options: withCompletionCategoryList(opts, 'param') };
      }
      if (here.param === 'duration') {
        const opts = [
          { label: '4s', type: 'constant', detail: 'seconds' },
          { label: '6s', type: 'constant', detail: 'seconds' },
          { label: '12s', type: 'constant', detail: 'seconds' },
        ];
        return { from, options: withCompletionCategoryList(opts, 'param') };
      }
      if (here.param === 'cache') {
        const opts = ['live', 'memory', 'hold']
          .map((label) => ({ label, type: 'constant', detail: 'video gen cache' }));
        return { from, options: withCompletionCategoryList(opts, 'param') };
      }
      if (here.param === 'glide') {
        const opts = [
          { label: '0.04', type: 'constant', detail: 'seconds' },
          { label: '0.08', type: 'constant', detail: 'seconds' },
          { label: '0.16', type: 'constant', detail: 'seconds' },
          { label: '0.32', type: 'constant', detail: 'seconds' },
        ];
        return { from, options: withCompletionCategoryList(opts, 'param'), validFor: /^[0-9.]*$/ };
      }
      const kitIds = here.param === 'kit'
        ? getDrumKitsSafe().map((k) => (k && k.id ? String(k.id) : '')).filter(Boolean)
        : [];
      if (here.param === 'kit') {
        const opts = kitIds.length
          ? kitIds.map((id) => ({ label: id, type: 'constant', detail: 'drum kit id' }))
          : [{ label: '909', type: 'constant', detail: 'drum kit id' }, { label: 'tub-grid', type: 'constant', detail: 'drum kit id' }];
        return { from, options: withCompletionCategoryList(opts, 'param'), validFor: /^[A-Za-z0-9_-]*$/ };
      }
      return buildParamBodyCompletion({
        name: here.param,
        from,
        tokensSoFar: here.tokensSoFar,
        trailingSpace: here.trailingSpace,
      });
    }

    if (here.kind === 'effect-body') {
      return buildEffectBodyCompletion({
        name: here.effect,
        from,
        tokensSoFar: here.tokensSoFar,
        trailingSpace: here.trailingSpace,
      });
    }

    if (here.kind === 'voice-body') {
      if (here.voice === 'string' || here.voice === 'sine' || here.voice === 'osc' || here.voice === 'pluck' || here.voice === 'drone') {
        const opts = [
          { label: 'A3', type: 'variable', detail: 'pitch' },
          { label: 'C4', type: 'variable', detail: 'pitch' },
          { label: 'E4', type: 'variable', detail: 'pitch' },
          { label: 'G4', type: 'variable', detail: 'pitch' },
          { label: '>6*', type: 'keyword', detail: 'pitch span start (down)' },
          { label: '<6*', type: 'keyword', detail: 'pitch span start (up)' },
          { label: '>>6*', type: 'keyword', detail: 'shared pitch span start (down)' },
          { label: '<<6*', type: 'keyword', detail: 'shared pitch span start (up)' },
          { label: 'G%', type: 'keyword', detail: 'pitch span end (same octave)' },
          { label: 'Bb%', type: 'keyword', detail: 'pitch span end (same octave)' },
          ...COMMON_OPERATORS.map((op) => ({ label: op, type: 'keyword', detail: opDescription(op) })),
          { label: '*4', type: 'keyword', detail: 'random pitch in oct 4' },
          { label: '*!4', type: 'keyword', detail: 'frozen random pitch in oct 4' },
          { label: 'A*', type: 'keyword', detail: 'random A octave' },
          { label: '~', type: 'keyword', detail: 'sustain previous' },
          { label: '.', type: 'keyword', detail: 'rest' },
          { label: '|', type: 'keyword', detail: 'bar' },
        ];
        return { from, options: withCompletionCategoryList(opts, 'voice') };
      }
      if (here.voice === 'noise' || here.voice === 'pulse') {
        const opts = [
          { label: '*', type: 'keyword', detail: here.voice === 'pulse' ? 'pulse hit' : 'noise hit' },
          { label: '*!', type: 'keyword', detail: here.voice === 'pulse' ? 'frozen pulse hit' : 'frozen noise hit' },
          { label: '~', type: 'keyword', detail: here.voice === 'pulse' ? 'held pulse cell' : 'held noise texture' },
          { label: '.', type: 'keyword', detail: 'rest' },
          { label: '|', type: 'keyword', detail: 'bar' },
        ];
        return { from, options: withCompletionCategoryList(opts, 'voice') };
      }
      if (here.voice === 'drum') {
        const opts = [
          { label: 'k', type: 'keyword', detail: 'kick lane' },
          { label: 's', type: 'keyword', detail: 'snare lane' },
          { label: 'h', type: 'keyword', detail: 'hat lane' },
          { label: 'o', type: 'keyword', detail: 'other/perc lane' },
          { label: 't', type: 'keyword', detail: 'tom lane' },
          { label: 'r', type: 'keyword', detail: 'ride lane' },
          { label: 'c', type: 'keyword', detail: 'crash lane' },
          { label: '*', type: 'keyword', detail: 'random hit from kit pool' },
          { label: 'k!', type: 'keyword', detail: 'frozen kick pick for this leaf' },
          { label: 's!', type: 'keyword', detail: 'frozen snare pick for this leaf' },
          { label: 'h!', type: 'keyword', detail: 'frozen hat pick for this leaf' },
          { label: 'o!', type: 'keyword', detail: 'frozen other pick for this leaf' },
          { label: 't!', type: 'keyword', detail: 'frozen tom pick for this leaf' },
          { label: 'r!', type: 'keyword', detail: 'frozen ride pick for this leaf' },
          { label: 'c!', type: 'keyword', detail: 'frozen crash pick for this leaf' },
          { label: '*!', type: 'keyword', detail: 'frozen kit-pool pick for this leaf' },
          { label: '~', type: 'keyword', detail: 'hold cell' },
          { label: '.', type: 'keyword', detail: 'rest' },
          { label: '|', type: 'keyword', detail: 'bar' },
        ];
        return { from, options: withCompletionCategoryList(opts, 'voice') };
      }
      if (here.voice === 'video') {
        if (!videoDebugEnabledInEditor()) return null;
        const opts = [
          { label: 'camera', type: 'class', detail: 'webcam source' },
          { label: 'screen', type: 'class', detail: 'screen/tab capture source' },
          { label: 'file', type: 'class', detail: 'uploaded file source' },
          { label: 'gen', type: 'class', detail: 'local generative block mode' },
          { label: '*', type: 'keyword', detail: 'committed visual hit' },
          { label: '*!', type: 'keyword', detail: 'frozen visual hit token' },
          { label: '~', type: 'keyword', detail: 'hold cell' },
          { label: '.', type: 'keyword', detail: 'rest' },
          { label: '|', type: 'keyword', detail: 'bar' },
        ];
        return { from, options: withCompletionCategoryList(opts, 'voice'), validFor: /^[A-Za-z0-9_.!*~-]*$/ };
      }
      if (here.voice === 'input') {
        const opts = [
          { label: 'mic', type: 'class', detail: 'browser microphone' },
          { label: 'interface', type: 'class', detail: 'audio interface input' },
          { label: 'tab', type: 'class', detail: 'shared tab audio' },
        ];
        return { from, options: withCompletionCategoryList(opts, 'voice'), validFor: /^[A-Za-z][A-Za-z0-9_.-]*$/ };
      }
      if (here.voice === 'sample') {
        const samples = getSampleNamesSafe();
        const groups = getSampleGroupsSafe();
        const opts = [];
        // Useful selector examples first.
        const selectorExamples = [
          ['*', 'random sample from full bank'],
          ['*;', 'random, gated to slot'],
          ['snm-*', 'random snm sample'],
          ['snm-*!', 'frozen random snm sample'],
          ['snm-*&30', 'snm crossfade over 30s'],
          ['snm-*&30!', 'frozen snm pair, 30s grain'],
          ['snm-*/tub-*&30', 'snm or tub union, gradient'],
          ['tub-*', 'random tub sample'],
          ['amp-*', 'random amp sample'],
          ['lux-*', 'random lux sample'],
          ['b3-*', 'random b3 sample'],
        ];
        for (const [label, detail] of selectorExamples) {
          opts.push({ label, type: 'keyword', detail });
        }
        // Group-prefixed wildcards from manifest groups.
        for (const g of groups) {
          if (g && g.prefix) {
            opts.push({ label: `${g.prefix}-*`, type: 'keyword', detail: `${g.label || g.prefix} bank` });
          }
        }
        // Concrete sample names.
        for (const name of samples) {
          opts.push({ label: name, type: 'text', detail: 'sample' });
        }
        return { from, options: withCompletionCategoryList(opts, 'sample') };
      }
    }

    return null;
  }

  function opDescription(op) {
    switch (op) {
      case '*': return 'random pick';
      case '*!': return 'frozen random';
      case '*~': return 'continuous random';
      case '*&8': return '8-second drift';
      case '*&16': return '16-second drift';
      case '*&30': return '30-second drift';
      case '~': return 'hold previous';
      case '_': return 'reset to default';
      default: return '';
    }
  }

  // Capture-by-reference for completion source so callbacks see live env.
  const editorEnvRef = {};

  // ============================================================================
  // diagnostics — debounced parser run mapped to CodeMirror linter.
  // ============================================================================

  function buildLinter(parseFn) {
    return linter((view) => {
      if (typeof parseFn !== 'function') return [];
      let result;
      try {
        result = parseFn(view.state.doc.toString());
      } catch (err) {
        return [];
      }
      if (!result || result.ok) return [];
      const diags = [];
      const doc = view.state.doc;
      for (const e of (result.errors || [])) {
        let line = e.line;
        if (!Number.isFinite(line) || line < 1 || line > doc.lines) line = 1;
        const lineObj = doc.line(line);
        diags.push({
          from: lineObj.from,
          to: lineObj.to,
          severity: 'error',
          message: e.message || 'parse error',
        });
      }
      return diags;
    }, {
      delay: 160,
      // Don't surface tooltips on hover — the gutter underline is enough.
    });
  }

  // ============================================================================
  // keymap — privileged transport bindings; do not reach outside the editor.
  // ============================================================================

  function makeKeymap(callbacks, viewRef) {
    const cmd = callbacks || {};
    const tabBinding = (view) => {
      if (completionStatus(view.state) === 'active') {
        return acceptCompletion(view);
      }
      view.dispatch(view.state.replaceSelection('  '));
      return true;
    };
    const completionMoveDown = (view) => {
      if (typeof moveCompletionSelection === 'function') {
        const move = moveCompletionSelection(true);
        if (typeof move === 'function' && move(view) === true) return true;
      }
      return completionKeyBindingRun('ArrowDown', view);
    };
    const completionMoveUp = (view) => {
      if (typeof moveCompletionSelection === 'function') {
        const move = moveCompletionSelection(false);
        if (typeof move === 'function' && move(view) === true) return true;
      }
      return completionKeyBindingRun('ArrowUp', view);
    };
    const completionPageDown = (view) => {
      if (typeof moveCompletionSelection === 'function') {
        const move = moveCompletionSelection(true, 'page');
        if (typeof move === 'function' && move(view) === true) return true;
      }
      return completionKeyBindingRun('PageDown', view);
    };
    const completionPageUp = (view) => {
      if (typeof moveCompletionSelection === 'function') {
        const move = moveCompletionSelection(false, 'page');
        if (typeof move === 'function' && move(view) === true) return true;
      }
      return completionKeyBindingRun('PageUp', view);
    };
    const completionClose = (view) => {
      if (typeof closeCompletion === 'function' && closeCompletion(view) === true) return true;
      return completionKeyBindingRun('Escape', view);
    };

    return [
      // Higher precedence than defaults so Cmd-Enter never falls through.
      Prec.highest(keymap.of([
        {
          key: 'Mod-Shift-Enter',
          preventDefault: true,
          run: (view) => {
            if (cmd.safePlay) cmd.safePlay();
            view.focus();
            return true;
          },
        },
        {
          key: 'Mod-Enter',
          preventDefault: true,
          run: (view) => {
            if (cmd.play) cmd.play();
            view.focus();
            return true;
          },
        },
        {
          key: 'Escape',
          preventDefault: true,
          run: (view) => {
            if (completionStatus(view.state) === 'active') {
              completionClose(view);
              return true;
            }
            if (cmd.stop) cmd.stop();
            view.focus();
            return true;
          },
        },
        {
          key: 'Mod-s',
          preventDefault: true,
          run: (view) => {
            if (cmd.share) cmd.share();
            view.focus();
            return true;
          },
        },
        {
          key: 'Mod-i',
          preventDefault: true,
          run: (view) => {
            if (cmd.toggleIO) cmd.toggleIO();
            view.focus();
            return true;
          },
        },
        {
          key: 'Mod-k',
          preventDefault: true,
          run: () => true, // reserved for future command palette
        },
        {
          key: 'Mod-/',
          preventDefault: true,
          run: toggleLineComment,
        },
        {
          key: 'Tab',
          preventDefault: true,
          run: tabBinding,
        },
        {
          key: 'Shift-Tab',
          preventDefault: true,
          run: indentLess,
        },
        {
          key: 'ArrowDown',
          run: (view) => {
            if (completionStatus(view.state) !== 'active') return false;
            completionMoveDown(view);
            return true;
          },
        },
        {
          key: 'ArrowUp',
          run: (view) => {
            if (completionStatus(view.state) !== 'active') return false;
            completionMoveUp(view);
            return true;
          },
        },
        {
          key: 'PageDown',
          run: (view) => {
            if (completionStatus(view.state) !== 'active') return false;
            completionPageDown(view);
            return true;
          },
        },
        {
          key: 'PageUp',
          run: (view) => {
            if (completionStatus(view.state) !== 'active') return false;
            completionPageUp(view);
            return true;
          },
        },
        {
          // Enter accepts an open completion; otherwise falls through to
          // the default newline insertion via lower-precedence keymaps.
          key: 'Enter',
          run: (view) => {
            if (completionStatus(view.state) === 'active') {
              acceptCompletion(view);
              return true;
            }
            return false;
          },
        },
        {
          key: 'Ctrl-Space',
          run: startCompletion,
        },
      ])),
    ];
  }

  // ============================================================================
  // factory — wires it all up and returns the adapter.
  // ============================================================================

  function createReplEditor(options) {
    const opts = options || {};
    const parent = opts.parent;
    if (!parent) throw new Error('createReplEditor: parent is required');

    // Bind environment refs used by the completion source.
    editorEnvRef.getSampleNames = opts.getSampleNames;
    editorEnvRef.getSampleGroups = opts.getSampleGroups;
    editorEnvRef.getDrumKits = opts.getDrumKits;
    editorEnvRef.getVideoGeneratedIds = opts.getVideoGeneratedIds;
    editorEnvRef.enableVideoDebug = opts.enableVideoDebug === true;
    editorEnvRef.onToggleBlockMute = typeof opts.onToggleBlockMute === 'function'
      ? opts.onToggleBlockMute
      : null;
    editorEnvRef.blockMuteLines = normalizeBlockMuteLines(opts.blockMuteLines || null);

    const onChange = typeof opts.onChange === 'function' ? opts.onChange : null;

    const parseFn = typeof opts.parseForDiagnostics === 'function'
      ? opts.parseForDiagnostics
      : null;

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged && onChange) {
        onChange(u.state.doc.toString());
      }
    });

    const extensions = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      replLanguageWithTags,
      syntaxHighlighting(replHighlight),
      cyberneticScorePlugin,
      selectionStateClassPlugin,
      selectionMaskPlugin,
      blockMuteDecorationsPlugin,
      blockMuteMousePlugin,
      dslSelectionMousePlugin,
      autocompletion({
        override: [completionSource],
        activateOnTyping: true,
        interactionDelay: 0,
        filterStrict: true,
        optionClass: (completion) => {
          const category = completion && typeof completion.replCategory === 'string'
            ? completion.replCategory
            : '';
          if (!category) return '';
          return `cm-repl-suggest cm-repl-suggest-${category}`;
        },
        defaultKeymap: false,
        closeOnBlur: true,
        icons: false,
      }),
      sanitizerFilter,
      replTheme,
      updateListener,
      EditorView.contentAttributes.of({
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
        autocomplete: 'off',
        translate: 'no',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        'aria-label': 'REPL score editor',
      }),
      placeholder('// start typing — Cmd-Enter to evaluate'),
      // keymap built last so it can reference the eventual view via closure.
      makeKeymap(opts.onCommand || {}),
      // baseline editing keymap, lower precedence
      keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...lintKeymap]),
    ];

    if (parseFn) extensions.push(buildLinter(parseFn));

    const initialText = typeof opts.initialText === 'string' ? opts.initialText : '';

    const state = EditorState.create({
      doc: initialText,
      extensions,
    });

    const view = new EditorView({ state, parent });

    // Reinforce contentDOM attributes after mount in case the theme injects
    // extras downstream.
    const cd = view.contentDOM;
    cd.setAttribute('spellcheck', 'false');
    cd.setAttribute('autocorrect', 'off');
    cd.setAttribute('autocapitalize', 'off');
    cd.setAttribute('autocomplete', 'off');
    cd.setAttribute('data-gramm', 'false');
    cd.setAttribute('data-gramm_editor', 'false');
    cd.setAttribute('data-enable-grammarly', 'false');

    // Shift-only explicit completion trigger:
    // if the cursor is parked on a param/effect row, tapping Shift opens
    // the same legality-scoped completion menu without moving the caret.
    let shiftTapSnapshot = null;
    view.dom.addEventListener('keydown', (e) => {
      if (!(e instanceof KeyboardEvent)) return;
      if (e.key !== 'Shift' || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const sel = view.state.selection.main;
      shiftTapSnapshot = {
        anchor: sel.anchor,
        head: sel.head,
        docLen: view.state.doc.length,
      };
    });
    view.dom.addEventListener('keyup', (e) => {
      if (!(e instanceof KeyboardEvent)) return;
      if (e.key !== 'Shift') return;
      const snap = shiftTapSnapshot;
      shiftTapSnapshot = null;
      if (!snap) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (completionStatus(view.state) === 'active') return;
      const sel = view.state.selection.main;
      if (sel.anchor !== snap.anchor || sel.head !== snap.head) return;
      if (view.state.doc.length !== snap.docLen) return;
      const here = classifyContextAt(view.state, sel.head);
      if (!shouldOpenShiftCompletionForContext(here)) return;
      startCompletion(view);
    });

    // Adapter API.
    const api = {
      getView() { return view; },

      getValue() {
        return view.state.doc.toString();
      },

      setValue(text) {
        const safe = sanitizeText(typeof text === 'string' ? text : '');
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: safe },
        });
      },

      focus() {
        view.focus();
      },

      getCursor() {
        return view.state.selection.main.head;
      },

      setCursor(pos) {
        const max = view.state.doc.length;
        const clamped = Math.max(0, Math.min(max, pos | 0));
        view.dispatch({ selection: { anchor: clamped } });
      },

      selectRange(from, to) {
        const max = view.state.doc.length;
        const f = Math.max(0, Math.min(max, from | 0));
        const tt = Math.max(0, Math.min(max, to | 0));
        view.dispatch({ selection: { anchor: f, head: tt }, scrollIntoView: true });
      },

      dispatchTextChange(from, to, text) {
        const docLen = view.state.doc.length;
        const f = Math.max(0, Math.min(docLen, from | 0));
        const tt = Math.max(f, Math.min(docLen, to | 0));
        view.dispatch({
          changes: { from: f, to: tt, insert: typeof text === 'string' ? text : '' },
        });
      },

      replaceSelection(text) {
        const insert = typeof text === 'string' ? text : '';
        view.dispatch(view.state.replaceSelection(insert));
      },

      setMutedBlockLines(lines) {
        const normalized = normalizeBlockMuteLines(lines || null);
        editorEnvRef.blockMuteLines = normalized;
        view.dispatch({
          effects: setBlockMuteLinesEffect.of(normalized),
        });
      },

      // Insert at the cursor, applying repl's surrounding-whitespace rule:
      //   add a leading space unless the previous char is whitespace or '('
      //   add a trailing space unless the next char is whitespace or ')'
      insertText(text) {
        const value = typeof text === 'string' ? text : '';
        const sel = view.state.selection.main;
        const doc = view.state.doc;
        const before = sel.from > 0 ? doc.sliceString(sel.from - 1, sel.from) : '';
        const after = sel.to < doc.length ? doc.sliceString(sel.to, sel.to + 1) : '';
        const needLead = before && !/\s|\(/.test(before);
        const needTrail = after && !/\s|\)/.test(after);
        const lead = needLead ? ' ' : '';
        const trail = needTrail ? ' ' : '';
        const insert = lead + value + trail;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert },
          selection: { anchor: sel.from + insert.length },
        });
      },
    };

    return api;
  }

  root.createReplEditor = createReplEditor;
})(window);
