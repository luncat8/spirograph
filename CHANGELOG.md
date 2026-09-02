# CHANGELOG

## 0.6.0 - level/period fixes (review pass over the 04-plan implementation)
- **lvl sliders start at 0.** 0 empties that level and everything below it,
  which is how a level is removed; the range is 0..12 and a new slider appears
  as soon as the level above holds gears, at any depth. a 400-gear guard blocks
  a runaway `12 x 12 x 12` (toast, tree untouched).
- **levels >= 2 fixed.** sibling spacing is now a real model field `phase0`
  (serialized) that offsets the gear's whole *frame* - orbit, pen and the whole
  sub-tree - instead of its `rot`:
  - offsetting `rot` only reparametrizes one shared curve (all siblings draw
    the same figure on top of each other - no rosette at all),
  - `rot` is integrated per frame, so the offset drifted away, and
  - the whole-mode sampler overwrites `rot` (rot = speed * phi), so the
    spacing vanished entirely the moment the mode switched.
  level templates are now deep-cloned (sub-tree included) too, so growing lvl 1
  no longer produces childless siblings that break every deeper level.
- **no more period popup.** period detection was an exact LCM of rationalized
  speeds: discontinuous (0.2 -> 0.2001 turned 11 turns into 2000) and it
  refused to draw above a threshold. it is now a closure scan over the figure's
  rotating-vector harmonics for the smallest turn count whose worst
  *positional* error stays under ~0.5 px, each frequency weighted by the radius
  it drives. sub-millisecond, always answers: when nothing closes within the
  limit the best candidate is drawn and the readout says
  `~N turns (approx, gap ...)`. the `period threshold` slider is replaced by
  `max period` (the search ceiling); legacy scenes map the old field onto it.
- **whole mode bakes in the background.** the bake is a resumable job stepped
  from the frame loop in ~6 ms slices and painted progressively
  (`period: 132 turns - baking 47%`); dragging a slider bakes a quarter-res
  draft and refines 300 ms after the last move. no freeze, no skipped update.
- **whole-mode sliders only stop on valid positions**: `speed` steps through
  +-k/d (d <= 12) and `diameter` through the rational multiples of the parent
  diameter, both as *index* sliders (no silent post-snap fighting the drag).
  entering whole mode snaps the scene onto that grid once, and the open context
  menu is rebuilt when the mode changes.
- resizing a gear now scales the sub-tree mounted on it, so gear ratios (and
  with them the period) survive the edit and children never outgrow a shrunk
  parent.
- memory: pencil rings are allocated lazily and grow by doubling up to the
  trail cap instead of a flat 800 KB per gear at scene load (a 144-gear tree
  used to reserve ~115 MB before drawing anything). lowering `trail length`
  gives the memory back.
- fixes: `hslToRgb` allocated a closure per colored sample (per-frame hot
  path); dead `gcd`/`lcm`/`mixRGB` removed; symmetry no longer mirrors
  `phase0` (it is what makes the level a rosette); the sidebar scrolls when it
  no longer fits the window.
- `test/run.js` - 90 headless checks (gear math + the real app booted on
  DOM/WebGL stubs), `test/preview.js` - offline PNG renderer for eyeballing a
  bake without a browser.

## 0.5.1
- scene save/load now carries every view-state setting, so a saved scene
  reproduces exactly what the user had on screen: trace mode (animate/whole),
  paused state, symmetry, bake-full-figure overlay, period threshold, and all
  view toggles (circles, dial, points, glow points, draw trail). old files
  without an `app` block fall back to defaults. the reset button (and 'x')
  restores the default scene AND every saved setting back to its factory value,
  so reset is now a full clean slate.
- panel checkboxes/sliders keep internal refs so load + reset can sync them
  without re-firing the input handlers.

## 0.5.0
- gear-tree level sliders (lvl 1..N) in the panel: every parent at a depth
  gets exactly N children placed at i*360/N degrees; new siblings deep-clone
  the first child (add-sub-gear defaults when there is none); kept children
  are re-spaced so the level stays radially uniform even after rot drift.
  lvl k+1 appears once level k has sub-gears; `reset levels` collapses the
  tree to a single chain.
- symmetry mode (panel checkbox): context-menu edits mirror to every gear at
  the same level (r, speed, internal, pencil d/width/colors, anim speed,
  trail length); with it on, `add sub-gear` grows the whole level. whole-mode
  edits run one tree-global recompute per edit instead of one per sibling.
- per-pencil `trail length` slider in the context menu (500..40000 points,
  default 20000): soft cap on the stored animate-mode trail. Lowering it
  evicts the oldest points; whole-mode bakes are never trimmed to it.
- `period threshold` slider in the panel (50..2000 turns, default 2000):
  when the detected period exceeds it, the whole-mode bake is skipped with a
  toast (the existing trace stays) instead of drawing a seam-capped figure.
  `detectPeriod` now returns the uncapped LCM (`turnsRaw`).
- scene files now carry `rot` (orbit angle) per gear, so a radially-spaced
  tree saved and reloaded keeps its layout (legacy files default to 0), plus
  the new `trailCap`. `detectPeriod` also walks every root (it silently
  ignored all roots after the first).

