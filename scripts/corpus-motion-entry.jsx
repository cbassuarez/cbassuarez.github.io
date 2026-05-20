import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  motion,
  motionValue,
  useTransform,
  useReducedMotion,
} from 'framer-motion';

const PIP_COUNT = 5;
const PIPS = Array.from({ length: PIP_COUNT }, (_, index) => index);

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// Five small pips track the real visit lifecycle:
//   loading    -> fetching /api/corpus/state   -> one walking pip
//   accepting  -> the 2s visible dwell         -> pips light by progress
//   qualifying -> POST /api/corpus/qualify     -> all pips hold/pulse
//   blocked    -> quota/rate/upstream withheld -> broken static pattern
//   settled    -> done                         -> pips dimmed, static
// progress is a MotionValue: script.js pushes it every animation frame, so it
// updates the DOM directly without a React re-render.
function VisitPip({ index, phase, progress, prefersReduced }) {
  const threshold = (index + 1) / PIP_COUNT;
  const progressOpacity = useTransform(
    progress,
    [Math.max(0, threshold - 0.18), threshold],
    [0.2, 0.9],
  );
  const progressScale = useTransform(
    progress,
    [Math.max(0, threshold - 0.18), threshold],
    [0.82, 1.12],
  );

  const idle = phase === 'idle';
  const loading = phase === 'loading';
  const accepting = phase === 'accepting';
  const qualifying = phase === 'qualifying';
  const blocked = phase === 'blocked' || phase === 'failed' || phase === 'rate-limited';
  const settled = phase === 'settled';

  if (accepting) {
    return (
      <motion.span
        className="visit-pip"
        style={{ opacity: progressOpacity, scale: progressScale }}
      />
    );
  }

  if (loading && !prefersReduced) {
    return (
      <motion.span
        className="visit-pip"
        animate={{ opacity: [0.18, 0.85, 0.18], scale: [0.82, 1.2, 0.82] }}
        transition={{
          duration: 0.9,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: index * 0.12,
          repeatDelay: 0.12,
        }}
      />
    );
  }

  if (qualifying && !prefersReduced) {
    return (
      <motion.span
        className="visit-pip"
        animate={{ opacity: [0.82, 0.46, 0.82], scale: [1.08, 0.94, 1.08] }}
        transition={{
          duration: 0.72,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: index * 0.025,
        }}
      />
    );
  }

  const broken = blocked && index % 2 === 1;
  const opacity = idle ? 0 : blocked ? (broken ? 0.12 : 0.62) : settled ? 0.34 : 0.68;
  const scale = blocked ? (broken ? 0.72 : 1) : settled ? 0.86 : 1;

  return (
    <motion.span
      className="visit-pip"
      animate={{ opacity, scale }}
      transition={{ duration: prefersReduced ? 0 : 0.24, ease: 'easeOut' }}
    />
  );
}

function VisitInstrument({ phase, progress }) {
  const prefersReduced = useReducedMotion();

  return (
    <div className="visit-pips" role="presentation">
      {PIPS.map((index) => (
        <VisitPip
          key={index}
          index={index}
          phase={phase}
          progress={progress}
          prefersReduced={prefersReduced}
        />
      ))}
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
