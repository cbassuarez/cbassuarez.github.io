#!/usr/bin/env node
// Regression test: every top-level slot in a pattern must dispatch.
//
// Origin: in `drum k . k . | k k . k`, the last `k` (slot 7) was being
// skipped under specific install/start ordering bugs. This test runs a
// minimal sandbox that loads the real dsl.js and scheduler.js, mocks
// just enough of Web Audio to let the scheduler tick, and counts the
// `block-position` pulses the scheduler emits for each slot.
//
// Pattern coverage is the contract: for every test patch, every slot
// index 0..N-1 must appear at least once in the recorded pulses across
// at least one full cycle. If a slot is missing — especially the last —
// the scheduler dropped it and we fail.
//
// Run with:    node tests/dispatch-fires-all-slots.mjs
// Or via npm:  (none configured — invoke directly)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPL_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ---- mock audio context -------------------------------------------------

let _now = 0;
function makeAudioParam(initial = 0) {
  const p = {
    value: initial,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
  };
  return p;
}
function makeNode(extra = {}) {
  const node = {
    connect(_to) { return _to; },
    disconnect() {},
    gain: makeAudioParam(1),
    frequency: makeAudioParam(440),
    Q: makeAudioParam(1),
    pan: makeAudioParam(0),
    delayTime: makeAudioParam(0),
    detune: makeAudioParam(0),
    threshold: makeAudioParam(-24),
    knee: makeAudioParam(30),
    ratio: makeAudioParam(12),
    attack: makeAudioParam(0.003),
    release: makeAudioParam(0.25),
    type: 'sine',
    curve: null,
    oversample: 'none',
    ...extra,
  };
  return node;
}
const masterBus = makeNode();
const audioCtx = {
  get currentTime() { return _now; },
  destination: masterBus,
  state: 'running',
  sampleRate: 44100,
  createGain: () => makeNode(),
  createOscillator: () => ({ ...makeNode(), start() {}, stop() {} }),
  createBiquadFilter: () => makeNode(),
  createDelay: () => makeNode(),
  createDynamicsCompressor: () => makeNode(),
  createWaveShaper: () => makeNode(),
  createBufferSource: () => ({
    ...makeNode(),
    buffer: null,
    playbackRate: makeAudioParam(1),
    onended: null,
    start() {},
    stop() {},
  }),
  createStereoPanner: () => makeNode(),
  createChannelMerger: () => makeNode(),
  createChannelSplitter: () => makeNode(),
  createAnalyser: () => ({ ...makeNode(), getFloatTimeDomainData() {}, getByteFrequencyData() {} }),
  createConvolver: () => makeNode(),
  decodeAudioData: async () => ({ duration: 1, length: 44100, numberOfChannels: 2, sampleRate: 44100 }),
};

// ---- mock timers (deferred queue, fired during advanceTo) ---------------

let nextTimerId = 1;
const timers = new Map(); // id → { fireAt, fn }
function setTimeoutMock(fn, ms) {
  const id = nextTimerId++;
  timers.set(id, { fireAt: _now + (Number(ms) || 0) / 1000, fn });
  return id;
}
function clearTimeoutMock(id) {
  timers.delete(id);
}
let tickFn = null;
function setIntervalMock(fn /*, ms */) {
  tickFn = fn;
  return 1;
}
function clearIntervalMock() {
  tickFn = null;
}

// ---- pulse capture ------------------------------------------------------

const pulses = [];
const ReplEditorPulse = { emit(p) { pulses.push({ ...p, _capturedAt: _now }); } };

// ---- voice stubs --------------------------------------------------------

function noopVoice(extra = {}) {
  return {
    stopAll() {},
    playSine() { return true; },
    playString() { return true; },
    playPluck() { return true; },
    playDrone() { return true; },
    playNoise() { return true; },
    playPulse() { return true; },
    playPiano() { return true; },
    playSample() { return true; },
    syncBlock() {},
    cleanup() {},
    disconnectBlock() {},
    ...extra,
  };
}
const SampleVoice = {
  ...noopVoice(),
  has: () => true,
  list: () => [],
  groups: () => [],
  ready: () => Promise.resolve({}),
  kits: () => [{ id: 'breakcore', label: 'breakcore' }],
  kitById: (id) => {
    if (String(id).toLowerCase() !== 'breakcore' && String(id).toLowerCase() !== 'bk') return null;
    const lane = [{ name: 'k1', weight: 1 }];
    return {
      id: 'breakcore',
      label: 'breakcore',
      bpm: 192,
      lanes: { k: lane, s: lane, h: lane, o: lane, t: lane, r: lane, c: lane },
      pool: lane,
    };
  },
  setOverlayBank() {},
};

