// Noise voice - burst/texture body for the REPL.
// One committed leaf schedules one filtered noise gesture.

(function (root) {
  'use strict';

  const ACTIVE = new Set();
  const BUFFERS = new WeakMap();
  const CURVES = new Map();

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

  function applyAudioParamValue(param, value, time, duration, lo, hi, fallback) {
    if (!param) return;
    const start = Number.isFinite(time) ? time : 0;
    const min = Number.isFinite(lo) ? lo : -Infinity;
    const max = Number.isFinite(hi) ? hi : Infinity;
    const fb = Number.isFinite(fallback) ? fallback : 0;

    if (isParamGesture(value)) {
      if (value.mode === 'continuous-random' && root.ReplGestures && typeof root.ReplGestures.applyContinuousRandom === 'function') {
        if (root.ReplGestures.applyContinuousRandom(param, value, start, duration, lo, hi, fb)) return;
      }
      const dur = Number(duration);
      const end = start + (Number.isFinite(dur) && dur > 0 ? dur : 0.25);
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
    try { param.setValueAtTime(scalar, start); } catch (_) {
      try { param.value = scalar; } catch (__) {}
    }
  }

  function noiseBuffer(audioCtx) {
    if (BUFFERS.has(audioCtx)) return BUFFERS.get(audioCtx);
    const length = Math.max(1, Math.floor(audioCtx.sampleRate * 2));
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.62 + white * 0.38;
      data[i] = white * 0.72 + last * 0.28;
    }
    BUFFERS.set(audioCtx, buffer);
    return buffer;
  }

  function bitcrushCurve(bits) {
    if (CURVES.has(bits)) return CURVES.get(bits);
    const samples = 2048;
    const curve = new Float32Array(samples);
    const levels = Math.pow(2, bits);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.round(x * levels) / levels;
    }
    CURVES.set(bits, curve);
    return curve;
  }

  function unregister(active) {
    if (active && active.crushNode) {
      try { active.crushNode.disconnect(); } catch (_) {}
      active.crushNode = null;
    }
    if (active) ACTIVE.delete(active);
  }

  function playNoise(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus || !audioCtx.createBuffer) return false;

    const time = Number.isFinite(opts.time) ? Math.max(opts.time, audioCtx.currentTime) : audioCtx.currentTime;
    const held = Boolean(opts.held);
    const eventDuration = Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
      ? Number(opts.eventDuration)
      : 0.25;
    const decay = clamp(numericParamValue(opts.decay, held ? eventDuration : 0.22), 0.025, 8);
    const duration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
      ? Number(opts.gateDuration)
      : (held ? Math.max(eventDuration, Math.min(decay, eventDuration * 1.25)) : Math.min(decay, Math.max(0.06, eventDuration)));
    const gain = clamp(numericParamValue(opts.gain, 0.65), 0, 1.5);
    const tone = clamp(numericParamValue(opts.tone, 0.55), 0, 1);
    const force = clamp(numericParamValue(opts.force, 0.65), 0, 1);
    const stopTime = Math.max(time + 0.025, time + duration + 0.04);

    const source = audioCtx.createBufferSource();
    source.buffer = noiseBuffer(audioCtx);
    source.loop = true;

    const env = audioCtx.createGain();
    const peak = clamp(gain * (held ? 0.24 : 0.46) * (0.65 + force * 0.55), 0, 0.9);
    const attack = held ? Math.min(0.04, duration * 0.18) : Math.min(0.008, duration * 0.12);
    const release = Math.min(0.11, Math.max(0.012, duration * 0.28));
    const releaseStart = Math.max(time + attack + 0.001, time + duration - release);

    try {
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(peak, time + attack);
      env.gain.setValueAtTime(held ? peak * 0.72 : peak * 0.38, releaseStart);
      env.gain.linearRampToValueAtTime(0, time + duration);
    } catch (_) {
      env.gain.value = 0;
    }

    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(35 + tone * 420, time);
    highpass.Q.setValueAtTime(0.4 + force * 0.8, time);

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(450 + tone * 11000, time);
    lowpass.Q.setValueAtTime(0.55 + force * 3.5, time);

    source.connect(env).connect(highpass).connect(lowpass);
    let signal = lowpass;

    if (root.ReplCrush && root.ReplCrush.connect) {
      signal = root.ReplCrush.connect(audioCtx, signal, {
        crush: opts.crush,
        resolution: opts.resolution,
      });
      if (signal && signal._replCrushActive) source._replCrushNode = signal;
    }

    if (audioCtx.createStereoPanner) {
      const pan = audioCtx.createStereoPanner();
      const panVal = clamp(numericParamValue(opts.pan, 0), -1, 1);
      const panDur = Number.isFinite(Number(opts.panGestureDuration)) && Number(opts.panGestureDuration) > 0
        ? Number(opts.panGestureDuration)
        : duration;
      applyAudioParamValue(pan.pan, opts.pan, time, panDur, -1, 1, panVal);
      signal.connect(pan);
      signal = pan;
    }

    signal.connect(masterBus);

    const active = { source, env, startTime: time, crushNode: source._replCrushNode || null };
    ACTIVE.add(active);
    source.onended = () => unregister(active);
    try {
      source.start(time);
      source.stop(stopTime);
      return true;
    } catch (_) {
      unregister(active);
      return false;
    }
  }

  function stopAll(when) {
    const t = Number.isFinite(when) ? when : 0;
    for (const active of Array.from(ACTIVE)) {
      if (!active) continue;
      if (active.env && active.env.gain) {
        try {
          active.env.gain.cancelScheduledValues(t);
          active.env.gain.setValueAtTime(active.env.gain.value || 0, t);
          active.env.gain.linearRampToValueAtTime(0, t + 0.025);
        } catch (_) {
          try { active.env.gain.value = 0; } catch (__) {}
        }
      }
      if (active.source) {
        try { active.source.stop(Math.max(t + 0.025, (active.startTime || t) + 0.001)); } catch (_) {}
      }
      unregister(active);
    }
  }

  root.NoiseVoice = { playNoise, stopAll };
})(window);
