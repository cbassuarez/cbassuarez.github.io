// REPL — wires the CodeMirror editor adapter to the DSL parser, scheduler,
// and voices. Owns: hot-reload (Cmd-Enter), Esc-to-stop, status line, share
// button, example loader, and URL-hash patch persistence.
//
// The editor is a CodeMirror 6 EditorView mounted into #editor by
// repl-editor.js (createReplEditor). All reads/writes go through the
// editorAPI adapter; this file never touches contentDOM directly.

(function () {
  'use strict';

  const VIDEO_DEBUG_STORAGE_KEY = 'replDebugVideo';

  function parseDebugBool(value) {
    const v = String(value == null ? '' : value).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return null;
  }

  function readVideoDebugFlag() {
    let queryValue = null;
    try {
      const qs = new URLSearchParams(window.location.search || '');
      if (qs.has('debug-video')) queryValue = qs.get('debug-video');
      else if (qs.has('video-debug')) queryValue = qs.get('video-debug');
    } catch (_) {}

    const parsedQuery = parseDebugBool(queryValue);
    if (parsedQuery != null) {
      try { localStorage.setItem(VIDEO_DEBUG_STORAGE_KEY, parsedQuery ? '1' : '0'); } catch (_) {}
      return parsedQuery;
    }

    try {
      return localStorage.getItem(VIDEO_DEBUG_STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  const VIDEO_DEBUG_ENABLED = readVideoDebugFlag();
  window.__REPL_DEBUG_VIDEO__ = VIDEO_DEBUG_ENABLED;

  const editorMount = document.getElementById('editor');
  const statusEl = document.getElementById('status');
    const playBtn = document.getElementById('play');
    const safePlayBtn = document.getElementById('safe-play');
    const stopBtn = document.getElementById('stop');
    const shareBtn = document.getElementById('share');
  const exampleSelect = document.getElementById('example-select');
  const videoExampleOptions = exampleSelect
    ? Array.from(exampleSelect.querySelectorAll('option[data-video-example="1"]'))
    : [];
  const errorList = document.getElementById('errors');
  const patchTitleChip = document.getElementById('patch-title-chip');
  const beatDotsEl = document.getElementById('beat-dots');
  const blockRowsEl = document.getElementById('block-rows');
  const transportVizEl = document.getElementById('transport-viz');
  const videoToolbarEl = document.getElementById('video-toolbar');
  const samplesToggleBtn = document.getElementById('samples-toggle');
  const inputToggleBtn = document.getElementById('input-toggle');
  const inputPanel = document.getElementById('input-panel');
  const inputKindSelect = document.getElementById('input-kind');
  const inputDeviceSelect = document.getElementById('input-device');
  const outputDeviceSelect = document.getElementById('output-device');
  const outputApplyBtn = document.getElementById('output-apply');
  const outputRefreshBtn = document.getElementById('output-refresh');
  const outputStatusEl = document.getElementById('output-status');
  const inputEnableBtn = document.getElementById('input-enable');
  const inputStopBtn = document.getElementById('input-stop');
  const inputStatusEl = document.getElementById('input-status');
  const inputMeterFill = document.getElementById('input-meter-fill');
  const videoToggleBtn = document.getElementById('video-toggle');
  const videoPanel = document.getElementById('video-panel');
  const videoKindSelect = document.getElementById('video-kind');
  const videoFileWrap = document.getElementById('video-file-wrap');
  const videoFileInput = document.getElementById('video-file');
  const videoEnableBtn = document.getElementById('video-enable');
  const videoStopBtn = document.getElementById('video-stop');
  const videoPopoutBtn = document.getElementById('video-popout');
  const videoStatusEl = document.getElementById('video-status');
  const videoStageCanvas = document.getElementById('video-stage-canvas');
  const samplesPanel = document.getElementById('samples-panel');
  const samplesGroupsEl = document.getElementById('samples-groups');
    const samplesFilterInput = document.getElementById('samples-filter');
    const samplesLinkBtn = document.getElementById('samples-link');
    const samplesRelinkBtn = document.getElementById('samples-relink');
    const samplesUnlinkBtn = document.getElementById('samples-unlink');
    const samplesLocalStatus = document.getElementById('samples-local-status');
    const replWorkspace = document.getElementById('repl-workspace');
    const referenceToggleBtn = document.getElementById('reference-toggle');
    const referencePanel = document.getElementById('reference-panel');
    const referenceCloseBtn = document.getElementById('reference-close');
    const fieldReportDialog = document.getElementById('field-report-dialog');
    const fieldReportForm = document.getElementById('field-report-form');
    const fieldReportPreview = document.getElementById('field-report-preview');
    const fieldReportOpenBtns = Array.from(document.querySelectorAll('[data-field-report-open]'));
    const fieldReportCloseBtns = Array.from(document.querySelectorAll('[data-field-report-close]'));
    const fieldReportCopyBtn = document.querySelector('[data-field-report-copy]');
    const FIELD_REPORT_ISSUE_URL = 'https://github.com/OWNER/REPO/issues/new';

    const SAMPLES_MANIFEST_URL = './samples/manifest.json';
    const DEFAULT_EXAMPLE_URL = './examples/default.txt';
    const REFERENCE_SEEN_KEY = 'replReferenceSeen';
    const LOCAL_SAMPLES_DB_NAME = 'replLocalSamples';
    const LOCAL_SAMPLES_DB_VERSION = 1;
    const LOCAL_SAMPLES_STORE = 'handles';
    const LOCAL_SAMPLES_HANDLE_KEY = 'samplesDir';
    const LOCAL_SAMPLES_EXTENSIONS = new Set(['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac', 'aif', 'aiff']);
    const LOCAL_SAMPLE_GROUP_ID = 'local_folder';
    const LOCAL_SAMPLE_GROUP_LABEL = 'local folder';

  let scheduler = null;
  let lastGoodProgram = null;
  let lastEvaluatedText = '';
  let statusTimer = null;
    let editorAPI = null;
    let shouldAutofocusEditor = true;
    let loadedExampleLabel = '';
    let lastParseErrorText = '';
    let lastRuntimeErrorText = '';
    let localSamplesDbPromise = null;
    let localSamplesDirHandle = null;
    let localSampleObjectUrls = [];
    let localSamplesBusy = false;
    let mediaDeviceChangeBound = false;
    const blockMuteOverridesBySignature = new Map();
    let lastEditorMuteSnapshotKey = '';

  // ---------------- patch title plate ----------------

  const TITLE_COMMENT_RE = /^\s*(?:\/\/\s*title\s*:\s*|#\s*title\s*:\s*|\/\/\/\s*(?:patch\s*:\s*)?)(.+?)\s*$/i;
  const FIELD_COMMENT_RE = /^\s*\/\/\/\s*field\s*:\s*(.+?)\s*$/i;

  function normalizePatchTitle(raw) {
    return String(raw || '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatPatchTitle(raw) {
    const title = normalizePatchTitle(raw) || 'UNTITLED';
    return `PATCH / ${title.toUpperCase()}`;
  }

  function findExplicitPatchTitle(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(TITLE_COMMENT_RE);
      if (m && normalizePatchTitle(m[1])) {
        const value = m[1];
        const valueStartInLine = line.indexOf(value);
        const from = offset + Math.max(0, valueStartInLine);
        const to = from + value.length;
        return {
          title: normalizePatchTitle(value),
          line: i + 1,
          from,
          to,
          lineFrom: offset,
          lineTo: offset + line.length,
        };
      }
      offset += line.length + 1;
    }

    return null;
  }

  function blockMuteSignature(block) {
    if (!block) return '';
    const voice = String(block.voice || 'block').toLowerCase();
    const line = Number(block.line);
    const lineKey = Number.isFinite(line) && line > 0 ? `L${Math.floor(line)}` : 'noline';
    return `${voice}@${lineKey}`;
  }

  function blockByLine(program, lineNumber) {
    const blocks = program && Array.isArray(program.blocks) ? program.blocks : [];
    const target = Number(lineNumber);
    if (!Number.isFinite(target) || target <= 0) return null;
    for (const block of blocks) {
      if (Number(block && block.line) === Math.floor(target)) return block;
    }
    return null;
  }

  function applyStoredBlockMuteOverrides(program) {
    const blocks = program && Array.isArray(program.blocks) ? program.blocks : [];
    for (const block of blocks) {
      const sig = blockMuteSignature(block);
      if (!sig) continue;
      if (!blockMuteOverridesBySignature.has(sig)) continue;
      block.mutedDefault = Boolean(blockMuteOverridesBySignature.get(sig));
    }
  }

  function setStoredBlockMuteOverride(block, muted) {
    const sig = blockMuteSignature(block);
    if (!sig) return;
    const next = Boolean(muted);
    blockMuteOverridesBySignature.set(sig, next);
    block.mutedDefault = next;
  }

  function schedulerMuteStates() {
    if (!scheduler || typeof scheduler.getMuteStates !== 'function') return [];
    try {
      return scheduler.getMuteStates() || [];
    } catch (_) {
      return [];
    }
  }

  function editorMuteLinesSnapshot() {
    const runtime = schedulerMuteStates();
    if (runtime.length > 0) {
      return runtime.map((entry) => ({
        line: entry.line,
        muted: Boolean(entry.muted),
        pending: Boolean(entry.pending),
        pendingMuted: entry.pendingMuted == null ? Boolean(entry.muted) : Boolean(entry.pendingMuted),
        tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
      }));
    }

    const program = lastGoodProgram;
    const blocks = program && Array.isArray(program.blocks) ? program.blocks : [];
    return blocks.map((block) => ({
      line: block && block.line,
      muted: Boolean(block && block.mutedDefault),
      pending: false,
      pendingMuted: Boolean(block && block.mutedDefault),
      tags: Array.isArray(block && block.tags) ? block.tags.slice() : [],
    }));
  }

  function syncEditorBlockMuteLines() {
    if (!editorAPI || typeof editorAPI.setMutedBlockLines !== 'function') return;
    const snapshot = editorMuteLinesSnapshot();
    const key = snapshot
      .map((entry) => `${Number(entry.line) || 0}:${entry.muted ? 1 : 0}:${entry.pending ? 1 : 0}:${entry.pendingMuted ? 1 : 0}`)
      .join('|');
    if (key === lastEditorMuteSnapshotKey) return;
    lastEditorMuteSnapshotKey = key;
    editorAPI.setMutedBlockLines(snapshot);
  }

  function toggleBlockMuteFromEditor(lineNumber) {
    const line = Number(lineNumber);
    if (!Number.isFinite(line) || line <= 0) return;

    let handledByScheduler = false;
    if (scheduler && typeof scheduler.toggleBlockMutedByLine === 'function') {
      const result = scheduler.toggleBlockMutedByLine(line, { quantize: 'bar' });
      if (result && result.ok) {
        handledByScheduler = true;
        const block = blockByLine(lastGoodProgram, line);
        if (block) {
          const targetMuted = result.pending ? Boolean(result.pendingMuted) : Boolean(result.muted);
          setStoredBlockMuteOverride(block, targetMuted);
        }
      }
    }

    if (!handledByScheduler) {
      const block = blockByLine(lastGoodProgram, line);
      if (block) {
        const nextMuted = !Boolean(block.mutedDefault);
        setStoredBlockMuteOverride(block, nextMuted);
        if (scheduler && typeof scheduler.setBlockMutedByLine === 'function') {
          scheduler.setBlockMutedByLine(line, nextMuted, { quantize: 'now' });
        }
      }
    }

    syncEditorBlockMuteLines();
  }

  function sourceLabelFromAttractor(block) {
    if (!block) return '';
    const source = block.source || (block.attractor && block.attractor.source) || {};
    const station = source.station || source.feed || source.region || source.city || '';
    const raw = block.attractor && block.attractor.raw ? block.attractor.raw : '';
    if (raw) return raw;
    if (station) return station;
    return '';
  }

  function generatedPatchTitle(program, text) {
    const blocks = program && Array.isArray(program.blocks) ? program.blocks : [];
    const voices = [];
    const sources = [];

    for (const block of blocks) {
      if (block && block.voice && !voices.includes(block.voice)) voices.push(block.voice);
      const sourceLabel = sourceLabelFromAttractor(block);
      if (sourceLabel && !sources.includes(sourceLabel)) sources.push(sourceLabel);
    }

    if (voices.length || sources.length) {
      const voicePart = voices.length ? voices.slice(0, 3).join(' + ') : 'patch';
      const sourcePart = sources.length ? ` · ${sources.slice(0, 2).join(' · ')}` : '';
      return `${voicePart}${sourcePart}`;
    }

    const field = String(text || '').split('\n').map((line) => line.match(FIELD_COMMENT_RE)).find(Boolean);
    if (field && field[1]) return field[1];
    return 'UNTITLED';
  }

  function computePatchTitle(text, program) {
    const explicit = findExplicitPatchTitle(text);
    if (explicit) return { label: formatPatchTitle(explicit.title), explicit };
    if (loadedExampleLabel) return { label: formatPatchTitle(loadedExampleLabel), explicit: null };
    return { label: formatPatchTitle(generatedPatchTitle(program, text)), explicit: null };
  }

  function setPatchTitleChip(label) {
    if (!patchTitleChip) return;
    patchTitleChip.textContent = label || 'PATCH / UNTITLED';
    patchTitleChip.setAttribute('aria-label', `Patch title: ${patchTitleChip.textContent}`);
  }

  function refreshPatchTitle() {
    if (!patchTitleChip || !editorAPI) return;
    const text = editorAPI.getValue();
    let program = lastGoodProgram;
    if (window.ReplDSL && window.ReplDSL.parse) {
      const parsed = window.ReplDSL.parse(text);
      if (parsed && parsed.ok) program = parsed.program;
    }
    setPatchTitleChip(computePatchTitle(text, program).label);
  }

  function insertPatchTitleMetadata() {
    if (!editorAPI) return;
    const text = editorAPI.getValue();
    const titleInfo = findExplicitPatchTitle(text);
    if (titleInfo) {
      editorAPI.selectRange(titleInfo.from, titleInfo.to);
      editorAPI.focus();
      return;
    }

    const inferred = computePatchTitle(text, lastGoodProgram).label.replace(/^PATCH\s*\/\s*/i, '');
    const title = normalizePatchTitle(inferred) || 'Untitled Patch';
    const prefix = `// title: ${title}\n`;
    editorAPI.dispatchTextChange(0, 0, prefix);
    editorAPI.selectRange(prefix.indexOf(title), prefix.indexOf(title) + title.length);
    editorAPI.focus();
    refreshPatchTitle();
  }

  function focusPatchTitleMetadata(selectText) {
    if (!editorAPI) return;
    const titleInfo = findExplicitPatchTitle(editorAPI.getValue());
    if (!titleInfo) {
      editorAPI.focus();
      editorAPI.setCursor(0);
      return;
    }
    if (selectText && typeof editorAPI.selectRange === 'function') {
      editorAPI.selectRange(titleInfo.from, titleInfo.to);
    } else {
      editorAPI.setCursor(titleInfo.from);
    }
    editorAPI.focus();
  }

  // ---------------- status / errors ----------------

  function setStatusLine() {
    if (!scheduler) {
      statusEl.textContent = 'idle';
      return;
    }
    const t = scheduler.now();
    const transport = formatTime(t.transport);
    const tempo = lastGoodProgram ? Math.round(lastGoodProgram.tempo) : 110;
    const meter = lastGoodProgram ? `${lastGoodProgram.meter.num}/${lastGoodProgram.meter.den}` : '4/4';
    const tunings = collectProgramTunings(lastGoodProgram);
    let tuningPart = '';
    if (tunings.length === 1) {
      const label = tuningLabel(tunings[0]);
      const measured = tuningMeasuredLabel(tunings[0]);
      tuningPart = ` · tuning ${label}${measured ? ` ${measured}` : ''}`;
    } else if (tunings.length > 1) {
      const shown = tunings.slice(0, 3).map((t) => tuningLabel(t)).join(' -> ');
      const more = tunings.length > 3 ? ` +${tunings.length - 3}` : '';
      tuningPart = ` · tuning scoped (${shown}${more})`;
    }
    const stateLabel = scheduler.isRunning() ? 'playing' : 'stopped';
    const bar = t.bar + 1; // human-readable: bar 1 = first bar
    statusEl.textContent = `${tempo} bpm · ${meter}${tuningPart} · ${stateLabel} · ${transport} · bar ${bar}`;
    refreshVideoStatus();
  }

  function formatTime(s) {
    const total = Math.max(0, Math.floor(s));
    const m = Math.floor(total / 60);
    const r = total % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function clearErrors() {
    errorList.innerHTML = '';
  }

    function showErrors(errors) {
      clearErrors();
      lastParseErrorText = Array.isArray(errors) && errors.length
        ? errors.map((e) => `line ${e.line}: ${e.message}`).join('\n')
        : '';

      for (const e of errors) {
        const li = document.createElement('li');
        li.textContent = `line ${e.line}: ${e.message}`;
        errorList.appendChild(li);
      }
    }

  function showWarning(text) {
    const li = document.createElement('li');
    li.textContent = text;
    li.style.color = '#a04';
    errorList.appendChild(li);
  }

  function videoDebugEnabled() {
    return VIDEO_DEBUG_ENABLED;
  }

  function applyVideoDebugGate() {
    if (videoDebugEnabled()) return;

    if (window.VideoVoice && typeof window.VideoVoice.cleanup === 'function') {
      try { window.VideoVoice.cleanup(); } catch (_) {}
    }
    if (videoToolbarEl) videoToolbarEl.hidden = true;
    if (videoPanel) videoPanel.hidden = true;
    if (videoToggleBtn) {
      videoToggleBtn.hidden = true;
      videoToggleBtn.setAttribute('aria-expanded', 'false');
    }
    for (const option of videoExampleOptions) {
      if (!option) continue;
      option.hidden = true;
      if (option.selected) option.selected = false;
    }
  }
    
    // ---------------- field report / bug form ----------------

    function getCurrentPatchText() {
      return editorAPI ? editorAPI.getValue() : '';
    }

    function getCurrentPatchTitle() {
      if (patchTitleChip && patchTitleChip.textContent.trim()) {
        return patchTitleChip.textContent.trim();
      }
      return 'PATCH / UNTITLED';
    }

    function getCheckedValue(form, name, fallback) {
      const checked = form ? form.querySelector(`input[name="${name}"]:checked`) : null;
      return checked ? checked.value : fallback;
    }

    function readFieldReportForm() {
      if (!fieldReportForm) {
        return {
          what: '',
          intent: '',
          kind: 'Other',
          impact: 'Annoying',
          contact: '',
          includePatch: true,
          includeDiagnostics: true,
        };
      }

      const data = new FormData(fieldReportForm);
      return {
        what: String(data.get('what') || '').trim(),
        intent: String(data.get('intent') || '').trim(),
        kind: getCheckedValue(fieldReportForm, 'kind', 'Other'),
        impact: getCheckedValue(fieldReportForm, 'impact', 'Annoying'),
        contact: String(data.get('contact') || '').trim(),
        includePatch: Boolean(data.get('includePatch')),
        includeDiagnostics: Boolean(data.get('includeDiagnostics')),
      };
    }

    function collectFieldReportDiagnostics() {
      const audioState = scheduler && scheduler.ctx ? scheduler.ctx.state : 'not booted';
      const transportState = scheduler
        ? (scheduler.isRunning() ? 'playing' : 'stopped')
        : 'not booted';

      const viewport = `${window.innerWidth} × ${window.innerHeight}`;
      const route = `${window.location.pathname}${window.location.search}${window.location.hash ? '#…' : ''}`;
      const exampleLabel = loadedExampleLabel || 'none';
      const buildNode = document.querySelector('[data-build], .build, #build');
      const build = buildNode ? buildNode.textContent.trim() : 'dev';

      let sampleBank = 'unknown';
      if (window.SampleVoice && typeof window.SampleVoice.list === 'function') {
        try {
          sampleBank = `${window.SampleVoice.list().length} samples available`;
        } catch (_) {
          sampleBank = 'sample list unavailable';
        }
      }

      return [
        ['Build', build],
        ['Route', route],
        ['Browser', navigator.userAgent],
        ['Viewport', viewport],
        ['Patch title', getCurrentPatchTitle()],
        ['Example', exampleLabel],
        ['Transport', transportState],
        ['Audio context', audioState],
        ['Sample bank', sampleBank],
        ['Last parse error', lastParseErrorText || 'none'],
        ['Last runtime error', lastRuntimeErrorText || 'none'],
        ['Timestamp', new Date().toISOString()],
      ];
    }

    function buildFieldReportBody() {
      const report = readFieldReportForm();
      const patchText = getCurrentPatchText();
      const diagnostics = collectFieldReportDiagnostics();

      const parts = [
        '## What happened',
        '',
        report.what || '[not provided]',
        '',
        '## What I was trying to do',
        '',
        report.intent || '[not provided]',
        '',
        '## Bug type',
        '',
        report.kind,
        '',
        '## Impact',
        '',
        report.impact,
        '',
        '## Current patch title',
        '',
        getCurrentPatchTitle(),
        '',
      ];

      if (report.contact) {
        parts.push('## Contact', '', report.contact, '');
      }

      if (report.includePatch) {
        parts.push(
          '## Current patch text',
          '',
          '```repl',
          patchText || '[empty patch]',
          '```',
          ''
        );
      } else {
        parts.push('## Current patch text', '', '[not included]', '');
      }

      if (report.includeDiagnostics) {
        parts.push(
          '## Diagnostics',
          '',
          ...diagnostics.map(([key, value]) => `- ${key}: ${value || 'unknown'}`),
          ''
        );
      } else {
        parts.push('## Diagnostics', '', '[not included]', '');
      }

      return parts.join('\n');
    }

    function buildFieldReportTitle() {
      const report = readFieldReportForm();
      const kind = report.kind || 'Bug';
      const title = getCurrentPatchTitle().replace(/^PATCH\s*\/\s*/i, '').trim() || 'Untitled patch';
      return `[REPL] ${kind} — ${title}`;
    }

    function refreshFieldReportPreview() {
      if (!fieldReportPreview) return;
      fieldReportPreview.value = buildFieldReportBody();
    }

    function openFieldReportDialog() {
      if (!fieldReportDialog || !fieldReportForm) return;

      refreshFieldReportPreview();

      if (typeof fieldReportDialog.showModal === 'function') {
        fieldReportDialog.showModal();
      } else {
        fieldReportDialog.setAttribute('open', '');
      }

      const first = fieldReportForm.querySelector('textarea[name="what"]');
      if (first) first.focus();
    }

    function closeFieldReportDialog() {
      if (!fieldReportDialog) return;

      if (typeof fieldReportDialog.close === 'function') {
        fieldReportDialog.close();
      } else {
        fieldReportDialog.removeAttribute('open');
      }

      if (editorAPI) editorAPI.focus();
    }

    async function copyFieldReport() {
      const body = buildFieldReportBody();

      try {
        await navigator.clipboard.writeText(body);
        if (fieldReportCopyBtn) {
          fieldReportCopyBtn.classList.add('copied');
          fieldReportCopyBtn.textContent = 'copied';
          window.setTimeout(() => {
            fieldReportCopyBtn.classList.remove('copied');
            fieldReportCopyBtn.textContent = 'copy report';
          }, 1400);
        }
      } catch (_) {
        if (fieldReportPreview) {
          fieldReportPreview.focus();
          fieldReportPreview.select();
        }
        showWarning('clipboard unavailable — report selected for manual copy');
      }
    }

    function openFieldReportIssue() {
      const title = buildFieldReportTitle();
      const body = buildFieldReportBody();
      const report = readFieldReportForm();

      const url = new URL(FIELD_REPORT_ISSUE_URL);
      url.searchParams.set('title', title);
      url.searchParams.set('body', body);
      url.searchParams.set('labels', `bug,repl,${report.kind.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);

      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    }

    function bindFieldReport() {
      if (!fieldReportDialog || !fieldReportForm) return;

      fieldReportOpenBtns.forEach((btn) => {
        btn.addEventListener('click', openFieldReportDialog);
      });

      fieldReportCloseBtns.forEach((btn) => {
        btn.addEventListener('click', closeFieldReportDialog);
      });

      fieldReportForm.addEventListener('input', refreshFieldReportPreview);
      fieldReportForm.addEventListener('change', refreshFieldReportPreview);

      if (fieldReportCopyBtn) {
        fieldReportCopyBtn.addEventListener('click', copyFieldReport);
      }

      fieldReportForm.addEventListener('submit', (event) => {
        event.preventDefault();

        if (!fieldReportForm.reportValidity()) {
          refreshFieldReportPreview();
          return;
        }

        refreshFieldReportPreview();
        openFieldReportIssue();
      });

      fieldReportDialog.addEventListener('click', (event) => {
        if (event.target === fieldReportDialog) closeFieldReportDialog();
      });

      fieldReportDialog.addEventListener('cancel', () => {
        window.setTimeout(() => {
          if (editorAPI) editorAPI.focus();
        }, 0);
      });
    }

  // ---------------- evaluation ----------------

    function evaluatePolicyForProgram(program) {
      const raw = program && program.transport ? program.transport.evaluate : null;
      if (raw && typeof raw === 'object') {
        const mode = typeof raw.mode === 'string' ? raw.mode.toLowerCase() : '';
        return {
          mode: mode === 'reset' ? 'reset' : 'immediate',
          cutOnReset: Boolean(raw.cutOnReset),
        };
      }
      const mode = typeof raw === 'string' ? raw.toLowerCase() : '';
      return {
        mode: mode === 'reset' ? 'reset' : 'immediate',
        cutOnReset: false,
      };
    }

    function collectProgramTunings(program) {
      const out = [];
      const seen = new Set();
      const blocks = program && Array.isArray(program.blocks) ? program.blocks : [];
      for (const block of blocks) {
        const tuning = block && block.tuning ? block.tuning : null;
        if (!tuning || typeof tuning !== 'object') continue;
        const id = String(tuning.id || tuning.requestedId || '');
        if (!id) continue;
        const a4 = Number.isFinite(Number(tuning.a4Hz)) ? Number(tuning.a4Hz) : null;
        const key = `${id}::${a4 == null ? '' : a4}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tuning);
      }
      if (out.length === 0 && program && program.tuning) {
        out.push(program.tuning);
      }
      return out;
    }

    function tuningLabel(tuning) {
      if (!tuning || typeof tuning !== 'object') return 'selected';
      const id = tuning.id || tuning.requestedId || 'selected';
      const a4 = Number.isFinite(Number(tuning.a4Hz)) ? Number(tuning.a4Hz) : null;
      return `${id}${a4 != null ? ` @${a4}Hz` : ''}`;
    }

    function tuningMeasuredLabel(tuning) {
      if (
        !tuning
        || !window.ReplTunings
        || typeof window.ReplTunings.tuningToRuntime !== 'function'
        || typeof window.ReplTunings.midiToFreq !== 'function'
      ) return '';
      try {
        const runtime = window.ReplTunings.tuningToRuntime(tuning);
        const a4 = runtime ? Number(window.ReplTunings.midiToFreq(69, runtime)) : NaN;
        const c4 = runtime ? Number(window.ReplTunings.midiToFreq(60, runtime)) : NaN;
        if (Number.isFinite(a4) && Number.isFinite(c4)) {
          return `A4=${a4.toFixed(2)}Hz C4=${c4.toFixed(2)}Hz`;
        }
      } catch (_) {}
      return '';
    }

    function tuningWarningText(program) {
      const tunings = collectProgramTunings(program).filter((t) => t && t.non12);
      if (tunings.length === 0) return '';
      if (tunings.length === 1) {
        const t = tunings[0];
        const id = t.id || t.requestedId || 'selected tuning';
        return `tuning '${id}' uses ${t.noteCount || 'non-12'} notes per octave — pitch names (A4, C4, etc.) are abstract mapping labels in this system`;
      }
      const list = tunings.slice(0, 3).map((t) => t.id || t.requestedId || 'selected').join(', ');
      const more = tunings.length > 3 ? ` (+${tunings.length - 3} more)` : '';
      return `scoped tunings include non-12 systems (${list}${more}) — pitch names (A4, C4, etc.) are abstract mapping labels in those systems`;
    }

    function tuningActivationText(program) {
      const tunings = collectProgramTunings(program);
      if (tunings.length === 0) return '';
      if (tunings.length === 1) {
        const label = tuningLabel(tunings[0]);
        const measured = tuningMeasuredLabel(tunings[0]);
        return `tuning '${label}' active${measured ? ` · ${measured}` : ''}`;
      }
      const list = tunings.slice(0, 3).map((t) => tuningLabel(t)).join(' -> ');
      const more = tunings.length > 3 ? ` +${tunings.length - 3}` : '';
      return `scoped tuning active (${tunings.length} regions) · ${list}${more}`;
    }

    async function evaluateAndRun() {
      const text = editorAPI ? editorAPI.getValue() : '';
      const result = window.ReplDSL.parse(text);

      if (!result.ok) {
        showErrors(result.errors);
        // Keep the previously-running program; don't yank audio out.
        return;
      }

      clearErrors();
      lastParseErrorText = '';
      applyStoredBlockMuteOverrides(result.program);
      lastGoodProgram = result.program;
      refreshPatchTitle();

      const tuningActivation = tuningActivationText(result.program);
      const tuningWarning = tuningWarningText(result.program);
      if (tuningActivation || tuningWarning) {
        if (tuningActivation) showWarning(tuningActivation);
        if (tuningWarning) showWarning(tuningWarning);
        setTimeout(clearErrors, 2400);
      }

      try {
        if (window.ReplAttractors && window.ReplAttractors.warm) {
          window.ReplAttractors.warm(result.program);
        }

        renderTransportShell(result.program);
        syncEditorBlockMuteLines();

        if (!scheduler) bootScheduler();
        if (!scheduler) return;

        const armed = await armInputsForProgram(result.program);
        if (!armed) return;
        const videoArmed = await armVideoForProgram(result.program);
        if (!videoArmed) return;
        lastEvaluatedText = text;

        // Hard evaluate/play:
        // - stop current audio first
        // - install the newly parsed AST
        // - start from transport zero
        //
        // This intentionally differs from safePlay(), because Cmd-Enter / [play]
        // should rebuild runtime state and allow frozen random choices to reroll.
        const evaluatePolicy = evaluatePolicyForProgram(result.program);
        if (scheduler.isRunning() && evaluatePolicy.mode === 'reset' && typeof scheduler.queueEvaluateAtReset === 'function') {
          const when = scheduler.queueEvaluateAtReset(result.program, { stopVoices: evaluatePolicy.cutOnReset });
          if (Number.isFinite(Number(when))) {
            showWarning(
              evaluatePolicy.cutOnReset
                ? 'evaluate queued — next bar reset will cut previous audio (eval reset cut)'
                : 'evaluate queued — next bar reset keeps previous tails (eval reset keep)'
            );
            setTimeout(clearErrors, 1800);
          }
          syncEditorBlockMuteLines();
          lastRuntimeErrorText = '';
          return;
        }

        if (scheduler.isRunning()) {
          scheduler.stop();
        }

        scheduler.update(result.program);
        scheduler.start();
        syncEditorBlockMuteLines();
        lastRuntimeErrorText = '';
      } catch (err) {
        lastRuntimeErrorText = err && err.stack ? err.stack : String(err || 'unknown runtime error');
        showWarning(`runtime error — ${err && err.message ? err.message : 'see field report diagnostics'}`);
      }
    }

    async function safePlay() {
      if (!scheduler) bootScheduler();

      if (!scheduler || !lastGoodProgram) {
        await evaluateAndRun();
        return;
      }

      const currentText = editorAPI ? String(editorAPI.getValue() || '') : '';
      if (currentText !== String(lastEvaluatedText || '')) {
        showWarning('patch changed since last evaluate — running evaluate');
        await evaluateAndRun();
        return;
      }

      const armed = await armInputsForProgram(lastGoodProgram);
      if (!armed) return;
      const videoArmed = await armVideoForProgram(lastGoodProgram);
      if (!videoArmed) return;

      if (typeof scheduler.safeRestart === 'function') {
        scheduler.safeRestart();
      } else {
        // Fallback for stale cached scheduler.js.
        scheduler.stop();
        scheduler.start();
      }
      syncEditorBlockMuteLines();
    }

    function stop() {
      if (scheduler) {
        scheduler.stop();
      }
      syncEditorBlockMuteLines();
      setStatusLine();
      clearActiveClasses();
    }

    function bootScheduler() {
      const audioCtx = window.StringVoice.ensureAudio();
    if (!audioCtx) {
      showWarning('this browser doesn\'t support the Web Audio API');
      return;
    }
    window.StringVoice.resume();
    if (window.InputVoice && window.InputVoice.setAudioContext) {
      window.InputVoice.setAudioContext(audioCtx);
    }
    if (videoDebugEnabled() && window.VideoVoice && window.VideoVoice.setAudioContext) {
      window.VideoVoice.setAudioContext(audioCtx);
    }
    if (videoDebugEnabled() && window.VideoVoice && window.VideoVoice.setStageCanvas && videoStageCanvas) {
      window.VideoVoice.setStageCanvas(videoStageCanvas);
    }
    const masterBus = window.StringVoice.getMasterBus();
    scheduler = window.ReplScheduler.create({ audioCtx, masterBus });
    syncEditorBlockMuteLines();
    scheduler.onMissingSample((name) => {
      if (typeof name === 'string' && name.startsWith('drum-kit:')) {
        const id = name.slice('drum-kit:'.length) || '(missing)';
        if (id === '(missing)') {
          showWarning(`drum block is missing a kit row — add 'kit <id>'`);
        } else {
          showWarning(`drum kit '${id}' is not defined in the sample manifest`);
        }
        return;
      }
      if (typeof name === 'string' && name.startsWith('drum-lane:')) {
        const parts = name.split(':');
        const kitId = parts[1] || '?';
        const lane = parts[2] || '?';
        showWarning(`drum kit '${kitId}' has no resolved samples for lane '${lane}'`);
        return;
      }
      showWarning(`'${name}' isn't in the bank yet — see /labs/repl/samples/README.md`);
    });
  }

  // ---------------- URL hash share ----------------

  async function encodeHash(text) {
    if (!text) return '';
    if (typeof CompressionStream === 'undefined') {
      return 'v0.' + btoaUrl(unicodeToBytes(text));
    }
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      writer.write(unicodeToBytes(text));
      writer.close();
      const compressed = await new Response(cs.readable).arrayBuffer();
      return 'v1.' + btoaUrl(new Uint8Array(compressed));
    } catch (_) {
      return 'v0.' + btoaUrl(unicodeToBytes(text));
    }
  }

  async function decodeHash(hash) {
    if (!hash) return '';
    const trimmed = hash.replace(/^#/, '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('v0.')) {
      try { return bytesToUnicode(atobUrl(trimmed.slice(3))); } catch (_) { return ''; }
    }
    if (trimmed.startsWith('v1.')) {
      if (typeof DecompressionStream === 'undefined') return '';
      try {
        const compressed = atobUrl(trimmed.slice(3));
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(compressed);
        writer.close();
        const decompressed = await new Response(ds.readable).arrayBuffer();
        return bytesToUnicode(new Uint8Array(decompressed));
      } catch (_) {
        return '';
      }
    }
    return '';
  }

  function unicodeToBytes(s) {
    return new TextEncoder().encode(s);
  }
  function bytesToUnicode(bytes) {
    return new TextDecoder().decode(bytes);
  }
  function btoaUrl(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function atobUrl(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function shareCurrent() {
    const text = editorAPI ? editorAPI.getValue() : '';
    const encoded = await encodeHash(text);
    const url = location.origin + location.pathname + (encoded ? '#' + encoded : '');
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      showWarning('share link copied to clipboard');
      setTimeout(clearErrors, 2500);
    } catch (_) {
      // Older browsers / iframe contexts: leave the URL bar as the share.
      showWarning('URL bar updated — copy from there to share');
      setTimeout(clearErrors, 4000);
    }
  }

  async function loadFromHash() {
    if (!location.hash || location.hash === '#') return false;
    const text = await decodeHash(location.hash);
    if (text) {
      loadedExampleLabel = '';
      if (editorAPI) editorAPI.setValue(text);
      refreshPatchTitle();
      return true;
    }
    showWarning('couldn\'t load shared patch — falling back to default example');
    return false;
  }

  async function loadDefaultExample() {
    try {
      const r = await fetch(DEFAULT_EXAMPLE_URL);
      if (r.ok) {
        const t = await r.text();
        loadedExampleLabel = 'default';
        if (editorAPI) editorAPI.setValue(t);
        refreshPatchTitle();
        return;
      }
    } catch (_) {}
    if (editorAPI) {
      loadedExampleLabel = '';
      editorAPI.setValue('// failed to load default example. start typing.\n\ntempo 110\n\nstring   A3   C4   E4   G4\nforce    f    mf   p    f\n');
      refreshPatchTitle();
    }
  }

    // ---------------- reference sidebar ----------------

    function setReferenceOpen(open, opts) {
      const options = opts || {};
      const shouldOpen = Boolean(open);

      if (referencePanel) {
        referencePanel.hidden = !shouldOpen;
      }

      if (referenceToggleBtn) {
        referenceToggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      }

      if (replWorkspace) {
        replWorkspace.classList.toggle('reference-closed', !shouldOpen);
      }

      if (!shouldOpen && options.markSeen !== false) {
        try { localStorage.setItem(REFERENCE_SEEN_KEY, '1'); } catch (_) {}
      }
    }

    function toggleReference() {
      const isOpen = referencePanel ? !referencePanel.hidden : false;
      setReferenceOpen(!isOpen, { markSeen: isOpen });
      if (editorAPI) editorAPI.focus();
    }

    function initReferencePanel() {
      let seen = false;
      try { seen = localStorage.getItem(REFERENCE_SEEN_KEY) === '1'; } catch (_) {}
      setReferenceOpen(!seen, { markSeen: false });
      shouldAutofocusEditor = seen;
    }
    
  // ---------------- editor keybindings ----------------
  //
  // Editor-local keymap (Cmd-Enter, Cmd-Shift-Enter, Esc, Tab, Cmd-/, Cmd-S,
  // Cmd-I, Cmd-K) lives in repl-editor.js. The button handlers below cover the
  // pointer-driven path and refocus the editor afterwards.

    playBtn.addEventListener('click', async () => {
      await evaluateAndRun();
      if (editorAPI) editorAPI.focus();
    });
    if (safePlayBtn) {
      safePlayBtn.addEventListener('click', async () => {
        await safePlay();
        if (editorAPI) editorAPI.focus();
      });
    }
    stopBtn.addEventListener('click', () => {
      stop();
      if (editorAPI) editorAPI.focus();
    });
    shareBtn.addEventListener('click', async () => {
      await shareCurrent();
      if (editorAPI) editorAPI.focus();
    });

    if (referenceToggleBtn) {
      referenceToggleBtn.addEventListener('click', toggleReference);
    }

    if (referenceCloseBtn) {
      referenceCloseBtn.addEventListener('click', () => {
        setReferenceOpen(false);
        if (editorAPI) editorAPI.focus();
      });
    }

  if (patchTitleChip) {
    patchTitleChip.addEventListener('click', (e) => {
      if (e.altKey || e.metaKey) {
        e.preventDefault();
        insertPatchTitleMetadata();
        return;
      }
      focusPatchTitleMetadata(false);
    });
    patchTitleChip.addEventListener('dblclick', (e) => {
      e.preventDefault();
      focusPatchTitleMetadata(true);
    });
  }

  // Document-level Esc safety net: if the user presses Esc anywhere inside
  // the REPL shell, stop audio and refocus the editor. Scoped to the REPL
  // so it doesn't interfere with other browser controls outside.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const replShell = document.querySelector('main.shell');
    const t = e.target;
    if (!replShell || !(t instanceof Node) || !replShell.contains(t)) return;
    // If a CodeMirror keymap already handled Esc inside the editor, this
    // path is harmless: stop() is idempotent and focus() is too.
    stop();
    if (editorAPI) editorAPI.focus();
  });



  function setupExamplePicker(selectEl) {
    if (!selectEl || selectEl.dataset.customPicker === '1') return;
    selectEl.dataset.customPicker = '1';
    selectEl.classList.add('native-example-select');
    selectEl.setAttribute('aria-hidden', 'true');
    selectEl.tabIndex = -1;

    const picker = document.createElement('span');
    picker.className = 'example-picker';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-picker-button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span class="button-main">load example</span><span class="button-shortcut">choose patch</span>';

    const list = document.createElement('ul');
    list.className = 'example-picker-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;

    const colors = ['ryb-red', 'ryb-yellow', 'ryb-blue'];
    Array.from(selectEl.options).forEach((opt) => {
      if (!opt.value) return;
      const item = document.createElement('li');
      item.setAttribute('role', 'presentation');

      const row = document.createElement('button');
      row.type = 'button';
      const optionIndex = list.children.length;
      row.className = `example-picker-option ${colors[optionIndex % colors.length]}`;
      row.setAttribute('role', 'option');
      row.dataset.value = opt.value;
      row.textContent = opt.textContent || opt.value;

      row.addEventListener('click', () => {
        selectEl.value = row.dataset.value || '';
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        closePicker();
      });

      item.appendChild(row);
      list.appendChild(item);
    });

    function openPicker() {
      list.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      const first = list.querySelector('.example-picker-option');
      if (first) first.focus({ preventScroll: true });
    }

    function closePicker() {
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }

    function togglePicker() {
      if (list.hidden) openPicker();
      else closePicker();
    }

    button.addEventListener('click', togglePicker);
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    });

    list.addEventListener('keydown', (e) => {
      const rows = Array.from(list.querySelectorAll('.example-picker-option'));
      const current = document.activeElement;
      const idx = rows.indexOf(current);
      if (e.key === 'Escape') {
        e.preventDefault();
        closePicker();
        button.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (rows[Math.min(rows.length - 1, idx + 1)] || rows[0] || button).focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        (rows[Math.max(0, idx - 1)] || rows[rows.length - 1] || button).focus();
      }
      if (e.key === 'Home') {
        e.preventDefault();
        if (rows[0]) rows[0].focus();
      }
      if (e.key === 'End') {
        e.preventDefault();
        if (rows[rows.length - 1]) rows[rows.length - 1].focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target)) closePicker();
    });

    selectEl.parentNode.insertBefore(picker, selectEl.nextSibling);
    picker.appendChild(button);
    picker.appendChild(list);
  }

  // ---------------- examples loader ----------------

  if (exampleSelect) {
    setupExamplePicker(exampleSelect);
    exampleSelect.addEventListener('change', async () => {
      const v = exampleSelect.value;
      if (!v) return;
      try {
        const r = await fetch(`./examples/${v}`);
        if (r.ok) {
          const text = await r.text();
          const selectedOption = exampleSelect.options[exampleSelect.selectedIndex];
          loadedExampleLabel = selectedOption ? selectedOption.textContent : v.replace(/\.txt$/i, '');
          if (editorAPI) editorAPI.setValue(text);
          refreshPatchTitle();
        }
      } catch (_) {}
      exampleSelect.value = '';
      if (editorAPI) editorAPI.focus();
    });
  }

    // ---------------- transport / coupling visualizer ----------------

    // Cached DOM structure: rebuilt only when the program changes, then updated
    // every frame from scheduler.now().
    let blockRowEls = []; // [ { row, slotEls, everyEl, couplingEl, surfacesEl } per block ]
    let beatDotEls = [];
    let couplingSummaryEls = null;

    const SIGNAL_META = {
      I: {
        key: 'intensity',
        name: 'intensity',
        summary: 'overall signal strength / amplitude pressure',
        detail: 'How strong the current source is. Usually tracks amplitude, confidence, or signal presence.',
        use: 'higher I = louder, more present, more forceful',
        modulates: ['gain', 'compress', 'trigger', 'space'],
      },
      V: {
        key: 'volatility',
        name: 'volatility',
        summary: 'instability, flux, and rate of change',
        detail: 'How unstable or fast-changing the source is. Often derived from flux, motion, or sudden parameter change.',
        use: 'higher V = more drift, jitter, mutation, spatial instability',
        modulates: ['pan', 'blur', 'grain', 'rate', 'leaf'],
      },
      P: {
        key: 'pressure',
        name: 'pressure',
        summary: 'force applied by the source to the patch',
        detail: 'How much force the source applies to the patch. Useful for density, compression, and body behavior.',
        use: 'higher P = heavier behavior, more compression, stronger body/color',
        modulates: ['force', 'body', 'compress', 'filter', 'crush'],
      },
      D: {
        key: 'density',
        name: 'density',
        summary: 'activity concentration and event crowding',
        detail: 'How active or crowded the source is over time. Usually related to onset rate, activity, or event concentration.',
        use: 'higher D = more events, tighter spacing, denser sample behavior',
        modulates: ['beat', 'time', 'grain', 'trigger', 'sample'],
      },
      T: {
        key: 'periodicity',
        name: 'tension',
        summary: 'distance from rest; harmonic or behavioral strain',
        detail: 'How far the source is from rest. A composite signal for instability, brightness, pressure, or unresolved motion.',
        use: 'higher T = more edge, stretch, harmonic strain, or unresolved energy',
        modulates: ['pitch', 'tone', 'filter', 'resonance', 'decay'],
      },
      R: {
        key: 'rupture',
        name: 'rupture',
        summary: 'attacks, transients, breaks, and discontinuities',
        detail: 'How sharply the source breaks continuity. Usually tracks transients, attacks, spikes, or discontinuities.',
        use: 'higher R = attacks, cuts, scars, re-articulations',
        modulates: ['trigger', 'scar', 'leaf', 'start', 'reset'],
      },
    };



    const SURFACE_META = {
      speed: {
        name: 'speed',
        summary: 'pattern-time multiplier / temporal pressure',
        detail: 'Changes how quickly a block consumes its score material. When coupled, speed becomes the surface where signal motion can bend musical time.',
        use: 'higher drive = faster bodies, warped pacing, or drifted clock behavior',
        audio: 'Pattern-time cursor speed; not sample playback rate.',
        range: 'number or ratio, typically 0.0625–16; default 1',
        examples: ['speed 1/2', 'speed 2', 'speed *'],
        drivenBy: ['volatility', 'density', 'rupture'],
      },
      pan: {
        name: 'pan',
        summary: 'left-right position / spatial lateral motion',
        detail: 'Moves material across the stereo field. It is the simplest surface for drift, jitter, and attractor steering.',
        use: 'higher drive = more lateral motion, instability, or spatial displacement',
        audio: 'Stereo pan before block output/effects.',
        range: 'left/center/right or -1..1; default center',
        examples: ['pan left', 'pan -0.4', 'pan *~'],
        drivenBy: ['volatility', 'intensity', 'pressure'],
      },
      gain: {
        name: 'gain',
        summary: 'level / amplitude opening',
        detail: 'Controls how present a block is in the mix. It is usually the first surface touched by intensity and confidence.',
        use: 'higher drive = louder, closer, more exposed material',
        audio: 'Event amplitude scalar before shared output.',
        range: 'quiet/half/full/loud or 0..1.5; default 1',
        examples: ['gain quiet', 'gain 0.45', 'gain mic.intensity 0 1'],
        drivenBy: ['intensity', 'pressure'],
      },
      force: {
        name: 'force',
        summary: 'gesture weight / physical push',
        detail: 'Applies body-like pressure to synthesis and coupled behavior. Useful when a source should push the patch instead of merely modulating it.',
        use: 'higher drive = heavier articulation, stronger impact, more push',
        audio: 'Attack/excitation weight for synth and percussive voices.',
        range: 'pp p mp mf f ff fff or 0..1; default mf-ish',
        examples: ['force mf', 'force 0.8', 'force quake.rupture 0.2 1'],
        drivenBy: ['pressure', 'intensity', 'rupture'],
      },
      compress: {
        name: 'compress',
        summary: 'dynamic regulation / signal clamp',
        detail: 'Turns incoming pressure into compression behavior. It can make the system feel held down, squeezed, or mechanically governed.',
        use: 'higher drive = more grip, flattening, density, or pressure-control',
        drivenBy: ['pressure', 'density', 'intensity'],
      },
      space: {
        name: 'space',
        summary: 'room send / spatial bloom',
        detail: 'Opens reverberant space around the block. Coupling this surface lets the environment expand, contract, or smear around the source.',
        use: 'higher drive = wider room, longer tail, more atmospheric spread',
        audio: 'Block wet send into delay/reverb-like space.',
        range: '0..1 or modes memory/weather/room/horizon',
        examples: ['space 0.25', 'space room', 'space *~'],
        drivenBy: ['intensity', 'tension', 'volatility'],
      },
      body: {
        name: 'body',
        summary: 'resonant mass / embodied color',
        detail: 'Adds mass, chamber, or object-like coloration. It makes a signal feel housed inside something physical.',
        use: 'higher drive = thicker resonance, stronger object-color, heavier body',
        drivenBy: ['pressure', 'intensity', 'tension'],
      },
      pitch: {
        name: 'pitch',
        summary: 'frequency target / harmonic address',
        detail: 'Controls tonal height or pitch selection. In coupled patches, pitch is where tension can become harmonic strain.',
        use: 'higher drive = brighter register, wider pitch pull, sharper harmonic motion',
        drivenBy: ['tension', 'volatility'],
      },
      filter: {
        name: 'filter',
        summary: 'spectral gate / brightness contour',
        detail: 'Shapes the brightness and spectral aperture of a block. It is the main surface for weather, pressure, and tone-color steering.',
        use: 'higher drive = more open spectrum, sharper contour, stronger color shift',
        drivenBy: ['tension', 'pressure', 'intensity'],
      },
      color: {
        name: 'color',
        summary: 'timbre stain / spectral identity',
        detail: 'Marks the block with source-derived tone color. It is a broad surface for making control feel visible in the sound.',
        use: 'higher drive = stronger coloration, more source identity, less neutrality',
        drivenBy: ['pressure', 'tension', 'intensity'],
      },
      decay: {
        name: 'decay',
        summary: 'release length / tail behavior',
        detail: 'Changes how long a gesture remains after articulation. Useful for turning density and tension into lingering or clipped behavior.',
        use: 'higher drive = longer tails, stretched release, or more unstable endings',
        audio: 'Envelope release/tail duration.',
        range: 'seconds, clamped 0.4..8 for DSL rows; voice may narrow internally',
        examples: ['decay 0.8', 'decay 3.5', 'decay *'],
        drivenBy: ['tension', 'density', 'intensity'],
      },
      tone: {
        name: 'tone',
        summary: 'brightness / harmonic emphasis',
        detail: 'Tilts the block toward darker or brighter harmonic behavior. It is a compact surface for timbral pressure.',
        use: 'higher drive = brighter edge, stronger tone focus, more harmonic bite',
        audio: 'Filter brightness and harmonic aperture.',
        range: 'dark/bright or 0..1; default 0.6',
        examples: ['tone dark', 'tone 0.75', 'tone weather.pressure 0.2 0.9'],
        drivenBy: ['tension', 'pressure'],
      },
      crush: {
        name: 'crush',
        summary: 'bit depth / amplitude resolution',
        detail: 'Quantizes amplitude to a literal bit depth. Resolution is separate: a filter/EQ aperture, not a crusher.',
        use: 'lower bits = more quantization; 16 is nearly clean, 4 is severe',
        audio: 'Amplitude bit-depth reduction after voice envelope/filter.',
        range: 'off/0 or integer 4..16; default off',
        examples: ['crush off', 'crush 8', 'crush 4'],
        drivenBy: ['pressure', 'rupture', 'tension'],
      },
      resolution: {
        name: 'resolution',
        summary: 'detail aperture / filter EQ',
        detail: 'Opens a linear filter/EQ aperture for perceived detail. It does not quantize amplitude and does not downsample.',
        use: 'higher values = more open top end and clearer transient detail',
        audio: 'Low-pass aperture after voice envelope/filter; independent from crush.',
        range: 'off/0..1; default off',
        examples: ['resolution 0.35', 'resolution 1', 'resolution mic.rupture 0 1'],
        drivenBy: ['rupture', 'pressure', 'density'],
      },
      rate: {
        name: 'rate',
        summary: 'sample speed / playback motion',
        detail: 'Changes sample playback speed and direction-like behavior. It lets unstable sources bend sample motion directly.',
        use: 'higher drive = faster playback, pitch-linked motion, or sample instability',
        audio: 'Sample playbackRate only; does not change phrase timing.',
        range: 'number/ratio 0.25..4; default 1',
        examples: ['rate 1/2', 'rate 2', 'rate *~'],
        drivenBy: ['volatility', 'density', 'tension'],
      },
      start: {
        name: 'start',
        summary: 'sample entry point / cut location',
        detail: 'Moves where sample playback begins. This surface turns rupture into cuts, skips, and re-articulations inside recorded material.',
        use: 'higher drive = more displacement, sharper cuts, less stable sample origin',
        audio: 'Sample buffer start offset.',
        range: 'seconds or normalized-like number, clamped to buffer length',
        examples: ['start 0', 'start 0.4', 'start mic.rupture 0 0.8'],
        drivenBy: ['rupture', 'volatility'],
      },
      sample: {
        name: 'sample',
        summary: 'archive choice / material selection',
        detail: 'Selects or biases which sample material appears. It is the surface for turning a signal into curatorial pressure.',
        use: 'higher drive = more active selection, tighter bias, or denser archive behavior',
        drivenBy: ['density', 'rupture', 'intensity'],
      },
      kit: {
        name: 'kit',
        summary: 'drum lane map / curated hit pool',
        detail: 'Selects the manifest-defined drum kit used by drum lane tokens (k/s/h/o/t/r/c/*). It is the curatorial surface for deterministic lane hits and wildcard pool behavior.',
        use: 'change kit id = new lane pools while timing and pattern stay unchanged',
        audio: 'Routes drum lane tokens to kit sample pools; does not change timing.',
        range: 'manifest kit ids, e.g. 909, tub-grid',
        examples: ['kit 909', 'kit tub-grid'],
        drivenBy: ['sample', 'density'],
      },
      variance: {
        name: 'variance',
        summary: 'drum sample diversity / lane stability blend',
        detail: 'Controls how much drum lane picks vary from the lane anchor. 0 locks each lane to a stable sample; 1 re-picks from the lane pool on every hit.',
        use: 'lower = stable lane identity; higher = more per-hit variation',
        audio: 'Sample selection diversity for drum lanes only; does not alter event timing.',
        range: 'off/0..1; default 1',
        examples: ['variance 0', 'variance 0.35', 'variance 1'],
        drivenBy: ['density', 'sample', 'rupture'],
      },
      opacity: {
        name: 'opacity',
        summary: 'video layer alpha / stage presence',
        detail: 'Sets how strongly a video layer appears in the compositor.',
        use: 'higher = more visible video layer',
        range: '0..1; default 1',
        examples: ['opacity 0.9', 'opacity camera.motion 0.2 1'],
        drivenBy: ['motion', 'presence'],
      },
      threshold: {
        name: 'threshold',
        summary: 'luma cutoff / binary segmentation',
        detail: 'Cuts image values around a moving threshold for hard masks and high-contrast silhouettes.',
        use: 'higher = fewer bright pixels survive',
        range: '0..1; default 0',
        examples: ['threshold 0.35', 'threshold mic.intensity 0.2 0.7'],
        drivenBy: ['rupture', 'brightness'],
      },
      edges: {
        name: 'edges',
        summary: 'edge emphasis / contour extraction',
        detail: 'Accents image boundaries and contour activity.',
        use: 'higher = stronger contour visibility',
        range: '0..1; default 0',
        examples: ['edges 0.4', 'edges camera.motion 0.1 0.8'],
        drivenBy: ['motion', 'contrast'],
      },
      posterize: {
        name: 'posterize',
        summary: 'color quantization / tone steps',
        detail: 'Reduces tonal gradation into discrete levels.',
        use: 'higher = fewer tone levels',
        range: '0..1; default 0',
        examples: ['posterize 0.5', 'posterize *'],
        drivenBy: ['rupture', 'density'],
      },
      invert: {
        name: 'invert',
        summary: 'polarity inversion / negative image',
        detail: 'Crossfades between normal and inverted image polarity.',
        use: 'higher = stronger negative inversion',
        range: '0..1; default 0',
        examples: ['invert 1', 'invert camera.flicker 0 1'],
        drivenBy: ['flicker', 'rupture'],
      },
      contrast: {
        name: 'contrast',
        summary: 'contrast gain / value spread',
        detail: 'Expands or compresses visual dynamic range.',
        use: 'higher = harder value separation',
        range: '0..1; default 0',
        examples: ['contrast 0.6', 'contrast camera.contrast 0 1'],
        drivenBy: ['contrast', 'pressure'],
      },
      saturate: {
        name: 'saturate',
        summary: 'chroma gain / color intensity',
        detail: 'Boosts or suppresses color intensity.',
        use: 'higher = stronger color saturation',
        range: '0..1; default 0',
        examples: ['saturate 0.4', 'saturate weather.dew 0.1 0.8'],
        drivenBy: ['presence', 'density'],
      },
      displace: {
        name: 'displace',
        summary: 'spatial warp / motion distortion',
        detail: 'Warps pixel positions with lightweight displacement fields.',
        use: 'higher = stronger geometric warp',
        range: '0..1; default 0',
        examples: ['displace 0.3', 'displace camera.flowx 0 1'],
        drivenBy: ['flowx', 'flowy'],
      },
      feedback: {
        name: 'feedback',
        summary: 'frame recursion / memory smear',
        detail: 'Feeds prior frame state back into current layer.',
        use: 'higher = longer visual memory trails',
        range: '0..1; default 0',
        examples: ['feedback 0.25', 'feedback camera.stillness 0.1 0.8'],
        drivenBy: ['stillness', 'density'],
      },
      delay: {
        name: 'delay',
        summary: 'frame lag / temporal offset',
        detail: 'Mixes delayed frame history against current frame.',
        use: 'higher = more delayed ghosts',
        range: '0..1; default 0',
        examples: ['delay 0.2', 'delay camera.motion 0 0.6'],
        drivenBy: ['motion', 'rupture'],
      },
      slitscan: {
        name: 'slitscan',
        summary: 'temporal slicing / scan remap',
        detail: 'Recombines current image from staggered historical strips.',
        use: 'higher = deeper temporal striping',
        range: '0..1; default 0',
        examples: ['slitscan 0.45', 'slitscan camera.flowy 0 1'],
        drivenBy: ['flowx', 'flowy'],
      },
      trail: {
        name: 'trail',
        summary: 'history trail / persistence',
        detail: 'Accumulates short frame history as translucent trails.',
        use: 'higher = longer persistence tails',
        range: '0..1; default 0',
        examples: ['trail 0.5', 'trail camera.stillness 0.1 0.85'],
        drivenBy: ['stillness', 'motion'],
      },
      mask: {
        name: 'mask',
        summary: 'mask amount / visibility gate',
        detail: 'Controls secondary mask influence in the compositor layer.',
        use: 'higher = stronger mask gating',
        range: '0..1; default 0',
        examples: ['mask 0.35', 'mask camera.edges 0 1'],
        drivenBy: ['edges', 'presence'],
      },
      key: {
        name: 'key',
        summary: 'key strength / cutout pressure',
        detail: 'Controls cutout/key aggressiveness for layer compositing.',
        use: 'higher = harder keyed isolation',
        range: '0..1; default 0',
        examples: ['key 0.3', 'key camera.brightness 0 1'],
        drivenBy: ['brightness', 'contrast'],
      },
      color: {
        name: 'color',
        summary: 'hue bias / chroma steering',
        detail: 'Offsets global hue and color cast for the layer.',
        use: 'higher = stronger hue shift',
        range: '0..1; default 0',
        examples: ['color 0.7', 'color weather.dew 0 1'],
        drivenBy: ['pressure', 'presence'],
      },
      blend: {
        name: 'blend',
        summary: 'composite operator / layer arithmetic',
        detail: 'Selects how a video layer combines with the stage buffer.',
        use: 'choose normal/screen/multiply/overlay/difference/lighter',
        range: 'named mode or 0..1',
        examples: ['blend difference', 'blend screen'],
        drivenBy: ['rupture', 'density'],
      },
      fade: {
        name: 'fade',
        summary: 'entry-exit envelope / presence gate',
        detail: 'Controls whether a block enters, leaves, or holds in place. It makes presence itself a performable surface.',
        use: 'higher drive = clearer entrances, exits, holds, or threshold behavior',
        audio: 'Block presence envelope after event gain/effects.',
        range: 'fade in/out/inout/outin seconds, hold, clear',
        examples: ['fade in 30s', 'fade inout 20s', 'fade clear'],
        drivenBy: ['intensity', 'rupture'],
      },
      harm: {
        name: 'harm',
        summary: 'harmonic selection / partial emphasis',
        detail: 'Bends harmonic emphasis inside pitched material. It turns control streams into changes in intervallic color.',
        use: 'higher drive = stronger harmonic pull, brighter partials, altered interval color',
        audio: 'Partial/harmonic count or mode for pitched voices.',
        range: 'simple/pair/triad/rich or 1..5; default pair',
        examples: ['harm simple', 'harm 4', 'harm *'],
        drivenBy: ['tension', 'pressure'],
      },
      octave: {
        name: 'octave',
        summary: 'register displacement / octave pressure',
        detail: 'Moves material between octave bands. This surface keeps pitch identity while changing scale and register.',
        use: 'higher drive = broader register jumps, more vertical displacement',
        audio: 'Integer octave transposition for pitched voices.',
        range: 'integer -2..2; default 0',
        examples: ['octave -1', 'octave 1', 'octave *'],
        drivenBy: ['tension', 'volatility'],
      },
      resonance: {
        name: 'resonance',
        summary: 'filter peak / ringing emphasis',
        detail: 'Adds focused ringing around spectral contours. It can make tension feel like a point of acoustic stress.',
        use: 'higher drive = sharper peaks, more whistle, more unstable focus',
        drivenBy: ['tension', 'pressure'],
      },
      comb: {
        name: 'comb',
        summary: 'delay teeth / resonant interference',
        detail: 'Creates tight delay-based coloration and notched resonance. It is a surface for making space feel mechanical or striated.',
        use: 'higher drive = stronger interference, metallic teeth, tighter coloration',
        drivenBy: ['volatility', 'tension'],
      },
      grain: {
        name: 'grain',
        summary: 'granular texture / particle behavior',
        detail: 'Breaks material into smaller pieces and controls particle activity. It turns density into audible particulate motion.',
        use: 'higher drive = more particles, finer texture, denser fragmentation',
        audio: 'Granular/particle density for sample and texture behavior.',
        range: '0..1 or modes memory/scatter/freeze',
        examples: ['grain 0.25', 'grain scatter', 'grain mic.noisiness 0 0.7'],
        drivenBy: ['density', 'volatility', 'rupture'],
      },
      chorus: {
        name: 'chorus',
        summary: 'detuned doubling / unstable plurality',
        detail: 'Adds moving duplicate voices around the source. It is a surface for widening and destabilizing identity.',
        use: 'higher drive = wider doubling, more shimmer, less single-body certainty',
        drivenBy: ['volatility', 'tension'],
      },
      excite: {
        name: 'excite',
        summary: 'added brightness / activation energy',
        detail: 'Injects extra high-frequency activation into the block. It makes the source feel sparked or chemically awake.',
        use: 'higher drive = brighter attack, more activation, more edge',
        drivenBy: ['intensity', 'rupture', 'tension'],
      },
      blur: {
        name: 'blur',
        summary: 'edge smear / temporal softening',
        detail: 'Softens articulation and smears boundaries. It is the opposite of rupture: a surface for loss of contour.',
        use: 'higher drive = more smear, softer attacks, less precise edges',
        drivenBy: ['volatility', 'density'],
      },
      scar: {
        name: 'scar',
        summary: 'cut memory / accumulated damage',
        detail: 'Leaves marks from discontinuities and attacks. It lets rupture become a remembered texture instead of a one-time event.',
        use: 'higher drive = more cuts, marks, hard edits, and historical damage',
        audio: 'Cut/residue amount in sample and texture behavior.',
        range: '0..1 or modes memory/rupture/ghost',
        examples: ['scar 0.2', 'scar rupture', 'scar *'],
        drivenBy: ['rupture', 'pressure'],
      },
      literal: {
        name: 'literal',
        summary: 'fixed value / uncoupled surface',
        detail: 'This block has no exposed surface chips yet. Its values are being read as written rather than bent by an attractor or control stream.',
        use: 'literal = stable score behavior with no active surface legend',
        drivenBy: ['score'],
      },
    };

    const SURFACE_STATE_META = {
      speed: {
        label: 'SPEED',
        role: 'playback rate / beat division',
        bends: ['beat', 'rate', 'time'],
        units: ['number', 'ratio', 'pattern'],
        cues: [
          { test: (item) => item.kind === 'pattern', text: 'patterned playback clock' },
          { test: (item) => numericAverage(item.values) > 1.25, text: 'fast playback pressure' },
          { test: (item) => numericAverage(item.values) > 0 && numericAverage(item.values) < 0.85, text: 'slowed time / stretched pacing' },
        ],
      },
      pan: {
        label: 'PAN',
        role: 'stereo or spatial placement',
        bends: ['space', 'motion', 'field'],
        units: ['left', 'right', 'center', 'modulation'],
        cues: [
          { test: (item) => item.kind === 'field' || item.kind === 'modulation', text: 'stereo motion field' },
          { test: (item) => item.rawLower.includes('right') && item.rawLower.includes('left'), text: 'right/left pan alternation' },
        ],
      },
      gain: {
        label: 'GAIN',
        role: 'amplitude scalar',
        bends: ['loudness', 'presence'],
        units: ['0–1', 'number', 'signal'],
        cues: [
          { test: (item) => numericAverage(item.values) >= 0.75, text: 'strong presence / forward level' },
          { test: (item) => numericAverage(item.values) > 0 && numericAverage(item.values) < 0.4, text: 'quiet level / recessed presence' },
          { test: (item) => numericAverage(item.values) > 0, text: 'moderate amplitude scalar' },
        ],
      },
      compress: {
        label: 'COMPRESS',
        role: 'dynamic pressure / transient containment',
        bends: ['body', 'density', 'force'],
        units: ['number', 'symbol', 'signal'],
        cues: [{ test: () => true, text: 'dynamic clamp / pressure control' }],
      },
      force: {
        label: 'FORCE',
        role: 'physical pressure applied to the patch',
        bends: ['body', 'compress', 'trigger'],
        units: ['pp', 'p', 'mp', 'mf', 'f', 'ff'],
        cues: [
          { test: (item) => item.displayText.includes('MF'), text: 'medium-force body pressure' },
          { test: (item) => numericAverage(item.values) >= 0.7, text: 'heavy physical push' },
          { test: (item) => numericAverage(item.values) > 0, text: 'body pressure / trigger force' },
        ],
      },
      decay: {
        label: 'DECAY',
        role: 'tail length / release memory',
        bends: ['space', 'resonance', 'memory'],
        units: ['seconds', 'ratio', 'number'],
        cues: [
          { test: (item) => numericAverage(item.values) >= 2, text: 'long tail / release memory' },
          { test: (item) => numericAverage(item.values) > 0, text: 'shortened release contour' },
        ],
      },
      pitch: {
        label: 'PITCH',
        role: 'frequency displacement / harmonic position',
        bends: ['tone', 'tension', 'resonance'],
        units: ['number', 'ratio', 'symbol'],
        cues: [{ test: () => true, text: 'harmonic displacement / pitch pull' }],
      },
      filter: {
        label: 'FILTER',
        role: 'spectral gate / color aperture',
        bends: ['tone', 'brightness', 'pressure'],
        units: ['hz', 'word', 'number'],
        cues: [{ test: () => true, text: 'spectral aperture / brightness contour' }],
      },
      color: {
        label: 'COLOR',
        role: 'timbre tint / spectral identity',
        bends: ['tone', 'surface', 'source'],
        units: ['word', 'symbol', 'signal'],
        cues: [{ test: () => true, text: 'timbre stain / source color' }],
      },
      crush: {
        label: 'CRUSH',
        role: 'amplitude bit depth',
        bends: ['rupture', 'scar', 'body'],
        units: ['off', '4-16', 'signal'],
        cues: [
          { test: (item) => numericAverage(item.values) > 0 && numericAverage(item.values) <= 6, text: 'severe bit-depth quantization' },
          { test: (item) => numericAverage(item.values) > 0 && numericAverage(item.values) < 12, text: 'audible bit-depth crunch' },
          { test: () => true, text: 'amplitude resolution control' },
        ],
      },
      resolution: {
        label: 'RESOLUTION',
        role: 'sample-hold time reduction',
        bends: ['rupture', 'pressure', 'density'],
        units: ['off', '0-1', 'signal'],
        cues: [
          { test: (item) => numericAverage(item.values) >= 0.75, text: 'coarse sample-hold stepping' },
          { test: (item) => numericAverage(item.values) > 0, text: 'reduced time resolution' },
        ],
      },
      rate: {
        label: 'RATE',
        role: 'sample playback speed',
        bends: ['sample', 'pitch', 'motion'],
        units: ['number', 'ratio', 'pattern'],
        cues: [{ test: () => true, text: 'sample motion / playback rate' }],
      },
      start: {
        label: 'START',
        role: 'sample entry point / cut location',
        bends: ['rupture', 'sample', 'scar'],
        units: ['seconds', 'number', 'signal'],
        cues: [{ test: () => true, text: 'sample cut-point displacement' }],
      },
      sample: {
        label: 'SAMPLE',
        role: 'archive choice / material selection',
        bends: ['archive', 'density', 'rupture'],
        units: ['selector', 'word', 'signal'],
        cues: [{ test: () => true, text: 'archive selection pressure' }],
      },
      kit: {
        label: 'KIT',
        role: 'drum lane mapping / curated hit pool',
        bends: ['sample', 'density', 'selection'],
        units: ['kit id'],
        cues: [{ test: () => true, text: 'drum lane pool selection' }],
      },
      variance: {
        label: 'VARIANCE',
        role: 'drum lane sample diversity',
        bends: ['sample', 'density', 'identity'],
        units: ['off', '0-1', 'signal'],
        cues: [
          { test: (item) => numericAverage(item.values) <= 0.1, text: 'stable lane anchors (minimal variation)' },
          { test: (item) => numericAverage(item.values) >= 0.75, text: 'high lane variance (frequent repicks)' },
          { test: () => true, text: 'probabilistic blend of anchors and fresh picks' },
        ],
      },
      fade: {
        label: 'FADE',
        role: 'entry-exit envelope / presence gate',
        bends: ['presence', 'threshold', 'time'],
        units: ['mode', 'seconds'],
        cues: [{ test: () => true, text: 'presence envelope / entrance gate' }],
      },
      harm: {
        label: 'HARM',
        role: 'harmonic selection / partial emphasis',
        bends: ['pitch', 'tone', 'color'],
        units: ['number', 'symbol'],
        cues: [{ test: () => true, text: 'harmonic color selection' }],
      },
      octave: {
        label: 'OCTAVE',
        role: 'register displacement',
        bends: ['pitch', 'scale', 'register'],
        units: ['integer', 'pattern'],
        cues: [{ test: () => true, text: 'register shift / scale displacement' }],
      },
      resonance: {
        label: 'RESONANCE',
        role: 'resonant emphasis / ringing body',
        bends: ['body', 'tone', 'decay'],
        units: ['number', 'mode'],
        cues: [{ test: () => true, text: 'ringing body emphasis' }],
      },
      comb: {
        label: 'COMB',
        role: 'delay-line coloration',
        bends: ['space', 'filter', 'body'],
        units: ['number', 'mode'],
        cues: [{ test: () => true, text: 'mechanical comb coloration' }],
      },
      grain: {
        label: 'GRAIN',
        role: 'granular spray / microscopic density',
        bends: ['density', 'sample', 'time'],
        units: ['number', 'mode'],
        cues: [{ test: () => true, text: 'grain cloud / microscopic density' }],
      },
      chorus: {
        label: 'CHORUS',
        role: 'duplicate voice spread',
        bends: ['space', 'blur', 'motion'],
        units: ['number', 'mode'],
        cues: [{ test: () => true, text: 'widened duplicate-voice field' }],
      },
      excite: {
        label: 'EXCITE',
        role: 'activation energy / brightness injection',
        bends: ['attack', 'tone', 'rupture'],
        units: ['number', 'mode'],
        cues: [{ test: () => true, text: 'sparked attack / added brightness' }],
      },
      blur: {
        label: 'BLUR',
        role: 'edge smear / temporal softening',
        bends: ['time', 'density', 'contour'],
        units: ['number', 'mode'],
        cues: [{ test: () => true, text: 'smeared contour / softened articulation' }],
      },
      scar: {
        label: 'SCAR',
        role: 'cut memory / accumulated damage',
        bends: ['rupture', 'sample', 'history'],
        units: ['number', 'mode'],
        cues: [{ test: () => true, text: 'remembered cuts / historical damage' }],
      },
      body: {
        label: 'BODY',
        role: 'resonant mass / embodied color',
        bends: ['pressure', 'tone', 'space'],
        units: ['number', 'mode'],
        cues: [{ test: () => true, text: 'resonant mass / object color' }],
      },
    };

    const SIGNALS = Object.entries(SIGNAL_META).map(([abbr, meta]) => [abbr, meta.key, meta.name]);

    function classifySlotForViz(node) {
      if (!node) return 'rest';
      if (node.kind === 'group') return 'group';
      if (node.kind === 'leaf') {
        const t = node.token;
        if (t.kind === 'rest') return 'rest';
        if (t.kind === 'sample' || t.kind === 'sample-selector') return 'sample';
        if (t.kind === 'noise') return 'sample';
        if (t.kind === 'pulse') return 'sample';
        if (t.kind === 'drum') return 'sample';
        return 'note';
      }
      return 'rest';
    }

    function hasParamControlStream(stream) {
      if (!stream) return false;
      if (stream.kind === 'scalar') return isParamOp(stream.value);
      if (stream.kind === 'vector') return stream.values.some(isParamOp);
      return false;
    }

    function isParamOp(v) {
      return v && typeof v === 'object' && v.kind === 'param-op';
    }

    function surfaceStateMetaFor(name) {
      const key = String(name || '').toLowerCase();
      const fallback = surfaceMetaFor(key);
      return SURFACE_STATE_META[key] || {
        label: key.toUpperCase(),
        role: fallback.summary || 'exposed behavior surface',
        bends: fallback.drivenBy || ['score'],
        units: ['value'],
        cues: [{ test: () => true, text: fallback.use || `${key} behavior surface` }],
      };
    }

    function numericAverage(values) {
      if (!Array.isArray(values)) return 0;
      const nums = values.map((v) => Number(v)).filter(Number.isFinite);
      if (!nums.length) return 0;
      return nums.reduce((sum, v) => sum + v, 0) / nums.length;
    }

    function paramStreamValues(stream) {
      if (!stream) return [];
      const raw = stream.kind === 'vector' ? stream.values : [stream.value];
      return raw.map((value) => {
        if (isParamOp(value)) return value.raw || value.op || '*';
        if (typeof value === 'number') return value;
        if (value && typeof value === 'object') return value.raw || value.name || value.kind || 'object';
        return value;
      });
    }

    function rawParamLineForBlock(block, name) {
      if (!block || !block.paramLines || !editorAPI) return '';
      const lineNumber = block.paramLines[name];
      if (!lineNumber) return '';
      const lines = String(editorAPI.getValue() || '').split(/\r?\n/);
      const line = lines[lineNumber - 1] || '';
      const trimmed = line.trim();
      const pattern = new RegExp('^' + String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*', 'i');
      return trimmed.replace(pattern, '').trim();
    }

    function escapeTooltipText(value) {
      const div = document.createElement('div');
      div.textContent = value == null ? '' : String(value);
      return div.innerHTML;
    }

    function displayTokensFromRaw(raw) {
      const text = String(raw || '').trim();
      if (!text) return [];
      const normalized = text
        .replace(/\bpi\b/gi, 'π')
        .replace(/\b([0-9]+)\s*\*\s*π\b/g, '$1π')
        .replace(/[()]/g, ' ')
        .replace(/[|]/g, ' | ')
        .replace(/\s+/g, ' ')
        .trim();
      return normalized ? normalized.split(' ').filter(Boolean) : [];
    }

    function classifySurfaceState(name, raw, stream) {
      const text = String(raw || '').trim();
      const lower = text.toLowerCase();
      const values = paramStreamValues(stream);
      const tokenCount = displayTokensFromRaw(text).filter((token) => token !== '|').length || values.length;

      if (/\*|~|_/.test(text)) {
        if (/\bleft\b|\bright\b|\bcenter\b/.test(lower)) return 'field';
        return 'modulation';
      }
      if (/[()|]/.test(text) || tokenCount > 1 || (stream && stream.kind === 'vector')) return 'pattern';
      if (/^(ppp|pp|p|mp|mf|f|ff|fff|quiet|half|full|loud|dark|bright|left|right|center|off|on)$/i.test(text)) return 'symbol';
      if (values.length && values.every((v) => Number.isFinite(Number(v)))) return 'number';
      if (/^-?(?:\d+(?:\.\d+)?|π|pi)(?:[*/]-?(?:\d+(?:\.\d+)?|π|pi))*$/i.test(text)) return 'number';
      if (/^[a-z][a-z0-9_.:-]*$/i.test(text)) return 'word';
      return 'unknown';
    }

    function surfaceStateDisplayText(raw, values) {
      const tokens = displayTokensFromRaw(raw);
      if (tokens.length) return tokens.join(' · ');
      if (Array.isArray(values) && values.length) {
        return values.map((v) => {
          if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3))).replace(/^0\./, '.');
          return String(v);
        }).join(' · ');
      }
      return 'default';
    }


    function formatSurfaceNumber(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value == null ? '' : value);
      if (Math.abs(n) >= 10) return String(Math.round(n * 10) / 10);
      if (Number.isInteger(n)) return String(n);
      return String(Math.round(n * 100) / 100).replace(/^0\./, '.').replace(/^-0\./, '-.');
    }

    function liveSurfaceValueFor(name, liveState) {
      if (!liveState) return undefined;
      const key = String(name || '').toLowerCase();
      if (key === 'speed') return liveState.speed;
      if (key === 'fade') return undefined;
      if (liveState.params && Object.prototype.hasOwnProperty.call(liveState.params, key)) return liveState.params[key];
      if (liveState.effects) {
        const rawKey = '_raw' + key.charAt(0).toUpperCase() + key.slice(1);
        if (Object.prototype.hasOwnProperty.call(liveState.effects, rawKey)) return liveState.effects[rawKey];
        if (Object.prototype.hasOwnProperty.call(liveState.effects, key)) return liveState.effects[key];
      }
      return undefined;
    }

    function displayTextForLiveSurface(name, liveValue, fallback) {
      if (liveValue === undefined || liveValue === null || liveValue === '') return fallback;
      const key = String(name || '').toLowerCase();
      if (typeof liveValue === 'number') {
        if (key === 'pan') {
          if (liveValue > 0.08) return `R ${formatSurfaceNumber(liveValue)}`;
          if (liveValue < -0.08) return `L ${formatSurfaceNumber(Math.abs(liveValue))}`;
          return 'CENTER';
        }
        return formatSurfaceNumber(liveValue);
      }
      if (typeof liveValue === 'string') return liveValue.toUpperCase();
      if (liveValue && typeof liveValue === 'object') return String(liveValue.raw || liveValue.name || liveValue.kind || fallback || 'ON').toUpperCase();
      return String(liveValue).toUpperCase();
    }

    function streamForSurface(block, name) {
      if (!block) return null;
      if (name === 'speed') return block.speed || null;
      if (name === 'fade') return block.fade || null;
      if (block.params && block.params[name]) return block.params[name];
      if (block.effects && block.effects[name]) return block.effects[name];
      return null;
    }

    function activeSurfaceStateItems(block, liveState) {
      if (!block || !block.paramLines) return [];
      const items = [];
      const seen = new Set();
      const keys = Object.keys(block.paramLines)
        .filter((name) => SURFACE_STATE_META[name] || SURFACE_META[name] || name === 'fade')
        .sort((a, b) => (block.paramLines[a] || 0) - (block.paramLines[b] || 0));

      for (const name of keys) {
        if (seen.has(name)) continue;
        seen.add(name);
        const stream = streamForSurface(block, name);
        if (!stream && name !== 'fade') continue;
        const raw = rawParamLineForBlock(block, name);
        const values = paramStreamValues(stream);
        const kind = classifySurfaceState(name, raw, stream);
        const meta = surfaceStateMetaFor(name);
        const fallbackText = surfaceStateDisplayText(raw, values);
        const liveValue = liveSurfaceValueFor(name, liveState);
        const displayText = displayTextForLiveSurface(name, liveValue, fallbackText);
        const item = {
          name,
          meta,
          kind,
          raw,
          rawLower: String(raw || '').toLowerCase(),
          values: liveValue !== undefined && liveValue !== null && Number.isFinite(Number(liveValue)) ? [Number(liveValue)] : values,
          liveValue,
          displayText,
          behavior: meta.role,
        };
        const cue = (meta.cues || []).find((candidate) => {
          try { return candidate.test(item); } catch (_) { return false; }
        });
        if (cue && cue.text) item.behavior = cue.text;
        items.push(item);
      }
      return items;
    }

    function surfaceStateTokens(item) {
      const tokens = String(item && item.displayText ? item.displayText : '')
        .split(' · ')
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => token !== '|');
      if (tokens.length) return tokens;
      if (item && Array.isArray(item.values) && item.values.length) {
        return item.values.map((value) => String(value)).filter(Boolean);
      }
      return ['default'];
    }

    function compactSurfaceStateValue(item) {
      const tokens = surfaceStateTokens(item);
      const upper = tokens.map((token) => token.toUpperCase());
      if (item.kind === 'field') {
        const hasLeft = upper.some((token) => token.includes('LEFT'));
        const hasRight = upper.some((token) => token.includes('RIGHT'));
        const hasCenter = upper.some((token) => token.includes('CENTER'));
        if (hasLeft && hasRight) return 'R ↔ L';
        if (hasLeft) return 'LEFT';
        if (hasRight) return 'RIGHT';
        if (hasCenter) return 'CENTER';
      }
      if (item.kind === 'pattern' || item.kind === 'modulation') {
        const visible = tokens.filter((token) => !/^[*~_\-]+$/.test(token)).slice(0, 4);
        return visible.join(' ').replace(/\bpi\b/gi, 'π') || item.kind.toUpperCase();
      }
      const joined = tokens.slice(0, 3).join(' ');
      if (joined.length > 18) return `${joined.slice(0, 15)}…`;
      return joined || 'default';
    }

    function surfaceHudKind(item) {
      const name = String(item && item.name ? item.name : '').toLowerCase();
      if (name === 'speed' || name === 'rate') return 'clock';
      if (name === 'pan') return 'pan';
      if (name === 'gain') return 'level';
      if (name === 'compress' || name === 'crush' || name === 'resolution' || name === 'variance' || name === 'threshold' || name === 'edges' || name === 'mask' || name === 'key') return 'clamp';
      if (name === 'force') return 'pressure';
      if (name === 'decay' || name === 'fade') return 'tail';
      if (name === 'space' || name === 'blur' || name === 'chorus' || name === 'trail' || name === 'feedback' || name === 'delay' || name === 'slitscan') return 'field';
      if (name === 'pitch' || name === 'octave' || name === 'harm') return 'pitch';
      if (name === 'grain' || name === 'density') return 'particle';
      if (name === 'sample' || name === 'start' || name === 'kit') return 'tape';
      if (name === 'scar' || name === 'rupture') return 'cut';
      if (name === 'tone' || name === 'filter' || name === 'color' || name === 'body' || name === 'blend' || name === 'posterize' || name === 'invert' || name === 'contrast' || name === 'saturate' || name === 'displace' || name === 'opacity' || name === 'monitor' || name === 'listen') return 'stamp';
      if (item.kind === 'number') return 'level';
      if (item.kind === 'pattern' || item.kind === 'modulation') return 'clock';
      return 'stamp';
    }

    function normalizedSurfaceNumber(item) {
      const nums = (item && Array.isArray(item.values) ? item.values : [])
        .map((value) => Number(value))
        .filter(Number.isFinite);
      if (nums.length) {
        const avg = nums.reduce((sum, value) => sum + value, 0) / nums.length;
        if (item && item.name === 'crush') return avg <= 0 ? 0 : Math.max(0, Math.min(1, (16 - avg) / 12));
        return Math.max(0, Math.min(1, avg));
      }
      const text = String(item && item.raw ? item.raw : '').trim();
      const n = Number(text);
      if (!Number.isFinite(n)) return 0.5;
      if (item && item.name === 'crush') return n <= 0 ? 0 : Math.max(0, Math.min(1, (16 - n) / 12));
      if (n > 1) return Math.max(0, Math.min(1, n / 8));
      return Math.max(0, Math.min(1, n));
    }

    function meterCellsHTML(count, active, className = 'surface-hud-cell') {
      const total = Math.max(1, count | 0);
      const filled = Math.max(0, Math.min(total, active | 0));
      let html = '';
      for (let i = 0; i < total; i += 1) {
        html += `<span class="${className}${i < filled ? ' is-on' : ''}"></span>`;
      }
      return html;
    }

    function clockHudHTML(item) {
      const tokens = surfaceStateTokens(item).filter((token) => token !== '|').slice(0, 4);
      const filled = Math.max(1, Math.min(4, tokens.length || 1));
      return `<span class="surface-hud-clock" aria-hidden="true">${meterCellsHTML(4, filled)}</span>`;
    }

    function pressureHudHTML(item) {
      const symbols = { ppp: 1, pp: 1, p: 2, mp: 3, mf: 4, f: 5, ff: 6, fff: 6 };
      const key = String(compactSurfaceStateValue(item)).toLowerCase().trim();
      const filled = symbols[key] || Math.max(1, Math.round(normalizedSurfaceNumber(item) * 6));
      return `<span class="surface-hud-ladder" aria-hidden="true">${meterCellsHTML(6, filled, 'surface-hud-step')}</span>`;
    }

    function tailHudHTML(item) {
      const filled = Math.max(1, Math.round(normalizedSurfaceNumber(item) * 6));
      return `<span class="surface-hud-tail" aria-hidden="true">${meterCellsHTML(6, filled)}</span>`;
    }

    function panHudHTML(item) {
      const text = String(item.raw || item.displayText || '').toLowerCase();
      const hasLeft = /left/.test(text);
      const hasRight = /right/.test(text);
      const hasCenter = /center/.test(text) || (!hasLeft && !hasRight);
      return `
        <span class="surface-hud-pan" aria-hidden="true">
          <span>L</span>
          <span class="surface-hud-pan-cell${hasLeft ? ' is-on' : ''}"></span>
          <span class="surface-hud-pan-cell${hasCenter ? ' is-on' : ''}"></span>
          <span class="surface-hud-pan-cell${hasRight ? ' is-on' : ''}"></span>
          <span>R</span>
        </span>`;
    }

    function levelHudHTML(item, cells = 6) {
      const filled = Math.max(0, Math.min(cells, Math.round(normalizedSurfaceNumber(item) * cells)));
      return `<span class="surface-hud-level" aria-hidden="true">${meterCellsHTML(cells, filled)}</span>`;
    }

    function fieldHudHTML(item) {
      const filled = Math.max(1, Math.round(normalizedSurfaceNumber(item) * 5));
      return `<span class="surface-hud-field" aria-hidden="true">${meterCellsHTML(5, filled)}</span>`;
    }

    function pitchHudHTML(item) {
      const n = normalizedSurfaceNumber(item);
      const active = Math.max(1, Math.min(5, Math.round(n * 5)));
      return `<span class="surface-hud-pitch" aria-hidden="true">${meterCellsHTML(5, active)}</span>`;
    }

    function particleHudHTML(item) {
      const active = Math.max(1, Math.min(7, Math.round(normalizedSurfaceNumber(item) * 7)));
      return `<span class="surface-hud-particles" aria-hidden="true">${meterCellsHTML(7, active, 'surface-hud-dot')}</span>`;
    }

    function tapeHudHTML(item) {
      return `<span class="surface-hud-tape" aria-hidden="true"><span></span><span></span><span></span></span>`;
    }

    function cutHudHTML(item) {
      const active = Math.max(1, Math.min(5, Math.round(normalizedSurfaceNumber(item) * 5)));
      return `<span class="surface-hud-cut" aria-hidden="true">${meterCellsHTML(5, active)}</span>`;
    }

    function stampHudHTML(item) {
      const value = escapeTooltipText(compactSurfaceStateValue(item).toUpperCase());
      return `<span class="surface-hud-stamp" aria-hidden="true">${value || 'ON'}</span>`;
    }

    function surfaceHudVizHTML(item) {
      switch (surfaceHudKind(item)) {
        case 'clock': return clockHudHTML(item);
        case 'pressure': return pressureHudHTML(item);
        case 'tail': return tailHudHTML(item);
        case 'pan': return panHudHTML(item);
        case 'level': return levelHudHTML(item);
        case 'clamp': return levelHudHTML(item, 5);
        case 'field': return fieldHudHTML(item);
        case 'pitch': return pitchHudHTML(item);
        case 'particle': return particleHudHTML(item);
        case 'tape': return tapeHudHTML(item);
        case 'cut': return cutHudHTML(item);
        case 'stamp':
        default: return stampHudHTML(item);
      }
    }

    function surfaceStateHudHTML(item) {
      const label = escapeTooltipText(item.meta.label || item.name.toUpperCase());
      const value = escapeTooltipText(compactSurfaceStateValue(item).toUpperCase());
      const kind = escapeTooltipText(surfaceHudKind(item).toUpperCase());
      const aria = `${label}: ${compactSurfaceStateValue(item)}. ${item.behavior || item.meta.role || 'active surface parameter'}.`;
      return `
        <button class="surface-hud" type="button" data-surface="${escapeTooltipText(item.name)}" data-kind="${escapeTooltipText(item.kind)}" data-hud-kind="${kind}" aria-label="${escapeTooltipText(aria)}">
          <span class="surface-hud-top"><span class="surface-hud-label">${label}</span><span class="surface-hud-kind">${kind}</span></span>
          <span class="surface-hud-value">${value || 'ON'}</span>
          ${surfaceHudVizHTML(item)}
        </button>`;
    }

    function renderSurfaceStatePanel(el, block, liveState) {
      if (!el) return [];
      const items = activeSurfaceStateItems(block, liveState);
      if (!items.length) {
        if (el.classList && el.classList.contains('block-surface-state')) {
          el.innerHTML = '';
          el.hidden = true;
        } else {
          el.innerHTML = '<div class="surface-state-empty">no active surface instruments</div>';
          el.hidden = false;
        }
        return [];
      }
      el.hidden = false;
      el.innerHTML = items.map(surfaceStateHudHTML).join('');
      return items.map((item) => item.name);
    }

    function surfaceMetaFor(name) {
      const key = String(name || 'literal').toLowerCase();
      return SURFACE_META[key] || {
        name: key,
        summary: 'exposed parameter surface',
        detail: 'This chip marks a block surface that can be written literally, automated by control streams, or bent by an attractor.',
        use: `${key} = active behavior surface`,
        drivenBy: ['signal', 'score'],
      };
    }

    function surfaceAriaLabel(name) {
      const meta = surfaceMetaFor(name);
      return `${meta.name}: ${meta.summary}. Driven by ${meta.drivenBy.join(', ')}.`;
    }

    function ensureSurfaceTooltip() {
      let tooltip = document.getElementById('surface-tooltip');
      if (tooltip) return tooltip;

      tooltip = document.createElement('aside');
      tooltip.id = 'surface-tooltip';
      tooltip.className = 'surface-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tooltip);
      return tooltip;
    }

    function surfaceTooltipHTML(name) {
      const meta = surfaceMetaFor(name);
      const label = escapeTooltipText(String(name || 'literal').toUpperCase());
      const chips = meta.drivenBy.map((item) => `<span>${escapeTooltipText(item)}</span>`).join('');
      const specs = [
        ['audio', meta.audio],
        ['range', meta.range],
        ['examples', Array.isArray(meta.examples) ? meta.examples.join(' / ') : meta.examples],
      ]
        .filter((item) => item[1])
        .map(([key, value]) => `<div class="surface-tooltip-spec"><strong>${escapeTooltipText(key)}</strong><span>${escapeTooltipText(value)}</span></div>`)
        .join('');

      return `
        <div class="surface-tooltip-stamp"><span class="surface-tooltip-mark" aria-hidden="true"></span> SURFACE / ${label}</div>
        <div class="surface-tooltip-title">${escapeTooltipText(meta.name)}</div>
        <div class="surface-tooltip-summary">${escapeTooltipText(meta.summary)}</div>
        <div class="surface-tooltip-detail">${escapeTooltipText(meta.detail)}</div>
        ${specs}
        <div class="surface-tooltip-use">${escapeTooltipText(meta.use)}</div>
        <div class="surface-tooltip-modulates"><strong>driven by</strong><div>${chips}</div></div>
      `;
    }

    function positionFloatingTooltip(tooltip, target, clientX, clientY) {
      if (!tooltip) return;

      const viewportPad = 12;
      const cursorGap = 16;
      const targetGap = 10;
      const shadowPad = 10;

      const targetRect = target && target.getBoundingClientRect
        ? target.getBoundingClientRect()
        : null;

      let anchorX = Number.isFinite(clientX) ? clientX : null;
      let anchorY = Number.isFinite(clientY) ? clientY : null;

      if ((anchorX === null || anchorY === null) && targetRect) {
        anchorX = targetRect.left + targetRect.width / 2;
        anchorY = targetRect.top + targetRect.height / 2;
      }

      if (anchorX === null) anchorX = window.innerWidth / 2;
      if (anchorY === null) anchorY = window.innerHeight / 2;

      tooltip.style.left = '0px';
      tooltip.style.top = '0px';

      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipWidth = tooltipRect.width || tooltip.offsetWidth || 304;
      const tooltipHeight = tooltipRect.height || tooltip.offsetHeight || 220;

      let left = anchorX + cursorGap;
      let top = anchorY + cursorGap;

      if (targetRect) {
        const preferRight = targetRect.right + targetGap + tooltipWidth + shadowPad <= window.innerWidth - viewportPad;
        const preferLeft = targetRect.left - targetGap - tooltipWidth - shadowPad >= viewportPad;

        if (preferRight) {
          left = targetRect.right + targetGap;
        } else if (preferLeft) {
          left = targetRect.left - targetGap - tooltipWidth;
        } else {
          left = anchorX - tooltipWidth / 2;
        }

        const below = targetRect.bottom + targetGap;
        const above = targetRect.top - targetGap - tooltipHeight;

        if (below + tooltipHeight + shadowPad <= window.innerHeight - viewportPad) {
          top = below;
        } else if (above >= viewportPad) {
          top = above;
        } else {
          top = anchorY + cursorGap;
        }
      }

      left = Math.max(
        viewportPad,
        Math.min(left, window.innerWidth - tooltipWidth - shadowPad - viewportPad)
      );

      top = Math.max(
        viewportPad,
        Math.min(top, window.innerHeight - tooltipHeight - shadowPad - viewportPad)
      );

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    }

    function positionSignalTooltip(tooltip, target, clientX, clientY) {
      positionFloatingTooltip(tooltip, target, clientX, clientY);
    }

    function positionSurfaceTooltip(tooltip, target, clientX, clientY) {
      positionFloatingTooltip(tooltip, target, clientX, clientY);
    }

    function showSurfaceTooltip(target, clientX, clientY) {
      const name = target && target.dataset ? target.dataset.surface : '';
      if (!name) return;

      const tooltip = ensureSurfaceTooltip();
      tooltip.dataset.surface = name;
      tooltip.innerHTML = surfaceTooltipHTML(name);
      tooltip.setAttribute('aria-hidden', 'false');
      tooltip.classList.add('visible');
      target.setAttribute('aria-describedby', 'surface-tooltip');
      positionSurfaceTooltip(tooltip, target, clientX, clientY);
    }

    function hideSurfaceTooltip(target) {
      const tooltip = document.getElementById('surface-tooltip');
      if (!tooltip) return;

      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
      if (target && target.removeAttribute) target.removeAttribute('aria-describedby');
    }

    function bindSurfaceTooltipEvents() {
      if (!transportVizEl) return;

      transportVizEl.addEventListener('mousemove', (event) => {
        const target = event.target.closest('.surface-chip[data-surface], .surface-hud[data-surface]');
        if (!target || !transportVizEl.contains(target)) return;
        showSurfaceTooltip(target, event.clientX, event.clientY);
      });

      transportVizEl.addEventListener('mouseleave', (event) => {
        hideSurfaceTooltip(event.target);
      });

      transportVizEl.addEventListener('focusin', (event) => {
        const target = event.target.closest('.surface-chip[data-surface], .surface-hud[data-surface]');
        if (!target || !transportVizEl.contains(target)) return;
        const rect = target.getBoundingClientRect();
        showSurfaceTooltip(target, rect.left + rect.width / 2, rect.top);
      });

      transportVizEl.addEventListener('focusout', (event) => {
        const target = event.target.closest('.surface-chip[data-surface], .surface-hud[data-surface]');
        if (target) hideSurfaceTooltip(target);
      });

      window.addEventListener('scroll', () => hideSurfaceTooltip(document.activeElement), true);
      window.addEventListener('resize', () => hideSurfaceTooltip(document.activeElement));
    }

    bindSurfaceTooltipEvents();
    bindSignalTooltipEvents();

    function renderSurfaceChips(el, surfaces, active, activeSurfaceNames) {
      if (!el) return;
      el.innerHTML = '';

      if (!surfaces || surfaces.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'surface-chip';
        empty.textContent = 'literal';
        empty.dataset.surface = 'literal';
        empty.tabIndex = 0;
        empty.setAttribute('role', 'button');
        empty.setAttribute('aria-label', surfaceAriaLabel('literal'));
        el.appendChild(empty);
        return;
      }

      const activeSet = activeSurfaceNames instanceof Set ? activeSurfaceNames : new Set(activeSurfaceNames || []);
      for (const surface of surfaces) {
        const isActiveSurface = active || activeSet.has(surface);
        const chip = document.createElement('span');
        chip.className = 'surface-chip' + (isActiveSurface ? ' active' : '');
        chip.textContent = surface;
        chip.dataset.surface = surface;
        chip.tabIndex = 0;
        chip.setAttribute('role', 'button');
        chip.setAttribute('aria-label', surfaceAriaLabel(surface));
        el.appendChild(chip);
      }
    }

    function walkSlots(slots, fn) {
      if (!Array.isArray(slots)) return;
      for (const node of slots) {
        if (!node) continue;
        fn(node);
        if (node.kind === 'group') walkSlots(node.children, fn);
      }
    }

    function blockHasTokenKind(block, predicate) {
      let found = false;
      walkSlots(block && block.slots, (node) => {
        if (found || node.kind !== 'leaf') return;
        if (predicate(node.token)) found = true;
      });
      return found;
    }

    function surfacesForBlock(block) {
      const surfaces = [];
      if (!block) return surfaces;

      const params = block.params || {};
      const effects = block.effects || {};
      const push = (name) => {
        if (name && !surfaces.includes(name)) surfaces.push(name);
      };

      if (block.fade && block.fade.mode && block.fade.mode !== 'clear') push('fade');
      if (block.speed && (hasParamControlStream(block.speed) || block.speed.kind === 'vector')) push('speed');

      for (const name of ['pan', 'gain', 'rate', 'start', 'crush', 'resolution', 'variance', 'force', 'decay', 'tone', 'harm', 'octave']) {
        if (hasParamControlStream(params[name])) push(name);
      }
      for (const name of ['opacity', 'threshold', 'edges', 'posterize', 'invert', 'contrast', 'saturate', 'displace', 'feedback', 'delay', 'slitscan', 'trail', 'mask', 'key', 'color', 'blend', 'monitor', 'listen']) {
        if (hasParamControlStream(params[name])) push(name);
      }

      for (const name of ['compress', 'space', 'resonance', 'comb', 'grain', 'chorus', 'excite', 'blur', 'scar', 'body']) {
        if (effects[name]) push(name);
      }

      if (block.voice === 'string' || block.voice === 'sine' || block.voice === 'osc' || block.voice === 'pluck' || block.voice === 'drone') {
        const hasRandomPitch = blockHasTokenKind(block, (tok) => tok && tok.kind === 'note-random');
        if (hasRandomPitch) push('pitch');
      }

      if (block.voice === 'sample') {
        const hasSelector = blockHasTokenKind(block, (tok) => {
          return tok && (tok.kind === 'sample-selector' || (tok.kind === 'sample' && tok.gated));
        });
        if (hasSelector) push('sample');
      }

      if (block.voice === 'drum') {
        push('kit');
        push('sample');
      }
      if (block.voice === 'video' || block.voice === 'video-gen') {
        for (const name of ['opacity', 'threshold', 'edges', 'posterize', 'invert', 'contrast', 'saturate', 'displace', 'feedback', 'delay', 'slitscan', 'trail', 'mask', 'key', 'color', 'blend', 'monitor', 'listen']) {
          if (params[name]) push(name);
        }
      }

      // Attractors color the medium even when patch values are literal.
      if (block.attractor) {
        push('filter');
        push('space');
        push('body');
        push('color');
        push('gain');
        push('pan');

        if (block.voice === 'string' || block.voice === 'sine' || block.voice === 'osc' || block.voice === 'pluck' || block.voice === 'drone') {
          push('decay');
          push('tone');
          push('crush');
          push('resolution');
          push('pitch');
        } else if (block.voice === 'noise' || block.voice === 'pulse') {
          push('decay');
          push('tone');
          push('crush');
          push('resolution');
          push('scar');
          push('grain');
        } else if (block.voice === 'sample' || block.voice === 'drum') {
          push('rate');
          push('start');
          push('crush');
          push('resolution');
          push('sample');
          if (block.voice === 'drum') {
            push('kit');
            push('variance');
          }
        } else if (block.voice === 'video' || block.voice === 'video-gen') {
          push('opacity');
          push('threshold');
          push('edges');
          push('feedback');
          push('trail');
          push('blend');
          push('color');
          push('monitor');
          push('listen');
        }

        if (block.speed) push('speed');
      }

      return surfaces;
    }

    function attractorStateForBlock(block) {
      if (!block || !block.attractor) return null;
      if (window.ReplAttractors && typeof window.ReplAttractors.peek === 'function') {
        try {
          return window.ReplAttractors.peek(block.attractor);
        } catch (_) {
          return null;
        }
      }
      return null;
    }

    function formatDecimal(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return '.00';
      const clamped = Math.max(0, Math.min(1, n));
      return clamped.toFixed(2).replace(/^0/, '');
    }

    function formatConfidence(state) {
      if (!state) return '';
      return `confidence ${formatDecimal(state.confidence)}`;
    }

    function formatSourceStatus(state) {
      if (!state) return '';
      const source = String(state.source || 'fallback');
      const confidence = formatConfidence(state);
      return `${source}${confidence ? ' · ' + confidence : ''}`;
    }

    function sourceClass(state) {
      if (!state) return '';
      if (String(state.status || '') === 'error') return 'source-error';
      return String(state.source || '') === 'live' ? 'source-live' : 'source-fallback';
    }

    function sourceLabelForBlock(block) {
      if (!block || !block.attractor) return '';
      const source = block.source || block.attractor.source || {};
      const parts = [];

      if (source.station) parts.push(source.station);
      if (source.feed) parts.push(source.feed);
      if (source.coords) parts.push(source.coords);
      if (source.city) parts.push(source.city);
      if (source.region) parts.push(source.region);
      if (source.body) parts.push(source.body);

      return parts.join(' · ');
    }

    function couplingLabel(block, state) {
      if (!block || !block.attractor) return 'none';
      const name = block.attractor.raw || 'attractor';
      const sourceLabel = sourceLabelForBlock(block);
      const status = block.voice === 'input' ? formatInputBlockStatus(block) : formatSourceStatus(state);
      return [name, sourceLabel, status].filter(Boolean).join(' · ');
    }

    function formatFadeLevel(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return '.00';
      return Math.max(0, Math.min(1, n)).toFixed(2).replace(/^0/, '');
    }

    function fadeLabel(block, fadeState) {
      if (!block || !block.fade || !block.fade.mode || block.fade.mode === 'clear') return '';
      const mode = block.fade.mode;

      if (!fadeState) {
        if (mode === 'hold') return 'fade hold';
        return `fade ${mode}`;
      }

      if (fadeState.held) return `fade hold · ${formatFadeLevel(fadeState.level)}`;

      if (fadeState.completed && fadeState.latched) {
        if (mode === 'in') return 'fade in · complete';
        if (mode === 'out') return 'fade out · latched';
      }

      return `fade ${mode} · ${formatFadeLevel(fadeState.level)}`;
    }

    function blockStatusLabel(block, attractorState, fadeState) {
      const parts = [];
      if (block && block.attractor) parts.push(couplingLabel(block, attractorState));
      const fade = fadeLabel(block, fadeState);
      if (fade) parts.push(fade);
      return parts.join(' · ');
    }

    function signalAriaLabel(abbr, value) {
      const meta = SIGNAL_META[abbr];
      if (!meta) return `Signal ${abbr}: ${formatDecimal(value)}`;
      return `${meta.name}: ${meta.summary}. Modulates ${meta.modulates.join(', ')}.`;
    }

    function signalHTML(state) {
      if (!state) return '';
      return SIGNALS.map(([abbr, key]) => {
        const value = Math.max(0, Math.min(1, Number(state[key]) || 0));
        const level = String(value.toFixed(3));
        const ariaLabel = signalAriaLabel(abbr, value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        return `<span class="signal-token" style="--signal:${level}" data-signal="${abbr}" data-signal-value="${level}" tabindex="0" role="button" aria-label="${ariaLabel}"><abbr>${abbr}</abbr>${formatDecimal(value)}</span>`;
      }).join('');
    }
    
    function ensureSignalTooltip() {
      let tooltip = document.getElementById('signal-tooltip');
      if (tooltip) return tooltip;

      tooltip = document.createElement('aside');
      tooltip.id = 'signal-tooltip';
      tooltip.className = 'signal-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tooltip);
      return tooltip;
    }

    function signalTooltipHTML(abbr, value) {
      const meta = SIGNAL_META[abbr] || {
        name: `Signal ${abbr}`,
        summary: 'live control signal',
        detail: 'This telemetry value is available as a live control source for coupled score behavior.',
        use: `${abbr} = live signal value`,
        modulates: ['surface'],
      };

      const label = escapeTooltipText(String(abbr || '?').toUpperCase());
      const displayValue = formatDecimal(value);
      const chips = (meta.modulates || ['surface'])
        .map((item) => `<span>${escapeTooltipText(item)}</span>`)
        .join('');

      return `
        <div class="signal-tooltip-stamp">
          <span class="signal-tooltip-mark" aria-hidden="true"></span>
          SIGNAL / ${label}
          <b>${escapeTooltipText(displayValue)}</b>
        </div>
        <div class="signal-tooltip-title">${escapeTooltipText(meta.name)}</div>
        <div class="signal-tooltip-summary">${escapeTooltipText(meta.summary)}</div>
        <div class="signal-tooltip-detail">${escapeTooltipText(meta.detail)}</div>
        <div class="signal-tooltip-use">${escapeTooltipText(meta.use)}</div>
        <div class="signal-tooltip-modulates"><strong>modulates</strong><div>${chips}</div></div>
      `;
    }

    function showSignalTooltip(target, clientX, clientY) {
      const abbr = target && target.dataset ? target.dataset.signal : '';
      if (!abbr) return;

      const value = Math.max(0, Math.min(1, Number(target.dataset.signalValue) || 0));
      const tooltip = ensureSignalTooltip();

      tooltip.dataset.signal = abbr;
      tooltip.innerHTML = signalTooltipHTML(abbr, value);
      tooltip.setAttribute('aria-hidden', 'false');
      tooltip.classList.add('visible');

      target.setAttribute('aria-describedby', 'signal-tooltip');
      positionSignalTooltip(tooltip, target, clientX, clientY);
    }

    function hideSignalTooltip(target) {
      const tooltip = document.getElementById('signal-tooltip');
      if (!tooltip) return;

      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
      if (target && target.removeAttribute) target.removeAttribute('aria-describedby');
    }

    function bindSignalTooltipEvents() {
      if (!transportVizEl) return;

      transportVizEl.addEventListener('mousemove', (event) => {
        const target = event.target.closest('.signal-token[data-signal]');
        if (!target || !transportVizEl.contains(target)) return;
        showSignalTooltip(target, event.clientX, event.clientY);
      });

      transportVizEl.addEventListener('mouseleave', (event) => {
        hideSignalTooltip(event.target);
      });

      transportVizEl.addEventListener('focusin', (event) => {
        const target = event.target.closest('.signal-token[data-signal]');
        if (!target || !transportVizEl.contains(target)) return;
        const rect = target.getBoundingClientRect();
        showSignalTooltip(target, rect.left + rect.width / 2, rect.top);
      });

      transportVizEl.addEventListener('focusout', (event) => {
        const target = event.target.closest('.signal-token[data-signal]');
        if (target) hideSignalTooltip(target);
      });

      window.addEventListener('scroll', () => hideSignalTooltip(document.activeElement), true);
      window.addEventListener('resize', () => hideSignalTooltip(document.activeElement));
    }

    function primaryCoupledBlockState(t) {
      if (!t || !Array.isArray(t.blockStates)) return null;

      const live = t.blockStates.find((state) => {
        return state && state.attractor && state.attractorState && state.attractorState.source === 'live';
      });
      if (live) return live;

      return t.blockStates.find((state) => state && state.attractor) || null;
    }

    function blockFromStateIndex(index) {
      return lastGoodProgram && lastGoodProgram.blocks ? lastGoodProgram.blocks[index] : null;
    }

    function updateCouplingSummary(t) {
      if (!couplingSummaryEls) return;

      const state = primaryCoupledBlockState(t);
      if (!state) {
        couplingSummaryEls.couplingRow.hidden = true;
        couplingSummaryEls.signalsRow.hidden = true;
        couplingSummaryEls.surfacesRow.hidden = true;
        couplingSummaryEls.separator.hidden = true;
        return;
      }

      const block = blockFromStateIndex(state.blockIndex);
      const attractorState = state.attractorState || attractorStateForBlock(block);
      const surfaces = surfacesForBlock(block);

      couplingSummaryEls.couplingRow.hidden = false;
      couplingSummaryEls.signalsRow.hidden = false;
      couplingSummaryEls.surfacesRow.hidden = false;
      couplingSummaryEls.separator.hidden = false;

      couplingSummaryEls.couplingValue.textContent = couplingLabel(block, attractorState);
      couplingSummaryEls.couplingValue.className = 'coupling-value ' + sourceClass(attractorState);
      couplingSummaryEls.signalsValue.innerHTML = signalHTML(attractorState);
      renderSurfaceChips(couplingSummaryEls.surfacesValue, surfaces, false);
    }

    function renderTransportShell(program) {
      if (!beatDotsEl || !blockRowsEl) return;

      // Beat dots — one per beat in the meter.
      beatDotsEl.innerHTML = '';
      beatDotEls = [];
      const beats = program.meter.num;
      for (let i = 0; i < beats; i++) {
        const d = document.createElement('span');
        d.className = 'dot beat';
        d.title = `beat ${i + 1} of ${beats}`;
        d.setAttribute('aria-label', `beat ${i + 1}`);
        beatDotsEl.appendChild(d);
        beatDotEls.push(d);
      }

      // Block rows + coupling summary.
      blockRowsEl.innerHTML = '';
      blockRowEls = [];
      couplingSummaryEls = null;

      if (program.blocks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-msg';
        empty.textContent = '(no voices yet — add a string, sine, drone, drum, pulse, noise, sample, or video line)';
        blockRowsEl.appendChild(empty);
        return;
      }

      const couplingRow = document.createElement('div');
      couplingRow.className = 'coupling-row';
      couplingRow.hidden = true;

      const couplingLabelEl = document.createElement('div');
      couplingLabelEl.className = 'coupling-label';
      couplingLabelEl.textContent = 'coupling';

      const couplingSpacer = document.createElement('div');
      couplingSpacer.className = 'slot-dots';

      const couplingValue = document.createElement('div');
      couplingValue.className = 'coupling-value';

      const couplingTail = document.createElement('div');

      couplingRow.appendChild(couplingLabelEl);
      couplingRow.appendChild(couplingSpacer);
      couplingRow.appendChild(couplingValue);
      couplingRow.appendChild(couplingTail);

      const signalsRow = document.createElement('div');
      signalsRow.className = 'coupling-row';
      signalsRow.hidden = true;

      const signalsLabel = document.createElement('div');
      signalsLabel.className = 'coupling-label';
      signalsLabel.textContent = 'signals';

      const signalsSpacer = document.createElement('div');

      const signalsValue = document.createElement('div');
      signalsValue.className = 'coupling-value';

      const signalsTail = document.createElement('div');

      signalsRow.appendChild(signalsLabel);
      signalsRow.appendChild(signalsSpacer);
      signalsRow.appendChild(signalsValue);
      signalsRow.appendChild(signalsTail);

      const surfacesRow = document.createElement('div');
      surfacesRow.className = 'coupling-row';
      surfacesRow.hidden = true;

      const surfacesLabel = document.createElement('div');
      surfacesLabel.className = 'coupling-label';
      surfacesLabel.textContent = 'surfaces';

      const surfacesSpacer = document.createElement('div');

      const surfacesValue = document.createElement('div');
      surfacesValue.className = 'surface-chips';

      const surfacesTail = document.createElement('div');

      surfacesRow.appendChild(surfacesLabel);
      surfacesRow.appendChild(surfacesSpacer);
      surfacesRow.appendChild(surfacesValue);
      surfacesRow.appendChild(surfacesTail);

      const separator = document.createElement('div');
      separator.className = 'coupling-separator';
      separator.hidden = true;

      blockRowsEl.appendChild(couplingRow);
      blockRowsEl.appendChild(signalsRow);
      blockRowsEl.appendChild(surfacesRow);
      blockRowsEl.appendChild(separator);

      couplingSummaryEls = {
        couplingRow,
        signalsRow,
        surfacesRow,
        separator,
        couplingValue,
        signalsValue,
        surfacesValue,
      };

      program.blocks.forEach((block) => {
        const row = document.createElement('div');
        row.className = 'block-row';

        const label = document.createElement('div');
        label.className = 'block-label';
        label.textContent = block.voice === 'input' && block.input
          ? `input ${block.input.kind}`
          : (block.voice === 'video-gen' ? 'video gen' : `${block.voice}`);

        const slotsWrap = document.createElement('div');
        slotsWrap.className = 'slot-dots';

        const slotEls = [];
        // Bars may hold different slot counts under the equal-time bar
        // protocol, so place separators using cumulative barSlotCounts
        // rather than every Nth slot.
        const barSlotCounts = Array.isArray(block.barSlotCounts) && block.barSlotCounts.length > 0
          ? block.barSlotCounts
          : [block.slots.length];
        const barEnds = new Set();
        let acc = 0;
        for (let b = 0; b < barSlotCounts.length - 1; b++) {
          acc += barSlotCounts[b];
          barEnds.add(acc);
        }
        for (let i = 0; i < block.slots.length; i++) {
          const dot = document.createElement('span');
          dot.className = 'dot ' + classifySlotForViz(block.slots[i]);
          dot.title = `slot ${i + 1} of ${block.slots.length}`;
          slotsWrap.appendChild(dot);
          slotEls.push(dot);

          if (barEnds.has(i + 1) && i + 1 < block.slots.length) {
            const sep = document.createElement('span');
            sep.style.width = '0';
            sep.style.borderLeft = '1px solid #aaa';
            sep.style.height = '0.9em';
            sep.style.margin = '0 2px';
            slotsWrap.appendChild(sep);
          }
        }

        const surfaceStateEl = document.createElement('div');
        surfaceStateEl.className = 'surface-state-stack block-surface-state';
        renderSurfaceStatePanel(surfaceStateEl, block, null);

        const couplingEl = document.createElement('div');
        couplingEl.className = 'block-coupling';
          const initialState = attractorStateForBlock(block);
          couplingEl.textContent = blockStatusLabel(block, initialState, null);
        const surfacesEl = document.createElement('div');
        surfacesEl.className = 'surface-chips';
        renderSurfaceChips(surfacesEl, surfacesForBlock(block), false);

        const everyEl = document.createElement('span');
        everyEl.className = 'silent-tag';
        everyEl.style.marginLeft = '0.6em';
        if (block.every) {
          everyEl.textContent = `every ${block.every.count} ${block.every.unit}`;
        }

        row.appendChild(label);
        row.appendChild(slotsWrap);
        row.appendChild(surfaceStateEl);
        row.appendChild(couplingEl);
        row.appendChild(surfacesEl);
        if (block.every) row.appendChild(everyEl);

        blockRowsEl.appendChild(row);
        blockRowEls.push({ row, slotEls, everyEl, couplingEl, surfacesEl, surfaceStateEl, block });
      });

      // Show any parsed/warmed attractor state even before play starts.
      updateCouplingSummary({
        blockStates: program.blocks.map((block, i) => ({
          blockIndex: i,
          attractor: block.attractor,
          attractorState: attractorStateForBlock(block),
        })),
      });
    }

    function clearActiveClasses() {
      if (transportVizEl) transportVizEl.dataset.running = 'false';
      for (const d of beatDotEls) {
        d.classList.remove('active');
        d.style.removeProperty('--beat-progress');
      }
      for (const blk of blockRowEls) {
        if (blk.row) blk.row.classList.remove('active', 'silent', 'live', 'fallback', 'muted', 'mute-pending');
        for (const d of blk.slotEls) d.classList.remove('active', 'live', 'fallback');
      }
    }

    function updateVisualizer() {
      if (!scheduler || !lastGoodProgram || !scheduler.isRunning()) {
        clearActiveClasses();
        if (lastGoodProgram) {
          updateCouplingSummary({
            blockStates: lastGoodProgram.blocks.map((block, i) => ({
              blockIndex: i,
              attractor: block.attractor,
              attractorState: attractorStateForBlock(block),
            })),
          });
        }
        return;
      }

      const t = scheduler.now();
      syncEditorBlockMuteLines();
      if (transportVizEl) {
        transportVizEl.dataset.running = 'true';
        transportVizEl.style.setProperty('--beat-progress', String(Math.max(0, Math.min(1, Number(t.beatProgress) || 0))));
      }

      // Beat dot: highlight whichever beat we're in, and expose beat progress for the light fill.
      const beatInBar = Number.isFinite(t.beatIndex) ? t.beatIndex : (Math.floor(t.beat) % lastGoodProgram.meter.num);
      for (let i = 0; i < beatDotEls.length; i++) {
        const active = i === beatInBar;
        beatDotEls[i].classList.toggle('active', active);
        if (active) {
          beatDotEls[i].style.setProperty('--beat-progress', String(Math.max(0, Math.min(1, Number(t.beatProgress) || 0))));
        } else {
          beatDotEls[i].style.removeProperty('--beat-progress');
        }
      }

      updateCouplingSummary(t);

      // Per-block: highlight currently-active slot and update coupling readouts.
      for (let i = 0; i < blockRowEls.length; i++) {
        const blk = blockRowEls[i];
        const state = t.blockStates[i];
        const block = lastGoodProgram.blocks[i];

        for (const d of blk.slotEls) d.classList.remove('active', 'live', 'fallback');
        if (blk.row) blk.row.classList.remove('active', 'silent', 'live', 'fallback', 'muted', 'mute-pending');
        if (!state || !block) continue;

        const attractorState = state.attractorState || attractorStateForBlock(block);
        const isMuted = Boolean(state.muted);
        if (blk.row) {
          blk.row.classList.toggle('silent', Boolean(state.silent) || isMuted);
          blk.row.classList.toggle('muted', isMuted);
          blk.row.classList.toggle('mute-pending', Boolean(state.mutePending));
          blk.row.classList.toggle('active', !state.silent && !isMuted && state.inBlockIdx >= 0);
          blk.row.classList.toggle('live', Boolean(attractorState && attractorState.source === 'live'));
          blk.row.classList.toggle('fallback', Boolean(attractorState && attractorState.source && attractorState.source !== 'live'));
        }
        if (blk.couplingEl) {
            blk.couplingEl.textContent = blockStatusLabel(block, attractorState, state.fadeState);
            blk.couplingEl.className = 'block-coupling ' + sourceClass(attractorState);
        }

        if (blk.surfaceStateEl) {
          renderSurfaceStatePanel(blk.surfaceStateEl, block, state.surfaceState || null);
        }

        if (blk.surfacesEl) {
            renderSurfaceChips(
              blk.surfacesEl,
              surfacesForBlock(block),
              Boolean(
                (!state.silent && !isMuted && state.inBlockIdx >= 0) ||
                block.attractor ||
                (block.effects && Object.keys(block.effects).length) ||
                (block.fade && block.fade.mode && block.fade.mode !== 'clear')
              )
            );
        }

        if (blk.everyEl) {
          if (isMuted || state.silent) {
            blk.everyEl.style.color = '#bbb';
          } else if (state.every) {
            blk.everyEl.style.color = '#0000cc';
          }
        }

        if (!state.silent && !isMuted && state.inBlockIdx >= 0 && state.inBlockIdx < blk.slotEls.length) {
          const activeDot = blk.slotEls[state.inBlockIdx];
          activeDot.classList.add('active');

          if (attractorState && attractorState.source === 'live') {
            activeDot.classList.add('live');
          } else if (attractorState) {
            activeDot.classList.add('fallback');
          }
        }
      }
    }

    function vizFrame() {
      try {
        updateVisualizer();
      } catch (err) {
        // Keep the transport sidebar alive even if an unexpected program state slips through.
        if (!vizFrame._lastWarn || performance.now() - vizFrame._lastWarn > 1500) {
          vizFrame._lastWarn = performance.now();
          // eslint-disable-next-line no-console
          console.warn('[repl transport viz] update failed:', err);
        }
      } finally {
        requestAnimationFrame(vizFrame);
      }
    }
    requestAnimationFrame(vizFrame);



  // ---------------- live input panel ----------------

  function inputKind() {
    return inputKindSelect ? String(inputKindSelect.value || 'mic') : 'mic';
  }

  function formatInputBlockStatus(block) {
    if (!window.InputVoice || !window.InputVoice.getState || !block || !block.input) return 'input unavailable';
    const state = window.InputVoice.getState()[block.input.kind] || null;
    if (!state) return `${block.input.kind} disconnected`;
    if (state.status === 'live') return `${block.input.kind} live · ${state.label || 'audio input'}`;
    if (state.status === 'requesting') return `${block.input.kind} requesting permission`;
    if (state.status === 'error') return `${block.input.kind} error · ${state.error || 'permission failed'}`;
    return `${block.input.kind} disconnected`;
  }

  function renderInputPanelState(snapshot) {
    if (!inputStatusEl || !inputMeterFill) return;
    const kind = inputKind();
    const state = snapshot && snapshot[kind] ? snapshot[kind] : null;

    if (!state) {
      inputStatusEl.textContent = 'input unavailable';
      inputStatusEl.className = 'input-status source-error';
      inputMeterFill.style.width = '0%';
      return;
    }

    const pieces = [kind, state.status];
    if (state.label && state.status === 'live') pieces.push(state.label);
    if (state.error && state.status === 'error') pieces.push(state.error);
    inputStatusEl.textContent = pieces.join(' · ');
    inputStatusEl.className = 'input-status ' + (state.status === 'live' ? 'source-live' : state.status === 'error' ? 'source-error' : 'source-fallback');
    inputMeterFill.style.width = `${Math.round(Math.max(0, Math.min(1, Number(state.level) || 0)) * 100)}%`;
  }


  function inputKindsForProgram(program) {
    const kinds = new Set();
    const blocks = program && Array.isArray(program.blocks) ? program.blocks : [];
    for (const block of blocks) {
      if (!block || block.voice !== 'input' || !block.input || !block.input.kind) continue;
      kinds.add(String(block.input.kind).toLowerCase());
    }
    return Array.from(kinds).filter(Boolean);
  }

  async function armInputsForProgram(program) {
    const kinds = inputKindsForProgram(program);
    if (!kinds.length) return true;

    if (!window.InputVoice || !window.InputVoice.enable) {
      showWarning('this patch uses input, but the live input module is unavailable');
      return false;
    }

    if (!scheduler) bootScheduler();
    const audioCtx = window.StringVoice && window.StringVoice.ensureAudio ? window.StringVoice.ensureAudio() : null;
    if (!audioCtx) {
      showWarning('this browser does not support Web Audio input');
      return false;
    }

    setInputPanelOpen(true);

    const state = window.InputVoice.getState ? window.InputVoice.getState() : {};
    for (const kind of kinds) {
      if (state[kind] && state[kind].status === 'live') continue;

      if (inputKindSelect) {
        inputKindSelect.value = kind;
        if (inputDeviceSelect) inputDeviceSelect.disabled = kind === 'tab';
        if (inputEnableBtn) inputEnableBtn.textContent = kind === 'tab' ? 'capture tab audio' : 'enable audio input';
      }

      const deviceId = inputDeviceSelect && kind !== 'tab' ? inputDeviceSelect.value : '';
      try {
        showWarning(kind === 'tab' ? 'choose a tab and enable audio to play this patch' : 'allow audio input to play this patch');
        await window.InputVoice.enable(kind, { audioCtx, deviceId });
        if (kind !== 'tab') await refreshInputDevices();
        clearErrors();
      } catch (err) {
        showWarning(err && err.message ? err.message : `could not enable ${kind} input`);
        return false;
      }
    }

    return true;
  }

  function videoSourcesForProgram(program) {
    const kinds = new Set();
    const blocks = program && Array.isArray(program.blocks) ? program.blocks : [];
    for (const block of blocks) {
      if (!block || (block.voice !== 'video' && block.voice !== 'video-gen')) continue;
      const source = block.voice === 'video-gen'
        ? (block.videoGen && block.videoGen.source ? String(block.videoGen.source).toLowerCase() : 'camera')
        : (block.video && block.video.kind ? String(block.video.kind).toLowerCase() : 'camera');
      if (source === 'tab') kinds.add('screen');
      else if (source === 'camera' || source === 'screen' || source === 'file') kinds.add(source);
      else if (source === 'gen' || source.startsWith('vgen-')) {
        // local generated clips do not need capture permissions
      } else {
        kinds.add('camera');
      }
    }
    return Array.from(kinds);
  }

  async function armVideoForProgram(program) {
    const sources = videoSourcesForProgram(program);
    if (!sources.length) return true;
    if (!videoDebugEnabled()) {
      showWarning('video blocks are disabled (enable with ?debug-video=1)');
      return false;
    }
    if (!window.VideoVoice || !window.VideoVoice.enableSource) {
      showWarning('this patch uses video, but the video module is unavailable');
      return false;
    }

    if (videoPanel) videoPanel.hidden = false;
    if (videoToggleBtn) videoToggleBtn.setAttribute('aria-expanded', 'true');

    if (window.VideoVoice.setStageCanvas && videoStageCanvas) {
      window.VideoVoice.setStageCanvas(videoStageCanvas);
    }

    for (const source of sources) {
      if (source === 'file') {
        if (videoKindSelect) videoKindSelect.value = 'file';
        if (videoFileWrap) videoFileWrap.hidden = false;
        showWarning('choose a file in the video panel to arm video file source');
        continue;
      }
      try {
        await window.VideoVoice.enableSource(source, {});
      } catch (err) {
        showWarning(err && err.message ? err.message : `could not enable ${source} video source`);
        return false;
      }
    }
    refreshVideoStatus();
    return true;
  }

  async function refreshInputDevices() {
    if (!inputDeviceSelect || !window.InputVoice || !window.InputVoice.listDevices) return;
    const current = inputDeviceSelect.value;
    const devices = await window.InputVoice.listDevices();
    inputDeviceSelect.innerHTML = '';

    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'default';
    inputDeviceSelect.appendChild(def);

    for (const device of devices) {
      const opt = document.createElement('option');
      opt.value = device.deviceId || '';
      opt.textContent = device.label || 'audio input';
      inputDeviceSelect.appendChild(opt);
    }

    if (current && Array.from(inputDeviceSelect.options).some((opt) => opt.value === current)) {
      inputDeviceSelect.value = current;
    }
  }

  function setOutputPanelStatus(text, className) {
    if (!outputStatusEl) return;
    outputStatusEl.textContent = text || 'output · system default';
    outputStatusEl.className = `input-status ${className || 'source-fallback'}`;
  }

  function outputDeviceLabelById(deviceId) {
    if (!deviceId) return 'system default';
    if (!outputDeviceSelect) return 'selected output';
    const match = Array.from(outputDeviceSelect.options).find((opt) => opt.value === deviceId);
    return match ? String(match.textContent || 'selected output') : 'selected output';
  }

  async function refreshOutputDevices() {
    if (!outputDeviceSelect || !outputApplyBtn || !outputRefreshBtn) return;
    if (!window.StringVoice) {
      outputDeviceSelect.disabled = true;
      outputApplyBtn.disabled = true;
      outputRefreshBtn.disabled = true;
      setOutputPanelStatus('output unavailable', 'source-error');
      return;
    }

    const supported = window.StringVoice.outputRoutingSupported
      ? window.StringVoice.outputRoutingSupported() === true
      : false;

    const previous = outputDeviceSelect.value;
    outputDeviceSelect.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'system default';
    outputDeviceSelect.appendChild(defaultOpt);

    if (!supported || !window.StringVoice.listOutputDevices || !window.StringVoice.getOutputRoutingState) {
      outputDeviceSelect.disabled = true;
      outputApplyBtn.disabled = true;
      outputRefreshBtn.disabled = true;
      setOutputPanelStatus('output selection unsupported in this browser', 'source-fallback');
      return;
    }

    let devices = [];
    try {
      devices = await window.StringVoice.listOutputDevices();
    } catch (_) {
      devices = [];
    }

    for (const device of devices) {
      if (!device || !device.deviceId) continue;
      if (String(device.deviceId) === 'default') continue;
      const opt = document.createElement('option');
      opt.value = String(device.deviceId);
      const label = String(device.label || '').trim();
      opt.textContent = label || 'audio output';
      outputDeviceSelect.appendChild(opt);
    }

    const state = window.StringVoice.getOutputRoutingState();
    const sinkId = state && typeof state.sinkId === 'string' ? state.sinkId : '';
    const hasSinkOption = Array.from(outputDeviceSelect.options).some((opt) => opt.value === sinkId);
    const hasPreviousOption = Array.from(outputDeviceSelect.options).some((opt) => opt.value === previous);
    outputDeviceSelect.value = hasSinkOption ? sinkId : (hasPreviousOption ? previous : '');

    outputDeviceSelect.disabled = false;
    outputApplyBtn.disabled = false;
    outputRefreshBtn.disabled = false;

    if (state && state.error) {
      setOutputPanelStatus(`output error · ${state.error}`, 'source-error');
      return;
    }
    if (outputDeviceSelect.options.length <= 1 && !sinkId) {
      setOutputPanelStatus('output · system default (enable input permission to list more devices)', 'source-fallback');
      return;
    }
    setOutputPanelStatus(`output · ${outputDeviceLabelById(outputDeviceSelect.value)}`, sinkId ? 'source-live' : 'source-fallback');
  }

  async function applySelectedOutputDevice() {
    if (!outputDeviceSelect || !window.StringVoice || !window.StringVoice.setOutputDevice) {
      setOutputPanelStatus('output routing unavailable', 'source-error');
      return;
    }

    if (!scheduler) bootScheduler();
    if (window.StringVoice.resume) {
      try { await window.StringVoice.resume(); } catch (_) {}
    }

    const target = String(outputDeviceSelect.value || '');
    try {
      await window.StringVoice.setOutputDevice(target);
      setOutputPanelStatus(`output · ${outputDeviceLabelById(target)}`, target ? 'source-live' : 'source-fallback');
      clearErrors();
    } catch (err) {
      const message = err && err.message ? err.message : 'could not switch output device';
      showWarning(message);
      setOutputPanelStatus(`output error · ${message}`, 'source-error');
    }
  }

  async function enableSelectedInput() {
    if (!window.InputVoice || !window.InputVoice.enable) {
      showWarning('live input module is unavailable');
      return;
    }

    if (!scheduler) bootScheduler();
    const audioCtx = window.StringVoice && window.StringVoice.ensureAudio ? window.StringVoice.ensureAudio() : null;
    const kind = inputKind();
    const deviceId = inputDeviceSelect && kind !== 'tab' ? inputDeviceSelect.value : '';

    try {
      await window.InputVoice.enable(kind, { audioCtx, deviceId });
      await refreshInputDevices();
      clearErrors();
    } catch (err) {
      showWarning(err && err.message ? err.message : 'input permission failed');
    }
  }

  function stopSelectedInput() {
    if (!window.InputVoice || !window.InputVoice.stop) return;
    window.InputVoice.stop(inputKind());
  }

  function setInputPanelOpen(shouldOpen) {
    if (!inputToggleBtn || !inputPanel) return;
    const open = Boolean(shouldOpen);
    inputPanel.hidden = !open;
    inputToggleBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      refreshInputDevices();
      refreshOutputDevices();
    }
  }

  function toggleInputPanel(forceState) {
    if (!inputToggleBtn || !inputPanel) return;
    if (typeof forceState === 'boolean') {
      setInputPanelOpen(forceState);
      return;
    }
    setInputPanelOpen(inputPanel.hidden);
  }

  function bindInputPanel() {
    if (!inputToggleBtn || !inputPanel) return;

    inputToggleBtn.addEventListener('click', () => toggleInputPanel());

    if (inputKindSelect) {
      inputKindSelect.addEventListener('change', () => {
        const kind = inputKind();
        if (inputDeviceSelect) inputDeviceSelect.disabled = kind === 'tab';
        if (inputEnableBtn) inputEnableBtn.textContent = kind === 'tab' ? 'capture tab audio' : 'enable audio input';
        renderInputPanelState(window.InputVoice && window.InputVoice.getState ? window.InputVoice.getState() : null);
      });
    }

    if (inputEnableBtn) inputEnableBtn.addEventListener('click', enableSelectedInput);
    if (inputStopBtn) inputStopBtn.addEventListener('click', stopSelectedInput);
    if (outputApplyBtn) outputApplyBtn.addEventListener('click', applySelectedOutputDevice);
    if (outputRefreshBtn) outputRefreshBtn.addEventListener('click', refreshOutputDevices);

    if (window.InputVoice && window.InputVoice.onStateChange) {
      window.InputVoice.onStateChange(renderInputPanelState);
    }

    if (!mediaDeviceChangeBound && navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        refreshInputDevices();
        refreshOutputDevices();
      });
      mediaDeviceChangeBound = true;
    }

    refreshInputDevices();
    refreshOutputDevices();
  }

  function selectedVideoKind() {
    return videoKindSelect ? String(videoKindSelect.value || 'camera') : 'camera';
  }

  function refreshVideoStatus() {
    if (!videoDebugEnabled()) return;
    if (!videoStatusEl) return;
    if (!window.VideoVoice || !window.VideoVoice.getState) {
      videoStatusEl.textContent = 'video unavailable';
      videoStatusEl.className = 'input-status source-error';
      return;
    }
    const snap = window.VideoVoice.getState();
    const kind = selectedVideoKind();
    const state = snap && snap.sources ? snap.sources[kind] : null;
    if (!state) {
      videoStatusEl.textContent = 'idle';
      videoStatusEl.className = 'input-status source-fallback';
      return;
    }
    const bits = [kind, state.status];
    if (state.label && state.status === 'live') bits.push(state.label);
    if (state.error && state.status === 'error') bits.push(state.error);
    videoStatusEl.textContent = bits.join(' · ');
    videoStatusEl.className = 'input-status ' + (state.status === 'live' ? 'source-live' : state.status === 'error' ? 'source-error' : 'source-fallback');
  }

  async function enableSelectedVideoSource() {
    if (!videoDebugEnabled()) return;
    if (!window.VideoVoice || !window.VideoVoice.enableSource) {
      showWarning('video module is unavailable');
      return;
    }
    if (!scheduler) bootScheduler();
    const kind = selectedVideoKind();
    if (kind === 'file') {
      const file = videoFileInput && videoFileInput.files ? videoFileInput.files[0] : null;
      if (!file) {
        showWarning('choose a video file first');
        return;
      }
      try {
        window.VideoVoice.attachFile(file);
        clearErrors();
      } catch (err) {
        showWarning(err && err.message ? err.message : 'video file load failed');
      }
      refreshVideoStatus();
      return;
    }

    try {
      await window.VideoVoice.enableSource(kind, {});
      clearErrors();
    } catch (err) {
      showWarning(err && err.message ? err.message : `could not enable ${kind} video source`);
    }
    refreshVideoStatus();
  }

  function stopSelectedVideoSource() {
    if (!videoDebugEnabled()) return;
    if (!window.VideoVoice || !window.VideoVoice.stopSource) return;
    window.VideoVoice.stopSource(selectedVideoKind());
    refreshVideoStatus();
  }

  function toggleVideoPanel(forceOpen) {
    if (!videoDebugEnabled()) return;
    if (!videoPanel || !videoToggleBtn) return;
    const next = forceOpen == null ? videoPanel.hidden : Boolean(forceOpen);
    videoPanel.hidden = !next;
    videoToggleBtn.setAttribute('aria-expanded', String(next));
    if (next && window.VideoVoice && window.VideoVoice.setStageCanvas && videoStageCanvas) {
      window.VideoVoice.setStageCanvas(videoStageCanvas);
    }
    refreshVideoStatus();
  }

  function bindVideoPanel() {
    if (!videoDebugEnabled()) return;
    if (!videoPanel || !videoToggleBtn) return;
    videoToggleBtn.addEventListener('click', () => toggleVideoPanel());
    if (videoKindSelect) {
      videoKindSelect.addEventListener('change', () => {
        const kind = selectedVideoKind();
        if (videoFileWrap) videoFileWrap.hidden = kind !== 'file';
        if (window.VideoVoice && window.VideoVoice.setSourcePreference) {
          window.VideoVoice.setSourcePreference(kind);
        }
        refreshVideoStatus();
      });
    }
    if (videoEnableBtn) videoEnableBtn.addEventListener('click', enableSelectedVideoSource);
    if (videoStopBtn) videoStopBtn.addEventListener('click', stopSelectedVideoSource);
    if (videoFileInput) {
      videoFileInput.addEventListener('change', () => {
        if (selectedVideoKind() !== 'file') return;
        enableSelectedVideoSource();
      });
    }
    if (videoPopoutBtn) {
      videoPopoutBtn.addEventListener('click', () => {
        if (!window.VideoVoice || !window.VideoVoice.openFloatingStageWindow) return;
        const ok = window.VideoVoice.openFloatingStageWindow();
        if (!ok) showWarning('popup blocked — allow popups to detach stage');
      });
    }
    refreshVideoStatus();
  }

  // ---------------- samples browse panel ----------------

  let samplesGroupsCache = null;
  let samplesPanelRendered = false;

  function sampleVoiceSupportsOverlay() {
    return Boolean(
      window.SampleVoice
      && typeof window.SampleVoice.setOverlayBank === 'function'
      && typeof window.SampleVoice.clearOverlayBank === 'function'
    );
  }

  function canUseLocalSampleFolders() {
    return typeof window.showDirectoryPicker === 'function'
      && typeof window.indexedDB !== 'undefined'
      && sampleVoiceSupportsOverlay();
  }

  function invalidateSamplesPanel() {
    samplesGroupsCache = null;
    samplesPanelRendered = false;
  }

  function refreshSamplesPanelIfOpen() {
    if (!samplesPanel || samplesPanel.hasAttribute('hidden')) return;
    renderSamplesPanel(samplesFilterInput ? samplesFilterInput.value : '');
  }

  function setLocalSamplesStatus(text) {
    if (!samplesLocalStatus) return;
    samplesLocalStatus.textContent = text || '';
  }

  function updateLocalSamplesControls() {
    const supported = canUseLocalSampleFolders();
    const busy = localSamplesBusy;
    if (samplesLinkBtn) samplesLinkBtn.disabled = !supported || busy;
    if (samplesRelinkBtn) samplesRelinkBtn.disabled = !supported || busy;
    if (samplesUnlinkBtn) samplesUnlinkBtn.disabled = !supported || busy || !localSamplesDirHandle;
  }

  function revokeLocalSampleObjectUrls() {
    for (const url of localSampleObjectUrls) {
      if (!url) continue;
      try { URL.revokeObjectURL(url); } catch (_) {}
    }
    localSampleObjectUrls = [];
  }

  function clearLocalSampleOverlay() {
    revokeLocalSampleObjectUrls();
    if (sampleVoiceSupportsOverlay()) {
      window.SampleVoice.clearOverlayBank();
    }
    invalidateSamplesPanel();
    refreshSamplesPanelIfOpen();
  }

  async function openLocalSamplesDb() {
    if (typeof window.indexedDB === 'undefined') return null;
    if (localSamplesDbPromise) return localSamplesDbPromise;

    localSamplesDbPromise = new Promise((resolve, reject) => {
      const req = window.indexedDB.open(LOCAL_SAMPLES_DB_NAME, LOCAL_SAMPLES_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOCAL_SAMPLES_STORE)) {
          db.createObjectStore(LOCAL_SAMPLES_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('could not open local samples database'));
      req.onblocked = () => reject(new Error('local samples database is blocked'));
    }).catch((err) => {
      localSamplesDbPromise = null;
      throw err;
    });

    return localSamplesDbPromise;
  }

  async function readSavedSamplesHandle() {
    const db = await openLocalSamplesDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_SAMPLES_STORE, 'readonly');
      const store = tx.objectStore(LOCAL_SAMPLES_STORE);
      const req = store.get(LOCAL_SAMPLES_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('could not read local sample folder handle'));
      tx.onabort = () => reject(tx.error || new Error('local samples read transaction aborted'));
    });
  }

  async function saveSamplesHandle(handle) {
    const db = await openLocalSamplesDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_SAMPLES_STORE, 'readwrite');
      const store = tx.objectStore(LOCAL_SAMPLES_STORE);
      const req = store.put(handle, LOCAL_SAMPLES_HANDLE_KEY);
      req.onerror = () => reject(req.error || new Error('could not save local sample folder handle'));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('local samples write transaction aborted'));
    });
  }

  async function deleteSavedSamplesHandle() {
    const db = await openLocalSamplesDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_SAMPLES_STORE, 'readwrite');
      const store = tx.objectStore(LOCAL_SAMPLES_STORE);
      const req = store.delete(LOCAL_SAMPLES_HANDLE_KEY);
      req.onerror = () => reject(req.error || new Error('could not delete local sample folder handle'));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('local samples delete transaction aborted'));
    });
  }

  async function queryReadPermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'denied';
    try {
      const state = await handle.queryPermission({ mode: 'read' });
      if (state === 'granted' || state === 'prompt' || state === 'denied') return state;
      return 'denied';
    } catch (_) {
      return 'denied';
    }
  }

  async function requestReadPermission(handle) {
    if (!handle || typeof handle.requestPermission !== 'function') return 'denied';
    try {
      const state = await handle.requestPermission({ mode: 'read' });
      if (state === 'granted' || state === 'prompt' || state === 'denied') return state;
      return 'denied';
    } catch (_) {
      return 'denied';
    }
  }

  function isAudioFilename(name) {
    const raw = String(name || '');
    const idx = raw.lastIndexOf('.');
    if (idx <= 0 || idx >= raw.length - 1) return false;
    const ext = raw.slice(idx + 1).toLowerCase();
    return LOCAL_SAMPLES_EXTENSIONS.has(ext);
  }

  async function collectAudioFilesRecursive(dirHandle, pathParts, out) {
    for await (const entry of dirHandle.values()) {
      if (!entry || !entry.name) continue;
      if (entry.kind === 'directory') {
        await collectAudioFilesRecursive(entry, pathParts.concat([entry.name]), out);
        continue;
      }
      if (entry.kind !== 'file' || !isAudioFilename(entry.name)) continue;
      const file = await entry.getFile();
      if (!file) continue;
      out.push({
        relPath: pathParts.concat([entry.name]).join('/'),
        file,
      });
    }
  }

  function slugifyLocalSamplePath(relPath) {
    const lowered = String(relPath || '').toLowerCase().replace(/\\/g, '/');
    const noExt = lowered.replace(/\.[^./]+$/, '');
    const slug = noExt
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');
    return slug || 'sample';
  }

  function buildLocalOverlayFromFiles(files) {
    const sorted = files.slice().sort((a, b) => String(a.relPath || '').localeCompare(String(b.relPath || '')));
    const used = new Set();
    const samples = [];
    const groupSamples = [];
    const createdUrls = [];

    for (const item of sorted) {
      if (!item || !item.file) continue;
      const base = `local-${slugifyLocalSamplePath(item.relPath)}`;
      let name = base;
      let suffix = 2;
      while (used.has(name)) {
        name = `${base}-${suffix}`;
        suffix += 1;
      }
      used.add(name);
      const url = URL.createObjectURL(item.file);
      createdUrls.push(url);
      samples.push({
        name,
        url,
        file: item.file.name || '',
        source: `local:${item.relPath}`,
        group: LOCAL_SAMPLE_GROUP_ID,
      });
      groupSamples.push(name);
    }

    const groups = groupSamples.length
      ? [{ id: LOCAL_SAMPLE_GROUP_ID, label: LOCAL_SAMPLE_GROUP_LABEL, samples: groupSamples }]
      : [];

    return { samples, groups, createdUrls };
  }

  async function applyLocalSamplesFromHandle(handle, options) {
    if (!canUseLocalSampleFolders() || !handle) return false;
    const opts = options && typeof options === 'object' ? options : {};
    const requireGranted = Boolean(opts.requireGranted);
    const statusWhenPrompt = opts.statusWhenPrompt || 'local folder saved — click relink to grant access';
    const statusPrefix = opts.statusPrefix || 'local folder';

    const permission = await queryReadPermission(handle);
    if (permission === 'denied') {
      clearLocalSampleOverlay();
      localSamplesDirHandle = handle;
      setLocalSamplesStatus(`${statusPrefix} access denied — relink to grant access`);
      updateLocalSamplesControls();
      return false;
    }
    if (permission !== 'granted') {
      if (requireGranted) {
        const requested = await requestReadPermission(handle);
        if (requested !== 'granted') {
          clearLocalSampleOverlay();
          localSamplesDirHandle = handle;
          setLocalSamplesStatus(statusWhenPrompt);
          updateLocalSamplesControls();
          return false;
        }
      } else {
        clearLocalSampleOverlay();
        localSamplesDirHandle = handle;
        setLocalSamplesStatus(statusWhenPrompt);
        updateLocalSamplesControls();
        return false;
      }
    }

    const files = [];
    await collectAudioFilesRecursive(handle, [], files);
    const overlay = buildLocalOverlayFromFiles(files);
    clearLocalSampleOverlay();
    localSampleObjectUrls = overlay.createdUrls;
    window.SampleVoice.setOverlayBank({
      samples: overlay.samples,
      groups: overlay.groups,
    });
    localSamplesDirHandle = handle;
    invalidateSamplesPanel();
    refreshSamplesPanelIfOpen();
    setLocalSamplesStatus(`${statusPrefix}: ${overlay.samples.length} loaded`);
    updateLocalSamplesControls();
    return true;
  }

  function setLocalSamplesBusy(nextBusy) {
    localSamplesBusy = Boolean(nextBusy);
    updateLocalSamplesControls();
  }

  async function chooseLocalSamplesFolder() {
    if (typeof window.showDirectoryPicker !== 'function') return null;
    return window.showDirectoryPicker({ id: 'repl-samples', mode: 'read' });
  }

  async function linkLocalSamplesFolder() {
    if (!canUseLocalSampleFolders()) return;
    setLocalSamplesBusy(true);
    setLocalSamplesStatus('linking local folder...');
    try {
      const handle = await chooseLocalSamplesFolder();
      if (!handle) {
        setLocalSamplesStatus('local folder link canceled');
        return;
      }
      const linked = await applyLocalSamplesFromHandle(handle, {
        requireGranted: true,
        statusPrefix: `local folder "${handle.name || 'linked'}"`,
      });
      if (linked) {
        try {
          await saveSamplesHandle(handle);
        } catch (err) {
          showWarning(err && err.message ? err.message : 'could not persist local sample folder link');
          setLocalSamplesStatus(`local folder "${handle.name || 'linked'}" loaded (not persisted)`);
        }
      }
    } catch (err) {
      const name = err && err.name ? String(err.name) : '';
      if (name === 'AbortError') {
        setLocalSamplesStatus('local folder link canceled');
      } else {
        showWarning(err && err.message ? err.message : 'could not link local sample folder');
        setLocalSamplesStatus('local folder link failed');
      }
    } finally {
      setLocalSamplesBusy(false);
    }
  }

  async function unlinkLocalSamplesFolder() {
    setLocalSamplesBusy(true);
    try {
      clearLocalSampleOverlay();
      localSamplesDirHandle = null;
      if (canUseLocalSampleFolders()) {
        try {
          await deleteSavedSamplesHandle();
        } catch (err) {
          showWarning(err && err.message ? err.message : 'could not clear saved local sample folder');
        }
      }
      setLocalSamplesStatus('local folder unlinked');
    } finally {
      setLocalSamplesBusy(false);
    }
  }

  async function initLocalSamplesFromSavedHandle() {
    if (!canUseLocalSampleFolders()) {
      if (!sampleVoiceSupportsOverlay()) {
        setLocalSamplesStatus('local folder samples unavailable in this build');
      } else {
        setLocalSamplesStatus('local folder linking not supported in this browser');
      }
      updateLocalSamplesControls();
      return;
    }

    setLocalSamplesBusy(true);
    setLocalSamplesStatus('checking saved local folder...');
    try {
      const handle = await readSavedSamplesHandle();
      if (!handle) {
        setLocalSamplesStatus('no local folder linked');
        localSamplesDirHandle = null;
        clearLocalSampleOverlay();
        return;
      }
      await applyLocalSamplesFromHandle(handle, {
        requireGranted: false,
        statusPrefix: `local folder "${handle.name || 'saved'}"`,
        statusWhenPrompt: 'saved local folder needs permission — click relink',
      });
    } catch (err) {
      showWarning(err && err.message ? err.message : 'could not restore local sample folder link');
      clearLocalSampleOverlay();
      localSamplesDirHandle = null;
      setLocalSamplesStatus('local folder restore failed');
    } finally {
      setLocalSamplesBusy(false);
    }
  }

  function renderSamplesPanel(filter) {
    if (!samplesGroupsEl) return;
    if (!samplesGroupsCache && window.SampleVoice) {
      samplesGroupsCache = window.SampleVoice.groups();
    }
    samplesGroupsEl.innerHTML = '';
    const groups = samplesGroupsCache || [];
    const f = (filter || '').trim().toLowerCase();
    let total = 0;
    for (const group of groups) {
      const filtered = f ? group.samples.filter((n) => n.toLowerCase().includes(f)) : group.samples;
      if (filtered.length === 0) continue;
      total += filtered.length;
      const groupEl = document.createElement('div');
      groupEl.className = 'samples-group';
      const head = document.createElement('div');
      head.className = 'samples-group-head';
      head.textContent = `${group.label} — ${filtered.length}${f && filtered.length !== group.samples.length ? ` of ${group.samples.length}` : ''}`;
      groupEl.appendChild(head);
      const pills = document.createElement('div');
      pills.className = 'samples-pills';
      for (const name of filtered) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'samples-pill';
        btn.textContent = name;
        btn.dataset.name = name;
        pills.appendChild(btn);
      }
      groupEl.appendChild(pills);
      samplesGroupsEl.appendChild(groupEl);
    }
    if (total === 0) {
      const empty = document.createElement('div');
      empty.className = 'samples-empty';
      empty.textContent = (groups.length === 0)
        ? 'sample bank not loaded yet — try again in a moment'
        : `no samples match "${filter}"`;
      samplesGroupsEl.appendChild(empty);
    }
    samplesPanelRendered = true;
  }

  function insertAtCursor(text) {
    if (!editorAPI) return;
    const value = typeof text === 'string' ? text : '';
    if (!value) return;

    const doc = (typeof editorAPI.getValue === 'function')
      ? String(editorAPI.getValue() || '')
      : '';
    const rawCursor = (typeof editorAPI.getCursor === 'function')
      ? editorAPI.getCursor()
      : 0;
    const cursor = Number.isFinite(rawCursor)
      ? Math.max(0, Math.min(doc.length, rawCursor | 0))
      : 0;

    // Collapse to one caret before insertion so a stale selection range
    // cannot redirect edits away from the user's intended cursor point.
    if (typeof editorAPI.setCursor === 'function') editorAPI.setCursor(cursor);
    editorAPI.focus();

    if (typeof editorAPI.dispatchTextChange !== 'function') {
      editorAPI.insertText(value);
      return;
    }

    const before = cursor > 0 ? doc.slice(cursor - 1, cursor) : '';
    const after = cursor < doc.length ? doc.slice(cursor, cursor + 1) : '';
    const needLead = before && !/\s|\(/.test(before);
    const needTrail = after && !/\s|\)/.test(after);
    const insert = `${needLead ? ' ' : ''}${value}${needTrail ? ' ' : ''}`;
    editorAPI.dispatchTextChange(cursor, cursor, insert);
    if (typeof editorAPI.setCursor === 'function') {
      editorAPI.setCursor(cursor + insert.length);
    }
  }

  function toggleSamplesPanel(forceState) {
    if (!samplesPanel || !samplesToggleBtn) return;
    const wasHidden = samplesPanel.hasAttribute('hidden');
    const willOpen = typeof forceState === 'boolean' ? forceState : wasHidden;
    if (willOpen) {
      samplesPanel.removeAttribute('hidden');
      samplesToggleBtn.setAttribute('aria-expanded', 'true');
      if (!samplesPanelRendered) {
        // Wait for the manifest to load on first open.
        if (window.SampleVoice && window.SampleVoice.ready) {
          window.SampleVoice.ready().then(() => renderSamplesPanel(samplesFilterInput?.value || ''));
        } else {
          renderSamplesPanel('');
        }
      }
      samplesFilterInput?.focus();
    } else {
      samplesPanel.setAttribute('hidden', '');
      samplesToggleBtn.setAttribute('aria-expanded', 'false');
    }
  }

  if (samplesToggleBtn) {
    samplesToggleBtn.addEventListener('click', () => toggleSamplesPanel());
  }
  if (samplesGroupsEl) {
    // Preserve editor caret when clicking sample pills.
    samplesGroupsEl.addEventListener('mousedown', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const pill = target.closest('.samples-pill');
      if (!pill) return;
      e.preventDefault();
    });

    // Event delegation: any click on a .samples-pill inserts its data-name.
    samplesGroupsEl.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const pill = target.closest('.samples-pill');
      if (!pill) return;
      e.preventDefault();
      e.stopPropagation();
      const name = pill.getAttribute('data-name');
      if (!name) return;
      insertAtCursor(name);
    });
  }
  if (samplesFilterInput) {
    let filterTimer = null;
    samplesFilterInput.addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => renderSamplesPanel(samplesFilterInput.value), 80);
    });
    samplesFilterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (samplesFilterInput.value) {
          samplesFilterInput.value = '';
          renderSamplesPanel('');
        } else {
          toggleSamplesPanel(false);
          if (editorAPI) editorAPI.focus();
        }
      }
    });
  }
  if (samplesLinkBtn) samplesLinkBtn.addEventListener('click', () => { linkLocalSamplesFolder(); });
  if (samplesRelinkBtn) samplesRelinkBtn.addEventListener('click', () => { linkLocalSamplesFolder(); });
  if (samplesUnlinkBtn) samplesUnlinkBtn.addEventListener('click', () => { unlinkLocalSamplesFolder(); });
  window.addEventListener('beforeunload', () => {
    revokeLocalSampleObjectUrls();
  });
  updateLocalSamplesControls();

    applyVideoDebugGate();
    bindInputPanel();
    bindVideoPanel();
    bindFieldReport();

  // ---------------- status ticker ----------------

  statusTimer = setInterval(setStatusLine, 250);
  setStatusLine();

  // ---------------- editor mount ----------------

  function mountEditor() {
    if (!editorMount) return;
    if (typeof window.createReplEditor !== 'function') {
      // Bundle missing — surface a quiet warning and leave the mount empty.
      // The page is still useful (controls/docs); the user just can't type.
      showWarning('editor failed to load (codemirror.bundle.js missing)');
      return;
    }

    editorAPI = window.createReplEditor({
      parent: editorMount,
      initialText: '',
      blockMuteLines: editorMuteLinesSnapshot(),
      onChange: () => {
        // Reserved for future autosave/diagnostics hooks. The CM linter
        // already runs on doc changes; we don't hard-evaluate here.
        const text = editorAPI ? editorAPI.getValue() : '';
        if (findExplicitPatchTitle(text)) loadedExampleLabel = '';
        refreshPatchTitle();
      },
      onCommand: {
        play: evaluateAndRun,
        safePlay,
        stop,
        share: shareCurrent,
        toggleIO: toggleInputPanel,
      },
      onToggleBlockMute: ({ lineNumber }) => {
        toggleBlockMuteFromEditor(lineNumber);
      },
      getSampleNames: () => (
        window.SampleVoice && window.SampleVoice.list ? window.SampleVoice.list() : []
      ),
      getSampleGroups: () => (
        window.SampleVoice && window.SampleVoice.groups ? window.SampleVoice.groups() : []
      ),
      getDrumKits: () => (
        window.SampleVoice && window.SampleVoice.kits ? window.SampleVoice.kits() : []
      ),
      getVideoGeneratedIds: () => (
        videoDebugEnabled() && window.VideoVoice && window.VideoVoice.getGeneratedIds ? window.VideoVoice.getGeneratedIds() : []
      ),
      enableVideoDebug: videoDebugEnabled(),
      parseForDiagnostics: (text) => (
        window.ReplDSL && window.ReplDSL.parse ? window.ReplDSL.parse(text) : { ok: true }
      ),
    });
  }

  // ---------------- bootstrap ----------------

    (async function init() {
      initReferencePanel();
      mountEditor();

    // Kick off sample manifest load in parallel; won't block first audio.
    if (window.SampleVoice) {
      window.SampleVoice.loadManifest(SAMPLES_MANIFEST_URL).catch(() => {});
    }
    initLocalSamplesFromSavedHandle();
    const loaded = await loadFromHash();
    if (!loaded) await loadDefaultExample();
    // Pre-render the transport panel from a parse of the loaded text so
    // the slot dots are visible before the user hits play.
    const initialText = editorAPI ? editorAPI.getValue() : '';
    const parsed = window.ReplDSL.parse(initialText);
      if (parsed.ok) {
        applyStoredBlockMuteOverrides(parsed.program);
        lastGoodProgram = parsed.program;
        if (window.ReplAttractors && window.ReplAttractors.warm) {
          window.ReplAttractors.warm(parsed.program);
        }
        renderTransportShell(parsed.program);
        syncEditorBlockMuteLines();
      }
        if (editorAPI && shouldAutofocusEditor) editorAPI.focus();
  })();
})();
