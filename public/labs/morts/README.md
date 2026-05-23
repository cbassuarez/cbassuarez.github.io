# microwear

A single-page client-side artwork that runs a sustained CPU + GPU load on
the visitor's machine for approximately two minutes and reports the result
in **morts** — a unit defined here as one-millionth of a device's rated
hardware life. The unit's name and structure are taken from the
**micromort** (Howard, 1979), a one-in-a-million probability of fatality
used in medical decision analysis and actuarial work; microwear applies
the same risk-accounting frame, by analogy, to device wear rather than
human mortality. The piece is named for the phenomenon; the mort is its
unit.

v5 reports two ledgers, both physical wear of the visitor's device under
two different failure mechanisms:

- **battery-mort** — one-millionth of the rated battery charge-cycle life
  (default 800 cycles, Li-ion). Captures the wear path measured by
  charge-discharge counting.
- **thermal-mort** — one-millionth of the device's estimated solder /
  thermal-cycle rated life (default 1,500 cycles, a conservative midpoint
  of typical SAC305 lead-free solder fatigue ranges reported under JEDEC
  JESD22-A104 and IPC-9701-class testing). Captures the wear path of
  solder fatigue under repeated ΔT swings.

Both figures are tuned estimates, not measurements; each derivation is
shown openly in the methodology modal (`MORT_COEFF_BATTERY`,
`MORT_COEFF_THERMAL`, the rated-life assumption, and the literal
arithmetic).

The v4→v5 jump exists for a single reason: pure SunSpider 1.0.2 on modern
silicon does not draw enough wattage to be physically felt. Modern JIT
compilers reduce its 2007-era kernels to near-native code that runs at
100 % CPU utilization while drawing only a small fraction of the package
power, and Apple Silicon in particular is engineered for exactly that
regime. v5 keeps SunSpider for continuity and adds:

- `microwear · fma-stress`, a sustained fp32 FMA-chain kernel with
  sixteen independent accumulator chains, structured for SLP
  auto-vectorization in JavaScriptCore and V8 so it packs into ASIMD on
  AArch64 and AVX on x86-64.
- A WebGPU compute pass (Chrome 113+, Safari 18+, Firefox 121+ behind a
  flag) running a 4096 × 4096 smoothed-Mandelbrot dispatch at a 1024-
  iteration cap with 256 × 256 workgroups of 16 × 16 threads. When
  WebGPU is unavailable, v5 falls back to the v4 WebGL fragment-shader
  path (2048 × 2048, 3 × 3 supersampling, 1024-iteration cap, chained
  without `requestAnimationFrame`).
- Runtime extended from sixty seconds to one hundred twenty. Modern
  silicon's package thermal mass takes longer to absorb load into a
  measurable ΔT than a sixty-second window allows.

The v5 layout is a no-scroll, full-viewport document with three screens
— *threshold* (definition and actions), *run* (live figure and stop),
*report* (final figure and details) — and a methodology modal opened
from either threshold or report via `[ learn more ]` / `[ details ]`.
The silent pause used by v2 and v3 between run and report has been
replaced with a short status log that streams real `performance.now()`
timestamps as workers terminate and the GPU context is released.

The SunSpider 1.0.2 kernels (Apple / WebKit, BSD-3-Clause) — `math-
cordic.js`, `crypto-md5.js`, `math-spectral-norm.js` — are embedded
verbatim with their original license headers preserved. They run round-
robin with the FMA-stress kernel across `max(2, hardwareConcurrency − 1)`
Web Worker threads, reserving one core for the page and the
[ stop benchmark ] action. Each worker holds a synchronous 250 ms loop
between yields so the OS scheduler cannot migrate it onto an efficiency
core mid-batch.

Two known deferrals carried into v6:

- **Kraken 1.1** (Mozilla, Apache-2.0) — heavier than SunSpider but its
  kernels depend on the `sjcl` library loaded by the Kraken harness, and
  embedding the harness verbatim is a meaningful expansion of the
  single-file artifact.
- **Hand-crafted WebAssembly SIMD kernel** — the FMA-stress kernel
  relies on the engine's auto-vectorizer to pack independent scalar
  chains into v128 instructions, which gets to roughly 60–80 % of the
  wattage a deliberately SIMD-shaped WASM module would draw. The
  remaining headroom is worth a v6 pass.

Pure HTML/CSS/JS in one file. No build step, no backend, no dependencies,
no network requests during the run, no storage. To deploy on GitHub Pages,
commit this folder under the Pages-served path (e.g. `/labs/morts/`) and
visit the URL. The work also runs over `file://` if `index.html` is opened
directly.
