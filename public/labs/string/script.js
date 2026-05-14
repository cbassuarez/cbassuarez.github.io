(() => {
  'use strict';

  // ---------- config ----------
  const PROD_API = 'https://seb-feed.cbassuarez.workers.dev';
  const params = new URLSearchParams(location.search);
  const API_BASE = (params.get('api') || PROD_API).replace(/\/+$/, '');

  const N = 720;
  const SIM_HZ = 120;
  const SIM_STEP_MS = 1000 / SIM_HZ;
  const MAX_SIM_STEPS_PER_FRAME = 10;
  const REFLECT_BASE = 0.928;

  const HEARTBEAT_INTERVAL_MS = 2_500;
  const PHANTOM_DELAY_MS = 240;
  const REMOTE_CURSOR_STALE_MS = 6_000;
  const SIM_GC_INTERVAL_MS = 5_000;
  const SOCKET_INITIAL_BACKOFF_MS = 800;
  const SOCKET_MAX_BACKOFF_MS = 15_000;
  const SOCKET_PING_INTERVAL_MS = 25_000;
  const SOCKET_SEND_QUEUE_MAX = 64;

  const PITCH_LOW_HZ = 41.2; // E1 (bass guitar low E)
  const PITCH_HIGH_HZ = 1046.5; // C6
  const VOICE_ATTACK_S = 0.030;
  const DECAY_FLOOR = 0.0005; // -66 dB target for both audio + visual

  const BG = (() => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (v) return v;
    } catch (_) {}
    return '#ffffff';
  })();
  const STRING_AMP_FRAC = 0.12;       // per-string vertical amplitude (frac of viewH)
  const Y_LANE_RANGE = 0.20;          // total ±range of y-offsets (frac of viewH)
  const EDGE_PLUCK_FLOOR = 0.28;      // edge plucks never fully mute, but are weaker
  const REFERENCE_VIEWPORT_AREA = 1366 * 768;

  // ---------- canvas ----------
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  let dpr = 1, viewW = 0, viewH = 0;
  const helpDialog = document.getElementById('string-help-dialog');
  const helpOpenButton = document.getElementById('string-help-open');
  const presenceText = document.getElementById('presence-text');
  const HELP_SEEN_KEY = 'prae:string:help:refined:v1';

  function resize() {
    dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0.5;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  function clamp(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return n < min ? min : n > max ? max : n;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function viewportImpactScale() {
    const area = Math.max(1, viewW * viewH);
    // Gentle, sub-linear growth: laptops stay near 1.0, large desktops get a lift.
    return clamp(Math.pow(area / REFERENCE_VIEWPORT_AREA, 0.20), 1.0, 1.42);
  }

  function markHelpSeen() {
    try {
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch (_) {}
  }

  function openHelpDialog() {
    if (!helpDialog || helpDialog.open) return;
    if (typeof helpDialog.showModal === 'function') {
      helpDialog.showModal();
      return;
    }
    helpDialog.setAttribute('open', '');
  }

  if (helpOpenButton) helpOpenButton.addEventListener('click', openHelpDialog);
  if (helpDialog) {
    helpDialog.addEventListener('close', markHelpSeen);
    helpDialog.addEventListener('cancel', markHelpSeen);
    const dismissHelpButton = helpDialog.querySelector('[data-close-help]');
    if (dismissHelpButton) dismissHelpButton.addEventListener('click', markHelpSeen);
  }

  const forceHelp = params.get('help') === '1';
  let seenHelp = false;
  try {
    seenHelp = localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch (_) {}
  if (forceHelp || !seenHelp) openHelpDialog();

  // ---------- identity (deterministic per `who` hash) ----------
  // Curated palette of 24 colors that all read clearly on a warm-white field.
  // Saturated enough to identify; not so bright they vibrate.
  // Strong chromatic spectrum on a white field — high saturation, value tuned
  // for legibility. No muted earth tones (espresso/mauve/eggplant/slate/walnut),
  // no magenta. Roughly: crimson → vermilion → orange → amber → yellow → lime
  // → green → teal → cyan → blue → indigo → violet.
  const PALETTE = [
    [212,  30,  50],  // crimson
    [232,  60,  35],  // red
    [238, 100,  25],  // vermilion
    [240, 138,  18],  // orange
    [228, 175,  18],  // amber
    [205, 188,  22],  // yellow
    [150, 188,  35],  // lime
    [55,  172,  68],  // green
    [22,  160, 110],  // emerald
    [18,  158, 168],  // teal
    [30,  138, 205],  // cyan
    [28,   92, 198],  // blue
    [68,   60, 195],  // indigo
    [120,  55, 200],  // violet
  ];

  // Each user's hash → a unique set of: color (palette idx), y-lane, thickness,
  // tightness profile (visual + physical + sonic), decaySec, octave shift,
  // harmonic mode, detune, bitcrush bit-depth.
  function deriveIdentity(who) {
    const h = (typeof who === 'string' && who.length >= 12) ? who : '00000000000000000000';
    const a = parseInt(h.slice(0, 4), 16) || 0;
    const b = parseInt(h.slice(4, 8), 16) || 0;
    const c = parseInt(h.slice(8, 12), 16) || 0;

    const colorRGB     = PALETTE[a % PALETTE.length];
    const yOffset      = (((b & 0xFF) / 255) - 0.5) * 2 * Y_LANE_RANGE;
    const thickness    = 1.5 + (((b >> 8) & 0x07) / 7) * 4.0;       // 1.5 .. 5.5 px
    // tightness controls transport speed, visual displacement, decay, and tone.
    const tightness01  = ((c >> 5) & 0x1F) / 31;
    const slack01      = 1 - tightness01;
    const adv          = 0.34 + tightness01 * 0.62;                  // 0.34 .. 0.96
    const ampScale     = 2.4 - tightness01 * 2.0;                    // 2.4 (slack) .. 0.4 (taut)
    const pluckAmp     = 0.50 + slack01 * 0.90;                      // 0.50 .. 1.40
    const pluckWidth   = 0.55 + slack01 * 1.25;                      // 0.55 .. 1.80
    const toneBright   = 0.22 + tightness01 * 0.78;                  // 0.22 .. 1.00
    const decaySec     = 2.1 + ((c & 0x1F) / 31) * 4.2;              // 2.1 .. 6.3 s
    const damping      = Math.pow(DECAY_FLOOR, 1 / (decaySec * SIM_HZ));
    const reflectLoss  = clamp(REFLECT_BASE + tightness01 * 0.055, 0.90, 0.995);
    const bridgeCouple = 0.0007 + slack01 * 0.0008;

    // Sound variation tables — uniform, no zero-bias.
    const octaveTable    = [-2, -1, -1, 0, 0, +1, +1, +2];
    const octaveShift    = octaveTable[(c >> 10) & 7];
    const harmonicTable  = [0, 1, 2, 3, 4, 1, 2, 3];
    const harmonicMode   = harmonicTable[(c >> 13) & 7];
    const detuneCents    = ((((a >> 8) & 0xFF) / 255) - 0.5) * 40;   // ±20 cents
    const crushTable     = [0, 4, 6, 8, 10, 12, 14, 16];
    const bitcrushBits   = crushTable[(a >> 4) & 7];

    return {
      colorRGB, yOffset, thickness, tightness01, ampScale, pluckAmp, pluckWidth, toneBright, decaySec, damping, adv, reflectLoss, bridgeCouple,
      octaveShift, harmonicMode, detuneCents, bitcrushBits,
    };
  }

  // ---------- per-user simulation registry ----------
  const sims = new Map(); // who -> UserSim
  function getSim(who) {
    if (!who) return null;
    let sim = sims.get(who);
    if (!sim) {
      sim = {
        who,
        identity: deriveIdentity(who),
        wL: new Float32Array(N),
        wR: new Float32Array(N),
        prevPos: new Float32Array(N),
        pos: new Float32Array(N),
        lastActiveT: Date.now(),
        activityEnergy: 0,
        cursorX: 0.5,
        cursorAt: Date.now(),
      };
      sims.set(who, sim);
    }
    return sim;
  }

  function stepSim(sim) {
    const { wL, wR, pos, prevPos, identity } = sim;
    const adv = identity.adv;
    const damp = identity.damping;
    const reflectAt0   = -wL[0]      * identity.reflectLoss;
    const reflectAtEnd = -wR[N - 1]  * identity.reflectLoss;
    for (let i = 0; i < N; i++) prevPos[i] = pos[i];
    for (let i = N - 1; i > 0; i--) wR[i] = (1 - adv) * wR[i] + adv * wR[i - 1];
    wR[0] = (1 - adv) * wR[0] + adv * reflectAt0;
    for (let i = 0; i < N - 1; i++) wL[i] = (1 - adv) * wL[i] + adv * wL[i + 1];
    wL[N - 1] = (1 - adv) * wL[N - 1] + adv * reflectAtEnd;
    for (let i = 0; i < N; i++) {
      wL[i] *= damp;
      wR[i] *= damp;
      pos[i] = wL[i] + wR[i];
    }
    // RMS-ish energy estimate for lane-cap brightness (decays each step).
    let energy = 0;
    for (let i = 40; i < N; i += 60) energy += pos[i] * pos[i];
    sim.activityEnergy = clamp(
      Math.max(sim.activityEnergy * 0.96, Math.sqrt(energy) * 0.6),
      0,
      1
    );
  }

  function edgeExcitationGain(x01) {
    const center01 = 1 - Math.abs(clamp01(x01) - 0.5) * 2;
    return EDGE_PLUCK_FLOOR + (1 - EDGE_PLUCK_FLOOR) * center01;
  }

  function exciteSim(sim, pluck) {
    const { wL, wR, identity } = sim;
    const x01 = clamp01(pluck?.x01);
    const y01 = clamp01(pluck?.y01);
    const force01 = clamp01(pluck?.force01);
    const width01 = clamp01(pluck?.width01);
    const sign = (pluck?.sign || 1) < 0 ? -1 : 1;
    const edgeGain = edgeExcitationGain(x01);
    const viewportBoost = viewportImpactScale();
    const center = Math.max(2, Math.min(N - 3, Math.floor(x01 * (N - 1))));
    const widthSamples = Math.max(6, Math.min(96, Math.round((8 + y01 * 30) * identity.pluckWidth * (0.70 + width01 * 0.70))));
    const sigma = Math.max(1, widthSamples * 0.5);
    const sigma2 = sigma * sigma;
    const strikeAmp = sign * edgeGain * (0.90 + force01 * 0.60) * identity.pluckAmp * viewportBoost;
    for (let k = -widthSamples; k <= widthSamples; k++) {
      const idx = center + k;
      if (idx <= 0 || idx >= N - 1) continue;
      const g = Math.exp(-(k * k) / (2 * sigma2));
      const f = 0.5 * strikeAmp * g;
      wL[idx] += f;
      wR[idx] += f;
    }
    for (let i = 1; i < N - 1; i++) {
      wL[i] = clamp(wL[i], -2.8, 2.8);
      wR[i] = clamp(wR[i], -2.8, 2.8);
    }
    sim.lastActiveT = Date.now();
    sim.activityEnergy = 1;
  }

  // ---------- sympathetic coupling (bridge-mediated cross-string exchange) ----------
  // Strings couple through a shared "bridge" drive estimate (velocity near ends),
  // then receive lane-distance-weighted bleed from neighbors.
  const COUPLING_LANE_FALLOFF = 25; // larger = steeper drop with lane distance
  const BRIDGE_TAP_LEFT = 2;
  const BRIDGE_TAP_RIGHT = N - 3;

  function couplingStep() {
    const count = sims.size;
    if (count <= 1) return;

    // First pass: estimate per-string bridge velocity.
    let globalBridgeWeighted = 0;
    let globalBridgeWeight = 0;
    for (const sim of sims.values()) {
      const vL = sim.wR[BRIDGE_TAP_LEFT] - sim.wL[BRIDGE_TAP_LEFT];
      const vR = sim.wL[BRIDGE_TAP_RIGHT] - sim.wR[BRIDGE_TAP_RIGHT];
      const bridgeV = 0.5 * (vL + vR);
      sim.bridgeV = bridgeV;
      const weight = Math.abs(bridgeV) + 0.02;
      globalBridgeWeighted += bridgeV * weight;
      globalBridgeWeight += weight;
    }
    const globalBridge = globalBridgeWeight > 0 ? (globalBridgeWeighted / globalBridgeWeight) : 0;

    // Second pass: inject a subtle bridge-normalized coupling drive.
    for (const simA of sims.values()) {
      const yA = simA.identity.yOffset;
      let neighborDrive = 0;
      let totalW = 0;
      for (const simB of sims.values()) {
        if (simB === simA) continue;
        const dy = yA - simB.identity.yOffset;
        const w = 1 / (1 + COUPLING_LANE_FALLOFF * dy * dy);
        totalW += w;
        neighborDrive += w * (simB.bridgeV - simA.bridgeV);
      }
      if (totalW <= 0) continue;
      const laneDrive = neighborDrive / totalW;
      const roomDrive = 0.25 * (globalBridge - simA.bridgeV);
      const drive = laneDrive + roomDrive;
      const impulse = simA.identity.bridgeCouple * drive;
      if (Math.abs(impulse) < 1e-6) continue;
      simA.wL[BRIDGE_TAP_LEFT] += impulse;
      simA.wR[BRIDGE_TAP_LEFT] += impulse;
      simA.wL[BRIDGE_TAP_RIGHT] += impulse;
      simA.wR[BRIDGE_TAP_RIGHT] += impulse;
    }
  }

  function gcSims() {
    const now = Date.now();
    for (const [who, sim] of sims) {
      if (who === myWho) continue;
      if (now - sim.cursorAt <= REMOTE_CURSOR_STALE_MS) continue;
      sims.delete(who);
    }
  }
  setInterval(gcSims, SIM_GC_INTERVAL_MS);

  // ---------- audio ----------
  let audioCtx = null;
  let masterBus = null;
  const _bitcrushCurves = new Map();

  function getBitcrushCurve(bits) {
    if (_bitcrushCurves.has(bits)) return _bitcrushCurves.get(bits);
    const samples = 8192;
    const curve = new Float32Array(samples);
    const levels = Math.pow(2, bits);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.round(x * levels) / levels;
    }
    _bitcrushCurves.set(bits, curve);
    return curve;
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 8;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;
    masterBus = audioCtx.createGain();
    masterBus.gain.value = 0.45;
    masterBus.connect(compressor);
    compressor.connect(audioCtx.destination);
    return audioCtx;
  }

  function playPluck(x01, y01, who, gain, pluck = null) {
    if (!ensureAudio()) return;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    x01 = clamp01(x01);
    y01 = clamp01(y01);
    const force01 = clamp01(pluck?.force01);
    const speed01 = clamp01(pluck?.speed01);
    const id = deriveIdentity(who);
    const baseFreq = PITCH_LOW_HZ * Math.pow(PITCH_HIGH_HZ / PITCH_LOW_HZ, x01);
    const freq = baseFreq * Math.pow(2, id.octaveShift) * Math.pow(2, id.detuneCents / 1200);
    const now = audioCtx.currentTime;
    const edgeGain = edgeExcitationGain(x01);
    const pickBrightness = clamp(0.45 + Math.abs(x01 - 0.5) * 1.2 + force01 * 0.35, 0.2, 1.55);

    const decaySec = id.decaySec;
    const env = audioCtx.createGain();
    const attackSec = VOICE_ATTACK_S * (1.48 - id.toneBright * 0.75 - speed01 * 0.35);
    const gainScale = clamp(gain * (0.68 + edgeGain * 0.42 + force01 * 0.26 + speed01 * 0.20), 0, 1.25);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gainScale * 0.40, now + Math.max(0.003, attackSec));
    env.gain.exponentialRampToValueAtTime(DECAY_FLOOR, now + decaySec);

    function addPartial(f, partialGain, harmonicN) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      const pg = audioCtx.createGain();
      const pickMode = 0.20 + 0.80 * Math.abs(Math.sin(Math.PI * harmonicN * x01));
      pg.gain.value = partialGain * pickMode;
      osc.connect(pg).connect(env);
      osc.start(now);
      osc.stop(now + decaySec + 0.05);
    }
    addPartial(freq, 1, 1);
    if (id.harmonicMode >= 1) addPartial(freq * 2, 0.12 + pickBrightness * 0.22, 2);
    if (id.harmonicMode >= 2) addPartial(freq * 3, 0.04 + pickBrightness * 0.18, 3);
    if (id.harmonicMode >= 3) addPartial(freq * 4, 0.02 + pickBrightness * 0.14, 4);
    if (id.harmonicMode >= 4) addPartial(freq * 5, 0.01 + pickBrightness * 0.10, 5);

    let signal = env;
    if (id.bitcrushBits > 0) {
      const shaper = audioCtx.createWaveShaper();
      shaper.curve = getBitcrushCurve(id.bitcrushBits);
      env.connect(shaper);
      signal = shaper;
    }

    const tone = audioCtx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(900 + (id.toneBright * 6200 + pickBrightness * 2500), now);
    tone.Q.setValueAtTime(0.65 + id.toneBright * 1.8 + force01 * 0.8, now);
    signal.connect(tone);
    signal = tone;

    if (audioCtx.createStereoPanner) {
      const pan = audioCtx.createStereoPanner();
      pan.pan.setValueAtTime((x01 - 0.5) * 1.4, now);
      signal.connect(pan);
      signal = pan;
    }
    signal.connect(masterBus);
  }

  // ---------- identity bootstrap (stable across reloads) ----------
  function randomWho() {
    const chars = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * 16)];
    return s;
  }
  function loadOrCreateWho() {
    const forceNewWho = params.get('newwho') === '1';
    try {
      if (!forceNewWho) {
        const saved = localStorage.getItem('prae:string:who');
        if (saved && /^[0-9a-f]{12}$/.test(saved)) return saved;
      }
    } catch (_) {}
    const w = randomWho();
    try { localStorage.setItem('prae:string:who', w); } catch (_) {}
    return w;
  }

  // ---------- network ----------
  let myWho = loadOrCreateWho();
  getSim(myWho); // spawn the local string immediately, before any network
  let myCursorX = 0.5;

  function createPluckModel(x01, y01, detail) {
    const force01 = clamp01(detail?.force01);
    const pull01 = clamp01(detail?.pull01);
    const speed01 = clamp01(detail?.speed01);
    const width01 = clamp01(
      Number.isFinite(detail?.width01)
        ? detail.width01
        : (0.45 + (1 - force01) * 0.25)
    );
    const sign = (detail?.sign || 1) < 0 ? -1 : 1;
    return { x01: clamp01(x01), y01: clamp01(y01), force01, pull01, speed01, width01, sign };
  }

  function applyPluckForWho(who, pluck, gain) {
    const sim = getSim(who);
    if (sim) exciteSim(sim, pluck);
    playPluck(pluck.x01, pluck.y01, who, gain, pluck);
    triggerSympathetic(who, pluck.x01, pluck.y01, pluck);
  }

  function scheduleRemotePluck(p) {
    setTimeout(() => {
      const pluck = createPluckModel(p.x, p.y, {
        force01: p.force,
        pull01: p.pull,
        speed01: p.speed,
        width01: p.width,
        sign: p.sign,
      });
      applyPluckForWho(p.who, pluck, 0.78);
    }, PHANTOM_DELAY_MS);
  }

  // ---------- websocket client ----------
  const SOCKET_URL = (() => {
    let base = API_BASE;
    try {
      const u = new URL(API_BASE);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      base = u.origin.replace(/\/+$/, '');
    } catch (_) {
      base = API_BASE.replace(/^http(s?):\/\//i, (_, s) => (s ? 'wss://' : 'ws://'));
    }
    return base + '/api/string/socket?who=' + encodeURIComponent(myWho);
  })();

  let socket = null;
  let socketConnected = false;
  let socketBackoffMs = SOCKET_INITIAL_BACKOFF_MS;
  let reconnectTimer = null;
  let pingTimer = null;
  let heartbeatTimer = null;
  const pendingMessages = [];

  function enqueue(message) {
    if (pendingMessages.length >= SOCKET_SEND_QUEUE_MAX) {
      pendingMessages.splice(0, pendingMessages.length - SOCKET_SEND_QUEUE_MAX + 1);
    }
    pendingMessages.push(message);
  }

  function flushPending() {
    if (!socketConnected || !socket || socket.readyState !== 1) return;
    while (pendingMessages.length > 0) {
      const json = pendingMessages.shift();
      try {
        socket.send(json);
      } catch (_) {
        pendingMessages.unshift(json);
        return;
      }
    }
  }

  function sendOrQueue(payload) {
    let json;
    try { json = JSON.stringify(payload); } catch (_) { return; }
    if (socketConnected && socket && socket.readyState === 1) {
      try { socket.send(json); return; } catch (_) {}
    }
    enqueue(json);
  }

  function sendPluck(pluck) {
    sendOrQueue({
      type: 'pluck',
      x: pluck.x01,
      y: pluck.y01,
      force: pluck.force01,
      pull: pluck.pull01,
      speed: pluck.speed01,
      width: pluck.width01,
      sign: pluck.sign,
    });
  }

  function sendCursor(x01) {
    sendOrQueue({ type: 'cursor', x: clamp01(x01) });
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
      if (!socket || socket.readyState !== 1) return;
      try { socket.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (_) {}
    }, SOCKET_PING_INTERVAL_MS);
  }
  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;
    function tick() {
      sendCursor(myCursorX);
      heartbeatTimer = setTimeout(tick, HEARTBEAT_INTERVAL_MS);
    }
    tick();
  }
  function stopHeartbeat() {
    if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
  }

  function ingestHello(msg) {
    if (Array.isArray(msg.cursors)) {
      for (const c of msg.cursors) {
        if (!c || !c.who || c.who === myWho) continue;
        const sim = getSim(c.who);
        if (!sim) continue;
        sim.cursorX = clamp01(c.x);
        sim.cursorAt = Date.now();
      }
    }
    // Replay only very recent plucks to give the joiner a sense of the current
    // texture without a thunderclap of stale events. Anything older than ~1.5s
    // is silently dropped.
    if (Array.isArray(msg.plucks) && Number.isFinite(msg.serverNow)) {
      const recencyCutoff = msg.serverNow - 1500;
      for (const p of msg.plucks) {
        if (!p || !p.who || p.who === myWho) continue;
        const t = Number(p.t);
        if (!Number.isFinite(t) || t < recencyCutoff) continue;
        scheduleRemotePluck(p);
      }
    }
  }

  function handleSocketMessage(raw) {
    let msg = null;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : ''); } catch (_) { return; }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'hello':
        ingestHello(msg);
        return;
      case 'pluck':
        if (msg.who && msg.who !== myWho) scheduleRemotePluck(msg);
        return;
      case 'cursor': {
        if (!msg.who || msg.who === myWho) return;
        const sim = getSim(msg.who);
        if (!sim) return;
        sim.cursorX = clamp01(msg.x);
        sim.cursorAt = Date.now();
        return;
      }
      case 'leave':
        if (msg.who && msg.who !== myWho) {
          const sim = sims.get(msg.who);
          if (sim) sim.cursorAt = 0;
        }
        return;
      case 'pong':
      case 'join':
      default:
        return;
    }
  }

  function connectSocket() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    let ws;
    try {
      ws = new WebSocket(SOCKET_URL);
    } catch (_) {
      scheduleReconnect();
      return;
    }
    socket = ws;
    socketConnected = false;

    ws.addEventListener('open', () => {
      if (ws !== socket) return;
      socketConnected = true;
      socketBackoffMs = SOCKET_INITIAL_BACKOFF_MS;
      flushPending();
      startPing();
      // Refresh cursor immediately so others see us at our current position.
      sendCursor(myCursorX);
    });
    ws.addEventListener('message', (e) => {
      if (ws !== socket) return;
      handleSocketMessage(e.data);
    });
    ws.addEventListener('close', () => {
      if (ws !== socket) return;
      socketConnected = false;
      stopPing();
      socket = null;
      scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      // The 'close' event fires next; the cleanup happens there.
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(SOCKET_MAX_BACKOFF_MS, socketBackoffMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      socketBackoffMs = Math.min(SOCKET_MAX_BACKOFF_MS, Math.max(SOCKET_INITIAL_BACKOFF_MS, socketBackoffMs * 1.7));
      connectSocket();
    }, delay);
  }

  function teardownSocket() {
    stopPing();
    if (socket) {
      try { socket.close(1000, 'page hidden'); } catch (_) {}
      socket = null;
    }
    socketConnected = false;
  }

  // ---------- audible sympathetic echo ----------
  // When any string is plucked, fire a low-amplitude voice on every other
  // recently-active string in *that* string's identity. The whisper of the
  // room's tonal palette tracks the visual coupling — what you see ringing
  // sympathetically also sounds.
  const SYMPATHETIC_GAIN = 0.14;
  const SYMPATHETIC_MAX = 6;
  const SYMPATHETIC_RECENT_MS = 30_000;
  const SYMPATHETIC_DELAY_MIN = 60;
  const SYMPATHETIC_DELAY_JITTER = 90;
  const SYMPATHETIC_VISUAL_DELAY_MIN = 20;
  const SYMPATHETIC_VISUAL_DELAY_JITTER = 130;

  // Visible sympathy threads — short-lived dotted arcs drawn over the strings.
  // Populated by triggerSympathetic, consumed by renderSympathyThread each frame.
  const sympathyThreads = []; // { fromWho, toWho, x01, t0, life, weight }

  function injectBridgeImpulse(sim, impulse) {
    if (!sim || !Number.isFinite(impulse)) return;
    // Couple into the bridge taps (not the pluck point) so sympathetic motion
    // arrives as a room/structure response, not an exact mirrored gesture.
    for (const tap of [BRIDGE_TAP_LEFT, BRIDGE_TAP_RIGHT]) {
      for (let o = -2; o <= 2; o++) {
        const idx = tap + o;
        if (idx <= 0 || idx >= N - 1) continue;
        const falloff = 1 / (1 + 1.2 * o * o);
        const f = impulse * falloff * (0.85 + Math.random() * 0.30);
        sim.wL[idx] += f;
        sim.wR[idx] += f;
      }
    }
    sim.lastActiveT = Date.now();
  }

  function triggerSympathetic(sourceWho, x01, y01, pluck) {
    const now = Date.now();
    const sourceSim = sims.get(sourceWho);
    const sourceLane = sourceSim ? sourceSim.identity.yOffset : 0;
    const sourceSign = (pluck?.sign || 1) < 0 ? -1 : 1;
    const sourceForce = clamp01(pluck?.force01);
    const candidates = [];
    for (const [w, sim] of sims) {
      if (w === sourceWho) continue;
      const age = now - sim.lastActiveT;
      if (age > SYMPATHETIC_RECENT_MS) continue;
      const dy = sourceLane - sim.identity.yOffset;
      const laneWeight = 1 / (1 + 28 * dy * dy);
      const ageWeight = 1 - age / SYMPATHETIC_RECENT_MS;
      const weight = laneWeight * ageWeight;
      candidates.push({ w, age, weight });
    }
    candidates.sort((a, b) => b.weight - a.weight);
    const limit = Math.min(candidates.length, SYMPATHETIC_MAX);
    for (let i = 0; i < limit; i++) {
      const { w, weight } = candidates[i];
      const targetSim = sims.get(w);
      if (!targetSim) continue;

      const visualImpulse = sourceSign
        * (0.00055 + sourceForce * 0.00105)
        * (0.35 + 0.65 * weight);
      const visualDelay = SYMPATHETIC_VISUAL_DELAY_MIN + Math.random() * SYMPATHETIC_VISUAL_DELAY_JITTER;
      setTimeout(() => {
        const liveTarget = sims.get(w);
        if (!liveTarget) return;
        injectBridgeImpulse(liveTarget, visualImpulse);
      }, visualDelay);

      // queue a visible sympathy thread, aligned with the impulse fire time
      sympathyThreads.push({
        fromWho: sourceWho,
        toWho: w,
        x01,
        t0: performance.now() + visualDelay,
        life: 900 + 400 * weight,
        weight,
      });

      const sympatheticPluck = createPluckModel(x01, y01, {
        force01: 0.12 + clamp01(pluck?.force01) * 0.22,
        pull01: 0.08 + clamp01(pluck?.pull01) * 0.18,
        speed01: 0.06 + clamp01(pluck?.speed01) * 0.12,
        width01: 0.22 + clamp01(pluck?.width01) * 0.26,
        sign: pluck?.sign || 1,
      });
      const delay = SYMPATHETIC_DELAY_MIN + Math.random() * SYMPATHETIC_DELAY_JITTER;
      const gain = SYMPATHETIC_GAIN * (0.35 + 0.65 * weight);
      setTimeout(() => playPluck(x01, y01, w, gain, sympatheticPluck), delay);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopHeartbeat();
      teardownSocket();
    } else {
      connectSocket();
      startHeartbeat();
    }
  });
  window.addEventListener('pagehide', () => {
    stopHeartbeat();
    teardownSocket();
  });
  window.addEventListener('online', () => {
    if (!socket || socket.readyState > 1) {
      socketBackoffMs = SOCKET_INITIAL_BACKOFF_MS;
      connectSocket();
    }
  });

  // ---------- input ----------
  let safariForce01 = 0;

  function readWebkitForce01(e) {
    const wf = Number(e?.webkitForce);
    if (!Number.isFinite(wf) || wf <= 0) return 0;
    const down = Number(window.MouseEvent?.WEBKIT_FORCE_AT_MOUSE_DOWN);
    const forceDown = Number(window.MouseEvent?.WEBKIT_FORCE_AT_FORCE_MOUSE_DOWN);
    if (Number.isFinite(down) && Number.isFinite(forceDown) && forceDown > down) {
      return clamp01((wf - down) / (forceDown - down));
    }
    return clamp01((wf - 1) / 2);
  }

  function readPointerForce01(e) {
    const p = Number(e?.pressure);
    let force01 = 0;
    if (Number.isFinite(p) && p > 0) {
      // Mouse often reports 0.5 while pressed even without real pressure sensing.
      if (!(e?.pointerType === 'mouse' && p === 0.5)) force01 = clamp01(p);
    }
    const webkitForce01 = readWebkitForce01(e);
    if (webkitForce01 > 0) force01 = Math.max(force01, webkitForce01);
    if (force01 <= 0 && safariForce01 > 0) force01 = safariForce01;
    // Non-pressure device fallback while actively pressed.
    if (force01 <= 0 && e?.buttons) force01 = 0.18;
    return clamp01(force01);
  }

  function pluckLocalTap(e) {
    const x01 = clamp01(e.clientX / viewW);
    const y01 = clamp01(e.clientY / viewH);
    const force01 = readPointerForce01(e);
    const pluck = createPluckModel(x01, y01, {
      force01,
      width01: 0.48 + (1 - force01) * 0.22,
      sign: Math.random() < 0.5 ? -1 : 1,
    });
    myCursorX = x01;
    applyPluckForWho(myWho, pluck, 0.92);
    sendPluck(pluck);
    sendCursor(x01);
  }

  canvas.addEventListener('webkitmouseforcechanged', (e) => {
    safariForce01 = readWebkitForce01(e);
  }, { passive: true });

  canvas.addEventListener('pointermove', (e) => {
    myCursorX = clamp01(e.clientX / viewW);
  }, { passive: true });

  canvas.addEventListener('pointerdown', (e) => {
    if (!ensureAudio()) return;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    pluckLocalTap(e);
  }, { passive: true });

  // ---------- render (refined: paper-instrument feel) ----------
  // Strings render as real wires: amplitude-modulated thickness, hairline
  // shadow, gentle inner highlight, gradient along length. Lane-end caps
  // brighten with activity. Sympathy threads are thin dotted arcs.

  function renderSim(sim, ampPx, interpAlpha, fadeIn) {
    const { pos, prevPos, identity, who } = sim;
    const yMid = (0.5 + identity.yOffset) * viewH;
    const isSelf = who === myWho;
    const [r, g, b] = identity.colorRGB;
    const energy = sim.activityEnergy || 0;
    const baseAlpha = (isSelf ? 1.0 : 0.62) * fadeIn;

    // peak amplitude this frame → thickness modulation
    let peak = 0;
    for (let i = 40; i < N - 40; i += 24) {
      const v = Math.abs(lerp(prevPos[i], pos[i], interpAlpha));
      if (v > peak) peak = v;
    }
    const breathe = Math.min(peak * 1.2, 1);
    const thicknessNow = identity.thickness * (1 + breathe * 0.55) * (isSelf ? 1.45 : 1);

    const a = ampPx * identity.ampScale;
    const yAt = (i) => yMid + lerp(prevPos[i], pos[i], interpAlpha) * a;

    function buildPath() {
      ctx.beginPath();
      ctx.moveTo(0, yAt(0));
      for (let i = 1; i < N - 1; i++) {
        const x = (i / (N - 1)) * viewW;
        const y = yAt(i);
        const nx = ((i + 1) / (N - 1)) * viewW;
        const ny = yAt(i + 1);
        ctx.quadraticCurveTo(x, y, 0.5 * (x + nx), 0.5 * (y + ny));
      }
      ctx.lineTo(viewW, yAt(N - 1));
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. hairline shadow underneath
    ctx.save();
    ctx.translate(0, 1.2);
    buildPath();
    ctx.lineWidth = thicknessNow * 0.92;
    ctx.strokeStyle = `rgba(20,20,28,${0.09 * fadeIn})`;
    ctx.stroke();
    ctx.restore();

    // 2. self outline (very subtle)
    if (isSelf) {
      buildPath();
      ctx.lineWidth = thicknessNow + 1.6;
      ctx.strokeStyle = `rgba(0,0,0,${0.18 * fadeIn})`;
      ctx.stroke();
    }

    // 3. main stroke with gradient (pickup → bridge)
    buildPath();
    const grad = ctx.createLinearGradient(0, 0, viewW, 0);
    const dim = `rgba(${r},${g},${b},${(baseAlpha * 0.78).toFixed(3)})`;
    const full = `rgba(${r},${g},${b},${baseAlpha.toFixed(3)})`;
    grad.addColorStop(0, dim);
    grad.addColorStop(0.5, full);
    grad.addColorStop(1, dim);
    ctx.lineWidth = thicknessNow;
    ctx.strokeStyle = grad;
    ctx.stroke();

    // 4. inner highlight — thinner, lighter top-edge wire
    if (thicknessNow > 2.2) {
      ctx.save();
      ctx.translate(0, -thicknessNow * 0.22);
      buildPath();
      ctx.lineWidth = Math.max(0.6, thicknessNow * 0.38);
      ctx.strokeStyle = `rgba(255,255,255,${0.30 * fadeIn})`;
      ctx.globalCompositeOperation = 'lighter';
      ctx.stroke();
      ctx.restore();
    }

    // 5. lane-end caps — brighten with activity
    const capR = 3 + energy * 4;
    const capAlpha = (0.45 + energy * 0.55) * fadeIn;
    ctx.fillStyle = `rgba(${r},${g},${b},${capAlpha})`;
    ctx.beginPath();
    ctx.arc(8, yMid, capR, 0, Math.PI * 2);
    ctx.arc(viewW - 8, yMid, capR, 0, Math.PI * 2);
    ctx.fill();
    if (energy > 0.1) {
      ctx.fillStyle = `rgba(${r},${g},${b},${0.18 * energy * fadeIn})`;
      ctx.beginPath();
      ctx.arc(8, yMid, capR + 6, 0, Math.PI * 2);
      ctx.arc(viewW - 8, yMid, capR + 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderSympathyThread(thread, nowMs, fadeIn) {
    const fromSim = sims.get(thread.fromWho);
    const toSim = sims.get(thread.toWho);
    if (!fromSim || !toSim) return;
    const age = nowMs - thread.t0;
    if (age < 0 || age > thread.life) return;
    const t = age / thread.life;
    const easeOut = 1 - Math.pow(1 - t, 2);
    const fade = Math.sin(t * Math.PI); // peak in middle

    const yA = (0.5 + fromSim.identity.yOffset) * viewH;
    const yB = (0.5 + toSim.identity.yOffset) * viewH;
    const x = thread.x01 * viewW;

    const yNow = yA + (yB - yA) * easeOut;
    const yCtrl = (yA + yB) * 0.5;
    const dirSign = Math.sign(yB - yA) || 1;
    const ctrlOffset = Math.min(80, Math.abs(yB - yA) * 0.35);

    const [r1, g1, b1] = fromSim.identity.colorRGB;
    const [r2, g2, b2] = toSim.identity.colorRGB;
    const r = Math.round((r1 + r2) / 2);
    const g = Math.round((g1 + g2) / 2);
    const b = Math.round((b1 + b2) / 2);
    const alpha = 0.55 * fade * fadeIn * (0.5 + 0.5 * thread.weight);

    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.lineDashOffset = -age * 0.03;
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(x, yA);
    ctx.quadraticCurveTo(x + ctrlOffset * dirSign, yCtrl, x, yNow);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = `rgba(${r},${g},${b},${(alpha * 1.2).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, yNow, 1.8 + thread.weight * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  let simAccumulatorMs = 0;
  let simLastFrameMs = performance.now();
  let entranceStart = performance.now();
  const ENTRANCE_MS = 1400;

  function render(nowMs) {
    let frameDelta = nowMs - simLastFrameMs;
    if (!Number.isFinite(frameDelta) || frameDelta < 0) frameDelta = SIM_STEP_MS;
    simLastFrameMs = nowMs;
    frameDelta = Math.min(frameDelta, SIM_STEP_MS * MAX_SIM_STEPS_PER_FRAME);
    simAccumulatorMs += frameDelta;

    let steps = 0;
    while (simAccumulatorMs >= SIM_STEP_MS && steps < MAX_SIM_STEPS_PER_FRAME) {
      for (const sim of sims.values()) stepSim(sim);
      couplingStep();
      simAccumulatorMs -= SIM_STEP_MS;
      steps++;
    }
    if (steps >= MAX_SIM_STEPS_PER_FRAME && simAccumulatorMs > SIM_STEP_MS * 2) {
      simAccumulatorMs = SIM_STEP_MS;
    }

    const interpAlpha = clamp01(simAccumulatorMs / SIM_STEP_MS);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, viewW, viewH);
    const ampPx = clamp(
      viewH * STRING_AMP_FRAC * (0.96 + 0.18 * (viewportImpactScale() - 1)),
      82,
      300
    );
    const entranceT = clamp01((nowMs - entranceStart) / ENTRANCE_MS);
    const fadeIn = entranceT * entranceT * (3 - 2 * entranceT); // smoothstep

    for (const sim of sims.values()) renderSim(sim, ampPx, interpAlpha, fadeIn);

    // sympathy threads — draw + prune expired
    if (sympathyThreads.length) {
      let write = 0;
      for (let i = 0; i < sympathyThreads.length; i++) {
        const t = sympathyThreads[i];
        const age = nowMs - t.t0;
        if (age > t.life) continue;
        renderSympathyThread(t, nowMs, fadeIn);
        sympathyThreads[write++] = t;
      }
      sympathyThreads.length = write;
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame((t) => {
    simLastFrameMs = Number.isFinite(t) ? t : performance.now();
    entranceStart = performance.now();
    requestAnimationFrame(render);
  });

  // ---------- presence ticker ----------
  function updatePresenceText() {
    if (!presenceText) return;
    let count = 0;
    const now = Date.now();
    for (const sim of sims.values()) {
      if (sim.who === myWho) { count++; continue; }
      if (now - sim.cursorAt <= REMOTE_CURSOR_STALE_MS) count++;
    }
    if (count < 1) count = 1;
    presenceText.textContent = `${count} string${count === 1 ? '' : 's'} tonight`;
  }
  setInterval(updatePresenceText, 700);
  updatePresenceText();

  // ---------- bootstrap ----------
  connectSocket();
  startHeartbeat();
})();
