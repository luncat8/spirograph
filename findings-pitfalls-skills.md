# findings / pitfalls / skills

## kinematics
- matching classic equations: pen angle = rot * (R +- r)/r, center orbit angle = rot.
  child center orbits the *parent* at radius (R-r) internal / (R+r) external.
  this reproduces hypotrochoid (inside) / epitrochoid (outside) exactly at one level
  and compounds for deeper trees.

## render (WebGL2 AA lines)
- gl_FragCoord is BOTTOM-left origin, but JS pixel coords (aA/aB/aPos from w2s)
  are TOP-left origin. they must be in the SAME origin before distToSeg, else the
  curve collapses to a 1D band. fix: `vec2 fc = vec2(gl_FragCoord.x, uRes.y -
  gl_FragCoord.y);` then distToSeg(fc, vA, vB). verified with a CPU rasterizer.
- one shared buffer, rebuilt every frame (no allocations in loop: preallocated
  Float32Array scratch, mutated in place).
- uploading scratch.subarray(0, count) each frame; capped at MAXSEG to bound memory.

## perf notes
- trace is a ring buffer (CAP per pencil) so memory is bounded and we redraw the
  whole recent trace each frame (simple + correct under zoom/pan). reduce CAP if
  many gears on weak GPUs (redraw cost ~ segments/frame).

## symmetry / phases
- a "rotate this sibling by 120 deg" offset MUST be added to the gear's frame
  (the inherited `carry`, i.e. both the orbit angle and the pen angle), not to
  its `rot`. adding it to `rot` gives orbit = a + s*phi but pen = (a + s*phi)*
  ratio, which is the *same closed curve* started at another parameter value -
  three "spread" children then draw exactly one figure on top of each other.
  worse, `rot` is integrated per frame (so the offset drifts away) and the
  whole-mode sampler overwrites it entirely (rot = speed * phi), so the
  spacing vanished the moment the mode switched. the fix is a real model field
  `phase0` (serialized) folded into `carry` inside stateAt.
  verified numerically: with the frame offset, child_1(t) == R(120 deg) *
  child_0(t) to 1e-8.
- a level template must be deep-cloned (sub-tree included). a shallow clone
  grows lvl 1 into childless siblings and every deeper level goes asymmetric.

## period detection
- exact rational LCM is the wrong tool for a UI: it is discontinuous in the
  parameters (0.2 -> 0.2001 turns 11 turns into 2000) and forces a "cannot
  draw" state. scan for the smallest u whose worst *positional* residual
  |frac(f*u)| * 2pi * amplitude is under ~0.5 px instead: continuous, bounded
  (O(maxTurns * harmonics) with an early break, <5 ms at 2000 turns), and it
  always yields a best-effort answer.
- only sub-trees that actually draw constrain the period; a hidden gear may
  spin at any rate.

## long computations
- no workers under file:// (chrome blocks worker scripts from file URLs), so
  "background" means a resumable job stepped from rAF with a time budget.
  the existing incremental overlay bake (drawn -> count-1) already paints the
  partial ring for free, which turns the slice loop into a progress animation.

## gui
- a range input snapped after the fact fights the drag. when only discrete
  values are legal, make the input an INDEX over the list of valid values
  (min 0, max n-1, step 1) - every reachable handle position is then valid.
- never rebuild the slider row the pointer is currently dragging (detaching an
  active range input releases pointer capture); skip rows where
  document.activeElement === row.input when syncing values.

## gear sizing
- never use an ABSOLUTE floor for a generated child radius
  (`Math.max(0.05, parent.r * 0.45)`). below depth 3 every gear clamps to the
  floor and becomes as large as its parent: orbit radius (parent.r - r) = 0,
  rolling ratio 0, the whole level collapses onto the parent centre and looks
  like "deep levels do nothing". scale relative to the parent, keep the floor
  orders of magnitude smaller, and refit a cloned subtree that lands under a
  smaller parent.

## controls that mean one thing
- a per-pencil ring cap ("trail length") must not double as the whole-mode
  bake resolution: users read it as a length, and tying it to the sampler
  turns it into a smoothness/subdivision control. keep a separate
  points-per-turn ("detail") knob and let the bake size its rings itself
  (shrink them back when leaving the mode).
- a search CEILING is not a target. "max period 2000" does not make a 2000
  turn figure: the scan reports the smallest closing turn count. say so in the
  help text, and keep the range near the useful band (4..4000).

## settings / single source (0.5.7)
- slider bounds, defaults and the loader clamp were duplicated across gui.js
  (row min/max), main.js (the setter clamp) and gear.js (the deserialize
  clamp). put every bound once in `js/settings.js` `LIMITS` and route all
  three through one `clamp(field, v)`; a test reading the slider attributes
  from `Settings.LIMITS` stops the "slider says 4..4000, loader clamps to
  20000" drift.
