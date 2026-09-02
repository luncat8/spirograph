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
