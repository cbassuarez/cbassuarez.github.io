// Pluck voice - short, clear pitched synth body for the REPL.
// One committed leaf schedules one bright percussive pluck.

(function (root) {
  'use strict';

  const ACTIVE = new Set();
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

  function bitcrushCurve(bits) {
    if (CURVES.has(bits)) return CURVES.get(bits);
    const samples = 4096;
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

  function playPluck(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;

    const freq = Number(opts.freq);
    if (!Number.isFinite(freq) || freq <= 0) return false;

    const time = Number.isFinite(opts.time) ? Math.max(opts.time, audioCtx.currentTime) : audioCtx.currentTime;
    const octave = clamp(Math.round(numericParamValue(opts.octave, 0)), -2, 2);
    const octaveMul = Math.pow(2, octave);
    const playFreq = clamp(freq * octaveMul, 20, 12000);
    const freqStart = Number(opts.freqStart);
    const freqEnd = Number(opts.freqEnd);
    const glideSecRaw = Number(opts.glideSec);
    const gain = clamp(numericParamValue(opts.gain, 0.75), 0, 1.5);
    const force = clamp(numericParamValue(opts.force, 0.7), 0, 1);
    const tone = clamp(numericParamValue(opts.tone, 0.7), 0, 1);
    const harm = clamp(Math.round(numericParamValue(opts.harm, 2)), 0, 4);
    const decay = clamp(numericParamValue(opts.decay, 0.7), 0.035, 4);
    const duration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
      ? Math.min(Number(opts.gateDuration), decay)
      : decay;
    const glideSec = Number.isFinite(glideSecRaw) && glideSecRaw > 0
      ? Math.min(glideSecRaw, duration)
      : 0;
    const glideStart = Number.isFinite(freqStart) && freqStart > 0
      ? clamp(freqStart * octaveMul, 20, 12000)
      : playFreq;
    const glideEnd = Number.isFinite(freqEnd) && freqEnd > 0
      ? clamp(freqEnd * octaveMul, 20, 12000)
      : playFreq;
    const useGlide = glideSec > 0 && Math.abs(glideEnd - glideStart) > 0.0001;
    const stopTime = Math.max(time + 0.025, time + duration + 0.05);
    const active = { oscillators: [], env: null, startTime: time, pending: 0 };
    ACTIVE.add(active);

    const env = audioCtx.createGain();
    active.env = env;
    const peak = clamp(gain * (0.28 + force * 0.42), 0, 0.85);
    const attack = Math.min(0.01, Math.max(0.0025, duration * 0.08));
    const bodyEnd = Math.max(time + attack + 0.006, time + duration);
    try {
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(peak, time + attack);
      env.gain.exponentialRampToValueAtTime(0.0008, bodyEnd);
    } catch (_) {
      env.gain.value = 0;
    }

    const partials = [
      [1, 1, 'triangle'],
      [2, 0.32, 'sine'],
      [3, 0.18, 'sine'],
      [4, 0.10, 'sine'],
      [5, 0.06, 'sine'],
    ];

    for (let i = 0; i <= harm && i < partials.length; i++) {
      const [mul, amp, type] = partials[i];
      const osc = audioCtx.createOscillator();
      const pg = audioCtx.createGain();
      osc.type = type;
      const startHz = Math.max(20, glideStart * mul);
      const endHz = Math.max(20, (useGlide ? glideEnd : playFreq) * mul);
      osc.frequency.setValueAtTime(startHz, time);
      if (useGlide) {
        const glideEndTime = Math.max(time + 0.006, time + glideSec);
        osc.frequency.exponentialRampToValueAtTime(endHz, glideEndTime);
      }
      pg.gain.value = amp;
      osc.connect(pg).connect(env);
      active.oscillators.push(osc);
      active.pending += 1;
      osc.onended = () => {
        active.pending -= 1;
        if (active.pending <= 0) unregister(active);
      };
      try {
        osc.start(time);
        osc.stop(stopTime);
      } catch (_) {
        active.pending -= 1;
      }
    }

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650 + tone * 9000 + force * 1600, time);
    filter.Q.setValueAtTime(0.7 + tone * 2.8, time);
    let signal = env;
    signal.connect(filter);
    signal = filter;

    if (root.ReplCrush && root.ReplCrush.connect) {
      signal = root.ReplCrush.connect(audioCtx, signal, {
        crush: opts.crush,
        resolution: opts.resolution,
      });
      if (signal && signal._replCrushActive) active.crushNode = signal;
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
    return true;
  }

  function stopAll(when) {
    const t = Number.isFinite(when) ? when : 0;
    for (const active of Array.from(ACTIVE)) {
      if (!active) continue;
      if (active.env && active.env.gain) {
        try {
          active.env.gain.cancelScheduledValues(t);
          active.env.gain.setValueAtTime(active.env.gain.value || 0, t);
          active.env.gain.linearRampToValueAtTime(0, t + 0.02);
        } catch (_) {
          try { active.env.gain.value = 0; } catch (__) {}
        }
      }
      for (const osc of active.oscillators || []) {
        try { osc.stop(Math.max(t + 0.02, (active.startTime || t) + 0.001)); } catch (_) {}
      }
      unregister(active);
    }
  }

  root.PluckVoice = { playPluck, stopAll };
})(window);
