import React from 'react';
import { createRoot } from 'react-dom/client';
import { motion, useReducedMotion } from 'framer-motion';

const VIEWBOX = '0 0 240 34';
const LINE_PATH = 'M 12 20 C 52 15 87 15 121 20 S 193 25 228 18';

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function StaticInstrument({ phase, progress }) {
  const shown = phase === 'loading' ? 0.18 : progress;
  const opacity = phase === 'idle' ? 0 : phase === 'settled' ? 0.42 : 0.72;
  return (
    <svg viewBox={VIEWBOX} role="presentation" focusable="false" style={{ display: 'block', width: '100%', height: '34px' }}>
      <path d={LINE_PATH} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.2" />
      <path
        d={LINE_PATH}
        fill="none"
        pathLength="1"
        stroke="currentColor"
        strokeDasharray="1"
        strokeDashoffset={1 - shown}
        strokeLinecap="round"
        strokeOpacity={opacity}
        strokeWidth="1.4"
      />
      <circle cx={12 + shown * 216} cy="20" r="2.1" fill="currentColor" opacity={opacity} />
    </svg>
  );
}

function AnimatedInstrument({ phase, progress }) {
  const loading = phase === 'loading';
  const accepting = phase === 'accepting';
  const qualifying = phase === 'qualifying';
  const settled = phase === 'settled';
  const activeProgress = loading ? 0.22 : accepting || qualifying || settled ? progress : 0;
  const markerX = 12 + activeProgress * 216;
  const opacity = phase === 'idle' ? 0 : settled ? 0.46 : 0.82;

  return (
    <svg viewBox={VIEWBOX} role="presentation" focusable="false" style={{ display: 'block', width: '100%', height: '34px' }}>
      <path d={LINE_PATH} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.2" />
      <motion.path
        d={LINE_PATH}
        fill="none"
        pathLength="1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity={opacity}
        strokeWidth="1.4"
        initial={false}
        animate={{
          pathLength: activeProgress,
          opacity,
        }}
        transition={{ duration: accepting ? 0.18 : 0.34, ease: 'easeOut' }}
      />
      {loading ? (
        <motion.g
          initial={false}
          animate={{ x: [0, 196, 0], opacity: [0.28, 0.9, 0.28] }}
          transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
        >
          <path d="M 13 11 L 20 20" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity="0.82" />
          <circle cx="22" cy="22" r="1.8" fill="currentColor" opacity="0.7" />
        </motion.g>
      ) : (
        <motion.g
          initial={false}
          animate={{
            x: markerX,
            opacity: settled ? 0.4 : 0.92,
            rotate: qualifying ? [0, -2, 2, 0] : 0,
          }}
          transition={{
            x: { duration: accepting ? 0.18 : 0.32, ease: 'easeOut' },
            opacity: { duration: 0.28 },
            rotate: qualifying ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 },
          }}
        >
          <path d="M -3 -9 L 4 0" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <circle cx="6" cy="2" r="1.9" fill="currentColor" opacity="0.72" />
        </motion.g>
      )}
    </svg>
  );
}

function AcceptanceMotion({ phase, progress }) {
  const prefersReduced = useReducedMotion();
  const normalized = clamp01(progress);
  const commonStyle = {
    color: 'var(--ink-faint)',
    maxWidth: '240px',
  };
  return (
    <div style={commonStyle}>
      {prefersReduced ? (
        <StaticInstrument phase={phase} progress={normalized} />
      ) : (
        <AnimatedInstrument phase={phase} progress={normalized} />
      )}
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
  const state = {
    phase: 'idle',
    progress: 0,
  };

  function render() {
    root.render(<AcceptanceMotion phase={state.phase} progress={state.progress} />);
  }

  render();

  return {
    setPhase(phase) {
      state.phase = String(phase || 'idle');
      render();
    },
    setProgress(progress) {
      state.progress = clamp01(progress);
      render();
    },
    destroy() {
      root.unmount();
    },
  };
}