// ---- assemble window ----------------------------------------------------

const w = {
  setTimeout: setTimeoutMock,
  clearTimeout: clearTimeoutMock,
  setInterval: setIntervalMock,
  clearInterval: clearIntervalMock,
  performance: { now: () => _now * 1000 },
  fetch: async () => { throw new Error('fetch-blocked-in-test'); },
  console,
  ReplEditorPulse,
  SampleVoice,
  StringVoice: noopVoice(),
  SineVoice: noopVoice(),
  PluckVoice: noopVoice(),
  DroneVoice: noopVoice(),
  NoiseVoice: noopVoice(),
  PulseVoice: noopVoice(),
  PianoVoice: noopVoice(),
  InputVoice: noopVoice(),
  VideoVoice: noopVoice(),
  ReplCrush: { connect: (_ctx, sig) => sig },
  ReplGestures: { applyContinuousRandom: () => false },
  ReplTunings: { tuningToRuntime: (t) => t || null, midiToFreq: (m) => 440 * Math.pow(2, (m - 69) / 12) },
  location: { hash: '', pathname: '/', search: '' },
  document: { addEventListener() {}, removeEventListener() {} },
  addEventListener() {},
  removeEventListener() {},
};
w.window = w;

// ---- load real modules into a vm context with our globals --------------
//
// We must use vm.runInContext rather than `new Function` because the
// scheduler calls bare `setInterval(...)` (no `window.` prefix). In a Function
// closure that resolves to Node's *real* setInterval and our mock is bypassed,
// producing a "tick never fires" failure mode in the harness only. Inside a
// vm context we control all globals.

const vmContext = vm.createContext(w);
// `window` inside the sandbox must be the vm context itself, so the IIFE
// `(function(root){...})(window)` sees a root that resolves bare globals
// like `setInterval` on the same object as `window.setInterval`.
vmContext.window = vmContext;
vmContext.globalThis = vmContext;
vmContext.global = vmContext;
function load(filename) {
  const src = fs.readFileSync(path.join(REPL_DIR, filename), 'utf8');
  vm.runInContext(src, vmContext, { filename });
}
load('dsl.js');
load('scheduler.js');
const Dsl = vmContext.ReplDSL;
const Scheduler = vmContext.ReplScheduler;
if (!Dsl || !Scheduler) {
  console.error('FAIL: Dsl/Scheduler missing after load. ReplDSL=', !!Dsl, 'ReplScheduler=', !!Scheduler);
  process.exit(2);
}

// ---- helper: advance simulated audio time and fire timers --------------

function advanceTo(t) {
  while (_now < t - 1e-9) {
    const step = Math.min(0.05, t - _now);
    _now += step;
    // Fire due timers in scheduled order.
    const due = [];
    for (const [id, item] of timers) {
      if (item.fireAt <= _now + 1e-9) {
        due.push([item.fireAt, id, item.fn]);
      }
    }
    due.sort((a, b) => a[0] - b[0]);
    for (const [, id, fn] of due) {
      timers.delete(id);
      try { fn(); } catch (e) { console.warn('timer error', e); }
    }
    if (tickFn) {
      try { tickFn(); } catch (e) { console.warn('tick error', e); throw e; }
    }
  }
}

// ---- per-test runner ----------------------------------------------------

const FAILURES = [];
function check(label, cond, detail) {
  if (cond) {
    console.log('  ok   ' + label);
  } else {
    console.log('  FAIL ' + label + (detail ? '  ' + detail : ''));
    FAILURES.push({ label, detail });
  }
}

