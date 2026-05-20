import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  useReducedMotion,
} from 'framer-motion';

const MARKER_SIZE = 6;

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// A single straight rule that tracks the real visit lifecycle:
//   loading    -> fetching /api/corpus/state   -> indeterminate sweep
//   accepting  -> the 2s visible dwell         -> determinate fill 0->1
//   qualifying -> POST /api/corpus/qualify     -> fill held, marker pulse
//   blocked    -> quota/rate/upstream withheld -> broken rule, no countdown
//   settled    -> done                         -> fill dimmed, marker static
// progress is a MotionValue: script.js pushes it every animation frame, so it
// updates the DOM directly without a React re-render.
function VisitInstrument({ phase, progress }) {
  const prefersReduced = useReducedMotion();
  const wrapRef = useRef(null);
  const width = useMotionValue(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => width.set(el.offsetWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const markerX = useTransform(
    [progress, width],
    ([p, w]) => p * w - MARKER_SIZE / 2,
  );

  const idle = phase === 'idle';
  const loading = phase === 'loading';
  const qualifying = phase === 'qualifying';
  const blocked = phase === 'blocked' || phase === 'failed' || phase === 'rate-limited';
  const settled = phase === 'settled';

  const showSweep = loading && !prefersReduced;
  const showMarker = !idle && !loading && !blocked;
  const fillOpacity = idle || loading || blocked ? 0 : settled ? 0.4 : 0.72;
  const markerOpacity = settled ? 0.4 : 0.92;
  const pulsing = qualifying && !prefersReduced;

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      <div className="visit-track" />
      <motion.div
        className="visit-fill"
        style={{ scaleX: progress }}
        animate={{ opacity: fillOpacity }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      />
      {showSweep ? <div className="visit-sweep" /> : null}
      {blocked ? (
        <motion.div
          className="visit-block"
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={prefersReduced ? { opacity: 0.48 } : { opacity: [0, 0.82, 0.48] }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
        >
          <motion.span
            className="visit-block-segment visit-block-segment-left"
            initial={prefersReduced ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.34, ease: 'easeOut' }}
          />
          <motion.span
            className="visit-block-segment visit-block-segment-right"
            initial={prefersReduced ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.34, ease: 'easeOut' }}
          />
          <motion.span
            className="visit-block-stop"
            initial={prefersReduced ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.24, delay: prefersReduced ? 0 : 0.16, ease: 'easeOut' }}
          />
        </motion.div>
      ) : null}
      {showMarker ? (
        <motion.div
          className="visit-marker"
          style={{ x: markerX }}
          animate={{ opacity: pulsing ? [0.9, 0.32, 0.9] : markerOpacity }}
          transition={
            pulsing
              ? { duration: 1, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.28, ease: 'easeOut' }
          }
        />
      ) : null}
    </div>
  );
}

export function mount(container) {
  if (!container) {
    return {
      setPhase() {},
      setProgress() {},
      destroy() {},
    };
  }

  const root = createRoot(container);
  const progress = motionValue(0);
  const state = { phase: 'idle' };

  function render() {
    root.render(<VisitInstrument phase={state.phase} progress={progress} />);
  }

  render();

  return {
    setPhase(phase) {
      state.phase = String(phase || 'idle');
      render();
    },
    setProgress(value) {
      // Direct MotionValue write — no React render, no per-frame reconciliation.
      progress.set(clamp01(value));
    },
    destroy() {
      root.unmount();
    },
  };
}
