# CHANGELOG

## 0.7.2 - glass spheres view option
- new "spheres" section in the sidebar view options: **glass spheres** checkbox,
  **sphere tint** color picker, **wall thickness** slider (controls the
  relative shell thickness the Beer-Lambert path sees - thicker = more
  visible absorption and a stronger TIR rim), **translucency** slider.
  persisted in the app bag like every other toggle (save/load/reset covered).
- every gear disc renders as a ray-shaded glass shell (one instanced impostor
  quad per gear - analytic, no geometry, no raymarching): Fresnel reflections
  off a small studio environment, Beer-Lambert absorption through the shell
  wall (the long silhouette path reads as visible glass thickness), total
  internal reflection at the rim (the mirror ring of real glass balls), and
  refraction of the scene behind, sampled from a framebuffer copy bent along
  the traced ray (capped to a few px so hairline trails don't moire).
- z handling: spheres sort far -> near (camera depth in 3D, radius in 2D so
  parents paint under the children mounted inside them) and draw in two
  passes - far wall, then the trail layer, then near wall - so trails and
  child spheres nested inside a parent show through its glass properly.
- translucency scales reflections/absorption instead of alpha-blending toward
  the framebuffer (the blend double-imaged sharp trails).

## 0.7.1 - 3D trails match the spheres; render modes unified
- **3D trail fix (for real).** three independent defects put the baked 3D
  trail somewhere other than the spheres: the "identity" transform installed
  for the projected buffer still applied the 2D y flip (trail mirrored to
  negative y); the projection scratch was indexed by ring slot and read
  through a wrapped head (stale pixels for most of a full ring); and the
  incremental overlay bake stopped appending once the ring was full (trail
  frozen while the gears moved on). trails now project into a linear buffer
  under a true identity (`App.Sy`), and the bake uses a monotonic
  `pushed`/`baked` counter shared by 2D and 3D.
- **two render modes, one dispatcher.** overlay ON = keep (cached FBO, append
  only the new points, invalidated by any view change incl. camera orbit /
  dolly / pan / fit / auto-rotate / pivot change, and guarded by a view key);
  overlay OFF = redraw (whole ring every render). the keep-mode picture is now
  pixel-identical to the redraw-mode picture (no per-chunk end caps in the
  cache; the tip is drawn live).
- gears added while in 3D store 3D trails (stride 6) instead of being skipped.
- test harness: deterministic frame clock + segment tap; 186 headless checks.

## 0.7.0 - true 3D generalization (two rotation axes per gear)

The 0.6 approach (one global spin speed sweeping the flat figure into a
surface of revolution) was rejected; 3D is now a genuine generalization of
the mechanism rather than a post-hoc lift.

- **two rotation axes per gear.** every gear is a sphere carrying a nested 3D
  orientation frame (`gear.f3`, columns e1/e2/e3). it precesses about TWO axes
  of the frame it is mounted in: spin about the disc normal (`speed`, the
  ordinary in-plane rolling) and tilt/precession about an in-plane diameter
  (`speed2`, a NEW per-gear control, default 0). frames thread down the gear
  tree (each child mounts in its parent's pen frame), so tilts compose into
  genuine knotted 3D curves. with every `speed2` = 0 the mechanism reduces
  exactly to the flat 2D figure standing in the XZ plane.
- **trails are real 3D points.** rings store `x y z r g b` per point in 3D
  (stride 6) vs `x y r g b` in 2D (stride 5); the stride switches and the trace
  clears on a dimension change (`Gear.setTreeStride`).
- **gears draw as sphere outlines.** a sphere's silhouette projects to a
  screen-space circle (unlike a tilted disc's ellipse), so each gear renders
  as a single clean outline circle at its projected sphere centre; no fill or
  shading. dial arms link sphere centres to the live 3D pen points.
- **camera orbits the selected gear.** dragging orbits the open menu's gear
  sphere centre; with no menu open it orbits the root (which normally sits at
  the origin). fit/reframe measure from that pivot. (`js/camera3.js` keeps its
  pure mat4 lookAt math, pitch clamp, yaw wrap, dolly band, pan, auto-rotate.)
- **3D whole mode closes on the two-axis model.** period detection pushes, for
  each gear in a drawn subtree, both rotation rates (spin, tilt) plus the
  pen-frame roll rate (`speed*ratio`) as closure harmonics, so the nested
  frames repeat whole turns together and the baked curve closes in (x,y,z);
  tilt snaps onto the same low-denominator grid as speed in whole mode.
- **scene format:** per-gear `speed2` rides on the gears; top-level `dim` and
  `camera` persist (the old top-level `spinSpeed` is gone; legacy/`default.js`/
  autosave load and default to 2D with all tilts 0).
- fixes: rosette spacing (360/N) survives adding gears mid-animation -
  `cloneGear` now copies the template's accumulated `rot`/`rot2` so siblings
  share an orbit angle (a fresh `rot=0` gear added beside spun-up ones no
  longer clumps); added gear sub-trees get a full 3D pose. the orbit camera
  pivot is a FIXED point set when a gear menu opens (its sphere centre at that
  moment), not a per-frame chase, so the baked trail and the spheres stay in
  the same transform while the gear animates.
- `test/run.js` - 165 headless checks: nested-frame kinematics, speed2=0
  reproduces 2D in (x,z) with y=0, tilt lifts the pen out of plane, two-axis
  bake closure, stride 5/6 switch + save/load round-trip, per-gear tilt
  slider, orbit-pivot menu behavior, mid-animation rosette spacing (2D+3D) and
  fixed pivot, plus all prior 2D/camera checks.

## 0.6.0 - (REJECTED) plane-spin surface of revolution
> superseded by 0.7.0; kept in git history. the rotating-plane / global spin
> model produced a swept "vase/cage", not a per-gear two-axis mechanism.

## 0.5.7 - settings.js: single source of truth for settings + state
- new `js/settings.js` owns every slider bound (min/max/step/default), a
  `clamp(field, v)` used by both the runtime setters and the save loader, the
  persisted `app` schema (per-field default, getter, loader coercion, an
  explicit apply recipe) and the autosave store key. `defaultApp`,
  `sanitizeApp`, `snapshotApp`, `applyApp` replace the duplicated default /
  whitelist / snapshot / apply blocks that used to live in gear.js and
  main.js. changing a bound (e.g. max period) or adding a persisted toggle is
  now a one-line / one-entry edit.
- the `max period` / `detail` / `trail length` GUI rows read their bounds from
  `Settings.LIMITS` (the help cap too), so the slider, the runtime clamp and
  the loader clamp can no longer drift apart.
- recipes call the public `App.markDirty()` (the old main.js-local function is
  not visible across the separate classic-script scopes); `settings.js`
  publishes to `globalThis` under node as well as `window` so the test loader
  resolves it. a drift-guard test asserts the live App equals the schema
  defaults after init.

## 0.5.6 - follow-up review (deep levels, trail length, max period)
- **lvl >= 4 really fixed.** the size fix was still missing: a new sub-gear used
  `Math.max(0.05, parent.r * 0.45)`, so from depth 3 down every gear clamped to
  the 0.05 floor and ended up *the same size as its parent* - orbit radius
  `parent.r - r` = 0, rolling ratio 0, all siblings stacked on the parent
  centre. new gears are now strictly proportional (`parent.r * 0.45`, floor
  0.002, pencil offset from the child's own radius), and `fitToParent` rescales
  a cloned sub-tree that lands under a smaller parent. depth 5 now reads
  r = 0.009 with a positive orbit radius at every level, and depth-4 siblings
  sit exactly 360/N apart in the animate integrator.
- **trail length is a length again.** it no longer bounds the whole-mode bake
  (that made it a smoothness/subdivision knob): the bake sizes its rings by its
  own resolution up to the 40000-point ceiling, and the slider is hidden in
  whole mode. leaving whole mode shrinks the rings back to the trail cap.
- **new `detail` slider** (whole-mode box, 20..2000 points per turn, default
  200): the actual smoothness knob for a baked curve. saved with the scene.
- **`max period` range is now 4..4000** (was 100..20000). the help text spells
  out that it is the *upper limit* of the closure search, not a target: the
  readout shows the SMALLEST turn count that closes the figure, which on the
  whole-mode gear-ratio grid is usually 30..200. lowering it below the true
  period deliberately cuts the figure short (drawn, marked `~approx`).
- the period readout also shows the baked point count (`period: 36 turns,
  7201 pts`).

## 0.5.5 - level/period fixes (review pass over the 04-plan implementation)
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
