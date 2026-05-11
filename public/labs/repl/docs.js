(() => {
  const DOCS = [
    {
      id: 'start-here',
      title: 'start here',
      summary: 'What the instrument is, how to evaluate, and how a patch is built.',
      blocks: [
        { type: 'p', text: 'seb’s repl is a live-coding environment for score-grid notation. A patch is made from voice blocks. Each block names a body — string, sine, osc, pluck, drone, noise, pulse, drum, sample, piano, violin, input, video — and the rows underneath shape how that body behaves.' },
        { type: 'callout', text: 'A patch is a score. A block is a body. A row changes how that body behaves. Attractors let outside systems — weather, archives, microphones, browser tabs — lean on the score without replacing it.' },
        { type: 'code', code: 'tempo 92\nmeter 4/4\neval reset\ntuning kirnberger-3\n\nstring A4 ~ C5\ngain 0.6\nspace 0.2' },
        { type: 'table', headers: ['gesture', 'meaning'], rows: [
          ['Cmd-Enter', 'evaluate the current score and rebuild runtime state'],
          ['Cmd-Shift-Enter', 'replay without unlocking frozen random choices'],
          ['Esc', 'stop all active voices'],
          ['Cmd/Ctrl-I', 'toggle the I/O panel'],
          ['Shift (tap on param/effect rows)', 'open legal-value completion for that row'],
          ['Tab', 'indent, or accept an open completion'],
          ['ArrowUp / ArrowDown / PageUp / PageDown', 'when completion is open, navigate the suggestion menu'],
          ['Enter', 'new line; completion accepts with Tab, not Return']
        ]},
        { type: 'p', text: 'Autocomplete suggestions may include multi-token examples as guidance, but Tab commits the active completion; Enter keeps writing the score.' },
        { type: 'p', text: 'Evaluate is the execution gate. Replay is the re-arm control. Stop is the red interrupt. I/O opens the live-source and output-routing panel. Add eval reset as a top directive line to queue evaluate at the next bar reset while transport is running. Use eval reset cut to force a hard boundary, or eval reset keep to preserve tails (default).' }
      ]
    },
    {
      id: 'language',
      title: 'the language',
      summary: 'Top directives, voice headers, comments, patterns, and modulation values.',
      blocks: [
        { type: 'p', text: 'The language is line-based. Top directives describe score-level behavior. Voice headers begin blocks. Rows underneath a voice shape that block until the next voice header appears. A tuning directive applies forward from where it appears.' },
        { type: 'code', code: 'tempo 84\nmeter 4/4\npickup 1\neval reset\ntuning kirnberger-3 432\n\nstring ? B4 | *!4 (*4 A*) ~ C*! | * * * ?\ngain 0.55\npan *~\nbody glass\nspace 0.25' },
        { type: 'table', headers: ['part', 'role'], rows: [
          ['tempo / meter', 'score timing directives'],
          ['pickup / anacrusis', 'first-class sounding pickup duration; use ? bookends for omitted pickup space'],
          ['inegales', 'historical/style long-short performance timing for eligible equal subdivisions'],
          ['swing', 'explicit groove timing warp for eligible equal subdivisions, e.g. swing .5 or swing .35 1/16'],
          ['key / chord', 'symbolic harmony source track: literal chords, roman numerals, globs, modulations, and active chord-tone rendering'],
          ['voicing / lead / chord-open / harmonic-risk', 'vertical realization, voice-leading behavior, registral spread, and wildcard permission'],
          ['ornament / ornament-style', 'cell-level baroque decoration that performs inside the written grid'],
          ['ornament-speed / ornament-human', '0..1 ornament timing speed; accepts param operators like *, *!, *~, plus bounded ornament-only human variation'],
          ['ripple / arp', 'chord performance surfaces for multi-stops like C3+G3+E4+B4; roll remains a legacy alias'],
          ['tuning', 'forward-scoped pitch system directive (applies to following blocks)'],
          ['string / sine / osc / pluck / drone / noise / pulse / drum / sample / piano / violin / cello / marimba / vibraphone / voice / input / video', 'voice headers that start blocks'],
          ['gain / pan / space', 'surface rows that shape a voice'],
          ['// comment', 'score annotation; ignored by the parser'],
          ['mic.intensity 0.1 0.75', 'live modulation source mapped into a range']
        ]},
        { type: 'callout', text: 'A block can be read vertically: first what speaks, then how it moves, where it sits, what it listens to, and what it remembers.' },
        { type: 'callout', text: 'pickup 1 and anacrusis 1 are aliases. The pickup is not padding: it is meter phase. Use ? as an anacrusis bookend: it marks omitted pickup space at the beginning or end of a phrase, never a sounding rest.' },
        { type: 'code', code: '// 3/8 pickup beginning on the and of beat 3\nmeter 4/4\npickup 3/8\n\npiano ? (. G4) (A4 B4) | C5 B4 A4 G4 | * * (*)?' },
        { type: 'h', text: 'baroque performance surfaces' },
        { type: 'p', text: 'ornament decorates a written cell without adding written cells. ornament-speed is a single 0..1 control for how fast and tight the ornament breathes inside the written cell, and it can also use param operators like *, *!, *~, _, ~, and *&8. inegales bends equal subdivisions as a style surface; swing bends eligible equal subdivisions as an explicit groove surface. ripple is one onset spread across a multi-stop; arp cycles a multi-stop through the cell.' },
        { type: 'code', code: '// baroque surface study\ntempo 72\nmeter 4/4\ntuning kirnberger-3\ninegales light\nswing off\n\npiano ? G4 | C3+G3+E4+B4 D5 E5 F5 | C3+G3+E4+B4 F5 E5 ?\nornament . . | . tr + ~ | . - app .\nornament-speed . * | . .75 *! .42 | . *~ .30 .\nornament-style bach\nornament-human .25\nripple  . . | u .  . . | d . . .\narp      . . | . .  . . | . . . .\narprate 1/8\nripple-time .045\nforce mp\ndecay 3\npan center\ntone bright\nbody wood\nspace .24\ngain .38' },
        { type: 'callout', text: 'ornament-speed accepts ., 0..1, or param operators like *, *!, *~, _, ~, and *&N. A dot uses the ornament-style default; 0 is slow/broad, 1 is fast/tight. Legacy ornament-open rows are still accepted for old patches. ornament-human overrides the ornament-only amount; if absent, human still contributes a smaller bounded variation.' },
        { type: 'callout', text: 'swing is explicit groove timing. Use swing .5 for a classic 2:1 feel, swing light/medium/heavy for named profiles, or swing .35 1/16 for sixteenth-note swing. If swing and inegales are both active, swing wins for matching subdivisions.' },
        { type: 'h', text: 'harmony source track' },
        { type: 'p', text: 'key and chord create a symbolic harmony layer. Voice rows can render the active harmony with chord, root, third, 3, 5, 7, 9, bass, top, guide, shell, color, or arp. Literal multi-stops still use +, e.g. C3+G3+E4+B4.' },
        { type: 'code', code: '// harmonic source study\ntempo 84\nmeter 4/4\nkey C major\nswing light\n\nchord         Imaj9   T*!     PD*     D*~       @mod:Eb-major   ii9      V13b9    Imaj9\nvoicing       close   open    drop2   rootless  .               rootless rootless close\nlead          smooth  smooth  smooth  resolve   pivot           smooth   tense    settle\nchord-open    .20     .45     .55     .70       .               .50      .78      .25\nharmonic-risk .10     .25     .40     .75       .               .35      .85      .20\n\npiano chord chord chord chord | chord chord chord chord\nripple .     .     .     u     | .     .     d     .\narp    .     .     ud    .     | .     ud    .     .\nforce mp\ndecay 3\npan center\ntone bright\nbody wood\nspace .24\ngain .38' },
        { type: 'callout', text: 'In voice rows, ? is reserved for anacrusis bookends. Harmony rows use H*/T*/PD*/D*/M*/X* for smart wildcard/glob choices; ?T/?PD/?D are intentionally invalid.' }
      ]
    },
    {
      id: 'voices',
      title: 'voices',
      summary: 'The core body types: string, sine/osc, pluck, drone, noise, pulse, drum, sample, piano, violin, input, and video.',
      blocks: [
        { type: 'h', text: 'string' },
        { type: 'p', text: 'A string voice is a synthetic, resonant, pitched body. It is good for plucked tones, phrase patterns, tuned gestures, and bodies that respond to weather or live input.' },
        { type: 'code', code: 'string *!4 (*4 A*) ~ C*!\ngain 0.55\ndecay 4\nbody glass\nspace 0.24' },
        { type: 'h', text: 'sine / osc' },
        { type: 'p', text: 'Sine and osc are clear pitched oscillator bodies. They use the same note and wildcard syntax as string, but speak with a simpler tone, so gain, pan, speed, tone, harm, space, and attractor motion are easy to hear.' },
        { type: 'code', code: 'sine A3 C4 . ~\ngain 0.42\ntone bright\nspace 0.18' },
        { type: 'h', text: 'pluck' },
        { type: 'p', text: 'Pluck is a short pitched synth body: clearer and more percussive than string, useful for lines, clocks with pitch, and first-order event bodies.' },
        { type: 'code', code: 'pluck *4 (*4 A*) . ~\ngain 0.44\ndecay 0.55\ntone bright' },
        { type: 'h', text: 'drone' },
        { type: 'p', text: 'Drone keeps a persistent per-block oscillator body. Committed pitch leaves retune and re-envelope that body instead of spawning only one-shots, so slow modulation and attractor pressure become audible as memory.' },
        { type: 'code', code: 'drone A2 ~ C3 ~\ngain 0.28\ndecay 4.5\nspace 0.35\nchorus drift' },
        { type: 'h', text: 'noise' },
        { type: 'p', text: 'A noise voice is burst, breath, grit, and texture. Use * for a committed burst and ~ for a held texture. It responds well to rupture, density, pressure, trigger, tone, crush, scar, and grain.' },
        { type: 'code', code: 'noise * . * ~\ngain 0.38\ndecay 0.18\ntone bright\ntrigger mic.rupture 0.52' },
        { type: 'h', text: 'pulse' },
        { type: 'p', text: 'Pulse is a compact metronome tick/tock voice. It is low-cost, tuned for clear clocking, and its character responds strongly to force, tone, decay, and gain modulation.' },
        { type: 'code', code: 'pulse * . * .\ngain 0.36\nforce (mf f)\ndecay (0.4 1.2)\ntone (dark bright)' },
        { type: 'h', text: 'drum' },
        { type: 'p', text: 'Drum is a kit-routed one-shot voice with deterministic lane tokens. Use k/s/h/o/t/r/c for kick, snare, hat, open hat/other, tom, ride, and crash lanes, or * for any-lane random from a one-shot kit pool. Set the kit with a per-block kit row and control lane-local sample diversity with variance. Inside a drum block, pick <sample-id> pins the lane hit to one exact kit sample. At top level, sample still starts the archival/sample voice. BK/breakcore material is phrase/chop material, so use sample rows for BK instead of pretending it is a kick/snare/hat kit.' },
        { type: 'code', code: 'drum k h s h | k o s c\nkit 808\nvariance 0.35\ngain 0.86\nspace 0.22\n\ndrum k! . . .\nkit 808\npick wa808-k-0001\nvariance 0\n\nsample bk-01 . bk-04 .\nrate 1 1 0.5 1\ngain 0.78' },
        { type: 'h', text: 'sample' },
        { type: 'p', text: 'A sample voice is archival memory: playback, grain, scar, rate, start position, and triggered fragments from the sample bank.' },
        { type: 'code', code: 'sample snm-*&24 ~ tub-*&32 ~\ngain 0.48\ngrain 0.34\nscar memory\nbody paper' },
        { type: 'h', text: 'piano' },
        { type: 'p', text: 'Piano is a first-class sampled pitched instrument backed by the Iowa Steinway B recordings. It maps force to pp/mf/ff layers with optional crossfade or random selection, applies playback-rate pitch correction, and exposes pedal, una corda, lid, sympathetic body, release, human, stretch, and poly limit as per-block surfaces.' },
        { type: 'code', code: 'piano C3 E3 G3 B3 | C4 G3 E3 C3\nforce mf\npedal 0.45\nsympathetic 0.3\nlid 0.7\nrelease 0.35\nhuman 0.08\nlayer xfade' },
        { type: 'h', text: 'violin' },
        { type: 'p', text: 'Violin is a first-class sampled string instrument backed by the Iowa MIS Violin recordings. The voice handles two articulations (arco, pizz) across four strings (sul G, D, A, E). Strings are auto-picked per pitch (highest playable; sibling-aware for double stops) or forced via the sul row. Force pp/mf/ff is synthesized from the single ff sample layer via filter and gain shaping. Sustained arco notes loop through a detected steady-state window so they hold indefinitely. Surfaces: articulation, sul, force, vibrato (+ vibratoRate, vibratoOnset), tremolo (+ tremoloRate), bow position, wood (body resonance), sympathetic, release, human, glide, poly.' },
        { type: 'code', code: 'violin G4 ~ A4 ~ B4 ~ C5 ~\nforce mf\nvibrato 0.5\nbow 0.45\nwood 0.35\nsympathetic 0.25\nrelease 0.4' },
        { type: 'code', code: 'violin G3 D4 A4 E5\narticulation pizz\nforce f\ndecay 1.4' },
        { type: 'h', text: 'input' },
        { type: 'p', text: 'An input voice is a live source, a sensor, and an attractor field. It can be heard, analyzed, or both.' },
        { type: 'code', code: 'input mic\ngain 0\nmonitor off\nlisten on' },
        { type: 'callout', text: 'monitor controls whether you hear the input. listen controls whether the system analyzes it.' }
      ,
        { type: 'h', text: 'video / video gen' },
        { type: 'p', text: 'Video blocks are hybrid: they run continuously as stage layers and may also commit leaf events with * . ~. Sources are camera, screen, or file. Video gen materializes local generated clips asynchronously and can be triggered from live features.' },
        { type: 'code', code: 'video camera * . ~ *\nlisten on\nopacity 0.9\nedges camera.motion 0.1 0.8\nthreshold mic.intensity 0.2 0.7\ntrail camera.stillness 0.1 0.85\nblend difference\n\nvideo gen * ~ . *\nsource camera\nstyle surveillance\nseed blackbox\nduration 6s\ncache live\ntrigger camera.stillness 0.8' },
      ]
    },
    {
      id: 'rows-surfaces',
      title: 'rows and surfaces',
      summary: 'Rows grouped by musical behavior rather than alphabetically.',
      blocks: [
        { type: 'p', text: 'Rows are surfaces. Some set a fixed value. Others accept patterns or live modulation sources.' },
        { type: 'table', headers: ['family', 'rows'], rows: [
          ['level and placement', 'gain, pan'],
          ['time and articulation', 'speed, glide, time, beat, leaf, decay, fade'],
          ['tone and body', 'tone, body, filter, color, pitch'],
          ['pressure and dynamics', 'force, compress, crush, resolution'],
          ['memory and sample behavior', 'sample, kit, variance, rate, start, grain, scar, choose, trigger, video gen cache'],
          ['video stage behavior', 'opacity, threshold, edges, posterize, invert, contrast, saturate, displace, feedback, delay, slitscan, trail, mask, key, color, blend'],
          ['space', 'space, blur, comb, chorus, resonance, excite'],
          ['routing and coupling', 'attractor, monitor, listen']
        ]},
        { type: 'h', text: 'fixed and live values' },
        { type: 'code', code: 'gain 0.5\ngain mic.intensity 0.1 0.75\nspace mic.silence 0.15 0.85\ngrain mic.noisiness 0.05 0.55' },
        { type: 'p', text: 'A single number sets a fixed value. A live source maps an attractor feature into a range.' },
        { type: 'h', text: 'effect surfaces' },
        { type: 'p', text: 'Effect rows are not plugin inserts; they are regulatory surfaces on the block. compress stabilizes, space remembers, resonance and comb form a body, chorus thickens motion, excite adds edge, blur softens contour, and grain/scar add residue and memory pressure. crush is literal bit depth; resolution is a separate filter/EQ aperture for perceived detail.' },
        { type: 'p', text: 'These rows accept the same control-stream operators as params: *, ~, _, *!, *&N, *~, and parentheses.' },
        { type: 'code', code: 'string A3 C4 E4 G4\ndecay    4\nbody     metal\nspace    0.28\ncompress 0.25\nchorus   0.14' },
        { type: 'code', code: 'string *!4 (*4 A*) ~ C*!\nattractor weather.dew\nbody     0.5\nspace    *&24\nblur     0.28\ncomb     *~\ncompress 0.3\npan      *~' },
        { type: 'code', code: 'sample snm-*&32; ~ tub-*&48; ~\nattractor archive\ngrain    0.35\nscar     0.25\nspace    memory\nbody     0.4\ncomb     *~\nrate     *~\npan      *~' }
      ]
    },
    {
      id: 'patterns',
      title: 'patterns',
      summary: 'Lists, leaves, wildcards, tuplets, and branching score structures.',
      blocks: [
        { type: 'p', text: 'Patterns are not only lists. They are small branching score structures. Operators can repeat, interrupt, randomize, freeze, or select leaves.' },
        { type: 'table', headers: ['operator', 'meaning'], rows: [
          ['~', 'sustain, continue, or hold depending on row context'],
          ['*', 'random choice or wildcard'],
          ['!', 'freeze a random choice'],
          ['( )', 'subdivide a slot or group leaves'],
          ['< > << >>', 'pitched span starts (local/shared, up/down)'],
          ['G% Bb% C#%', 'pitched span end (pitch-class, same octave)'],
          ['&N', 'drift or gradient over N seconds'],
          [';', 'selector separator / temporal punctuation in some sample forms'],
          ['1/2, pi/4', 'fractions and symbolic proportions where supported']
        ]},
        { type: 'code', code: 'string A4 ~ C5 ~ E5\nstring >6* * * G%\nstring *!4 (*4 A*) ~ C*!\nstring >>6* * * C%\nglide 0.12\nsample snm-*&24 ~ tub-*&32 ~\nrate (*&16 ~)\npan (*~ - right) (*~ - left)' },
        { type: 'callout', text: 'When in doubt, read a pattern as a route map: some marks are destinations, some are repeats, some are switches, and some are frozen decisions.' }
      ]
    },
    {
      id: 'coupling-weather',
      title: 'coupling and weather',
      summary: 'Attractors, weather, archives, and live fields.',
      blocks: [
        { type: 'p', text: 'An attractor lets a block lean toward another source of behavior. It can push choices, surfaces, timing, density, pressure, and memory without replacing the block’s own syntax.' },
        { type: 'p', text: 'Attractors also color literal material. A block with attractor weather.dew is routed through a light coupling bus — filter, saturation, and delay/wet coloration — and its resolved event parameters are gently modulated after parsing. Literal values remain anchors: decay 4 is still a four-second decision, but the attractor may lengthen, soften, haze, or spatially drift it according to the current normalized signal state.' },
        { type: 'table', headers: ['source', 'use'], rows: [
          ['weather', 'external environmental coupling'],
          ['archive', 'memory/sample bias'],
          ['mic', 'microphone analysis field'],
          ['interface', 'audio interface analysis field'],
          ['tab', 'browser tab audio analysis field'],
          ['input', 'nearest live input aggregate']
        ]},
        { type: 'table', headers: ['feature', 'rough meaning'], rows: [
          ['intensity', 'loudness / energy'],
          ['volatility / flux', 'change or instability'],
          ['density', 'activity / onset rate'],
          ['periodicity', 'tonal or rhythmic steadiness'],
          ['rupture', 'transients / attacks'],
          ['silence', 'absence / staleness / open space'],
          ['brightness', 'spectral highness'],
          ['noisiness', 'flatness / noise profile'],
          ['confidence', 'signal-present confidence']
        ]},
        { type: 'code', code: 'string A4 ~ C5\nattractor weather.dew\npan *~\nspace 0.25\n\ninput mic\ngain 0\nlisten on\n\nsample snm-*&24\nattractor mic\ngrain mic.noisiness 0.05 0.55\ntrigger mic.rupture 0.52' }
      ]
    },
    {
      id: 'live-input',
      title: 'live input',
      summary: 'Mic, interface, tab audio, monitoring, listening, and feedback safety.',
      blocks: [
        { type: 'p', text: 'Input is not just audio entering the mix. It is live material, live sensor, and live attractor.' },
        { type: 'callout', text: 'Input does not have to be heard to matter.' },
        { type: 'h', text: 'silent attractor' },
        { type: 'code', code: 'input mic\ngain 0\nmonitor off\nlisten on\n\nstring A4 ~ C5\nattractor mic\ngain mic.intensity 0.1 0.6\nspace mic.silence 0.2 0.9' },
        { type: 'h', text: 'audible input' },
        { type: 'code', code: 'input mic\ngain 0.35\nmonitor on\nlisten on\ncompress mic.intensity 0.1 0.45\nspace mic.silence 0.08 0.45' },
        { type: 'table', headers: ['form', 'meaning'], rows: [
          ['input mic', 'browser microphone input'],
          ['input interface', 'audio interface / mixer / external source input'],
          ['input tab', 'browser tab audio via screen/tab sharing'],
          ['monitor off', 'do not route input to speakers'],
          ['listen on', 'analyze the input and publish attractor features']
        ]},
        { type: 'p', text: 'Use headphones when monitoring a microphone. Tab audio requires the browser share picker and must be started from a user gesture.' }
      ]
    },
    {
      id: 'examples',
      title: 'examples',
      summary: 'What each included example demonstrates and what to try changing.',
      blocks: [
        { type: 'table', headers: ['example', 'what it teaches'], rows: [
          ['0a. welcome', 'first sound + the eval/stop loop + comments vs code'],
          ['0b. a row of notes', 'patterns: notes separated by spaces, looping'],
          ['0c. rests and ties', 'silence (.) and held notes (~)'],
          ['0d. two voices', 'layering: each voice on its own line, all play together'],
          ['0e. tempo and meter', 'top-of-patch settings that frame timing'],
          ['01. literal vs coupled', 'fixed values against weather/coupled behavior'],
          ['01b. arrangement', 'enter/exit windows: schedule when blocks start and stop'],
          ['02. pitch organism', 'string patterns as living pitch bodies'],
          ['02b. sine + noise voices', 'first-order oscillator and texture bodies'],
          ['02c. drone + pluck + pulse', 'persistent tone, clear plucks, and scheduler clicks'],
          ['02d. drum kits', 'lane-mapped one-shot kits and wildcard pool hits'],
          ['02d2. breakcore beat', 'legacy breakcore mapping; BK now reads best as chopped phrase material'],
          ['44f. 808 pocket machine', '808 one-shot lanes, variance, gain, and space'],
          ['44g. 808 surface drift', 'drum surfaces moving across cells: variance, pan, rate, crush'],
          ['44h. kit switch arrangement', '808 and rock one-shot kits entering and exiting in overlap'],
          ['44i. polyrhythm switchyard', 'different drum cycle lengths phasing against each other'],
          ['44j. BK phrases over 808', 'BK phrase/chop samples layered above one-shot 808 drums'],
          ['02e. video arm v1', 'camera/screen/file analysis + stage synthesis + local gen clips'],
          ['03. sample field', 'sample-bank playback and field behavior'],
          ['04. speed warp', 'time surfaces and local movement'],
          ['05. weather dew', 'weather as a coupling source'],
          ['06. quake rupture', 'rupture / pressure / force language'],
          ['07. tide breath', 'slow environmental motion'],
          ['08. solar flare', 'high-energy external coupling'],
          ['09. archive memory', 'archive/sample memory behavior'],
          ['10. notation reference', 'dense syntax reference as a patch'],
          ['11. effect surfaces', 'space, compression, blur, comb, chorus, resonance'],
          ['12. weather body', 'body/tone shaped by weather'],
          ['13. archive scar', 'sample scars and memory pressure'],
          ['14. fades', 'block presence over time'],
          ['15. live input primer', 'mic/input fundamentals'],
          ['16. live input modulation', 'input driving time, gain, samples, effects'],
          ['17. live input as silent attractor', 'THE TUB-style silent sensing'],
          ['18. live input as audible material', 'input routed as a voice'],
          ['19. tab input sample weather', 'browser tab audio as weather'],
          ['20. interface input cybernetic score', 'performer-facing interface input'],
          ['21. video 01 camera basics', 'continuous camera stage with core surfaces'],
          ['22. video 02 camera pattern overlay', 'committed visual leaves over continuous video'],
          ['23. video 03 video as input signals', 'camera analysis drives audio rows'],
          ['24. video 04 camera drives audio', 'camera rupture and motion trigger sample behavior'],
          ['25. video 05 audio drives video', 'mic analysis drives video synthesis surfaces'],
          ['26. video 06 bidirectional loop', 'camera→audio and mic→video in one patch'],
          ['27. video 07 screen capture body', 'screen capture as stage material'],
          ['28. video 08 file material', 'file-backed video body with rhythmic overlay'],
          ['29. video 09 multilayer composite', 'camera+screen layered blend strategy'],
          ['30. video 10 video gen basics', 'local generative jobs create vgen-* clips'],
          ['31. video 11 gen to stage reuse', 'feed generated clips back into stage playback'],
          ['32. video 12 performance scene', 'full hybrid performance stack with video+audio coupling'],
          ['33. tuning scopes + reference', 'forward-scoped tuning regions and A4 anchor override'],
          ['34. tuning performance organism', 'real-world tuned harmony with constrained randomization, attractors, and integrated surfaces'],
          ['35. pitch ramps', 'shared descending ramps with >> leader anchoring (lower starts join but do not replace leader)']
        ]},
        { type: 'p', text: 'The fastest way to learn the instrument is to load an example, evaluate it, change one row, evaluate again, then add one attractor.' }
      ]
    },
    {
      id: 'performance',
      title: 'performance workflow',
      summary: 'How to build and modify patches live.',
      blocks: [
        { type: 'ol', items: [
          'choose an example',
          'evaluate',
          'change one row',
          'evaluate again',
          'add an attractor',
          'replay when structure changes significantly',
          'stop when routing or input gets unstable'
        ]},
        { type: 'p', text: 'Use comments as score notes. They are not second-class: in a live patch, comments can be performer instructions, warnings, or future gestures.' },
        { type: 'code', code: '// TRY: clap for rupture; hum for periodicity\ninput mic\ngain 0\nlisten on\n\nsample snm-*&24\nattractor mic\ntrigger mic.rupture 0.52' },
        { type: 'callout', text: 'Evaluate changes the score. Replay restarts the present world without unlocking frozen random choices.' }
      ]
    },
    {
      id: 'troubleshooting',
      title: 'troubleshooting',
      summary: 'Common symptoms, likely causes, and fixes.',
      blocks: [
        { type: 'table', headers: ['symptom', 'try'], rows: [
          ['I do not hear sound.', 'Press Evaluate from a click, raise gain, check output device, confirm the patch is not analysis-only input.'],
          ['The browser blocked audio.', 'Interact with the page and Evaluate again; browsers require user gestures to unlock audio.'],
          ['Mic permission did not appear.', 'Use an input patch and press Evaluate or the I/O button; confirm HTTPS or localhost.'],
          ['Input is armed but silent.', 'Set monitor on and gain above 0 if you want to hear it; listen on only analyzes it.'],
          ['Tab audio does not work.', 'Use input tab, choose a tab in the share picker, and enable tab audio in the browser dialog.'],
          ['The patch runs but nothing changes.', 'Check gain, row spelling, attractor confidence, and whether the row accepts live modulation.'],
          ['The sample name does not resolve.', 'Open Samples and check the bank name; wildcard forms like snm-* can help.'],
          ['Replay behaves differently from Evaluate.', 'Replay preserves frozen choices; Evaluate may rebuild and reroll them.'],
          ['I hear feedback.', 'Use headphones, turn monitor off, lower gain, or move the mic away from speakers.']
        ]},
        { type: 'p', text: 'If the editor looks wrong after patching, hard reload the page. If the runtime disappears, look for scripts that rewrite mounted DOM after initialization.' }
      ]
    },
    {
      id: 'reference',
      title: 'reference',
      summary: 'Compact syntax sheet for voices, rows, features, and shortcuts.',
      blocks: [
        { type: 'h', text: 'voice headers' },
        { type: 'code', code: 'string <pattern>\nsine <pattern>\nosc <pattern>\npluck <pattern>\ndrone <pattern>\nnoise <pattern>\npulse <pattern>\ndrum <pattern>\nsample <pattern>\ninput mic\ninput interface\ninput tab\nvideo camera [pattern]\nvideo screen [pattern]\nvideo file [pattern]\nvideo gen [pattern]' },
        { type: 'h', text: 'live source features' },
        { type: 'code', code: 'mic.intensity\nmic.rupture\nmic.density\nmic.brightness\nmic.noisiness\nmic.periodicity\nmic.volatility\nmic.silence\nmic.confidence\ncamera.motion\ncamera.presence\ncamera.edges\ncamera.centroidX\ncamera.centroidY\nscreen.motion\nvideo.rupture' },
        { type: 'h', text: 'keyboard' },
        { type: 'table', headers: ['shortcut', 'action'], rows: [
          ['Cmd-Enter', 'evaluate'],
          ['Cmd-Shift-Enter', 'replay'],
          ['Esc', 'stop'],
          ['Cmd/Ctrl-I', 'toggle I/O panel'],
          ['Shift (tap on param/effect rows)', 'open legal-value completion'],
          ['Tab', 'indent or accept completion'],
          ['ArrowUp / ArrowDown / PageUp / PageDown', 'navigate completion menu when open'],
          ['Enter', 'commit token suffix from selected completion'],
          ['Cmd-/', 'toggle line comments']
        ]},
        { type: 'h', text: 'browser requirements' },
        { type: 'p', text: 'Audio unlock requires a user gesture. Mic and interface input require permission and HTTPS or localhost. Tab audio requires getDisplayMedia and the browser share picker.' }
      ]
    }
  ];

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const inline = (text) => escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');

  const sectionSearchText = (section) => [
    section.title,
    section.summary,
    ...section.blocks.flatMap((block) => {
      if (block.text) return [block.text];
      if (block.code) return [block.code];
      if (block.items) return block.items;
      if (block.rows) return block.rows.flat();
      return [];
    })
  ].join(' ').toLowerCase();

  const renderBlock = (block) => {
    if (block.type === 'p') return `<p>${inline(block.text)}</p>`;
    if (block.type === 'h') return `<h4>${escapeHtml(block.text)}</h4>`;
    if (block.type === 'callout') return `<div class="docs-callout">${inline(block.text)}</div>`;
    if (block.type === 'code') return `<div class="docs-code"><pre>${escapeHtml(block.code)}</pre></div>`;
    if (block.type === 'ul') return `<ul>${block.items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`;
    if (block.type === 'ol') return `<ol>${block.items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`;
    if (block.type === 'table') {
      return [
        '<table class="docs-table">',
        '<thead><tr>',
        block.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join(''),
        '</tr></thead><tbody>',
        block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join(''),
        '</tbody></table>'
      ].join('');
    }
    return '';
  };

  const renderSection = (section, index) => `
    <section class="docs-section" id="docs-section-${escapeHtml(section.id)}" data-doc-id="${escapeHtml(section.id)}" data-doc-search="${escapeHtml(sectionSearchText(section))}">
      <div class="docs-section-kicker">${String(index + 1).padStart(2, '0')}</div>
      <h3>${escapeHtml(section.title)}</h3>
      <p><strong>${escapeHtml(section.summary)}</strong></p>
      ${section.blocks.map(renderBlock).join('\n')}
    </section>
  `;

  const render = () => {
    const panel = document.getElementById('docs-panel');
    const toggle = document.getElementById('docs-toggle');
    const close = document.getElementById('docs-close');
    const nav = document.getElementById('docs-nav');
    const content = document.getElementById('docs-content');
    const search = document.getElementById('docs-search');
    if (!panel || !nav || !content) return;

    nav.innerHTML = DOCS.map((section, index) => `
      <button class="docs-nav-button${index === 0 ? ' is-active' : ''}" type="button" data-doc-target="${escapeHtml(section.id)}">
        <span class="docs-nav-num">${String(index + 1).padStart(2, '0')}</span>
        <span>${escapeHtml(section.title)}</span>
      </button>
    `).join('');

    content.innerHTML = DOCS.map(renderSection).join('') + '<div class="docs-empty">no section matches that search.</div>';

    const setOpen = (shouldOpen) => {
      panel.hidden = !shouldOpen;
      if (toggle) toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      if (shouldOpen) {
        const target = search || content;
        window.requestAnimationFrame(() => target.focus({ preventScroll: false }));
      }
    };

    const activate = (id, shouldScroll = true) => {
      nav.querySelectorAll('.docs-nav-button').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.docTarget === id);
      });
      const section = content.querySelector(`[data-doc-id="${CSS.escape(id)}"]`);
      if (section && shouldScroll) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    if (toggle) toggle.addEventListener('click', () => setOpen(panel.hidden));
    if (close) close.addEventListener('click', () => setOpen(false));

    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-doc-target]');
      if (!button) return;
      activate(button.dataset.docTarget);
    });

    content.addEventListener('scroll', () => {
      const sections = Array.from(content.querySelectorAll('.docs-section:not([hidden])'));
      const current = sections.find((section) => section.getBoundingClientRect().top >= content.getBoundingClientRect().top - 6) || sections[0];
      if (current) activate(current.dataset.docId, false);
    }, { passive: true });

    if (search) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();
        let visibleCount = 0;
        content.querySelectorAll('.docs-section').forEach((section) => {
          const visible = !query || section.dataset.docSearch.includes(query);
          section.hidden = !visible;
          visibleCount += visible ? 1 : 0;
        });
        nav.querySelectorAll('.docs-nav-button').forEach((button) => {
          const section = content.querySelector(`[data-doc-id="${CSS.escape(button.dataset.docTarget)}"]`);
          button.hidden = section ? section.hidden : false;
        });
        content.classList.toggle('is-empty', visibleCount === 0);
        const firstVisible = content.querySelector('.docs-section:not([hidden])');
        if (firstVisible) activate(firstVisible.dataset.docId, false);
      });
    }

    if (toggle) {
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
          setOpen(false);
        }
      });
    }

    if (toggle && window.location.hash === '#docs') setOpen(true);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})();
