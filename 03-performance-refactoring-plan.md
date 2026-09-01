# Whole-mode pan/zoom performance plan

## Goal
Keep 60+ FPS during pan/zoom in both animate and whole modes when the trail is
visible. Eliminate the per-frame full FBO rebake that currently runs on every
pointer event, and harden the direct-draw path so scenes near the CAP=40000
ring budget stay under frame time on weak GPUs.

## Problem (verified against code)

`js/main.js`:
- `onMove` pan drag (line 407), `onMove` pinch (line 395), `onWheel` (line 450)
  each call `App.invalidateOverlay()`.
- `renderScene` (line 598) then does `R.overlay.clear()` + `bakeOverlay(true)`
  on the next frame, re-walking every gear's full ring buffer and uploading
  ~6 verts per segment plus a 72-vert `R.dot` round-join disc per segment.
  With `Gear.CAP=40000` and 2 pencils that is ~3 M vertex pushes / frame.
- `drawGearSegments` inner loop (line 470) is the hot path; it also uses
  `(g.head + k) % Gear.CAP` twice per iteration and looks up `R.seg`/`R.dot`/
  `R.flush`/`R.vCount`/`R.maxVert` on the global every call.

The "bake full figure (overlay)" toggle (`js/gui.js:134`) maps to
`App.overlay.on` and is on by default. Anim-speed slider in whole mode already
routes to `Gear.recolorWhole` (`js/main.js:163`); no change needed for that
path.

## Approach (synthesized from `performance-review-M3` + `performance-review-Q`)

Combine four wins, in priority order:

1. **Gesture-bypass FBO** (from Q). When an active pointer gesture is in
   progress, skip the FBO entirely and draw the ring directly to the default
   framebuffer at the current view transform. Invalidate the FBO on gesture
   end so steady state resumes the cheap incremental path.
2. **Decimation above an auto-tuned segment budget** (from Q, primary,
   with a one-time micro-benchmark at init). During the gesture, if total
   segment count across drawing gears exceeds `GESTURE_SEG_BUDGET`, stride
   through each ring and merge every N consecutive points into one segment
   so the trace stays continuous at reduced point count. The budget is
   set at startup by measuring how many segments the optimized direct-draw
   path can push per millisecond on this device, then scaling to a target
   slice of the 16.6 ms frame (8 ms). Decimation is only active for the
   gesture window; the next FBO rebake restores full quality. This
   protects weak GPUs without any cost on desktop.
3. **Drop per-segment `R.dot`** (from M3 Fix 2). The round-join disc pushes
   `DOT_TRI * 3 = 72` verts per segment — 12x the segment's own 6 verts and
   ~92 % of a full rebake's vertex count. Keep only the final end-cap dot.
4. **Hot-loop cleanup** (from M3 Fix 3). Hoist `R.seg`/`R.flush`/`R.vCount`/
   `R.maxVert` to locals, pre-load the first segment pair, and advance ring
   indices with a running counter instead of `(g.head + k) % Gear.CAP`.

Rejected alternatives:
- Kilo's UV-offset blit (original plan): visible edge artifact on pan from
  `CLAMP_TO_EDGE` and blur on small zooms. Q's direct draw is simpler and
  artifact-free.
- M3's debounced rebake: trail appears "frozen" during the gesture, which is
  visually jarring. Gesture-bypass is smoother.
- Q's decimation-as-only-fix: works on weak hardware but is wasteful on
  desktop. The plan keeps the decimation path gated on the budget so desktop
  always gets full quality.
- World-space FBO (M3 Fix 5 / original Kilo plan): deferred — quality is
  bounded by FBO resolution. Not worth the complexity at current trace
  lengths.

## Changes

### A. `js/main.js` — module-level hoist + helpers

Add the following at the top of the IIFE, immediately after the `App = {...}`
object literal (line 31) and before the `var last = 0;` block (line 33).
Putting them here means they are created exactly once at module init and
captured by every draw function below.

