# CHANGELOG

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
