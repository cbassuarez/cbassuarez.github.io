// REPL audio routing: local files in dev, R2 (immutable-cached) in production.
//
// All voice loaders read window.replAudioUrl(...) to compute their fetch URLs
// instead of hardcoding './public/instruments/...'. In local dev we resolve
// against the page (./public/instruments/...), in production we resolve
// against the R2 public bucket and the cache headers make every audio file
// browser-cacheable for a year.
//
// The bucket URL is the only externally-visible secret here, and r2.dev URLs
// are public by design. To swap to a custom domain (audio.cbassuarez.com)
// later, change R2_BASE below and ship one HTML re-deploy — no voice code
// changes are required.

(function () {
  'use strict';

  var R2_BASE = 'https://pub-7802f263808041f9a0310452f02f7c77.r2.dev';

  var host = (typeof location !== 'undefined' && location.hostname) || '';
  var isLocal =
    host === '' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.endsWith('.local');

  // Empty base means: resolve relative to the REPL page, as today.
  // Non-empty base means: prepend R2 origin + a layout prefix.
  var base = isLocal ? '' : R2_BASE;
  window.REPL_AUDIO_BASE = base;

  // Layout convention on R2 (mirrors the upload plan in scripts/r2-upload-audio.py):
  //
  //   cbassuarez-audio/repl/instruments/<inst>/manifest.full.json
  //   cbassuarez-audio/repl/instruments/<inst>/audio/...
  //   cbassuarez-audio/repl/samples/manifest.json
  //   cbassuarez-audio/public-audio/<group>/<file>.{mp3,wav,…}
  //
  // kind values:
  //   'instrument-manifest' → repl/instruments/<inst>/manifest.full.json
  //   'samples-manifest'    → repl/samples/manifest.json
  //   'public-audio'        → public-audio/<rest>  (used by sample.js for /audio/... entries)
  window.replAudioUrl = function (kind, arg) {
    if (!base) {
      // Dev: return the local path that matches the on-disk layout.
      switch (kind) {
        case 'instrument-manifest':
          return './public/instruments/' + arg + '/manifest.full.json';
        case 'samples-manifest':
          return './samples/manifest.json';
        case 'public-audio':
          // arg is the absolute on-site path, e.g. '/audio/main_b3/main_b3_01.mp3'
          return arg;
      }
      return arg;
    }
    switch (kind) {
      case 'instrument-manifest':
        return base + '/repl/instruments/' + arg + '/manifest.full.json';
      case 'samples-manifest':
        return base + '/repl/samples/manifest.json';
      case 'public-audio':
        if (typeof arg !== 'string') return arg;
        if (arg.indexOf('/audio/') === 0) {
          return base + '/public-audio/' + arg.slice('/audio/'.length);
        }
        return arg;
    }
    return arg;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // REPL loader rail: each <li.repl-loader-bar[data-loader-id]> is bound to a
  // real promise. Bars start "pending" (white), go "is-loading" when the
  // backing promise is in flight, "is-loaded" on resolve, "is-failed" on
  // reject. When every bar is in a terminal state, fire a CustomEvent that
  // repl.js listens for so the skeleton can clear.
  //
  // This is the seam the user named: "tie the prefetch to the skeleton".
  // Each bar references a real load state, not a decorative shimmer.
  // ─────────────────────────────────────────────────────────────────────────
  var tasks = new Map();
  var allDoneResolve;
  var allDone = new Promise(function (r) { allDoneResolve = r; });
  var settled = false;

  function indexRail() {
    var rail = document.getElementById('repl-loader-rail');
    if (!rail) return;
    var bars = rail.querySelectorAll('.repl-loader-bar[data-loader-id]');
    for (var i = 0; i < bars.length; i++) {
      var el = bars[i];
      var id = el.getAttribute('data-loader-id');
      if (id && !tasks.has(id)) {
        tasks.set(id, { el: el, state: 'pending' });
      }
    }
  }

  function setState(id, next) {
    var t = tasks.get(id);
    if (!t) return;
    t.el.classList.remove('is-loading', 'is-loaded', 'is-failed');
    if (next === 'loading') t.el.classList.add('is-loading');
    if (next === 'loaded')  t.el.classList.add('is-loaded');
    if (next === 'failed')  t.el.classList.add('is-failed');
    t.state = next;
    maybeFinish();
  }

  function maybeFinish() {
    if (settled) return;
    var pending = false;
    tasks.forEach(function (t) {
      if (t.state === 'pending' || t.state === 'loading') pending = true;
    });
    if (pending) return;
    settled = true;
    allDoneResolve();
    try {
      document.dispatchEvent(new CustomEvent('repl:loader-complete', {
        detail: { tasks: Array.from(tasks.entries()).map(function (e) {
          return { id: e[0], state: e[1].state };
        }) }
      }));
    } catch (_) {}
  }

  function mark(id, ok) {
    setState(id, ok === false ? 'failed' : 'loaded');
  }

  function track(id, promise) {
    if (!tasks.has(id)) return promise;
    setState(id, 'loading');
    return Promise.resolve(promise).then(function (v) {
      mark(id, true);
      return v;
    }, function (err) {
      mark(id, false);
      throw err;
    });
  }

  // Public surface used by repl.js, voice files, and the boot orchestrator.
  window.replLoader = {
    track: track,
    mark: mark,
    allComplete: function () { return allDone; },
    // For voices that load lazily — they can ask "should I auto-fire?".
    shouldEagerLoad: function () { return true; }
  };

  // Boot orchestrator: at DOMContentLoaded, walk the rail and invoke each
  // voice's loadManifest() so the bars reflect real work. Voices that haven't
  // registered yet (script not yet executed) are marked failed gracefully.
  function bootOrchestrator() {
    indexRail();

    function trackVoice(id, getVoice) {
      var v = getVoice();
      if (!v || typeof v.loadManifest !== 'function') {
        // No voice registered → mark failed so the bar reflects that and the
        // overall completion can still fire.
        mark(id, false);
        return;
      }
      try {
        track(id, v.loadManifest());
      } catch (err) {
        mark(id, false);
      }
    }

    trackVoice('piano-manifest',      function () { return window.PianoVoice; });
    trackVoice('marimba-manifest',    function () { return window.MarimbaVoice; });
    trackVoice('vibraphone-manifest', function () { return window.VibraphoneVoice; });
    trackVoice('cello-manifest',      function () { return window.CelloVoice; });
    trackVoice('violin-manifest',     function () { return window.ViolinVoice; });
    trackVoice('voice-manifest',      function () { return window.VoiceVoice; });

    // SampleVoice manifest needs a URL; if available, fire it. Otherwise
    // repl.js will mark it once it loads with its preferred URL.
    var sampleVoice = window.SampleVoice;
    if (sampleVoice && typeof sampleVoice.loadManifest === 'function') {
      var samplesUrl = window.replAudioUrl('samples-manifest');
      try {
        track('samples-manifest', sampleVoice.loadManifest(samplesUrl));
      } catch (_) {
        mark('samples-manifest', false);
      }
    }

    // 'parser' is marked by repl.js when its boot sequence reaches the parser
    // phase. We don't pre-mark it here; the bar stays pending until then.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOrchestrator);
  } else {
    bootOrchestrator();
  }
})();