```js
// hoisted R.* lookups used in the per-frame hot path
var Rseg = R.seg, Rflush = R.flush, RvCount = R.vCount, RmaxVert = R.maxVert;

// Gesture-draw segment budget, auto-tuned at init by `tuneGestureBudget`.
// Holds the maximum number of segments the device can draw in the gesture
// time slice while staying above ~48 FPS. Devices that can draw more
// never enter the decimated path. Capped to R.maxVert / 6 to avoid
// overrunning the scratch buffer.
var GESTURE_SEG_BUDGET = 60000;        // provisional; replaced at init
var GESTURE_BUDGET_TUNED = false;
var GESTURE_FRAME_SLICE_MS = 8;        // target ms per frame for gesture draw

function isGestureActive() {
    return panning || pointers.size >= 2;
}
```

Replace the current `renderScene` trail branch (lines 598-630) with:

```js
if (!App.drawTrails) {                 // unchanged
    R.begin(BG);
    drawGearOverlay();
    R.flush();
    if (App.showPoints) drawPenPoints();
    return;
}

if (isGestureActive()) {               // NEW: direct draw during gesture
    R.begin(BG);
    var totalSegs = 0;
    for (var i = 0; i < App.allGears.length; i++) {
        totalSegs += App.allGears[i].count - 1;
    }
    var decimate = totalSegs > GESTURE_SEG_BUDGET;
    for (var i = 0; i < App.allGears.length; i++) {
        var g = App.allGears[i];
        if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
        var half = Math.max(0.5, (g.pencil.width / 2) * App.dpr);
        if (decimate) drawGearSegmentsDecimated(g, half);
        else drawGearSegments(g, 0, g.count - 1, half);
        R.flush();
    }
    drawGearOverlay();
    R.flush();
    if (App.showPoints) drawPenPoints();
    return;
}

if (App.overlay.on) {                  // unchanged steady-state FBO path
    R.overlay.bind();
    if (App.overlay.invalid) {
        R.overlay.clear();
        for (var i = 0; i < App.allGears.length; i++) {
            App.allGears[i].drawn = 0;
            App.allGears[i].drawnNewestRing = undefined;
        }
        App.overlay.invalid = false;
        bakeOverlay(true);
    } else {
        bakeOverlay(false);
    }
    R.overlay.unbind();
    R.begin(BG);
    R.overlay.blitToScreen();
    drawGearOverlay();
    R.flush();
    if (App.showPoints) drawPenPoints();
    return;
}

// overlay off fallback: same direct-draw path used during gestures.
// (M3 Fix 4: was a separate full-ring redraw branch — now redundant after
// the hot-loop cleanup below makes direct draw cheap.)
R.begin(BG);
for (var i = 0; i < App.allGears.length; i++) {
    var g = App.allGears[i];
    if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
    var half = Math.max(0.5, (g.pencil.width / 2) * App.dpr);
    drawGearSegments(g, 0, g.count - 1, half);
    R.flush();
}
drawGearOverlay();
R.flush();
if (App.showPoints) drawPenPoints();
```

### B. `js/main.js` — decimation helper

Add `drawGearSegmentsDecimated` next to `drawGearSegments` (line 470).
Merges every `step` consecutive points into a single screen-space segment
so the trace stays continuous (no gaps) at reduced point count. End-cap dot
is still emitted for the final visible vertex.

```js
function drawGearSegmentsDecimated(g, half) {
    var n = g.count - 1;
    if (n <= 0) return;
    var step = Math.max(1, Math.ceil(n / (GESTURE_SEG_BUDGET / Math.max(1, App.allGears.length))));
    if (step <= 1) { drawGearSegments(g, 0, n, half); return; }
    var cap = Gear.CAP, head = g.head, ring = g.ring;
    var panX = App.view.pan[0], panY = App.view.pan[1];
    var S = App.S, cx0 = App.cx0, cy0 = App.cy0;
    var lastIa = -1;
    for (var k = 0; k < n; k += step) {
        var end = Math.min(k + step, n);
        var ia = head + k;     if (ia >= cap) ia -= cap;
        var ib = head + end;   if (ib >= cap) ib -= cap;
        var ax = ring[ia * 5],     ay = ring[ia * 5 + 1];
        var bx = ring[ib * 5],     by = ring[ib * 5 + 1];
        var s0x = cx0 + (ax + panX) * S;
        var s0y = cy0 - (ay + panY) * S;
        var s1x = cx0 + (bx + panX) * S;
        var s1y = cy0 - (by + panY) * S;
        Rseg(s0x, s0y, s1x, s1y, half,
            ring[ia * 5 + 2], ring[ia * 5 + 3], ring[ia * 5 + 4],
            ring[ib * 5 + 2], ring[ib * 5 + 3], ring[ib * 5 + 4], 1);
        if (RvCount() > RmaxVert - 8) Rflush();
        lastIa = ib;
    }
    // end-cap dot at the last drawn point (keeps tip rounded under decimation)
    if (half >= 1.0 && lastIa >= 0) {
        var ex = cx0 + (ring[lastIa * 5] + panX) * S;
        var ey = cy0 - (ring[lastIa * 5 + 1] + panY) * S;
        R.dot(ex, ey, half, ring[lastIa * 5 + 2], ring[lastIa * 5 + 3], ring[lastIa * 5 + 4], 1);
    }
}
```

