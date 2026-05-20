// Frozen-HTML renderer. Self-contained; no JS, no fetches.
// The snapshot is documentation, not the work.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

// state shape mirrors the live /api/body-for-visits/state response.
export function renderSnapshotHTML(state, takenAt = new Date().toISOString()) {
  const body = Array.isArray(state?.body) ? state.body : [];
  const fringe = String(state?.fringe || "");
  const version = Number(state?.body_version || 0);
  const folded = Number(state?.fold_count || 0);
  const corrupt = Number(state?.corruption_count || 0);

  const bodyHTML = body
    .map((t) =>
      t.role === "fold_marker"
        ? `<span class="fold-marker">${esc(t.token)}</span>`
        : esc(t.token)
    )
    .join(" ");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>corpus — snapshot</title>
<style>
:root { --bg:#fff; --ink:#111; --ink-soft:rgba(17,17,17,.55); --ink-faint:rgba(17,17,17,.28); }
html,body { margin:0; background:var(--bg); color:var(--ink); }
main { max-width:640px; margin:14vh auto 18vh; padding:0 24px;
       font:19px/1.62 ui-serif,"Iowan Old Style","Hoefler Text",Garamond,serif;
       text-align:left; text-wrap:pretty; }
.fold-marker { font-style:italic; color:var(--ink-soft); }
.status,.fringe { font:11px/1.4 ui-monospace,"SF Mono",Menlo,monospace;
                  letter-spacing:.18em; text-transform:uppercase; color:var(--ink-faint);
                  margin-top:64px; }
.fringe { letter-spacing:.4em; margin-top:8px; text-transform:none; }
</style>
</head><body><main>
<p class="status">static snapshot taken at ${esc(takenAt)} — not the live work</p>
<p class="body-text">${bodyHTML || "<span class=\"fold-marker\">⟨awaiting first visit⟩</span>"}</p>
<p class="fringe">${esc(fringe)}</p>
<p class="status">body version ${version} · ${folded} folded · ${corrupt} corruptions</p>
</main></body></html>
`;
}
