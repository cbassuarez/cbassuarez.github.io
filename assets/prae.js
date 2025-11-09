// /assets/prae.js
(() => {
  const out   = document.getElementById('out');
  const input = document.getElementById('wc-cmd');          // ⟵ match your HTML
  const pane  = document.getElementById('works-console');   // ⟵ match your HTML
  const form  = input?.closest('form');

  if (!out || !input) return;

  // Prevent the form from navigating on Enter
  form?.addEventListener('submit', (e) => e.preventDefault());

  // Build a map of repo keys by reading each .blk: <code>key</code> + first <a href>
  const repos = new Map();
  Array.from(document.querySelectorAll('#out .blk')).forEach((blk) => {
    const keyEl = blk.querySelector('code');
    const a     = blk.querySelector('a[href]');
    const key   = keyEl?.textContent?.trim().toLowerCase();
    if (key && a) repos.set(key, { title: a.textContent.trim(), url: a.href });
  });

  const aliases = { h:'help', ls:'repos', o:'open', cls:'clear' };
  const history = [];
  let   hi = 0;

  // ---- UI helpers ----
  const esc = (s) => String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
  function println(txt = '', cls = '') {
    const klass = cls ? `line ${cls}` : 'line';
    out.insertAdjacentHTML('beforeend', `<div class="${klass}">${esc(txt)}</div>`);
    out.scrollTop = out.scrollHeight;
  }
  function banner() {
    println('Prae ⌁ type "help" for commands.', 'muted');
  }
  function clear() {
    out.textContent = '';
  }

  // ---- Commands ----
  function help() {
    [
      'help                Show this help',
      'repos               List linked repositories',
      'open <key>          Open repo (keys: ' + [...repos.keys()].join(', ') + ')',
      'copy <key>          Copy repo URL',
      'clear               Clear console'
    ].forEach(l => println(l, 'muted'));
  }

  function listRepos() {
    if (!repos.size) return println('No repositories found on the page.', 'warn');
    repos.forEach((v, k) => println(`[${k}] ${v.title} — ${v.url}`));
  }

  function openRepo(key) {
    if (!key) return println('usage: open <key>', 'warn');
    const r = repos.get(String(key).toLowerCase());
    if (!r)   return println(`error: unknown key "${key}"`, 'err');
    window.location.href = r.url;
  }

  function copyRepo(key) {
    if (!key) return println('usage: copy <key>', 'warn');
    const r = repos.get(String(key).toLowerCase());
    if (!r)   return println(`error: unknown key "${key}"`, 'err');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(r.url).then(
        () => println('copied', 'ok'),
        ()  => println(r.url, 'muted')
      );
    } else {
      println(r.url, 'muted');
    }
  }

  function run(raw) {
    const parts = String(raw || '').trim().split(/\s+/);
    if (!parts[0]) return;
    let cmd = parts.shift().toLowerCase();
    cmd = aliases[cmd] || cmd;

    switch (cmd) {
      case 'help':  return help();
      case 'repos': return listRepos();
      case 'open':  return openRepo(parts[0]);
      case 'copy':  return copyRepo(parts[0]);
      case 'clear': clear(); return banner();
      default:      return println(`error: unknown command "${cmd}"`, 'err');
    }
  }

  // ---- Input wiring ----
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      if (v) {
        println(`$ ${v}`);
        history.push(v);
        hi = history.length;
        run(v);
      }
      input.value = '';
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (hi > 0) { hi--; input.value = history[hi] || ''; input.setSelectionRange(input.value.length, input.value.length); e.preventDefault(); }
    } else if (e.key === 'ArrowDown') {
      if (hi < history.length) { hi++; input.value = history[hi] || ''; input.setSelectionRange(input.value.length, input.value.length); e.preventDefault(); }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      clear(); banner(); e.preventDefault();
    }
  });

  // Focus the input when clicking the glass
  pane?.addEventListener('click', () => input.focus(), { passive: true });

  // Greet
  banner();
})();