The per-gear budget is `GESTURE_SEG_BUDGET / gearCount` so a 2-pencil scene
at CAP (80k segs) decimates each ring to ~30k segs (step ≈ 3) and a 4-gear
scene gets ~15k per ring (step ≈ 5). `GESTURE_SEG_BUDGET` is set at init
by `tuneGestureBudget` (section B.1), so this only kicks in for scenes
that actually exceed the device's per-frame segment throughput.

### B.1. `js/main.js` — auto-tune `GESTURE_SEG_BUDGET` at init

Add `tuneGestureBudget` next to `drawGearSegmentsDecimated`. It runs once
during `init()` (after `R.init` returns and `App.dpr` is known) and
replaces the provisional `60000` default with a device-measured value.

The benchmark uses a synthetic on-screen segment stream that exercises
exactly the same code path as the gesture draw: the optimized
`drawGearSegments` loop body, hoisted locals, and the `R.seg`/`R.flush`
churn. No FBO, no decimation — pure draw cost. We ramp the segment
count up and find the largest count whose mean draw time stays under
`GESTURE_FRAME_SLICE_MS` (8 ms, leaving the rest of the 16.6 ms frame
for sim + other rendering).

```js
function tuneGestureBudget() {
    if (typeof window.SPIRO_GESTURE_SEG_BUDGET === 'number') {
        GESTURE_SEG_BUDGET = window.SPIRO_GESTURE_SEG_BUDGET | 0;
        GESTURE_BUDGET_TUNED = true;
        return;
    }
    // Synthesise a single large Float32Array laid out like a real gear
    // ring (xy rgb per point), big enough to exercise the budget range.
    var TEST_CAP = 200000;
    var testRing = new Float32Array(TEST_CAP * 5);
    for (var i = 0; i < TEST_CAP; i++) {
        var t = i / TEST_CAP;
        testRing[i * 5]     = Math.cos(t * 200) * 2;     // x
        testRing[i * 5 + 1] = Math.sin(t * 137) * 2;     // y
        testRing[i * 5 + 2] = 0.5 + 0.5 * Math.cos(t);  // r
        testRing[i * 5 + 3] = 0.5 + 0.5 * Math.sin(t);  // g
        testRing[i * 5 + 4] = 0.8;                       // b
    }
    var fakeGear = {
        ring: testRing,
        head: 0,
        count: 0
    };
    // Coarse ramp: 8k, 16k, ..., 200k. For each, run 4 draws and take
    // the mean. Stop at the first sample that exceeds the per-frame slice.
    var samples = [8000, 16000, 32000, 64000, 96000, 128000, 160000, 200000];
    var bestUnder = 0;
    var MAX_SAFE = Math.floor(RmaxVert / 6) - 16;   // leave headroom for flush
    for (var si = 0; si < samples.length; si++) {
        var n = samples[si];
        if (n > MAX_SAFE) n = MAX_SAFE;
        fakeGear.count = n + 1;
        R.begin(BG);
        var t0 = performance.now();
        for (var rep = 0; rep < 4; rep++) {
            drawGearSegments(fakeGear, 0, n, 1.5 * App.dpr);
            Rflush();
        }
        var dt = performance.now() - t0;
        var perFrame = dt / 4;
        if (perFrame <= GESTURE_FRAME_SLICE_MS) bestUnder = n;
        else break;
    }
    // Floor: never decimate anything under CAP=40000 single-gear cost.
    // A real single-gear scene at CAP can never need decimation, so any
    // tuned budget below CAP would over-decimate. The 40k floor means:
    // "if this GPU is fast enough to draw CAP segments in 8 ms, never
    // decimate" — leaving room for future CAP increases.
    if (bestUnder < 40000) bestUnder = 40000;
    GESTURE_SEG_BUDGET = bestUnder;
    GESTURE_BUDGET_TUNED = true;
}
```

