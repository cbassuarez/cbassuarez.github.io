import React, { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Dithering, GodRays } from '@paper-design/shaders-react';
import { animate, inView } from 'framer-motion';
import './page.css';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }

  interface Navigator {
    connection?: { saveData?: boolean };
  }
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const conserveResources = reducedMotion.matches || navigator.connection?.saveData === true;

const VFD_TITLE_GLYPHS: Record<string, number[]> = {
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0]
};

function enhanceVfdTitle(): void {
  const title = document.querySelector<HTMLHeadingElement>('#page-title');
  if (!title) return;

  const text = title.textContent?.toUpperCase() ?? '';
  const namespace = 'http://www.w3.org/2000/svg';
  const characterWidth = 6;
  const svg = document.createElementNS(namespace, 'svg');
  svg.classList.add('cs-vfd-title');
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, text.length * characterWidth - 1)} 7`);
  svg.setAttribute('role', 'presentation');
  svg.setAttribute('aria-hidden', 'true');

  [...text].forEach((character, characterIndex) => {
    const rows = VFD_TITLE_GLYPHS[character];
    if (!rows) return;
    rows.forEach((bits, row) => {
      for (let column = 0; column < 5; column += 1) {
        const dot = document.createElementNS(namespace, 'circle');
        const on = Boolean((bits >> (4 - column)) & 1);
        dot.setAttribute('cx', String(characterIndex * characterWidth + column + 0.5));
        dot.setAttribute('cy', String(row + 0.5));
        dot.setAttribute('r', '0.36');
        dot.classList.add(on ? 'is-on' : 'is-off');
        svg.appendChild(dot);
      }
    });
  });

  title.classList.add('cs-vfd-title__source');
  title.insertAdjacentElement('afterend', svg);
}

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }));
  } catch {
    return false;
  }
}

function useViewportActivity(): { ref: React.RefObject<HTMLDivElement | null>; active: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting && document.visibilityState === 'visible'),
      { rootMargin: '160px 0px', threshold: 0.01 }
    );
    observer.observe(element);

    const handleVisibility = () => setActive(!document.hidden && element.getBoundingClientRect().bottom >= -160 && element.getBoundingClientRect().top <= innerHeight + 160);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return { ref, active };
}

class ShaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('Chunk Surfer shader fallback active.', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function HeroShader(): React.JSX.Element {
  const { ref, active } = useViewportActivity();

  return (
    <div ref={ref} className="cs-paper-root">
      <GodRays
        width="100%"
        height="100%"
        fit="cover"
        offsetX={0.44}
        offsetY={-0.08}
        scale={1.1}
        colorBack="#00000000"
        colorBloom="#f2a81e33"
        colors={['#f2a81e00', '#ffd07142', '#fff0bd29']}
        density={0.24}
        spotty={0.38}
        midSize={0.11}
        midIntensity={0.2}
        intensity={0.62}
        bloom={0.24}
        frame={41}
        speed={active && !conserveResources ? 0.045 : 0}
        minPixelRatio={1}
        maxPixelCount={921_600}
      />
    </div>
  );
}

function SignalShader(): React.JSX.Element {
  const { ref, active } = useViewportActivity();

  return (
    <div ref={ref} className="cs-paper-root">
      <Dithering
        width="100%"
        height="100%"
        fit="cover"
        scale={1.35}
        rotation={-8}
        offsetX={0.08}
        colorBack="#030403"
        colorFront="#f2a81e"
        shape="warp"
        type="8x8"
        size={2.5}
        frame={4417}
        speed={active && !conserveResources ? 0.075 : 0}
        minPixelRatio={1}
        maxPixelCount={518_400}
      />
    </div>
  );
}

function mountShaders(): Root[] {
  if (!supportsWebGL2() || conserveResources) return [];

  const mounts: Root[] = [];
  const heroHost = document.querySelector<HTMLElement>('#heroShader');
  const signalHost = document.querySelector<HTMLElement>('#signalShader');

  if (heroHost) {
    const root = createRoot(heroHost);
    root.render(<ShaderBoundary><HeroShader /></ShaderBoundary>);
    mounts.push(root);
  }

  if (signalHost) {
    const root = createRoot(signalHost);
    root.render(<ShaderBoundary><SignalShader /></ShaderBoundary>);
    mounts.push(root);
  }

  return mounts;
}

function enableMotion(): Array<() => void> {
  if (reducedMotion.matches) return [];

  document.documentElement.classList.add('motion-ready');
  const cleanups: Array<() => void> = [];

  document.querySelectorAll<HTMLElement>('.motion-hero').forEach((element, index) => {
    animate(
      element,
      { opacity: [0, 1], y: [18, 0] },
      { duration: 0.52, delay: 0.08 + index * 0.09, ease: [0.22, 1, 0.36, 1] }
    );
  });

  cleanups.push(inView('.motion-reveal', (element) => {
    animate(element, { opacity: [0, 1], y: [24, 0] }, { duration: 0.58, ease: [0.22, 1, 0.36, 1] });
  }, { amount: 0.13, margin: '0px 0px -8% 0px' }));

  const pressCleanups: Array<() => void> = [];
  document.querySelectorAll<HTMLElement>('.cs-cta').forEach((element) => {
    const press = () => animate(element, { scale: [1, 0.985, 1] }, { duration: 0.2 });
    element.addEventListener('pointerdown', press);
    pressCleanups.push(() => element.removeEventListener('pointerdown', press));
  });
  cleanups.push(() => pressCleanups.forEach((cleanup) => cleanup()));

  return cleanups;
}

function enableScrollProgress(): () => void {
  const indicator = document.querySelector<HTMLElement>('#scrollProgress');
  if (!indicator) return () => undefined;

  let frame = 0;
  const update = () => {
    frame = 0;
    const scrollable = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    indicator.style.transform = `scaleX(${Math.min(1, Math.max(0, scrollY / scrollable))})`;
  };
  const requestUpdate = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  update();
  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', requestUpdate, { passive: true });

  return () => {
    if (frame) cancelAnimationFrame(frame);
    removeEventListener('scroll', requestUpdate);
    removeEventListener('resize', requestUpdate);
  };
}

type HissHandle = {
  source: AudioBufferSourceNode;
  highPass: BiquadFilterNode;
  lowPass: BiquadFilterNode;
  gain: GainNode;
};

function enableTitleAudio(): () => void {
  const audio = document.querySelector<HTMLAudioElement>('#titleAudio');
  const toggle = document.querySelector<HTMLButtonElement>('#audioToggle');
  const stop = document.querySelector<HTMLButtonElement>('#audioStop');
  const status = document.querySelector<HTMLElement>('#audioStatus');
  if (!audio || !toggle || !stop || !status) return () => undefined;

  let audioContext: AudioContext | null = null;
  let hiss: HissHandle | null = null;
  let disposed = false;

  const setState = (label: string, stateText: string, pressed: boolean, canStop: boolean) => {
    toggle.textContent = label;
    toggle.setAttribute('aria-label', label.toLowerCase());
    toggle.setAttribute('aria-pressed', String(pressed));
    stop.hidden = !canStop;
    status.textContent = stateText;
  };

  const ensureContext = async (): Promise<AudioContext> => {
    if (!audioContext || audioContext.state === 'closed') {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) throw new Error('Web Audio is unavailable');
      audioContext = new AudioContextConstructor();
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
    return audioContext;
  };

  const startHiss = (context: AudioContext) => {
    if (hiss) return;

    const length = Math.max(1, Math.floor(context.sampleRate * 1.5));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;

    for (let index = 0; index < length; index += 1) {
      brown = brown * 0.985 + (Math.random() * 2 - 1) * 0.06;
      data[index] = (Math.random() * 2 - 1) * 0.34 + brown * 0.22;
    }

    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    highPass.type = 'highpass';
    highPass.frequency.value = 900;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 7_800;
    gain.gain.value = 0.018;
    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(gain);
    gain.connect(context.destination);
    source.start();
    hiss = { source, highPass, lowPass, gain };
  };

  const stopHiss = () => {
    if (!hiss || !audioContext) return;
    const current = hiss;
    hiss = null;
    const now = audioContext.currentTime;
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setValueAtTime(current.gain.gain.value, now);
    current.gain.gain.linearRampToValueAtTime(0, now + 0.12);
    window.setTimeout(() => {
      try { current.source.stop(); } catch { /* already stopped */ }
      current.source.disconnect();
      current.highPass.disconnect();
      current.lowPass.disconnect();
      current.gain.disconnect();
    }, 180);
  };

  const pauseAudio = () => {
    audio.pause();
    stopHiss();
    setState('RESUME TITLE AUDIO', 'TITLE AUDIO PAUSED', false, true);
  };

  const playAudio = async () => {
    try {
      const context = await ensureContext();
      startHiss(context);
      await audio.play();
      if (disposed) return;
      setState('PAUSE TITLE AUDIO', 'TITLE AUDIO PLAYING · MENU HISS ACTIVE', true, true);
    } catch (error) {
      console.warn('Title audio could not start.', error);
      stopHiss();
      setState('PLAY TITLE AUDIO', 'AUDIO UNAVAILABLE', false, false);
    }
  };

  const stopAudio = async () => {
    audio.pause();
    audio.currentTime = 0;
    stopHiss();
    if (audioContext && audioContext.state !== 'closed') await audioContext.close();
    audioContext = null;
    setState('PLAY TITLE AUDIO', 'AUDIO OFF', false, false);
  };

  const handleToggle = () => audio.paused ? void playAudio() : pauseAudio();
  const handleStop = () => void stopAudio();
  const handleEnded = () => void stopAudio();
  toggle.addEventListener('click', handleToggle);
  stop.addEventListener('click', handleStop);
  audio.addEventListener('ended', handleEnded);

  return () => {
    disposed = true;
    toggle.removeEventListener('click', handleToggle);
    stop.removeEventListener('click', handleStop);
    audio.removeEventListener('ended', handleEnded);
    audio.pause();
    stopHiss();
    if (audioContext && audioContext.state !== 'closed') void audioContext.close();
    audioContext = null;
  };
}

function manageSourceVideo(): () => void {
  const video = document.querySelector<HTMLVideoElement>('.cs-media-frame--video video');
  if (!video) return () => undefined;

  if (reducedMotion.matches) {
    video.autoplay = false;
    video.pause();
    video.currentTime = 0;
    return () => undefined;
  }

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !document.hidden) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, { threshold: 0.15 });
  observer.observe(video);

  return () => {
    observer.disconnect();
    video.pause();
  };
}

const shaderRoots = mountShaders();
enhanceVfdTitle();
const cleanups = [
  ...enableMotion(),
  enableScrollProgress(),
  enableTitleAudio(),
  manageSourceVideo()
];

const teardown = () => {
  cleanups.forEach((cleanup) => cleanup());
  shaderRoots.forEach((root) => root.unmount());
};

window.addEventListener('pagehide', teardown, { once: true });
