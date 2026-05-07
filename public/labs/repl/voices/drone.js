// Drone voice - persistent per-block oscillator body.
// Committed pitch leaves retune/re-envelope the block's ongoing sound.

(function (root) {
  'use strict';

  const DRONES = new Map();

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
      const end = start + (Number.isFinite(dur) && dur > 0 ? dur : 0.5);
      const from = clamp(numericParamValue(value.from, fb), min, max);
      const to = clamp(numericParamValue(value.to, from), min, max);
      try {
        param.cancelScheduledValues(start);
        param.setValueAtTime(from, start);
        param.linearRampToValueAtTime(to, Math.max(start + 0.02, end));
        return;
      } catch (_) {
        try { param.value = from; } catch (__) {}
        return;
      }
    }

    const scalar = clamp(numericParamValue(value, fb), min, max);
    try { param.setTargetAtTime(scalar, start, 0.035); } catch (_) {
      try { param.value = scalar; } catch (__) {}
    }
  }

  function makeDrone(audioCtx, masterBus, key, time) {
    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0, time);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, time);
    filter.Q.setValueAtTime(0.8, time);

    const mix = audioCtx.createGain();
    mix.gain.setValueAtTime(1, time);

    const pan = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
    const oscillators = [];
    const gains = [];
    const defs = [
      [1, 1, 'sine'],
      [2, 0.18, 'sine'],
      [3, 0.08, 'triangle'],
    ];

    for (const [mul, amp, type] of defs) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(110 * mul, time);
      g.gain.setValueAtTime(amp, time);
      osc.connect(g).connect(mix);
      osc.start(time);
      oscillators.push({ osc, mul });
      gains.push(g);
    }

    mix.connect(filter).connect(env);
    if (pan) {
      env.connect(pan).connect(masterBus);
    } else {
      env.connect(masterBus);
    }

    const drone = { key, env, filter, pan, oscillators, gains, masterBus, startTime: time };
    DRONES.set(key, drone);
    return drone;
  }

  function playDrone(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;

    const freq = Number(opts.freq);
    if (!Number.isFinite(freq) || freq <= 0) return false;

    const key = String((opts && opts.blockId) || 'default');
    const time = Number.isFinite(opts.time) ? Math.max(opts.time, audioCtx.currentTime) : audioCtx.currentTime;
    const drone = DRONES.get(key) || makeDrone(audioCtx, masterBus, key, time);

    const octave = clamp(Math.round(numericParamValue(opts.octave, 0)), -2, 2);
    const octaveMul = Math.pow(2, octave);
    const baseFreq = clamp(freq * octaveMul, 18, 8000);
    const freqStart = Number(opts.freqStart);
    const freqEnd = Number(opts.freqEnd);
    const glideSecRaw = Number(opts.glideSec);
    const gain = clamp(numericParamValue(opts.gain, 0.45), 0, 1.5);
    const tone = clamp(numericParamValue(opts.tone, 0.45), 0, 1);
    const harm = clamp(Math.round(numericParamValue(opts.harm, 2)), 0, 4);
    const decay = clamp(numericParamValue(opts.decay, 2.8), 0.1, 16);
    const duration = Number.isFinite(Number(opts.eventDuration)) && Number(opts.eventDuration) > 0
      ? Number(opts.eventDuration)
      : decay;
    const glideSec = Number.isFinite(glideSecRaw) && glideSecRaw > 0
      ? Math.min(glideSecRaw, duration)
      : 0;
    const glideStart = Number.isFinite(freqStart) && freqStart > 0
      ? clamp(freqStart * octaveMul, 18, 8000)
      : baseFreq;
    const glideEnd = Number.isFinite(freqEnd) && freqEnd > 0
      ? clamp(freqEnd * octaveMul, 18, 8000)
      : baseFreq;
    const useGlide = glideSec > 0 && Math.abs(glideEnd - glideStart) > 0.0001;

    for (const item of drone.oscillators) {
      try {
        item.osc.frequency.cancelScheduledValues(time);
        const startHz = Math.max(18, (useGlide ? glideStart : baseFreq) * item.mul);
        const endHz = Math.max(18, (useGlide ? glideEnd : baseFreq) * item.mul);
        item.osc.frequency.setValueAtTime(startHz, time);
        if (useGlide) {
          item.osc.frequency.linearRampToValueAtTime(endHz, Math.max(time + 0.01, time + glideSec));
        } else {
          item.osc.frequency.setTargetAtTime(endHz, time, 0.06);
        }
      } catch (_) {}
    }

    drone.gains.forEach((g, i) => {
      const partial = i === 0 ? 1 : (i <= harm ? (0.20 / i) : 0.0001);
      try { g.gain.setTargetAtTime(partial, time, 0.08); } catch (_) {}
    });

    try {
      drone.filter.frequency.cancelScheduledValues(time);
      drone.filter.frequency.setTargetAtTime(360 + tone * 7800, time, 0.08);
      drone.filter.Q.setTargetAtTime(0.5 + tone * 2.4, time, 0.08);
    } catch (_) {}

    if (drone.pan) {
      const panVal = clamp(numericParamValue(opts.pan, 0), -1, 1);
      const panDur = Number.isFinite(Number(opts.panGestureDuration)) && Number(opts.panGestureDuration) > 0
        ? Number(opts.panGestureDuration)
        : duration;
      applyAudioParamValue(drone.pan.pan, opts.pan, time, panDur, -1, 1, panVal);
    }

    const target = clamp(gain * 0.22, 0, 0.42);
    const releaseStart = time + Math.max(0.08, duration);
    try {
      drone.env.gain.cancelScheduledValues(time);
      drone.env.gain.setTargetAtTime(target, time, 0.08);
      drone.env.gain.setTargetAtTime(target * 0.82, releaseStart, Math.max(0.18, decay * 0.35));
    } catch (_) {
      try { drone.env.gain.value = target; } catch (__) {}
    }

    return true;
  }

  function stopAll(when) {
    const t = Number.isFinite(when) ? when : 0;
    for (const drone of Array.from(DRONES.values())) {
      if (!drone) continue;
      if (drone.env && drone.env.gain) {
        try {
          drone.env.gain.cancelScheduledValues(t);
          drone.env.gain.setValueAtTime(drone.env.gain.value || 0, t);
          drone.env.gain.linearRampToValueAtTime(0, t + 0.04);
        } catch (_) {
          try { drone.env.gain.value = 0; } catch (__) {}
        }
      }
      for (const item of drone.oscillators || []) {
        try { item.osc.stop(Math.max(t + 0.045, (drone.startTime || t) + 0.001)); } catch (_) {}
      }
    }
    DRONES.clear();
  }

  root.DroneVoice = { playDrone, stopAll };
})(window);