The call site is in `init()` (line 654), immediately after `R.init`:

```js
try { R.init(App.canvas); }
catch (e) { document.body.innerHTML = '...'; return; }

// One-time auto-tune of the gesture-draw segment budget to this device.
// Adds ~50-200 ms to first paint depending on GPU speed; the screen is
// still empty at this point (no scene yet loaded) so the user does not
// perceive the delay.
tuneGestureBudget();
```

`App.needsRender` is not yet set when `tuneGestureBudget` runs, so the
synthetic draws go straight to the default framebuffer and the cleared
background remains visible afterward — no flash, no leak. The 4-rep
minimum-`performance.now` measurement is stable enough for our
`GESTURE_FRAME_SLICE_MS` binary-search tolerance. A real device where
`R.seg` is the bottleneck (as it is here) will be measured accurately;
a device where the cost is shader-bound will be measured slightly
optimistically, but the 8 ms slice is a generous target so the error
is small.

**Why not also include a `R.dot` segment in the benchmark?** The gesture
draw path emits one end-cap dot per gear, not per segment, so its cost
is bounded by `App.allGears.length` (typically 1–4) and is negligible
relative to the segment stream. Omitting it keeps the benchmark tight
and predictable.

**Why use a coarse ramp, not a true binary search?** The cost-vs-N
relationship is non-linear due to `R.seg`'s `MAXVERT` early-return at
scratch-buffer overflow, and a 4-rep `performance.now` measurement
has ~0.1 ms quantization noise. A true binary search would re-measure
near boundaries; the coarse ramp just picks the largest step whose
mean is comfortably under `GESTURE_FRAME_SLICE_MS` and stops. Good
enough for our use — the budget is only used as a *threshold*; the
actual decimation cost is the same regardless of whether the threshold
is 60000 or 80000.

### C. `js/main.js` — event handlers

Remove the per-event invalidation that currently triggers the full rebake:

- `onMove` pan drag branch (line 407): delete
  `if (App.overlay.on) App.invalidateOverlay();`. Keep `App.requestRender()`.
- `onMove` pinch branch (line 395): same.
- `onWheel` (line 450): same.

Add one invalidation on gesture release so the FBO catches up at full
quality:

- `onUp` (line 415), inside the `pointers.size === 0` branch: add
  `if (App.overlay.on) App.invalidateOverlay();`.
- `onCancel` (line 432), same branch: same.

Wheel zoom has no native "end" event. The gesture-bypass path is already
cheap so no debounce is needed for performance. To keep quality from
freezing on a pure wheel user, the next pointer interaction (or any
`App.invalidateOverlay()` triggered by a gear-param change) will rebake
the FBO at the current view. See the "Wheel zoom" entry under Edge cases
for the full discussion and the optional `wheelend`-equivalent debounce
follow-up.

### D. `js/main.js` — `drawGearSegments` rewrite

The `Rseg`/`Rflush`/`RvCount`/`RmaxVert` locals are hoisted in section A
(after the `App` object literal). Use them here.

Rewrite `drawGearSegments` (line 470) as:

