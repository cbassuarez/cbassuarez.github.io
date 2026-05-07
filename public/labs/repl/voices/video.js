// VideoVoice — browser video input, anonymous feature analysis, realtime stage
// compositing, and local generative clip materialization for REPL video blocks.
//
// This module is intentionally self-contained and clock-safe:
// - no scheduler timing mutation
// - no audio graph mutation
// - all analysis outputs are normalized 0..1 anonymous proxies only

(function (root) {
  'use strict';

  const SOURCE_KINDS = ['camera', 'screen', 'file'];
  const DEFAULT_W = 640;
  const DEFAULT_H = 360;
  const ANALYSIS_W = 160;
  const ANALYSIS_H = 90;
  const MAX_GENERATED = 32;
  const KERNEL_NAMES = ['surveillance', 'collage', 'hallucination'];
  const STYLE_KERNEL_MAP = Object.freeze({
    surveillance: 'surveillance',
    collage: 'collage',
    hallucination: 'hallucination',
  });

  let raf = 0;
  let stageCanvas = null;
  let stageCtx = null;
  let stageFallbackCanvas = null;
  let stageFallbackCtx = null;
  let floatingWindow = null;
  let floatingCanvas = null;
  let floatingCtx = null;
  let stageEnabled = false;
  let analysisAgg = null;
  let cachedAudioCtx = null;
  let frameCounter = 0;
  let qualityScale = 0.86;
  let frameMsEwma = 16.7;
  let lastFramePerfNow = 0;

  let sourcePreference = 'camera';
  const runtimeBlocks = new Map(); // blockId -> state
  const generated = new Map(); // clipId -> { id, canvas, createdAt, meta }
  let generatedSeq = 0;

  const sources = {
    camera: makeSourceRecord('camera'),
    screen: makeSourceRecord('screen'),
    file: makeSourceRecord('file'),
  };

  function makeSourceRecord(kind) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.crossOrigin = 'anonymous';

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = DEFAULT_W;
    frameCanvas.height = DEFAULT_H;
    const frameCtx = frameCanvas.getContext('2d', { alpha: false, desynchronized: true });

    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = ANALYSIS_W;
    analysisCanvas.height = ANALYSIS_H;
    const analysisCtx = analysisCanvas.getContext('2d', { alpha: false, desynchronized: true });

    return {
      kind,
      status: 'idle',
      label: kind,
      error: '',
      stream: null,
      objectUrl: '',
      video,
      frameCanvas,
      frameCtx,
      analysisCanvas,
      analysisCtx,
      prevLuma: null,
      prevMotion: 0,
      prevBrightness: 0,
      prevCentroidX: 0.5,
      prevCentroidY: 0.5,
      lastSignals: baseSignals(kind),
      updatedAt: 0,
    };
  }

  function baseSignals(label) {
    return {
      intensity: 0,
      volatility: 0,
      pressure: 0,
      density: 0,
      periodicity: 0,
      rupture: 0,
      age: 1,
      confidence: 0,

      motion: 0,
      presence: 0,
      brightness: 0,
      contrast: 0,
      colortemp: 0.5,
      saturation: 0,
      edges: 0,
      flowx: 0.5,
      flowy: 0.5,
      stillness: 1,
      flicker: 0,
      centroidx: 0.5,
      centroidy: 0.5,
      faces: 0,
      body: 0,
      depth: 0,

      source: 'live',
      label,
      updatedAt: new Date().toISOString(),
    };
  }

  function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return n < lo ? lo : n > hi ? hi : n;
  }

  function clamp01(v) { return clamp(v, 0, 1); }

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return ''; }
  }

  function ensureStageSurface() {
    if (!stageCanvas) {
      if (!stageFallbackCanvas) {
        stageFallbackCanvas = document.createElement('canvas');
        stageFallbackCanvas.width = DEFAULT_W;
        stageFallbackCanvas.height = DEFAULT_H;
        stageFallbackCtx = stageFallbackCanvas.getContext('2d', { alpha: false, desynchronized: true });
      }
      stageCanvas = stageFallbackCanvas;
      stageCtx = stageFallbackCtx;
    }
  }

  function setStageCanvas(canvas) {
    if (!canvas || !canvas.getContext) return false;
    stageCanvas = canvas;
    if (!stageCanvas.width) stageCanvas.width = DEFAULT_W;
    if (!stageCanvas.height) stageCanvas.height = DEFAULT_H;
    stageCtx = stageCanvas.getContext('2d', { alpha: false, desynchronized: true });
    stageEnabled = true;
    ensureLoop();
    return true;
  }

  function setAudioContext(ctx) {
    cachedAudioCtx = ctx || null;
  }

  function stageTimeSeconds() {
    if (cachedAudioCtx && Number.isFinite(cachedAudioCtx.currentTime)) return cachedAudioCtx.currentTime;
    return performance.now() / 1000;
  }

  function publishLive(source, signals) {
    if (!root.ReplAttractors || typeof root.ReplAttractors.setLive !== 'function') return;
    root.ReplAttractors.setLive(source, signals);
  }

  function publishSilence(source) {
    const silent = baseSignals(source);
    silent.age = 1;
    silent.presence = 0;
    silent.stillness = 1;
    silent.updatedAt = nowIso();
    publishLive(source, silent);
  }

  async function enableSource(kindLike, options) {
    const kind = normalizeSourceKind(kindLike);
    if (!kind) throw new Error('video source must be camera, screen, or file');
    if (kind === 'file') return sources.file.lastSignals;

    const rec = sources[kind];
    rec.error = '';
    rec.status = 'requesting';

    try {
      let stream = null;
      if (kind === 'camera') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('camera capture unavailable');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: (options && options.facingMode) || 'user',
          },
          audio: false,
        });
      } else if (kind === 'screen') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('screen capture unavailable');
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 60 } },
          audio: false,
        });
      }

      attachStream(rec, stream);
      rec.status = 'live';
      rec.label = kind === 'screen' ? 'screen capture' : 'camera';
      ensureLoop();
      return rec.lastSignals;
    } catch (err) {
      rec.status = 'error';
      rec.error = err && err.message ? err.message : String(err || 'capture failed');
      publishSilence(kind);
      throw err;
    }
  }

  function normalizeSourceKind(kindLike) {
    const kind = String(kindLike || '').trim().toLowerCase();
    if (SOURCE_KINDS.includes(kind)) return kind;
    if (kind === 'tab') return 'screen';
    return '';
  }

  function attachStream(rec, stream) {
    stopSource(rec.kind);
    rec.stream = stream || null;
    rec.video.srcObject = rec.stream;
    rec.video.muted = true;
    rec.video.play().catch(() => {});
    const tracks = rec.stream && rec.stream.getVideoTracks ? rec.stream.getVideoTracks() : [];
    for (const trk of tracks) {
      trk.addEventListener('ended', () => {
        stopSource(rec.kind);
      }, { once: true });
    }
  }

  function attachFile(file) {
    if (!file) throw new Error('no video file selected');
    const rec = sources.file;
    stopSource('file');
    rec.status = 'requesting';
    rec.error = '';

    const url = URL.createObjectURL(file);
    rec.objectUrl = url;
    rec.video.srcObject = null;
    rec.video.src = url;
    rec.video.loop = true;
    rec.video.muted = true;
    rec.video.play().then(() => {
      rec.status = 'live';
      rec.label = file.name || 'file';
      ensureLoop();
    }).catch((err) => {
      rec.status = 'error';
      rec.error = err && err.message ? err.message : 'file playback failed';
      publishSilence('file');
    });
    return rec.lastSignals;
  }

  function stopSource(kindLike) {
    const kind = normalizeSourceKind(kindLike);
    if (!kind) return;
    const rec = sources[kind];
    if (!rec) return;

    if (rec.stream && rec.stream.getTracks) {
      rec.stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
    }
    rec.stream = null;
    rec.video.pause();
    try { rec.video.srcObject = null; } catch (_) {}
    if (rec.objectUrl) {
      try { URL.revokeObjectURL(rec.objectUrl); } catch (_) {}
      rec.objectUrl = '';
    }
    rec.status = 'idle';
    rec.error = '';
    rec.prevLuma = null;
    rec.prevMotion = 0;
    rec.prevBrightness = 0;
    rec.prevCentroidX = 0.5;
    rec.prevCentroidY = 0.5;
    rec.lastSignals = baseSignals(kind);
    publishSilence(kind);
    publishAggregate();
  }

  function sourceReady(rec) {
    const v = rec && rec.video;
    return Boolean(v && (v.readyState >= 2) && v.videoWidth > 0 && v.videoHeight > 0);
  }

  function readSourceFrame(rec) {
    if (!rec || !sourceReady(rec)) return null;
    const vw = rec.video.videoWidth || DEFAULT_W;
    const vh = rec.video.videoHeight || DEFAULT_H;
    if (rec.frameCanvas.width !== vw || rec.frameCanvas.height !== vh) {
      rec.frameCanvas.width = vw;
      rec.frameCanvas.height = vh;
    }
    rec.frameCtx.drawImage(rec.video, 0, 0, vw, vh);
    return rec.frameCanvas;
  }

  function analyzeSource(rec, t) {
    const src = readSourceFrame(rec);
    if (!src) return null;

    rec.analysisCtx.drawImage(src, 0, 0, ANALYSIS_W, ANALYSIS_H);
    const image = rec.analysisCtx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
    const data = image.data;
    const pxCount = ANALYSIS_W * ANALYSIS_H;
    if (!data || !pxCount) return null;

    const luma = new Float32Array(pxCount);
    let sumLum = 0;
    let sumSat = 0;
    let sumR = 0;
    let sumB = 0;

    for (let i = 0, p = 0; i < pxCount; i++, p += 4) {
      const r = data[p] / 255;
      const g = data[p + 1] / 255;
      const b = data[p + 2] / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const y = clamp01(0.2126 * r + 0.7152 * g + 0.0722 * b);
      luma[i] = y;
      sumLum += y;
      sumSat += sat;
      sumR += r;
      sumB += b;
    }

    const brightness = clamp01(sumLum / pxCount);
    const saturation = clamp01(sumSat / pxCount);
    const colorTemp = clamp01(0.5 + ((sumR - sumB) / Math.max(1, pxCount)) * 0.4);

    let contrastAccum = 0;
    let edgeAccum = 0;
    let motionAccum = 0;
    let motionWeight = 0;
    let centroidXAccum = 0;
    let centroidYAccum = 0;
    const prev = rec.prevLuma;

    for (let y = 0; y < ANALYSIS_H; y++) {
      for (let x = 0; x < ANALYSIS_W; x++) {
        const idx = y * ANALYSIS_W + x;
        const cur = luma[idx];
        const dx = x < ANALYSIS_W - 1 ? Math.abs(cur - luma[idx + 1]) : 0;
        const dy = y < ANALYSIS_H - 1 ? Math.abs(cur - luma[idx + ANALYSIS_W]) : 0;
        const edge = clamp01((dx + dy) * 2.2);
        edgeAccum += edge;

        const d = cur - brightness;
        contrastAccum += d * d;

        if (prev && prev.length === pxCount) {
          const dm = Math.abs(cur - prev[idx]);
          motionAccum += dm;
          if (dm > 0.07) {
            motionWeight += dm;
            centroidXAccum += (x / Math.max(1, ANALYSIS_W - 1)) * dm;
            centroidYAccum += (y / Math.max(1, ANALYSIS_H - 1)) * dm;
          }
        }
      }
    }

    const contrast = clamp01(Math.sqrt(contrastAccum / pxCount) * 3.2);
    const edges = clamp01(edgeAccum / pxCount);
    const motion = prev ? clamp01((motionAccum / pxCount) * 4.5) : 0;
    const density = prev ? clamp01(motionWeight / Math.max(1, pxCount * 0.11)) : 0;
    const centroidX = motionWeight > 0 ? clamp01(centroidXAccum / motionWeight) : rec.prevCentroidX;
    const centroidY = motionWeight > 0 ? clamp01(centroidYAccum / motionWeight) : rec.prevCentroidY;
    const flowX = clamp01(0.5 + (centroidX - rec.prevCentroidX) * 2.4);
    const flowY = clamp01(0.5 + (centroidY - rec.prevCentroidY) * 2.4);
    const stillness = clamp01(1 - motion);
    const flicker = clamp01(Math.abs(brightness - rec.prevBrightness) * 3.2);
    const rupture = clamp01(Math.max(0, motion - rec.prevMotion) * 2.1 + flicker * 0.28);
    const presence = clamp01(brightness * 0.35 + motion * 0.45 + edges * 0.20);
    const confidence = clamp01(presence * 0.7 + (1 - Math.abs(0.5 - brightness) * 2) * 0.3);

    // Non-identity proxies only.
    const facesProxy = clamp01(Math.max(0, presence * 0.45 + contrast * 0.25 - motion * 0.15));
    const bodyProxy = clamp01(Math.max(0, density * 0.5 + motion * 0.3 + edges * 0.2));
    const depthProxy = clamp01(contrast * 0.6 + edges * 0.2 + (1 - saturation) * 0.2);

    const signals = {
      intensity: presence,
      volatility: motion,
      pressure: brightness,
      density,
      periodicity: clamp01(stillness * 0.7 + (1 - flicker) * 0.3),
      rupture,
      age: stillness,
      confidence,
      motion,
      presence,
      brightness,
      contrast,
      colortemp: colorTemp,
      saturation,
      edges,
      flowx: flowX,
      flowy: flowY,
      stillness,
      rupture,
      flicker,
      centroidx: centroidX,
      centroidy: centroidY,
      faces: facesProxy,
      body: bodyProxy,
      depth: depthProxy,
      source: 'live',
      label: rec.kind,
      updatedAt: nowIso(),
    };

    rec.prevLuma = luma;
    rec.prevMotion = motion;
    rec.prevBrightness = brightness;
    rec.prevCentroidX = centroidX;
    rec.prevCentroidY = centroidY;
    rec.updatedAt = t;
    rec.lastSignals = signals;
    publishLive(rec.kind, signals);
    return signals;
  }

  function publishAggregate() {
    const preferred = normalizeSourceKind(sourcePreference) || 'camera';
    const order = [preferred, 'camera', 'screen', 'file'];
    for (const kind of order) {
      const rec = sources[kind];
      if (rec && rec.status === 'live' && rec.lastSignals) {
        const agg = { ...rec.lastSignals, label: 'video' };
        analysisAgg = agg;
        publishLive('video', agg);
        return agg;
      }
    }
    const silent = baseSignals('video');
    analysisAgg = silent;
    publishLive('video', silent);
    return silent;
  }

  function resolveGeneratedSource(id) {
    const key = String(id || '').trim().toLowerCase();
    if (!key || key === 'latest' || key === 'vgen-latest') {
      let last = null;
      for (const item of generated.values()) last = item;
      return last && last.canvas ? last.canvas : null;
    }
    const clip = generated.get(key);
    if (!clip || !clip.canvas) return null;
    return clip.canvas;
  }

  function activeVideoBlocks() {
    return Array.from(runtimeBlocks.values()).filter((b) => b && (b.voice === 'video' || b.voice === 'video-gen'));
  }

  function liveSignalsFor(kind, fallback) {
    const fallbackSignals = fallback && typeof fallback === 'object' ? fallback : baseSignals(kind);
    try {
      const A = root.ReplAttractors;
      if (!A || typeof A.peek !== 'function') return fallbackSignals;
      const raw = A.peek({ raw: kind });
      if (!raw || typeof raw !== 'object') return fallbackSignals;
      return { ...fallbackSignals, ...raw };
    } catch (_) {
      return fallbackSignals;
    }
  }

  function couplingForState(state) {
    const ownKind = state && state.video && state.video.source ? state.video.source : 'video';
    const own = liveSignalsFor(ownKind, baseSignals(ownKind));
    const video = liveSignalsFor('video', own);
    const mic = liveSignalsFor('mic', baseSignals('mic'));
    const input = liveSignalsFor('input', mic);
    const audio = {
      intensity: clamp01((Number(mic.intensity || 0) + Number(input.intensity || 0)) * 0.5),
      volatility: clamp01((Number(mic.volatility || 0) + Number(input.volatility || 0)) * 0.5),
      rupture: clamp01((Number(mic.rupture || 0) + Number(input.rupture || 0)) * 0.5),
      pressure: clamp01((Number(mic.pressure || 0) + Number(input.pressure || 0)) * 0.5),
    };
    return {
      own,
      video,
      audio,
      drive: clamp01(video.motion * 0.34 + video.edges * 0.2 + audio.intensity * 0.22 + audio.rupture * 0.24),
      rupture: clamp01(video.rupture * 0.6 + audio.rupture * 0.4),
      centroidX: clamp01(video.centroidx),
      centroidY: clamp01(video.centroidy),
      flowX: clamp01(video.flowx),
      flowY: clamp01(video.flowy),
      stillness: clamp01(video.stillness),
      flicker: clamp01(video.flicker),
    };
  }

  function paintFallbackTexture(ctx, w, h, seed, energy) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, w, h);
    const a = clamp01(0.25 + energy * 0.6);
    g.addColorStop(0, `rgba(${Math.round(40 + a * 120)},${Math.round(10 + a * 80)},${Math.round(90 + a * 110)},1)`);
    g.addColorStop(1, `rgba(${Math.round(4 + a * 40)},${Math.round(6 + a * 25)},${Math.round(8 + a * 32)},1)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    drawRandomRects(ctx, w, h, seed, clamp01(0.4 + energy * 0.6), 0.42 + energy * 0.45);
    ctx.restore();
  }

  function makeRng(seedLike) {
    let x = (hashString(String(seedLike || 'seed')) ^ 0x9e3779b9) >>> 0;
    if (!x) x = 0x12345678;
    return function next() {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17; x >>>= 0;
      x ^= x << 5; x >>>= 0;
      return (x >>> 0) / 4294967295;
    };
  }

  function dominantKernelForStyle(style) {
    const key = String(style || '').trim().toLowerCase().split(/\s+/)[0];
    return STYLE_KERNEL_MAP[key] || 'surveillance';
  }

  function rotatedKernelOrder(dominant) {
    if (dominant === 'collage') return ['collage', 'hallucination', 'surveillance'];
    if (dominant === 'hallucination') return ['hallucination', 'surveillance', 'collage'];
    return ['surveillance', 'collage', 'hallucination'];
  }

  function deterministicKernelPick(state, leafIndex, token) {
    const dominant = dominantKernelForStyle(state && state.video ? state.video.style : '');
    const order = rotatedKernelOrder(dominant);
    const seed = String(state && state.video && state.video.seed ? state.video.seed : state && state.id ? state.id : 'gen');
    if (String(token || '') === '*!' && state._frozenKernel) return state._frozenKernel;
    const n = Math.abs(hashString(`${seed}:${Number.isFinite(leafIndex) ? leafIndex : 0}`)) % order.length;
    const picked = order[n] || dominant;
    if (String(token || '') === '*!') state._frozenKernel = picked;
    return picked;
  }

  function activeKernelForState(state) {
    if (!state || state.voice !== 'video-gen') return 'surveillance';
    const dominant = dominantKernelForStyle(state.video && state.video.style);
    if (state.video && state.video.continuousOnly) {
      if (!state._lockedKernel) state._lockedKernel = dominant;
      return state._lockedKernel;
    }
    if (!state._currentKernel) state._currentKernel = dominant;
    return state._currentKernel;
  }

  function qualityFloorForSize(w, h) {
    const area = Math.max(1, (Number(w) || DEFAULT_W) * (Number(h) || DEFAULT_H));
    if (area >= 1920 * 1080) return 0.46;
    if (area >= 1280 * 720) return 0.56;
    return 0.66;
  }

  function maybeAdjustQuality(stageW, stageH) {
    const floor = qualityFloorForSize(stageW, stageH);
    const ceiling = 1;
    if (frameCounter % 24 !== 0) return;
    if (frameMsEwma > 36 && qualityScale > floor) {
      qualityScale = clamp(qualityScale - 0.06, floor, ceiling);
      return;
    }
    if (frameMsEwma < 27 && qualityScale < ceiling) {
      qualityScale = clamp(qualityScale + 0.04, floor, ceiling);
    }
  }

  function ensureKernelBuffers(state, stageW, stageH) {
    if (!state.kernel) state.kernel = {};
    const k = state.kernel;
    const scale = clamp(qualityScale, qualityFloorForSize(stageW, stageH), 1);
    const ww = Math.max(96, Math.round(stageW * scale));
    const wh = Math.max(54, Math.round(stageH * scale));
    if (!k.workCanvas) {
      k.workCanvas = document.createElement('canvas');
      k.workCtx = k.workCanvas.getContext('2d', { alpha: true, desynchronized: true });
    }
    if (k.workCanvas.width !== ww || k.workCanvas.height !== wh) {
      k.workCanvas.width = ww;
      k.workCanvas.height = wh;
    }
    if (!k.feedbackCanvas) {
      k.feedbackCanvas = document.createElement('canvas');
      k.feedbackCtx = k.feedbackCanvas.getContext('2d', { alpha: true, desynchronized: true });
    }
    if (k.feedbackCanvas.width !== ww || k.feedbackCanvas.height !== wh) {
      k.feedbackCanvas.width = ww;
      k.feedbackCanvas.height = wh;
      k.feedbackCtx.clearRect(0, 0, ww, wh);
    }
    if (!k.collageFrames) k.collageFrames = [];
    return { scale, ww, wh, k };
  }

  function captureCollageFrame(k, sourceCanvas, ww, wh) {
    if (!sourceCanvas) return;
    const cv = document.createElement('canvas');
    cv.width = ww;
    cv.height = wh;
    const cctx = cv.getContext('2d', { alpha: true, desynchronized: true });
    if (!cctx) return;
    cctx.drawImage(sourceCanvas, 0, 0, ww, wh);
    k.collageFrames.push(cv);
    const cap = 14;
    if (k.collageFrames.length > cap) k.collageFrames.shift();
  }

  function applySurveillanceKernel(kctx, sourceCanvas, coupling, params, ww, wh, k, state) {
    clearCanvas(kctx, ww, wh);
    if (sourceCanvas) kctx.drawImage(sourceCanvas, 0, 0, ww, wh);
    const flowX = (coupling.flowX - 0.5) * 2;
    const flowY = (coupling.flowY - 0.5) * 2;
    const fb = clamp01((Number(params.feedback) || 0) * 0.55 + coupling.rupture * 0.4);
    if (fb > 0.01) {
      const dx = Math.round(flowX * (8 + fb * 18));
      const dy = Math.round(flowY * (6 + fb * 14));
      kctx.globalAlpha = clamp(0.08 + fb * 0.68, 0, 0.9);
      kctx.drawImage(k.feedbackCanvas, dx, dy, ww, wh);
      kctx.globalAlpha = 1;
    }
    const img = kctx.getImageData(0, 0, ww, wh);
    const d = img.data;
    const thr = clamp(0.1 + (Number(params.threshold) || 0) * 0.75 + coupling.rupture * 0.12, 0.02, 0.98);
    const edgeAmt = clamp01((Number(params.edges) || 0) + coupling.video.edges * 0.42);
    const quant = Math.max(2, Math.round(2 + (1 - clamp01((Number(params.posterize) || 0) + coupling.audio.rupture * 0.2)) * 18));
    for (let y = 0; y < wh - 1; y++) {
      for (let x = 0; x < ww - 1; x++) {
        const i = (y * ww + x) * 4;
        const r = d[i] / 255;
        const g = d[i + 1] / 255;
        const b = d[i + 2] / 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const j = i + 4;
        const k2 = i + ww * 4;
        const lr = d[j] / 255; const lg = d[j + 1] / 255; const lb = d[j + 2] / 255;
        const dr = d[k2] / 255; const dg = d[k2 + 1] / 255; const db = d[k2 + 2] / 255;
        const ll = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
        const dl = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
        const edge = clamp01((Math.abs(lum - ll) + Math.abs(lum - dl)) * 2.6) * edgeAmt;
        let vv = lum >= thr ? 1 : 0;
        vv = (Math.round(vv * (quant - 1)) / (quant - 1));
        const mix = clamp01(0.55 + edge * 0.45);
        d[i] = Math.round(clamp01(vv * mix + r * (1 - mix) + edge * 0.5) * 255);
        d[i + 1] = Math.round(clamp01(vv * mix + g * (1 - mix) + edge * 0.45) * 255);
        d[i + 2] = Math.round(clamp01(vv * mix + b * (1 - mix) + edge * 0.4) * 255);
      }
    }
    kctx.putImageData(img, 0, 0);
    k.feedbackCtx.globalAlpha = clamp(0.25 + fb * 0.5, 0.2, 0.9);
    k.feedbackCtx.drawImage(k.workCanvas, 0, 0, ww, wh);
    k.feedbackCtx.globalAlpha = 1;
    state.phase = (state.phase || 0) + 0.015 + coupling.drive * 0.015;
  }

  function applyCollageKernel(kctx, sourceCanvas, coupling, params, ww, wh, k, state) {
    clearCanvas(kctx, ww, wh);
    const seed = `${state.id}:${state.video && state.video.seed ? state.video.seed : 'seed'}:${frameCounter >> 1}`;
    const rnd = makeRng(seed);
    if (sourceCanvas) {
      kctx.globalAlpha = 0.25 + clamp01(Number(params.gain) || 0) * 0.35;
      kctx.drawImage(sourceCanvas, 0, 0, ww, wh);
      kctx.globalAlpha = 1;
    } else {
      paintFallbackTexture(kctx, ww, wh, hashString(seed), coupling.drive);
    }

    const captureEvery = Math.max(2, Math.round(3 + coupling.stillness * 8));
    if (frameCounter % captureEvery === 0) captureCollageFrame(k, sourceCanvas || k.workCanvas, ww, wh);
    const frames = k.collageFrames;
    const patchCount = Math.max(8, Math.round(8 + clamp01((Number(params.trail) || 0) + coupling.drive) * 24));
    for (let i = 0; i < patchCount; i++) {
      const src = frames.length ? frames[Math.floor(rnd() * frames.length)] : sourceCanvas;
      if (!src) continue;
      const pw = Math.max(12, Math.floor((0.08 + rnd() * 0.28) * ww));
      const ph = Math.max(12, Math.floor((0.06 + rnd() * 0.24) * wh));
      const sx = Math.max(0, Math.floor(rnd() * Math.max(1, src.width - pw)));
      const sy = Math.max(0, Math.floor(rnd() * Math.max(1, src.height - ph)));
      const dx = Math.max(0, Math.floor(rnd() * Math.max(1, ww - pw)));
      const dy = Math.max(0, Math.floor(rnd() * Math.max(1, wh - ph)));
      const a = clamp(0.14 + rnd() * 0.42 + coupling.audio.intensity * 0.2, 0.08, 0.78);
      kctx.globalAlpha = a;
      kctx.drawImage(src, sx, sy, pw, ph, dx, dy, pw, ph);
    }
    kctx.globalAlpha = 1;
    const fb = clamp01((Number(params.feedback) || 0) * 0.5 + coupling.stillness * 0.35);
    if (fb > 0.01) {
      kctx.globalAlpha = clamp(0.08 + fb * 0.35, 0, 0.52);
      kctx.drawImage(k.feedbackCanvas, 0, 0, ww, wh);
      kctx.globalAlpha = 1;
    }
    k.feedbackCtx.globalAlpha = clamp(0.25 + fb * 0.5, 0.2, 0.9);
    k.feedbackCtx.drawImage(k.workCanvas, 0, 0, ww, wh);
    k.feedbackCtx.globalAlpha = 1;
    state.phase = (state.phase || 0) + 0.01 + coupling.audio.volatility * 0.02;
  }

  function applyHallucinationKernel(kctx, sourceCanvas, coupling, params, ww, wh, k, state) {
    clearCanvas(kctx, ww, wh);
    if (sourceCanvas) kctx.drawImage(sourceCanvas, 0, 0, ww, wh);
    else paintFallbackTexture(kctx, ww, wh, hashString(`${state.id}:hall`), clamp01(coupling.drive + 0.2));

    const img = kctx.getImageData(0, 0, ww, wh);
    const d = img.data;
    const copy = new Uint8ClampedArray(d);
    const phase = (state.phase || 0) + frameCounter * 0.003;
    const displace = clamp01((Number(params.displace) || 0) + coupling.drive * 0.55);
    const shift = Math.max(1, Math.round(1 + displace * 16));
    const satBoost = clamp01((Number(params.saturate) || 0) + coupling.audio.pressure * 0.4);
    for (let y = 0; y < wh; y++) {
      for (let x = 0; x < ww; x++) {
        const i = (y * ww + x) * 4;
        const nx = Math.sin((y + phase * 80) * 0.09) * shift + Math.cos((x + phase * 60) * 0.04) * shift * 0.6;
        const ny = Math.cos((x + phase * 55) * 0.08) * shift + Math.sin((y + phase * 35) * 0.05) * shift * 0.7;
        const sx = (x + Math.round(nx) + ww) % ww;
        const sy = (y + Math.round(ny) + wh) % wh;
        const j = (sy * ww + sx) * 4;
        let r = copy[j] / 255;
        let g = copy[j + 1] / 255;
        let b = copy[j + 2] / 255;
        const hueBeat = Math.sin((x + y) * 0.015 + phase * 4 + coupling.centroidX * 3.14);
        r = clamp01(r + hueBeat * 0.08 + satBoost * 0.12);
        g = clamp01(g + Math.cos((x - y) * 0.011 + phase * 3) * 0.07);
        b = clamp01(b + Math.sin(y * 0.018 + phase * 5) * 0.1 + coupling.audio.rupture * 0.14);
        d[i] = Math.round(r * 255);
        d[i + 1] = Math.round(g * 255);
        d[i + 2] = Math.round(b * 255);
      }
    }
    kctx.putImageData(img, 0, 0);
    const bloom = clamp01((Number(params.feedback) || 0) * 0.4 + coupling.rupture * 0.5);
    if (bloom > 0.01) {
      kctx.globalCompositeOperation = 'screen';
      kctx.globalAlpha = clamp(0.08 + bloom * 0.34, 0, 0.56);
      const bx = Math.round((coupling.flowX - 0.5) * 8);
      const by = Math.round((coupling.flowY - 0.5) * 6);
      kctx.filter = `blur(${Math.round(2 + bloom * 8)}px)`;
      kctx.drawImage(k.workCanvas, bx, by, ww, wh);
      kctx.filter = 'none';
      kctx.globalAlpha = 1;
      kctx.globalCompositeOperation = 'source-over';
    }
    state.phase = phase + 0.02 + coupling.audio.volatility * 0.025;
  }

  function clearCanvas(ctx, w, h) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.restore();
  }

  function setSizeIfNeeded(canvas, w, h) {
    if (!canvas) return;
    const iw = Math.max(1, Math.round(w));
    const ih = Math.max(1, Math.round(h));
    if (canvas.width !== iw || canvas.height !== ih) {
      canvas.width = iw;
      canvas.height = ih;
    }
  }

  function ensureBlockLayer(state, w, h) {
    if (!state.layerCanvas) {
      state.layerCanvas = document.createElement('canvas');
      state.layerCtx = state.layerCanvas.getContext('2d', { alpha: true, desynchronized: true });
      state.feedbackCanvas = document.createElement('canvas');
      state.feedbackCtx = state.feedbackCanvas.getContext('2d', { alpha: true, desynchronized: true });
      state.history = [];
      state.sliceCursor = 0;
    }
    setSizeIfNeeded(state.layerCanvas, w, h);
    setSizeIfNeeded(state.feedbackCanvas, w, h);
  }

  function mapBlendMode(mode) {
    const m = String(mode || '').toLowerCase();
    if (m === 'difference') return 'difference';
    if (m === 'screen') return 'screen';
    if (m === 'multiply') return 'multiply';
    if (m === 'overlay') return 'overlay';
    if (m === 'lighter') return 'lighter';
    return 'source-over';
  }

  function drawLayerFromSource(state, sourceCanvas, stageW, stageH) {
    ensureBlockLayer(state, stageW, stageH);
    const ctx = state.layerCtx;
    clearCanvas(ctx, stageW, stageH);
    const coupling = couplingForState(state);
    const isGen = state && state.voice === 'video-gen';
    const { ww, wh, k } = ensureKernelBuffers(state, stageW, stageH);
    if (!sourceCanvas) {
      paintFallbackTexture(ctx, stageW, stageH, hashString(`${state.id}:${state.lastCommitAt}:${frameCounter}`), coupling.drive);
      if (isGen) captureCollageFrame(k, ctx.canvas, ww, wh);
      return;
    }

    const p = state.params || {};
    const mod = clamp01(coupling.drive);
    const invertAmt = clamp01((Number(p.invert) || 0) + coupling.audio.rupture * 0.25);
    if (isGen) {
      const kernelName = activeKernelForState(state);
      if (kernelName === 'collage') applyCollageKernel(k.workCtx, sourceCanvas, coupling, p, ww, wh, k, state);
      else if (kernelName === 'hallucination') applyHallucinationKernel(k.workCtx, sourceCanvas, coupling, p, ww, wh, k, state);
      else applySurveillanceKernel(k.workCtx, sourceCanvas, coupling, p, ww, wh, k, state);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(k.workCanvas, 0, 0, ww, wh, 0, 0, stageW, stageH);
    } else {
      const contrastAmt = clamp01((Number(p.contrast) || 0) + coupling.video.contrast * 0.35 + coupling.audio.intensity * 0.15);
      const satAmt = clamp01((Number(p.saturate) || 0) + coupling.video.saturation * 0.25 + coupling.audio.pressure * 0.12);
      const blurAmt = clamp01((Number(p.blur) || 0) * (0.2 + coupling.stillness * 0.8));

      const brightnessMul = clamp(0.7 + (Number(p.gain) || 0) * 0.62 + mod * 0.3, 0.08, 2.65);
      const contrastMul = clamp(0.65 + contrastAmt * 2.4, 0.35, 4.0);
      const saturateMul = clamp(0.12 + satAmt * 3.1, 0, 4.2);
      const blurPx = clamp(blurAmt * (4 + coupling.stillness * 20), 0, 22);
      const hue = Math.round((Number(p.color) || 0) * 240 - 120 + (coupling.flowX - 0.5) * 90);
      ctx.filter = `brightness(${brightnessMul}) contrast(${contrastMul}) saturate(${saturateMul}) blur(${blurPx}px) hue-rotate(${hue}deg)`;
      ctx.drawImage(sourceCanvas, 0, 0, stageW, stageH);
      ctx.filter = 'none';
    }

    const thresholdAmt = clamp01((Number(p.threshold) || 0) + coupling.video.brightness * 0.2 + coupling.audio.rupture * 0.1);
    const posterizeAmt = clamp01((Number(p.posterize) || 0) + coupling.rupture * 0.22);
    const edgesAmt = clamp01((Number(p.edges) || 0) + coupling.video.edges * 0.35 + coupling.audio.volatility * 0.1);
    const displaceAmt = clamp01((Number(p.displace) || 0) + Math.abs(coupling.flowX - 0.5) * 0.6 + Math.abs(coupling.flowY - 0.5) * 0.2);
    const trailAmt = clamp01((Number(p.trail) || 0) + coupling.stillness * 0.2);
    const feedbackAmt = clamp01((Number(p.feedback) || 0) + coupling.rupture * 0.3);
    const delayAmt = clamp01((Number(p.delay) || 0) + coupling.audio.intensity * 0.2);
    const slitscanAmt = clamp01((Number(p.slitscan) || 0) + (Math.abs(coupling.flowX - 0.5) + Math.abs(coupling.flowY - 0.5)) * 0.5);

    if (feedbackAmt > 0.001) {
      state.feedbackCtx.globalAlpha = clamp(0.12 + feedbackAmt * 0.68, 0, 0.9);
      state.feedbackCtx.drawImage(state.layerCanvas, 0, 0, stageW, stageH);
      state.feedbackCtx.globalAlpha = 1;
      ctx.globalAlpha = clamp(0.08 + feedbackAmt * 0.72, 0, 0.92);
      ctx.drawImage(state.feedbackCanvas, 0, 0, stageW, stageH);
      ctx.globalAlpha = 1;
    }

    if (trailAmt > 0.001) {
      state.history.push(ctx.getImageData(0, 0, stageW, stageH));
      if (state.history.length > 6) state.history.shift();
      const len = state.history.length;
      for (let i = 0; i < len; i++) {
        const img = state.history[i];
        const alpha = ((i + 1) / len) * trailAmt * 0.25;
        ctx.globalAlpha = alpha;
        ctx.putImageData(img, 0, 0);
      }
      ctx.globalAlpha = 1;
    }

    if (delayAmt > 0.001 && state.history.length > 1) {
      const back = state.history[Math.max(0, state.history.length - 2)];
      if (back) {
        ctx.globalAlpha = clamp(delayAmt * 0.5, 0, 0.6);
        ctx.putImageData(back, 0, 0);
        ctx.globalAlpha = 1;
      }
    }

    if (slitscanAmt > 0.001 && state.history.length > 2) {
      const slices = Math.max(2, Math.floor(2 + slitscanAmt * 12));
      const sliceW = Math.max(1, Math.floor(stageW / slices));
      if (!state.slitCanvas) {
        state.slitCanvas = document.createElement('canvas');
        state.slitCtx = state.slitCanvas.getContext('2d', { alpha: true });
      }
      setSizeIfNeeded(state.slitCanvas, stageW, stageH);
      for (let i = 0; i < slices; i++) {
        const histIdx = (state.history.length - 1 - ((state.sliceCursor + i) % state.history.length));
        const img = state.history[Math.max(0, histIdx)];
        if (!img) continue;
        const sx = i * sliceW;
        const sw = i === slices - 1 ? stageW - sx : sliceW;
        if (sw <= 0) continue;
        state.slitCtx.putImageData(img, 0, 0);
        ctx.drawImage(state.slitCanvas, sx, 0, sw, stageH, sx, 0, sw, stageH);
      }
      state.sliceCursor = (state.sliceCursor + 1) % 999999;
    }

    if (thresholdAmt > 0.001 || edgesAmt > 0.001 || posterizeAmt > 0.001 || invertAmt > 0.001 || displaceAmt > 0.001) {
      const img = ctx.getImageData(0, 0, stageW, stageH);
      const d = img.data;
      const levels = Math.max(2, Math.round(2 + (1 - posterizeAmt) * 14));
      const thresh = clamp(0.08 + thresholdAmt * 0.84, 0, 1);
      for (let y = 0; y < stageH; y++) {
        for (let x = 0; x < stageW; x++) {
          const i = (y * stageW + x) * 4;
          let r = d[i] / 255;
          let g = d[i + 1] / 255;
          let b = d[i + 2] / 255;
          const lum = clamp01(0.2126 * r + 0.7152 * g + 0.0722 * b);

          if (thresholdAmt > 0.001) {
            const bw = lum >= thresh ? 1 : 0;
            r = r * (1 - thresholdAmt) + bw * thresholdAmt;
            g = g * (1 - thresholdAmt) + bw * thresholdAmt;
            b = b * (1 - thresholdAmt) + bw * thresholdAmt;
          }

          if (posterizeAmt > 0.001) {
            const q = Math.max(1, levels - 1);
            r = Math.round(r * q) / q;
            g = Math.round(g * q) / q;
            b = Math.round(b * q) / q;
          }

          if (invertAmt > 0.001) {
            r = r * (1 - invertAmt) + (1 - r) * invertAmt;
            g = g * (1 - invertAmt) + (1 - g) * invertAmt;
            b = b * (1 - invertAmt) + (1 - b) * invertAmt;
          }

          if (edgesAmt > 0.001 && x < stageW - 1 && y < stageH - 1) {
            const j = i + 4;
            const k = i + stageW * 4;
            const lr = d[j] / 255;
            const lg = d[j + 1] / 255;
            const lb = d[j + 2] / 255;
            const dr = d[k] / 255;
            const dg = d[k + 1] / 255;
            const db = d[k + 2] / 255;
            const ll = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
            const dl = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
            const edge = clamp01((Math.abs(lum - ll) + Math.abs(lum - dl)) * 2.4);
            const mix = edge * edgesAmt;
            r = clamp01(r + mix);
            g = clamp01(g + mix);
            b = clamp01(b + mix);
          }

          d[i] = Math.round(clamp01(r) * 255);
          d[i + 1] = Math.round(clamp01(g) * 255);
          d[i + 2] = Math.round(clamp01(b) * 255);
        }
      }
      if (displaceAmt > 0.001) {
        const copy = new Uint8ClampedArray(d);
        const shift = Math.max(1, Math.round(displaceAmt * 12));
        for (let y = 0; y < stageH; y++) {
          for (let x = 0; x < stageW; x++) {
            const i = (y * stageW + x) * 4;
            const sx = (x + Math.round(Math.sin((y + state.phase * 40) * 0.08) * shift) + stageW) % stageW;
            const sy = (y + Math.round(Math.cos((x + state.phase * 60) * 0.06) * shift) + stageH) % stageH;
            const j = (sy * stageW + sx) * 4;
            d[i] = copy[j];
            d[i + 1] = copy[j + 1];
            d[i + 2] = copy[j + 2];
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    state.phase = (state.phase || 0) + 0.0075 + mod * 0.02;
  }

  function resolveBlockSourceCanvas(state) {
    if (!state || !state.video) return null;
    const source = state.video.source || 'camera';
    if (state.voice === 'video-gen') {
      const fallback = sourceForGenBlock(state);
      if (fallback) return fallback;
      if (state.lastGeneratedId) {
        const own = resolveGeneratedSource(state.lastGeneratedId);
        if (own) return own;
      }
      return stageCanvas || null;
    }
    if (source === 'file' && state.video.sourceClipId) {
      const gen = resolveGeneratedSource(state.video.sourceClipId);
      if (gen) return gen;
    }
    if (source === 'file' && sources.file.status === 'live') return readSourceFrame(sources.file);
    if (source === 'camera' && sources.camera.status === 'live') return readSourceFrame(sources.camera);
    if (source === 'screen' && sources.screen.status === 'live') return readSourceFrame(sources.screen);
    return null;
  }

  function renderStageFrame(t) {
    ensureStageSurface();
    const ctx = stageCtx;
    const canvas = stageCanvas;
    if (!ctx || !canvas) return;
    const w = canvas.width || DEFAULT_W;
    const h = canvas.height || DEFAULT_H;
    clearCanvas(ctx, w, h);

    const blocks = activeVideoBlocks();
    for (const state of blocks) {
      const sourceCanvas = resolveBlockSourceCanvas(state);
      drawLayerFromSource(state, sourceCanvas, w, h);
      const layer = state.layerCanvas;
      if (!layer) continue;
      const p = state.params || {};
      ctx.save();
      ctx.globalCompositeOperation = mapBlendMode(p.blend);
      ctx.globalAlpha = clamp(Number.isFinite(Number(p.opacity)) ? Number(p.opacity) : 1, 0, 1);
      ctx.drawImage(layer, 0, 0, w, h);
      ctx.restore();
    }

    mirrorToFloatingWindow();
  }

  function mirrorToFloatingWindow() {
    if (!floatingWindow || floatingWindow.closed || !floatingCanvas || !floatingCtx || !stageCanvas) return;
    const w = stageCanvas.width || DEFAULT_W;
    const h = stageCanvas.height || DEFAULT_H;
    if (floatingCanvas.width !== w || floatingCanvas.height !== h) {
      floatingCanvas.width = w;
      floatingCanvas.height = h;
    }
    floatingCtx.clearRect(0, 0, w, h);
    floatingCtx.drawImage(stageCanvas, 0, 0, w, h);
  }

  function ensureLoop() {
    if (raf) return;
    raf = requestAnimationFrame(frame);
  }

  function frame() {
    raf = 0;
    frameCounter++;
    const perfNow = performance.now();
    if (lastFramePerfNow > 0) {
      const dt = Math.max(1, perfNow - lastFramePerfNow);
      frameMsEwma = frameMsEwma * 0.88 + dt * 0.12;
      if (stageCanvas) maybeAdjustQuality(stageCanvas.width || DEFAULT_W, stageCanvas.height || DEFAULT_H);
    }
    lastFramePerfNow = perfNow;
    const t = stageTimeSeconds();
    let anyLive = false;
    for (const kind of SOURCE_KINDS) {
      const rec = sources[kind];
      if (rec.status === 'live') {
        anyLive = true;
        analyzeSource(rec, t);
      }
    }
    publishAggregate();

    if (stageEnabled || runtimeBlocks.size > 0) {
      renderStageFrame(t);
    }

    if (anyLive || stageEnabled || runtimeBlocks.size > 0 || (floatingWindow && !floatingWindow.closed)) {
      raf = requestAnimationFrame(frame);
    }
  }

  function resetRuntime() {
    runtimeBlocks.clear();
    generated.clear();
    generatedSeq = 0;
  }

  function normalizeBlendValue(v) {
    if (typeof v === 'string') return v;
    const n = Number(v);
    if (!Number.isFinite(n)) return 'source-over';
    if (n < 0.18) return 'source-over';
    if (n < 0.36) return 'screen';
    if (n < 0.54) return 'multiply';
    if (n < 0.72) return 'overlay';
    if (n < 0.9) return 'difference';
    return 'lighter';
  }

  function syncBlock(opts) {
    if (!opts || !opts.blockId) return;
    const id = String(opts.blockId);
    const voice = String(opts.voice || '');
    if (voice !== 'video' && voice !== 'video-gen') return;

    const state = runtimeBlocks.get(id) || {
      id,
      voice,
      video: {},
      params: {},
      effects: {},
      phase: 0,
      leafState: 'rest',
      lastCommitAt: 0,
      lastGeneratedId: '',
    };

    state.voice = voice;
    state.video = {
      source: normalizeSourceKind(opts.source) || 'camera',
      sourceClipId: opts.sourceClipId ? String(opts.sourceClipId).toLowerCase() : '',
      genSource: opts.genSource ? String(opts.genSource).toLowerCase() : '',
      style: opts.style ? String(opts.style) : '',
      seed: opts.seed ? String(opts.seed) : '',
      cache: opts.cache ? String(opts.cache) : '',
      duration: Number(opts.duration) || 0,
      trigger: opts.trigger || null,
      continuousOnly: Boolean(opts.continuousOnly === true),
    };
    const styleKernel = dominantKernelForStyle(state.video.style);
    if (state.voice === 'video-gen') {
      if (!state._currentKernel) state._currentKernel = styleKernel;
      if (state.video.continuousOnly && !state._lockedKernel) state._lockedKernel = styleKernel;
      if (!state.video.continuousOnly) state._lockedKernel = '';
    }
    const p = opts.params || {};
    const e = opts.effects || {};
    const pick01 = (a, b, fallback) => {
      if (a != null) return clamp01(a);
      if (b != null) return clamp01(b);
      return clamp01(fallback == null ? 0 : fallback);
    };
    state.params = {
      gain: pick01(p.gain, null, 1),
      opacity: clamp01(p.opacity != null ? p.opacity : p.gain != null ? p.gain : 1),
      threshold: pick01(p.threshold, null, 0),
      edges: pick01(p.edges, null, 0),
      // `blur`, `body`, and `space` can come from shared effect rows.
      blur: pick01(p.blur, e.blur, 0),
      posterize: pick01(p.posterize, null, 0),
      invert: pick01(p.invert, null, 0),
      contrast: pick01(p.contrast, null, 0),
      saturate: pick01(p.saturate, null, 0),
      displace: pick01(p.displace, null, 0),
      feedback: pick01(p.feedback, null, 0),
      delay: pick01(p.delay, null, 0),
      slitscan: pick01(p.slitscan, null, 0),
      trail: pick01(p.trail, null, 0),
      mask: pick01(p.mask, null, 0),
      key: pick01(p.key, null, 0),
      color: pick01(p.color, null, 0),
      blend: normalizeBlendValue(p.blend),
      body: pick01(p.body, e.body, 0),
      space: pick01(p.space, e.space, 0),
      monitor: pick01(p.monitor, null, 1),
      listen: pick01(p.listen, null, 1),
      rate: pick01(p.rate, null, 0),
    };
    state.effects = opts.effects || {};
    state.lastSyncAt = Number(opts.time) || stageTimeSeconds();
    runtimeBlocks.set(id, state);
    stageEnabled = true;
    ensureLoop();
  }

  function removeBlock(blockId) {
    if (!blockId) return;
    runtimeBlocks.delete(String(blockId));
  }

  function commitLeaf(opts) {
    if (!opts || !opts.blockId) return;
    const state = runtimeBlocks.get(String(opts.blockId));
    if (!state) return;
    state.lastCommitAt = Number(opts.time) || stageTimeSeconds();
    state.leafState = opts.state || 'hit';
    state.leafToken = opts.token || '*';
    if (state.voice === 'video-gen') {
      const leafIndex = Number.isFinite(Number(opts.sourceLeafIndex))
        ? Number(opts.sourceLeafIndex)
        : (Number.isFinite(Number(opts.leafIndex)) ? Number(opts.leafIndex) : 0);
      if (state.leafState === 'hit') {
        if (!state.video || !state.video.continuousOnly) {
          state._currentKernel = deterministicKernelPick(state, leafIndex, state.leafToken);
        } else if (!state._lockedKernel) {
          state._lockedKernel = dominantKernelForStyle(state.video && state.video.style);
          state._currentKernel = state._lockedKernel;
        }
        queueGenerateFromBlock(state);
      }
    }
  }

  function drawRandomRects(ctx, w, h, seed, amount, colorBias) {
    const steps = Math.max(6, Math.round(6 + amount * 22));
    let v = Math.abs(Math.sin(seed * 19.213 + colorBias * 7.13));
    for (let i = 0; i < steps; i++) {
      v = (v * 9301 + 49297) % 233280;
      const r = v / 233280;
      const x = Math.floor(r * w);
      v = (v * 9301 + 49297) % 233280;
      const y = Math.floor((v / 233280) * h);
      v = (v * 9301 + 49297) % 233280;
      const rw = Math.max(4, Math.floor((v / 233280) * (w * 0.35)));
      v = (v * 9301 + 49297) % 233280;
      const rh = Math.max(4, Math.floor((v / 233280) * (h * 0.35)));
      const hue = Math.round((colorBias * 240 + i * 31) % 360);
      ctx.fillStyle = `hsla(${hue}, 85%, ${35 + Math.round((r * 45))}%, ${0.08 + amount * 0.28})`;
      ctx.fillRect(x, y, rw, rh);
    }
  }

  function queueGenerateFromBlock(state) {
    const delay = 0;
    root.setTimeout(() => {
      const clip = materializeGeneratedClip(state);
      if (!clip) return;
      generated.set(clip.id, clip);
      state.lastGeneratedId = clip.id;
      while (generated.size > MAX_GENERATED) {
        const first = generated.keys().next();
        if (!first || first.done) break;
        generated.delete(first.value);
      }
    }, delay);
  }

  function sourceForGenBlock(state) {
    if (!state || !state.video) return null;
    const src = state.video.genSource || state.video.source || 'camera';
    if (src.startsWith('vgen-')) {
      const gen = resolveGeneratedSource(src);
      if (gen) return gen;
    }
    if (src === 'camera') return readSourceFrame(sources.camera);
    if (src === 'screen') return readSourceFrame(sources.screen);
    if (src === 'file') return readSourceFrame(sources.file) || resolveGeneratedSource(state.video.sourceClipId);
    return readSourceFrame(sources.camera) || readSourceFrame(sources.screen) || readSourceFrame(sources.file);
  }

  function materializeGeneratedClip(state) {
    const src = sourceForGenBlock(state) || stageCanvas || resolveGeneratedSource('vgen-latest');
    const coupling = couplingForState(state);
    const drive = clamp01(coupling.drive);
    if (!src && !stageCanvas) return null;
    const w = src.width || DEFAULT_W;
    const h = src.height || DEFAULT_H;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return null;
    const p = state.params || {};
    const seedRaw = String(state.video && state.video.seed || '') || `${state.id}:${state.lastCommitAt}`;
    const style = String(state.video && state.video.style || '').toLowerCase();
    const kernelName = activeKernelForState(state);
    const { ww, wh, k } = ensureKernelBuffers(state, w, h);
    const sourceCanvas = src || stageCanvas;

    if (kernelName === 'collage') applyCollageKernel(k.workCtx, sourceCanvas, coupling, p, ww, wh, k, state);
    else if (kernelName === 'hallucination') applyHallucinationKernel(k.workCtx, sourceCanvas, coupling, p, ww, wh, k, state);
    else applySurveillanceKernel(k.workCtx, sourceCanvas, coupling, p, ww, wh, k, state);

    ctx.drawImage(k.workCanvas, 0, 0, ww, wh, 0, 0, w, h);
    const flavor = clamp01((Number(p.color) || 0) + drive * 0.2);
    const hue = Math.round((-120 + flavor * 240) + (coupling.centroidX - 0.5) * 160);
    const sat = clamp(0.75 + flavor * 1.8 + coupling.audio.pressure * 0.5, 0.5, 3.4);
    const con = clamp(0.9 + drive * 1.2, 0.8, 2.9);
    ctx.globalCompositeOperation = style === 'collage' ? 'overlay' : style === 'hallucination' ? 'screen' : 'source-over';
    ctx.globalAlpha = clamp(0.16 + drive * 0.26, 0.08, 0.42);
    ctx.filter = `hue-rotate(${hue}deg) contrast(${con}) saturate(${sat})`;
    ctx.drawImage(k.workCanvas, 0, 0, ww, wh, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const id = `vgen-${String(++generatedSeq).padStart(4, '0')}`;
    const provenance = sourceCanvas === stageCanvas ? 'stage' : (state.video && state.video.genSource ? String(state.video.genSource) : (state.video && state.video.source ? String(state.video.source) : 'camera'));
    return {
      id,
      canvas,
      createdAt: nowIso(),
      meta: {
        kernel: kernelName,
        style: state.video && state.video.style || '',
        seed: state.video && state.video.seed || '',
        source: provenance,
        timestamp: nowIso(),
        coupling: {
          drive: Number(drive.toFixed(4)),
          rupture: Number(coupling.rupture.toFixed(4)),
          motion: Number((coupling.video && coupling.video.motion ? coupling.video.motion : 0).toFixed(4)),
        },
      },
    };
  }

  function hashString(text) {
    let h = 2166136261 >>> 0;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function listGenerated() {
    return Array.from(generated.values()).map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      meta: item.meta || {},
    }));
  }

  function getGeneratedIds() {
    return Array.from(generated.keys());
  }

  function setSourcePreference(kindLike) {
    const kind = normalizeSourceKind(kindLike);
    if (!kind) return;
    sourcePreference = kind;
  }

  function stateSnapshot() {
    return {
      stage: {
        enabled: Boolean(stageEnabled),
        width: stageCanvas ? stageCanvas.width : 0,
        height: stageCanvas ? stageCanvas.height : 0,
        floatingOpen: Boolean(floatingWindow && !floatingWindow.closed),
        qualityScale: Number(qualityScale.toFixed(3)),
        frameMs: Number(frameMsEwma.toFixed(3)),
      },
      sources: SOURCE_KINDS.reduce((acc, kind) => {
        const rec = sources[kind];
        acc[kind] = {
          status: rec.status,
          label: rec.label,
          error: rec.error,
          updatedAt: rec.lastSignals && rec.lastSignals.updatedAt ? rec.lastSignals.updatedAt : '',
        };
        return acc;
      }, {}),
      generated: listGenerated(),
      runtimeBlocks: runtimeBlocks.size,
    };
  }

  function openFloatingStageWindow() {
    if (floatingWindow && !floatingWindow.closed) {
      floatingWindow.focus();
      return true;
    }
    const win = root.open('', 'repl-video-stage', 'popup=yes,width=980,height=620,resizable=yes');
    if (!win) return false;
    floatingWindow = win;
    const doc = win.document;
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>REPL Video Stage</title>' +
      '<style>html,body{margin:0;height:100%;background:#111;color:#ddd;font:12px monospace}canvas{display:block;width:100%;height:100%;background:#000}.meta{position:fixed;left:8px;top:8px;background:rgba(0,0,0,.55);padding:4px 6px;border:1px solid #555}</style>' +
      '</head><body><canvas id="stage"></canvas><div class="meta">repl video stage</div></body></html>'
    );
    doc.close();
    floatingCanvas = doc.getElementById('stage');
    floatingCtx = floatingCanvas ? floatingCanvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
    win.addEventListener('beforeunload', () => {
      floatingWindow = null;
      floatingCanvas = null;
      floatingCtx = null;
    });
    ensureLoop();
    return true;
  }

  function closeFloatingStageWindow() {
    if (floatingWindow && !floatingWindow.closed) {
      try { floatingWindow.close(); } catch (_) {}
    }
    floatingWindow = null;
    floatingCanvas = null;
    floatingCtx = null;
  }

  function disconnectBlock(blockId) {
    removeBlock(blockId);
  }

  function cleanup() {
    for (const kind of SOURCE_KINDS) stopSource(kind);
    resetRuntime();
    closeFloatingStageWindow();
  }

  root.VideoVoice = {
    setAudioContext,
    setStageCanvas,
    openFloatingStageWindow,
    closeFloatingStageWindow,
    setSourcePreference,
    enableSource,
    stopSource,
    attachFile,
    syncBlock,
    commitLeaf,
    disconnectBlock,
    resetRuntime,
    cleanup,
    getState: stateSnapshot,
    listGenerated,
    getGeneratedIds,
  };
})(window);
