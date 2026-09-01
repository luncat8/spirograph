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
