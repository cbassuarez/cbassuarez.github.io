// DSL — score-grid notation parser. Each top-level "slot" can be a leaf
// token (note / rest / sustain / sample id) or a parenthesized group of
// slot tokens, which subdivides the slot's time evenly among its children.
// Groups can nest. Polyrhythms come for free: different voice blocks can
// declare different slot counts per bar; they all play in parallel.
//
// Public API:
//   ReplDSL.parse(text) → { ok: true, program } | { ok: false, errors }

(function (root) {
  'use strict';

    const VOICE_NAMES = new Set(['string', 'sample', 'sine', 'osc', 'noise', 'pluck', 'pulse', 'drone', 'drum', 'video']);
    const VIDEO_SOURCE_NAMES = new Set(['camera', 'screen', 'file', 'gen']);
    const INPUT_SOURCE_NAMES = new Set(['mic', 'interface', 'tab']);
    const INPUT_ROW_NAMES = new Set(['monitor', 'listen']);
    const PARAM_NAMES = new Set([
      'force', 'decay', 'crush', 'resolution', 'pan', 'gain', 'tone', 'harm', 'octave',
      'every', 'rate', 'start', 'speed', 'glide', 'variance', 'monitor', 'listen',
      'opacity', 'threshold', 'edges', 'posterize', 'invert', 'contrast', 'saturate',
      'displace', 'feedback', 'delay', 'slitscan', 'trail', 'mask', 'key', 'color', 'blend',
    ]);
    const LIVE_CONTROL_NAMES = new Set(['time', 'beat', 'leaf', 'choose', 'trigger']);
    const LIVE_SOURCE_NAMES = new Set(['mic', 'interface', 'tab', 'input', 'camera', 'screen', 'file', 'video']);
    const LIVE_FEATURE_NAMES = new Set([
      'intensity', 'rms', 'loudness',
      'volatility', 'flux',
      'pressure',
      'density',
      'periodicity',
      'rupture', 'onset',
      'age', 'silence',
      'confidence',
      'brightness', 'centroid',
      'noisiness', 'flatness',
      'roughness',
      'motion', 'presence', 'contrast', 'colortemp', 'saturation', 'edges',
      'flowx', 'flowy', 'stillness', 'flicker', 'centroidx', 'centroidy',
      'faces', 'body', 'depth',
    ]);
    const EFFECT_NAMES = new Set(['compress', 'space', 'resonance', 'comb', 'grain', 'chorus', 'excite', 'blur', 'scar', 'body']);
    const BLOCK_DIRECTIVES = new Set(['attractor', 'source']);
    const VIDEO_GEN_ROW_NAMES = new Set(['source', 'style', 'seed', 'duration', 'cache']);
    const FADE_DIRECTIVES = new Set(['fade']);
    const FILE_DIRECTIVES = new Set(['tempo', 'meter', 'eval', 'evaluate', 'tuning']);

    const EFFECT_MODE_NAMES = {
      compress: new Set(['feedback', 'glue', 'clamp']),
      space: new Set(['memory', 'weather', 'room', 'horizon']),
      resonance: new Set(['pitch', 'memory', 'body']),
      comb: new Set(['pitch', 'body', 'rupture']),
      grain: new Set(['memory', 'scatter', 'freeze']),
      chorus: new Set(['drift', 'swarm', 'shimmer']),
      excite: new Set(['solar', 'rupture', 'electric']),
      blur: new Set(['weather', 'smoke', 'haze']),
      scar: new Set(['memory', 'rupture', 'ghost']),
      body: new Set(['wood', 'metal', 'glass', 'room', 'tub', 'paper', 'stone']),
    };

  const FORCE_NAMED = { pp: 0.18, p: 0.32, mp: 0.50, mf: 0.70, f: 0.88, ff: 1.05, fff: 1.20 };
  const PAN_NAMED = { left: -0.7, center: 0, right: 0.7 };
  const GAIN_NAMED = { quiet: 0.35, half: 0.55, full: 1.0, loud: 1.3 };
  const TONE_NAMED = { dark: 0.2, bright: 0.85 };
  const HARM_NAMED = { simple: 1, pair: 2, triad: 3, rich: 4 };

    const NOTE_RE = /^([A-Ga-g])([#b])?(-?\d{1,2})$/;
    const RANDOM_PITCH_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const RANDOM_PITCH_OCTAVES = [2, 3, 4, 5];
    const PITCHED_VOICES = new Set(['string', 'sine', 'osc', 'pluck', 'drone']);

  function isPitchedVoice(voice) {
    return PITCHED_VOICES.has(String(voice || '').toLowerCase());
  }

  function splitLineComment(line) {
    const source = String(line == null ? '' : line);
    // `//` is a comment only at the start of a line or after whitespace.
    // Otherwise it can appear inside sample selector tokens like
    // `snm-*//tub-*` and must be left alone.
    let i = source.indexOf('//');
    while (i >= 0) {
      if (i === 0 || /\s/.test(source[i - 1])) {
        return {
          code: source.slice(0, i),
          comment: source.slice(i + 2),
        };
      }
      i = source.indexOf('//', i + 1);
    }
    return { code: source, comment: '' };
  }

  function stripComment(line) {
    return splitLineComment(line).code;
  }

  function parseBlockMetaComment(commentText) {
    const raw = String(commentText || '');
    if (!raw) return null;
    const out = { has: false, tags: [], mutedDefault: null };
    const seenTags = new Set();
    const metaRe = /@([a-z][a-z0-9_-]*)([^@]*)/gi;
    let m = null;

    while ((m = metaRe.exec(raw)) !== null) {
      const key = String(m[1] || '').toLowerCase();
      const payload = String(m[2] || '').trim();
      if (key === 'tag') {
        const parts = payload.split(/[\s,]+/).filter(Boolean);
        for (const part of parts) {
          const slug = String(part || '')
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '');
          if (!slug || seenTags.has(slug)) continue;
          seenTags.add(slug);
          out.tags.push(slug);
        }
        out.has = true;
        continue;
      }
      if (key === 'muted') {
        const flag = payload.split(/\s+/, 1)[0].toLowerCase();
        if (!flag) {
          out.mutedDefault = true;
        } else if (flag === 'off' || flag === 'false' || flag === '0' || flag === 'no' || flag === 'live' || flag === 'unmuted') {
          out.mutedDefault = false;
        } else {
          out.mutedDefault = true;
        }
        out.has = true;
      }
    }

    return out.has ? out : null;
  }

    function isNoteToken(tok) { return NOTE_RE.test(tok); }
    function isPitchWildcardToken(tok) { return parsePitchWildcard(tok) !== null; }

    
    
    // *      → note-random, pitchClass null, octave null
   // *!     → note-random, frozen
    //*3     → note-random, fixed octave 3
    //*3!    → note-random, fixed octave 3, frozen
    //A*     → note-random, fixed pitch class A
   // A*!    → note-random, fixed pitch class A, frozen
   // C#*    → note-random, fixed pitch class C#, random octave
   // Bb*!   → note-random, fixed pitch class Bb, random octave, frozen
   // **     → rejected
    
    function pitchWildcardError(tok) {
      const raw = String(tok || '');

      if (raw === '**') {
        return `invalid pitch wildcard "**". Use "*" for one random pitch, or write "* *" for two random pitch events.`;
      }

      if (/^\*[0-8]!$/.test(raw)) {
        const octave = raw[1];
        return `invalid pitch wildcard "${raw}". Use "*!${octave}" to freeze a random pitch in octave ${octave}, or "*${octave}" for a new random pitch in octave ${octave} each event.`;
      }

      if (/^[A-Ga-g](?:#|b)?\*\*$/.test(raw)) {
        const pc = raw.slice(0, -2);
        return `invalid pitch wildcard "${raw}". Use "${pc}*" for random ${pc.toUpperCase()} octave or "${pc}*!" for frozen random ${pc.toUpperCase()} octave.`;
      }

      if (/^\*[A-Ga-g]/.test(raw)) {
        return `invalid pitch wildcard "${raw}". Use "*" for any pitch, "*4" for any pitch in octave 4, "*!4" for a frozen random pitch in octave 4, or "A*" for A in any octave.`;
      }

      if (/^\*!?\d{2,}/.test(raw)) {
        return `invalid pitch wildcard "${raw}". Octave wildcards use one digit, e.g. "*4" or "*!4".`;
      }

      return null;
    }

    function parsePitchWildcard(tok) {
      const raw = String(tok || '');

      // Explicit ambiguity guards. `**` is not a stronger wildcard and must not
      // be interpreted as two events with missing whitespace.
      if (raw === '**') return null;
      if (/^\*[0-8]!$/.test(raw)) return null;
      if (/^[A-Ga-g](?:#|b)?\*\*$/.test(raw)) return null;
      if (/^\*[A-Ga-g]/.test(raw)) return null;
      if (/^\*!?\d{2,}/.test(raw)) return null;

      if (raw === '*') {
        return {
          kind: 'note-random',
          value: {
            pitchClass: null,
            accidental: '',
            octave: null,
            frozen: false,
            raw,
          },
        };
      }

      if (raw === '*!') {
        return {
          kind: 'note-random',
          value: {
            pitchClass: null,
            accidental: '',
            octave: null,
            frozen: true,
            raw,
          },
        };
      }

      // *4 = random pitch class, fixed octave 4, rerolled every event.
      const fixedOctave = raw.match(/^\*([0-8])$/);
      if (fixedOctave) {
        return {
          kind: 'note-random',
          value: {
            pitchClass: null,
            accidental: '',
            octave: Number(fixedOctave[1]),
            frozen: false,
            raw,
          },
        };
      }

      // *!4 = frozen random pitch class, fixed octave 4.
      // `!` freezes the randomized axis, so `*4!` is intentionally invalid.
      const frozenFixedOctave = raw.match(/^\*!([0-8])$/);
      if (frozenFixedOctave) {
        return {
          kind: 'note-random',
          value: {
            pitchClass: null,
            accidental: '',
            octave: Number(frozenFixedOctave[1]),
            frozen: true,
            raw,
          },
        };
      }

      // A* / C#* / Bb* = fixed pitch class, random octave, rerolled every event.
      // A*! / C#*! / Bb*! = fixed pitch class, frozen random octave.
      const fixedPitchClass = raw.match(/^([A-Ga-g])([#b])?\*(!)?$/);
      if (fixedPitchClass) {
        return {
          kind: 'note-random',
          value: {
            pitchClass: fixedPitchClass[1].toUpperCase(),
            accidental: fixedPitchClass[2] || '',
            octave: null,
            frozen: fixedPitchClass[3] === '!',
            raw,
          },
        };
      }

      return null;
    }

    function parsePitchSpanStartPayload(raw) {
      const payload = String(raw || '');
      if (!payload) return null;

      const anchor = payload.match(/^([0-8])\*$/);
      if (anchor) {
        return {
          kind: 'octave-anchor',
          octave: Number(anchor[1]),
          raw: payload,
        };
      }

      if (isNoteToken(payload)) {
        const note = noteTokenValue(payload);
        if (note) {
          return {
            kind: 'note',
            note,
            raw: payload,
          };
        }
      }

      const wildcard = parsePitchWildcard(payload);
      if (wildcard) {
        return {
          kind: 'wildcard',
          token: wildcard,
          raw: payload,
        };
      }

      return null;
    }

    function parsePitchSpanStartToken(tok) {
      const raw = String(tok || '');
      const m = raw.match(/^(<<|>>|<|>)(.+)$/);
      if (!m) return null;
      const marker = m[1];
      const payloadRaw = m[2];
      const shared = marker.length === 2;
      const direction = marker.indexOf('>') >= 0 ? 'down' : 'up';
      const startSpec = parsePitchSpanStartPayload(payloadRaw);
      if (!startSpec) return null;

      return {
        kind: 'pitch-span-start',
        value: {
          direction,
          shared,
          startSpec,
          marker,
          raw,
        },
        raw,
      };
    }

    function parsePitchSpanEndToken(tok) {
      const raw = String(tok || '');
      const m = raw.match(/^([A-Ga-g])([#b])?%$/);
      if (!m) return null;

      return {
        kind: 'pitch-span-end',
        value: {
          implicit: false,
          targetSpec: {
            kind: 'pitch-class-same-octave',
            pitchClass: String(m[1] || '').toUpperCase(),
            accidental: m[2] || '',
            sameOctave: true,
            raw,
          },
          raw,
        },
        raw,
      };
    }

    function pitchSpanTokenError(tok) {
      const raw = String(tok || '');
      if (/^(<<|>>|<|>)/.test(raw)) {
        return `invalid pitch-span start '${raw}' — use <A4, >A*, >>*4, <<*!4, or >6*`;
      }
      if (/%$/.test(raw)) {
        return `invalid pitch-span end '${raw}' — use pitch-class % forms like G%, Bb%, or C#%`;
      }
      return null;
    }
    function isRestToken(tok) { return tok === '.' || tok === '-'; }
    function isSustainToken(tok) { return tok === '~'; }

    // Voice-leaf articulation:
    //   TOKEN; = gate this sound-producing leaf to the end of its rhythmic unit.
    //
    // This is intentionally handled at the voice-leaf level, not as a
    // sample-only feature. Params do not use ';'.
    function splitVoiceGateToken(tok) {
      const raw = String(tok || '');

      if (!raw.endsWith(';')) {
        return { raw, body: raw, gated: false, invalid: false };
      }

      const body = raw.slice(0, -1);

      // Do not allow meaningless gates on non-sounding leaves.
      if (!body || body === '.' || body === '-' || body === '~' || body === '|' || body === '(' || body === ')') {
        return { raw, body, gated: true, invalid: true };
      }

      return { raw, body, gated: true, invalid: false };
    }

    function voiceGateError(tok) {
      const split = splitVoiceGateToken(tok);
      if (!split.gated || !split.invalid) return null;
      return `';' can only gate sound-producing note or sample leaves — '${tok}' is not gateable`;
    }

    function isSampleToken(tok) {
      return /^[a-z][a-z0-9_-]*$/.test(tok)
        && !VOICE_NAMES.has(tok)
        && !PARAM_NAMES.has(tok)
        && !EFFECT_NAMES.has(tok)
        && !BLOCK_DIRECTIVES.has(tok);
    }

  // Parse a sample selector string: a single concrete name, a wildcard
  // prefix, or any number of those joined by `/`, optionally followed by
  // `&N` (gradient over N seconds) and/or `!` (freeze the random pick).
  // Returns the selector descriptor or null if the string isn't a valid
  // selector.
  //
  // Examples:
  //   'snm-014'                  → 1 concrete piece, no gradient, not frozen
  //   'snm-*'                    → 1 wildcard piece (prefix 'snm-')
  //   '*'                        → 1 wildcard piece (prefix '')
  //   'snm-*/tub-*'              → 2 wildcard pieces (union pool)
  //   'snm-*&30'                 → wildcard + 30s gradient
  //   'snm-*!'                   → frozen random pick
  //   'snm-*&30!'                → frozen pair, oscillating over 30s
  //   'snm-001/tub-*&30'         → concrete + wildcard, 30s gradient
    function parseSampleSelector(tok) {
      let frozen = false;
      let gated = false;
      let body = String(tok || '');

      // `;` is a sample articulation marker:
      //   *;                  gated one-shot
      //   snm-001;            gated concrete sample
      //   snm-001;/snm-002    gated union
      //   snm-*;&20           gated gradient
      //   snm-*&20!;          gated frozen gradient
      //
      // Accept `;` only at token/operator boundaries. Do not treat it as a
      // comment character and do not silently erase arbitrary internal semicolons.
      if (body.endsWith(';')) {
        gated = true;
        body = body.slice(0, -1);
      }
      if (body.includes(';')) {
        const normalized = body.replace(/;(?=[/&!])/g, '');
        if (normalized !== body) {
          gated = true;
          body = normalized;
        }
      }
      if (body.includes(';')) return null;

      if (body.endsWith('!')) {
        frozen = true;
        body = body.slice(0, -1);
      }

      let gradientSec = null;
      const gradMatch = body.match(/^(.+?)&(\d+(?:\.\d+)?)$/);
      if (gradMatch) {
        body = gradMatch[1];
        gradientSec = parseFloat(gradMatch[2]);
        if (!Number.isFinite(gradientSec) || gradientSec <= 0) return null;
      }

      if (body.length === 0) return null;

      const parts = body.split('/');
      if (parts.length === 0 || parts.some((p) => p.length === 0)) return null;

      const pieces = [];
      let hasWildcard = false;

      for (const part of parts) {
        if (part === '*') {
          pieces.push({ kind: 'wildcard', prefix: '' });
          hasWildcard = true;
          continue;
        }

        if (part.endsWith('*')) {
          const prefix = part.slice(0, -1);
          if (!/^[a-z][a-z0-9_-]*$/.test(prefix)) return null;
          pieces.push({ kind: 'wildcard', prefix });
          hasWildcard = true;
          continue;
        }

          if (
            /^[a-z][a-z0-9_-]*$/.test(part)
            && !VOICE_NAMES.has(part)
            && !PARAM_NAMES.has(part)
            && !EFFECT_NAMES.has(part)
            && !BLOCK_DIRECTIVES.has(part)
          ) {
            pieces.push({ kind: 'concrete', name: part });
            continue;
          }

        return null;
      }

      // A "selector" means anything that isn't just one bare concrete name.
      // `gated` also makes the token semantically non-plain, but we still allow
      // classifyLeaf() to preserve the old `{ kind: 'sample' }` shape for a
      // single concrete sample.
      const isAdvanced = hasWildcard || pieces.length > 1 || gradientSec != null || frozen;

      return {
        pieces,
        gradientSec,
        frozen,
        gated,
        isAdvanced,
        raw: tok,
      };
    }

  function noteTokenValue(tok) {
    const m = tok.match(NOTE_RE);
    if (!m) return null;
    const pitchClass = m[1].toUpperCase();
    const accidental = m[2] || '';
    const octave = parseInt(m[3], 10);

    const semitoneOffsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semis = semitoneOffsets[pitchClass];
    if (semis == null) return null;
    if (accidental === '#') semis += 1;
    if (accidental === 'b') semis -= 1;

    const midi = (octave + 1) * 12 + semis;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);

    return {
      name: `${pitchClass}${accidental}${octave}`,
      pitchClass,
      accidental,
      octave,
      midi,
      freq,
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // -------------------- slot tokenizer (paren-aware) --------------------

  // Tokenizes a string into a flat array of tokens where each token is
  // either:
  //   - a string (a leaf token like "A3", ".", "tub-xemf-mass", "|", "~")
  //   - the special markers "(" and ")"
  // Whitespace is the primary separator; parens always tokenize as their
  // own characters even when adjacent to text.
  function tokenizeSlotLine(text) {
    const out = [];
    let buf = '';
    function flush() {
      if (buf.length) { out.push(buf); buf = ''; }
    }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(' || ch === ')') {
        flush();
        out.push(ch);
        continue;
      }
      if (/\s/.test(ch)) { flush(); continue; }
      buf += ch;
    }
    flush();
    return out;
  }

  // Build the slot AST from a flat token stream. Returns:
  //   { ok: true, slots: [SlotNode], bars: number }
  // SlotNode:
  //   { kind: 'leaf', token: { kind: 'note'|'rest'|'sustain'|'sample', value } }
  //   { kind: 'group', children: [SlotNode] }
  function parseSlotStream(tokens, voice, lineNumber) {
    const errors = [];

      function classifyLeaf(tok) {
        const gate = splitVoiceGateToken(tok);
        if (gate.invalid) return null;

        const body = gate.body;

        if (isRestToken(body)) return { kind: 'rest', value: null, raw: body };
        if (isSustainToken(body)) return { kind: 'sustain', value: null, raw: body };

        if (isPitchedVoice(voice)) {
          const spanStart = parsePitchSpanStartToken(body);
          if (spanStart) {
            spanStart.gated = gate.gated === true;
            return spanStart;
          }

          const spanEnd = parsePitchSpanEndToken(body);
          if (spanEnd) {
            spanEnd.gated = gate.gated === true;
            return spanEnd;
          }

          if (isNoteToken(body)) {
            const note = noteTokenValue(body);
            if (note) {
              return {
                kind: 'note',
                value: note,
                gated: gate.gated === true,
              };
            }
          }

          const randomNote = parsePitchWildcard(body);
          if (randomNote) {
            randomNote.gated = gate.gated === true;
            return randomNote;
          }

          return null;
        }

        if (voice === 'sample') {
          const selector = parseSampleSelector(body);

          if (selector) {
            // A trailing ';' was stripped by splitVoiceGateToken(). Preserve
            // older selector-internal gate handling too, then normalize.
            selector.gated = selector.gated === true || gate.gated === true;

            if (!selector.isAdvanced && selector.pieces.length === 1 && selector.pieces[0].kind === 'concrete') {
              return {
                kind: 'sample',
                value: selector.pieces[0].name,
                gated: selector.gated === true,
              };
            }

            return {
              kind: 'sample-selector',
              value: selector,
              gated: selector.gated === true,
            };
          }

          return null;
        }

        if (voice === 'noise' || voice === 'pulse') {
          if (body === '*' || body === '*!') {
            return {
              kind: voice === 'pulse' ? 'pulse' : 'noise',
              value: { frozen: body === '*!', raw: body },
              gated: gate.gated === true,
              raw: body,
            };
          }

          return null;
        }

        if (voice === 'drum') {
          const m = body.match(/^([kshortc]|\*)(!)?$/i);
          if (!m) return null;
          const lane = String(m[1] || '').toLowerCase();
          return {
            kind: 'drum',
            value: { lane, frozen: m[2] === '!', raw: body },
            gated: gate.gated === true,
            raw: body,
          };
        }

        if (voice === 'video' || voice === 'video-gen') {
          if (body === '*' || body === '*!') {
            return {
              kind: 'video-hit',
              value: { frozen: body === '*!', raw: body },
              gated: gate.gated === true,
              raw: body,
            };
          }
          return null;
        }

        return null;
      }

    let pos = 0;
    const slots = [];
    const barSlotCounts = [];
    let currentBarSlots = 0;

    function pushSlot(node) {
      slots.push(node);
      currentBarSlots++;
    }

    function collectLeafRefs(node, out) {
      if (!node) return;
      if (node.kind === 'leaf') {
        out.push(node);
        return;
      }
      if (node.kind === 'group' && Array.isArray(node.children)) {
        for (const child of node.children) collectLeafRefs(child, out);
      }
    }

    function finalizePitchSpans() {
      if (!isPitchedVoice(voice)) return;

      const leaves = [];
      for (const slot of slots) collectLeafRefs(slot, leaves);

      let open = null;

      function closeImplicit(reason) {
        if (!open) return;
        if (!Number.isFinite(open.lastStarLeafIndex)) {
          errors.push({
            line: lineNumber,
            message: `pitch-span '${open.startRaw}' is missing an end target — add a % end token (e.g. G%) or include a trailing * to close implicitly`,
          });
          open = null;
          return;
        }

        const leaf = leaves[open.lastStarLeafIndex];
        const fallbackOctave = open.direction === 'down' ? 1 : 8;
        const implicitRaw = `*${fallbackOctave}`;
        if (leaf && leaf.token) {
          leaf.token = {
            kind: 'pitch-span-end',
            raw: implicitRaw,
            value: {
              implicit: true,
              reason: reason || 'end-of-run',
              targetSpec: {
                kind: 'wildcard-fixed-octave',
                octave: fallbackOctave,
                raw: implicitRaw,
              },
            },
          };
        }
        open = null;
      }

      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const tok = leaf && leaf.token ? leaf.token : null;
        if (!tok) continue;

        if (tok.kind === 'pitch-span-start') {
          if (open) closeImplicit('next-start');
          open = {
            direction: tok.value && tok.value.direction ? tok.value.direction : 'down',
            shared: Boolean(tok.value && tok.value.shared),
            startRaw: tok.raw || '',
            lastStarLeafIndex: null,
          };
          continue;
        }

        if (tok.kind === 'pitch-span-end') {
          if (!open) {
            errors.push({
              line: lineNumber,
              message: `pitch-span end '${tok.raw || '%'}' has no active span start`,
            });
            continue;
          }
          open = null;
          continue;
        }

        if (!open) continue;

        if (tok.kind === 'rest' || tok.kind === 'sustain') {
          tok.pitchSpanCarry = true;
          continue;
        }

        if (tok.kind === 'note-random' && tok.value && tok.value.raw === '*') {
          tok.pitchSpanStep = true;
          open.lastStarLeafIndex = i;
          continue;
        }

        errors.push({
          line: lineNumber,
          message: `inside an active pitch-span, only '*', '.', '~', and an end token like G% are allowed`,
        });
      }

      if (open) closeImplicit('end-of-block');
    }

    function parseGroup() {
      const children = [];
      while (pos < tokens.length) {
        const t = tokens[pos];
        if (t === ')') {
          pos++;
          return { kind: 'group', children };
        }
        if (t === '(') {
          pos++;
          children.push(parseGroup());
          continue;
        }
        if (t === '|') {
          // Bar lines aren't allowed inside a group; treat as separator
          // ignored at top level only.
          pos++;
          errors.push({ line: lineNumber, message: `unexpected '|' inside (...) group — bar lines belong only between top-level slots` });
          continue;
        }
        const leaf = classifyLeaf(t);
          if (!leaf) {
            const gateError = voiceGateError(t);
            const stripped = splitVoiceGateToken(t);
            const wildcardError = isPitchedVoice(voice)
              ? pitchWildcardError(stripped.body || t)
              : null;
            const spanError = isPitchedVoice(voice)
              ? pitchSpanTokenError(stripped.body || t)
              : null;

            if (gateError) {
              errors.push({ line: lineNumber, message: gateError });
            } else if (wildcardError) {
              errors.push({ line: lineNumber, message: wildcardError });
            } else if (spanError) {
              errors.push({ line: lineNumber, message: spanError });
            } else {
              const hint = isPitchedVoice(voice)
                ? ` — voice '${voice}' takes notes/wildcards plus pitch spans like >6*, >>A*, <<*!4, and end tokens like G%`
              : (voice === 'noise' || voice === 'pulse')
                  ? ` — voice '${voice}' takes hit tokens like * or *!, rests '.', and sustains '~'`
              : (voice === 'drum')
                  ? ` — voice 'drum' takes lane tokens k/s/h/o/t/r/c, wildcard * or *!, rests '.', and sustains '~'`
                : (voice === 'video' || voice === 'video-gen')
                  ? ` — voice '${voice}' takes visual event tokens * or *!, rests '.', and sustains '~'`
                : ` — voice 'sample' takes bank ids/selectors like tub-xither-forge, snm-*, snm-*&20, and may gate them with ';'`;
              errors.push({ line: lineNumber, message: `'${t}' isn't valid here${hint}` });
            }
            children.push({ kind: 'leaf', token: { kind: 'rest', value: null } });
            pos++;
            continue;
          }
        children.push({ kind: 'leaf', token: leaf });
        pos++;
      }
      // Unterminated group.
      errors.push({ line: lineNumber, message: `'(' wasn't closed by ')'` });
      return { kind: 'group', children };
    }

    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t === '|') {
        // Bar lines act as equal-time bar separators: each bar takes the
        // same wall-clock time, but bars may hold different slot counts.
        // Empty bars (leading '|', consecutive '||', trailing '|') are
        // treated as no-ops rather than zero-slot bars.
        if (currentBarSlots > 0) {
          barSlotCounts.push(currentBarSlots);
          currentBarSlots = 0;
        }
        pos++;
        continue;
      }
      if (t === '(') {
        pos++;
        pushSlot(parseGroup());
        continue;
      }
      if (t === ')') {
        errors.push({ line: lineNumber, message: `extra ')' with no matching '('` });
        pos++;
        continue;
      }
      const leaf = classifyLeaf(t);
        if (!leaf) {
          const gateError = voiceGateError(t);
          const stripped = splitVoiceGateToken(t);
          const wildcardError = isPitchedVoice(voice)
            ? pitchWildcardError(stripped.body || t)
            : null;
          const spanError = isPitchedVoice(voice)
            ? pitchSpanTokenError(stripped.body || t)
            : null;

          if (gateError) {
            errors.push({ line: lineNumber, message: gateError });
          } else if (wildcardError) {
            errors.push({ line: lineNumber, message: wildcardError });
          } else if (spanError) {
            errors.push({ line: lineNumber, message: spanError });
          } else {
            const hint = isPitchedVoice(voice)
              ? ` — voice '${voice}' takes notes/wildcards plus pitch spans like >6*, >>A*, <<*!4, and end tokens like G%`
            : (voice === 'noise' || voice === 'pulse')
                ? ` — voice '${voice}' takes hit tokens like * or *!, rests '.', and sustains '~'`
            : (voice === 'drum')
                ? ` — voice 'drum' takes lane tokens k/s/h/o/t/r/c, wildcard * or *!, rests '.', and sustains '~'`
              : (voice === 'video' || voice === 'video-gen')
                ? ` — voice '${voice}' takes visual event tokens * or *!, rests '.', and sustains '~'`
                : ` — voice 'sample' takes bank ids/selectors like tub-xither-forge, snm-*, snm-*&20, and may gate them with ';'`;
            errors.push({ line: lineNumber, message: `'${t}' isn't valid here${hint}` });
          }
          pushSlot({ kind: 'leaf', token: { kind: 'rest', value: null } });
          pos++;
          continue;
        }
      pushSlot({ kind: 'leaf', token: leaf });
      pos++;
    }

    if (currentBarSlots > 0) barSlotCounts.push(currentBarSlots);
    if (barSlotCounts.length === 0) barSlotCounts.push(slots.length);
    finalizePitchSpans();
    const bars = barSlotCounts.length;

    return { slots, bars, barSlotCounts, errors };
  }

    // -------------------- parameter resolution --------------------

    function parseParamOperator(raw) {
      const tok = String(raw || '').trim();
        
        if (tok === '*~') {
          return {
            ok: true,
            value: {
              kind: 'param-op',
              op: 'gesture-random',
              raw: tok,
            },
          };
        }

      if (tok === '*') {
        return { ok: true, value: { kind: 'param-op', op: 'random', raw: tok } };
      }

      if (tok === '~') {
        return { ok: true, value: { kind: 'param-op', op: 'hold', raw: tok } };
      }

      if (tok === '_') {
        return { ok: true, value: { kind: 'param-op', op: 'reset', raw: tok } };
      }

      if (tok === '*!') {
        return { ok: true, value: { kind: 'param-op', op: 'frozen-random', raw: tok } };
      }

      const driftMatch = tok.match(/^\*&(\d+(?:\.\d+)?)$/);
      if (driftMatch) {
        const seconds = Number(driftMatch[1]);
        if (Number.isFinite(seconds) && seconds > 0) {
          return {
            ok: true,
            value: {
              kind: 'param-op',
              op: 'drift',
              seconds,
              raw: tok,
            },
          };
        }
      }

      return null;
    }

    function parseNumericExpression(raw) {
      let s = String(raw || '').trim().toLowerCase();
      if (!s) return NaN;

      // Supported:
      //   pi
      //   2pi
      //   2*pi
      //   pi/4
      //   3/2
      //   2*3
      //   -1/2
      //
      // No eval / Function. No expression parentheses; parens already mean
      // stream grouping in this DSL.
      s = s.replace(/\s+/g, '');
      s = s.replace(/π/g, 'pi');
      s = s.replace(/((?:\d+(?:\.\d+)?)|(?:\.\d+))pi/g, '$1*pi');

      if (!/^-?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+)|pi)(?:[*/]-?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+)|pi))*$/.test(s)) {
        return NaN;
      }

      const factors = s.split('*');
      let product = 1;

      for (const factor of factors) {
        if (factor === '') return NaN;

        const parts = factor.split('/');
        if (parts.length === 0) return NaN;

        let value = tokenToNumber(parts[0]);
        if (!Number.isFinite(value)) return NaN;

        for (let i = 1; i < parts.length; i++) {
          const denom = tokenToNumber(parts[i]);
          if (!Number.isFinite(denom) || denom === 0) return NaN;
          value /= denom;
        }

        product *= value;
      }

      return product;

      function tokenToNumber(tok) {
        if (tok === 'pi') return Math.PI;
        if (tok === '-pi') return -Math.PI;
        return Number(tok);
      }
    }

    function resolveParam(name, raw) {
      const paramOperator = parseParamOperator(raw);
      if (paramOperator) return paramOperator;

      const lower = String(raw).toLowerCase();
      const num = parseNumericExpression(raw);

    switch (name) {
      case 'force':
        if (lower in FORCE_NAMED) return { ok: true, value: FORCE_NAMED[lower] };
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0, 1) };
        return { ok: false, message: `force '${raw}' isn't a dynamic — use pp p mp mf f ff fff or 0–1` };

      case 'decay':
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0.4, 8) };
        return { ok: false, message: `decay must be a number of seconds (0.4–8)` };

      case 'crush':
        if (lower === 'off' || raw === '0') return { ok: true, value: 0 };
        if (Number.isFinite(num)) return { ok: true, value: clamp(Math.round(num), 4, 16) };
        return { ok: false, message: `crush must be 0/off or 4–16` };

      case 'resolution':
        if (lower === 'off') return { ok: true, value: 0 };
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0, 1) };
        return { ok: false, message: `resolution must be off or 0–1` };

      case 'variance':
        if (lower === 'off') return { ok: true, value: 0 };
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0, 1) };
        return { ok: false, message: `variance must be off or 0–1` };

      case 'monitor':
      case 'listen':
        if (lower === 'on' || lower === 'yes' || lower === 'true' || lower === '1') return { ok: true, value: 1 };
        if (lower === 'off' || lower === 'no' || lower === 'false' || lower === '0') return { ok: true, value: 0 };
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0, 1) };
        return { ok: false, message: `${name} must be on/off or 0–1` };

      case 'opacity':
      case 'threshold':
      case 'edges':
      case 'posterize':
      case 'invert':
      case 'contrast':
      case 'saturate':
      case 'displace':
      case 'feedback':
      case 'delay':
      case 'slitscan':
      case 'trail':
      case 'mask':
      case 'key':
      case 'color':
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0, 1) };
        return { ok: false, message: `${name} must be 0–1, *, ~, _, *!, *&N, or *~` };

      case 'blend':
        if (lower === 'normal' || lower === 'source-over') return { ok: true, value: 'source-over' };
        if (lower === 'screen' || lower === 'multiply' || lower === 'overlay' || lower === 'difference' || lower === 'lighter') {
          return { ok: true, value: lower };
        }
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0, 1) };
        return { ok: false, message: `blend must be normal/source-over/screen/multiply/overlay/difference/lighter or 0–1` };

      case 'pan':
        if (lower in PAN_NAMED) return { ok: true, value: PAN_NAMED[lower] };
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, -1, 1) };
        return { ok: false, message: `pan '${raw}' — use left/center/right or -1..1` };

      case 'gain':
        if (lower in GAIN_NAMED) return { ok: true, value: GAIN_NAMED[lower] };
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0, 1.5) };
        return { ok: false, message: `gain '${raw}' — use quiet/half/full/loud or 0–1.5` };

      case 'tone':
        if (lower in TONE_NAMED) return { ok: true, value: TONE_NAMED[lower] };
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0, 1) };
        return { ok: false, message: `tone '${raw}' — use dark/bright or 0–1` };

      case 'harm':
        if (lower in HARM_NAMED) return { ok: true, value: HARM_NAMED[lower] };
        if (Number.isFinite(num)) return { ok: true, value: clamp(Math.round(num), 0, 4) };
        return { ok: false, message: `harm '${raw}' — use simple/pair/triad/rich or 0–4` };

      case 'octave':
        if (Number.isFinite(num)) return { ok: true, value: clamp(Math.round(num), -2, 2) };
        return { ok: false, message: `octave must be an integer ±2` };

      case 'rate':
        if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0.25, 4) };
        return { ok: false, message: `rate must be a number 0.25–4` };

        case 'start':
          if (Number.isFinite(num)) return { ok: true, value: Math.max(0, num) };
          return { ok: false, message: `start must be a non-negative number of seconds` };

        case 'speed':
          if (Number.isFinite(num)) return { ok: true, value: clamp(num, 0.0625, 16) };
          return { ok: false, message: `speed '${raw}' — use a factor like 2, 1/2, pi/4, *, *!, or *&8` };

        case 'glide':
          if (Number.isFinite(num) && num > 0) return { ok: true, value: num };
          return { ok: false, message: `glide must be a positive number of seconds` };

        default:
          return { ok: false, message: `unknown parameter '${name}'` };
      }
    }
    
    function resolveEffect(name, raw) {
      const paramOperator = parseParamOperator(raw);
      if (paramOperator) return paramOperator;

      const lower = String(raw || '').toLowerCase();
      const num = parseNumericExpression(raw);

      if (Number.isFinite(num)) {
        return { ok: true, value: clamp(num, 0, 1) };
      }

      const modes = EFFECT_MODE_NAMES[name];
      if (modes && modes.has(lower)) {
        return {
          ok: true,
          value: {
            kind: 'effect-mode',
            effect: name,
            mode: lower,
            raw,
          },
        };
      }

      return {
        ok: false,
        message: `${name} '${raw}' — use 0..1, *, ~, _, *!, *&N, *~, or a supported named mode`,
      };
    }


    function parseLiveRef(raw) {
      const tok = String(raw || '').trim().toLowerCase();
      if (!tok) return null;

      const parts = tok.split('.').filter(Boolean);
      const source = parts[0];
      const feature = parts[1] || 'intensity';

      if (!LIVE_SOURCE_NAMES.has(source)) return null;
      if (!LIVE_FEATURE_NAMES.has(feature)) return null;

      return { source, feature, raw: tok };
    }

    function rowDefaultRange(name) {
      switch (name) {
        case 'pan': return [-1, 1];
        case 'gain': return [0, 1];
        case 'force': return [0.2, 1];
        case 'decay': return [0.4, 8];
        case 'crush': return [0, 16];
        case 'resolution': return [0, 1];
        case 'variance': return [0, 1];
        case 'tone': return [0, 1];
        case 'harm': return [1, 5];
        case 'octave': return [-2, 2];
        case 'rate': return [0.25, 4];
        case 'start': return [0, 0.85];
        case 'speed': return [0.5, 2];
        case 'glide': return [0.04, 0.4];
        case 'monitor': return [0, 1];
        case 'listen': return [0, 1];
        case 'opacity':
        case 'threshold':
        case 'edges':
        case 'posterize':
        case 'invert':
        case 'contrast':
        case 'saturate':
        case 'displace':
        case 'feedback':
        case 'delay':
        case 'slitscan':
        case 'trail':
        case 'mask':
        case 'key':
        case 'color':
        case 'blend':
          return [0, 1];
        default: return [0, 1];
      }
    }

    function parseLiveModLine(tokens, rowName, lineNumber) {
      if (!Array.isArray(tokens) || tokens.length === 0) return null;
      if (tokens.length !== 1 && tokens.length !== 3) return null;

      const ref = parseLiveRef(tokens[0]);
      if (!ref) return null;

      let min;
      let max;
      if (tokens.length === 3) {
        min = parseNumericExpression(tokens[1]);
        max = parseNumericExpression(tokens[2]);
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          return {
            ok: false,
            error: { line: lineNumber, message: `${rowName} ${tokens[0]} needs numeric min and max values` },
          };
        }
      } else {
        [min, max] = rowDefaultRange(rowName);
      }

      return {
        ok: true,
        value: {
          kind: 'live-mod',
          source: ref.source,
          feature: ref.feature,
          min,
          max,
          raw: tokens.join(' '),
        },
      };
    }

    function parseLiveControlLine(name, tail, lineNumber) {
      const tokens = tokenizeSlotLine(tail);
      if (tokens.length === 0) {
        return { ok: false, error: { line: lineNumber, message: `${name} needs a live source, e.g. ${name} mic.intensity` } };
      }

      if (name === 'choose') {
        const ref = parseLiveRef(tokens[0]);
        if (!ref) {
          return { ok: false, error: { line: lineNumber, message: `choose needs a live source like mic, input, interface, tab, camera, screen, file, or video` } };
        }
        if (tokens.length > 2) {
          return { ok: false, error: { line: lineNumber, message: `choose takes 'choose mic' or 'choose mic.feature [amount]'` } };
        }
        const amount = tokens[1] == null ? 1 : parseNumericExpression(tokens[1]);
        if (!Number.isFinite(amount)) {
          return { ok: false, error: { line: lineNumber, message: `choose amount must be numeric` } };
        }
        return { ok: true, value: { kind: 'choose', source: ref.source, feature: ref.feature, amount: clamp(amount, 0, 1), raw: tokens.join(' ') } };
      }

      if (name === 'trigger') {
        const ref = parseLiveRef(tokens[0]);
        if (!ref) {
          return { ok: false, error: { line: lineNumber, message: `trigger needs a live source feature like mic.rupture or camera.motion` } };
        }
        if (tokens.length > 2) {
          return { ok: false, error: { line: lineNumber, message: `trigger takes 'trigger mic.rupture [threshold]'` } };
        }
        const threshold = tokens[1] == null ? 0.55 : parseNumericExpression(tokens[1]);
        if (!Number.isFinite(threshold)) {
          return { ok: false, error: { line: lineNumber, message: `trigger threshold must be numeric` } };
        }
        return { ok: true, value: { kind: 'trigger', source: ref.source, feature: ref.feature, threshold: clamp(threshold, 0, 1), raw: tokens.join(' ') } };
      }

      if (name === 'time' || name === 'beat' || name === 'leaf') {
        const ref = parseLiveRef(tokens[0]);
        if (!ref) {
          return { ok: false, error: { line: lineNumber, message: `${name} needs a live source feature like mic.intensity, camera.motion, or video.rupture` } };
        }
        if (tokens.length > 2) {
          return { ok: false, error: { line: lineNumber, message: `${name} takes '${name} mic.feature [amount]'` } };
        }
        const fallbackAmount = name === 'leaf' ? 0.7 : name === 'beat' ? 0.35 : 0.2;
        const amount = tokens[1] == null ? fallbackAmount : parseNumericExpression(tokens[1]);
        if (!Number.isFinite(amount)) {
          return { ok: false, error: { line: lineNumber, message: `${name} amount must be numeric` } };
        }
        return { ok: true, value: { kind: name, source: ref.source, feature: ref.feature, amount: clamp(amount, 0, 1), raw: tokens.join(' ') } };
      }

      return { ok: false, error: { line: lineNumber, message: `unknown live control '${name}'` } };
    }
    // Build a parameter/control stream from the same paren-aware token stream
    // used by voice rows. Groups do not create time by themselves; they only
    // make control rhythms readable. The result is flattened before storage so
    // the scheduler can keep using scalar/vector param rows.
    //
    // Examples:
    //   decay (* 1 1 1) (* 1 1 1)
    //   pan   (left right) (center *)
    //   gain  (0.8 ~) (_ *!)
    //
    // ParamNode:
    //   { kind: 'leaf', value }
    //   { kind: 'group', children: [ParamNode] }
    function parseParamStream(tokens, paramName, lineNumber, resolver) {
      const errors = [];
      const nodes = [];
      let pos = 0;
        const resolveValue = typeof resolver === 'function' ? resolver : resolveParam;

      function parseValue(tok) {
          const r = resolveValue(paramName, tok);
        if (!r.ok) {
          errors.push({ line: lineNumber, message: r.message });
          return { kind: 'leaf', value: null, invalid: true };
        }
        return { kind: 'leaf', value: r.value };
      }

      function parseGroup() {
        const children = [];

        while (pos < tokens.length) {
          const t = tokens[pos];

          if (t === ')') {
            pos++;
            if (children.length === 0) {
              errors.push({ line: lineNumber, message: `empty parameter group in ${paramName}` });
            }
            return { kind: 'group', children };
          }

          if (t === '(') {
            pos++;
            children.push(parseGroup());
            continue;
          }

          if (t === '|') {
            pos++;
            errors.push({ line: lineNumber, message: `unexpected '|' inside (...) group — bar lines belong only between top-level values` });
            continue;
          }

          children.push(parseValue(t));
          pos++;
        }

        errors.push({ line: lineNumber, message: `'(' wasn't closed by ')' in ${paramName}` });
        if (children.length === 0) {
          errors.push({ line: lineNumber, message: `empty parameter group in ${paramName}` });
        }
        return { kind: 'group', children };
      }

      while (pos < tokens.length) {
        const t = tokens[pos];

        if (t === '|') {
          pos++;
          continue;
        }

        if (t === '(') {
          pos++;
          nodes.push(parseGroup());
          continue;
        }

        if (t === ')') {
          errors.push({ line: lineNumber, message: `extra ')' with no matching '(' in ${paramName}` });
          pos++;
          continue;
        }

        nodes.push(parseValue(t));
        pos++;
      }

      return { nodes, errors };
    }

    function flattenParamNodes(nodes) {
      const out = [];

      function visit(node) {
        if (!node) return;

        if (node.kind === 'leaf') {
          if (!node.invalid) out.push(node.value);
          return;
        }

        if (node.kind === 'group') {
          for (const child of node.children) visit(child);
        }
      }

      for (const node of nodes) visit(node);
      return out;
    }
    
    function parseAttractorLine(tail, lineNumber) {
      const args = tail.trim().split(/\s+/).filter(Boolean);
      if (!args.length) {
        return {
          ok: false,
          error: { line: lineNumber, message: `attractor needs a name, e.g. attractor weather, quake, tide, solar, archive, or tub` },
        };
      }

      const raw = args[0].toLowerCase();
      if (!/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/.test(raw)) {
        return {
          ok: false,
          error: { line: lineNumber, message: `attractor '${args[0]}' must look like weather, weather.dew, quake.local, tide, solar.flare, archive, or tub` },
        };
      }

      return {
        ok: true,
        value: {
          raw,
          source: {},
        },
      };
    }

    function parseInputSourceLine(tail, lineNumber) {
      const args = tail.trim().split(/\s+/).filter(Boolean);
      const raw = String(args[0] || '').toLowerCase();

      if (!raw) {
        return { ok: false, error: { line: lineNumber, message: `input needs a source: mic, interface, or tab` } };
      }

      if (!INPUT_SOURCE_NAMES.has(raw)) {
        return { ok: false, error: { line: lineNumber, message: `input source must be mic, interface, or tab` } };
      }

      return {
        ok: true,
        value: {
          kind: raw,
          label: args.slice(1).join(' ') || raw,
        },
      };
    }

    function parseVideoSourceLine(tail, lineNumber) {
      const args = tail.trim().split(/\s+/).filter(Boolean);
      if (args.length === 0) {
        return { ok: false, error: { line: lineNumber, message: `video needs a source: camera, screen, file, or gen` } };
      }
      const raw = String(args[0] || '').toLowerCase();
      if (!VIDEO_SOURCE_NAMES.has(raw)) {
        return { ok: false, error: { line: lineNumber, message: `video source must be camera, screen, file, or gen` } };
      }
      return {
        ok: true,
        value: {
          kind: raw,
          label: raw,
          patternTokens: args.slice(1),
        },
      };
    }

    function resolveInputRow(name, raw) {
      const lower = String(raw || '').trim().toLowerCase();

      if (name === 'listen') {
        if (lower === 'on' || lower === 'yes' || lower === 'true' || lower === '1') return { ok: true, value: 1 };
        if (lower === 'off' || lower === 'no' || lower === 'false' || lower === '0') return { ok: true, value: 0 };
        return { ok: false, message: `listen must be on or off` };
      }

      if (name === 'monitor') {
        if (lower === 'on' || lower === 'yes' || lower === 'true') return { ok: true, value: 1 };
        if (lower === 'off' || lower === 'no' || lower === 'false') return { ok: true, value: 0 };
        return resolveParam('gain', raw);
      }

      return { ok: false, message: `${name} is not an input row` };
    }

    function parseSourceLine(tail, lineNumber) {
      const args = tail.trim().split(/\s+/).filter(Boolean);
      if (args.length < 2) {
        return {
          ok: false,
          error: { line: lineNumber, message: `source must read like 'source station KLAX', 'source coords 34.05,-118.25', 'source feed all_day', or 'source radius 500km'` },
        };
      }

      const key = args[0].toLowerCase();
      if (!/^[a-z][a-z0-9_-]*$/.test(key)) {
        return {
          ok: false,
          error: { line: lineNumber, message: `source key '${args[0]}' must be a simple word like station, coords, feed, radius, city, or region` },
        };
      }

      return {
        ok: true,
        key,
        value: args.slice(1).join(' '),
      };
    }

    function parseFadeDuration(raw) {
      const tok = String(raw || '').trim().toLowerCase();

      if (!tok) return NaN;

      // v1 supports seconds only:
      //   30
      //   30s
      //   0.5s
      //
      // bars/beats are intentionally left for a later pass so the runtime
      // does not need meter-aware fade conversion yet.
      const m = tok.match(/^(\d+(?:\.\d+)?)(s|sec|secs|second|seconds)?$/);
      if (!m) return NaN;

      const seconds = Number(m[1]);
      return Number.isFinite(seconds) && seconds > 0 ? seconds : NaN;
    }

    function parseFadeLine(tail, lineNumber) {
      const args = tail.trim().split(/\s+/).filter(Boolean);
      const mode = String(args[0] || '').toLowerCase();

      if (!mode) {
        return {
          ok: false,
          error: { line: lineNumber, message: `fade needs a mode: in, out, inout, outin, hold, or clear` },
        };
      }

      if (mode === 'clear' || mode === 'hold') {
        if (args.length > 1) {
          return {
            ok: false,
            error: { line: lineNumber, message: `fade ${mode} does not take a duration` },
          };
        }

        return {
          ok: true,
          value: {
            mode,
            durationSec: 0,
            highHoldSec: 0,
            lowHoldSec: 0,
            line: lineNumber,
          },
        };
      }

      if (!['in', 'out', 'inout', 'outin'].includes(mode)) {
        return {
          ok: false,
          error: { line: lineNumber, message: `unknown fade mode '${mode}' — use in, out, inout, outin, hold, or clear` },
        };
      }

      const durationSec = parseFadeDuration(args[1]);
      if (!Number.isFinite(durationSec)) {
        return {
          ok: false,
          error: { line: lineNumber, message: `fade ${mode} needs a positive seconds duration, e.g. fade ${mode} 30s` },
        };
      }

      let highHoldSec = 0;
      let lowHoldSec = 0;

      for (let i = 2; i < args.length; i++) {
        const key = String(args[i] || '').toLowerCase();

        if (key === 'hold') {
          const hold = parseFadeDuration(args[i + 1]);
          if (!Number.isFinite(hold)) {
            return {
              ok: false,
              error: { line: lineNumber, message: `fade ${mode} hold needs a positive seconds duration, e.g. hold 10s` },
            };
          }
          highHoldSec = hold;
          lowHoldSec = hold;
          i++;
          continue;
        }

        if (key === 'high') {
          const high = parseFadeDuration(args[i + 1]);
          if (!Number.isFinite(high)) {
            return {
              ok: false,
              error: { line: lineNumber, message: `fade ${mode} high needs a positive seconds duration, e.g. high 5s` },
            };
          }
          highHoldSec = high;
          i++;
          continue;
        }

        if (key === 'low') {
          const low = parseFadeDuration(args[i + 1]);
          if (!Number.isFinite(low)) {
            return {
              ok: false,
              error: { line: lineNumber, message: `fade ${mode} low needs a positive seconds duration, e.g. low 20s` },
            };
          }
          lowHoldSec = low;
          i++;
          continue;
        }

        return {
          ok: false,
          error: { line: lineNumber, message: `unknown fade option '${args[i]}' — use hold, high, or low` },
        };
      }

      return {
        ok: true,
        value: {
          mode,
          durationSec,
          highHoldSec,
          lowHoldSec,
          line: lineNumber,
        },
      };
    }
    
    // -------------------- main parse --------------------

  function parse(text) {
    const errors = [];
    const blocks = [];
    let tempo = 110;
    let meter = { num: 4, den: 4 };
    // Default to bar-aligned evaluate so cmd+enter swaps at the next bar
    // boundary. Use `eval now` (or `eval immediate`) for instant swaps.
    let evaluateMode = 'reset';
    let evaluateCutOnReset = false;
    let activeTuning = null;

    const rawLines = String(text).replace(/\r\n?/g, '\n').split('\n');

    let currentBlock = null;
    let pendingBlockMeta = null;

    function mergePendingBlockMeta(meta) {
      if (!meta) return;
      if (!pendingBlockMeta) {
        pendingBlockMeta = { tags: [], mutedDefault: false };
      }
      if (Array.isArray(meta.tags)) {
        for (const t of meta.tags) {
          const tag = String(t || '').toLowerCase();
          if (!tag) continue;
          if (!pendingBlockMeta.tags.includes(tag)) pendingBlockMeta.tags.push(tag);
        }
      }
      if (meta.mutedDefault != null) {
        pendingBlockMeta.mutedDefault = Boolean(meta.mutedDefault);
      }
    }

    function consumePendingBlockMeta() {
      const meta = pendingBlockMeta
        ? {
          tags: pendingBlockMeta.tags.slice(),
          mutedDefault: Boolean(pendingBlockMeta.mutedDefault),
        }
        : { tags: [], mutedDefault: false };
      pendingBlockMeta = null;
      return meta;
    }

    function applyPendingBlockMeta(block) {
      if (!block) return;
      const meta = consumePendingBlockMeta();
      block.tags = meta.tags;
      block.mutedDefault = meta.mutedDefault;
    }

    function endBlock() {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
    }

    function parseEvaluateFlag(args, lineNumber, requireMode, sourceName) {
      if (!Array.isArray(args) || args.length === 0) {
        if (requireMode) {
          return {
            ok: false,
            error: {
              line: lineNumber,
              message: `${sourceName || 'eval'} needs a mode — use 'eval reset [cut|keep]' or 'eval now'`,
            },
          };
        }
        return { ok: true, mode: null, cutOnReset: null };
      }

      let tokens = args
        .map((tok) => String(tok || '').toLowerCase())
        .filter(Boolean);

      if (tokens[0] === 'eval' || tokens[0] === 'evaluate') {
        tokens = tokens.slice(1);
      }

      if (tokens.length >= 1) {
        const modeTok = tokens[0];
        const mode = (modeTok === 'reset' || modeTok === 'bar' || modeTok === 'loop')
          ? 'reset'
          : ((modeTok === 'now' || modeTok === 'immediate') ? 'immediate' : null);
        if (!mode) {
          return {
            ok: false,
            error: {
              line: lineNumber,
              message: `unknown evaluate mode '${args.join(' ')}' — use 'eval reset [cut|keep]' or 'eval now'`,
            },
          };
        }

        let cutOnReset = null;
        if (tokens.length >= 2) {
          const flag = tokens[1];
          if (flag === 'cut' || flag === 'stop' || flag === 'hard') {
            cutOnReset = true;
          } else if (flag === 'keep' || flag === 'soft' || flag === 'tail' || flag === 'tails' || flag === 'blend') {
            cutOnReset = false;
          } else {
            return {
              ok: false,
              error: {
                line: lineNumber,
                message: `unknown eval reset flag '${tokens[1]}' — use 'cut' or 'keep'`,
              },
            };
          }
        }

        if (tokens.length > 2) {
          return {
            ok: false,
            error: {
              line: lineNumber,
              message: `too many eval flags in '${args.join(' ')}' — use 'eval reset [cut|keep]'`,
            },
          };
        }

        return { ok: true, mode, cutOnReset };
      }
      return { ok: true, mode: null, cutOnReset: null };
    }

    function cloneTuningValue(tuning) {
      if (!tuning || typeof tuning !== 'object') return null;
      return {
        ...tuning,
        pitchCents: Array.isArray(tuning.pitchCents) ? tuning.pitchCents.slice() : [],
        noteNames: Array.isArray(tuning.noteNames) ? tuning.noteNames.slice() : [],
      };
    }

    function parseTuningDirective(args, lineNumber) {
      if (!Array.isArray(args) || args.length < 1) {
        return {
          ok: false,
          error: { line: lineNumber, message: `tuning needs a preset id, e.g. 'tuning kirnberger-3'` },
        };
      }

      const tunings = root.ReplTunings;
      if (!tunings || typeof tunings.resolvePreset !== 'function' || typeof tunings.buildProgramTuning !== 'function') {
        return {
          ok: false,
          error: { line: lineNumber, message: `tuning catalog is unavailable — reload and try again` },
        };
      }

      const presetIdRaw = String(args[0] || '').trim();
      if (!presetIdRaw) {
        return {
          ok: false,
          error: { line: lineNumber, message: `tuning needs a preset id, e.g. 'tuning kirnberger-3'` },
        };
      }

      const preset = tunings.resolvePreset(presetIdRaw);
      if (!preset) {
        return {
          ok: false,
          error: {
            line: lineNumber,
            message: `unknown tuning '${presetIdRaw}' — choose a valid preset id from the tuning catalog`,
          },
        };
      }

      if (args.length > 2) {
        return {
          ok: false,
          error: { line: lineNumber, message: `tuning accepts at most one optional A4 value, e.g. 'tuning ${preset.id} 432'` },
        };
      }

      let a4Hz = null;
      if (args.length === 2) {
        if (typeof tunings.normalizeA4Hz !== 'function') {
          return {
            ok: false,
            error: { line: lineNumber, message: `tuning runtime is unavailable for A4 override` },
          };
        }
        a4Hz = tunings.normalizeA4Hz(args[1]);
        if (a4Hz == null) {
          return {
            ok: false,
            error: { line: lineNumber, message: `tuning A4 must be a positive number, e.g. 432 or 440` },
          };
        }
      }

      const value = tunings.buildProgramTuning(preset, a4Hz);
      if (!value) {
        return {
          ok: false,
          error: { line: lineNumber, message: `could not build tuning '${presetIdRaw}'` },
        };
      }

      value.requestedId = presetIdRaw;
      return { ok: true, value };
    }

    for (let i = 0; i < rawLines.length; i++) {
      const lineNumber = i + 1;
      const split = splitLineComment(rawLines[i]);
      const specialMeta = parseBlockMetaComment(split.comment);
      if (specialMeta) mergePendingBlockMeta(specialMeta);
      if (/^\s*#/.test(rawLines[i])) {
        continue;
      }
      const stripped = split.code.trimEnd();
      const trimmedForCheck = stripped.trim();

      if (!trimmedForCheck) {
        endBlock();
        continue;
      }

      // Tokenize the line. For voice/param classification we only need the
      // first whitespace-delimited word.
      const firstSpace = trimmedForCheck.search(/\s/);
      const head = (firstSpace < 0 ? trimmedForCheck : trimmedForCheck.slice(0, firstSpace)).toLowerCase();
      const tail = firstSpace < 0 ? '' : trimmedForCheck.slice(firstSpace + 1);

      // ---- file-level directives ----
      if (FILE_DIRECTIVES.has(head)) {
        if (currentBlock) endBlock();
        const args = tail.trim().split(/\s+/).filter(Boolean);
        if (head === 'tempo') {
          const t = Number(args[0]);
          if (!Number.isFinite(t) || t <= 0) {
            errors.push({ line: lineNumber, message: `tempo needs a positive bpm number` });
          } else {
            tempo = t;
          }
        } else if (head === 'meter') {
          const m = String(args[0] || '').match(/^(\d+)\/(\d+)$/);
          if (!m) {
            errors.push({ line: lineNumber, message: `meter must be like 4/4 or 6/8` });
          } else {
            meter = { num: parseInt(m[1], 10), den: parseInt(m[2], 10) };
          }
        } else if (head === 'tuning') {
          const tuningDirective = parseTuningDirective(args, lineNumber);
          if (!tuningDirective.ok) {
            errors.push(tuningDirective.error);
          } else {
            activeTuning = tuningDirective.value;
          }
          continue;
        } else if (head === 'eval' || head === 'evaluate') {
          const evalDirective = parseEvaluateFlag(args, lineNumber, true, 'eval');
          if (!evalDirective.ok) {
            errors.push(evalDirective.error);
          } else if (evalDirective.mode) {
            evaluateMode = evalDirective.mode;
            if (evalDirective.cutOnReset != null) evaluateCutOnReset = Boolean(evalDirective.cutOnReset);
          }
          continue;
        }
        const evalFlag = parseEvaluateFlag(args.slice(1), lineNumber, false, `${head} directive`);
        if (!evalFlag.ok) {
          errors.push(evalFlag.error);
        } else if (evalFlag.mode) {
          evaluateMode = evalFlag.mode;
          if (evalFlag.cutOnReset != null) evaluateCutOnReset = Boolean(evalFlag.cutOnReset);
        }
        continue;
      }

      // ---- live input line ----
      if (head === 'input') {
        endBlock();

        const parsedInput = parseInputSourceLine(tail, lineNumber);
        if (!parsedInput.ok) {
          errors.push(parsedInput.error);
          continue;
        }

        currentBlock = {
          voice: 'input',
          tuning: cloneTuningValue(activeTuning),
          input: parsedInput.value,
          slots: [
            { kind: 'leaf', token: { kind: 'input', value: parsedInput.value.kind } },
          ],
          slotsPerBar: 1,
          barSlotCounts: [1],
          bars: 1,
          params: {},
          effects: {},
          speed: { kind: 'scalar', value: 1 },
          attractor: { raw: parsedInput.value.kind, source: {} },
          source: {},
          fade: null,
          paramLines: {},
          controls: {},
          every: null,
          kit: null,
          line: lineNumber,
        };
        applyPendingBlockMeta(currentBlock);
        continue;
      }

      // ---- video line ----
      if (head === 'video') {
        endBlock();
        const parsedVideo = parseVideoSourceLine(tail, lineNumber);
        if (!parsedVideo.ok) {
          errors.push(parsedVideo.error);
          continue;
        }

        const videoSource = parsedVideo.value.kind;
        const slotTokens = parsedVideo.value.patternTokens && parsedVideo.value.patternTokens.length
          ? tokenizeSlotLine(parsedVideo.value.patternTokens.join(' '))
          : [];
        let slots = [{ kind: 'leaf', token: { kind: 'rest', value: null, raw: '.' } }];
        let bars = 1;
        let barSlotCounts = [1];

        if (slotTokens.length > 0) {
          const voiceName = videoSource === 'gen' ? 'video-gen' : 'video';
          const result = parseSlotStream(slotTokens, voiceName, lineNumber);
          if (result.errors.length) {
            for (const e of result.errors) errors.push(e);
          }
          if (result.slots.length > 0) {
            slots = result.slots;
            bars = result.bars;
            barSlotCounts = result.barSlotCounts;
          }
        }

        const voice = videoSource === 'gen' ? 'video-gen' : 'video';
        currentBlock = {
          voice,
          tuning: cloneTuningValue(activeTuning),
          slots,
          continuousOnly: slotTokens.length === 0,
          slotsPerBar: Math.max(1, slots.length / bars),
          barSlotCounts,
          bars,
          params: {},
          effects: {},
          speed: { kind: 'scalar', value: 1 },
          attractor: null,
          source: {},
          fade: null,
          paramLines: {},
          controls: {},
          every: null,
          kit: null,
          input: null,
          video: {
            kind: videoSource === 'gen' ? 'camera' : videoSource,
            mode: videoSource === 'gen' ? 'gen' : 'capture',
            sourceClipId: '',
          },
          videoGen: videoSource === 'gen'
            ? { source: 'camera', style: '', seed: '', duration: 0, cache: '' }
            : null,
          line: lineNumber,
        };
        applyPendingBlockMeta(currentBlock);
        continue;
      }

      // ---- voice line ----
      if (VOICE_NAMES.has(head)) {
        endBlock();
        const slotTokens = tokenizeSlotLine(tail);
        if (slotTokens.length === 0) {
          errors.push({ line: lineNumber, message: `voice '${head}' has no slots — add some notes or rests after it` });
          continue;
        }
        const result = parseSlotStream(slotTokens, head, lineNumber);
        if (result.errors.length) {
          for (const e of result.errors) errors.push(e);
        }
        const slots = result.slots;
        const bars = result.bars;
        const barSlotCounts = result.barSlotCounts;
        if (slots.length === 0) {
          errors.push({ line: lineNumber, message: `no slots parsed from '${tail}'` });
          continue;
        }
          currentBlock = {
            voice: head,
            tuning: cloneTuningValue(activeTuning),
            slots,
            continuousOnly: false,
            slotsPerBar: Math.max(1, slots.length / bars),
            barSlotCounts,
            bars,
            params: {},
            effects: {},
            speed: { kind: 'scalar', value: 1 },
            attractor: null,
            source: {},
              fade: null,
            paramLines: {},
            controls: {},
            every: null,
            kit: null,
            line: lineNumber,
          };
        applyPendingBlockMeta(currentBlock);
        continue;
      }
        
        // ---- block directives ----
        if (BLOCK_DIRECTIVES.has(head)) {
          if (!currentBlock) {
            errors.push({ line: lineNumber, message: `directive '${head}' has no voice above it — start a voice block first (string ..., drum ..., sample ..., or video camera ...)` });
            continue;
          }

          if (head === 'attractor') {
            const parsed = parseAttractorLine(tail, lineNumber);
            if (!parsed.ok) {
              errors.push(parsed.error);
              continue;
            }
            currentBlock.attractor = parsed.value;
            currentBlock.attractor.source = { ...(currentBlock.source || {}) };
            currentBlock.paramLines.attractor = lineNumber;
            continue;
          }

          if (head === 'source') {
            if (currentBlock.voice === 'video-gen') {
              const args = tail.trim().split(/\s+/).filter(Boolean);
              if (args.length < 1) {
                errors.push({ line: lineNumber, message: `source needs a value like camera, screen, file, or vgen-0001` });
                continue;
              }
              if (!currentBlock.videoGen) currentBlock.videoGen = { source: 'camera', style: '', seed: '', duration: 0, cache: '' };
              currentBlock.videoGen.source = String(args[0] || '').toLowerCase();
              currentBlock.paramLines.source = lineNumber;
              continue;
            }

            const parsed = parseSourceLine(tail, lineNumber);
            if (!parsed.ok) {
              errors.push(parsed.error);
              continue;
            }

            currentBlock.source = currentBlock.source || {};
            currentBlock.source[parsed.key] = parsed.value;

            if (currentBlock.attractor) {
              currentBlock.attractor.source = { ...currentBlock.source };
            }

            currentBlock.paramLines[`source.${parsed.key}`] = lineNumber;
            continue;
          }
        }
        
        // ---- live control rows ----
        if (LIVE_CONTROL_NAMES.has(head)) {
          if (!currentBlock) {
            errors.push({ line: lineNumber, message: `live control '${head}' has no block above it — start a voice/input block first` });
            continue;
          }

          const parsedControl = parseLiveControlLine(head, tail, lineNumber);
          if (!parsedControl.ok) {
            errors.push(parsedControl.error);
            continue;
          }

          currentBlock.controls = currentBlock.controls || {};
          currentBlock.controls[head] = parsedControl.value;
          currentBlock.paramLines[head] = lineNumber;
          continue;
        }

        // ---- input-only rows ----
        if (INPUT_ROW_NAMES.has(head)) {
          if (!currentBlock) {
            errors.push({ line: lineNumber, message: `input row '${head}' has no block above it — start an input block first (input mic, input interface, or input tab)` });
            continue;
          }

          if (currentBlock.voice === 'video' || currentBlock.voice === 'video-gen') {
            // video blocks may use monitor/listen as normal param rows
          } else if (currentBlock.voice !== 'input') {
            errors.push({ line: lineNumber, message: `${head} is only valid inside input blocks` });
            continue;
          }

          if (currentBlock.voice === 'video' || currentBlock.voice === 'video-gen') {
            // fall through to generic param parsing below
          } else {

          const valueTokens = tokenizeSlotLine(tail);
          if (valueTokens.length === 0) {
            errors.push({ line: lineNumber, message: `${head} needs on/off or a value` });
            continue;
          }

          const liveMod = parseLiveModLine(valueTokens, head, lineNumber);
          if (liveMod) {
            if (!liveMod.ok) {
              errors.push(liveMod.error);
              continue;
            }
            currentBlock.params[head] = { kind: 'scalar', value: liveMod.value };
            currentBlock.paramLines[head] = lineNumber;
            continue;
          }

          const parsedInputRow = parseParamStream(valueTokens, head, lineNumber, resolveInputRow);
          if (parsedInputRow.errors.length) {
            for (const e of parsedInputRow.errors) errors.push(e);
            continue;
          }

          const resolved = flattenParamNodes(parsedInputRow.nodes);
          if (resolved.length === 0) {
            errors.push({ line: lineNumber, message: `${head} needs on/off or a value` });
            continue;
          }

          currentBlock.params[head] = resolved.length === 1
            ? { kind: 'scalar', value: resolved[0] }
            : { kind: 'vector', values: resolved };

          currentBlock.paramLines[head] = lineNumber;
          continue;
          }
        }

        // ---- fade line ----
        if (FADE_DIRECTIVES.has(head)) {
          if (!currentBlock) {
            errors.push({ line: lineNumber, message: `fade has no voice above it — start a voice block first (string ..., drum ..., sample ..., or video camera ...)` });
            continue;
          }

          const parsed = parseFadeLine(tail, lineNumber);
          if (!parsed.ok) {
            errors.push(parsed.error);
            continue;
          }

          currentBlock.fade = parsed.value;
          currentBlock.paramLines.fade = lineNumber;
          continue;
        }
        
        // ---- effect surface line ----
        if (EFFECT_NAMES.has(head)) {
          if (!currentBlock) {
            errors.push({ line: lineNumber, message: `effect '${head}' has no voice above it — start a voice block first (string ..., drum ..., sample ..., or video camera ...)` });
            continue;
          }

          const valueTokens = tokenizeSlotLine(tail);
          if (valueTokens.length === 0) {
            errors.push({ line: lineNumber, message: `${head} needs at least one value` });
            continue;
          }

          const liveMod = parseLiveModLine(valueTokens, head, lineNumber);
          if (liveMod) {
            if (!liveMod.ok) {
              errors.push(liveMod.error);
              continue;
            }
            currentBlock.effects[head] = { kind: 'scalar', value: liveMod.value };
            currentBlock.paramLines[head] = lineNumber;
            continue;
          }

          const parsedEffects = parseParamStream(valueTokens, head, lineNumber, resolveEffect);
          if (parsedEffects.errors.length) {
            for (const e of parsedEffects.errors) errors.push(e);
            continue;
          }

          const resolved = flattenParamNodes(parsedEffects.nodes);
          if (resolved.length === 0) {
            errors.push({ line: lineNumber, message: `${head} needs at least one value` });
            continue;
          }

          currentBlock.effects[head] = resolved.length === 1
            ? { kind: 'scalar', value: resolved[0] }
            : { kind: 'vector', values: resolved };

          currentBlock.paramLines[head] = lineNumber;
          continue;
        }

      // ---- drum kit row ----
      if (head === 'kit') {
        if (!currentBlock) {
          errors.push({ line: lineNumber, message: `kit has no voice above it — start a drum block first (drum k . s .)` });
          continue;
        }
        if (currentBlock.voice !== 'drum') {
          errors.push({ line: lineNumber, message: `kit is only valid inside drum blocks` });
          continue;
        }
        const args = tail.trim().split(/\s+/).filter(Boolean);
        if (args.length !== 1) {
          errors.push({ line: lineNumber, message: `kit must be a single id, e.g. 'kit 909'` });
          continue;
        }
        const kitId = String(args[0] || '').toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(kitId)) {
          errors.push({ line: lineNumber, message: `kit id '${args[0]}' is invalid — use letters, digits, dash, underscore` });
          continue;
        }
        currentBlock.kit = { id: kitId, raw: args[0] };
        currentBlock.paramLines.kit = lineNumber;
        continue;
      }

      // ---- video gen rows ----
      if (VIDEO_GEN_ROW_NAMES.has(head)) {
        if (!currentBlock) {
          errors.push({ line: lineNumber, message: `${head} has no block above it — start a video gen block first (video gen * . * .)` });
          continue;
        }
        if (currentBlock.voice !== 'video-gen') {
          // `source` remains available as a generic block directive elsewhere.
          if (head === 'source') {
            // let the normal source directive branch parse this for non-video-gen blocks
          } else {
            errors.push({ line: lineNumber, message: `${head} is only valid inside video gen blocks` });
            continue;
          }
        } else {
          const args = tail.trim().split(/\s+/).filter(Boolean);
          if (!currentBlock.videoGen) currentBlock.videoGen = { source: 'camera', style: '', seed: '', duration: 0, cache: '' };
          if (head === 'source') {
            if (args.length < 1) {
              errors.push({ line: lineNumber, message: `source needs a value like camera, screen, file, or vgen-0001` });
              continue;
            }
            currentBlock.videoGen.source = String(args[0] || '').toLowerCase();
            currentBlock.paramLines.source = lineNumber;
            continue;
          }
          if (head === 'style') {
            currentBlock.videoGen.style = args.join(' ');
            currentBlock.paramLines.style = lineNumber;
            continue;
          }
          if (head === 'seed') {
            currentBlock.videoGen.seed = args.join(' ');
            currentBlock.paramLines.seed = lineNumber;
            continue;
          }
          if (head === 'cache') {
            currentBlock.videoGen.cache = args.join(' ');
            currentBlock.paramLines.cache = lineNumber;
            continue;
          }
          if (head === 'duration') {
            if (args.length < 1) {
              errors.push({ line: lineNumber, message: `duration needs a value like 4s or 6` });
              continue;
            }
            const rawDur = String(args[0] || '');
            const d = parseFadeDuration(rawDur);
            if (!Number.isFinite(d) || d <= 0) {
              errors.push({ line: lineNumber, message: `duration '${rawDur}' is invalid — use seconds like 4s` });
              continue;
            }
            currentBlock.videoGen.duration = d;
            currentBlock.paramLines.duration = lineNumber;
            continue;
          }
        }
      }

      // ---- parameter line ----
      if (PARAM_NAMES.has(head)) {
        if (!currentBlock) {
          errors.push({ line: lineNumber, message: `parameter '${head}' has no voice above it — start a voice block first (string ..., drum ..., sample ..., or video camera ...)` });
          continue;
        }

        if (head === 'variance' && currentBlock.voice !== 'drum') {
          errors.push({ line: lineNumber, message: `variance is only valid inside drum blocks` });
          continue;
        }

        if ((head === 'monitor' || head === 'listen') && currentBlock.voice !== 'input' && currentBlock.voice !== 'video' && currentBlock.voice !== 'video-gen') {
          errors.push({ line: lineNumber, message: `${head} is only valid inside input or video blocks` });
          continue;
        }

        if (head === 'glide' && !isPitchedVoice(currentBlock.voice)) {
          errors.push({ line: lineNumber, message: `glide is only valid inside pitched blocks (string, sine, osc, pluck, drone)` });
          continue;
        }

        if (head === 'every') {
          const args = tail.trim().split(/\s+/).filter(Boolean);
          const count = Number(args[0]);
          const unit = String(args[1] || '').toLowerCase();
          if (!Number.isFinite(count) || count <= 0 || (unit !== 'bars' && unit !== 'beats')) {
            errors.push({ line: lineNumber, message: `every must read like 'every 4 bars' or 'every 8 beats'` });
            continue;
          }
          currentBlock.every = { count: Math.round(count), unit };
          currentBlock.paramLines.every = lineNumber;
          continue;
        }

          // Parameter rows are control streams. They use the same
          // parenthesized grammar as voice rows, then flatten left-to-right
          // for event-leaf indexing in the scheduler. Bar dividers are allowed
          // only between top-level values and are ignored for flattening.
          //
          // Values may be literal resolved numbers or event-time control atoms:
          //   *   random legal value
          //   ~   hold previous resolved value
          //   _   reset/default
          //   *!  frozen random value for this param position
          //   *&N drifting random window over N seconds
          //
          // These are equivalent:
          //   decay (* 1 1 1) (* 1 1 1)
          //   decay * 1 1 1 * 1 1 1
        const valueTokens = tokenizeSlotLine(tail);
        if (valueTokens.length === 0) {
          errors.push({ line: lineNumber, message: `${head} needs at least one value` });
          continue;
        }

        if (head === 'glide') {
          if (valueTokens.length !== 1) {
            errors.push({ line: lineNumber, message: `glide takes one positive seconds value, e.g. glide 0.06` });
            continue;
          }
          const resolved = resolveParam('glide', valueTokens[0]);
          if (!resolved || !resolved.ok) {
            errors.push({ line: lineNumber, message: resolved && resolved.message ? resolved.message : `glide must be a positive number of seconds` });
            continue;
          }
          currentBlock.params.glide = { kind: 'scalar', value: resolved.value };
          currentBlock.paramLines.glide = lineNumber;
          continue;
        }

        const liveMod = parseLiveModLine(valueTokens, head, lineNumber);
        if (liveMod) {
          if (!liveMod.ok) {
            errors.push(liveMod.error);
            continue;
          }
          const stream = { kind: 'scalar', value: liveMod.value };
          if (head === 'speed') {
            currentBlock.speed = stream;
          } else {
            currentBlock.params[head] = stream;
          }
          currentBlock.paramLines[head] = lineNumber;
          continue;
        }

        const parsedParams = parseParamStream(valueTokens, head, lineNumber);
        if (parsedParams.errors.length) {
          for (const e of parsedParams.errors) errors.push(e);
          continue;
        }

        const resolved = flattenParamNodes(parsedParams.nodes);
        if (resolved.length === 0) {
          errors.push({ line: lineNumber, message: `${head} needs at least one value` });
          continue;
        }

          const stream = resolved.length === 1
            ? { kind: 'scalar', value: resolved[0] }
            : { kind: 'vector', values: resolved };

          if (head === 'speed') {
            currentBlock.speed = stream;
          } else {
            currentBlock.params[head] = stream;
          }

          currentBlock.paramLines[head] = lineNumber;
          continue;
      }

      // ---- unknown ----
      errors.push({
        line: lineNumber,
          message: `don't recognize '${head}' — start a voice/input line (string ..., drum ..., sample ..., video camera ..., input mic), set a parameter/effect/live control, or use directives like tempo, meter, tuning, eval, attractor, source, fade, kit, or every`,
      });
    }

    endBlock();

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    // Pre-resolve pitched sustain leaves (~) to the immediately-preceding note
    // in DFS order. Sample/noise/pulse sustains remain explicit sustain leaves so the
    // scheduler/editor can commit and highlight them distinctly from rests.
    for (const block of blocks) resolveSustains(block);

    return {
      ok: true,
      program: {
        tempo,
        meter,
        tuning: cloneTuningValue(activeTuning),
        transport: {
          evaluate: {
            mode: evaluateMode,
            cutOnReset: evaluateCutOnReset,
          },
        },
        blocks,
      },
    };
  }

  function resolveSustains(block) {
    const slots = block && Array.isArray(block.slots) ? block.slots : [];
    if (!block || !isPitchedVoice(block.voice)) return;

    let lastNoteValue = null;
    function visit(node) {
      if (node.kind === 'leaf') {
        const tok = node.token;
        if (tok.kind === 'note') {
          lastNoteValue = tok.value;
          return;
        }
        if (tok.kind === 'sustain') {
          if (tok.pitchSpanCarry === true) return;
          if (lastNoteValue) {
            node.token = { kind: 'note', value: { ...lastNoteValue, sustained: true }, raw: tok.raw || '~' };
          } else {
            node.token = { kind: 'rest', value: null, raw: tok.raw || '~' };
          }
          return;
        }
        return;
      }
      if (node.kind === 'group') {
        for (const child of node.children) visit(child);
      }
    }
    for (const s of slots) visit(s);
  }

  root.ReplDSL = { parse };
})(window);