- the persisted `app` bag (mode, toggles, bake options) is one `APP_SCHEMA`
  table: default, getter off the live App, loader coercion and an explicit
  apply recipe per field. `snapshotApp` saves, `sanitizeApp` validates,
  `applyApp` pushes into live App + GUI.
- classic `<script>` files each have their own IIFE scope, so a recipe in
  settings.js CANNOT close over a main.js local (e.g. `markDirty`). call the
  public `App.markDirty()`. under node, `require('../js/gear.js')` also has no
  access to the browser `window` global: a file another file reads for free
  must publish to `globalThis` (settings.js does `root = window || globalThis`).
- default-on toggles (`overlay`, `showCircles`, `drawTrails`) load with
  "anything except an explicit false/0 is on": only an actual `false` (or `0`,
  which the old boolean-typed check treated as off) flips them. default-off
  toggles take only a real `true`/`1`.

## 3D mode (0.6.0)
- the 3D lift that keeps the figure is the ROTATING-PLANE polar map,
  (x2d,y2d) -> (x2d*cos phi, x2d*sin phi, y2d), the 2D curve drawn on a
  vertical plane through the z axis that spins with the second speed. the
  cylindrical lift (r=rho, theta=phi, z=rho) drops the in-plane angle and the
  spirograph shape degenerates into a cone wobble - rejected.
- second speed / closure: the spin azimuth is phi = spinK * rootRot. a whole
  3D figure closes only when spinK*root.speed*u is an integer, so period
  detection must add the PRODUCT term per root
  (`pushHarm(|spinK*root.speed|, ~1)` into the same positional closure scan;
  rationalize(spinK).den alone is wrong - root.speed 1/2 + k 1/2 needs u
  divisible by 4). spin snaps to the +-k/d grid in whole mode.
- per-point phase: the azimuth of a ring point depends on WHEN it was drawn,
  so the ring stores the root rotation at push time in a parallel
  `phaseRing` (Float32Array, sized with the ring; copy it in reallocRing,
  seed missing phases 0 for trails drawn before 3D). do NOT widen the stride-5
  ring to stride 6 - every tuned 2D consumer would change.
- the 2D line renderer eats SCREEN pixels, so 3D projects world->screen in JS
  (one view-proj mat4 built per frame in camera3.js) and feeds the unchanged
  draw loops a scratch gear whose ring IS the projected screen coords. the
  draw loops read App.S/pan/cx0/cy0 as globals, so install an identity
  transform (pushIdentity/popIdentity, six writes, no closure) around the 3D
  draw - do not thread transform params into the hot loop.
- screen projection is top-left origin like w2s: sx=(ndx+1)*0.5*W,
  sy=(1-ndy)*0.5*H. world UP is +z (mat4LookAt up [0,0,1]); default yaw pi/2
  puts the eye on +y so the phi=0 XZ plane faces the viewer upright. matrices
  are ROW-major: projectPoint reads m[row*4+col] (mixing column-major indices
  silently sends everything to (0,0)).
- depth: only the overlay FBO needs a new DEPTH_COMPONENT24 renderbuffer (the
  default framebuffer already has depth). enable depth only for the 3D trail
  pass; `begin()` (2D path) disables DEPTH_TEST and clears depth. translucent
  AA edges still write depth, so a nearer segment's feather can halo a far
  one - the line shader's `discard` at a<=0 trims the worst of it.
- camera gestures reuse the whole 0.4.0 gesture machinery: orbit/pan/dolly set
  viewDirty + requestRender and draw directly at the live camera (decimated
  when over budget), and the overlay re-bakes once on settle. isGestureActive
  also covers the fit ease and auto-rotate.
- REWRITTEN (0.7): gears are SPHERES, not tilted discs. a sphere's silhouette
  projects to a screen-space CIRCLE (its radius is the projected sphere radius
  along the camera-right axis), so the outline is a single R.circle at the
  projected centre - cleaner than the old 64-seg ellipse polyline, which was
  what a tilted DISC would need. outlines only (no fill/shade). trails are real
  3D points (stride 6 x y z rgb); project ring[k] straight through the camera.
- the 3D model is nested FRAMES, not a global plane sweep: each gear mounts in
  its parent's pen frame and has TWO angles (spin about the frame normal, tilt
  about the spun e1); frame F is 9 floats (columns e1,e2,e3). speed2=0 must
  reproduce 2D exactly (figure in XZ, world y=0) - keep that as the unit test.
  period closure for nested rotations can't cancel like 2D harmonics: require
  each drawn gear's speed, speed2 and speed*ratio (pen-frame roll) to be whole
  turns.
- w2s3D returns a REUSED scratch object: any caller that holds two points at
  once (hit test centre+rim, sphere centre+radius, dial arms) must use the
  second scratch (w2s3DC) or read scalars immediately, else the 2nd projection
  overwrites the first and circles draw at the rim point.

