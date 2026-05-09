// Scheduler — runs a parsed Program against the Web Audio clock with a
// look-ahead loop (~25 ms horizon, 100 ms tick). Hot-swappable: update()
// installs a new program without dropping the master clock.
//
// Slots in a block are nested: each top-level slot is either a leaf
// (note/rest/sample) or a group whose children subdivide that slot's time
// evenly. Recursive dispatch handles arbitrary nesting depth.
//
// Public API:
//   const sched = ReplScheduler.create({ audioCtx, masterBus });
//   sched.start();                 // begin at t = 0
//   sched.stop();                  // halt + reset bar counter
//   sched.update(program);         // hot-swap; clock keeps running
//   sched.queueEvaluateAtReset(program, { stopVoices: false }); // swap at next bar reset when running
//   sched.now()  → { bar, beat, transport, blockStates }
//   sched.onMissingSample(fn);

(function (root) {
  'use strict';

  const LOOKAHEAD_MS = 100;
  const SCHEDULE_AHEAD_S = 0.12;
  const MIN_AUDIO_LEAD_S = 0.012;

  // Shared continuous-random gesture renderer. `*~` parses to a
  // `param-gesture` with `mode: 'continuous-random'`; voices and the
  // attractor bus both call this to schedule a stepwise random walk on a
  // Web Audio AudioParam. Without this, voices fell back to a single
  // setValueAtTime + linearRampToValueAtTime using only `from`, leaving
  // the value frozen for the duration of the event.
  function applyContinuousRandomGesture(param, gesture, time, duration, lo, hi, fallback) {
    if (!param || !gesture || gesture.kind !== 'param-gesture') return false;
    const ctx = param.context;
    const ctxNow = ctx && Number.isFinite(Number(ctx.currentTime)) ? Number(ctx.currentTime) : 0;
    const start = Number.isFinite(Number(time)) ? Math.max(ctxNow, Number(time)) : ctxNow;
    const dur = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : 0.5;
    const end = start + dur;

    const min = Number.isFinite(Number(lo)) ? Number(lo) : Number(gesture.lo);
    const max = Number.isFinite(Number(hi)) ? Number(hi) : Number(gesture.hi);
    const safeLo = Number.isFinite(min) ? min : 0;
    const safeHi = Number.isFinite(max) ? max : 1;

    const rateHz = Number.isFinite(Number(gesture.rateHz)) ? Number(gesture.rateHz) : 8;
    const step = Math.max(0.025, Math.min(0.25, 1 / rateHz));

    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
    const fromRaw = gesture && gesture.from !== undefined ? Number(gesture.from) : NaN;
    let current = Number.isFinite(fromRaw) ? fromRaw : fb;
    if (current < safeLo) current = safeLo;
    else if (current > safeHi) current = safeHi;

    try {
      param.cancelScheduledValues(start);
      param.setValueAtTime(current, start);

      let t = start;
      while (t < end - 0.0001) {
        const nextT = Math.min(end, t + step);
        const r = safeLo + Math.random() * (safeHi - safeLo);
        const next = r < safeLo ? safeLo : r > safeHi ? safeHi : r;
        param.linearRampToValueAtTime(next, Math.max(start + 0.006, nextT));
        t = nextT;
      }
      return true;
    } catch (_) {
      try { param.value = current; } catch (__) {}
      return true;
    }
  }

  root.ReplGestures = root.ReplGestures || {};
  root.ReplGestures.applyContinuousRandom = applyContinuousRandomGesture;

  function create(opts) {
    const audioCtx = opts.audioCtx;
    const masterBus = opts.masterBus;
    if (!audioCtx || !masterBus) throw new Error('scheduler: audioCtx + masterBus required');

    let program = null;
    let running = false;
    let timer = null;
    let originTime = 0;
      let pendingEvaluate = null;
      const missingSampleSeen = new Set();
      let onMissingCallback = null;
      let runtimeEpoch = 0;
      let runtimeEventSeq = 0;
      const pendingEditorPulseTimers = new Set();
      const sharedPitchSpanState = { up: null, down: null };
      let sharedPitchSpanBoundaryKey = null;

      function nextRuntimeEpoch(reason) {
        runtimeEpoch += 1;
        if (typeof root.VideoVoice !== 'undefined' && root.VideoVoice.resetRuntime) {
          try { root.VideoVoice.resetRuntime(reason || 'runtime'); } catch (_) {}
        }
        for (const id of Array.from(pendingEditorPulseTimers)) {
          try { root.clearTimeout(id); } catch (_) {}
        }
        pendingEditorPulseTimers.clear();
        emitEditorPulse({ kind: 'reset', reason: reason || 'runtime', epoch: runtimeEpoch });
        return runtimeEpoch;
      }

      function emitEditorPulse(payload) {
        const bus = root.ReplEditorPulse;
        if (!bus || typeof bus.emit !== 'function') return;
        try { bus.emit(payload || {}); } catch (_) {}
      }

      function emitEditorPulseAt(payload, time) {
        const when = Number(time);
        const delayMs = Number.isFinite(when)
          ? Math.max(0, (when - audioCtx.currentTime) * 1000)
          : 0;
        const epoch = runtimeEpoch;
        const event = { ...(payload || {}), epoch };
        if (delayMs > 4 && typeof root.setTimeout === 'function') {
          const id = root.setTimeout(() => {
            pendingEditorPulseTimers.delete(id);
            if (epoch !== runtimeEpoch || !running) return;
            emitEditorPulse(event);
          }, Math.min(delayMs, 1000));
          pendingEditorPulseTimers.add(id);
          return;
        }
        if (epoch !== runtimeEpoch || !running) return;
        emitEditorPulse(event);
      }

      function leafTokenLabel(tok) {
        if (!tok) return '';
        if (tok.raw) return String(tok.raw);
        if (tok.kind === 'rest') return tok.raw ? String(tok.raw) : '.';
        if (tok.kind === 'sustain') return tok.raw ? String(tok.raw) : '~';
        if (tok.kind === 'note' && tok.value) return tok.value.name || String(tok.value.freq || 'note');
          if (tok.kind === 'chord' && Array.isArray(tok.value)) {
            return tok.value.map((note) => note && note.name ? note.name : 'note').join('+');
          }
        if (tok.kind === 'note-random' && tok.value && tok.value.raw) return String(tok.value.raw);
        if (tok.kind === 'note-random') return '*';
        if (tok.kind === 'noise' && tok.value && tok.value.raw) return String(tok.value.raw);
        if (tok.kind === 'noise') return '*';
        if (tok.kind === 'pulse' && tok.value && tok.value.raw) return String(tok.value.raw);
        if (tok.kind === 'pulse') return '*';
        if (tok.kind === 'drum' && tok.value && tok.value.raw) return String(tok.value.raw);
        if (tok.kind === 'drum') return '*';
        if (tok.kind === 'video-hit' && tok.value && tok.value.raw) return String(tok.value.raw);
        if (tok.kind === 'video-hit') return '*';
        if (tok.kind === 'sample') return tok.value || 'sample';
        if (tok.kind === 'sample-selector' && tok.value) return tok.value.raw || 'sample';
        return tok.kind || '';
      }

      function visualDurationForLeaf(state, durationSeconds) {
        const stateName = String(state || 'hit').toLowerCase();
        const durMs = Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) * 1000 : 0;
        if (stateName === 'rest') return Math.max(70, Math.min(125, durMs * 0.22 || 95));
        if (stateName === 'held') return Math.max(90, Math.min(260, durMs * 0.38 || 150));
        return Math.max(110, Math.min(280, durMs * 0.32 || 180));
      }

      function emitBlockPositionPulse(block, time, detail) {
        if (!block) return;
        // Schedule block-position 5ms earlier than the slot's audio time. The
        // editor's block-position handler unconditionally wipes any leaf plate
        // on the owning line ("clear last event so it doesn't read as current
        // event during silent advances"), so it MUST arrive before the
        // corresponding leaf-fired pulse. Both events are scheduled for the
        // same `slotAbsTime`, but the dispatch path between the two emits
        // (param resolution, attractor, sample plan, playSample) advances
        // audioCtx.currentTime by 1-3ms, which makes leaf's setTimeout delay
        // shorter than block-position's. With equal `when` values that flips
        // the firing order on busy ticks and leaves leaves silently wiped.
        // The 5ms head-start is enough to absorb in-dispatch audio drift.
        const POSITION_LEAD_S = 0.005;
        const t = Number(time);
        const when = Number.isFinite(t) ? t - POSITION_LEAD_S : time;
        emitEditorPulseAt({
          kind: 'block-position',
          eventId: ++runtimeEventSeq,
          line: blockLine(block),
          blockId: block._blockId || null,
          blockOrdinal: Number.isFinite(Number(block._blockOrdinal)) ? Number(block._blockOrdinal) : null,
          voice: block.voice,
          slotsPerBar: Number(block.slotsPerBar) || null,
          slotsTotal: Array.isArray(block.slots) ? block.slots.length : null,
          scheduledAt: time,
          slotIndex: detail && Number.isFinite(Number(detail.slotIndex)) ? Number(detail.slotIndex) : null,
          blockSlotIndex: detail && Number.isFinite(Number(detail.blockSlotIndex)) ? Number(detail.blockSlotIndex) : null,
          cycleSlotIndex: detail && Number.isFinite(Number(detail.cycleSlotIndex)) ? Number(detail.cycleSlotIndex) : null,
          cycleLengthSlots: detail && Number.isFinite(Number(detail.cycleLengthSlots)) ? Number(detail.cycleLengthSlots) : null,
          isSilentAdvance: Boolean(detail && detail.isSilentAdvance),
        }, when);
      }

      function emitLeafPulse(block, time, detail) {
        if (!block) return;
        const count = Math.max(1, Number(detail && detail.leafCount) || Number(block._leafTotal) || 1);
        const rawIndex = Number(detail && detail.leafIndex);
        const index = Number.isFinite(rawIndex)
          ? ((Math.floor(rawIndex) % count) + count) % count
          : 0;
        const state = detail && detail.state ? detail.state : 'hit';
        const duration = detail && detail.duration;
        emitEditorPulseAt({
          kind: 'leaf',
          type: 'leaf-fired',
          eventId: ++runtimeEventSeq,
          line: blockLine(block),
          blockId: block._blockId || null,
          blockOrdinal: Number.isFinite(Number(block._blockOrdinal)) ? Number(block._blockOrdinal) : null,
          voice: block.voice,
          slotsTotal: Array.isArray(block.slots) ? block.slots.length : null,
          leafIndex: index,
          leafCount: count,
          leafPath: detail && Array.isArray(detail.leafPath) ? detail.leafPath.slice() : [],
          slotIndex: detail && Number.isFinite(Number(detail.slotIndex)) ? Number(detail.slotIndex) : null,
          sourceLeafIndex: detail && Number.isFinite(Number(detail.sourceLeafIndex)) ? Number(detail.sourceLeafIndex) : null,
          state,
          token: detail && detail.token ? detail.token : '',
          scheduledAt: time,
          duration,
          visualDurationMs: detail && Number.isFinite(Number(detail.visualDurationMs))
            ? Number(detail.visualDurationMs)
            : visualDurationForLeaf(state, duration),
          intensity: detail && detail.intensity != null ? detail.intensity : 1,
        }, time);
      }

      function blockLine(block) {
        const n = block && Number(block.line);
        return Number.isFinite(n) && n > 0 ? n : null;
      }

      function blockIdentityFor(block, ordinal) {
        // Identity is "voice@line#ordinal". The line+voice pair survives
        // re-parses of the same source; the ordinal disambiguates two sample
        // blocks on the same line during a hot-swap. The editor uses this
        // string verbatim to gate which line a leaf event may paint.
        const voice = block && block.voice ? String(block.voice) : 'block';
        const line = blockLine(block);
        const lineKey = line == null ? 'noline' : `L${line}`;
        return `${voice}@${lineKey}#${Number(ordinal) || 0}`;
      }

      function rowLine(block, name) {
        const lines = block && block.paramLines;
        const n = lines && Number(lines[name]);
        return Number.isFinite(n) && n > 0 ? n : blockLine(block);
      }

      function ensureBlockMuteState(block) {
        if (!block) return null;
        if (!block._muteState || typeof block._muteState !== 'object') {
          block._muteState = {
            muted: Boolean(block.mutedDefault),
            pending: null,
          };
        }
        return block._muteState;
      }

      function emitBlockMutePulse(block, time, pendingOverride) {
        if (!block) return;
        const state = ensureBlockMuteState(block);
        const pending = state && state.pending ? state.pending : null;
        const hasPending = pendingOverride != null ? Boolean(pendingOverride) : Boolean(pending);
        emitEditorPulseAt({
          kind: 'block-mute',
          line: blockLine(block),
          blockId: block._blockId || null,
          blockOrdinal: Number.isFinite(Number(block._blockOrdinal)) ? Number(block._blockOrdinal) : null,
          voice: block.voice,
          muted: Boolean(state && state.muted),
          pending: hasPending,
          pendingMuted: pending ? Boolean(pending.muted) : Boolean(state && state.muted),
          pendingAt: pending && Number.isFinite(Number(pending.at)) ? Number(pending.at) : null,
        }, time);
      }

      function applyBlockMuteNow(block, muted, atTime, quiet) {
        if (!block) return false;
        const state = ensureBlockMuteState(block);
        state.muted = Boolean(muted);
        state.pending = null;
        if (!quiet) emitBlockMutePulse(block, Number.isFinite(Number(atTime)) ? Number(atTime) : audioCtx.currentTime, false);
        return true;
      }

      function applyPendingMuteForBlock(block, atTime) {
        if (!block) return;
        const state = ensureBlockMuteState(block);
        const pending = state && state.pending ? state.pending : null;
        if (!pending) return;
        const when = Number(pending.at);
        const threshold = Number.isFinite(Number(atTime)) ? Number(atTime) : audioCtx.currentTime;
        if (!Number.isFinite(when) || when <= threshold + 0.000001) {
          applyBlockMuteNow(block, pending.muted, Number.isFinite(when) ? when : threshold, false);
        }
      }

      function blockIsMutedAt(block, atTime) {
        applyPendingMuteForBlock(block, atTime);
        const state = ensureBlockMuteState(block);
        return Boolean(state && state.muted);
      }

      function seedProgramMuteDefaults(prog, preserveExisting) {
        if (!prog || !Array.isArray(prog.blocks)) return;
        for (const block of prog.blocks) {
          const current = block && block._muteState;
          const keep = preserveExisting && current && typeof current === 'object';
          block._muteState = {
            muted: keep ? Boolean(current.muted) : Boolean(block && block.mutedDefault),
            pending: null,
          };
        }
      }

      function findBlockById(blockId) {
        const id = blockId == null ? '' : String(blockId);
        if (!id || !program || !Array.isArray(program.blocks)) return null;
        for (const block of program.blocks) {
          if (block && String(block._blockId || '') === id) return block;
        }
        return null;
      }

      function findBlockByLine(lineNumber) {
        const line = Number(lineNumber);
        if (!Number.isFinite(line) || line <= 0 || !program || !Array.isArray(program.blocks)) return null;
        for (const block of program.blocks) {
          if (blockLine(block) === line) return block;
        }
        return null;
      }

      const RANDOM_PITCH_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      const RANDOM_PITCH_OCTAVES = [2, 3, 4, 5];
      const PITCH_CLASS_BY_SEMITONE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

      function noteToMidi(name, accidental, octave) {
        if (root.ReplTunings && typeof root.ReplTunings.noteToMidi === 'function') {
          return root.ReplTunings.noteToMidi(name, accidental, octave);
        }
        const semitoneOffsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        let semis = semitoneOffsets[String(name || '').toUpperCase()];
        if (semis == null) return null;

        if (accidental === '#') semis += 1;
        if (accidental === 'b') semis -= 1;

        const oct = Number(octave);
        if (!Number.isFinite(oct)) return null;

        return (oct + 1) * 12 + semis;
      }

      function blockRuntimeTuning(block) {
        const b = block || null;
        if (!b || !b.tuning) return null;
        if (b._runtimeTuning) return b._runtimeTuning;
        if (root.ReplTunings && typeof root.ReplTunings.tuningToRuntime === 'function') {
          b._runtimeTuning = root.ReplTunings.tuningToRuntime(b.tuning);
        } else {
          b._runtimeTuning = b.tuning || null;
        }
        return b._runtimeTuning;
      }

      function midiToFreq(midi, block) {
        const m = Number(midi);
        if (!Number.isFinite(m)) return null;
        if (root.ReplTunings && typeof root.ReplTunings.midiToFreq === 'function') {
          return root.ReplTunings.midiToFreq(m, blockRuntimeTuning(block));
        }
        // Fallback: 12-TET A440.
        return 440 * Math.pow(2, (m - 69) / 12);
      }

      function midiToFreqContinuous(midi, block) {
        const m = Number(midi);
        if (!Number.isFinite(m)) return null;

        if (Math.abs(m - Math.round(m)) < 1e-9) {
          return midiToFreq(Math.round(m), block);
        }

        const lo = Math.floor(m);
        const hi = lo + 1;
        const frac = m - lo;
        const loHz = midiToFreq(lo, block);
        const hiHz = midiToFreq(hi, block);
        if (!Number.isFinite(loHz) || !Number.isFinite(hiHz) || loHz <= 0 || hiHz <= 0) return null;
        return loHz * Math.pow(hiHz / loHz, frac);
      }

      function midiToNameApprox(midi) {
        const m = Number(midi);
        if (!Number.isFinite(m)) return '';
        const semi = ((Math.round(m) % 12) + 12) % 12;
        const octave = Math.floor(Math.round(m) / 12) - 1;
        return `${PITCH_CLASS_BY_SEMITONE[semi]}${octave}`;
      }

      function randomArrayItem(items) {
        if (!items || items.length === 0) return null;
        return items[Math.floor(Math.random() * items.length)];
      }
      
      function chooseAttractorPitchClass(block) {
        const a = blockAttractor(block);
        if (!a) return randomArrayItem(RANDOM_PITCH_CLASSES);

        return attractorChoice(block, RANDOM_PITCH_CLASSES, (pc, i, signals) => {
          // A lightweight diatonic bias field:
          // density/periodicity lean toward stable A-C-E-G;
          // rupture/volatility open toward B-D-F.
          const stable = pc === 'A' || pc === 'C' || pc === 'E' || pc === 'G';
          const unstable = pc === 'B' || pc === 'D' || pc === 'F';
          return 1
            + (stable ? signals.periodicity * 2 + signals.density : 0)
            + (unstable ? signals.volatility * 1.5 + signals.rupture * 2 : 0)
            + signals.intensity * (i + 1) * 0.08;
        });
      }

      function chooseAttractorOctave(block) {
        const a = blockAttractor(block);
        if (!a) return randomArrayItem(RANDOM_PITCH_OCTAVES);

        return attractorChoice(block, RANDOM_PITCH_OCTAVES, (oct, i, signals) => {
          if (oct <= 2) return 1 + signals.density * 2 + signals.pressure;
          if (oct >= 5) return 1 + signals.rupture * 2 + signals.volatility;
          return 1 + signals.periodicity + signals.intensity;
        });
      }

      function resolveRandomPitch(node, spec) {
        if (!spec) return null;

        if (spec.frozen && node._frozenRandomPitch) {
          return node._frozenRandomPitch;
        }

          const pitchClass = spec.pitchClass || chooseAttractorPitchClass(node._blockForAttractor || null);
          const accidental = spec.pitchClass ? (spec.accidental || '') : '';
          const octave = spec.octave != null ? spec.octave : chooseAttractorOctave(node._blockForAttractor || null);

        const midi = noteToMidi(pitchClass, accidental, octave);
        if (!Number.isFinite(midi)) return null;
        const block = node && node._blockForAttractor ? node._blockForAttractor : null;

        const resolved = {
          name: `${pitchClass}${accidental}${octave}`,
          midi,
          freq: midiToFreq(midi, block),
        };
        if (!Number.isFinite(resolved.freq)) return null;

        if (spec.frozen) {
          node._frozenRandomPitch = resolved;
        }

        return resolved;
      }

      function isPitchSpanAdvanceToken(tok) {
        if (!tok) return false;
        if (tok.kind === 'pitch-span-end') return true;
        if ((tok.kind === 'rest' || tok.kind === 'sustain') && tok.pitchSpanCarry === true) return true;
        if (tok.kind === 'note-random' && tok.pitchSpanStep === true) return true;
        return false;
      }

      function collectBlockLeaves(block) {
        const out = [];
        const visit = (node) => {
          if (!node) return;
          if (node.kind === 'leaf') {
            out.push(node);
            return;
          }
          if (node.kind === 'group' && Array.isArray(node.children)) {
            for (const child of node.children) visit(child);
          }
        };
        if (block && Array.isArray(block.slots)) {
          for (const slot of block.slots) visit(slot);
        }
        return out;
      }

      function ensurePitchSpanPlans(block) {
        if (!block) return null;
        if (block._pitchSpanPlans) return block._pitchSpanPlans;

        const plans = new Map();
        const leaves = collectBlockLeaves(block);
        let open = null;

        for (const leaf of leaves) {
          const tok = leaf && leaf.token ? leaf.token : null;
          if (!tok) continue;

          if (tok.kind === 'pitch-span-start') {
            open = {
              startLeaf: leaf,
              startToken: tok,
              direction: tok.value && tok.value.direction === 'up' ? 'up' : 'down',
              shared: Boolean(tok.value && tok.value.shared),
              totalAdvances: 0,
            };
            continue;
          }

          if (!open) continue;
          if (isPitchSpanAdvanceToken(tok)) open.totalAdvances += 1;
          if (tok.kind === 'pitch-span-end') {
            plans.set(open.startLeaf, {
              ...open,
              endLeaf: leaf,
              endToken: tok,
              totalAdvances: Math.max(1, Number(open.totalAdvances) || 1),
            });
            open = null;
          }
        }

        block._pitchSpanPlans = plans;
        return plans;
      }

      function ensureBlockPitchSpanRuntime(block) {
        if (!block) return null;
        if (block._pitchSpanState) return block._pitchSpanState;
        block._pitchSpanState = {
          local: null,
          localChannels: new Map(),
          activeRef: null,
          lastMidi: null,
          lastBarKey: null,
        };
        return block._pitchSpanState;
      }

      function blockSpanPersistentMode(block) {
        return Boolean(block && block.params && block.params.glide != null);
      }

      function blockBarKey(block, absSlotIdx) {
        const grid = ensureBarGrid(block);
        const idx = Math.max(0, Math.floor(Number(absSlotIdx) || 0));
        const cycle = Math.floor(idx / grid.totalSlots);
        const inCycle = idx - cycle * grid.totalSlots;
        const bar = grid.slotToBar[inCycle];
        return `${cycle}:${bar}`;
      }

      function clearSharedPitchSpans(includePersistent) {
        if (includePersistent) sharedPitchSpanBoundaryKey = null;
        const clearSlot = (dir) => {
          const active = sharedPitchSpanState[dir];
          if (!active) return;
          if (includePersistent || !active.persistent) {
            sharedPitchSpanState[dir] = null;
          }
        };
        clearSlot('up');
        clearSlot('down');
      }

      function clearSharedPitchSpansForBoundary(key) {
        const boundaryKey = key == null ? '' : String(key);
        if (sharedPitchSpanBoundaryKey === boundaryKey) return;
        sharedPitchSpanBoundaryKey = boundaryKey;
        clearSharedPitchSpans(false);
      }

      function maybeResetPitchSpansAtBoundary(block, absSlotIdx) {
        if (!block || !isPitchedSynthVoice(block.voice)) return;
        const state = ensureBlockPitchSpanRuntime(block);
        const key = blockBarKey(block, absSlotIdx);
        if (state.lastBarKey == null) {
          state.lastBarKey = key;
          return;
        }
        if (state.lastBarKey === key) return;
        state.lastBarKey = key;
        if (blockSpanPersistentMode(block)) return;
        state.local = null;
        state.activeRef = null;
        clearSharedPitchSpansForBoundary(key);
      }

      function noteObjectFromMidi(midi, block) {
        const m = Number(midi);
        if (!Number.isFinite(m)) return null;
        const freq = midiToFreqContinuous(m, block);
        if (!Number.isFinite(freq) || freq <= 0) return null;
        return {
          name: midiToNameApprox(m),
          midi: m,
          freq,
        };
      }

      function startSpecToNote(node, startSpec, block) {
        if (!startSpec || !block) return null;

        if (startSpec.kind === 'note') {
          const base = startSpec.note || null;
          if (!base) return null;
          const midi = Number(base.midi);
          return noteObjectFromMidi(midi, block);
        }

        if (startSpec.kind === 'wildcard') {
          const wrapped = startSpec.token || null;
          const randomToken = wrapped && wrapped.kind === 'note-random' ? wrapped.value : null;
          if (!randomToken) return null;
          node._blockForAttractor = block;
          const resolved = resolveRandomPitch(node, randomToken);
          if (!resolved || !Number.isFinite(resolved.midi)) return null;
          return noteObjectFromMidi(resolved.midi, block);
        }

        if (startSpec.kind === 'octave-anchor') {
          const oct = Number(startSpec.octave);
          if (!Number.isFinite(oct)) return null;
          node._blockForAttractor = block;
          const resolved = resolveRandomPitch(node, {
            pitchClass: null,
            accidental: '',
            octave: oct,
            frozen: false,
            raw: startSpec.raw || `${Math.round(oct)}*`,
          });
          if (!resolved || !Number.isFinite(resolved.midi)) return null;
          return noteObjectFromMidi(resolved.midi, block);
        }

        return null;
      }

      function wrapDirectionTarget(startMidi, targetMidi, direction) {
        const start = Number(startMidi);
        let target = Number(targetMidi);
        if (!Number.isFinite(start) || !Number.isFinite(target)) return null;
        if (direction === 'down') {
          let guard = 0;
          while (target >= start && guard < 16) {
            target -= 12;
            guard += 1;
          }
        } else {
          let guard = 0;
          while (target <= start && guard < 16) {
            target += 12;
            guard += 1;
          }
        }
        return target;
      }

      function endSpecToMidi(node, targetSpec, startMidi, direction, block) {
        if (!targetSpec || !block) return null;
        let rawMidi = null;

        if (targetSpec.kind === 'pitch-class-same-octave') {
          const startOctave = Math.floor(Number(startMidi) / 12) - 1;
          rawMidi = noteToMidi(targetSpec.pitchClass, targetSpec.accidental || '', startOctave);
        } else if (targetSpec.kind === 'wildcard-fixed-octave') {
          const oct = Number(targetSpec.octave);
          if (Number.isFinite(oct)) {
            node._blockForAttractor = block;
            const resolved = resolveRandomPitch(node, {
              pitchClass: null,
              accidental: '',
              octave: oct,
              frozen: targetSpec.frozen === true,
              raw: targetSpec.raw || `*${Math.round(oct)}`,
            });
            rawMidi = resolved && Number.isFinite(resolved.midi) ? Number(resolved.midi) : null;
          }
        }

        if (!Number.isFinite(rawMidi)) return null;
        return wrapDirectionTarget(startMidi, rawMidi, direction);
      }

      function spanDescriptorFromStart(node, tok, block, spanState, params, time) {
        if (!node || !tok || !block || !spanState) return null;
        const plans = ensurePitchSpanPlans(block);
        const plan = plans && plans.get(node);
        if (!plan) return null;

        const startSpec = tok.value && tok.value.startSpec ? tok.value.startSpec : null;
        const startNote = startSpecToNote(node, startSpec, block);
        if (!startNote || !Number.isFinite(startNote.midi)) return null;

        const endTok = plan.endToken || null;
        const targetSpec = endTok && endTok.value ? endTok.value.targetSpec : null;
        const direction = tok.value && tok.value.direction === 'up' ? 'up' : 'down';
        const endMidi = endSpecToMidi(node, targetSpec, startNote.midi, direction, block);
        if (!Number.isFinite(endMidi)) return null;
        const glideSpec = glideSpanSpec(params && params.glide);
        const glideSec = Math.max(0, Number(glideSpec.seconds) || 0);
        const glideMode = glideSpec.mode || 'hold';
        const glideReturnSec = Math.max(0, Number(glideSpec.returnSec) || glideSec);
        const startTime = Number.isFinite(Number(time)) ? Number(time) : audioCtx.currentTime;

        const desc = {
          shared: Boolean(tok.value && tok.value.shared),
          direction,
          persistent: blockSpanPersistentMode(block),
          totalAdvances: Math.max(1, Number(plan.totalAdvances) || 1),
          advances: 0,
          startMidi: Number(startNote.midi),
          endMidi: Number(endMidi),
          currentMidi: Number(startNote.midi),
          ownerBlockId: block._blockId || null,
          glideSec,
          glideMode,
          glideReturnSec,
          timeBased: glideSec > 0,
          startTime,
          durationSec: glideSec,
          sequenceOffsetSec: 0,
          eventStepSec: 0,
        };
        return { descriptor: desc, note: startNote };
      }

      function sharedSpanParticipantCount(direction) {
        if (!program || !Array.isArray(program.blocks)) return 1;
        const dir = direction === 'up' ? 'up' : 'down';
        let count = 0;
        for (const block of program.blocks) {
          if (!block || !isPitchedSynthVoice(block.voice)) continue;
          const leaves = collectBlockLeaves(block);
          if (leaves.some((leaf) => {
            const tok = leaf && leaf.token;
            return tok
              && tok.kind === 'pitch-span-start'
              && tok.value
              && tok.value.shared === true
              && (tok.value.direction === 'up' ? 'up' : 'down') === dir;
          })) {
            count += 1;
          }
        }
        return Math.max(1, count);
      }

      function sharedSpanEventStepSeconds(block, direction) {
        const participants = sharedSpanParticipantCount(direction);
        const barSec = program ? barSeconds(program) : 0;
        const slotSec = Number.isFinite(barSec) && barSec > 0
          ? slotDurationFor(block, 0, barSec)
          : 0;
        return Number.isFinite(slotSec) && slotSec > 0
          ? slotSec / participants
          : 0;
      }

      function nextSharedPitchSpanOffset(desc) {
        if (!desc || desc.timeBased !== true) return 0;
        const step = Number(desc.eventStepSec);
        if (!Number.isFinite(step) || step <= 0) return 0;
        const ordinal = Math.max(0, Number(desc.eventOrdinal) || 0);
        desc.eventOrdinal = ordinal + 1;
        return ordinal * step;
      }

      function noteForPitchSpanDescriptor(desc, block, time) {
        if (!desc || !block) return null;
        const duration = Number(desc.durationSec);
        const startTime = Number(desc.startTime);
        if (
          desc.timeBased === true
          && Number.isFinite(duration)
          && duration > 0
          && Number.isFinite(startTime)
        ) {
          const now = Number.isFinite(Number(time)) ? Number(time) : audioCtx.currentTime;
          const offset = Number.isFinite(Number(desc.sequenceOffsetSec)) ? Number(desc.sequenceOffsetSec) : 0;
          const elapsed = Math.max(0, now - startTime);
          const progress = Math.max(elapsed, offset);
          let ratio = clamp(progress / duration, 0, 1);
          const mode = String(desc.glideMode || 'hold').toLowerCase();
          if (mode === 'restart') {
            const phase = progress % duration;
            ratio = clamp(phase / duration, 0, 1);
          } else if (mode === 'return') {
            const returnSec = Math.max(0.001, Number(desc.glideReturnSec) || duration);
            const cycle = duration + returnSec;
            const phase = progress % cycle;
            ratio = phase <= duration
              ? clamp(phase / duration, 0, 1)
              : clamp(1 - ((phase - duration) / returnSec), 0, 1);
          }
          const midi = Number(desc.startMidi) + (Number(desc.endMidi) - Number(desc.startMidi)) * ratio;
          desc.currentMidi = midi;
          return noteObjectFromMidi(midi, block);
        }

        return null;
      }

      function advancePitchSpanDescriptor(desc, block, time) {
        if (!desc || !block) return null;
        const timeBasedNote = noteForPitchSpanDescriptor(desc, block, time);
        if (timeBasedNote) return timeBasedNote;

        const total = Math.max(1, Number(desc.totalAdvances) || 1);
        const nextAdv = Math.min(total, Math.max(0, Number(desc.advances) || 0) + 1);
        desc.advances = nextAdv;
        const ratio = Math.max(0, Math.min(1, nextAdv / total));
        const midi = desc.startMidi + (desc.endMidi - desc.startMidi) * ratio;
        desc.currentMidi = midi;
        return noteObjectFromMidi(midi, block);
      }

      function clonePitchSpanDescriptor(desc, overrides) {
        if (!desc) return null;
        const o = overrides || {};
        const startMidi = Number.isFinite(Number(o.startMidi))
          ? Number(o.startMidi)
          : Number(desc.startMidi);
        const endMidi = Number.isFinite(Number(o.endMidi))
          ? Number(o.endMidi)
          : Number(desc.endMidi);
        if (!Number.isFinite(startMidi) || !Number.isFinite(endMidi)) return null;

        return {
          shared: Boolean(o.shared != null ? o.shared : desc.shared),
          direction: (o.direction || desc.direction) === 'up' ? 'up' : 'down',
          persistent: Boolean(o.persistent != null ? o.persistent : desc.persistent),
          totalAdvances: Math.max(1, Number(o.totalAdvances != null ? o.totalAdvances : desc.totalAdvances) || 1),
          advances: Math.max(0, Number(o.advances) || 0),
          startMidi,
          endMidi,
          currentMidi: Number.isFinite(Number(o.currentMidi)) ? Number(o.currentMidi) : startMidi,
          ownerBlockId: o.ownerBlockId != null ? o.ownerBlockId : (desc.ownerBlockId || null),
          glideSec: Math.max(0, Number(o.glideSec != null ? o.glideSec : desc.glideSec) || 0),
          glideMode: String(o.glideMode != null ? o.glideMode : (desc.glideMode || 'hold')),
          glideReturnSec: Math.max(0, Number(o.glideReturnSec != null ? o.glideReturnSec : desc.glideReturnSec) || 0),
          timeBased: Boolean(o.timeBased != null ? o.timeBased : desc.timeBased),
          startTime: Number.isFinite(Number(o.startTime)) ? Number(o.startTime) : Number(desc.startTime),
          durationSec: Math.max(0, Number(o.durationSec != null ? o.durationSec : desc.durationSec) || 0),
          sequenceOffsetSec: Math.max(0, Number(o.sequenceOffsetSec != null ? o.sequenceOffsetSec : desc.sequenceOffsetSec) || 0),
          eventStepSec: Math.max(0, Number(o.eventStepSec != null ? o.eventStepSec : desc.eventStepSec) || 0),
          eventOrdinal: Math.max(0, Number(o.eventOrdinal != null ? o.eventOrdinal : desc.eventOrdinal) || 0),
        };
      }
      
      function clearNodeRuntimeState(node) {
        if (!node) return;

        if (node.kind === 'leaf') {
          delete node._frozenRandomPitch;
          delete node._drumFrozenPick;
          delete node._drumVarianceAnchor;
          return;
        }

        if (node.kind === 'group' && Array.isArray(node.children)) {
          for (const child of node.children) {
            clearNodeRuntimeState(child);
          }
        }
      }

      function disconnectBlockAttractorBus(block) {
        if (!block || !block._attractorBus) return;

        const bus = block._attractorBus;
          const nodes = [
            bus.input,
            bus.preGain,
            bus.filter,
            bus.resonanceA,
            bus.resonanceB,
            bus.saturator,
            bus.exciterHighpass,
            bus.exciterShaper,
            bus.exciterGain,
            bus.combDelay,
            bus.combDamp,
            bus.combFeedback,
            bus.combGain,
            bus.chorusDelay,
            bus.chorusGain,
            bus.chorusLfoDepth,
            bus.dryGain,
            bus.compressor,
            bus.delay,
            bus.delayFeedback,
            bus.wetGain,
            bus.fadeGain,
            bus.output,
          ];

        for (const node of nodes) {
          if (!node || typeof node.disconnect !== 'function') continue;
          try { node.disconnect(); } catch (_) {}
        }
          if (bus.chorusLfo && typeof bus.chorusLfo.stop === 'function') {
            try { bus.chorusLfo.stop(); } catch (_) {}
          }
        block._attractorBus = null;
      }

      function clearBlockRuntimeState(block) {
        if (!block) return;

        disconnectBlockAttractorBus(block);

        if (typeof root.InputVoice !== 'undefined' && root.InputVoice.disconnectBlock) {
          root.InputVoice.disconnectBlock(block);
        }
        if (typeof root.VideoVoice !== 'undefined' && root.VideoVoice.disconnectBlock) {
          try { root.VideoVoice.disconnectBlock(block._blockId || null); } catch (_) {}
        }

        block._paramState = {};
        block._liveModState = {};
        block._triggerState = {};
        // _speedState lives outside _paramState because resolveSpeedAtom
        // temporarily wraps it via _paramState swap. It MUST have the same
        // shape as a per-param state ({ last, frozen, drift }) — a bare {}
        // here would let resolveSpeedAtom's `if (!block._speedState)` guard
        // pass without re-init, and the next `paramState.drift[key]` access
        // (e.g., for `speed *&N`) would throw and silently halt the whole
        // dispatch tick.
        block._speedState = { last: undefined, frozen: {}, drift: {} };
        block._speedSlotIdx = 0;
        block._speedNextTime = null;
        block._lastDispatchedSlotIdx = 0;
        block._lastDispatchedTime = null;
        block._lastDispatchedDuration = null;
        block._everyCycleId = null;
        block._everyPatternBase = null;
        block._attractorSmoothed = null;
        block._organism = null;
          block._fadeState = null;
          block._lastFadeLevel = 1;
        block._pitchSpanPlans = null;
        block._pitchSpanState = null;

        if (Array.isArray(block.slots)) {
          for (const slot of block.slots) {
            clearNodeRuntimeState(slot);
          }
        }
      }

      function meterQuarterBeats(meter) {
        const num = Number(meter && meter.num);
        const den = Number(meter && meter.den);

        const numerator = Number.isFinite(num) && num > 0 ? num : 4;
        const denominator = Number.isFinite(den) && den > 0 ? den : 4;

        // Tempo is quarter-note BPM. Meter denominator therefore scales the
        // bar container:
        //
        //   12/8  = 12 * (4 / 8)  = 6 quarter beats
        //   12/16 = 12 * (4 / 16) = 3 quarter beats
        //   4/4   = 4 * (4 / 4)  = 4 quarter beats
        //
        // Leaf count still subdivides the bar; denominator controls bar length.
        return numerator * (4 / denominator);
      }

      function barSeconds(prog) {
        if (!prog) return (60 / 110) * 4;

        const tempo = Number(prog.tempo);
        const beatSeconds = 60 / (Number.isFinite(tempo) && tempo > 0 ? tempo : 110);

        return meterQuarterBeats(prog.meter) * beatSeconds;
      }

    // Resolve a { count, unit } spec (from block.enter / block.exit) to seconds
    // against the program tempo + meter. Returns null when the spec is missing
    // or invalid so callers can treat "no boundary" as no constraint.
    function spanSpecSeconds(spec, prog) {
      if (!spec || !prog) return null;
      const count = Number(spec.count);
      if (!Number.isFinite(count) || count < 0) return null;
      if (spec.unit === 'bars') return count * barSeconds(prog);
      if (spec.unit === 'beats') return count * (60 / prog.tempo);
      return null;
    }

    // True iff the block's active window contains `time`. Blocks with no
    // enter/exit are considered always-active. exit is exclusive (a block
    // with exit 16 bars goes silent the instant we reach bar 16).
    //
    // Anchor is the block's _arrangeOrigin (set by every install/update path)
    // — distinct from the global originTime (which anchors the bar grid).
    // This lets soft updates restart the arrangement on the next bar without
    // resetting the bar grid itself: hard `eval reset` cuts voices, soft
    // eval keeps tails, both replay the arrangement from the top.
    function blockIsActiveAt(block, time) {
      if (!block || !program) return true;
      if (!Number.isFinite(time)) return true;
      const anchor = Number.isFinite(block._arrangeOrigin) ? block._arrangeOrigin : originTime;
      const elapsed = time - anchor;
      const enterSec = spanSpecSeconds(block.enter, program);
      const exitSec = spanSpecSeconds(block.exit, program);
      if (Number.isFinite(enterSec) && elapsed < enterSec - 0.000001) return false;
      if (Number.isFinite(exitSec) && elapsed >= exitSec - 0.000001) return false;
      return true;
    }

      function start() {
        if (running) return;
        pendingEvaluate = null;
        clearSharedPitchSpans(true);
        running = true;
        originTime = audioCtx.currentTime + 0.05;
        nextRuntimeEpoch('start');
        if (program) {
            seedProgramMuteDefaults(program, true);
            for (const block of program.blocks) {
              block._scheduledThrough = 0;
              clearBlockRuntimeState(block);
              block._speedSlotIdx = 0;
              // start() runs on the very first PLAY (when no install has
              // anchored an arrangement). It must honor enter just like
              // installProgramAtReset / safeRestart / update — otherwise
              // every block fires at originTime and the staged build-up
              // collapses to a simultaneous attack.
              block._arrangeOrigin = originTime;
              const enterSec = spanSpecSeconds(block.enter, program);
              block._speedNextTime = Number.isFinite(enterSec) && enterSec > 0
                ? block._arrangeOrigin + enterSec
                : block._arrangeOrigin;
            }
        }
        tick();
        timer = setInterval(tick, LOOKAHEAD_MS);
      }
      
      function stopAllVoices(when) {
        const at = Number.isFinite(Number(when)) ? Number(when) : audioCtx.currentTime;
        if (typeof root.SampleVoice !== 'undefined' && root.SampleVoice.stopAll) {
          root.SampleVoice.stopAll(at);
        }

        if (typeof root.PianoVoice !== 'undefined' && root.PianoVoice.stopAll) {
          root.PianoVoice.stopAll(at);
        }

        if (typeof root.ViolinVoice !== 'undefined' && root.ViolinVoice.stopAll) {
          root.ViolinVoice.stopAll(at);
        }
        if (typeof root.CelloVoice !== 'undefined' && root.CelloVoice.stopAll) {
          root.CelloVoice.stopAll(at);
        }
          
          if (typeof root.MarimbaVoice !== 'undefined' && root.MarimbaVoice.stopAll) {
            root.MarimbaVoice.stopAll(at);
          }
          if (typeof root.VibraphoneVoice !== 'undefined' && root.VibraphoneVoice.stopAll) {
            root.VibraphoneVoice.stopAll(at);
          }

        if (typeof root.StringVoice !== 'undefined' && root.StringVoice.stopAll) {
          root.StringVoice.stopAll(at);
        }

        if (typeof root.SineVoice !== 'undefined' && root.SineVoice.stopAll) {
          root.SineVoice.stopAll(at);
        }

        if (typeof root.NoiseVoice !== 'undefined' && root.NoiseVoice.stopAll) {
          root.NoiseVoice.stopAll(at);
        }

        if (typeof root.PluckVoice !== 'undefined' && root.PluckVoice.stopAll) {
          root.PluckVoice.stopAll(at);
        }

        if (typeof root.PulseVoice !== 'undefined' && root.PulseVoice.stopAll) {
          root.PulseVoice.stopAll(at);
        }

        if (typeof root.DroneVoice !== 'undefined' && root.DroneVoice.stopAll) {
          root.DroneVoice.stopAll(at);
        }

        if (typeof root.VideoVoice !== 'undefined' && root.VideoVoice.cleanup) {
          root.VideoVoice.cleanup();
        }
      }

      function nextBarResetTime(now) {
        if (!program) return Math.max(audioCtx.currentTime, Number(now) || audioCtx.currentTime) + 0.05;
        const t = Number.isFinite(Number(now)) ? Number(now) : audioCtx.currentTime;
        const barSec = barSeconds(program);
        const elapsed = Math.max(0, t - originTime);
        const completedBars = Math.max(0, Math.floor(elapsed / barSec));
        let boundary = originTime + (completedBars + 1) * barSec;
        if (boundary <= t + 0.001) boundary += barSec;
        return boundary;
      }

      function installProgramAtReset(newProgram, resetTime, stopVoices) {
        const oldProgram = program;
        if (oldProgram && Array.isArray(oldProgram.blocks)) {
          for (const block of oldProgram.blocks) {
            disconnectBlockAttractorBus(block);
          }
        }

        if (stopVoices) stopAllVoices(resetTime);
        clearSharedPitchSpans(true);
        nextRuntimeEpoch('evaluate-reset');

        program = newProgram;
        originTime = Number.isFinite(Number(resetTime))
          ? Number(resetTime)
          : Math.max(audioCtx.currentTime, originTime);

        for (let i = 0; i < program.blocks.length; i++) {
          const block = program.blocks[i];
          block._blockOrdinal = i;
          block._blockId = blockIdentityFor(block, i);
          block._scheduledThrough = 0;
          clearBlockRuntimeState(block);
          block._leafOffsets = null;
          block._leafCounts = null;
          block._leafTotal = null;
          block._runtimeTuning = (root.ReplTunings && typeof root.ReplTunings.tuningToRuntime === 'function')
            ? root.ReplTunings.tuningToRuntime(block.tuning)
            : (block.tuning || null);
          ensureLeafOffsets(block);
          block._speedSlotIdx = 0;
          block._arrangeOrigin = originTime;
          const enterSec = spanSpecSeconds(block.enter, program);
          block._speedNextTime = Number.isFinite(enterSec) && enterSec > 0
            ? block._arrangeOrigin + enterSec
            : block._arrangeOrigin;
        }
        seedProgramMuteDefaults(program, false);
      }

      function stop() {
        running = false;
        pendingEvaluate = null;
        if (timer) {
          clearInterval(timer);
          timer = null;
        }

        clearSharedPitchSpans(true);
        nextRuntimeEpoch('stop');
        stopAllVoices();

        if (program) {
            for (const block of program.blocks) {
              block._scheduledThrough = 0;
              clearBlockRuntimeState(block);
              const muteState = ensureBlockMuteState(block);
              if (muteState) muteState.pending = null;
            }
        }
      }
      
      function safeRestart() {
        running = false;
        pendingEvaluate = null;

        if (timer) {
          clearInterval(timer);
          timer = null;
        }

        nextRuntimeEpoch('replay');
        stopAllVoices();

        running = true;
        originTime = audioCtx.currentTime + 0.05;

        if (program) {
          for (const block of program.blocks) {
            block._scheduledThrough = 0;
            block._speedSlotIdx = 0;
            block._arrangeOrigin = originTime;
            const enterSec = spanSpecSeconds(block.enter, program);
            block._speedNextTime = Number.isFinite(enterSec) && enterSec > 0
              ? block._arrangeOrigin + enterSec
              : block._arrangeOrigin;
            block._lastDispatchedSlotIdx = 0;
            block._lastDispatchedTime = null;
            block._lastDispatchedDuration = null;

            // Preserve frozen/random runtime state:
            // - leaf _frozenRandomPitch
            // - sample selector _frozenPick / _frozenPair
            // - param/effect frozen states
            // - drift states
            // - attractor smoothing / organism state
            //
            // This is the safe replay path, not a hard evaluate.
          }
        }

        tick();
        timer = setInterval(tick, LOOKAHEAD_MS);
      }

      function update(newProgram) {
        pendingEvaluate = null;
        const oldProgram = program;
        const oldBarSec = program ? barSeconds(program) : null;

        if (oldProgram && Array.isArray(oldProgram.blocks)) {
          for (const block of oldProgram.blocks) {
            disconnectBlockAttractorBus(block);
          }
        }

        clearSharedPitchSpans(true);
        nextRuntimeEpoch('update');
        program = newProgram;
        // Soft-update arrange origin: anchor enter/exit windows to the next
        // bar boundary so the new arrangement plays from the top on a
        // downbeat. Hard `eval reset` (separate path) cuts voices and resets
        // originTime; soft eval here preserves tails but still replays the
        // arrangement — the live-coding gesture composers want.
        const updateArrangeOrigin = running
          ? nextBarResetTime(audioCtx.currentTime)
          : originTime;
        // Every block gets a stable identity for the lifetime of this program.
        // The editor uses { epoch, blockId } to reject any pulse whose owning
        // block was replaced by a hot-swap, and to refuse cross-block leaf
        // resolution when one voice subdivides faster than another.
        for (let i = 0; i < program.blocks.length; i++) {
          const block = program.blocks[i];
          block._blockOrdinal = i;
          block._blockId = blockIdentityFor(block, i);
          if (block._scheduledThrough == null) block._scheduledThrough = 0;
          clearBlockRuntimeState(block);
          block._leafOffsets = null;
          block._leafCounts = null;
          block._leafTotal = null;
          block._runtimeTuning = (root.ReplTunings && typeof root.ReplTunings.tuningToRuntime === 'function')
            ? root.ReplTunings.tuningToRuntime(block.tuning)
            : (block.tuning || null);
          ensureLeafOffsets(block);
          block._speedSlotIdx = 0;
          block._arrangeOrigin = updateArrangeOrigin;
          const enterSec = spanSpecSeconds(block.enter, program);
          if (Number.isFinite(enterSec) && enterSec > 0) {
            block._speedNextTime = block._arrangeOrigin + enterSec;
          } else if (block.enter) {
            // enter 0 bars / beats — start at arrange origin.
            block._speedNextTime = block._arrangeOrigin;
          } else {
            block._speedNextTime = running
              ? Math.max(audioCtx.currentTime, originTime)
              : originTime;
          }
        }
      seedProgramMuteDefaults(program, false);
      if (running && oldBarSec) {
        const newBarSec = barSeconds(program);
        const now = audioCtx.currentTime;
        const elapsed = now - originTime;
        const elapsedBars = elapsed / oldBarSec;
        originTime = now - elapsedBars * newBarSec;
          for (const block of program.blocks) {
            clearBlockRuntimeState(block);
            // clearBlockRuntimeState wiped _speedNextTime to null. Restore
            // the right cursor for each kind of block:
            // - blocks with an enter directive: re-apply the arrange-origin
            //   offset so the block fires when its window opens.
            // - all others: realign to the (possibly re-tempo'd) bar grid.
            if (block.enter) {
              block._speedSlotIdx = 0;
              const enterSec = spanSpecSeconds(block.enter, program);
              const anchor = Number.isFinite(block._arrangeOrigin) ? block._arrangeOrigin : originTime;
              block._speedNextTime = (Number.isFinite(enterSec) && enterSec > 0)
                ? anchor + enterSec
                : anchor;
              continue;
            }
            alignBlockCursorToGrid(block, now, newBarSec);
          }
      }
    }

    function queueEvaluateAtReset(newProgram, options) {
        if (!newProgram) return null;
        if (!running || !program) {
          update(newProgram);
          return null;
        }

        const stopVoices = Boolean(options && options.stopVoices);
        const when = nextBarResetTime(audioCtx.currentTime);
        pendingEvaluate = { program: newProgram, resetTime: when, stopVoices };
        return when;
    }

    function setBlockMutedForBlock(block, muted, options) {
      if (!block) return { ok: false, reason: 'missing-block' };
      const state = ensureBlockMuteState(block);
      const nextMuted = Boolean(muted);
      const quantize = options && options.quantize === 'now' ? 'now' : 'bar';

      if (!running || quantize === 'now' || !program) {
        applyBlockMuteNow(block, nextMuted, audioCtx.currentTime, false);
        return {
          ok: true,
          applied: 'now',
          blockId: block._blockId || null,
          line: blockLine(block),
          muted: Boolean(state && state.muted),
          pending: false,
        };
      }

      const when = nextBarResetTime(audioCtx.currentTime);
      state.pending = { muted: nextMuted, at: when };
      emitBlockMutePulse(block, audioCtx.currentTime, true);
      return {
        ok: true,
        applied: 'queued',
        blockId: block._blockId || null,
        line: blockLine(block),
        muted: Boolean(state && state.muted),
        pending: true,
        pendingMuted: nextMuted,
        pendingAt: when,
      };
    }

    function setBlockMuted(blockId, muted, options) {
      const block = findBlockById(blockId);
      if (!block) {
        return { ok: false, reason: 'missing-block', blockId: blockId == null ? null : String(blockId) };
      }
      return setBlockMutedForBlock(block, muted, options);
    }

    function setBlockMutedByLine(lineNumber, muted, options) {
      const block = findBlockByLine(lineNumber);
      if (!block) {
        return { ok: false, reason: 'missing-block-line', line: Number(lineNumber) || null };
      }
      return setBlockMutedForBlock(block, muted, options);
    }

    function toggleBlockMutedByLine(lineNumber, options) {
      const block = findBlockByLine(lineNumber);
      if (!block) {
        return { ok: false, reason: 'missing-block-line', line: Number(lineNumber) || null };
      }
      const state = ensureBlockMuteState(block);
      const effective = state && state.pending ? Boolean(state.pending.muted) : Boolean(state && state.muted);
      return setBlockMutedForBlock(block, !effective, options);
    }

    function getMuteStates() {
      if (!program || !Array.isArray(program.blocks)) return [];
      return program.blocks.map((block, index) => {
        const state = ensureBlockMuteState(block);
        const pending = state && state.pending ? state.pending : null;
        return {
          blockIndex: index,
          blockId: block && block._blockId ? String(block._blockId) : null,
          voice: block && block.voice ? String(block.voice) : '',
          line: blockLine(block),
          muted: Boolean(state && state.muted),
          pending: Boolean(pending),
          pendingMuted: pending ? Boolean(pending.muted) : Boolean(state && state.muted),
          pendingAt: pending && Number.isFinite(Number(pending.at)) ? Number(pending.at) : null,
          tags: Array.isArray(block && block.tags) ? block.tags.slice() : [],
        };
      });
    }

    function onMissingSample(fn) { onMissingCallback = fn; }

    function reportMissingSample(name) {
      if (missingSampleSeen.has(name)) return;
      missingSampleSeen.add(name);
      if (onMissingCallback) onMissingCallback(name);
    }

      // Asymmetric bars: a block's cycle has `cycleBars` bars of equal
      // wall-clock duration, but each bar may hold a different slot count.
      // Slot N's duration is `barSec / barSlotCounts[bar(N)]`, so we cache
      // the prefix-sum of slot counts and a slot→bar map per block. Block
      // identity is rebuilt on every evaluate, so the cache implicitly
      // resets when patterns change.
      function ensureBarGrid(block) {
        if (block && block._barGrid) return block._barGrid;
        const slots = block && Array.isArray(block.slots) ? block.slots : [];
        const fallback = [Math.max(1, slots.length || 1)];
        const raw = block && Array.isArray(block.barSlotCounts) && block.barSlotCounts.length > 0
          ? block.barSlotCounts
          : fallback;
        const counts = raw.map((n) => Math.max(1, Math.floor(Number(n) || 0)));
        const cycleBars = counts.length;
        const slotPrefix = new Array(cycleBars + 1);
        slotPrefix[0] = 0;
        for (let i = 0; i < cycleBars; i++) slotPrefix[i + 1] = slotPrefix[i] + counts[i];
        const totalSlots = Math.max(1, slotPrefix[cycleBars]);
        const slotToBar = new Array(totalSlots);
        for (let b = 0; b < cycleBars; b++) {
          for (let k = 0; k < counts[b]; k++) {
            slotToBar[slotPrefix[b] + k] = b;
          }
        }
        const grid = { counts, cycleBars, slotPrefix, totalSlots, slotToBar };
        if (block) block._barGrid = grid;
        return grid;
      }

      // Time offset, relative to originTime, of the start of `absSlotIdx`.
      function slotStartOffset(block, absSlotIdx, barSec) {
        const grid = ensureBarGrid(block);
        const idx = Math.max(0, Math.floor(Number(absSlotIdx) || 0));
        const cycle = Math.floor(idx / grid.totalSlots);
        const inCycle = idx - cycle * grid.totalSlots;
        const bar = grid.slotToBar[inCycle];
        const slotInBar = inCycle - grid.slotPrefix[bar];
        const slotDur = barSec / grid.counts[bar];
        return (cycle * grid.cycleBars + bar) * barSec + slotInBar * slotDur;
      }

      function slotDurationFor(block, absSlotIdx, barSec) {
        const grid = ensureBarGrid(block);
        const idx = Math.max(0, Math.floor(Number(absSlotIdx) || 0));
        const inCycle = idx % grid.totalSlots;
        const bar = grid.slotToBar[inCycle];
        return barSec / grid.counts[bar];
      }

      function absSlotForElapsed(block, elapsed, barSec) {
        const grid = ensureBarGrid(block);
        if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
        const cycleSec = barSec * grid.cycleBars;
        if (!Number.isFinite(cycleSec) || cycleSec <= 0) return 0;
        const cycle = Math.floor(elapsed / cycleSec);
        const tIn = elapsed - cycle * cycleSec;
        const bar = Math.min(grid.cycleBars - 1, Math.max(0, Math.floor(tIn / barSec)));
        const tInBar = tIn - bar * barSec;
        const slotDur = barSec / grid.counts[bar];
        const slotInBar = Math.min(
          grid.counts[bar] - 1,
          Math.max(0, Math.floor(tInBar / slotDur)),
        );
        return cycle * grid.totalSlots + grid.slotPrefix[bar] + slotInBar;
      }

      function alignBlockCursorToGrid(block, referenceTime, barSecValue) {
        if (!block) return;
        const secPerBar = Number(barSecValue);
        const ref = Number.isFinite(Number(referenceTime)) ? Number(referenceTime) : audioCtx.currentTime;

        if (!Number.isFinite(secPerBar) || secPerBar <= 0 || !Number.isFinite(originTime)) {
          block._speedSlotIdx = Math.max(0, Math.floor(Number(block._speedSlotIdx) || 0));
          block._speedNextTime = Math.max(ref, originTime || ref);
          return;
        }

        // Per-block cursor recovery. This is intentionally NOT based on the
        // densest voice in the program: every block owns its own top-level
        // cursor, while nested groups only subdivide their own parent slot.
        const elapsed = Math.max(0, ref - originTime);
        let slotIdx = absSlotForElapsed(block, elapsed + 0.000001, secPerBar);
        let slotTime = originTime + slotStartOffset(block, slotIdx, secPerBar);

        // If the candidate slot is already behind the audio clock, skip it
        // instead of emitting catch-up leaves at the same instant as another
        // voice's subdivision. This prevents lower-density rows from appearing
        // to inherit faster nested rhythms after evaluate/hot swap.
        while (slotTime < ref - 0.002) {
          slotIdx += 1;
          slotTime = originTime + slotStartOffset(block, slotIdx, secPerBar);
        }

        block._speedSlotIdx = slotIdx;
        block._speedNextTime = slotTime;
        block._scheduledThrough = slotIdx;
        block._lastDispatchedSlotIdx = null;
        block._lastDispatchedTime = null;
        block._lastDispatchedDuration = null;
      }

      function clamp(v, lo, hi) {
        const n = Number(v);
        if (!Number.isFinite(n)) return lo;
        return n < lo ? lo : n > hi ? hi : n;
      }

      function lerp(a, b, t) {
        return a + (b - a) * t;
      }

      function randomBetween(lo, hi) {
        return lo + Math.random() * (hi - lo);
      }

      function randomChoice(values) {
        if (!values || values.length === 0) return null;
        return values[Math.floor(Math.random() * values.length)];
      }
      
      function isEffectMode(v) {
        return v && typeof v === 'object' && v.kind === 'effect-mode';
      }

      function hasBlockEffects(block) {
        return Boolean(
          block &&
          block.effects &&
          Object.keys(block.effects).some((name) => {
            const effect = block.effects[name];
            if (!effect) return false;

            if (effect.kind === 'scalar') return effect.value != null;
            if (effect.kind === 'vector') return Array.isArray(effect.values) && effect.values.length > 0;

            return true;
          })
        );
      }

      function hasBlockFade(block) {
        return Boolean(block && block.fade && block.fade.mode && block.fade.mode !== 'clear');
      }

      function hasBlockProcessing(block) {
        return Boolean(
          block &&
          (
            block.attractor ||
            hasBlockEffects(block) ||
            hasBlockFade(block)
          )
        );
      }

      function effectModeAmount(name, mode) {
        const m = String(mode || '').toLowerCase();

        switch (name) {
          case 'compress':
            if (m === 'feedback') return 0.55;
            if (m === 'glue') return 0.28;
            if (m === 'clamp') return 0.75;
            return 0.35;

          case 'space':
            if (m === 'memory') return 0.55;
            if (m === 'weather') return 0.45;
            if (m === 'room') return 0.32;
            if (m === 'horizon') return 0.62;
            return 0.35;

          case 'resonance':
            if (m === 'pitch') return 0.48;
            if (m === 'memory') return 0.58;
            if (m === 'body') return 0.42;
            return 0.35;

          case 'comb':
            if (m === 'pitch') return 0.42;
            if (m === 'body') return 0.36;
            if (m === 'rupture') return 0.55;
            return 0.30;

          case 'grain':
            if (m === 'memory') return 0.42;
            if (m === 'scatter') return 0.55;
            if (m === 'freeze') return 0.48;
            return 0.30;

          case 'chorus':
            if (m === 'drift') return 0.32;
            if (m === 'swarm') return 0.52;
            if (m === 'shimmer') return 0.38;
            return 0.24;

          case 'excite':
            if (m === 'solar') return 0.48;
            if (m === 'rupture') return 0.38;
            if (m === 'electric') return 0.44;
            return 0.22;

          case 'blur':
            if (m === 'weather') return 0.40;
            if (m === 'smoke') return 0.55;
            if (m === 'haze') return 0.46;
            return 0.30;

          case 'scar':
            if (m === 'memory') return 0.38;
            if (m === 'rupture') return 0.52;
            if (m === 'ghost') return 0.44;
            return 0.25;

          case 'body':
            if (m === 'wood') return 0.38;
            if (m === 'metal') return 0.55;
            if (m === 'glass') return 0.50;
            if (m === 'room') return 0.36;
            if (m === 'tub') return 0.62;
            if (m === 'paper') return 0.34;
            if (m === 'stone') return 0.46;
            return 0.35;

          default:
            return 0;
        }
      }

      function effectModeName(v) {
        return isEffectMode(v) ? String(v.mode || '') : '';
      }

      function numericSurfaceValue(v, name, fallback) {
        if (isEffectMode(v)) return effectModeAmount(name, v.mode);
        if (isParamGesture(v)) return numericParamValue(v, fallback);
        if (isLiveMod(v)) return fallback;

        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      }

      function surfaceEndValue(v, name, fallback) {
        if (isEffectMode(v)) return effectModeAmount(name, v.mode);
        if (isParamGesture(v)) return gestureEndValue(v, fallback);
        if (isLiveMod(v)) return fallback;

        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      }
      
      function blockAttractor(block) {
        if (!block || !block.attractor || typeof root.ReplAttractors === 'undefined') {
          return null;
        }

        return root.ReplAttractors.peek(block.attractor);
      }

      function attractorAmount(block, key, fallback) {
        const a = blockAttractor(block);
        if (!a) return fallback;
        const v = Number(a[key]);
        return Number.isFinite(v) ? clamp(v, 0, 1) : fallback;
      }

      function attractorBiasRange(block, name, lo, hi) {
        const a = blockAttractor(block);
        if (!a) return randomBetween(lo, hi);

        const intensity = clamp(a.intensity, 0, 1);
        const volatility = clamp(a.volatility, 0, 1);
        const pressure = clamp(a.pressure, 0, 1);
        const density = clamp(a.density, 0, 1);
        const periodicity = clamp(a.periodicity, 0, 1);
        const rupture = clamp(a.rupture, 0, 1);

        let center = 0.5;
        let spread = 1;

        switch (name) {
          case 'pan':
            center = 0.5 + (volatility - 0.5) * 0.35;
            spread = 0.45 + volatility * 0.55;
            break;

          case 'gain':
            center = 0.25 + intensity * 0.55 + rupture * 0.15;
            spread = 0.35 + volatility * 0.4;
            break;

          case 'force':
            center = 0.25 + intensity * 0.65;
            spread = 0.3 + rupture * 0.5;
            break;

          case 'decay':
            center = 0.2 + periodicity * 0.55 + density * 0.2;
            spread = 0.25 + volatility * 0.45;
            break;

          case 'crush':
            center = rupture * 0.7 + pressure * 0.2;
            spread = 0.25 + rupture * 0.5;
            break;

          case 'tone':
            center = 0.2 + pressure * 0.35 + intensity * 0.35;
            spread = 0.25 + volatility * 0.45;
            break;

          case 'harm':
            center = 0.2 + density * 0.5 + intensity * 0.25;
            spread = 0.3 + volatility * 0.35;
            break;

          case 'octave':
            center = 0.35 + pressure * 0.35 - density * 0.15;
            spread = 0.35 + rupture * 0.35;
            break;

          case 'rate':
            center = 0.45 + pressure * 0.25 + volatility * 0.15;
            spread = 0.25 + volatility * 0.45;
            break;

          case 'start':
            center = density * 0.55 + volatility * 0.25;
            spread = 0.3 + rupture * 0.3;
            break;

          case 'speed':
            center = 0.35 + periodicity * 0.2 + volatility * 0.35 + rupture * 0.25;
            spread = 0.25 + volatility * 0.5;
            break;

          default:
            center = intensity;
            spread = 1;
            break;
        }

        const u = clamp(center + (Math.random() - 0.5) * spread, 0, 1);
        return lo + (hi - lo) * u;
      }

      function attractorChoice(block, values, weightsFn) {
        if (!values || values.length === 0) return null;
        const a = blockAttractor(block);
        if (!a || typeof weightsFn !== 'function') return randomChoice(values);

        let total = 0;
        const weights = values.map((v, i) => {
          const w = Math.max(0.0001, Number(weightsFn(v, i, a)) || 0.0001);
          total += w;
          return w;
        });

        let r = Math.random() * total;
        for (let i = 0; i < values.length; i++) {
          r -= weights[i];
          if (r <= 0) return values[i];
        }

        return values[values.length - 1];
      }
      
      function copyAttractorSignals(a) {
        if (!a) return null;
        return {
          intensity: clamp(a.intensity, 0, 1),
          volatility: clamp(a.volatility, 0, 1),
          pressure: clamp(a.pressure, 0, 1),
          density: clamp(a.density, 0, 1),
          periodicity: clamp(a.periodicity, 0, 1),
          rupture: clamp(a.rupture, 0, 1),
          age: clamp(a.age, 0, 1),
          confidence: clamp(a.confidence, 0, 1),
          source: String(a.source || 'fallback'),
          label: String(a.label || ''),
          updatedAt: String(a.updatedAt || ''),
        };
      }

      function couplingDepthForBlock(block, signals) {
        if (!block || !block.attractor || !signals) return 0;

        const raw = String(block.attractor.raw || '').toLowerCase();
        const kind = raw.split('.')[0];

          let base = 0.24;
          switch (kind) {
            case 'quake': base = 0.34; break;
            case 'tide': base = 0.28; break;
            case 'solar': base = 0.32; break;
            case 'archive': base = 0.22; break;
            case 'input':
            case 'mic':
            case 'interface':
            case 'tab': base = 0.36; break;
            case 'tub': base = 0.40; break;
            case 'weather': base = 0.26; break;
            case 'air': base = 0.24; break;
            case 'traffic': base = 0.28; break;
            case 'grid': base = 0.30; break;
            case 'orbit': base = 0.22; break;
            case 'civic': base = 0.26; break;
            default: base = 0.24; break;
          }

        const confidence = clamp(signals.confidence, 0, 1);
        const liveMul = signals.source === 'live' ? confidence : Math.min(0.55, confidence + 0.15);

          return clamp(base * liveMul, 0, signals.source === 'live' ? 0.42 : 0.16);
      }

      function attractorSmoothingForBlock(block, prev, next) {
        if (!block || !block.attractor || !prev || !next) return 0.12;

        const raw = String(block.attractor.raw || '').toLowerCase();
        const kind = raw.split('.')[0];

        // Rupture should attack faster than it releases.
        if (next.rupture > prev.rupture + 0.03) return 0.25;

        switch (kind) {
          case 'tide': return 0.025;
          case 'weather': return 0.045;
          case 'quake': return 0.11;
          case 'solar': return 0.075;
          case 'archive': return 0.035;
          case 'tub': return 0.13;
          default: return 0.06;
        }
      }

      function attractorSignalsForBlock(block, time) {
        const raw = blockAttractor(block);
        if (!raw) return null;

        const next = copyAttractorSignals(raw);
        if (!next) return null;

        if (!block._attractorSmoothed) {
          block._attractorSmoothed = next;
          return block._attractorSmoothed;
        }

        const prev = block._attractorSmoothed;
        const amt = attractorSmoothingForBlock(block, prev, next);

        block._attractorSmoothed = {
          intensity: lerp(prev.intensity, next.intensity, amt),
          volatility: lerp(prev.volatility, next.volatility, amt),
          pressure: lerp(prev.pressure, next.pressure, amt),
          density: lerp(prev.density, next.density, amt),
          periodicity: lerp(prev.periodicity, next.periodicity, amt),
          rupture: lerp(prev.rupture, next.rupture, amt),
          age: lerp(prev.age, next.age, amt),
          confidence: lerp(prev.confidence, next.confidence, amt),
          source: next.source,
          label: next.label,
          updatedAt: next.updatedAt,
        };

        return block._attractorSmoothed;
      }

      function slowCycle(block, time, rate, phaseOffset) {
        const seed = block && Number.isFinite(block._attractorSeed)
          ? block._attractorSeed
          : 0.37;
        return Math.sin(time * rate + seed * 9.17 + (phaseOffset || 0));
      }

      function noiseCycle(block, time, rate, phaseOffset) {
        const a = slowCycle(block, time, rate, phaseOffset);
        const b = slowCycle(block, time, rate * 0.37, phaseOffset + 1.91);
        return clamp((a * 0.65 + b * 0.35 + 1) / 2, 0, 1);
      }

      function ensureBlockOrganism(block) {
        if (!block._organism) {
          block._organism = {
            agitation: 0,
            wetness: 0,
            instability: 0,
            memory: 0,
            saturation: 0,
            compression: 0,
          };
        }
        return block._organism;
      }

      function updateOrganism(block, signals, depth) {
        const o = ensureBlockOrganism(block);
        const amount = 0.08 + depth * 0.22;

        o.agitation = lerp(o.agitation, signals.rupture * 0.75 + signals.volatility * 0.45, amount);
        o.wetness = lerp(o.wetness, signals.density * 0.65 + signals.intensity * 0.35, amount);
        o.instability = lerp(o.instability, signals.volatility * 0.75 + signals.age * 0.25, amount);
        o.memory = lerp(o.memory, signals.periodicity * 0.45 + signals.density * 0.55, amount);
        o.saturation = lerp(o.saturation, signals.rupture * 0.7 + signals.pressure * 0.3, amount);
        o.compression = lerp(o.compression, signals.pressure * 0.55 + signals.density * 0.35, amount);

        return o;
      }

      function attractorModForBlock(block, time) {
        const signals = attractorSignalsForBlock(block, time);
        if (!signals) return null;

        if (!Number.isFinite(block._attractorSeed)) {
          block._attractorSeed = Math.random();
        }

        const depth = couplingDepthForBlock(block, signals);
        if (depth <= 0) return null;

        const organism = updateOrganism(block, signals, depth);
        const raw = String(block.attractor && block.attractor.raw || '').toLowerCase();
        const kind = raw.split('.')[0];
        const mode = raw.split('.').slice(1).join('.');

        const i = signals.intensity;
        const v = signals.volatility;
        const p = signals.pressure;
        const d = signals.density;
        const t = signals.periodicity;
        const r = signals.rupture;
        const stale = signals.age;

        const slow = slowCycle(block, time, 0.18 + t * 0.22, 0);
        const med = slowCycle(block, time, 0.53 + v * 0.9, 1.3);
        const jitter = (noiseCycle(block, time, 2.7 + v * 7.5, 3.7) - 0.5) * 2;

        const mod = {
          signals,
          organism,
          depth,

          forceMul: 1,
          decayMul: 1,
          crushAdd: 0,
          resolutionAdd: 0,
          toneMul: 1,
          harmAdd: 0,
          octaveAdd: 0,
          panOffset: 0,
          gainMul: 1,
          rateMul: 1,
          startOffset: 0,
          gateMul: 1,

          filterFreq: 6200,
          filterQ: 0.8,
          delayTime: 0.18,
          delayFeedback: 0.08,
          wetGain: 0,
          dryGain: 1,
          saturation: 0,
          preGain: 1,
        };

        // General organismic coloration shared by all attractors.
          mod.gainMul *= 1 + depth * (i * 0.07 + r * 0.09 - d * 0.035);
          mod.panOffset += depth * (v * 0.11 * med + r * 0.15 * jitter);
          mod.decayMul *= 1 + depth * (d * 0.13 + t * 0.10 - r * 0.07);
          mod.toneMul *= 1 + depth * (p * 0.07 - d * 0.07 + r * 0.045);
          mod.crushAdd -= depth * r * 2.8;
          mod.resolutionAdd += depth * (r * 0.18 + p * 0.08);
          mod.rateMul *= 1 + depth * v * jitter * 0.03;
        mod.filterFreq = 850 + (1 - d * 0.65 + p * 0.35) * 6500;
        mod.filterQ = 0.65 + depth * (r * 5.5 + p * 1.6);
        mod.wetGain = depth * (d * 0.22 + i * 0.12 + t * 0.16);
        mod.delayFeedback = clamp(depth * (d * 0.26 + t * 0.22 + v * 0.08), 0, 0.55);
        mod.saturation = depth * (r * 0.42 + p * 0.18 + stale * 0.08);
        mod.preGain = 1 + depth * (r * 0.12 - d * 0.05);
        mod.dryGain = clamp(1 - mod.wetGain * 0.35, 0.72, 1);

        // Attractor-specific color.
        if (kind === 'weather') {
            mod.decayMul *= 1 + depth * (d * 0.16 + p * 0.08);
            mod.toneMul *= 1 - depth * d * 0.09;
            mod.panOffset += depth * v * slow * 0.09;
            mod.wetGain += depth * (d * 0.12 + i * 0.06);
            mod.delayTime = 0.16 + d * 0.18;

          if (mode === 'dew') {
              mod.decayMul *= 1 + depth * 0.09;
              mod.toneMul *= 1 - depth * 0.05;
              mod.wetGain += depth * 0.06;
          } else if (mode === 'frost') {
            mod.toneMul *= 1 + depth * 0.18;
            mod.crushAdd -= depth * 2.5;
            mod.resolutionAdd += depth * 0.18;
            mod.saturation += depth * 0.12;
          } else if (mode === 'visibility') {
            mod.filterFreq = 1200 + (1 - d) * 9000;
            mod.wetGain += depth * d * 0.15;
          }
        } else if (kind === 'quake') {
            mod.forceMul *= 1 + depth * r * 0.24;
            mod.gainMul *= 1 + depth * r * 0.16;
            mod.crushAdd -= depth * r * 4.2;
            mod.resolutionAdd += depth * r * 0.34;
            mod.decayMul *= 1 - depth * r * 0.18;
            mod.panOffset += depth * r * jitter * 0.24;
            mod.filterQ += depth * r * 3.8;
            mod.saturation += depth * r * 0.24;
            mod.preGain *= 1 + depth * r * 0.18;
        } else if (kind === 'tide') {
          const tideLfo = slowCycle(block, time, 0.12 + t * 0.08, 0);
          mod.gainMul *= 1 + depth * tideLfo * i * 0.16;
          mod.decayMul *= 1 + depth * t * 0.38;
          mod.panOffset += depth * tideLfo * 0.36;
          mod.rateMul *= 1 + depth * tideLfo * 0.035;
          mod.wetGain += depth * t * 0.24;
          mod.delayTime = 0.22 + t * 0.24;
          mod.delayFeedback += depth * t * 0.16;
        } else if (kind === 'solar') {
            mod.toneMul *= 1 + depth * i * 0.15;
            mod.rateMul *= 1 + depth * jitter * v * 0.04;
            mod.crushAdd -= depth * r * 3.4;
            mod.resolutionAdd += depth * r * 0.22;
            mod.saturation += depth * (i * 0.12 + r * 0.28);
          mod.filterFreq = 2000 + i * 9200;
          mod.filterQ += depth * (r * 3.5 + i * 1.2);
          mod.wetGain += depth * v * 0.10;
        } else if (kind === 'archive') {
          mod.rateMul *= 1 - depth * (d * 0.08 + stale * 0.08);
          mod.startOffset += depth * d * 0.06;
          mod.decayMul *= 1 + depth * (d * 0.24 + organism.memory * 0.22);
          mod.toneMul *= 1 - depth * stale * 0.12;
          mod.saturation += depth * 0.08;
          mod.wetGain += depth * organism.memory * 0.13;
        } else if (kind === 'tub') {
            mod.panOffset += depth * slow * 0.24;
            mod.wetGain += depth * 0.12;
            mod.delayFeedback += depth * 0.13;
            mod.saturation += depth * (r * 0.18 + v * 0.10);
            mod.crushAdd -= depth * r * 2.2;
            mod.resolutionAdd += depth * r * 0.18;
          mod.rateMul *= 1 + depth * jitter * 0.05;
        } else if (kind === 'air') {
          mod.toneMul *= 1 - depth * d * 0.20;
          mod.gainMul *= 1 - depth * p * 0.08;
          mod.wetGain += depth * d * 0.18;
          mod.filterFreq = 650 + (1 - d) * 5200;
        } else if (kind === 'traffic' || kind === 'grid' || kind === 'civic') {
          mod.gainMul *= 1 + depth * (d * 0.08 - p * 0.04);
          mod.crushAdd -= depth * (r * 3 + p * 2);
          mod.resolutionAdd += depth * (r * 0.24 + p * 0.14);
          mod.saturation += depth * (p * 0.22 + d * 0.12);
          mod.rateMul *= 1 + depth * jitter * v * 0.04;
          mod.delayFeedback += depth * d * 0.12;
        } else if (kind === 'input' || kind === 'mic' || kind === 'interface' || kind === 'tab') {
          mod.gainMul *= 1 + depth * (i * 0.10 - d * 0.05);
          mod.panOffset += depth * (v * med * 0.16 + r * jitter * 0.18);
          mod.wetGain += depth * (d * 0.14 + t * 0.10);
          mod.delayFeedback += depth * d * 0.08;
          mod.saturation += depth * r * 0.18;
          mod.filterFreq = 900 + (1 - d * 0.55 + p * 0.45) * 8400;
        } else if (kind === 'orbit') {
          mod.panOffset += depth * slow * 0.55;
          mod.toneMul *= 1 + depth * 0.12;
          mod.filterFreq = 3500 + i * 7000;
          mod.wetGain += depth * t * 0.16;
        }

          mod.wetGain = clamp(mod.wetGain, 0, 0.34);
          mod.delayFeedback = clamp(mod.delayFeedback, 0, 0.38);
          mod.saturation = clamp(mod.saturation, 0, 0.42);
        mod.filterFreq = clamp(mod.filterFreq, 120, 14000);
        mod.filterQ = clamp(mod.filterQ, 0.2, 12);
        mod.delayTime = clamp(mod.delayTime, 0.04, 0.85);
        mod.gainMul = clamp(mod.gainMul, 0.35, 1.85);
        mod.forceMul = clamp(mod.forceMul, 0.35, 1.75);
        mod.decayMul = clamp(mod.decayMul, 0.35, 2.25);
        mod.toneMul = clamp(mod.toneMul, 0.45, 1.65);
        mod.rateMul = clamp(mod.rateMul, 0.45, 1.75);
        mod.resolutionAdd = clamp(mod.resolutionAdd, 0, 0.85);
        mod.gateMul = clamp(mod.gateMul, 0.45, 1.85);

        return mod;
      }

      function makeSaturationCurve(amount) {
        const n = 2048;
        const curve = new Float32Array(n);
        const k = 1 + amount * 38;

        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * 2 - 1;
          curve[i] = Math.tanh(k * x) / Math.tanh(k);
        }

        return curve;
      }

      function ensureAttractorBus(block) {
          if (!hasBlockProcessing(block)) return null;
        if (block._attractorBus) return block._attractorBus;

        const input = audioCtx.createGain();
        const preGain = audioCtx.createGain();

        const filter = audioCtx.createBiquadFilter();
        const resonanceA = audioCtx.createBiquadFilter();
        const resonanceB = audioCtx.createBiquadFilter();

        const saturator = audioCtx.createWaveShaper();

        const exciterHighpass = audioCtx.createBiquadFilter();
        const exciterShaper = audioCtx.createWaveShaper();
        const exciterGain = audioCtx.createGain();

        const combDelay = audioCtx.createDelay(0.12);
        const combDamp = audioCtx.createBiquadFilter();
        const combFeedback = audioCtx.createGain();
        const combGain = audioCtx.createGain();

        const chorusDelay = audioCtx.createDelay(0.06);
        const chorusGain = audioCtx.createGain();
        const chorusLfo = audioCtx.createOscillator();
        const chorusLfoDepth = audioCtx.createGain();

        const compressor = audioCtx.createDynamicsCompressor();

        const dryGain = audioCtx.createGain();
        const delay = audioCtx.createDelay(1.25);
        const delayFeedback = audioCtx.createGain();
        const wetGain = audioCtx.createGain();
          const fadeGain = audioCtx.createGain();
          const output = audioCtx.createGain();

        filter.type = 'lowpass';
        filter.frequency.value = 12000;
        filter.Q.value = 0.7;

        resonanceA.type = 'peaking';
        resonanceA.frequency.value = 220;
        resonanceA.Q.value = 0.8;
        resonanceA.gain.value = 0;

        resonanceB.type = 'peaking';
        resonanceB.frequency.value = 880;
        resonanceB.Q.value = 0.8;
        resonanceB.gain.value = 0;

        saturator.curve = makeSaturationCurve(0.001);
        saturator.oversample = '2x';

        exciterHighpass.type = 'highpass';
        exciterHighpass.frequency.value = 3200;
        exciterShaper.curve = makeSaturationCurve(0.08);
        exciterShaper.oversample = '2x';
        exciterGain.gain.value = 0;

        combDelay.delayTime.value = 0.018;
        combDamp.type = 'lowpass';
        combDamp.frequency.value = 4200;
        combFeedback.gain.value = 0;
        combGain.gain.value = 0;

        chorusDelay.delayTime.value = 0.012;
        chorusGain.gain.value = 0;
        chorusLfo.type = 'sine';
        chorusLfo.frequency.value = 0.18;
        chorusLfoDepth.gain.value = 0.001;
        chorusLfo.connect(chorusLfoDepth);
        chorusLfoDepth.connect(chorusDelay.delayTime);
        try { chorusLfo.start(); } catch (_) {}

        compressor.threshold.value = -12;
        compressor.knee.value = 12;
        compressor.ratio.value = 1.5;
        compressor.attack.value = 0.012;
        compressor.release.value = 0.28;

        preGain.gain.value = 1;
        dryGain.gain.value = 1;
        delay.delayTime.value = 0.18;
        delayFeedback.gain.value = 0.05;
        wetGain.gain.value = 0;
          fadeGain.gain.value = 1;
          output.gain.value = 1;

        input.connect(preGain);
        preGain.connect(filter);
        filter.connect(resonanceA);
        resonanceA.connect(resonanceB);
        resonanceB.connect(saturator);

        // Main dry path.
        saturator.connect(compressor);
        compressor.connect(dryGain);
        dryGain.connect(output);

        // Space / blur path.
        compressor.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(output);

        // Comb/body path.
        filter.connect(combDelay);
        combDelay.connect(combDamp);
        combDamp.connect(combFeedback);
        combFeedback.connect(combDelay);
        combDelay.connect(combGain);
        combGain.connect(output);

        // Chorus/motion path.
        saturator.connect(chorusDelay);
        chorusDelay.connect(chorusGain);
        chorusGain.connect(output);

        // Exciter/energy path.
        saturator.connect(exciterHighpass);
        exciterHighpass.connect(exciterShaper);
        exciterShaper.connect(exciterGain);
        exciterGain.connect(output);

          output.connect(fadeGain);
          fadeGain.connect(masterBus);

        block._attractorBus = {
          input,
          preGain,
          filter,
          resonanceA,
          resonanceB,
          saturator,
          exciterHighpass,
          exciterShaper,
          exciterGain,
          combDelay,
          combDamp,
          combFeedback,
          combGain,
          chorusDelay,
          chorusGain,
          chorusLfo,
          chorusLfoDepth,
          compressor,
          dryGain,
          delay,
          delayFeedback,
          wetGain,
            fadeGain,
          output,
          _lastSaturation: 0,
          _lastExciterCurve: 0,
        };

        return block._attractorBus;
      }

      function setAudioParam(param, value, time, tau) {
        if (!param) return;
        const t = Number.isFinite(time) ? Math.max(audioCtx.currentTime, time) : audioCtx.currentTime;
        try {
          param.cancelScheduledValues(t);
          param.setTargetAtTime(value, t, tau || 0.05);
        } catch (_) {
          try { param.value = value; } catch (__) {}
        }
      }
      
      function smoothstep(x) {
        const t = clamp(x, 0, 1);
        return t * t * (3 - 2 * t);
      }

      function fadeCommandKey(fade) {
        if (!fade) return 'none';
        return [
          fade.mode || 'none',
          Number(fade.durationSec) || 0,
          Number(fade.highHoldSec) || 0,
          Number(fade.lowHoldSec) || 0,
        ].join(':');
      }

      function ensureFadeState(block, fade, time) {
        if (!block) return null;

        const key = fadeCommandKey(fade);
        const now = Number.isFinite(time) ? time : audioCtx.currentTime;

        if (!block._fadeState || block._fadeState.key !== key) {
          let initialLevel = 1;

          if (fade && fade.mode === 'in') initialLevel = 0;
          if (fade && fade.mode === 'out') initialLevel = 1;
          if (fade && fade.mode === 'inout') initialLevel = 0;
          if (fade && fade.mode === 'outin') initialLevel = 1;

          block._fadeState = {
            key,
            startTime: now,
            level: initialLevel,
            held: false,
            latched: false,
            completed: false,
          };
        }

        return block._fadeState;
      }

      function cyclicFadeLevel(fade, elapsed) {
        const d = Math.max(0.001, Number(fade.durationSec) || 0.001);
        const high = Math.max(0, Number(fade.highHoldSec) || 0);
        const low = Math.max(0, Number(fade.lowHoldSec) || 0);
        const cycle = Math.max(0.001, d + high + d + low);
        const pos = ((elapsed % cycle) + cycle) % cycle;

        if (fade.mode === 'inout') {
          // 0 → 1, hold high, 1 → 0, hold low.
          if (pos < d) return smoothstep(pos / d);
          if (pos < d + high) return 1;
          if (pos < d + high + d) return 1 - smoothstep((pos - d - high) / d);
          return 0;
        }

        if (fade.mode === 'outin') {
          // 1 → 0, hold low, 0 → 1, hold high.
          if (pos < d) return 1 - smoothstep(pos / d);
          if (pos < d + low) return 0;
          if (pos < d + low + d) return smoothstep((pos - d - low) / d);
          return 1;
        }

        return 1;
      }

      function fadeLevelForBlock(block, time) {
        const fade = block && block.fade;
        if (!fade) {
          if (block) block._lastFadeLevel = 1;
          return 1;
        }

        const now = Number.isFinite(time) ? time : audioCtx.currentTime;
        const state = ensureFadeState(block, fade, now);
        if (!state) return 1;

        if (fade.mode === 'clear') {
          state.level = 1;
          state.completed = true;
          state.latched = false;
          block._lastFadeLevel = 1;
          return 1;
        }

        if (fade.mode === 'hold') {
          const held = Number.isFinite(state.level)
            ? state.level
            : Number.isFinite(block._lastFadeLevel)
              ? block._lastFadeLevel
              : 1;

          state.level = clamp(held, 0, 1);
          state.held = true;
          block._lastFadeLevel = state.level;
          return state.level;
        }

        const elapsed = Math.max(0, now - state.startTime);
        const d = Math.max(0.001, Number(fade.durationSec) || 0.001);

        let level = 1;

        if (fade.mode === 'in') {
          const x = clamp(elapsed / d, 0, 1);
          level = smoothstep(x);
          state.completed = x >= 1;
          state.latched = state.completed;
          if (state.completed) level = 1;
        } else if (fade.mode === 'out') {
          const x = clamp(elapsed / d, 0, 1);
          level = 1 - smoothstep(x);
          state.completed = x >= 1;
          state.latched = state.completed;
          if (state.completed) level = 0;
        } else if (fade.mode === 'inout' || fade.mode === 'outin') {
          level = cyclicFadeLevel(fade, elapsed);
          state.completed = false;
          state.latched = false;
        }

        state.level = clamp(level, 0, 1);
        block._lastFadeLevel = state.level;
        return state.level;
      }

      function fadeStateForBlock(block, time) {
        if (!block || !block.fade) return null;

        const level = fadeLevelForBlock(block, time);
        const state = block._fadeState || null;

        return {
          mode: block.fade.mode,
          level,
          completed: Boolean(state && state.completed),
          latched: Boolean(state && state.latched),
          held: Boolean(state && state.held),
          durationSec: Number(block.fade.durationSec) || 0,
          highHoldSec: Number(block.fade.highHoldSec) || 0,
          lowHoldSec: Number(block.fade.lowHoldSec) || 0,
        };
      }

      function updateFadeGainForBlock(block, time) {
        if (!hasBlockFade(block)) return;

        const bus = ensureAttractorBus(block);
        if (!bus || !bus.fadeGain || !bus.fadeGain.gain) return;

        const level = fadeLevelForBlock(block, time);
        setAudioParam(bus.fadeGain.gain, level, time, 0.045);
      }
      
      function randomBetweenClamped(lo, hi) {
        const a = Number(lo);
        const b = Number(hi);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
        return a + Math.random() * (b - a);
      }

      function applyContinuousRandomAudioParam(param, gesture, time, duration, lo, hi, fallback) {
        if (!param || !isParamGesture(gesture)) return false;
        return root.ReplGestures.applyContinuousRandom(param, gesture, time, duration, lo, hi, fallback);
      }

      function updateAttractorBus(block, mod, effects, time) {
          if (!hasBlockProcessing(block)) return masterBus;
        const bus = ensureAttractorBus(block);
        if (!bus) return masterBus;

          const e = effects || {};
          const modes = e._modes || {};
          const signals = mod && mod.signals ? mod.signals : null;

          const combGesture = isParamGesture(e._rawComb) && e._rawComb.mode === 'continuous-random'
            ? e._rawComb
            : null;

          const spaceGesture = isParamGesture(e._rawSpace) && e._rawSpace.mode === 'continuous-random'
            ? e._rawSpace
            : null;

        const intensity = signals ? signals.intensity : 0;
        const volatility = signals ? signals.volatility : 0;
        const pressure = signals ? signals.pressure : 0;
        const density = signals ? signals.density : 0;
        const periodicity = signals ? signals.periodicity : 0;
        const rupture = signals ? signals.rupture : 0;
        const depth = mod ? mod.depth : 0;

        const body = clamp((e.body || 0) + depth * 0.18, 0, 1);
        const resonance = clamp((e.resonance || 0) + body * 0.35 + depth * (periodicity * 0.18 + density * 0.10), 0, 1);
          const combBase = combGesture
            ? numericParamValue(combGesture, 0)
            : (e.comb || 0);
          const comb = clamp(combBase + body * 0.28 + depth * (pressure * 0.16 + rupture * 0.10), 0, 1);
        const excite = clamp((e.excite || 0) + (mod ? mod.saturation * 0.55 : 0) + depth * intensity * 0.14, 0, 1);
        const chorus = clamp((e.chorus || 0) + depth * volatility * 0.12, 0, 1);
        const blur = clamp((e.blur || 0) + depth * density * 0.18, 0, 1);
        const scar = clamp((e.scar || 0) + depth * (rupture * 0.20 + density * 0.08), 0, 1);
        const grain = clamp((e.grain || 0) + depth * (volatility * 0.12 + density * 0.08), 0, 1);
          const spaceBase = spaceGesture
            ? numericParamValue(spaceGesture, 0)
            : (e.space || 0);
          const space = clamp(spaceBase + (mod ? mod.wetGain : 0) + blur * 0.18 + scar * 0.10, 0, 1);
        const compress = clamp((e.compress || 0) + depth * (density * 0.18 + rupture * 0.12), 0, 1);

        let filterFreq = mod ? mod.filterFreq : 12000;
        let filterQ = mod ? mod.filterQ : 0.7;
        let saturation = mod ? mod.saturation : 0;
        let preGain = mod ? mod.preGain : 1;
        let dryGain = mod ? mod.dryGain : 1;

        // Body modes.
        const bodyMode = modes.body || '';
        if (bodyMode === 'wood') {
          filterFreq *= 0.78;
          filterQ += body * 0.8;
        } else if (bodyMode === 'metal') {
          filterFreq *= 1.18;
          filterQ += body * 4.2;
          saturation += body * 0.08;
        } else if (bodyMode === 'glass') {
          filterFreq *= 1.28;
          filterQ += body * 5.0;
          saturation += body * 0.05;
        } else if (bodyMode === 'paper') {
          filterFreq *= 0.55;
          filterQ += body * 1.4;
        } else if (bodyMode === 'stone') {
          filterFreq *= 0.62;
          filterQ += body * 2.2;
          preGain *= 0.96;
        } else if (bodyMode === 'tub') {
          filterFreq *= 0.86;
          filterQ += body * 2.8;
          saturation += body * 0.10;
        }

        filterFreq *= 1 - blur * 0.42;
        filterQ += resonance * 3.2 + comb * 1.3;
        saturation += excite * 0.24 + scar * 0.10;

        const resonanceBase = bodyMode === 'metal' ? 330 : bodyMode === 'glass' ? 1240 : bodyMode === 'stone' ? 146 : bodyMode === 'paper' ? 520 : 220;
        const resonanceAHz = clamp(resonanceBase * (1 + pressure * 0.45), 80, 6000);
        const resonanceBHz = clamp(resonanceAHz * (bodyMode === 'glass' ? 3.01 : 2.02), 160, 9000);
        const resonanceGain = clamp(resonance * 8.5 + body * 2.5, 0, 11);
        const resonanceQ = clamp(0.6 + resonance * 9 + rupture * 3, 0.4, 18);

        const combDelayTime = clamp(
          0.006 + (1 - pressure) * 0.026 + slowCycle(block, time, 0.07 + periodicity * 0.08, 5.2) * comb * 0.004,
          0.003,
          0.075
        );
        const combFeedback = clamp(comb * 0.38 + body * 0.14 + rupture * depth * 0.12, 0, 0.72);
        const combGain = clamp(comb * 0.28 + body * 0.12, 0, 0.48);

        const chorusDelayTime = clamp(0.008 + chorus * 0.018, 0.004, 0.045);
        const chorusRate = clamp(0.08 + periodicity * 0.35 + volatility * 0.8 + chorus * 0.35, 0.04, 2.8);
        const chorusDepth = clamp(0.0005 + chorus * (0.0025 + volatility * 0.004), 0, 0.012);
        const chorusGain = clamp(chorus * 0.28 + grain * 0.08, 0, 0.45);

        const exciteGain = clamp(excite * 0.22 + grain * 0.06, 0, 0.34);
        const exciteCutoff = clamp(2200 + intensity * 3600 + excite * 2800, 1400, 9000);

        const delayTime = clamp((mod ? mod.delayTime : 0.18) + space * 0.18 + blur * 0.10, 0.04, 0.95);
        const delayFeedback = clamp((mod ? mod.delayFeedback : 0.04) + space * 0.22 + scar * 0.16 + grain * 0.08, 0, 0.58);
        const wetGain = clamp((mod ? mod.wetGain : 0) + space * 0.34 + blur * 0.16 + grain * 0.08, 0, 0.55);
        dryGain = clamp(dryGain - space * 0.18 - blur * 0.10, 0.58, 1);

        const threshold = -8 - compress * 28 - density * depth * 8;
        const ratio = 1 + compress * 7 + rupture * depth * 3;
        const attack = clamp(0.018 - compress * 0.012 - rupture * 0.006, 0.002, 0.05);
        const release = clamp(0.34 + density * 0.24 - rupture * 0.10, 0.08, 0.85);

        setAudioParam(bus.preGain.gain, clamp(preGain, 0.65, 1.45), time, 0.08);
        setAudioParam(bus.filter.frequency, clamp(filterFreq, 120, 15000), time, 0.12);
        setAudioParam(bus.filter.Q, clamp(filterQ, 0.2, 18), time, 0.10);

        setAudioParam(bus.resonanceA.frequency, resonanceAHz, time, 0.16);
        setAudioParam(bus.resonanceA.Q, resonanceQ, time, 0.14);
        setAudioParam(bus.resonanceA.gain, resonanceGain, time, 0.14);
        setAudioParam(bus.resonanceB.frequency, resonanceBHz, time, 0.18);
        setAudioParam(bus.resonanceB.Q, resonanceQ * 0.72, time, 0.16);
        setAudioParam(bus.resonanceB.gain, resonanceGain * 0.55, time, 0.16);

          if (combGesture) {
            applyContinuousRandomAudioParam(
              bus.combDelay.delayTime,
              {
                ...combGesture,
                from: combDelayTime,
                lo: 0.003,
                hi: 0.075,
                rateHz: Number.isFinite(Number(combGesture.rateHz)) ? Number(combGesture.rateHz) : 5,
              },
              time,
              1.25,
              0.003,
              0.075,
              combDelayTime
            );

            applyContinuousRandomAudioParam(
              bus.combFeedback.gain,
              {
                ...combGesture,
                from: combFeedback,
                lo: 0,
                hi: 0.72,
                rateHz: Number.isFinite(Number(combGesture.rateHz)) ? Number(combGesture.rateHz) * 0.75 : 4,
              },
              time,
              1.25,
              0,
              0.72,
              combFeedback
            );
          } else {
            setAudioParam(bus.combDelay.delayTime, combDelayTime, time, 0.10);
            setAudioParam(bus.combFeedback.gain, combFeedback, time, 0.12);
          }

          setAudioParam(bus.combDamp.frequency, clamp(1200 + (1 - blur) * 5200, 600, 9000), time, 0.14);
          setAudioParam(bus.combGain.gain, combGain, time, 0.12);

        setAudioParam(bus.chorusDelay.delayTime, chorusDelayTime, time, 0.12);
        setAudioParam(bus.chorusLfo.frequency, chorusRate, time, 0.18);
        setAudioParam(bus.chorusLfoDepth.gain, chorusDepth, time, 0.18);
        setAudioParam(bus.chorusGain.gain, chorusGain, time, 0.12);

        setAudioParam(bus.exciterHighpass.frequency, exciteCutoff, time, 0.12);
        setAudioParam(bus.exciterGain.gain, exciteGain, time, 0.10);

        setAudioParam(bus.compressor.threshold, threshold, time, 0.08);
        setAudioParam(bus.compressor.ratio, clamp(ratio, 1, 12), time, 0.08);
        setAudioParam(bus.compressor.attack, attack, time, 0.08);
        setAudioParam(bus.compressor.release, release, time, 0.12);

        setAudioParam(bus.dryGain.gain, dryGain, time, 0.10);
          if (spaceGesture) {
            applyContinuousRandomAudioParam(
              bus.delayFeedback.gain,
              {
                ...spaceGesture,
                from: delayFeedback,
                lo: 0,
                hi: 0.58,
                rateHz: Number.isFinite(Number(spaceGesture.rateHz)) ? Number(spaceGesture.rateHz) : 3,
              },
              time,
              1.5,
              0,
              0.58,
              delayFeedback
            );

            applyContinuousRandomAudioParam(
              bus.wetGain.gain,
              {
                ...spaceGesture,
                from: wetGain,
                lo: 0,
                hi: 0.55,
                rateHz: Number.isFinite(Number(spaceGesture.rateHz)) ? Number(spaceGesture.rateHz) * 0.75 : 2.25,
              },
              time,
              1.5,
              0,
              0.55,
              wetGain
            );
          } else {
            setAudioParam(bus.delayFeedback.gain, delayFeedback, time, 0.16);
            setAudioParam(bus.wetGain.gain, wetGain, time, 0.12);
          }

          setAudioParam(bus.delay.delayTime, delayTime, time, 0.14);

        if (Math.abs((bus._lastSaturation || 0) - saturation) > 0.025) {
          bus.saturator.curve = makeSaturationCurve(clamp(saturation, 0, 0.55));
          bus._lastSaturation = saturation;
        }

        const exciteCurveAmount = clamp(0.08 + excite * 0.32 + scar * 0.10, 0.01, 0.48);
        if (Math.abs((bus._lastExciterCurve || 0) - exciteCurveAmount) > 0.025) {
          bus.exciterShaper.curve = makeSaturationCurve(exciteCurveAmount);
          bus._lastExciterCurve = exciteCurveAmount;
        }

          if (bus.fadeGain && bus.fadeGain.gain) {
            const fadeLevel = fadeLevelForBlock(block, time);
            setAudioParam(bus.fadeGain.gain, fadeLevel, time, 0.045);
          }
          
        return bus.input;
      }

      function outputBusForBlock(block, time, mod, effects) {
          if (!hasBlockProcessing(block)) return masterBus;
          return updateAttractorBus(block, mod, effects, time);
      }

      function applyAttractorToParams(block, params, voice, time, duration, mod) {
        if (!mod) return params;

        const out = { ...params };
        const hasCrushRow = Boolean(block && block.params && block.params.crush);
        const hasResolutionRow = Boolean(block && block.params && block.params.resolution);

        if (voice === 'string' || voice === 'sine' || voice === 'osc' || voice === 'noise' || voice === 'pluck' || voice === 'pulse' || voice === 'drone') {
            out.force = clamp(numericParamValue(out.force, 0.7) * mod.forceMul, 0, 1.25);
            out.decay = clamp(numericParamValue(out.decay, 4.2) * mod.decayMul, 0.4, 8);
            out.crush = hasCrushRow
              ? clamp(Math.round(numericParamValue(out.crush, 0) + mod.crushAdd), 0, 16)
              : numericParamValue(out.crush, 0);
            out.resolution = hasResolutionRow
              ? clamp(numericParamValue(out.resolution, 0) + mod.resolutionAdd, 0, 1)
              : numericParamValue(out.resolution, 0);
            out.tone = clamp(numericParamValue(out.tone, 0.6) * mod.toneMul, 0, 1);
            out.harm = clamp(Math.round(numericParamValue(out.harm, 2) + mod.harmAdd), 0, 5);
            out.octave = clamp(Math.round(numericParamValue(out.octave, 0) + mod.octaveAdd), -2, 2);

            if (isParamGesture(out.pan)) {
              out.pan = {
                ...out.pan,
                from: clamp(numericParamValue(out.pan.from, 0) + mod.panOffset, -1, 1),
                to: clamp(numericParamValue(out.pan.to, 0) + mod.panOffset, -1, 1),
              };
            } else {
              out.pan = clamp(numericParamValue(out.pan, 0) + mod.panOffset, -1, 1);
            }

            out.gain = clamp(numericParamValue(out.gain, 1) * mod.gainMul, 0, 1.5);
        } else if (voice === 'sample' || voice === 'drum') {
            out.gain = clamp(numericParamValue(out.gain, 1) * mod.gainMul, 0, 1.5);
            out.crush = hasCrushRow
              ? clamp(Math.round(numericParamValue(out.crush, 0) + mod.crushAdd), 0, 16)
              : numericParamValue(out.crush, 0);
            out.resolution = hasResolutionRow
              ? clamp(numericParamValue(out.resolution, 0) + mod.resolutionAdd, 0, 1)
              : numericParamValue(out.resolution, 0);

            if (isParamGesture(out.pan)) {
              out.pan = {
                ...out.pan,
                from: clamp(numericParamValue(out.pan.from, 0) + mod.panOffset, -1, 1),
                to: clamp(numericParamValue(out.pan.to, 0) + mod.panOffset, -1, 1),
              };
            } else {
              out.pan = clamp(numericParamValue(out.pan, 0) + mod.panOffset, -1, 1);
            }

            if (isParamGesture(out.rate)) {
              out.rate = {
                ...out.rate,
                from: clamp(numericParamValue(out.rate.from, 1) * mod.rateMul, 0.25, 4),
                to: clamp(numericParamValue(out.rate.to, 1) * mod.rateMul, 0.25, 4),
              };
            } else {
              out.rate = clamp(numericParamValue(out.rate, 1) * mod.rateMul, 0.25, 4);
            }

            out.start = Math.max(0, numericParamValue(out.start, 0) + mod.startOffset);
            out.gateMul = mod.gateMul;
        } else if (voice === 'video' || voice === 'video-gen') {
            out.gain = clamp(numericParamValue(out.gain, 1) * mod.gainMul, 0, 1.5);
            out.opacity = clamp(numericParamValue(out.opacity, numericParamValue(out.gain, 1)) * mod.gainMul, 0, 1);
            out.threshold = clamp(numericParamValue(out.threshold, 0) + mod.resolutionAdd * 0.42, 0, 1);
            out.edges = clamp(numericParamValue(out.edges, 0) + mod.resolutionAdd * 0.48 + mod.crushAdd * 0.02, 0, 1);
            out.posterize = clamp(numericParamValue(out.posterize, 0) + mod.crushAdd * 0.018, 0, 1);
            out.invert = clamp(numericParamValue(out.invert, 0) + Math.max(0, mod.panOffset) * 0.22, 0, 1);
            out.contrast = clamp(numericParamValue(out.contrast, 0) + mod.forceMul * 0.08, 0, 1);
            out.saturate = clamp(numericParamValue(out.saturate, 0) + mod.toneMul * 0.08, 0, 1);
            out.displace = clamp(numericParamValue(out.displace, 0) + Math.abs(mod.panOffset) * 0.35, 0, 1);
            out.feedback = clamp(numericParamValue(out.feedback, 0) + mod.decayMul * 0.05, 0, 1);
            out.delay = clamp(numericParamValue(out.delay, 0) + mod.gateMul * 0.1, 0, 1);
            out.slitscan = clamp(numericParamValue(out.slitscan, 0) + mod.startOffset * 0.22, 0, 1);
            out.trail = clamp(numericParamValue(out.trail, 0) + mod.decayMul * 0.06, 0, 1);
            out.mask = clamp(numericParamValue(out.mask, 0) + mod.resolutionAdd * 0.2, 0, 1);
            out.key = clamp(numericParamValue(out.key, 0) + mod.forceMul * 0.05, 0, 1);
            out.color = clamp(numericParamValue(out.color, 0) + mod.toneMul * 0.08, 0, 1);
            out.monitor = clamp(numericParamValue(out.monitor, 1), 0, 1);
            out.listen = clamp(numericParamValue(out.listen, 1), 0, 1);
        }

        return out;
      }

      function isParamAtom(v) {
        return v && typeof v === 'object' && v.kind === 'param-op';
      }
      
      function isParamGesture(v) {
        return v && typeof v === 'object' && v.kind === 'param-gesture';
      }

      function numericParamValue(v, fallback) {
        if (isParamGesture(v)) {
          const from = Number(v.from);
          return Number.isFinite(from) ? from : fallback;
        }

        if (v && typeof v === 'object' && v.kind === 'glide-span') {
          const seconds = Number(v.seconds);
          return Number.isFinite(seconds) ? seconds : fallback;
        }

        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      }

      // Convert a glide-span duration to seconds using the active program's
      // bar/beat math. Falls back to the legacy `.seconds` field when no
      // count/unit pair is present (older parsed values).
      function glideSpanDurationSeconds(count, unit, fallbackSeconds) {
        const c = Number(count);
        if (Number.isFinite(c) && c > 0) {
          const u = String(unit || 'seconds').toLowerCase();
          if (u === 'bars' && program && Number(program.tempo) > 0) {
            return c * barSeconds(program);
          }
          if (u === 'beats' && program && Number(program.tempo) > 0) {
            return c * (60 / Number(program.tempo));
          }
          return c;
        }
        const fb = Number(fallbackSeconds);
        return Number.isFinite(fb) && fb > 0 ? fb : 0;
      }

      function glideSpanSpec(value) {
        if (value && typeof value === 'object' && value.kind === 'glide-span') {
          const seconds = Math.max(0, glideSpanDurationSeconds(value.count, value.unit, value.seconds));
          const modeRaw = String(value.mode || 'hold').toLowerCase();
          const mode = modeRaw === 'restart' || modeRaw === 'return' ? modeRaw : 'hold';
          const returnSec = mode === 'return'
            ? Math.max(0, glideSpanDurationSeconds(value.returnCount, value.returnUnit, value.returnSec || seconds))
            : seconds;
          return { seconds, mode, returnSec };
        }

        return {
          seconds: Math.max(0, numericParamValue(value, 0)),
          mode: 'hold',
          returnSec: 0,
        };
      }


      function isLiveMod(v) {
        return v && typeof v === 'object' && v.kind === 'live-mod';
      }

      function liveFeatureValue(signals, feature, fallback) {
        if (!signals) return fallback;
        const key = String(feature || 'intensity').toLowerCase();
        let value;

        switch (key) {
          case 'rms':
          case 'loudness':
          case 'intensity':
            value = signals.intensity;
            break;
          case 'flux':
          case 'volatility':
            value = signals.volatility;
            break;
          case 'pressure':
            value = signals.pressure;
            break;
          case 'density':
            value = signals.density;
            break;
          case 'periodicity':
            value = signals.periodicity;
            break;
          case 'onset':
          case 'rupture':
            value = signals.rupture;
            break;
          case 'silence':
          case 'age':
            value = signals.age;
            break;
          case 'confidence':
            value = signals.confidence;
            break;
          case 'brightness':
          case 'centroid':
            value = signals.brightness != null ? signals.brightness : signals.pressure;
            break;
          case 'motion':
            value = signals.motion != null ? signals.motion : signals.volatility;
            break;
          case 'presence':
            value = signals.presence != null ? signals.presence : signals.intensity;
            break;
          case 'contrast':
            value = signals.contrast != null ? signals.contrast : Math.max(signals.pressure || 0, signals.brightness || 0);
            break;
          case 'colortemp':
            value = signals.colortemp != null ? signals.colortemp : 0.5;
            break;
          case 'saturation':
            value = signals.saturation != null ? signals.saturation : signals.intensity;
            break;
          case 'edges':
            value = signals.edges != null ? signals.edges : signals.rupture;
            break;
          case 'flowx':
            value = signals.flowx != null ? signals.flowx : 0.5;
            break;
          case 'flowy':
            value = signals.flowy != null ? signals.flowy : 0.5;
            break;
          case 'stillness':
            value = signals.stillness != null ? signals.stillness : signals.age;
            break;
          case 'flicker':
            value = signals.flicker != null ? signals.flicker : signals.volatility;
            break;
          case 'centroidx':
            value = signals.centroidx != null ? signals.centroidx : 0.5;
            break;
          case 'centroidy':
            value = signals.centroidy != null ? signals.centroidy : 0.5;
            break;
          case 'faces':
            value = signals.faces != null ? signals.faces : signals.presence;
            break;
          case 'body':
            value = signals.body != null ? signals.body : signals.density;
            break;
          case 'depth':
            value = signals.depth != null ? signals.depth : signals.contrast;
            break;
          case 'noisiness':
          case 'flatness':
            value = signals.noisiness != null ? signals.noisiness : signals.volatility;
            break;
          case 'roughness':
            value = signals.roughness != null ? signals.roughness : Math.max(signals.volatility || 0, signals.rupture || 0);
            break;
          default:
            value = signals[key];
            break;
        }

        const n = Number(value);
        return Number.isFinite(n) ? clamp(n, 0, 1) : fallback;
      }

      function liveSignalsForSource(source) {
        if (typeof root.ReplAttractors === 'undefined' || !root.ReplAttractors.peek) return null;
        const raw = String(source || '').trim().toLowerCase();
        if (!raw) return null;
        return root.ReplAttractors.peek({ raw });
      }

      function liveSignalsForControl(control) {
        if (!control || !control.source) return null;
        return liveSignalsForSource(control.source);
      }

      function resolveLiveModValue(block, spec, fallback, time, name) {
        if (!isLiveMod(spec)) return fallback;

        const signals = liveSignalsForSource(spec.source);
        const raw = liveFeatureValue(signals, spec.feature, 0);
        const min = Number.isFinite(Number(spec.min)) ? Number(spec.min) : fallback;
        const max = Number.isFinite(Number(spec.max)) ? Number(spec.max) : fallback;
        const target = min + (max - min) * clamp(raw, 0, 1);

        if (!block) return target;
        if (!block._liveModState) block._liveModState = {};
        const key = `${name || 'param'}:${spec.source}.${spec.feature}:${min}:${max}`;
        const prev = block._liveModState[key];
        const now = Number.isFinite(time) ? time : audioCtx.currentTime;
        const prevTime = prev && Number.isFinite(prev.time) ? prev.time : now;
        const dt = Math.max(0, Math.min(0.25, now - prevTime));
        const feature = String(spec.feature || '').toLowerCase();
        const attack = feature === 'rupture' || feature === 'onset' ? 0.45 : 0.18;
        const release = feature === 'rupture' || feature === 'onset' ? 0.12 : 0.08;
        const amount = !prev ? 1 : target > prev.value ? attack : release;
        const scaled = clamp(amount + dt * 3, 0, 1);
        const value = !prev ? target : lerp(prev.value, target, scaled);

        block._liveModState[key] = { value, time: now };

        emitEditorPulse({
          kind: 'mod',
          line: rowLine(block, name),
          row: name || 'param',
          token: spec.raw || `${spec.source}.${spec.feature}`,
          source: spec.source,
          feature: spec.feature,
          intensity: raw,
          meter: true,
          voice: block && block.voice,
        });

        return value;
      }

      function liveControlValue(block, name, time, fallback) {
        const control = block && block.controls ? block.controls[name] : null;
        if (!control) return fallback;
        const signals = liveSignalsForControl(control);
        return liveFeatureValue(signals, control.feature, fallback);
      }

      function randomBetween(lo, hi) {
        return lo + Math.random() * (hi - lo);
      }

      function gestureEndValue(v, fallback) {
        if (isParamGesture(v)) {
          const to = Number(v.to);
          if (Number.isFinite(to)) return to;

          const from = Number(v.from);
          if (Number.isFinite(from)) return from;

          const lo = Number(v.lo);
          const hi = Number(v.hi);
          if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) * 0.5;

          return fallback;
        }

        return numericParamValue(v, fallback);
      }

      function avoidTinyGesture(from, to, lo, hi, minDistance) {
        let a = Number(from);
        let b = Number(to);

        if (!Number.isFinite(a)) a = lo;
        if (!Number.isFinite(b)) b = hi;

        a = clamp(a, lo, hi);
        b = clamp(b, lo, hi);

        const min = Number.isFinite(minDistance) ? minDistance : 0;

        if (Math.abs(b - a) >= min) {
          return { from: a, to: b };
        }

        // Push the destination away from the source while staying in range.
        if (a <= (lo + hi) / 2) {
          b = clamp(a + min, lo, hi);
        } else {
          b = clamp(a - min, lo, hi);
        }

        return { from: a, to: b };
      }

      function randomParamGesture(name, fallback, block) {
        const defaultValue = defaultForParam(name, fallback);

        if (name === 'pan') {
          const from = attractorBiasRange(block, 'pan', -1, 1);

          return {
            kind: 'param-gesture',
            op: 'continuous-random',
            mode: 'continuous-random',
            param: name,
            from,
            lo: -1,
            hi: 1,
            rateHz: 9,
            smoothing: 0.035,
            raw: '*~',
          };
        }

        if (name === 'rate') {
          const from = attractorBiasRange(block, 'rate', 0.75, 1.25);

          return {
            kind: 'param-gesture',
            op: 'continuous-random',
            mode: 'continuous-random',
            param: name,
            from,
            lo: 0.75,
            hi: 1.25,
            rateHz: 6,
            smoothing: 0.055,
            raw: '*~',
          };
        }

        if (name === 'comb') {
          const from = attractorBiasRange(block, 'comb', 0.04, 0.62);

          return {
            kind: 'param-gesture',
            op: 'continuous-random',
            mode: 'continuous-random',
            param: name,
            from,
            lo: 0.04,
            hi: 0.62,
            rateHz: 5,
            smoothing: 0.075,
            raw: '*~',
          };
        }

        if (name === 'space') {
          const from = attractorBiasRange(block, 'space', 0.08, 0.72);

          return {
            kind: 'param-gesture',
            op: 'continuous-random',
            mode: 'continuous-random',
            param: name,
            from,
            lo: 0.08,
            hi: 0.72,
            rateHz: 3,
            smoothing: 0.11,
            raw: '*~',
          };
        }

        // Unsupported gesture surfaces parse successfully, but resolve as a normal
        // random point for now. This keeps the grammar forward-compatible without
        // breaking current numeric params.
        const value = randomParamValue(name, defaultValue, block);
        return {
          kind: 'param-gesture',
          op: 'continuous-random',
          mode: 'continuous-random',
          param: name,
          from: value,
          lo: value,
          hi: value,
          rateHz: 1,
          smoothing: 0.1,
          raw: '*~',
        };
      }

      function gestureDurationForEvent(paramName, value, voice, params, gateDuration, slotDuration) {
        if (!isParamGesture(value)) return null;

        const gated = Number(gateDuration);
        if (Number.isFinite(gated) && gated > 0) {
          return Math.max(0.006, gated);
        }

        const dur = Number(slotDuration);
        const slot = Number.isFinite(dur) && dur > 0 ? dur : 0.25;

        if (paramName === 'pan') {
          if (voice === 'string' || voice === 'sine' || voice === 'osc') {
            const decay = numericParamValue(params && params.decay, 4.2);
            return clamp(Math.min(decay, 5.0), 0.08, 5.0);
          }

          return clamp(Math.min(slot * 2, 4.0), 0.05, 4.0);
        }

        if (paramName === 'rate') {
          return clamp(Math.min(slot * 2, 3.0), 0.05, 3.0);
        }

        return clamp(slot, 0.05, 2.0);
      }

      function defaultForParam(name, fallback) {
        switch (name) {
            case 'compress':
            case 'space':
            case 'resonance':
            case 'comb':
            case 'grain':
            case 'chorus':
            case 'excite':
            case 'blur':
            case 'scar':
            case 'body':
              return 0;
          case 'force': return 0.7;
          case 'decay': return 4.2;
          case 'crush': return 0;
          case 'resolution': return 0;
          case 'variance': return 1;
          case 'tone': return 0.6;
          case 'harm': return 2;
          case 'octave': return 0;
          case 'pan': return 0;
          case 'gain': return 1;
          case 'rate': return 1;
          case 'pedal': return 0;
          case 'una': return 0;
          case 'lid': return 0.72;
          case 'sympathetic': return 0.18;
          case 'release': return 0.35;
          case 'human': return 0;
          case 'stretch': return 0;
          case 'layer': return 'hard';
          case 'poly': return 64;
            case 'mallet': return 'yarn';
            case 'deadstroke': return 0;
            case 'roll': return 0;
            case 'spread': return 0.012;
            case 'motor': return 0;
            case 'depth': return 0.35;
            case 'damp': return 0;
            case 'bowpressure': return 0.45;
            case 'start': return 0;
            case 'speed': return 1;
          case 'monitor': return 1;
          case 'listen': return 1;
          case 'opacity': return 1;
          case 'threshold': return 0;
          case 'edges': return 0;
          case 'posterize': return 0;
          case 'invert': return 0;
          case 'contrast': return 0;
          case 'saturate': return 0;
          case 'displace': return 0;
          case 'slitscan': return 0;
          case 'trail': return 0;
          case 'mask': return 0;
          case 'key': return 0;
          case 'color': return 0;
          case 'blend': return 'source-over';

          // Future/optional params. These are not parsed by the uploaded REPL
          // yet unless PARAM_NAMES is expanded, but keeping defaults here makes
          // the control-stream resolver safe for upcoming FX rows.
          case 'delay': return 0;
          case 'feedback': return 0;
          case 'blur': return 0;
          case 'corrode': return 0;

          default: return fallback;
        }
      }

      function quantizeRandomParam(name, value) {
        switch (name) {
            case 'speed':
              return clamp(value, 0.0625, 16);
          case 'crush':
            return Math.round(clamp(value, 0, 16));

          case 'resolution':
            return clamp(value, 0, 1);
          case 'variance':
            return clamp(value, 0, 1);
          case 'pedal':
          case 'una':
          case 'lid':
          case 'sympathetic':
          case 'release':
          case 'human':
            case 'stretch':
            case 'deadstroke':
            case 'roll':
            case 'spread':
            case 'motor':
            case 'depth':
            case 'damp':
            case 'bowpressure':
              return clamp(value, 0, 1);

          case 'poly':
            return Math.round(clamp(value, 8, 128));
          case 'monitor':
          case 'listen':
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
            return clamp(value, 0, 1);

          case 'harm':
            return Math.round(clamp(value, 1, 5));

          case 'octave':
            return Math.round(clamp(value, -1, 1));
        case 'compress':
        case 'space':
        case 'resonance':
        case 'comb':
        case 'grain':
        case 'chorus':
        case 'excite':
        case 'blur':
        case 'scar':
        case 'body':
          return clamp(value, 0, 1);
          default:
            return value;
        }
      }

      function randomParamValue(name, fallback, block) {
        switch (name) {
            case 'pan':
              return attractorBiasRange(block, 'pan', -1, 1);

            case 'gain':
              return attractorBiasRange(block, 'gain', 0.25, 1.1);

            case 'force':
              return attractorBiasRange(block, 'force', 0.25, 1);

            case 'decay':
              return attractorBiasRange(block, 'decay', 0.4, 7);

            case 'crush':
              return attractorChoice(block, [0, 16, 14, 12, 10, 8, 6, 5, 4], (v, i, a) => {
                return 1 + a.rupture * i * 0.9 + a.pressure * i * 0.25;
              });

            case 'resolution':
              return attractorBiasRange(block, 'crush', 0, 1);
            case 'variance':
              return attractorBiasRange(block, 'density', 0, 1);
            case 'monitor':
            case 'listen':
              return attractorBiasRange(block, 'confidence', 0, 1);
            case 'opacity':
              return attractorBiasRange(block, 'intensity', 0.2, 1);
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
              return attractorBiasRange(block, 'rupture', 0, 1);

            case 'tone':
              return attractorBiasRange(block, 'tone', 0.15, 0.95);

            case 'harm':
              return attractorChoice(block, [1, 2, 3, 4, 5], (v, i, a) => 1 + a.density * i + a.intensity * i * 0.5);

            case 'octave':
              return attractorChoice(block, [-1, 0, 1], (v, i, a) => {
                if (v < 0) return 1 + a.density * 2;
                if (v > 0) return 1 + a.pressure * 2 + a.rupture;
                return 1 + a.periodicity;
              });

            case 'rate':
              return attractorBiasRange(block, 'rate', 0.5, 1.5);

            case 'start':
              return attractorBiasRange(block, 'start', 0, 0.85);

            case 'speed':
              return attractorChoice(block, [0.25, 1 / 3, 0.5, 0.75, 1, 4 / 3, 1.5, 2, 3, 4], (v, i, a) => {
                if (v < 1) return 1 + a.periodicity * 2 + a.density;
                if (v > 1) return 1 + a.volatility * i + a.rupture * i;
                return 1 + a.confidence;
              });

          case 'delay':
            return randomBetween(0, 1);

          case 'feedback':
            return randomBetween(0, 0.75);

          case 'blur':
          case 'corrode':
            return randomBetween(0, 1);
            
        case 'compress':
          return attractorBiasRange(block, 'compress', 0.12, 0.65);

        case 'space':
          return attractorBiasRange(block, 'space', 0.08, 0.72);

        case 'resonance':
          return attractorBiasRange(block, 'resonance', 0.05, 0.72);

        case 'comb':
          return attractorBiasRange(block, 'comb', 0.04, 0.62);

        case 'grain':
          return attractorBiasRange(block, 'grain', 0.02, 0.58);

        case 'chorus':
          return attractorBiasRange(block, 'chorus', 0.03, 0.48);

        case 'excite':
          return attractorBiasRange(block, 'excite', 0.02, 0.52);

        case 'blur':
          return attractorBiasRange(block, 'blur', 0.02, 0.62);

        case 'scar':
          return attractorBiasRange(block, 'scar', 0.01, 0.50);

        case 'body':
          return attractorBiasRange(block, 'body', 0.08, 0.70);
          default:
            return fallback;
        }
      }

      function ensureParamState(block) {
        if (!block._paramState) block._paramState = {};
        return block._paramState;
      }

      function stateForParam(block, name) {
        const state = ensureParamState(block);
        if (!state[name]) {
          state[name] = {
            last: undefined,
            frozen: {},
            drift: {},
          };
        }
        return state[name];
      }

      function paramStateKey(name, index, scalar) {
        return scalar ? `${name}:scalar` : `${name}:${index}`;
      }

      function resolveParamAtom(block, name, atom, fallback, valueIndex, scalar, time) {
        const paramState = stateForParam(block, name);
        const defaultValue = defaultForParam(name, fallback);
        const key = paramStateKey(name, valueIndex, scalar);

        if (isLiveMod(atom)) {
          const value = resolveLiveModValue(block, atom, defaultValue, time, name);
          paramState.last = value;
          return value;
        }

        if (!isParamAtom(atom)) {
          paramState.last = atom;
          return atom;
        }

        switch (atom.op) {
          case 'random': {
            const value = randomParamValue(name, defaultValue, block);
            paramState.last = value;
            return value;
          }
            case 'gesture-random': {
              const gesture = randomParamGesture(name, defaultValue, block);

              // `~` after `*~` should hold the gesture's endpoint, not replay the gesture.
              paramState.last = gestureEndValue(gesture, defaultValue);

              return gesture;
            }

          case 'hold': {
            return paramState.last !== undefined ? paramState.last : defaultValue;
          }

          case 'reset': {
            paramState.last = defaultValue;
            return defaultValue;
          }

          case 'frozen-random': {
            if (paramState.frozen[key] === undefined) {
              paramState.frozen[key] = randomParamValue(name, defaultValue, block);
            }
            paramState.last = paramState.frozen[key];
            return paramState.frozen[key];
          }

          case 'drift': {
            const seconds = Number(atom.seconds);
            if (!Number.isFinite(seconds) || seconds <= 0) {
              const value = randomParamValue(name, defaultValue, block);
              paramState.last = value;
              return value;
            }

            const now = Number.isFinite(time) ? time : audioCtx.currentTime;
            let driftState = paramState.drift[key];

            if (!driftState) {
              const initial = paramState.last !== undefined
                ? paramState.last
                : randomParamValue(name, defaultValue, block);

              driftState = {
                startTime: now,
                from: initial,
                to: randomParamValue(name, defaultValue, block),
              };

              paramState.drift[key] = driftState;
            }

            while (now - driftState.startTime >= seconds) {
              driftState.from = driftState.to;
              driftState.to = randomParamValue(name, defaultValue, block);
              driftState.startTime += seconds;
            }

            const t = clamp((now - driftState.startTime) / seconds, 0, 1);
            const value = quantizeRandomParam(name, lerp(driftState.from, driftState.to, t));
            paramState.last = value;
            return value;
          }

          default: {
            paramState.last = defaultValue;
            return defaultValue;
          }
        }
      }

      function paramForIndex(block, name, index, fallback, time) {
        const p = block.params && block.params[name];
        if (!p) return fallback;

        if (p.kind === 'scalar') {
          return resolveParamAtom(block, name, p.value, fallback, index, true, time);
        }

        if (p.kind === 'vector') {
          const len = p.values.length;
          if (!len) return fallback;
          const valueIndex = ((index % len) + len) % len;
          return resolveParamAtom(block, name, p.values[valueIndex], fallback, valueIndex, false, time);
        }

        return fallback;
      }

      function effectForIndex(block, name, index, fallback, time) {
        const p = block.effects && block.effects[name];
        if (!p) return fallback;

        if (p.kind === 'scalar') {
          return resolveParamAtom(block, name, p.value, fallback, index, true, time);
        }

        if (p.kind === 'vector') {
          const len = p.values.length;
          if (!len) return fallback;
          const valueIndex = ((index % len) + len) % len;
          return resolveParamAtom(block, name, p.values[valueIndex], fallback, valueIndex, false, time);
        }

        return fallback;
      }

      function resolveEffectsForEvent(block, eventIndex, time) {
        const names = ['compress', 'space', 'resonance', 'comb', 'grain', 'chorus', 'excite', 'blur', 'scar', 'body'];
        const out = {};
        const modes = {};

        for (const name of names) {
          const raw = effectForIndex(block, name, eventIndex, 0, time);
          out[name] = clamp(numericSurfaceValue(raw, name, 0), 0, 1);

          const mode = effectModeName(raw);
          if (mode) modes[name] = mode;

          const rawKey = '_raw' + name.charAt(0).toUpperCase() + name.slice(1);
          out[rawKey] = raw;
        }

        out._modes = modes;
        return out;
      }
      function resolveParamsForEvent(block, eventIndex, time) {
        return {
          force: paramForIndex(block, 'force', eventIndex, 0.7, time),
          decay: paramForIndex(block, 'decay', eventIndex, 4.2, time),
          crush: paramForIndex(block, 'crush', eventIndex, 0, time),
          resolution: paramForIndex(block, 'resolution', eventIndex, 0, time),
          tone: paramForIndex(block, 'tone', eventIndex, 0.6, time),
          harm: paramForIndex(block, 'harm', eventIndex, 2, time),
          octave: paramForIndex(block, 'octave', eventIndex, 0, time),
          pan: paramForIndex(block, 'pan', eventIndex, 0, time),
          gain: paramForIndex(block, 'gain', eventIndex, 1, time),
          glide: paramForIndex(block, 'glide', eventIndex, 0, time),
          rate: paramForIndex(block, 'rate', eventIndex, 1, time),
          start: paramForIndex(block, 'start', eventIndex, 0, time),
          monitor: paramForIndex(block, 'monitor', eventIndex, 1, time),
          listen: paramForIndex(block, 'listen', eventIndex, 1, time),
          opacity: paramForIndex(block, 'opacity', eventIndex, 1, time),
          threshold: paramForIndex(block, 'threshold', eventIndex, 0, time),
          edges: paramForIndex(block, 'edges', eventIndex, 0, time),
          posterize: paramForIndex(block, 'posterize', eventIndex, 0, time),
          invert: paramForIndex(block, 'invert', eventIndex, 0, time),
          contrast: paramForIndex(block, 'contrast', eventIndex, 0, time),
          saturate: paramForIndex(block, 'saturate', eventIndex, 0, time),
          displace: paramForIndex(block, 'displace', eventIndex, 0, time),
          feedback: paramForIndex(block, 'feedback', eventIndex, 0, time),
          delay: paramForIndex(block, 'delay', eventIndex, 0, time),
          slitscan: paramForIndex(block, 'slitscan', eventIndex, 0, time),
          trail: paramForIndex(block, 'trail', eventIndex, 0, time),
          mask: paramForIndex(block, 'mask', eventIndex, 0, time),
          key: paramForIndex(block, 'key', eventIndex, 0, time),
          color: paramForIndex(block, 'color', eventIndex, 0, time),
            blend: paramForIndex(block, 'blend', eventIndex, 'source-over', time),

            pedal: paramForIndex(block, 'pedal', eventIndex, 0, time),
            una: paramForIndex(block, 'una', eventIndex, 0, time),
            lid: paramForIndex(block, 'lid', eventIndex, 0.72, time),
            sympathetic: paramForIndex(block, 'sympathetic', eventIndex, 0.18, time),
            release: paramForIndex(block, 'release', eventIndex, 0.35, time),
            human: paramForIndex(block, 'human', eventIndex, 0, time),
            stretch: paramForIndex(block, 'stretch', eventIndex, 0, time),
            layer: paramForIndex(block, 'layer', eventIndex, 'hard', time),
            poly: paramForIndex(block, 'poly', eventIndex, 64, time),

            articulation: paramForIndex(block, 'articulation', eventIndex, 'arco', time),
            sul: paramForIndex(block, 'sul', eventIndex, null, time),
            vibrato: paramForIndex(block, 'vibrato', eventIndex, 0, time),
            vibratorate: paramForIndex(block, 'vibratorate', eventIndex, 5.5, time),
            vibratoonset: paramForIndex(block, 'vibratoonset', eventIndex, 0.18, time),
            tremolo: paramForIndex(block, 'tremolo', eventIndex, 0, time),
            tremolorate: paramForIndex(block, 'tremolorate', eventIndex, 9, time),
            bow: paramForIndex(block, 'bow', eventIndex, 0.45, time),
            wood: paramForIndex(block, 'wood', eventIndex, 0.35, time),

            mallet: paramForIndex(block, 'mallet', eventIndex, 'yarn', time),
            deadstroke: paramForIndex(block, 'deadstroke', eventIndex, 0, time),
            roll: paramForIndex(block, 'roll', eventIndex, 0, time),
            spread: paramForIndex(block, 'spread', eventIndex, 0.012, time),
            motor: paramForIndex(block, 'motor', eventIndex, 0, time),
            depth: paramForIndex(block, 'depth', eventIndex, 0.35, time),
            damp: paramForIndex(block, 'damp', eventIndex, 0, time),
            bowpressure: paramForIndex(block, 'bowpressure', eventIndex, 0.45, time),
            vowel: paramForIndex(block, 'vowel', eventIndex, 'ah', time),
            syllable: paramForIndex(block, 'syllable', eventIndex, 'ah', time),
            carrier: paramForIndex(block, 'carrier', eventIndex, 'sample', time),
            robot: paramForIndex(block, 'robot', eventIndex, 0.35, time),
            breath: paramForIndex(block, 'breath', eventIndex, 0, time),
            mouth: paramForIndex(block, 'mouth', eventIndex, 0.5, time),
            formant: paramForIndex(block, 'formant', eventIndex, 0, time),
            roughness: paramForIndex(block, 'roughness', eventIndex, 0, time),
            vocoder: paramForIndex(block, 'vocoder', eventIndex, 0, time),
            ensemble: paramForIndex(block, 'ensemble', eventIndex, 0, time),
        };
      }

      function ensureWellFormedSpeedState(block) {
        const s = block._speedState;
        if (!s || typeof s !== 'object' || !s.frozen || !s.drift) {
          block._speedState = {
            last: s && 'last' in s ? s.last : undefined,
            frozen: s && s.frozen ? s.frozen : {},
            drift: s && s.drift ? s.drift : {},
          };
        }
      }

      function speedStateForBlock(block) {
        ensureWellFormedSpeedState(block);
        return block._speedState;
      }

      function resolveSpeedAtom(block, atom, valueIndex, scalar, time) {
        ensureWellFormedSpeedState(block);

        const oldParamState = block._paramState;
        block._paramState = { speed: block._speedState };

        const value = resolveParamAtom(block, 'speed', atom, 1, valueIndex, scalar, time);

        block._speedState = block._paramState.speed;
        block._paramState = oldParamState;

        return value;
      }

      function clampSpeed(v) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return 1;
        return clamp(n, 0.0625, 16);
      }

      function speedForSlot(block, slotIdx, time) {
        const stream = block.speed || { kind: 'scalar', value: 1 };
        let value = 1;

        if (stream.kind === 'scalar') {
          value = resolveSpeedAtom(block, stream.value, slotIdx, true, time);
        } else if (stream.kind === 'vector') {
          const len = stream.values.length;
          if (!len) return 1;
          const valueIndex = ((slotIdx % len) + len) % len;
          value = resolveSpeedAtom(block, stream.values[valueIndex], valueIndex, false, time);
        }

        const mod = attractorModForBlock(block, time);
        if (mod && mod.signals) {
          const lfo = slowCycle(block, time, 0.13 + mod.signals.periodicity * 0.12, 2.4);
            const speedMul = 1
              + mod.depth * mod.signals.periodicity * lfo * 0.035
              + mod.depth * mod.signals.rupture * (noiseCycle(block, time, 3.5, 4.9) - 0.5) * 0.045;
            value *= clamp(speedMul, 0.9, 1.12);
        }

        const timeControl = block && block.controls ? block.controls.time : null;
        if (timeControl) {
          const signal = liveControlValue(block, 'time', time, 0.5);
          const amount = clamp(Number(timeControl.amount) || 0, 0, 1);
          value *= clamp(1 + (signal - 0.5) * amount * 1.25, 0.55, 1.85);
        }

        const beatControl = block && block.controls ? block.controls.beat : null;
        if (beatControl) {
          const signal = liveControlValue(block, 'beat', time, 0.5);
          const amount = clamp(Number(beatControl.amount) || 0, 0, 1);
          const beatPulse = 0.65 + 0.35 * noiseCycle(block, time, 1.6 + signal * 6.5, 8.1);
          value *= clamp(1 + (signal - 0.5) * amount * 1.6 * beatPulse, 0.5, 2.25);
        }

        return clampSpeed(value);
      }

      function ensureSpeedCursor(block) {
        if (!Number.isFinite(block._speedSlotIdx)) block._speedSlotIdx = 0;
        if (!Number.isFinite(block._speedNextTime)) {
          alignBlockCursorToGrid(block, audioCtx.currentTime, program ? barSeconds(program) : 0);
        }
      }

      function countLeaves(node) {
        if (!node) return 0;
        if (node.kind === 'leaf') return 1;
        if (node.kind !== 'group' || !Array.isArray(node.children)) return 0;

        let total = 0;
        for (const child of node.children) {
          total += countLeaves(child);
        }
        return total;
      }

      function ensureLeafOffsets(block) {
        if (block._leafOffsets && block._leafCounts && block._leafTotal != null) return;

        const offsets = [];
        const counts = [];
        let cursor = 0;

        for (const slot of block.slots) {
          offsets.push(cursor);
          const n = Math.max(1, countLeaves(slot));
          counts.push(n);
          cursor += n;
        }

        block._leafOffsets = offsets;
        block._leafCounts = counts;
        block._leafTotal = Math.max(1, cursor);
      }

    // Resolve the active phrase position for a block at a given top-level
    // slot index. Returns:
    //   - { slotIndex, silent: false, inBlockIdx } if the phrase is firing
    //   - { slotIndex, silent: true } if 'every' has us in the silent portion
    function everyPeriodSlots(block) {
      if (!block || !block.every) return Math.max(1, block && block.slots ? block.slots.length : 1);
      const grid = ensureBarGrid(block);
      const avgSlotsPerBar = grid.totalSlots / grid.cycleBars;
      if (block.every.unit === 'bars') {
        return Math.max(1, Math.round(block.every.count * avgSlotsPerBar));
      }
      const slotsPerBeat = avgSlotsPerBar / program.meter.num;
      return Math.max(1, Math.round(block.every.count * slotsPerBeat));
    }

    // Resolve the active phrase position for a block. `patternSlotIdx` is the
    // block-owned pattern cursor. `absoluteSlotIdx` is the unwarped musical
    // grid position; we still pass it so the visualizer can read it.
    //
    // The `every` cycle is gated on the *pattern* cursor (not absolute musical
    // time) so that a phrase always plays through to its end before the next
    // repetition starts. Speed may stretch or compress the phrase's wall-clock
    // duration; previously, when speed averaged < 1 the phrase ran past the
    // musical period and the `every` gate would clip the tail. Pattern-cursor
    // gating keeps phrase boundaries authoritative — silent gaps when the
    // period is longer than the phrase still work via the existing
    // `phraseSlot >= slots.length` check below.
    //
    // When `mutateEveryState` is false, the function is a pure read — used by
    // the visualizer's `now()` call, which runs at 60fps and must NOT mutate
    // the every-cycle anchor. Only the scheduler's dispatch loop is allowed to
    // commit a new patternBase, because the patternBase is what anchors the
    // phrase to its repeat boundary.
    function resolveBlockPosition(block, patternSlotIdx, time, absoluteSlotIdx, mutateEveryState) {
      if (block.every) {
        const periodSlots = everyPeriodSlots(block);
        const ptrnIdx = Math.max(0, Math.floor(Number(patternSlotIdx) || 0));
        const absIdx = Number.isFinite(Number(absoluteSlotIdx)) ? Math.max(0, Math.floor(Number(absoluteSlotIdx))) : ptrnIdx;
        const cycleId = Math.floor(ptrnIdx / periodSlots);

        if (mutateEveryState !== false && block._everyCycleId !== cycleId) {
          block._everyCycleId = cycleId;
          block._everyPatternBase = cycleId * periodSlots;
        }

        // Use the stored patternBase if it's already aligned with this cycleId;
        // otherwise derive it directly (cycleId * periodSlots), which is exact
        // since the cycleId itself is computed from the pattern cursor.
        const storedBase = Number.isFinite(Number(block._everyPatternBase)) ? Number(block._everyPatternBase) : 0;
        const patternBase = (block._everyCycleId === cycleId)
          ? storedBase
          : cycleId * periodSlots;
        const phraseSlot = Math.max(0, ptrnIdx - patternBase);

        if (phraseSlot >= block.slots.length) {
          return {
            slotIndex: patternSlotIdx,
            absoluteSlotIndex: absIdx,
            silent: true,
            everyCycleId: cycleId,
            phraseSlot,
          };
        }

        return {
          slotIndex: patternSlotIdx,
          absoluteSlotIndex: absIdx,
          silent: false,
          inBlockIdx: liveLeafIndex(block, phraseSlot, time),
          everyCycleId: cycleId,
          phraseSlot,
        };
      }

      const inBlockIdx = ((patternSlotIdx % block.slots.length) + block.slots.length) % block.slots.length;
      return {
        slotIndex: patternSlotIdx,
        absoluteSlotIndex: Number.isFinite(Number(absoluteSlotIdx)) ? Math.max(0, Math.floor(Number(absoluteSlotIdx))) : patternSlotIdx,
        silent: false,
        inBlockIdx: liveLeafIndex(block, inBlockIdx, time),
        phraseSlot: inBlockIdx,
      };
    }

      function liveLeafIndex(block, baseIndex, time) {
        if (!block || !block.controls || !block.controls.leaf || !Array.isArray(block.slots) || block.slots.length <= 1) {
          return baseIndex;
        }

        const control = block.controls.leaf;
        const signals = liveSignalsForControl(control);
        const value = liveFeatureValue(signals, control.feature, 0);
        const amount = clamp(Number(control.amount) || 0, 0, 1);
        if (amount <= 0 || value <= 0.02) return baseIndex;

        const span = Math.max(1, block.slots.length - 1);
        const seed = Number.isFinite(block._attractorSeed) ? block._attractorSeed : 0.37;
        const wobble = noiseCycle(block, Number.isFinite(time) ? time : audioCtx.currentTime, 3.1 + value * 7.5, seed * 5.3);
        const offset = Math.round((value * 0.75 + wobble * 0.25) * amount * span);
        return ((baseIndex + offset) % block.slots.length + block.slots.length) % block.slots.length;
      }
      
      function tokenIsGated(tok) {
        if (!tok) return false;
        if (tok.gated === true) return true;
        if (tok.kind === 'sample-selector' && tok.value && tok.value.gated === true) return true;
        return false;
      }
      
      function voiceEngine() {
        return root.VoiceVoice || root.RobotVoice || root.VocalVoice || null;
      }

      function isPitchedSynthVoice(voice) {
        return voice === 'string'
          || voice === 'sine'
          || voice === 'osc'
          || voice === 'pluck'
          || voice === 'drone'
          || voice === 'piano'
          || voice === 'violin'
          || voice === 'cello'
          || voice === 'marimba'
          || voice === 'vibraphone'
          || voice === 'voice';
      }

      function shouldFireLiveTrigger(block, time) {
        const trig = block && block.controls ? block.controls.trigger : null;
        if (!trig) return true;

        const signals = liveSignalsForControl(trig);
        const value = liveFeatureValue(signals, trig.feature, 0);
        const threshold = clamp(Number(trig.threshold) || 0.55, 0, 1);

        if (!block._triggerState) block._triggerState = {};
        const key = `${trig.source}.${trig.feature}`;
        const prev = block._triggerState[key] || { armed: true, lastFire: -Infinity };
        const minGap = 0.055;
        const armed = prev.armed || value < threshold * 0.62;
        const now = Number.isFinite(time) ? time : audioCtx.currentTime;
        const fire = armed && value >= threshold && now - prev.lastFire >= minGap;

        block._triggerState[key] = {
          armed: fire ? false : armed,
          lastFire: fire ? now : prev.lastFire,
        };

        emitEditorPulse({
          kind: fire ? 'trigger' : 'input',
          line: rowLine(block, 'trigger'),
          row: 'trigger',
          token: key,
          source: trig.source,
          feature: trig.feature,
          intensity: value,
          meter: true,
          voice: block && block.voice,
        });

        return fire;
      }

      function resolveActiveSpanDescriptorForToken(block, spanState) {
        if (!block || !spanState || !spanState.activeRef) return null;
        const ref = spanState.activeRef;
        if (!ref.shared) return spanState.local || null;
        const dir = ref.direction === 'up' ? 'up' : 'down';
        return spanState.local || sharedPitchSpanState[dir] || null;
      }

      function sharedSpanStartWins(existing, candidate) {
        if (!candidate) return false;
        if (!existing) return true;
        const candMidi = Number(candidate.startMidi);
        const existMidi = Number(existing.startMidi);
        if (!Number.isFinite(candMidi)) return false;
        if (!Number.isFinite(existMidi)) return true;
        const dir = candidate.direction === 'up' ? 'up' : 'down';
        if (dir === 'down') return candMidi >= existMidi;
        return candMidi <= existMidi;
      }

      function resolvePitchSpanHit(node, tok, block, spanState, params, time) {
        if (!node || !tok || !block || !spanState) return null;

        if (tok.kind === 'pitch-span-start') {
          const start = spanDescriptorFromStart(node, tok, block, spanState, params, time);
          if (!start || !start.descriptor || !start.note) return null;

          const desc = start.descriptor;
          if (desc.shared) {
            const dir = desc.direction;
            const currentShared = sharedPitchSpanState[dir] || null;
            const activePersistent = currentShared && currentShared.persistent === true;
            const winsLeader = !activePersistent && sharedSpanStartWins(currentShared, desc);
            spanState.activeRef = { shared: true, direction: dir };

            if (winsLeader) {
              // Shared starts publish a leader template; each block advances its
              // own clone so simultaneous follower starts don't consume the ramp.
              const shared = clonePitchSpanDescriptor(desc, {
                eventStepSec: sharedSpanEventStepSeconds(block, dir),
                eventOrdinal: 0,
                sequenceOffsetSec: 0,
              });
              sharedPitchSpanState[dir] = shared;
              desc.eventStepSec = shared ? shared.eventStepSec : 0;
              desc.sequenceOffsetSec = nextSharedPitchSpanOffset(shared);
              spanState.local = desc;
              const note = noteForPitchSpanDescriptor(desc, block, time) || start.note;
              return { note, desc, spanEvent: true };
            }

            if (!currentShared) return null;
            const joined = clonePitchSpanDescriptor(currentShared, {
              persistent: desc.persistent,
              totalAdvances: desc.totalAdvances,
              ownerBlockId: desc.ownerBlockId,
              glideSec: desc.glideSec,
            });
            if (!joined) return null;
            joined.sequenceOffsetSec = nextSharedPitchSpanOffset(currentShared);
            spanState.local = joined;
            const note = noteForPitchSpanDescriptor(joined, block, time) || noteObjectFromMidi(joined.startMidi, block);
            if (!note) return null;
            return { note, desc: joined, spanEvent: true, closeSpan: false };
	          } else {
	            const dir = desc.direction;
	            const channels = spanState.localChannels && typeof spanState.localChannels.get === 'function'
	              ? spanState.localChannels
	              : null;
	            const currentLocal = channels ? (channels.get(node) || null) : null;
	            if (currentLocal && currentLocal.persistent === true) {
	              spanState.activeRef = { shared: false, direction: currentLocal.direction };
	              spanState.local = currentLocal;
	              const note = noteForPitchSpanDescriptor(currentLocal, block, time)
	                || noteObjectFromMidi(currentLocal.currentMidi, block)
	                || noteObjectFromMidi(currentLocal.startMidi, block);
	              if (!note) return null;
	              return { note, desc: currentLocal, spanEvent: true };
	            }

	            if (channels && desc.persistent === true) {
	              channels.set(node, desc);
	            }

	            spanState.activeRef = { shared: false, direction: dir };
	            spanState.local = desc;
	            const note = noteForPitchSpanDescriptor(desc, block, time) || start.note;
	            return { note, desc, spanEvent: true };
	          }
	        }

        const desc = resolveActiveSpanDescriptorForToken(block, spanState);
        if (!desc) return null;

        if (tok.kind === 'note-random' && tok.pitchSpanStep === true) {
          if (desc.shared === true && desc.timeBased === true) {
            const dir = desc.direction === 'up' ? 'up' : 'down';
            const shared = sharedPitchSpanState[dir] || null;
            if (shared) desc.sequenceOffsetSec = nextSharedPitchSpanOffset(shared);
          }
          const note = advancePitchSpanDescriptor(desc, block, time);
          if (!note) return null;
          return { note, desc, spanEvent: true, closeSpan: false };
        }

        if (tok.kind === 'pitch-span-end') {
          if (desc.shared === true && desc.timeBased === true) {
            const dir = desc.direction === 'up' ? 'up' : 'down';
            const shared = sharedPitchSpanState[dir] || null;
            if (shared) desc.sequenceOffsetSec = nextSharedPitchSpanOffset(shared);
          }
          const note = advancePitchSpanDescriptor(desc, block, time);
          if (!note) return null;
          return { note, desc, spanEvent: true, closeSpan: true };
        }

        return null;
      }

      function advancePitchSpanCarry(block, spanState, time) {
        if (!block || !spanState) return;
        const desc = resolveActiveSpanDescriptorForToken(block, spanState);
        if (!desc) return;
        advancePitchSpanDescriptor(desc, block, time);
      }

      function finalizeSpanStateAfterEvent(spanState, event, note) {
        if (!spanState || !event || !event.desc) return;
        if (note && Number.isFinite(note.midi)) {
          spanState.lastMidi = Number(note.midi);
          event.desc.currentMidi = Number(note.midi);
        }
	        if (event.closeSpan) {
	          if (event.desc && event.desc.persistent === true) {
	            spanState.local = null;
	            spanState.activeRef = null;
	            return;
	          }
	          spanState.local = null;
	          spanState.activeRef = null;
	        }
      }
      
      function tiedGateDurationFromToken(block, tok, leafDuration, fallbackGateDuration) {
          if (!block || (block.voice !== 'violin' && block.voice !== 'cello' && block.voice !== 'marimba' && block.voice !== 'vibraphone' && block.voice !== 'voice')) return fallbackGateDuration;
        if (!tok || (tok.kind !== 'note' && tok.kind !== 'chord')) return fallbackGateDuration;

        const base = Number.isFinite(Number(leafDuration)) && Number(leafDuration) > 0
          ? Number(leafDuration)
          : Number(fallbackGateDuration);

        if (!Number.isFinite(base) || base <= 0) return fallbackGateDuration;

        const span = Number.isFinite(Number(tok.tieSpanLeafCount))
          ? Math.max(1, Math.round(Number(tok.tieSpanLeafCount)))
          : 1;

        return base * span;
      }

      function dispatchSlotTree(node, time, duration, ctx) {
        if (!node) return;

        if (node.kind === 'leaf') {
          const tok = node.token;
          const leafIndex = ctx.leafCursor.index;
          ctx.leafCursor.index += 1;
          const sourceLeafCursor = ctx.sourceLeafCursor || ctx.leafCursor;
          const sourceLeafIndex = sourceLeafCursor.index;
          if (sourceLeafCursor !== ctx.leafCursor) sourceLeafCursor.index += 1;
          const eventIndex = ((ctx.leafBase + leafIndex) % ctx.leafTotal + ctx.leafTotal) % ctx.leafTotal;
          const leafPath = Array.isArray(ctx.leafPath) ? ctx.leafPath.slice() : [];
          const tokenLabel = leafTokenLabel(tok);

          if (tok.kind === 'sustain' && ctx.voice === 'noise') {
            const baseParams = resolveParamsForEvent(ctx.block, eventIndex, time);
            const effects = resolveEffectsForEvent(ctx.block, eventIndex, time);
            const attractorMod = attractorModForBlock(ctx.block, time);
            const params = applyAttractorToParams(ctx.block, baseParams, ctx.voice, time, duration, attractorMod);
            const eventBus = outputBusForBlock(ctx.block, time, attractorMod, effects);
            const panGestureDuration = gestureDurationForEvent('pan', params.pan, ctx.voice, params, null, duration);
            const noiseLeafIntensity = Math.max(0.10, Math.min(0.7, numericParamValue(params.gain, 1) * 0.35));
            emitLeafPulse(ctx.block, time, {
              leafIndex: eventIndex,
              leafCount: ctx.leafTotal,
              leafPath,
              slotIndex: ctx.slotIndex,
              sourceLeafIndex,
              state: 'held',
              token: tokenLabel || '~',
              duration,
              intensity: noiseLeafIntensity,
            });
            if (typeof root.NoiseVoice !== 'undefined' && root.NoiseVoice.playNoise) {
              root.NoiseVoice.playNoise({
                audioCtx,
                masterBus: eventBus,
                time,
                force: params.force,
                decay: params.decay,
                crush: params.crush,
                resolution: params.resolution,
                tone: params.tone,
                pan: params.pan,
                gain: params.gain,
                eventDuration: duration,
                panGestureDuration,
                held: true,
              });
            }
            emitEditorPulse({
              kind: 'voice',
              line: blockLine(ctx.block),
              voice: 'noise',
              intensity: noiseLeafIntensity,
            });
            return;
          }

            if (tok.kind === 'rest' || tok.kind === 'sustain') {
              if (tok.pitchSpanCarry === true && isPitchedSynthVoice(ctx.voice)) {
                const spanState = ensureBlockPitchSpanRuntime(ctx.block);
                advancePitchSpanCarry(ctx.block, spanState, time);
              }

              emitLeafPulse(ctx.block, time, {
                leafIndex: eventIndex,
                leafCount: ctx.leafTotal,
                leafPath,
                slotIndex: ctx.slotIndex,
                sourceLeafIndex,
                state: tok.kind === 'sustain' ? 'held' : 'rest',
                token: tok.kind === 'sustain' ? '~' : '.',
                duration,
                intensity: tok.kind === 'sustain' ? 0.12 : 0.08,
              });

                if (ctx.voice === 'voice' && voiceEngine()) {
                  const engine = voiceEngine();
                  const blockId = ctx.block && ctx.block._blockId;

                  if (tok.kind === 'sustain') {
                    // visual hold only; the original voice note/chord owns
                    // the tied machine-mouth duration through tieSpanLeafCount.
                  }

                  if (tok.kind === 'rest' && engine.releaseLastForBlock) {
                    engine.releaseLastForBlock({
                      audioCtx,
                      blockId,
                      time,
                    });
                  }

                  emitEditorPulse({
                    kind: 'voice',
                    line: blockLine(ctx.block),
                    voice: ctx.voice,
                    intensity: tok.kind === 'sustain' ? 0.12 : 0.08,
                  });

                  return;
                }


              if (ctx.voice === 'cello' && typeof root.CelloVoice !== 'undefined') {
                const blockId = ctx.block && ctx.block._blockId;

                if (tok.kind === 'sustain') {
                  // visual hold only; the original cello note/chord owns the tied duration
                }

                if (tok.kind === 'rest' && root.CelloVoice.releaseLastForBlock) {
                  root.CelloVoice.releaseLastForBlock({ audioCtx, blockId, time });
                }

                emitEditorPulse({
                  kind: 'voice',
                  line: blockLine(ctx.block),
                  voice: ctx.voice,
                  intensity: tok.kind === 'sustain' ? 0.12 : 0.08,
                });

                return;
              }

                if (ctx.voice === 'marimba' && typeof root.MarimbaVoice !== 'undefined') {
                  const blockId = ctx.block && ctx.block._blockId;

                  if (tok.kind === 'sustain') {
                    // No audio call here.
                    //
                    // Marimba ties are already folded into the original strike via
                    // tok.tieSpanLeafCount. Calling extend on every "~" makes tied
                    // marimba behave like little hidden events instead of a single
                    // ringing bar / roll gesture.
                  }

                  if (tok.kind === 'rest' && root.MarimbaVoice.releaseLastForBlock) {
                    root.MarimbaVoice.releaseLastForBlock({
                      audioCtx,
                      blockId,
                      time,
                    });
                  }

                  emitEditorPulse({
                    kind: 'voice',
                    line: blockLine(ctx.block),
                    voice: ctx.voice,
                    intensity: tok.kind === 'sustain' ? 0.12 : 0.08,
                  });

                  return;
                }

              if (ctx.voice === 'vibraphone' && typeof root.VibraphoneVoice !== 'undefined') {
                const blockId = ctx.block && ctx.block._blockId;

                if (tok.kind === 'sustain') {
                  // visual hold only; the original vibraphone note/chord owns
                  // the tied duration through tieSpanLeafCount.
                }

                if (tok.kind === 'rest' && root.VibraphoneVoice.releaseLastForBlock) {
                  root.VibraphoneVoice.releaseLastForBlock({
                    audioCtx,
                    blockId,
                    time,
                  });
                }

                emitEditorPulse({
                  kind: 'voice',
                  line: blockLine(ctx.block),
                  voice: ctx.voice,
                  intensity: tok.kind === 'sustain' ? 0.12 : 0.08,
                });

                return;
              }

              if (ctx.voice === 'voice' && typeof root.VoiceVoice !== 'undefined') {
                const blockId = ctx.block && ctx.block._blockId;

                if (tok.kind === 'sustain') {
                  // visual hold only; the original machine-voice note/chord owns
                  // the tied breath duration through tieSpanLeafCount.
                }

                if (tok.kind === 'rest' && root.VoiceVoice.releaseLastForBlock) {
                  root.VoiceVoice.releaseLastForBlock({
                    audioCtx,
                    blockId,
                    time,
                  });
                }

                emitEditorPulse({
                  kind: 'voice',
                  line: blockLine(ctx.block),
                  voice: ctx.voice,
                  intensity: tok.kind === 'sustain' ? 0.12 : 0.08,
                });

                return;
              }

              if ((ctx.voice === 'video' || ctx.voice === 'video-gen') && typeof root.VideoVoice !== 'undefined' && root.VideoVoice.commitLeaf) {
                root.VideoVoice.commitLeaf({
                  blockId: ctx.block && ctx.block._blockId,
                  voice: ctx.voice,
                  state: tok.kind === 'sustain' ? 'held' : 'rest',
                  token: tokenLabel || (tok.kind === 'sustain' ? '~' : '.'),
                  time,
                  sourceLeafIndex,
                  leafIndex: eventIndex,
                });
              }

              return;
            }

            const baseParams = resolveParamsForEvent(ctx.block, eventIndex, time);
            const effects = resolveEffectsForEvent(ctx.block, eventIndex, time);
            const attractorMod = attractorModForBlock(ctx.block, time);
            const params = applyAttractorToParams(ctx.block, baseParams, ctx.voice, time, duration, attractorMod);
            ctx.block._lastSurfaceState = {
              eventIndex,
              speed: Number.isFinite(ctx.speed) ? ctx.speed : 1,
              params: { ...params },
              baseParams: { ...baseParams },
              effects: { ...effects },
              time,
              duration,
            };
            const emitPlayedLeafPulse = (intensity, stateOverride) => emitLeafPulse(ctx.block, time, {
              leafIndex: eventIndex,
              leafCount: ctx.leafTotal,
              leafPath,
              slotIndex: ctx.slotIndex,
              sourceLeafIndex,
              state: stateOverride || (attractorMod ? 'mutated' : 'hit'),
              token: tokenLabel,
              duration,
              intensity: intensity == null ? Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1))) : intensity,
            });
            const eventBus = outputBusForBlock(ctx.block, time, attractorMod, effects);

            const gated = tokenIsGated(tok);
            const baseGateDuration = gated
              ? duration * (Number.isFinite(params.gateMul) ? params.gateMul : 1)
              : null;

            const gateDuration = (ctx.voice === 'violin' || ctx.voice === 'cello' || ctx.voice === 'marimba' || ctx.voice === 'vibraphone' || ctx.voice === 'voice')
              ? tiedGateDurationFromToken(ctx.block, tok, duration, baseGateDuration)
              : baseGateDuration;
            const panGestureDuration = gestureDurationForEvent('pan', params.pan, ctx.voice, params, gateDuration, duration);
            const rateGestureDuration = gestureDurationForEvent('rate', params.rate, ctx.voice, params, gateDuration, duration);

            if (ctx.voice === 'video' || ctx.voice === 'video-gen') {
              if (!shouldFireLiveTrigger(ctx.block, time)) return;
              if (tok.kind !== 'video-hit') return;
              const visualIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.opacity, numericParamValue(params.gain, 1))));
              emitPlayedLeafPulse(visualIntensity);
              emitEditorPulse({
                kind: 'voice',
                line: blockLine(ctx.block),
                voice: ctx.voice,
                intensity: visualIntensity,
              });
              if (typeof root.VideoVoice !== 'undefined' && root.VideoVoice.commitLeaf) {
                root.VideoVoice.commitLeaf({
                  blockId: ctx.block && ctx.block._blockId,
                  voice: ctx.voice,
                  state: 'hit',
                  token: tokenLabel || '*',
                  time,
                  intensity: visualIntensity,
                  sourceLeafIndex,
                  leafIndex: eventIndex,
                });
              }
              return;
            }

            if (ctx.voice === 'input') {
              emitPlayedLeafPulse(Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1))));
              syncInputBlock(ctx.block, eventBus, params, time);
              return;
            }

