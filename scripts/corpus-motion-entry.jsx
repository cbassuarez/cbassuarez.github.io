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
const PIP_COLOR = {
  loading: 'var(--pip-loading)',
  accepting: 'var(--pip-accepting)',
  qualifying: 'var(--pip-qualifying)',
  blocked: 'var(--pip-blocked)',
  warning: 'var(--pip-warning)',
  settled: 'var(--pip-settled)',
};
const PIP_GLOW = {
  loading: 'rgba(58, 128, 255, 0.46)',
  accepting: 'rgba(28, 236, 154, 0.58)',
  qualifying: 'rgba(244, 255, 214, 0.64)',
  blocked: 'rgba(255, 76, 48, 0.58)',
  warning: 'rgba(255, 174, 54, 0.52)',
  settled: 'rgba(58, 188, 112, 0.36)',
};

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
    [0.18, 1],
  );
  const progressScale = useTransform(
    progress,
    [Math.max(0, threshold - 0.18), threshold],
    [0.72, 1.18],
  );
  const progressColor = useTransform(progress, (value) => (
    value >= threshold ? PIP_COLOR.accepting : PIP_COLOR.loading
  ));
  const progressGlow = useTransform(progress, (value) => (
    value >= threshold ? PIP_GLOW.accepting : PIP_GLOW.loading
  ));

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
        style={{
          opacity: progressOpacity,
          scale: progressScale,
          '--pip-color': progressColor,
          '--pip-glow': progressGlow,
        }}
      />
    );
  }

  if (loading && !prefersReduced) {
    return (
      <motion.span
        className="visit-pip"
        style={{
          '--pip-color': PIP_COLOR.loading,
          '--pip-glow': PIP_GLOW.loading,
        }}
        animate={{ opacity: [0.14, 0.92, 0.14], scale: [0.72, 1.24, 0.72] }}
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
    const color = index % 2 === 0 ? PIP_COLOR.qualifying : PIP_COLOR.accepting;
    const glow = index % 2 === 0 ? PIP_GLOW.qualifying : PIP_GLOW.accepting;

    return (
      <motion.span
        className="visit-pip"
        style={{
          '--pip-color': color,
          '--pip-glow': glow,
        }}
        animate={{ opacity: [0.72, 1, 0.72], scale: [1.02, 1.26, 1.02] }}
        transition={{
          duration: 0.78,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: index * 0.035,
        }}
      />
    );
  }

  const broken = blocked && index % 2 === 1;
  const color = blocked
    ? (broken ? PIP_COLOR.warning : PIP_COLOR.blocked)
    : settled
      ? PIP_COLOR.settled
      : qualifying
        ? (index % 2 === 0 ? PIP_COLOR.qualifying : PIP_COLOR.accepting)
        : PIP_COLOR.loading;
  const glow = blocked
    ? (broken ? PIP_GLOW.warning : PIP_GLOW.blocked)
    : settled
      ? PIP_GLOW.settled
      : qualifying
        ? (index % 2 === 0 ? PIP_GLOW.qualifying : PIP_GLOW.accepting)
        : PIP_GLOW.loading;
  const opacity = idle ? 0 : blocked ? (broken ? 0.18 : 0.74) : settled ? 0.36 : qualifying ? 0.86 : 0.68;
  const scale = blocked ? (broken ? 0.72 : 1) : settled ? 0.86 : 1;

  return (
    <motion.span
      className="visit-pip"
      style={{
        '--pip-color': color,
        '--pip-glow': glow,
      }}
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