function runPatch(patchSrc, simSeconds) {
  // Reset state between cases.
  _now = 0;
  pulses.length = 0;
  timers.clear();
  tickFn = null;
  nextTimerId = 1;

  const parsed = Dsl.parse(patchSrc);
  const errs = (parsed.errors || []).filter((e) => !/tuning catalog/.test(e.message));
  if (errs.length) throw new Error('parse errors: ' + errs.map((e) => e.message).join(' | '));

  const sched = Scheduler.create({ audioCtx, masterBus });
  sched.update(parsed.program);
  sched.start();

  advanceTo(simSeconds);

  // block-position pulses are emitted by dispatchTopSlot for each slot dispatch
  // (audible or silent-advance from `every`). Audible ones carry a finite
  // blockSlotIndex; silent ones carry null + isSilentAdvance=true.
  const positionPulses = pulses.filter((p) => p && p.kind === 'block-position');
  const byOrdinal = new Map();
  for (const p of positionPulses) {
    const ord = Number.isFinite(Number(p.blockOrdinal)) ? Number(p.blockOrdinal) : 0;
    if (!byOrdinal.has(ord)) byOrdinal.set(ord, []);
    byOrdinal.get(ord).push(p);
  }
  return { program: parsed.program, byOrdinal };
}

// Universe of tests: each names the patch, the per-block expected slot set
// (slots that should fire at least once during the simulated window), and
// total simulation seconds.

const TESTS = [
  {
    name: 'simple drum k/s pattern, 8 slots, 2 bars at tempo 120',
    patch: `
tempo 120
meter 4/4
drum k . k . | k k . k
kit breakcore
`,
    sim: 6,
    expected: [{ ord: 0, slots: [0, 2, 4, 5, 7] }],
  },
  {
    name: 'drum with enter — last slot of each cycle still fires',
    patch: `
tempo 120
meter 4/4
eval reset
drum k . k . | k k . k
kit breakcore
enter 2 bars
`,
    sim: 12,
    expected: [{ ord: 0, slots: [0, 2, 4, 5, 7] }],
  },
  {
    name: 'drum with every — last slot of pattern still fires inside cycle',
    patch: `
tempo 120
meter 4/4
drum k . k . | k k . k
kit breakcore
every 4 bars
`,
    sim: 12,
    expected: [{ ord: 0, slots: [0, 2, 4, 5, 7] }],
  },
  {
    name: 'breakcore-style staged build with enter offsets at varied tempo',
    patch: `
tempo 96
meter 4/4
eval reset

drum k . k . | k k . k
kit breakcore

drum . s . s | . s . s
kit breakcore
enter 2 bars

drum h h h h | h h h h
kit breakcore
enter 4 bars
`,
    sim: 30,
    expected: [
      { ord: 0, slots: [0, 2, 4, 5, 7] },
      { ord: 1, slots: [1, 3, 5, 7] },
      { ord: 2, slots: [0, 1, 2, 3, 4, 5, 6, 7] },
    ],
  },
  {
    name: 'string scale — every note (last A5) must fire',
    patch: `
tempo 120
meter 4/4
string A4 B4 C5 D5 E5 F5 G5 A5
`,
    sim: 4,
    expected: [{ ord: 0, slots: [0, 1, 2, 3, 4, 5, 6, 7] }],
  },
];

console.log('dispatch-fires-all-slots');
for (const test of TESTS) {
  console.log('\n· ' + test.name);
  const { byOrdinal } = runPatch(test.patch.trim(), test.sim);

  for (const exp of test.expected) {
    const blockPulses = byOrdinal.get(exp.ord) || [];
    const audibleSlots = new Set();
    for (const p of blockPulses) {
      if (p.isSilentAdvance) continue;
      const idx = Number(p.blockSlotIndex);
      if (Number.isFinite(idx) && idx >= 0) audibleSlots.add(idx);
    }
    for (const slot of exp.slots) {
      check(
        `block#${exp.ord} slot ${slot} fired`,
        audibleSlots.has(slot),
        `(saw ${[...audibleSlots].sort((a, b) => a - b).join(',') || 'none'})`,
      );
    }

    // The contract: the LAST slot of the pattern is the one most likely to be
    // dropped. Call it out explicitly even if covered above.
    const last = exp.slots[exp.slots.length - 1];
    check(
      `block#${exp.ord} LAST slot (${last}) fired`,
      audibleSlots.has(last),
    );
  }
}

if (FAILURES.length) {
  console.log('\n' + FAILURES.length + ' check(s) FAILED');
  process.exit(1);
}
console.log('\nall checks passed');