if (isPitchedSynthVoice(ctx.voice)) {
              const isStringVoice = ctx.voice === 'string';
              const isSineVoice = ctx.voice === 'sine' || ctx.voice === 'osc';
              const isPluckVoice = ctx.voice === 'pluck';
              const isDroneVoice = ctx.voice === 'drone';
                const isPianoVoice = ctx.voice === 'piano';
                const isViolinVoice = ctx.voice === 'violin';
                const isCelloVoice = ctx.voice === 'cello';
                const isMarimbaVoice = ctx.voice === 'marimba';
                const isVibraphoneVoice = ctx.voice === 'vibraphone';
                const isVoiceVoice = ctx.voice === 'voice';
              if (isStringVoice && typeof root.StringVoice === 'undefined') return;
              if (isSineVoice && typeof root.SineVoice === 'undefined') return;
              if (isPluckVoice && typeof root.PluckVoice === 'undefined') return;
              if (isDroneVoice && typeof root.DroneVoice === 'undefined') return;
              if (isPianoVoice && typeof root.PianoVoice === 'undefined') return;
              if (isViolinVoice && typeof root.ViolinVoice === 'undefined') return;
              if (isCelloVoice && typeof root.CelloVoice === 'undefined') return;
                if (isMarimbaVoice && typeof root.MarimbaVoice === 'undefined') {
                  console.warn('[repl] marimba event reached scheduler, but root.MarimbaVoice is undefined', {
                    voice: ctx.voice,
                    token: tok,
                    block: ctx.block,
                  });
                  return;
                }
                if (isVibraphoneVoice && typeof root.VibraphoneVoice === 'undefined') {
                  console.warn('[repl] vibraphone event reached scheduler, but root.VibraphoneVoice is undefined', {
                    voice: ctx.voice,
                    token: tok,
                    block: ctx.block,
                  });
                  return;
                }

    if (isVoiceVoice && !voiceEngine()) {
      console.warn('[repl] voice event reached scheduler, but no voice engine is registered', {
        voice: ctx.voice,
        token: tok,
        block: ctx.block,
        VoiceVoice: root.VoiceVoice,
        RobotVoice: root.RobotVoice,
        VocalVoice: root.VocalVoice,
      });
      return;
    }

                let note = null;
                let chordNotes = null;
                const spanState = ensureBlockPitchSpanRuntime(ctx.block);
                let spanEvent = null;

              if (
                tok.kind === 'pitch-span-start'
                || tok.kind === 'pitch-span-end'
                || (tok.kind === 'note-random' && tok.pitchSpanStep === true)
              ) {
                spanEvent = resolvePitchSpanHit(node, tok, ctx.block, spanState, params, time);
                note = spanEvent && spanEvent.note ? spanEvent.note : null;
              } else if (tok.kind === 'chord') {
                if ((isViolinVoice || isCelloVoice || isMarimbaVoice || isVibraphoneVoice || isVoiceVoice) && Array.isArray(tok.value)) {
                  chordNotes = tok.value
                    .map((base) => {
                      const midi = base && Number.isFinite(Number(base.midi)) ? Number(base.midi) : null;
                      const tunedFreq = midi != null ? midiToFreq(midi, ctx.block) : (base && Number(base.freq));
                      return base && Number.isFinite(tunedFreq) ? { ...base, midi, freq: tunedFreq } : null;
                    })
                    .filter(Boolean);
                }
              } else if (tok.kind === 'note') {
                const base = tok.value || null;
                const midi = base && Number.isFinite(Number(base.midi)) ? Number(base.midi) : null;
                const tunedFreq = midi != null ? midiToFreq(midi, ctx.block) : (base && Number(base.freq));
                if (base && Number.isFinite(tunedFreq)) {
                  note = { ...base, midi, freq: tunedFreq };
                }
              } else if (tok.kind === 'note-random') {
                node._blockForAttractor = ctx.block;
                note = resolveRandomPitch(node, tok.value);
              }

                if (isViolinVoice && chordNotes && chordNotes.length >= 2) {
                  const chordLeafIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1)));
                  const isHeldChord = tok.sustained === true || tok.raw === '~' || chordNotes.some((n) => n && n.sustained === true);

                  emitPlayedLeafPulse(chordLeafIntensity, isHeldChord ? 'held' : null);
                  emitEditorPulse({
                    kind: 'voice',
                    line: blockLine(ctx.block),
                    voice: ctx.voice,
                    intensity: chordLeafIntensity,
                  });

                  const chordOpts = {
                    audioCtx,
                    masterBus: eventBus,
                    time,
                    notes: chordNotes,
                    chordRaw: tok.chordRaw || tok.raw || chordNotes.map((n) => n.name || 'note').join('+'),
                    force: params.force,
                    decay: params.decay,
                    crush: params.crush,
                    resolution: params.resolution,
                    tone: params.tone,
                    harm: params.harm,
                    octave: params.octave,
                    pan: params.pan,
                    gain: params.gain,
                    pedal: params.pedal,
                    una: params.una,
                    lid: params.lid,
                    sympathetic: params.sympathetic,
                    release: params.release,
                    human: params.human,
                    stretch: params.stretch,
                    layer: params.layer,
                    poly: params.poly,
                    articulation: params.articulation,
                    string: params.sul,
                    vibrato: params.vibrato,
                    vibratoRate: params.vibratorate,
                    vibratoOnset: params.vibratoonset,
                    tremolo: params.tremolo,
                    tremoloRate: params.tremolorate,
                    bow: params.bow,
                    wood: params.wood,
                      mallet: params.mallet,
                      resonance: params.resonance,
                      body: params.body,
                      deadstroke: params.deadstroke,
                      roll: params.roll,
                      spread: params.spread,
                    gateDuration,
                    eventDuration: duration,
                    panGestureDuration,
                    blockId: ctx.block && ctx.block._blockId,
                  };

                    if (root.ViolinVoice.playViolinChord) {
                      root.ViolinVoice.playViolinChord(chordOpts);
                    }

                  return;
                }


                if (isCelloVoice && chordNotes && chordNotes.length >= 2) {
                  const chordLeafIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1)));

                  emitPlayedLeafPulse(chordLeafIntensity);
                  emitEditorPulse({
                    kind: 'voice',
                    line: blockLine(ctx.block),
                    voice: ctx.voice,
                    intensity: chordLeafIntensity,
                  });

                  const chordOpts = {
                    audioCtx,
                    masterBus: eventBus,
                    time,
                    notes: chordNotes,
                    chordRaw: tok.raw || chordNotes.map((n) => n.name || 'note').join('+'),
                    force: params.force,
                    decay: params.decay,
                    crush: params.crush,
                    resolution: params.resolution,
                    tone: params.tone,
                    harm: params.harm,
                    octave: params.octave,
                    pan: params.pan,
                    gain: params.gain,
                    sympathetic: effects.sympathetic,
                    release: params.release,
                    human: params.human,
                    poly: params.poly,
                    articulation: params.articulation,
                    string: params.sul,
                    vibrato: params.vibrato,
                    vibratoRate: params.vibratorate,
                    vibratoOnset: params.vibratoonset,
                    tremolo: params.tremolo,
                    tremoloRate: params.tremolorate,
                    bow: params.bow,
                    wood: params.wood,
                    gateDuration,
                    eventDuration: duration,
                    panGestureDuration,
                    blockId: ctx.block && ctx.block._blockId,
                  };

                  if (root.CelloVoice.playCelloChord) root.CelloVoice.playCelloChord(chordOpts);
                  return;
                }
                
                if (isMarimbaVoice && chordNotes && chordNotes.length >= 2) {
                  const chordLeafIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1)));

                  emitPlayedLeafPulse(chordLeafIntensity);
                  emitEditorPulse({
                    kind: 'voice',
                    line: blockLine(ctx.block),
                    voice: ctx.voice,
                    intensity: chordLeafIntensity,
                  });

                  root.MarimbaVoice.playMarimbaChord({
                    audioCtx,
                    masterBus: eventBus,
                    time,
                    notes: chordNotes,
                    chordRaw: tok.raw || chordNotes.map((n) => n.name || 'note').join('+'),
                    force: params.force,
                    decay: params.decay,
                    crush: params.crush,
                    resolution: params.resolution,
                    pan: params.pan,
                    gain: params.gain,

                    mallet: params.mallet,
                    resonance: effects.resonance,
                    body: effects.body,
                    deadstroke: params.deadstroke,
                    roll: params.roll,
                    spread: params.spread,
                    human: params.human,
                    release: params.release,
                    poly: params.poly,

                    gateDuration,
                    eventDuration: duration,
                    panGestureDuration,
                    blockId: ctx.block && ctx.block._blockId,
                  });

                  return;
                }

                if (isVibraphoneVoice && chordNotes && chordNotes.length >= 2) {
                  const chordLeafIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1)));

                  emitPlayedLeafPulse(chordLeafIntensity);
                  emitEditorPulse({
                    kind: 'voice',
                    line: blockLine(ctx.block),
                    voice: ctx.voice,
                    intensity: chordLeafIntensity,
                  });

                  root.VibraphoneVoice.playVibraphoneChord({
                    audioCtx,
                    masterBus: eventBus,
                    time,
                    notes: chordNotes,
                    chordRaw: tok.raw || chordNotes.map((n) => n.name || 'note').join('+'),
                    force: params.force,
                    decay: params.decay,
                    crush: params.crush,
                    resolution: params.resolution,
                    pan: params.pan,
                    gain: params.gain,
                    articulation: params.articulation,
                    pedal: params.pedal,
                    motor: params.motor,
                    depth: params.depth,
                    damp: params.damp,
                    bowpressure: params.bowpressure,
                      vowel: params.vowel,
                      syllable: params.syllable,
                      carrier: params.carrier,
                      robot: params.robot,
                      vocoder: params.vocoder,
                      breath: params.breath,
                      mouth: params.mouth,
                      formant: params.formant,
                      roughness: params.roughness,
                      ensemble: params.ensemble,
                    resonance: effects.resonance,
                    sympathetic: effects.sympathetic,
                    body: effects.body,
                    spread: params.spread,
                    human: params.human,
                    release: params.release,
                    poly: params.poly,
                    gateDuration,
                    eventDuration: duration,
                    panGestureDuration,
                    blockId: ctx.block && ctx.block._blockId,
                  });

                  return;
                }


    if (isVoiceVoice && chordNotes && chordNotes.length >= 2) {
      const chordLeafIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1)));

      emitPlayedLeafPulse(chordLeafIntensity);
      emitEditorPulse({
        kind: 'voice',
        line: blockLine(ctx.block),
        voice: ctx.voice,
        intensity: chordLeafIntensity,
      });

      const engine = voiceEngine();
      const playChord = engine && (engine.playVoiceChord || engine.playRobotVoiceChord || engine.playVocalChord);

      if (!playChord) {
        console.warn('[repl] voice engine has no chord method', engine);
        return;
      }

      playChord.call(engine, {
        audioCtx,
        masterBus: eventBus,
        time,
        notes: chordNotes,
        chordRaw: tok.raw || chordNotes.map((n) => n.name || 'note').join('+'),
        force: params.force,
        decay: params.decay,
        crush: params.crush,
        resolution: params.resolution,
        pan: params.pan,
        gain: params.gain,
        vowel: params.vowel,
        syllable: params.syllable,
        carrier: params.carrier,
        robot: params.robot,
        vocoder: params.vocoder,
        breath: params.breath,
        mouth: params.mouth,
        formant: params.formant,
        roughness: params.roughness,
        ensemble: params.ensemble,
        resonance: effects.resonance,
        sympathetic: effects.sympathetic,
        body: effects.body,
        spread: params.spread,
        human: params.human,
        release: params.release,
        poly: params.poly,
        gateDuration,
        eventDuration: duration,
        panGestureDuration,
        blockId: ctx.block && ctx.block._blockId,
      });

      return;
    }

              let glideFreqStart = null;
              let glideFreqEnd = null;
              let glideSec = 0;
              if (
                spanEvent
                && spanEvent.spanEvent
                && spanEvent.desc
                && spanEvent.desc.timeBased !== true
                && tok.kind !== 'pitch-span-start'
              ) {
                const prevMidi = spanState && spanState.lastMidi != null && Number.isFinite(Number(spanState.lastMidi))
                  ? Number(spanState.lastMidi)
                  : null;
                const sec = Number(spanEvent.desc.glideSec);
                if (Number.isFinite(prevMidi) && Number.isFinite(sec) && sec > 0 && Number.isFinite(Number(note.midi))) {
                  const fromHz = midiToFreqContinuous(prevMidi, ctx.block);
                  if (Number.isFinite(fromHz) && fromHz > 0 && Math.abs(prevMidi - Number(note.midi)) > 1e-6) {
                    glideFreqStart = fromHz;
                    glideFreqEnd = Number(note.freq);
                    glideSec = sec;
                  }
                }
              }

              if (spanEvent) {
                finalizeSpanStateAfterEvent(spanState, spanEvent, note);
              } else if (spanState && Number.isFinite(Number(note.midi))) {
                spanState.lastMidi = Number(note.midi);
              }

                const synthLeafIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1)));
                emitPlayedLeafPulse(synthLeafIntensity, note.sustained || tok.raw === '~' ? 'held' : null);
                emitEditorPulse({
                  kind: 'voice',
                  line: blockLine(ctx.block),
                  voice: ctx.voice,
                  intensity: synthLeafIntensity,
                });

                const voiceOpts = {
                    audioCtx,
                    masterBus: eventBus,
                    time,
                    freq: note.freq,
                    midi: Number.isFinite(Number(note.midi)) ? Number(note.midi) : null,
                    force: params.force,
                    decay: params.decay,
                    crush: params.crush,
                    resolution: params.resolution,
                    tone: params.tone,
                    harm: params.harm,
                    octave: params.octave,
                    pan: params.pan,
                    gain: params.gain,
                    pedal: params.pedal,
                    una: params.una,
                    lid: params.lid,
                    sympathetic: params.sympathetic,
                    release: params.release,
                    human: params.human,
                    stretch: params.stretch,
                    layer: params.layer,
                    poly: params.poly,
                    articulation: params.articulation,
                    string: params.sul,
                    vibrato: params.vibrato,
                    vibratoRate: params.vibratorate,
                    vibratoOnset: params.vibratoonset,
                    tremolo: params.tremolo,
                    tremoloRate: params.tremolorate,
                    bow: params.bow,
                    wood: params.wood,

                    mallet: params.mallet,
                    resonance: effects.resonance,
                    body: effects.body,
                    deadstroke: params.deadstroke,
                    roll: params.roll,
                    spread: params.spread,
                    motor: params.motor,
                    depth: params.depth,
                    damp: params.damp,
                    bowpressure: params.bowpressure,
                    vowel: params.vowel,
                    syllable: params.syllable,
                    carrier: params.carrier,
                    robot: params.robot,
                    vocoder: params.vocoder,
                    breath: params.breath,
                    mouth: params.mouth,
                    formant: params.formant,
                    roughness: params.roughness,
                    ensemble: params.ensemble,

                    gateDuration,
                    eventDuration: duration,
                    panGestureDuration,
                    blockId: ctx.block && ctx.block._blockId,
                    freqStart: Number.isFinite(glideFreqStart) ? glideFreqStart : null,
                    freqEnd: Number.isFinite(glideFreqEnd) ? glideFreqEnd : null,
                    glideSec: Number.isFinite(glideSec) && glideSec > 0 ? glideSec : null,
                  };

                if (isStringVoice) {
                  root.StringVoice.playString(voiceOpts);
                } else if (isSineVoice && root.SineVoice.playSine) {
                  root.SineVoice.playSine(voiceOpts);
                } else if (isPluckVoice && root.PluckVoice.playPluck) {
                  root.PluckVoice.playPluck(voiceOpts);
                } else if (isDroneVoice && root.DroneVoice.playDrone) {
                  root.DroneVoice.playDrone(voiceOpts);
                } else if (isPianoVoice && root.PianoVoice.playPiano) {
                  root.PianoVoice.playPiano(voiceOpts);
                } else if (isViolinVoice && root.ViolinVoice.playViolin) {
                  root.ViolinVoice.playViolin(voiceOpts);
                } else if (isCelloVoice && root.CelloVoice.playCello) {
                  root.CelloVoice.playCello(voiceOpts);
                } else if (isMarimbaVoice) {
                  if (root.MarimbaVoice && root.MarimbaVoice.playMarimba) {
                    const ok = root.MarimbaVoice.playMarimba(voiceOpts);
                    if (!ok) {
                      console.warn('[repl] MarimbaVoice.playMarimba returned false', voiceOpts);
                    }
                  } else {
                    console.warn('[repl] root.MarimbaVoice exists, but playMarimba is missing', root.MarimbaVoice);
                  }
                } else if (isVibraphoneVoice) {
                  if (root.VibraphoneVoice && root.VibraphoneVoice.playVibraphone) {
                    const ok = root.VibraphoneVoice.playVibraphone(voiceOpts);
                    if (!ok) {
                      console.warn('[repl] VibraphoneVoice.playVibraphone returned false', voiceOpts);
                    }
                  } else {
                    console.warn('[repl] root.VibraphoneVoice exists, but playVibraphone is missing', root.VibraphoneVoice);
                  }
                } else if (isVoiceVoice) {
                  const engine = voiceEngine();
                  const play = engine && (engine.playVoice || engine.playRobotVoice || engine.playVocal);

                  if (play) {
                    const ok = play.call(engine, voiceOpts);
                    if (!ok) {
                      console.warn('[repl] voice engine returned false', voiceOpts);
                    }
                  } else {
                    console.warn('[repl] voice engine exists, but no play method is available', engine);
                  }
                }
              return;
            }

            if (ctx.voice === 'pulse') {
              if (typeof root.PulseVoice === 'undefined' || !root.PulseVoice.playPulse) return;
              if (!shouldFireLiveTrigger(ctx.block, time)) return;
              if (tok.kind !== 'pulse') return;

              const pulseLeafIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1)));
              const didPlayPulse = root.PulseVoice.playPulse({
                audioCtx,
                masterBus: eventBus,
                time,
                force: params.force,
                decay: params.decay,
                crush: params.crush,
                resolution: params.resolution,
                tone: params.tone,
                pan: params.pan,
                gain: params.gain,
                gateDuration,
                eventDuration: duration,
                panGestureDuration,
              }) === true;

              if (didPlayPulse) {
                emitPlayedLeafPulse(pulseLeafIntensity);
                emitEditorPulse({
                  kind: 'voice',
                  line: blockLine(ctx.block),
                  voice: 'pulse',
                  intensity: pulseLeafIntensity,
                });
              }

              return;
            }

            if (ctx.voice === 'noise') {
              if (typeof root.NoiseVoice === 'undefined' || !root.NoiseVoice.playNoise) return;
              if (!shouldFireLiveTrigger(ctx.block, time)) return;

              if (tok.kind !== 'noise') return;

              const noiseLeafIntensity = Math.max(0.12, Math.min(1, numericParamValue(params.gain, 1)));
              const didPlayNoise = root.NoiseVoice.playNoise({
                audioCtx,
                masterBus: eventBus,
                time,
                force: params.force,
                decay: params.decay,
                crush: params.crush,
                resolution: params.resolution,
                tone: params.tone,
                pan: params.pan,
                gain: params.gain,
                gateDuration,
                eventDuration: duration,
                panGestureDuration,
                held: false,
              }) === true;

              if (didPlayNoise) {
                emitPlayedLeafPulse(noiseLeafIntensity);
                emitEditorPulse({
                  kind: 'voice',
                  line: blockLine(ctx.block),
                  voice: 'noise',
                  intensity: noiseLeafIntensity,
                });
              }

              return;
            }

            if (ctx.voice === 'sample' || ctx.voice === 'drum') {
              if (typeof root.SampleVoice === 'undefined') return;
              if (!shouldFireLiveTrigger(ctx.block, time)) return;

              let plan = null;

              if (ctx.voice === 'sample') {
                if (tok.kind === 'sample') {
                  plan = [{ name: tok.value, gainMul: 1 }];
                } else if (tok.kind === 'sample-selector') {
                  plan = resolveSelector(node, tok.value, time, ctx.block);
                }
              } else if (ctx.voice === 'drum') {
                if (tok.kind !== 'drum') return;

                const kitId = ctx.block && ctx.block.kit && ctx.block.kit.id
                  ? String(ctx.block.kit.id)
                  : '';

                if (
                  kitId
                  && root.SampleVoice.preloadKit
                  && ctx.block._preloadedDrumKitId !== kitId
                ) {
                  ctx.block._preloadedDrumKitId = kitId;
                  root.SampleVoice.preloadKit(audioCtx, kitId);
                }

                plan = resolveDrumPlan(node, tok, time, ctx.block, params);

                if (root.__REPL_DRUM_DEBUG) {
                  const lane = tok.value && tok.value.lane ? String(tok.value.lane) : '*';
                  console.log('[drum-debug] sched-attempt', {
                    blockOrd: ctx.block && ctx.block._blockOrdinal,
                    line: blockLine(ctx.block),
                    slotIdx: ctx.slotIndex,
                    leafIdx: eventIndex,
                    lane,
                    kit: kitId,
                    plan: Array.isArray(plan) ? plan.map((p) => p && p.name).filter(Boolean) : null,
                    time: Number(time).toFixed(4),
                    audioNow: audioCtx.currentTime.toFixed(4),
                  });
                }
              }

              if (!plan) return;

              const items = Array.isArray(plan) ? plan : [plan];

              const sampleLeafIntensity = Math.max(0.16, Math.min(1, numericParamValue(params.gain, 1)));
              let emittedSampleLeaf = false;
              // A leaf pulse is a scheduler commitment, not proof that the
              // sample buffer was already decoded or that playback succeeded.
              // Keep highlighting stable for planned drum/sample leaves even
              // when lazy decode/cache state makes audio return false.
              let validSamplePlan = items.some((item) => item && item.name);
              let scheduledSampleAudio = false;

            for (const item of items) {
              if (!item || !item.name) continue;

              if (!root.SampleVoice.has(item.name)) {
                reportMissingSample(item.name);
                continue;
              }

              validSamplePlan = true;
              const gainMul = Number.isFinite(item.gainMul) ? item.gainMul : 1;
              const rateMul = Number.isFinite(item.rateMul) && item.rateMul > 0 ? item.rateMul : 1;

                const didScheduleSample = root.SampleVoice.playSample({
                  audioCtx,
                  masterBus: eventBus,
                  time,
                  name: item.name,
                  gain: params.gain * gainMul,
                  pan: params.pan,
                  rate: params.rate,
                  rateMul,
                  start: params.start,
                  crush: params.crush,
                  resolution: params.resolution,
                  gateDuration,
                  panGestureDuration,
                  rateGestureDuration,
                }) === true;

                if (root.__REPL_DRUM_DEBUG && ctx.voice === 'drum') {
                  console.log('[drum-debug] play-result', {
                    blockOrd: ctx.block && ctx.block._blockOrdinal,
                    leafIdx: eventIndex,
                    name: item.name,
                    didSchedule: didScheduleSample,
                    time: Number(time).toFixed(4),
                    audioNow: audioCtx.currentTime.toFixed(4),
                  });
                }

              if (didScheduleSample) scheduledSampleAudio = true;
            }

            // Visual leaf activity is a scheduler/readout event, not a proof that
            // the lazy sample buffer was already decoded. Random selectors can
            // otherwise keep selecting not-yet-cached files and appear dead while
            // their rests still pulse. Emit exactly one sample leaf pulse for the
            // selected valid sample leaf, after the plan is known to reference the
            // manifest. Missing selectors remain silent/unhighlighted.
            if (validSamplePlan && !emittedSampleLeaf) {
              emitPlayedLeafPulse(scheduledSampleAudio ? sampleLeafIntensity : Math.max(0.1, sampleLeafIntensity * 0.72));
              emitEditorPulse({
                kind: 'sample',
                line: blockLine(ctx.block),
                blockId: ctx.block && ctx.block._blockId ? ctx.block._blockId : null,
                blockOrdinal: ctx.block && Number.isFinite(Number(ctx.block._blockOrdinal))
                  ? Number(ctx.block._blockOrdinal)
                  : null,
                voice: ctx.voice === 'drum' ? 'drum' : 'sample',
                intensity: scheduledSampleAudio ? sampleLeafIntensity : Math.max(0.1, sampleLeafIntensity * 0.72),
              });
              emittedSampleLeaf = true;
            }

            return;
          }

          return;
        }

        if (node.kind === 'group') {
          const n = node.children.length;
          if (n === 0) return;

          const subDur = duration / n;
          for (let i = 0; i < n; i++) {
            dispatchSlotTree(node.children[i], time + i * subDur, subDur, {
              ...ctx,
              leafPath: (Array.isArray(ctx.leafPath) ? ctx.leafPath : []).concat(i),
            });
          }
        }
      }

    // ---------- selector resolution ----------
    //
    // A 'sample-selector' slot maintains its random state on the AST node
    // itself (mutated each time the slot fires). Cached fields on the node:
    //   _pool        cached expansion of the selector's pieces against the
    //                manifest; recomputed if empty (e.g. before the manifest
    //                loaded). Plain array of sample names.
    //   _frozenPick  for `name!` with no gradient, the one chosen sample.
    //   _frozenPair  for `&N!`, the pair [A, B] picked once and oscillated.
    //   _gradStart   for `&N` (no !), the absolute time when the current
    //                window opened.
    //   _gradLeft / _gradRight
    //                current pair for the unfrozen gradient.
    //
      // Pick semantics within a gradient window: audio crossfade.
      // A gradient selector returns a play plan with BOTH samples in the active
      // pair. The scheduler schedules both on every trigger and applies
      // equal-power gain weights across the N-second window.
    function expandSelectorPool(selector) {
      if (typeof root.SampleVoice === 'undefined') return [];
      const seen = new Set();
      const pool = [];
      for (const piece of selector.pieces) {
        if (piece.kind === 'concrete') {
          if (root.SampleVoice.has(piece.name) && !seen.has(piece.name)) {
            seen.add(piece.name);
            pool.push(piece.name);
          }
          continue;
        }
        if (piece.kind === 'wildcard') {
          const expanded = root.SampleVoice.expandPrefix
            ? root.SampleVoice.expandPrefix(piece.prefix)
            : [];
          for (const name of expanded) {
            if (!seen.has(name)) {
              seen.add(name);
              pool.push(name);
            }
          }
        }
      }
      return pool;
    }

      function pickRandom(pool, block) {
        if (!pool || pool.length === 0) return null;

        const chooser = block && block.controls ? block.controls.choose : null;
        const chosenSignals = chooser ? liveSignalsForControl(chooser) : null;

        if (!chosenSignals) {
          const a = blockAttractor(block);
          if (!a) return pool[Math.floor(Math.random() * pool.length)];

          return attractorChoice(block, pool, (name, i, signals) => {
            const raw = String(name || '').toLowerCase();
            let w = 1;

            if (/tub|room|body|mic|voice|breath|water|glass|metal|noise|low|bass/.test(raw)) w += signals.density * 1.2;
            if (/hit|click|snap|burst|crack|impact|short|perc|strike/.test(raw)) w += signals.rupture * 1.8 + signals.volatility;
            if (/air|wind|hiss|bow|long|drone|pad|sustain/.test(raw)) w += signals.periodicity * 1.4 + signals.pressure * 0.5;
            if (/solar|electric|buzz|hum|grid|machine|motor/.test(raw)) w += signals.pressure * 1.2 + signals.intensity * 0.7;
            if (/quake|rock|earth|sub|rumble/.test(raw)) w += signals.rupture * 1.4 + signals.density;

            return w;
          });
        }

        const amount = clamp(Number(chooser.amount) || 0, 0, 1);
        let total = 0;
        const weights = pool.map((name, i) => {
          const raw = String(name || '').toLowerCase();
          let w = 1;

          if (/tub|room|body|mic|voice|breath|water|glass|metal|noise|low|bass/.test(raw)) w += chosenSignals.density * 1.2 * amount;
          if (/hit|click|snap|burst|crack|impact|short|perc|strike/.test(raw)) w += (chosenSignals.rupture * 1.8 + chosenSignals.volatility) * amount;
          if (/air|wind|hiss|bow|long|drone|pad|sustain/.test(raw)) w += (chosenSignals.periodicity * 1.4 + chosenSignals.pressure * 0.5) * amount;
          if (/solar|electric|buzz|hum|grid|machine|motor/.test(raw)) w += (chosenSignals.pressure * 1.2 + chosenSignals.intensity * 0.7) * amount;
          if (/quake|rock|earth|sub|rumble/.test(raw)) w += (chosenSignals.rupture * 1.4 + chosenSignals.density) * amount;

          const feature = liveFeatureValue(chosenSignals, chooser.feature, 0.5);
          w += amount * feature * ((i % 7) / 7);
          w = Math.max(0.0001, w);
          total += w;
          return w;
        });

        let r = Math.random() * total;
        for (let i = 0; i < pool.length; i++) {
          r -= weights[i];
          if (r <= 0) return pool[i];
        }

        return pool[pool.length - 1];
      }

      function pickPair(pool, block) {
      if (!pool || pool.length === 0) return null;
      if (pool.length === 1) return [pool[0], pool[0]];
          const first = pickRandom(pool, block);
          let second = pickRandom(pool, block);
          if (pool.length > 1) {
            let guard = 0;
            while (second === first && guard < 8) {
              second = pickRandom(pool, block);
              guard++;
            }
            if (second === first) {
              const idx = pool.indexOf(first);
              second = pool[(idx + 1) % pool.length];
            }
          }
          return [first, second];
    }

      function clamp01(v) {
        if (!Number.isFinite(v)) return 0;
        return v < 0 ? 0 : v > 1 ? 1 : v;
      }

      function equalPowerPair(from, to, f) {
        const x = clamp01(f);
        return [
          { name: from, gainMul: Math.cos(x * Math.PI * 0.5) },
          { name: to, gainMul: Math.sin(x * Math.PI * 0.5) },
        ];
      }

      function resolveSelector(node, selector, time, block) {
        // Lazily re-expand the pool until the manifest produces samples.
        if (!node._pool || node._pool.length === 0) {
          node._pool = expandSelectorPool(selector);
          if (!node._pool || node._pool.length === 0) {
            // Manifest may not be loaded yet; report once with the raw token
            // so the user sees something rather than silence.
            reportMissingSample(selector.raw);
            return null;
          }
        }

        const pool = node._pool;

        // Case 1: no gradient. Return one scheduled sample.
        if (selector.gradientSec == null) {
          if (selector.frozen) {
            if (!node._frozenPick) node._frozenPick = pickRandom(pool, block);
            return node._frozenPick ? [{ name: node._frozenPick, gainMul: 1 }] : null;
          }

          const picked = pickRandom(pool, block);
          return picked ? [{ name: picked, gainMul: 1 }] : null;
        }

        // Case 2: gradient. Return two scheduled samples with gain weights.
        const N = Number(selector.gradientSec);
        if (!Number.isFinite(N) || N <= 0) {
          const picked = pickRandom(pool, block);
          return picked ? [{ name: picked, gainMul: 1 }] : null;
        }

        if (selector.frozen) {
          // Frozen pair, oscillating: A → B, then B → A, forever.
          if (!node._frozenPair) node._frozenPair = pickPair(pool, block);
          if (!node._frozenPair) return null;

          const [A, B] = node._frozenPair;
          const windowIdx = Math.floor(time / N);
          const windowStart = windowIdx * N;
          const f = (time - windowStart) / N;
          const from = windowIdx % 2 === 0 ? A : B;
          const to = windowIdx % 2 === 0 ? B : A;

          return equalPowerPair(from, to, f);
        }

        // Unfrozen rolling gradient:
        // window 1: A → B
        // window 2: B → C
        // window 3: C → D
        if (node._gradLeft == null || node._gradRight == null || !Number.isFinite(node._gradStart)) {
          const pair = pickPair(pool, block);
          if (!pair) return null;
          node._gradLeft = pair[0];
          node._gradRight = pair[1];
          node._gradStart = time;
        }

        // Advance the window if we've crossed one or more boundaries.
        while (time - node._gradStart >= N) {
          node._gradLeft = node._gradRight;
          node._gradRight = pickRandom(pool, block);
          node._gradStart += N;

          // Avoid A → A if the pool has more than one item.
          if (pool.length > 1 && node._gradRight === node._gradLeft) {
            let guard = 0;
            while (node._gradRight === node._gradLeft && guard < 8) {
              node._gradRight = pickRandom(pool, block);
              guard++;
            }
          }
        }

        const f = (time - node._gradStart) / N;
        return equalPowerPair(node._gradLeft, node._gradRight, f);
      }

      function expandWeightedPoolNames(items) {
        const out = [];
        if (!Array.isArray(items)) return out;
        for (const item of items) {
          if (!item || !item.name) continue;
          const w = Number(item.weight);
          const copies = Number.isFinite(w) ? Math.max(1, Math.min(16, Math.round(w * 4))) : 1;
          for (let i = 0; i < copies; i++) out.push(item.name);
        }
        return out;
      }

      function uniqueNameCount(pool) {
        if (!Array.isArray(pool) || pool.length === 0) return 0;
        return new Set(pool).size;
      }

      function drumLaneGainMul(lane) {
        switch (String(lane || '').toLowerCase()) {
          case 'k': return 1.55; // kick needs to survive the rest of the kit
          case 's': return 1.18;
          case 'h': return 0.68;
          case 'o': return 0.78;
          case 't': return 1.05;
          case 'r': return 0.72;
          case 'c': return 0.82;
          default: return 1;
        }
      }

      function resolveDrumPlan(node, tok, time, block, params) {
        if (!tok || tok.kind !== 'drum') return null;
        if (typeof root.SampleVoice === 'undefined' || typeof root.SampleVoice.kitById !== 'function') return null;

        const kitId = block && block.kit && block.kit.id ? String(block.kit.id) : '';
        if (!kitId) {
          reportMissingSample('drum-kit:(missing)');
          return null;
        }

        const kit = root.SampleVoice.kitById(kitId);
        if (!kit) {
          reportMissingSample(`drum-kit:${kitId}`);
          return null;
        }

        const programTempo = program && Number(program.tempo) > 0 ? Number(program.tempo) : 0;
        const rateMul = (kit && Number(kit.bpm) > 0 && programTempo > 0)
          ? programTempo / Number(kit.bpm)
          : 1;

        const lane = tok.value && tok.value.lane ? String(tok.value.lane).toLowerCase() : '*';
        const frozen = Boolean(tok.value && tok.value.frozen);
        const entries = lane === '*'
          ? (Array.isArray(kit.pool) ? kit.pool : [])
          : (kit.lanes && Array.isArray(kit.lanes[lane]) ? kit.lanes[lane] : []);
        if (!entries.length) {
          reportMissingSample(`drum-lane:${kit.id}:${lane}`);
          return null;
        }

        const pool = expandWeightedPoolNames(entries);
        if (!pool.length) {
          reportMissingSample(`drum-lane:${kit.id}:${lane}`);
          return null;
        }

          const laneGainMul = drumLaneGainMul(lane);
          const exactSampleName = block && block.drumSample && block.drumSample.name
            ? String(block.drumSample.name)
            : '';

          if (exactSampleName) {
            const kitPool = expandWeightedPoolNames(Array.isArray(kit.pool) ? kit.pool : []);
            const sampleExistsInLane = pool.includes(exactSampleName);
            const sampleExistsInKit = sampleExistsInLane
              || kitPool.includes(exactSampleName)
              || (root.SampleVoice && typeof root.SampleVoice.has === 'function' && root.SampleVoice.has(exactSampleName));
            if (!sampleExistsInKit) {
              reportMissingSample(`drum-sample:${kit.id}:${exactSampleName}`);
              return null;
            }

            // `pick <sample-id>` is an exact sample pin for its compatible
            // lane, not a whole-kit override. A picked kick sample should pin
            // k/k! hits, while h/s/o/etc. in the same drum block continue to
            // resolve through their normal lane-local pools and variance.
            if (sampleExistsInLane) {
              return [{ name: exactSampleName, gainMul: laneGainMul, rateMul }];
            }
          }

          const freezeKey = `${kit.id}:${lane}`;

          if (frozen && node._drumFrozenPick && node._drumFrozenPick.key === freezeKey && node._drumFrozenPick.name) {
            return [{ name: node._drumFrozenPick.name, gainMul: laneGainMul, rateMul }];
          }

          if (frozen) {
            const picked = pickRandom(pool, block);
            if (!picked) {
              reportMissingSample(`drum-lane:${kit.id}:${lane}`);
              return null;
            }
            node._drumFrozenPick = { key: freezeKey, name: picked };
            return [{ name: picked, gainMul: laneGainMul, rateMul }];
          }

          if (!node._drumVarianceAnchor) node._drumVarianceAnchor = {};

          const anchorKey = `${kit.id}:${lane}`;
          let anchor = node._drumVarianceAnchor[anchorKey];
          if (!anchor) {
            anchor = pickRandom(pool, block);
            if (!anchor) {
              reportMissingSample(`drum-lane:${kit.id}:${lane}`);
              return null;
            }
            node._drumVarianceAnchor[anchorKey] = anchor;
          }

          const variance = clamp(numericParamValue(params && params.variance, 1), 0, 1);
          if (variance <= 0) {
            return [{ name: anchor, gainMul: laneGainMul, rateMul }];
          }

          let picked = anchor;
          if (variance >= 1 || Math.random() < variance) {
            picked = pickRandom(pool, block);
            if (!picked) {
              reportMissingSample(`drum-lane:${kit.id}:${lane}`);
              return null;
            }
            if (picked === anchor && uniqueNameCount(pool) > 1) {
              const reroll = pickRandom(pool, block);
              if (reroll) picked = reroll;
            }
          }

          return [{ name: picked, gainMul: laneGainMul, rateMul }];
      }

      function syncInputBlock(block, eventBus, params, time) {
        if (!block || block.voice !== 'input') return false;
        if (typeof root.InputVoice === 'undefined' || !root.InputVoice.syncBlock) return false;

        const kind = block.input && block.input.kind ? block.input.kind : 'mic';
        const gain = numericParamValue(params && params.gain, 1);
        const monitor = numericParamValue(params && params.monitor, gain);
        const listen = numericParamValue(params && params.listen, 1);
        const pan = numericParamValue(params && params.pan, 0);

        if (listen <= 0 && block.attractor) {
          // Keep monitor audible if requested, but prevent the input block from
          // self-modulating when listen is explicitly disabled. Other blocks can
          // still opt into attractor mic/interface/tab if the source is enabled.
          block._inputListenMuted = true;
        } else {
          block._inputListenMuted = false;
        }

        emitEditorPulse({
          kind: 'input',
          line: blockLine(block),
          row: 'input',
          source: kind,
          intensity: Math.max(0, Math.min(1, Math.max(gain, monitor, listen))),
          meter: true,
          voice: 'input',
        });

        return root.InputVoice.syncBlock({
          block,
          audioCtx,
          destination: eventBus || masterBus,
          kind,
          gain,
          monitor,
          listen,
          pan,
          time,
        });
      }

      function syncVideoBlock(block, params, effects, time, duration) {
        if (!block || (block.voice !== 'video' && block.voice !== 'video-gen')) return false;
        if (typeof root.VideoVoice === 'undefined' || !root.VideoVoice.syncBlock) return false;

        const sourceKind = block.voice === 'video-gen'
          ? ((block.videoGen && block.videoGen.source) || 'camera')
          : (block.video && block.video.kind ? block.video.kind : 'camera');

        root.VideoVoice.syncBlock({
          blockId: block._blockId || null,
          voice: block.voice,
          source: sourceKind,
          sourceClipId: block && block.video && block.video.sourceClipId
            ? block.video.sourceClipId
            : (block && block.source && (block.source.clip || block.source.file || block.source.sample) ? (block.source.clip || block.source.file || block.source.sample) : ''),
          genSource: block && block.videoGen && block.videoGen.source ? block.videoGen.source : '',
          style: block && block.videoGen && block.videoGen.style ? block.videoGen.style : '',
          seed: block && block.videoGen && block.videoGen.seed ? block.videoGen.seed : '',
          cache: block && block.videoGen && block.videoGen.cache ? block.videoGen.cache : '',
          duration: block && block.videoGen && Number(block.videoGen.duration) ? Number(block.videoGen.duration) : 0,
          continuousOnly: Boolean(block && block.continuousOnly === true),
          params: params || {},
          effects: effects || {},
          time: Number.isFinite(Number(time)) ? Number(time) : audioCtx.currentTime,
          eventDuration: Number.isFinite(Number(duration)) ? Number(duration) : 0.25,
        });
        return true;
      }

      function dispatchTopSlot(block, slotIdx, slotAbsTime, slotDuration, speed, absoluteSlotIdx) {
        ensureLeafOffsets(block);
        maybeResetPitchSpansAtBoundary(block, absoluteSlotIdx);

        const absSlotIdx = Number.isFinite(Number(absoluteSlotIdx))
          ? Math.max(0, Math.floor(Number(absoluteSlotIdx)))
          : Math.max(0, Math.floor(Number(slotIdx) || 0));
        const pos = resolveBlockPosition(block, slotIdx, slotAbsTime, absSlotIdx, true);
        const cycleLengthSlots = block && block.every
          ? everyPeriodSlots(block)
          : Math.max(1, block.slots.length || 1);
        emitBlockPositionPulse(block, slotAbsTime, {
          slotIndex: slotIdx,
          blockSlotIndex: pos && !pos.silent ? pos.inBlockIdx : null,
          cycleSlotIndex: ((absSlotIdx % cycleLengthSlots) + cycleLengthSlots) % cycleLengthSlots,
          cycleLengthSlots,
          isSilentAdvance: Boolean(pos && pos.silent),
        });
        if (pos.silent) return;
        if (blockIsMutedAt(block, slotAbsTime)) return;

        // exit gate: enter is honored at install via _speedNextTime offset,
        // but exit needs an explicit dispatch-time check. Reads block.exit
        // and the per-block _arrangeOrigin (set in install/safeRestart/update)
        // so it's tempo-independent — exitSec is always recomputed against
        // the current program's bar grid.
        if (block && block.exit && Number.isFinite(block._arrangeOrigin)) {
          const exitSec = spanSpecSeconds(block.exit, program);
          if (Number.isFinite(exitSec) && exitSec > 0
            && (slotAbsTime - block._arrangeOrigin) >= exitSec - 0.000001) {
            return;
          }
        }

        const inBlockIdx = pos.inBlockIdx;
        const node = block.slots[inBlockIdx];
        if (!node) return;
        if ((block.voice === 'video' || block.voice === 'video-gen') && block.continuousOnly === true) {
          return;
        }

        const phraseSlot = Number.isFinite(Number(pos && pos.phraseSlot)) ? Math.max(0, Math.floor(Number(pos.phraseSlot))) : inBlockIdx;
        const phraseRepeat = block.slots.length > 0 ? Math.floor(phraseSlot / block.slots.length) : 0;
        const leafBase = phraseRepeat * block._leafTotal + (block._leafOffsets[inBlockIdx] || 0);

        dispatchSlotTree(node, slotAbsTime, slotDuration, {
          block,
          voice: block.voice,
          leafBase,
          leafTotal: block._leafTotal,
          leafCursor: { index: 0 },
          sourceLeafCursor: { index: 0 },
          leafPath: [inBlockIdx],
          slotIndex: inBlockIdx,
          speed,
        });
      }

      function scheduleEvents() {
        if (!program || program.blocks.length === 0) return;

        const nowAbs = audioCtx.currentTime;
        const horizonAbs = nowAbs + SCHEDULE_AHEAD_S;
        if (
          pendingEvaluate &&
          Number.isFinite(Number(pendingEvaluate.resetTime)) &&
          pendingEvaluate.resetTime <= horizonAbs + 0.000001
        ) {
          const queued = pendingEvaluate;
          pendingEvaluate = null;
          installProgramAtReset(queued.program, queued.resetTime, Boolean(queued.stopVoices));
        }

        const barSec = barSeconds(program);

          for (const block of program.blocks) {
            if (!Number.isFinite(barSec) || barSec <= 0) continue;
            ensureBarGrid(block);
            const blockMutedNow = blockIsMutedAt(block, nowAbs);

            ensureSpeedCursor(block);

            // Fade is block presence, not event gain. Keep its fader moving even
            // during sparse phrases or long sample tails where no new event fires.
            updateFadeGainForBlock(block, nowAbs);

            if (block.voice === 'input') {
              const inputSlotSec = slotDurationFor(block, 0, barSec);
              const baseParams = resolveParamsForEvent(block, 0, nowAbs);
              const effects = resolveEffectsForEvent(block, 0, nowAbs);
              const attractorMod = numericParamValue(baseParams.listen, 1) <= 0 ? null : attractorModForBlock(block, nowAbs);
              const params = applyAttractorToParams(block, baseParams, block.voice, nowAbs, inputSlotSec, attractorMod);
              const routedParams = blockMutedNow
                ? { ...params, gain: 0, monitor: 0, listen: 0 }
                : params;
              block._lastSurfaceState = {
                eventIndex: 0,
                speed: 1,
                params: { ...routedParams },
                baseParams: { ...baseParams },
                effects: { ...effects },
                time: nowAbs,
                duration: inputSlotSec,
              };
              const eventBus = outputBusForBlock(block, nowAbs, attractorMod, effects);
              syncInputBlock(block, eventBus, routedParams, nowAbs);
            }

            if ((block.voice === 'video' || block.voice === 'video-gen') && !blockMutedNow) {
              const idx = Math.max(0, Math.floor(Number(block._speedSlotIdx) || 0));
              const videoSlotSec = slotDurationFor(block, idx, barSec);
              const baseParams = resolveParamsForEvent(block, idx, nowAbs);
              const effects = resolveEffectsForEvent(block, idx, nowAbs);
              const attractorMod = numericParamValue(baseParams.listen, 1) <= 0 ? null : attractorModForBlock(block, nowAbs);
              const params = applyAttractorToParams(block, baseParams, block.voice, nowAbs, videoSlotSec, attractorMod);
              block._lastSurfaceState = {
                eventIndex: idx,
                speed: Number.isFinite(block._lastSpeed) ? block._lastSpeed : 1,
                params: { ...params },
                baseParams: { ...baseParams },
                effects: { ...effects },
                time: nowAbs,
                duration: videoSlotSec,
              };
              syncVideoBlock(block, params, effects, nowAbs, videoSlotSec);
            }

          // If the cursor is somehow behind the transport origin, snap it forward.
            if (block._speedNextTime < originTime) {
              block._speedNextTime = originTime;
              block._speedSlotIdx = 0;
            }
        }

        let guard = 0;
        while (guard < 4096) {
          let nextBlock = null;
          let nextTime = Infinity;

          for (const candidate of program.blocks) {
            const t = Number(candidate && candidate._speedNextTime);
            if (!Number.isFinite(t)) continue;
            if (t >= horizonAbs) continue;
            if (t < nextTime) {
              nextTime = t;
              nextBlock = candidate;
            }
          }

          if (!nextBlock) break;

          const slotIdx = Math.max(0, Math.floor(nextBlock._speedSlotIdx));
          const localSlotSec = slotDurationFor(nextBlock, slotIdx, barSec);
          const slotAbsTime = Number.isFinite(Number(nextBlock._speedNextTime))
            ? Number(nextBlock._speedNextTime)
            : originTime + slotStartOffset(nextBlock, slotIdx, barSec);
          const speed = speedForSlot(nextBlock, slotIdx, slotAbsTime);
          nextBlock._lastSpeed = speed;
          const speedDuration = localSlotSec / speed;
          const eventDuration = Number.isFinite(speedDuration) && speedDuration > 0
            ? speedDuration
            : localSlotSec;

          let dispatchAbsTime = slotAbsTime;
          if (slotAbsTime < nowAbs - 0.002) {
            const lateness = nowAbs - slotAbsTime;
            const catchUpWindow = Math.max(0.045, Math.min(0.18, eventDuration * 0.75));

            // Do not randomly drop slightly-late leaves. Browser timer jitter,
            // lazy sample decode, and multiple same-voice drum blocks can push
            // a committed slot a few ms behind the audio clock; skipping it
            // makes both audio and editor highlighting appear to miss leaves.
            // Only discard events that are truly stale. Fresh late events are
            // nudged onto the immediate audio horizon but keep their original
            // grid slot identity for row/leaf highlighting and sequencing.
            if (lateness > catchUpWindow) {
              nextBlock._speedSlotIdx = slotIdx + 1;
              nextBlock._speedNextTime = slotAbsTime + eventDuration;
              nextBlock._scheduledThrough = nextBlock._speedSlotIdx;
              guard += 1;
              continue;
            }
          }

          // Multiple blocks can legitimately share the same grid time. Do not
          // schedule the later blocks in that same-time group at an already-too-
          // close Web Audio timestamp after the first block's dispatch work. Keep
          // the grid slot identity below, but give every committed event in this
          // tick a small common audio lead so one drum block cannot starve the
          // next block's playback/highlight pulse.
          dispatchAbsTime = Math.max(dispatchAbsTime, nowAbs + MIN_AUDIO_LEAD_S);

          const absoluteSlotIdx = absSlotForElapsed(nextBlock, (slotAbsTime - originTime) + 0.000001, barSec);
          applyPendingMuteForBlock(nextBlock, dispatchAbsTime);
          dispatchTopSlot(nextBlock, slotIdx, dispatchAbsTime, eventDuration, speed, absoluteSlotIdx);
          nextBlock._lastDispatchedSlotIdx = slotIdx;
          nextBlock._lastDispatchedTime = dispatchAbsTime;
          nextBlock._lastDispatchedDuration = eventDuration;
          nextBlock._speedSlotIdx = slotIdx + 1;
          nextBlock._speedNextTime = slotAbsTime + eventDuration;
          nextBlock._scheduledThrough = nextBlock._speedSlotIdx;
          guard += 1;
        }

        if (guard >= 4096) {
          for (const block of program.blocks) {
            const guardSlotSec = slotDurationFor(block, Math.max(0, Math.floor(block._speedSlotIdx)), barSec);
            block._speedNextTime = Math.max(nowAbs, Number(block._speedNextTime) || nowAbs) + guardSlotSec;
          }
        }
      }

    function tick() {
      if (!running || !program) return;
      try {
        scheduleEvents();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[repl scheduler] tick error:', err);
      }
    }

    // Returns current playhead state. Used by the visualizer.
    function now() {
      if (!program) return { bar: 0, beat: 0, transport: 0, blockStates: [] };
      const elapsed = Math.max(0, audioCtx.currentTime - originTime);
      const barSec = barSeconds(program);
        const meterUnitsPerBar = Number.isFinite(Number(program.meter && program.meter.num))
          && Number(program.meter.num) > 0
          ? Number(program.meter.num)
          : 4;

        // UI/playhead beat here means notated meter unit, not necessarily a
        // quarter note. In 12/16 it counts 12 sixteenth units across a shorter
        // bar; in 12/8 it counts 12 eighth units across a longer bar.
        const totalMeterUnits = (elapsed / barSec) * meterUnitsPerBar;
        const bar = Math.floor(elapsed / barSec);
        const beat = totalMeterUnits - bar * meterUnitsPerBar;
        const beatIndex = meterUnitsPerBar > 0 ? Math.floor(beat) % meterUnitsPerBar : 0;
        const beatProgress = beat - Math.floor(beat);
        const blockStates = program.blocks.map((block, i) => {
          const lastIdx = Number.isFinite(block._lastDispatchedSlotIdx)
            ? block._lastDispatchedSlotIdx
            : 0;
          const slotIdx = Math.max(0, lastIdx);
          const lastTime = Number.isFinite(block._lastDispatchedTime)
            ? block._lastDispatchedTime
            : originTime;
          const lastDur = Number.isFinite(block._lastDispatchedDuration) && block._lastDispatchedDuration > 0
            ? block._lastDispatchedDuration
            : slotDurationFor(block, slotIdx, barSec);
          const subProgress = clamp((audioCtx.currentTime - lastTime) / lastDur, 0, 1);
          // Pure read for the visualizer; never mutates the block's every-state.
          const pos = resolveBlockPosition(block, slotIdx, audioCtx.currentTime, undefined, false);
          const muted = blockIsMutedAt(block, audioCtx.currentTime);
          const muteState = ensureBlockMuteState(block);
          const pendingMute = muteState && muteState.pending ? muteState.pending : null;
            const attractor = block.attractor
              ? (attractorSignalsForBlock(block, audioCtx.currentTime) || blockAttractor(block))
              : null;
          const inputState = block.voice === 'input' && typeof root.InputVoice !== 'undefined' && root.InputVoice.getState
            ? root.InputVoice.getState()[block.input && block.input.kind ? block.input.kind : 'mic']
            : null;
          const videoState = (block.voice === 'video' || block.voice === 'video-gen') && typeof root.VideoVoice !== 'undefined' && root.VideoVoice.getState
            ? root.VideoVoice.getState()
            : null;

            return {
              blockIndex: i,
              slotsPerBar: block.slotsPerBar,
              barSlotCounts: Array.isArray(block.barSlotCounts) ? block.barSlotCounts.slice() : null,
              slotsTotal: block.slots.length,
              bars: block.bars,
              slotIdx,
              subProgress,
              silent: pos.silent,
              inBlockIdx: pos.silent ? -1 : pos.inBlockIdx,
              muted,
              mutePending: Boolean(pendingMute),
              pendingMuted: pendingMute ? Boolean(pendingMute.muted) : muted,
              pendingMuteAt: pendingMute && Number.isFinite(Number(pendingMute.at)) ? Number(pendingMute.at) : null,
              voice: block.voice,
              every: block.every,
                attractor: block.attractor,
                attractorState: attractor,
                fade: block.fade,
                fadeState: block.fade ? fadeStateForBlock(block, audioCtx.currentTime) : null,
                input: block.input || null,
                inputState,
                video: block.video || null,
                videoGen: block.videoGen || null,
                videoState,
                surfaceState: block._lastSurfaceState || null,
            };
      });
      return { bar, beat, beatIndex, beatProgress, transport: elapsed, blockStates };
    }

      return {
        start,
        stop,
        safeRestart,
        update,
        queueEvaluateAtReset,
        setBlockMuted,
        setBlockMutedByLine,
        toggleBlockMutedByLine,
        getMuteStates,
        onMissingSample,
        now,
        isRunning: () => running,
      };
  }

  root.ReplScheduler = { create };
})(window);
