// /assets/prae.js
(() => {
  const out   = document.getElementById('out');
  const input = document.getElementById('cmd');
  const pane  = document.getElementById('console');

  if (!out || !input) return;

  // Build a map of repo "keys" (from data-key) -> {title,url}
  const cards = Array.from(document.querySelectorAll('#repo-list [data-key]'));
  const repos = new Map();
  cards.forEach((card) => {
    const key = String(card.getAttribute('data-key') || '').toLowerCase();
    const a   = card.querySelector('a[href]');
    if (key && a) repos.set(key, { title: a.textContent.trim(), url: a.href });
  });

  const aliases = { h:'help', ls:'repos', o:'open', cls:'clear' };
  const history = [];
  let   hi = 0;

  // ---- UI helpers ----
  const esc = (s) => String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
  function println(txt = '', cls = '') {
    const line = cls ? `<span class="${cls}">${esc(txt)}</span>` : esc(txt);
    out.insertAdjacentHTML('beforeend', line + '\n');
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
    if (navigator.clipboard) {
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

  // Click anywhere in the console to focus the input
  pane?.addEventListener('click', () => input.focus(), { passive: true });

  banner();
})();
