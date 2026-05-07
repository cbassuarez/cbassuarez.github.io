// Pulse voice - low CPU metronome tick/tock body for committed scheduler leaves.

(function (root) {
  'use strict';

  const ACTIVE = new Set();

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
      const end = start + (Number.isFinite(dur) && dur > 0 ? dur : 0.1);
      const from = clamp(numericParamValue(value.from, fb), min, max);
      const to = clamp(numericParamValue(value.to, from), min, max);
      try {
        param.cancelScheduledValues(start);
        param.setValueAtTime(from, start);
        param.linearRampToValueAtTime(to, Math.max(start + 0.004, end));
        return;
      } catch (_) {
        try { param.value = from; } catch (__) {}
      }
    }
    const scalar = clamp(numericParamValue(value, fb), min, max);
    try { param.setValueAtTime(scalar, start); } catch (_) {
      try { param.value = scalar; } catch (__) {}
    }
  }

  function trackNode(active, node) {
    if (active && node) active.nodes.push(node);
    return node;
  }

  function unregister(active) {
    if (!active || active.stopped) return;
    active.stopped = true;
    if (Array.isArray(active.nodes)) {
      for (const node of active.nodes) {
        try { node.disconnect(); } catch (_) {}
      }
    }
    if (active.crushNode) {
      try { active.crushNode.disconnect(); } catch (_) {}
      active.crushNode = null;
    }
    ACTIVE.delete(active);
  }

  function playPulse(opts) {
    const audioCtx = opts && opts.audioCtx;
    const masterBus = opts && opts.masterBus;
    if (!audioCtx || !masterBus) return false;

    const time = Number.isFinite(opts.time) ? Math.max(opts.time, audioCtx.currentTime) : audioCtx.currentTime;
    const gain = clamp(numericParamValue(opts.gain, 0.7), 0, 1.5);
    const tone = clamp(numericParamValue(opts.tone, 0.58), 0, 1);
    const force = clamp(numericParamValue(opts.force, 0.7), 0, 1.25);
    const decayControl = clamp(numericParamValue(opts.decay, 0.8), 0.05, 8);
    const decayNorm = clamp((decayControl - 0.4) / 7.6, 0, 1);
    const baseDuration = 0.028 + Math.pow(decayNorm, 0.85) * 0.26;
    const duration = Number.isFinite(Number(opts.gateDuration)) && Number(opts.gateDuration) > 0
      ? Math.max(0.01, Math.min(Number(opts.gateDuration), baseDuration))
      : baseDuration;
    const accent = clamp(0.45 + force * 0.75, 0.2, 1.2);
    const bodyFreq = clamp(620 + tone * 720 + force * 160, 180, 2200);
    const bodyEndFreq = clamp(bodyFreq * (0.42 + (1 - tone) * 0.24), 90, bodyFreq);
    const attackFreq = clamp(1600 + tone * 2600 + force * 440, 900, 7600);
    const attackDecay = clamp(0.0035 + (1 - force) * 0.005 + duration * 0.15, 0.004, 0.02);
    const stopTime = Math.max(time + 0.02, time + duration + 0.09);
    const active = {
      bodyOsc: null,
      attackOsc: null,
      bodyEnv: null,
      attackEnv: null,
      nodes: [],
      crushNode: null,
      startTime: time,
      endedCount: 0,
      stopped: false,
    };

    const mix = trackNode(active, audioCtx.createGain());
    const bodyOsc = trackNode(active, audioCtx.createOscillator());
    const bodyFilter = trackNode(active, audioCtx.createBiquadFilter());
    const bodyEnv = trackNode(active, audioCtx.createGain());
    const attackOsc = trackNode(active, audioCtx.createOscillator());
    const attackFilter = trackNode(active, audioCtx.createBiquadFilter());
    const attackEnv = trackNode(active, audioCtx.createGain());

    active.bodyOsc = bodyOsc;
    active.attackOsc = attackOsc;
    active.bodyEnv = bodyEnv;
    active.attackEnv = attackEnv;

    bodyOsc.type = tone > 0.63 ? 'triangle' : 'sine';
    attackOsc.type = force > 0.6 ? 'square' : 'triangle';

    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(clamp(1050 + tone * 1900, 500, 4200), time);
    bodyFilter.Q.setValueAtTime(clamp(0.35 + tone * 1.2, 0.2, 3), time);

    attackFilter.type = 'highpass';
    attackFilter.frequency.setValueAtTime(clamp(1200 + tone * 2200, 600, 7000), time);
    attackFilter.Q.setValueAtTime(clamp(0.5 + force * 1.4, 0.3, 5), time);

    bodyOsc.frequency.setValueAtTime(bodyFreq, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(
      Math.max(80, bodyEndFreq),
      time + Math.max(0.01, duration * 0.92)
    );

    attackOsc.frequency.setValueAtTime(attackFreq, time);
    attackOsc.frequency.exponentialRampToValueAtTime(
      Math.max(700, attackFreq * 0.62),
      time + attackDecay
    );

    const bodyPeak = clamp(gain * (0.10 + 0.30 * accent), 0, 1.0);
    const attackPeak = clamp(gain * (0.05 + 0.13 * tone + 0.08 * accent), 0, 0.72);

    try {
      bodyEnv.gain.setValueAtTime(0, time);
      bodyEnv.gain.linearRampToValueAtTime(bodyPeak, time + 0.0015);
      bodyEnv.gain.exponentialRampToValueAtTime(0.0009, time + Math.max(0.01, duration));

      attackEnv.gain.setValueAtTime(0, time);
      attackEnv.gain.linearRampToValueAtTime(attackPeak, time + 0.0007);
      attackEnv.gain.exponentialRampToValueAtTime(0.0001, time + attackDecay);
    } catch (_) {
      bodyEnv.gain.value = 0;
      attackEnv.gain.value = 0;
    }

    bodyOsc.connect(bodyFilter);
    bodyFilter.connect(bodyEnv);
    bodyEnv.connect(mix);

    attackOsc.connect(attackFilter);
    attackFilter.connect(attackEnv);
    attackEnv.connect(mix);

    let signal = mix;
    if (root.ReplCrush && root.ReplCrush.connect) {
      signal = root.ReplCrush.connect(audioCtx, signal, {
        crush: opts.crush,
        resolution: opts.resolution,
      });
      if (signal && signal._replCrushActive) active.crushNode = signal;
    }

    if (audioCtx.createStereoPanner) {
      const pan = trackNode(active, audioCtx.createStereoPanner());
      const panVal = clamp(numericParamValue(opts.pan, 0), -1, 1);
      const panDuration = Number.isFinite(Number(opts.panGestureDuration)) && Number(opts.panGestureDuration) > 0
        ? Number(opts.panGestureDuration)
        : duration;
      applyAudioParamValue(pan.pan, opts.pan, time, panDuration, -1, 1, panVal);
      signal.connect(pan);
      signal = pan;
    }

    signal.connect(masterBus);
    ACTIVE.add(active);

    const onEnded = () => {
      active.endedCount += 1;
      if (active.endedCount >= 2) unregister(active);
    };
    bodyOsc.onended = onEnded;
    attackOsc.onended = onEnded;

    try {
      bodyOsc.start(time);
      attackOsc.start(time);
      bodyOsc.stop(stopTime);
      attackOsc.stop(Math.min(stopTime, time + Math.max(0.012, attackDecay + 0.01)));
      return true;
    } catch (_) {
      unregister(active);
      return false;
    }
  }

  function stopAll(when) {
    const t = Number.isFinite(when) ? when : 0;
    for (const active of Array.from(ACTIVE)) {
      if (!active || active.stopped) continue;

      if (active.bodyEnv && active.bodyEnv.gain) {
        try {
          active.bodyEnv.gain.cancelScheduledValues(t);
          active.bodyEnv.gain.setValueAtTime(active.bodyEnv.gain.value || 0, t);
          active.bodyEnv.gain.linearRampToValueAtTime(0, t + 0.015);
        } catch (_) {
          try { active.bodyEnv.gain.value = 0; } catch (__) {}
        }
      }
      if (active.attackEnv && active.attackEnv.gain) {
        try {
          active.attackEnv.gain.cancelScheduledValues(t);
          active.attackEnv.gain.setValueAtTime(active.attackEnv.gain.value || 0, t);
          active.attackEnv.gain.linearRampToValueAtTime(0, t + 0.01);
        } catch (_) {
          try { active.attackEnv.gain.value = 0; } catch (__) {}
        }
      }

      if (active.bodyOsc) {
        try { active.bodyOsc.stop(Math.max(t + 0.015, (active.startTime || t) + 0.001)); } catch (_) {}
      }
      if (active.attackOsc) {
        try { active.attackOsc.stop(Math.max(t + 0.015, (active.startTime || t) + 0.001)); } catch (_) {}
      }

      unregister(active);
    }
  }

  root.PulseVoice = { playPulse, stopAll };
})(window);