```js
function drawGearSegments(g, startK, endK, half) {
    var ring = g.ring;
    var cap = Gear.CAP;
    var head = g.head;
    var n = g.count - 1;
    var s = Math.max(0, startK), e = Math.min(endK, n);
    if (e <= s) return;

    var panX = App.view.pan[0], panY = App.view.pan[1];
    var S = App.S, cx0 = App.cx0, cy0 = App.cy0;

    var idxA = head + s, idxB = head + s + 1;
    if (idxA >= cap) idxA -= cap;
    if (idxB >= cap) idxB -= cap;
    var ax = ring[idxA * 5],     ay = ring[idxA * 5 + 1];
    var bx = ring[idxB * 5],     by = ring[idxB * 5 + 1];
    var ar = ring[idxA * 5 + 2], ag = ring[idxA * 5 + 3], ab = ring[idxA * 5 + 4];
    var br = ring[idxB * 5 + 2], bg = ring[idxB * 5 + 3], bb = ring[idxB * 5 + 4];

    for (var k = s; k < e; k++) {
        var s0x = cx0 + (ax + panX) * S;
        var s0y = cy0 - (ay + panY) * S;
        var s1x = cx0 + (bx + panX) * S;
        var s1y = cy0 - (by + panY) * S;

        Rseg(s0x, s0y, s1x, s1y, half, ar, ag, ab, br, bg, bb, 1);

        // dot per segment REMOVED — biggest single CPU win.
        // Flush headroom tightened from 200 to 8 (no dot verts).
        if (RvCount() > RmaxVert - 8) Rflush();

        ax = bx; ay = by;
        ar = br; ag = bg; ab = bb;
        idxA = idxB;
        if (++idxB >= cap) idxB = 0;
        bx = ring[idxB * 5]; by = ring[idxB * 5 + 1];
        br = ring[idxB * 5 + 2]; bg = ring[idxB * 5 + 3]; bb = ring[idxB * 5 + 4];
    }

    // keep the single end-cap dot for the final point (rounded tip)
    if (half >= 1.0 && e > s) {
        var ie = idxA;
        var ex = cx0 + (ring[ie * 5] + panX) * S;
        var ey = cy0 - (ring[ie * 5 + 1] + panY) * S;
        R.dot(ex, ey, half, ring[ie * 5 + 2], ring[ie * 5 + 3], ring[ie * 5 + 4], 1);
    }
}
```

Notes:
- The end-cap dot uses `idxA` (which after the last iteration holds the
  final ring index) instead of recomputing `(g.head + e) % Gear.CAP`.
- `Rseg`/`Rflush`/`RvCount`/`RmaxVert` are the hoisted locals from
  section A. `bakeOverlay` and the gesture/overlay-off paths all go
  through this same function, so the hoist pays off everywhere
  (including the steady-state animate path, which still draws the 1–2
  new segments per frame from `bakeOverlay(false)`).
- The pre-load + running-counter form keeps the loop branch-free on the
  ring index and removes two `%` ops per iteration.

### E. `js/render.js` — no changes required

The existing `R.seg`, `R.dot`, `R.flush`, `R.vCount`, `R.maxVert` API is
preserved. Only call sites in `main.js` change.

## Edge cases to verify after implementation

- Wheel zoom in whole mode: no FBO rebake mid-scroll; gesture-bypass stays
  active. Stop scrolling: `panning` and `pointers.size` are both already 0
  on the next frame, so `isGestureActive()` returns false and the steady-
  state FBO branch runs. Since no `invalidateOverlay()` was called for a
  pure wheel gesture, the FBO shows the *previously baked* trace (which
  was rendered at the view at the time of the last `onUp` invalidation).
  This means a wheel-only user sees the trace freeze in screen space
  until the next pointer-up rebake. Two recovery paths exist: (1) any
  subsequent `App.invalidateOverlay()` call (color/width/geom/mode change
  via `onGearParam`, scene reset, etc.) will rebake at the current view;
  (2) a single tap on the canvas will register as a pointer-up and
  trigger a rebake. If this is measured to be objectionable, add a
  `wheelend`-equivalent debounce timer (~150 ms after last wheel event)
  that calls `App.invalidateOverlay()`. Defer until measured.
- Pinch zoom (2 pointers): `pointers.size >= 2` keeps the bypass active for
  the full gesture. Both fingers up → `pointers.size === 0` → invalidate.
- Drag pan: `panning = true` keeps the bypass active. `onUp` clears
  `panning` and invalidates.
- Decimation threshold (auto-tuned at init): the actual `GESTURE_SEG_BUDGET`
  varies per device. On a fast desktop GPU the benchmark will pick
  `160000` (no decimation under 200k segs, which exceeds realistic scene
  sizes). On a low-end mobile GPU the benchmark will pick `32000` or
  lower, so any 2-pencil scene with `> 32k` total segs will be decimated.
  Force a specific value for debugging by setting
  `window.SPIRO_GESTURE_SEG_BUDGET` before `tuneGestureBudget` runs (the
  benchmark will skip if the value is already set). Verify by adding a
  one-time `console.log` of the tuned value in `tuneGestureBudget`.
