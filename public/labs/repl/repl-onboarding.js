//
//  repl-onboarding.js
//  
//
//  Created by Sebastian Suarez-Solis on 5/9/26.
//


// First-run onboarding / score machine orientation.
// This is intentionally not a generic product tour. It behaves like a stamped
// field manual for the REPL: first score, machine tour, recoverable help.
(function (root) {
  'use strict';
  const STORAGE_SEEN = 'replOnboardingSeen:v1';
  const STORAGE_STEP = 'replOnboardingLastStep:v1';
  const STORAGE_ACTIVE = 'replOnboardingActive:v1';
  const TUTORIALS = [
    {
      id: 'first-score',
      label: 'first score',
      detail: 'basic syntax · tempo · meter · evaluate',
      file: '00a. tutorial-first-score.txt',
      fallback: [
        '// first score',
        '// edit a row, then press Cmd-Enter / EVALUATE',
        '',
        'tempo 72',
        'meter 4/4',
        '',
        'string C3 E3 G3 C4',
        'gain .55',
        'pan center',
      ].join('\n'),
    },
    {
      id: 'samples-drums',
      label: 'samples + drums',
      detail: 'sample rows · rock kit · command palette',
      file: '00d. tutorial-samples-and-drums.txt',
      fallback: [
        '// samples + drums',
        '',
        'tempo 104',
        'meter 4/4',
        '',
        'drum k h s h | k h s h',
        'kit rock',
        'variance .25',
        'gain .5',
      ].join('\n'),
    },
    {
      id: 'instruments',
      label: 'instruments',
      detail: 'piano · marimba · vibraphone · strings',
      file: '00e. tutorial-instruments.txt',
      fallback: [
        '// instruments',
        '',
        'tempo 84',
        'meter 4/4',
        '',
        'marimba C3 E3 G3 C4',
        'mallet yarn',
        'resonance .62',
        'body .45',
      ].join('\n'),
    },
    {
      id: 'live-cybernetic',
      label: 'live / cybernetic',
      detail: 'input · weather · attractors · surface controls',
      file: '00f. tutorial-command-palette.txt',
      fallback: [
        '// live / cybernetic',
        '',
        'tempo 92',
        'meter 4/4',
        '',
        'string A3 C4 E4 G4',
        'attractor weather.dew',
        'source station KLAX',
        'gain .55',
      ].join('\n'),
    },
    {
      id: 'robot-voice',
      label: 'robot voice',
      detail: 'voice / vox · syllable · carrier · vocoder',
      file: '00g. tutorial-robot-voice.txt',
      fallback: [
        '// robot voice',
        '',
        'tempo 72',
        'meter 4/4',
        '',
        'voice C3 E3 G3 C4',
        'vowel ah',
        'syllable input',
        'carrier sample',
        'robot .35',
        'vocoder .35',
        'gain .55',
      ].join('\n'),
    },
  ];
    const TOUR_STEPS = [
      {
        id: 'transport',
        title: 'transport',
        body: 'EVALUATE runs the current score. REPLAY re-arms it. STOP is the red interrupt.',
        selectors: ['#play', '#safe-play', '#stop', '.controls'],
        preferGroup: ['#play', '#safe-play', '#stop'],
      },
      {
        id: 'command',
        title: 'command palette',
        body: 'This is the index: voices, samples, kits, parameters, actions, and help.',
        selectors: ['#samples-toggle'],
      },
      {
        id: 'examples',
        title: 'examples',
        body: 'The score bank loads tutorials and complete patches. It is the fastest way into the language.',
        selectors: ['#example-trigger'],
      },
      {
        id: 'patch',
        title: 'patch identity',
        body: 'The patch chip names the score. Shared links preserve the score text, not playback state.',
        selectors: ['#patch-title-chip', '.patch-title-chip'],
      },
      {
        id: 'editor',
        title: 'score editor',
        body: 'Rows define voices and parameters. Leaves are events. The small button mutes a block.',
        selectors: ['#editor', '.editor-wrap', '.cm-editor'],
      },
      {
        id: 'score',
        title: 'cybernetic score',
        body: 'This panel shows beat state, block surfaces, parameters, and what the machine thinks is active.',
        selectors: ['#transport-viz', '.transport-viz'],
      },
      {
        id: 'share',
        title: 'share',
        body: 'SHARE copies a persistent patch URL. Opening a shared patch never autoplays.',
        selectors: ['#share', '#sharePatchBtn', '[aria-label="Copy patch link"]'],
      },
    ];
  let welcomeEl = null;
  let tourLayer = null;
  let spotlightEl = null;
  let tagEl = null;
  let activeTourIndex = 0;
  function adapter() {
    return root.ReplOnboardingAdapter || {};
  }
  function params() {
    try {
      return new URLSearchParams(root.location.search || '');
    } catch (_) {
      return new URLSearchParams();
    }
  }
  function hasPatchHash() {
    return String(root.location.hash || '').startsWith('#patch=v1.');
  }
  function hasSeen() {
    try {
      return root.localStorage.getItem(STORAGE_SEEN) === 'true';
    } catch (_) {
      return true;
    }
  }
  function readStored(key) {
    try { return root.localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }
  function writeStored(key, value) {
    try { root.localStorage.setItem(key, String(value || '')); } catch (_) {}
  }
  function removeStored(key) {
    try { root.localStorage.removeItem(key); } catch (_) {}
  }
  function markSeen() {
    completeOnboarding();
  }
  function completeOnboarding() {
    try {
      root.localStorage.setItem(STORAGE_SEEN, 'true');
      root.localStorage.removeItem(STORAGE_ACTIVE);
      root.localStorage.removeItem(STORAGE_STEP);
    } catch (_) {}
  }
  function reset() {
    try {
      root.localStorage.removeItem(STORAGE_SEEN);
      root.localStorage.removeItem(STORAGE_STEP);
      root.localStorage.removeItem(STORAGE_ACTIVE);
    } catch (_) {}
  }
  function markWelcomeActive() {
    removeStored(STORAGE_SEEN);
    writeStored(STORAGE_ACTIVE, 'welcome');
  }
  function markTourActive(stepId) {
    const id = stepId || (TOUR_STEPS[activeTourIndex] && TOUR_STEPS[activeTourIndex].id) || TOUR_STEPS[0].id;
    removeStored(STORAGE_SEEN);
    writeStored(STORAGE_ACTIVE, 'tour');
    writeStored(STORAGE_STEP, id);
  }
  function saveStep(id) {
    markTourActive(id);
  }
  function storedActive() {
    return readStored(STORAGE_ACTIVE);
  }
  function storedStep() {
    return readStored(STORAGE_STEP);
  }
  function hasIncompleteTour() {
    return storedActive() === 'tour' && TOUR_STEPS.some((step) => step.id === storedStep());
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }
  function closeWelcome() {
    if (welcomeEl) welcomeEl.hidden = true;
    document.body.classList.remove('repl-onboarding-open');
  }
  function removeWelcome() {
    if (welcomeEl && welcomeEl.parentNode) welcomeEl.parentNode.removeChild(welcomeEl);
    welcomeEl = null;
    document.body.classList.remove('repl-onboarding-open');
  }
  function tutorialById(id) {
    return TUTORIALS.find((item) => item.id === id) || TUTORIALS[0];
  }
  async function loadTutorial(id, options) {
    const opts = options || {};
    const tutorial = tutorialById(id);
    closeWelcome();
    const a = adapter();
    let didLoad = false;
    if (typeof a.loadTutorial === 'function') {
      try {
        await a.loadTutorial(tutorial.file, tutorial);
        didLoad = true;
      } catch (err) {
        console.warn('[repl] tutorial example failed, using fallback:', err);
      }
    }
    if (!didLoad && typeof a.setEditorCode === 'function') {
      a.setEditorCode(tutorial.fallback);
      didLoad = true;
    }
    if (!didLoad) {
      const textarea = document.querySelector('textarea[data-repl-editor], #replEditor, #repl-editor, textarea');
      if (textarea && typeof textarea.value === 'string') {
        textarea.value = tutorial.fallback;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    if (opts.tour !== false) {
      markTourActive(TOUR_STEPS[0].id);
      setTimeout(() => startTour('machine', { restart: true }), 120);
    } else {
      completeOnboarding();
    }
  }
  function openExamples() {
    closeWelcome();
    completeOnboarding();
    const a = adapter();
    if (typeof a.openExamples === 'function') {
      a.openExamples();
      return;
    }
    const btn = document.getElementById('example-trigger');
    if (btn) btn.click();
  }
  function openWelcome(options) {
    const opts = options || {};
    const canResumeTour = hasIncompleteTour();
    markWelcomeActive();
    if (welcomeEl && !opts.rebuild) {
      welcomeEl.hidden = false;
      document.body.classList.add('repl-onboarding-open');
      return;
    }
    removeWelcome();
    const el = document.createElement('div');
    el.id = 'repl-onboarding';
    el.className = 'repl-onboarding example-popover';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', "seb’s repl first score");
    el.innerHTML = [
      '<div class="example-popover-head repl-onboarding-head">',
      '<div class="example-popover-kicker">seb’s repl / first score</div>',
      '<div class="example-popover-count">FIELD MANUAL</div>',
      '</div>',
      '<div class="repl-onboarding-intro">',
      '<p>A score-grid language for live input, samples, strings, weather, video, and control surfaces.</p>',
      '<p class="repl-onboarding-note">Start with a playable score, then inspect the machine.</p>',
      '</div>',
      '<div class="repl-onboarding-actions">',
      canResumeTour ? '<button type="button" class="repl-onboarding-primary" data-onboarding-action="resume-tour">RESUME TOUR</button>' : '<button type="button" class="repl-onboarding-primary" data-onboarding-action="tutorial" data-tutorial-id="first-score">START WITH TUTORIAL</button>',
      '<button type="button" data-onboarding-action="tour">TOUR THE MACHINE</button>',
      canResumeTour ? '<button type="button" data-onboarding-action="restart-tour">RESTART TOUR</button>' : '',
      '<button type="button" data-onboarding-action="examples">OPEN EXAMPLES</button>',
      '<button type="button" data-onboarding-action="skip">SKIP</button>',
      '</div>',
      '<div class="repl-onboarding-grid">',
      TUTORIALS.map((tutorial) => [
        '<button type="button" class="repl-onboarding-card" data-tutorial-id="',
        escapeHtml(tutorial.id),
        '">',
        '<span class="repl-onboarding-card-title">',
        escapeHtml(tutorial.label),
        '</span>',
        '<span class="repl-onboarding-card-detail">',
        escapeHtml(tutorial.detail),
        '</span>',
        '<span class="repl-onboarding-card-stamp">LOAD SCORE</span>',
        '</button>',
      ].join('')).join(''),
      '</div>',
    ].join('');
    el.addEventListener('click', (event) => {
      const tutorialCard = event.target.closest('[data-tutorial-id]');
      if (tutorialCard) {
        event.preventDefault();
        loadTutorial(tutorialCard.dataset.tutorialId, { tour: true });
        return;
      }
      const action = event.target.closest('[data-onboarding-action]');
      if (!action) return;
      event.preventDefault();
      const kind = action.dataset.onboardingAction;
      if (kind === 'tutorial') {
        loadTutorial(action.dataset.tutorialId || 'first-score', { tour: true });
      } else if (kind === 'tour') {
        closeWelcome();
        startTour('machine', { restart: true });
      } else if (kind === 'resume-tour') {
        closeWelcome();
        startTour('machine', { resume: true });
      } else if (kind === 'restart-tour') {
        closeWelcome();
        startTour('machine', { restart: true });
      } else if (kind === 'examples') {
        openExamples();
      } else if (kind === 'skip') {
        completeOnboarding();
        removeWelcome();
      }
    });
    document.body.appendChild(el);
    welcomeEl = el;
    document.body.classList.add('repl-onboarding-open');
    requestAnimationFrame(() => {
      const first = el.querySelector('.repl-onboarding-primary');
      if (first) first.focus();
    });
  }
    let tourScrims = [];
    let renderTourRequest = 0;
    let scheduledTourFrame = 0;

    function viewportBox() {
      const vv = window.visualViewport;
      return {
        left: vv ? vv.offsetLeft : 0,
        top: vv ? vv.offsetTop : 0,
        width: vv ? vv.width : window.innerWidth,
        height: vv ? vv.height : window.innerHeight,
      };
    }

    function unionRects(rects) {
      const usable = rects.filter((r) => r && r.width > 0 && r.height > 0);
      if (!usable.length) return null;

      const left = Math.min(...usable.map((r) => r.left));
      const top = Math.min(...usable.map((r) => r.top));
      const right = Math.max(...usable.map((r) => r.right));
      const bottom = Math.max(...usable.map((r) => r.bottom));

      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      };
    }

    function clampRectToViewport(rect, padding) {
      const pad = Number.isFinite(Number(padding)) ? Number(padding) : 10;
      const vp = viewportBox();

      const left = Math.max(vp.left + pad, Math.min(rect.left, vp.left + vp.width - pad));
      const top = Math.max(vp.top + pad, Math.min(rect.top, vp.top + vp.height - pad));
      const right = Math.max(left + 24, Math.min(rect.right, vp.left + vp.width - pad));
      const bottom = Math.max(top + 24, Math.min(rect.bottom, vp.top + vp.height - pad));

      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      };
    }

    function rectForStep(step, target) {
      const targets = targetsForStep(step);
      if (targets.length) {
        const grouped = unionRects(targets.map((el) => el.getBoundingClientRect()));
        if (grouped) return grouped;
      }
      if (target && typeof target.getBoundingClientRect === 'function') {
        return target.getBoundingClientRect();
      }
      const vp = viewportBox();
      return {
        left: vp.left + vp.width * 0.18,
        top: vp.top + vp.height * 0.22,
        right: vp.left + vp.width * 0.82,
        bottom: vp.top + vp.height * 0.42,
        width: vp.width * 0.64,
        height: vp.height * 0.2,
      };
    }


    function clearTourScrims() {
      for (const el of tourScrims) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
      tourScrims = [];
    }

    function ensureTourScrims() {
      if (!tourLayer) return [];
      if (tourScrims.length === 4) return tourScrims;
      clearTourScrims();
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const el = document.createElement('div');
        el.className = `repl-tour-scrim repl-tour-scrim-${side}`;
        el.setAttribute('aria-hidden', 'true');
        tourLayer.insertBefore(el, spotlightEl || null);
        tourScrims.push(el);
      }
      return tourScrims;
    }

    function positionTourScrims(rect) {
      const scrims = ensureTourScrims();
      if (scrims.length !== 4) return;

      const vp = viewportBox();
      const vpRight = vp.left + vp.width;
      const vpBottom = vp.top + vp.height;
      const left = Math.max(vp.left, rect.left);
      const top = Math.max(vp.top, rect.top);
      const right = Math.min(vpRight, rect.right);
      const bottom = Math.min(vpBottom, rect.bottom);

      const topScrim = scrims[0];
      const rightScrim = scrims[1];
      const bottomScrim = scrims[2];
      const leftScrim = scrims[3];

      topScrim.style.left = `${vp.left}px`;
      topScrim.style.top = `${vp.top}px`;
      topScrim.style.width = `${vp.width}px`;
      topScrim.style.height = `${Math.max(0, top - vp.top)}px`;

      rightScrim.style.left = `${right}px`;
      rightScrim.style.top = `${top}px`;
      rightScrim.style.width = `${Math.max(0, vpRight - right)}px`;
      rightScrim.style.height = `${Math.max(0, bottom - top)}px`;

      bottomScrim.style.left = `${vp.left}px`;
      bottomScrim.style.top = `${bottom}px`;
      bottomScrim.style.width = `${vp.width}px`;
      bottomScrim.style.height = `${Math.max(0, vpBottom - bottom)}px`;

      leftScrim.style.left = `${vp.left}px`;
      leftScrim.style.top = `${top}px`;
      leftScrim.style.width = `${Math.max(0, left - vp.left)}px`;
      leftScrim.style.height = `${Math.max(0, bottom - top)}px`;
    }


    function afterLayout(fn) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(fn);
      });
    }
    function visibleElementForSelector(selector) {
      const nodes = Array.from(document.querySelectorAll(selector || ''));
      for (const el of nodes) {
        if (!el || el.closest('.repl-tour-layer')) continue;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (
          rect.width > 0
          && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0
        ) {
          return el;
        }
      }
      return null;
    }
    function targetsForStep(step) {
      if (step && Array.isArray(step.preferGroup) && step.preferGroup.length) {
        const grouped = step.preferGroup
          .map((selector) => visibleElementForSelector(selector))
          .filter(Boolean);
        if (grouped.length) return grouped;
      }
      const target = findTarget(step);
      return target ? [target] : [];
    }


    
    function findTarget(step) {
      for (const selector of step.selectors || []) {
        const el = visibleElementForSelector(selector);
        if (el) return el;
      }
      return null;
    }

  
    
    function ensureTourDom() {
      if (tourLayer && spotlightEl && tagEl) return;

      tourLayer = document.createElement('div');
      tourLayer.className = 'repl-tour-layer';
      tourLayer.setAttribute('aria-hidden', 'false');

      spotlightEl = document.createElement('div');
      spotlightEl.className = 'repl-tour-spotlight';

      tagEl = document.createElement('div');
      tagEl.className = 'repl-tour-tag';
      tagEl.setAttribute('role', 'dialog');
      tagEl.setAttribute('aria-label', 'REPL tour step');

      tourLayer.appendChild(spotlightEl);
      tourLayer.appendChild(tagEl);
      document.body.appendChild(tourLayer);

      const rerender = () => {
        if (document.body.classList.contains('repl-tour-open')) scheduleTourRender();
      };
      const onKeydown = (event) => {
        if (!document.body.classList.contains('repl-tour-open')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          closeTour(false);
        }
      };

      window.addEventListener('resize', rerender);
      window.addEventListener('scroll', rerender, true);
      window.addEventListener('keydown', onKeydown, true);

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', rerender);
        window.visualViewport.addEventListener('scroll', rerender);
      }
    }
    
    function closeTour(done) {
      document.body.classList.remove('repl-tour-open');

      clearTourScrims();

      if (tourLayer) tourLayer.hidden = true;

      if (done) {
        completeOnboarding();
      } else {
        markTourActive((TOUR_STEPS[activeTourIndex] || TOUR_STEPS[0]).id);
      }

      const a = adapter();
      if (typeof a.focusEditor === 'function') a.focusEditor();
    }
  
    
    function prefersReducedMotion() {
      try {
        return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (_) {
        return false;
      }
    }

    function scheduleTourRender() {
      if (scheduledTourFrame) return;
      scheduledTourFrame = root.requestAnimationFrame(() => {
        scheduledTourFrame = 0;
        if (document.body.classList.contains('repl-tour-open')) renderTourStep();
      });
    }

    function scrollStepIntoView(step) {
      const target = findTarget(step);
      if (!target || typeof target.scrollIntoView !== 'function') return;
      try {
        target.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      } catch (_) {}
      scheduleTourRender();
      root.setTimeout(scheduleTourRender, 90);
      root.setTimeout(scheduleTourRender, 220);
      root.setTimeout(scheduleTourRender, 420);
    }

    function positionTour(target, step) {
      const pad = 8;
      const vp = viewportBox();
      const raw = rectForStep(step, target);
      const rect = clampRectToViewport({
        left: raw.left - pad,
        top: raw.top - pad,
        right: raw.right + pad,
        bottom: raw.bottom + pad,
        width: raw.width + pad * 2,
        height: raw.height + pad * 2,
      }, 8);

      positionTourScrims(rect);

      spotlightEl.style.left = `${rect.left}px`;
      spotlightEl.style.top = `${rect.top}px`;
      spotlightEl.style.width = `${rect.width}px`;
      spotlightEl.style.height = `${rect.height}px`;

      const tagWidth = Math.min(380, vp.width - 28);
      const tagHeightEstimate = 230;

      let left = rect.left;
      let top = rect.bottom + 18;

      if (left + tagWidth > vp.left + vp.width - 14) {
        left = vp.left + vp.width - tagWidth - 14;
      }

      if (left < vp.left + 14) {
        left = vp.left + 14;
      }

      if (top + tagHeightEstimate > vp.top + vp.height - 14) {
        top = rect.top - tagHeightEstimate - 18;
      }

      if (top < vp.top + 14) {
        top = Math.min(rect.bottom + 18, vp.top + vp.height - tagHeightEstimate - 14);
      }

      tagEl.style.left = `${Math.max(vp.left + 14, left)}px`;
      tagEl.style.top = `${Math.max(vp.top + 14, top)}px`;
      tagEl.style.width = `${tagWidth}px`;
    }

    function renderTourStep() {
      ensureTourDom();

      const requestId = ++renderTourRequest;
      const step = TOUR_STEPS[activeTourIndex] || TOUR_STEPS[0];
      const target = findTarget(step);
      markTourActive(step.id);

      afterLayout(() => {
        if (requestId !== renderTourRequest) return;

        const freshTarget = findTarget(step);
        positionTour(freshTarget, step);

        tagEl.innerHTML = [
          '<div class="repl-tour-tag-head">',
          '<span class="repl-tour-register"></span>',
          '<span class="repl-tour-kicker">MACHINE TOUR</span>',
          '<span class="repl-tour-count">',
          escapeHtml(`${activeTourIndex + 1}/${TOUR_STEPS.length}`),
          '</span>',
          '</div>',
          '<div class="repl-tour-title">',
          escapeHtml(step.title),
          '</div>',
          '<p>',
          escapeHtml(step.body),
          '</p>',
          '<div class="repl-tour-actions">',
          activeTourIndex > 0 ? '<button type="button" data-tour-action="back">BACK</button>' : '',
          '<button type="button" data-tour-action="skip">SKIP</button>',
          '<button type="button" class="repl-tour-primary" data-tour-action="next">',
          activeTourIndex >= TOUR_STEPS.length - 1 ? 'FINISH' : 'NEXT',
          '</button>',
          '</div>',
        ].join('');

        tagEl.querySelectorAll('[data-tour-action]').forEach((btn) => {
          btn.addEventListener('click', (event) => {
            event.preventDefault();
            const action = btn.dataset.tourAction;

            if (action === 'back') {
              activeTourIndex = Math.max(0, activeTourIndex - 1);
              saveStep(TOUR_STEPS[activeTourIndex].id);
              scrollStepIntoView(TOUR_STEPS[activeTourIndex]);
              scheduleTourRender();
            } else if (action === 'skip') {
              closeTour(true);
            } else if (action === 'next') {
              if (activeTourIndex >= TOUR_STEPS.length - 1) {
                closeTour(true);
              } else {
                activeTourIndex += 1;
                saveStep(TOUR_STEPS[activeTourIndex].id);
                scrollStepIntoView(TOUR_STEPS[activeTourIndex]);
                scheduleTourRender();
              }
            }
          });
        });

        const primary = tagEl.querySelector('.repl-tour-primary');
        if (primary) primary.focus();
      });
    }
    
  function startTour(id, options) {
    const opts = options || {};
    closeWelcome();
    const saved = storedStep();
    const requested = opts.restart ? TOUR_STEPS[0].id : (id && id !== 'machine' ? id : saved);
    const idx = TOUR_STEPS.findIndex((step) => step.id === requested);
    activeTourIndex = idx >= 0 ? idx : 0;
    markTourActive(TOUR_STEPS[activeTourIndex].id);
    ensureTourDom();
    tourLayer.hidden = false;
    document.body.classList.add('repl-tour-open');
    scrollStepIntoView(TOUR_STEPS[activeTourIndex]);
    renderTourStep();
  }
  function openFieldManual(options) {
    const opts = options || {};
    if (opts.restart) {
      reset();
      startTour('machine', { restart: true });
      return;
    }
    if (opts.reset) {
      reset();
      openWelcome({ rebuild: true });
      return;
    }
    if (hasIncompleteTour()) {
      startTour('machine', { resume: true });
      return;
    }
    openWelcome({ rebuild: true });
  }

  function bindHelpTrigger() {
    const btn = document.getElementById('onboarding-help');
    if (!btn || btn.dataset.onboardingBound === '1') return;
    btn.dataset.onboardingBound = '1';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      openFieldManual({
        restart: event.altKey || event.metaKey,
        reset: event.shiftKey,
      });
    });
  }

  function maybeStart(options) {
    bindHelpTrigger();
    const opts = options || {};
    const q = params();
    if (q.get('onboarding') === 'reset') {
      reset();
    }
    if (q.get('tutorial')) {
      const tutorialId = q.get('tutorial') || 'first-score';
      loadTutorial(tutorialId, { tour: q.get('tour') !== '0' });
      return;
    }
    if (q.get('tour') === '1') {
      startTour('machine', { restart: q.get('resume') !== '1' });
      return;
    }
    if (storedActive() === 'tour' && !hasSeen()) {
      setTimeout(() => startTour('machine', { resume: true }), Number(opts.delayMs || 450));
      return;
    }
    if (storedActive() === 'welcome' && !hasSeen()) {
      setTimeout(() => openWelcome(), Number(opts.delayMs || 450));
      return;
    }
    if (opts.bootedFromHash || hasPatchHash()) return;
    if (opts.loadedSavedPatch) return;
    if (hasSeen()) return;
    setTimeout(() => openWelcome(), Number(opts.delayMs || 450));
  }
  bindHelpTrigger();
  root.ReplOnboarding = {
    maybeStart,
    startTour,
    openWelcome,
    openFieldManual,
    markSeen,
    completeOnboarding,
    reset,
    loadTutorial,
    tutorials: TUTORIALS.slice(),
  };
})(window);
