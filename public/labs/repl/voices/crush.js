// Shared damage/detail DSP for REPL voices.
// `crush` is literal bit depth. `resolution` is a linear filter/EQ aperture.

(function (root) {
  'use strict';

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

  function normalizeBits(value) {
    const n = numericParamValue(value, 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(clamp(n, 4, 16));
  }

  function normalizeResolution(value) {
    return clamp(numericParamValue(value, 0), 0, 1);
  }

  function quantizeSample(sample, bits) {
    const safeBits = normalizeBits(bits);
    if (safeBits <= 0) return sample;
    const steps = Math.max(1, Math.pow(2, safeBits) - 1);
    const bipolar = clamp(sample, -1, 1);
    const unsigned = (bipolar + 1) * 0.5;
    return (Math.round(unsigned * steps) / steps) * 2 - 1;
  }

  function connect(audioCtx, signal, opts) {
    if (!audioCtx || !signal) return signal;

    const bits = normalizeBits(opts && opts.crush);
    const crushActive = bits > 0 && bits < 16;
    const resolution = normalizeResolution(opts && opts.resolution);
    if (!crushActive && resolution <= 0) return signal;

    let current = signal;

    if (crushActive && audioCtx.createScriptProcessor) {
      const processor = audioCtx.createScriptProcessor(512, 2, 2);

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer;
        const output = event.outputBuffer;
        const channels = Math.max(1, output.numberOfChannels);

        for (let ch = 0; ch < channels; ch++) {
          const source = input.getChannelData(Math.min(ch, input.numberOfChannels - 1));
          const dest = output.getChannelData(ch);

          for (let i = 0; i < dest.length; i++) {
            dest[i] = quantizeSample(source[i] || 0, bits);
          }
        }
      };

      current.connect(processor);
      current = processor;
    }

    if (resolution > 0 && audioCtx.createBiquadFilter) {
      const aperture = audioCtx.createBiquadFilter();
      aperture.type = 'lowpass';

      const cutoff = 650 + Math.pow(resolution, 1.55) * 17250;
      aperture.frequency.setValueAtTime(clamp(cutoff, 650, 17900), audioCtx.currentTime);
      aperture.Q.setValueAtTime(0.55 + resolution * 0.42, audioCtx.currentTime);

      current.connect(aperture);
      current = aperture;
    }

    current._replCrushActive = current !== signal;
    return current;
  }

  root.ReplCrush = {
    connect,
    normalizeBits,
    normalizeResolution,
    quantizeSample,
  };
})(window);