- Decimation in animate-mode gesture: while panning, the sim keeps
  pushing new points (1–2 per frame). With `step = 2`, every other new
  point is skipped for the duration of the gesture. On gesture end,
  `bakeOverlay(false)` (now driven by the post-gesture invalidation)
  catches up by drawing the tail from `g.drawn` to the new head, so
  no points are permanently lost. The transient visual lag is at most
  ~2 frames of point density, well below the threshold of notice
  during a pan.
- Animate mode with overlay on and a long trace: gesture-bypass draws
  incrementally new segments via the same `drawGearSegments` call; identical
  to the existing FBO-off behavior, now cheap after dot removal.
- `App.overlay.on = false` (user-toggled): falls through to the bottom
  direct-draw branch in `renderScene` — same path as gesture, so behavior
  is unified.
- `App.drawTrails = false`: early-return branch is unchanged; gear skeleton
  and points still redraw every frame from `App.view` (cheap).
- Resize: `R.resize` calls `R.overlay.resize` which already invalidates
  implicitly via texture recreation; existing invalidation in `onWheel`
  was the only path needing change.
- `bakeOverlay(false)` "CAP-2 to CAP-1" call (line 581) still works with
  the rewrite: `e = min(CAP-1, n=CAP-1) = CAP-1`, loop runs once with the
  last two ring slots, end-cap dot is the final point. No regression.

## Files touched
- `js/main.js`: event handlers, `renderScene`, `drawGearSegments`, new
  `drawGearSegmentsDecimated`, new `tuneGestureBudget`, new
  `isGestureActive` + `GESTURE_SEG_BUDGET`, hoist `R.*` locals,
  `init()` calls `tuneGestureBudget` after `R.init`.

## Files NOT touched
- `js/render.js`: no API change.
- `js/gear.js`: no change.
- `js/gui.js`: no change (the "bake full figure (overlay)" checkbox keeps
  its current semantics — on uses FBO steady-state, off uses direct draw,
  both now share the optimized hot loop).

## Validation
- `node --check js/main.js` after edits.
- Load `index.html` in a browser; switch to whole mode; verify mode badge.
- On page load, observe the console (or a temporary `console.log` in
  `tuneGestureBudget`) to confirm the auto-tuned value. Cross-check
  against a manual timing of a 80k-segment direct draw in DevTools
  Performance.
- Pan with mouse drag: trace follows view smoothly; no FBO rebake per
  frame. At full CAP × 2 pencils, verify the gesture path is in the
  decimated branch (add a temporary `console.log` if needed) and stays
  under 16 ms/frame.
- Pinch on touch device (or browser devtools touch emulation): same.
- Wheel zoom: trace scales smoothly, no per-tick rebake.
- Release all pointers: one FBO clear + rebake (brief ~6-10 ms hitch, not
  perceptible because the pointer is already up).
- Animate mode idle: FBO incremental path still draws only new segments.
- Anim-speed slider in whole mode: color updates instantly via
  `recolorWhole`, no geometry recompute.
- Verify `R.dot` no longer appears in the segment loop by grepping
  `drawGearSegments` for `R.dot` — only the end-cap `R.dot` should remain.
- Test on at least one weak device (or Chrome DevTools "4× CPU
  slowdown" + a mobile-ish viewport) to confirm the auto-tuned budget
  actually triggers decimation.

## Open questions / future work
- **Release-rebake hitch.** Q's review also offers an optional
  `bakeOverlayChunked` that splits the post-gesture rebake across 2 frames
  (~3–5 ms each) so no single frame exceeds budget. Defer until the
  one-frame hitch is measured to be perceptible; the 6–10 ms cost is
  typically masked by the user's input release.
- **World-space FBO** (M3 Fix 5 / original Kilo plan). Render the trace
  once into an oversized FBO, then pan/zoom by sampling UVs with the
  view transform. Quality is bounded by FBO resolution (~683 px/world
  unit at 4096×4096 covering [-3,3]²). Out of scope for this plan.