## 0.4.0
- pan/zoom stays 60+ FPS in both modes with a visible trail: pointer/wheel
  gestures draw the ring directly at the live view transform (no per-frame FBO
  rebake); the overlay re-bakes once on gesture release. wheel zoom gets a
  150ms "wheel-end" debounce instead of a per-tick rebake.
- gesture draw is auto-tuned per device: a one-time init benchmark measures the
  largest ring the device can push in an 8ms slice; scenes above it are
  decimated (points merged per segment) only while a gesture is active, full
  quality restored on release. override with `window.SPIRO_GESTURE_SEG_BUDGET`.
- hot loop rewritten: hoisted renderer refs, running ring index (no `%` per
  step), pre-loaded first pair. per-segment round-join discs (72 verts each,
  ~92% of a rebake's vertex count) replaced by turn-gated discs — only drawn
  when `sin(turn) * half > 1.2px`, so dense traces keep the vertex win while
  sparse thick traces keep rounded joins. end-cap dot kept.
- whole mode is idle-stable: the finished figure is no longer re-rendered every
  frame; rendering happens only on invalidation (edits, view, toggles).
- color animation mode (cycles/frequency) is now a single GLOBAL toggle in the
  panel: auto-defaults to 'frequency' in animate mode and 'cycles' in whole
  mode, user-overridable at any time; the per-pencil toggle in the context
  menu is removed (the per-pencil speed slider stays). scene files carry a
  top-level `colorMode`; legacy files derive it from the pencils.
- save/load reworked: "save (d)" writes `spirograph.js` — a node-friendly
  SETTINGS module — instead of json; "open (o)" and "paste (p)" accept both
  .js and legacy .json. a `default.js` next to index.html (shipped example
  included) loads as the startup scene when there is no autosave.

## 0.3.2
- per-pencil cycles/frequency toggle now auto-tracks the global mode:
  switching to Animate sets every pencil's animMode to 'frequency' (hue/sec,
  continuous color flow), switching to Whole sets it to 'cycles' (forward+back
  sweeps per closed period). user can still manually override per pencil.
  whole mode always renders with cycles semantics (animMode is irrelevant
  there); animate mode honors the toggle. new sub-gears inherit the
  mode-appropriate default.
- whole-mode recolor path verified: the per-pencil "speed" slider already
  triggers `recolorWhole` (color-only re-bake), no geometry resample.

## 0.3.1
- whole-curve period detection fixed: `speed*ratio` denominators are now
  collected for EVERY gear (not just pencil gears), so compound/nested figures
  close on the correct period instead of leaving a seam (nested closure error
  0.7 -> 0). whole mode now snaps all gear speeds to low-denominator fractions
  on recompute, so the default scene yields a clean 132-turn rosette instead of
  a ~1100-turn blob. `computeWhole` clamps sampleCount below CAP so the curve's
  start point is never evicted by the closing sample.
- 2-color animation now sweeps the long-arc hue (Y -> R goes via G, B) with
  lightness and saturation blending linearly, in both animate and whole modes.
- whole-mode color edits (c1/c2 slot or anim speed) are now color-only
  re-bakes: `recolorWhole` walks the existing ring and rewrites RGB without
  re-sampling geometry. anim speed controls how many full hue cycles the
  gradient makes around the closed figure; default raised to 1 so the default
  whole-mode figure shows one full c1 -> c2 sweep.

## 0.3.0
- foundation: retain full figure — raster overlay ON by default, Gear.CAP 6000 -> 40000
  (FBO re-bakes on pan/zoom/resize so no arcs drop). round line joins via filled
  triangle-fan discs; chunked flushes keep a full 40k-point ring within the vertex budget.
- touch: pinch-zoom (2 pointers, zoom about gesture midpoint) + one-finger pan via Pointer
  Events; tap (<=8px) opens the gear menu, drag pans, a 2nd finger closes any open menu.
- dial gear overlay: gearStyle circles/dial toggle replaces circle outlines with a radial
  hand per gear (length = gear radius, direction = gear.rot); composes with all modes.
- whole-curve mode: computes the full closed figure at once with period detection
  (continued-fraction rationalize + LCM of denominators, capped at 2000 turns); live
  recompute on slider edits, speed snaps to +-k/d in whole mode, "period: N turns" readout.
- points mode: only live glowing pen tips (additive point-sprite glow), no trace/overlay.
  three top-level modes (Animate / Whole / Points) plus gearStyle compose cleanly.

## 0.2.0
- pencil reworked: two color slots (color 1 / color 2), each with its own enable
  checkbox before the picker. none enabled = no pencil, one = static color,
  both = animated blend. legacy `on`/`anim` pencil format auto-migrated.
- added gear diameter slider (above speed) in the context menu

## 0.1.0
- initial implementation: interactive spirograph with parent-child gear tree
- WebGL2 analytic-antialiased line rendering, variable pencil width
- per-gear context menu: internal/external, speed, pencil on/d/width/color, 2-color anim
- zoom/pan, pause, clear, reset, save/load (json file + clipboard), localStorage autosave
- zero dependencies, runs from file:// with no build step
