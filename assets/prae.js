// assets/prae.js — lightweight Praetorius adapter (SEO-safe)
(function () {
  const out = document.getElementById('out');
  const input = document.getElementById('cmd');
  const cards = [...document.querySelectorAll('#repo-list .card')];
  const map = Object.fromEntries(cards.map(card => {
    const key = card.dataset.key;
    const a = card.querySelector('a');
    return [key, { title: a.textContent.trim(), url: a.href }];
  }));

  // If the real Praetorius UMD exposes a global, you can hook it here safely
  // without breaking SEO. This is purely optional.
  // Example:
  // if (window.PraetoriusPortfolio && window.PraetoriusPortfolio.mountConsole) {
  //   window.PraetoriusPortfolio.mountConsole('#console');
  // }

  const help = () => [
    'commands:',
    '  help               show this help',
    '  repos              list repo shortcuts',
    '  open <key>         open link by key (e.g., open prae)',
    '  profile            open your GitHub profile',
    '  clear              clear console'
  ].join('\n');

  function log(s='') { out.textContent += s + '\n'; out.scrollTop = out.scrollHeight; }
  function exec(line) {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    if (!cmd) return;
    switch (cmd) {
      case 'help': log(help()); break;
      case 'repos':
        Object.entries(map).forEach(([k, v]) => log(`${k.padEnd(8)} ${v.title}  → ${v.url}`));
        break;
      case 'open': {
        const key = rest[0];
        if (!key || !map[key]) { log('usage: open <key>   (try: repos)'); break; }
        window.open(map[key].url, '_blank', 'noopener');
        log(`opening: ${map[key].url}`);
        break;
      }
      case 'profile': window.open(map.profile.url, '_blank', 'noopener'); log('opening: profile'); break;
      case 'clear': out.textContent = ''; break;
      default: log(`unknown: ${cmd}. try "help"`);
    }
  }

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      log('$ ' + input.value);
      exec(input.value);
      input.value = '';
    }
  });
})();