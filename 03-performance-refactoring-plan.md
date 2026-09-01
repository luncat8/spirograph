# Performance refactor plan (whole-mode pan/zoom + TODO items 2-4)

## Goal

1. Keep 60+ FPS during pan/zoom in both animate and whole modes when the trail is
   visible. Eliminate the per-frame full FBO rebake that runs on every pointer
   event, and harden the direct-draw path so scenes near the CAP=40000 ring
   budget stay under frame time on weak GPUs.
2. Whole mode must not re-render the finished figure every frame when nothing
   changed (restore the "keep geometry / raster overlay" behavior that was lost).
3. Color animation mode (cycles/frequency) becomes a single GLOBAL toggle
   (README TODO item 3).
4. Scene files save as JS modules (SETTINGS), `default.js` loads at startup
   (README TODO item 4).

README TODO item 1 (anim-speed slider in whole mode must rebuild color without
re-sampling geometry) is already implemented via `Gear.recolorWhole`; verified,
no change needed.

## Problem (verified against code, pre-change)

`js/main.js`:
- `onMove` pan drag, `onMove` pinch, `onWheel` each call `App.invalidateOverlay()`.
- `renderScene` then does `R.overlay.clear()` + `bakeOverlay(true)` on the next
  frame, re-walking every gear's full ring buffer and uploading ~6 verts per
  segment plus a 72-vert `R.dot` round-join disc per segment. With
  `Gear.CAP=40000` and 2 pencils that is ~3 M vertex pushes / frame.
- `drawGearSegments` inner loop uses `(g.head + k) % Gear.CAP` twice per
  iteration and looks up `R.seg`/`R.dot`/`R.flush`/`R.vCount`/`R.maxVert` and
  `App.*` on the global every call.
- Whole mode: `frame()` forced `needsRender = true` every frame, so the finished
  figure (FBO blit + skeleton) was redrawn 60×/s even when nothing changed.

## Approach (synthesized from `performance-review-M3` + `performance-review-Q`, refined during implementation)

Four wins, in priority order:

1. **Gesture-bypass FBO.** While an active pointer gesture is in progress
   (drag pan, pinch, or a wheel-zoom burst), skip the FBO entirely and draw the
   ring directly to the default framebuffer at the current view transform.
   Invalidate the FBO on gesture end so steady state resumes the cheap
   incremental path. Wheel zoom gets a `wheelActive` flag + 150 ms debounce so
   it behaves like a gesture (no native "wheel end" event exists).
2. **Decimation above an auto-tuned segment budget.** During the gesture, if
   total segment count across drawing gears exceeds `GESTURE_SEG_BUDGET`, stride
   through each ring and merge every N consecutive points into one segment so
   the trace stays continuous at reduced point count. The budget is auto-tuned
   at init by a one-time micro-benchmark (largest ring size the device can push
   inside an 8 ms slice). Decimation is active only for the gesture window; the
   next FBO rebake restores full quality.
3. **Drop the per-segment `R.dot` (72 verts = ~92 % of a rebake's vertex
   count), keep only the end-cap dot.** Refinement over the original plan: a
   join disc is still drawn where a segment turns sharply enough for the corner
   notch to be visible (`sin(turn) * half > 1.2 px`). Dense traces never
   trigger it; sparse thick traces keep their rounded joins. The test is
   sqrt-free (`cross² > len²·plen²·thr²`).
4. **Hot-loop cleanup.** Hoist `R.seg`/`R.flush`/`R.dot`/`R.vCount`/`R.maxVert`
   to module locals, hoist `App.view.pan`/`App.S`/`App.cx0`/`App.cy0` out of the
   loop, pre-load the first segment pair, and advance ring indices with a
   running counter instead of `(g.head + k) % Gear.CAP`.

Plus, from TODO item 2: whole mode is static once baked — `frame()` no longer
forces a render per frame; it renders only on invalidation (scene edits, view
changes, overlay toggles). Idle whole mode = 0 renders/s.

Rejected alternatives (unchanged from original plan):
- Kilo's UV-offset blit: visible edge artifact on pan from `CLAMP_TO_EDGE` and
  blur on small zooms. Q's direct draw is simpler and artifact-free.
- M3's debounced rebake: trail appears "frozen" during the gesture.
- Q's decimation-as-only-fix: wasteful on desktop; kept gated on the budget.

## Changes

### A. `js/main.js` — module-level hoist + gesture state

Immediately after the `App = {...}` literal:

```js
// hoisted renderer refs for the per-frame hot path (created once at init).
var Rseg = R.seg, Rflush = R.flush, Rdot = R.dot;
var RvCount = R.vCount, RmaxVert = R.maxVert;

// gesture-draw segment budget: auto-tuned at init by tuneGestureBudget() to
// the largest ring size this device can push inside GESTURE_FRAME_SLICE_MS.
// scenes exceeding it are decimated only while a pan/zoom gesture is active.
var GESTURE_SEG_BUDGET = 60000;      // provisional; replaced at init
var GESTURE_BUDGET_TUNED = false;
var GESTURE_FRAME_SLICE_MS = 8;      // target ms per frame for gesture draw
```

After the pointer state block:

```js
// view-change tracking: while a gesture (drag / pinch / wheel) is active the
// trail is drawn directly to screen at the live transform and the overlay
// FBO is re-baked once on release (see renderScene / onUp / onWheel).
var viewDirty = false;
var wheelActive = false;
var wheelTimer = 0;

function isGestureActive() {
	return panning || pointers.size >= 2 || wheelActive;
}
```

`viewDirty` is set by every pan/pinch/wheel view change and cleared when the
overlay is re-baked at the settled view (`renderScene` invalid branch), so a
plain tap never triggers a needless rebake.

### B. `js/main.js` — `renderScene` gesture branch

Inserted before the overlay branch:

```js
if (isGestureActive()) {               // gesture: draw ring directly at live view
	R.begin(BG);
	var pencilGears = 0, totalSegs = 0;
	for (var gi = 0; gi < App.allGears.length; gi++) {
		var gg = App.allGears[gi];
		if (!(gg.pencil.c1.on || gg.pencil.c2.on)) continue;
		pencilGears++;
		totalSegs += Math.max(0, gg.count - 1);
	}
	var decimate = totalSegs > GESTURE_SEG_BUDGET;
	var perGearBudget = Math.max(1, Math.floor(GESTURE_SEG_BUDGET / Math.max(1, pencilGears)));
	for (var gi = 0; gi < App.allGears.length; gi++) {
		var gg = App.allGears[gi];
		if (!(gg.pencil.c1.on || gg.pencil.c2.on)) continue;
		var half = Math.max(0.5, (gg.pencil.width / 2) * App.dpr);
		if (decimate) drawGearSegmentsDecimated(gg, half, perGearBudget);
		else drawGearSegments(gg, 0, gg.count - 1, half);
		R.flush();
	}
	drawGearOverlay();
	R.flush();
	if (App.showPoints) drawPenPoints();
	return;
}
```

Note: the original plan clamped `perGearBudget` to >= 1000, which silently
defeated small budgets (step stayed 1). Fixed to `Math.max(1, ...)`.

The overlay branch adds `viewDirty = false;` after `bakeOverlay(true)`.

### C. `js/main.js` — decimation helper

`drawGearSegmentsDecimated(g, half, perGearBudget)` merges every `step`
consecutive points into one segment; end-cap dot kept for the final visible
vertex; delegates to `drawGearSegments` when `step <= 1`. See the committed
source for the exact loop (ring-wrap safe: `head + k` can exceed CAP by at most
one CAP, so a single `-= cap` per index).

### C.1. `js/main.js` — auto-tune `GESTURE_SEG_BUDGET` at init

`tuneGestureBudget()` runs once in `init()` right after `R.init` (canvas still
blank; invisible to the user). Coarse ramp 8k → 200k segments through the exact
gesture path (`drawGearSegments` + `R.flush`), 4 reps each, keep the largest
sample under `GESTURE_FRAME_SLICE_MS` (8 ms). Honors a debug override
`window.SPIRO_GESTURE_SEG_BUDGET` (clamped >= 1000).

Deviation from the original plan: the budget floor is 10000, not 40000. The
40k floor would force full-quality (40 ms+) frames on weak GPUs whenever the
measured throughput is below CAP; the decimation path exists precisely to keep
those devices smooth. A fast desktop measures 128k+ and never decimates
regardless of the floor.

### D. `js/main.js` — `drawGearSegments` rewrite

Hot path shared by the overlay bake, the overlay-off fallback and the gesture
direct-draw. Pre-loads the first pair, keeps a running ring index, hoists the
transform, and draws a join disc only when the segment turns sharply:

```js
// previous segment direction (unnormalized) for the join test. no sqrt:
// sin(turn)^2 * len^2 * plen^2 > (1.2 px)^2  <=>  sin(turn)*half > 1.2 px.
var pdx = 0, pdy = 0, pLen2 = 0, havePrev = false;
var thr2 = half >= 1.0 ? 1.44 / (half * half) : Infinity;
```

Flush headroom stays at 200 verts (covers one segment + one join disc; the
original plan's 8 was too tight once the conditional disc exists). The end-cap
dot reuses the loop's final `ax/ay/ar/ag/ab` (point `endK`) instead of
recomputing `(g.head + e) % Gear.CAP`.

Why the conditional join disc is safe (perf): for a closed curve the total
turn is bounded (~turns × 360°), so a sharp per-segment turn implies a sparse
ring — the disc cost is proportional to how few segments there are. Dense
rings (the expensive case) can never exceed the threshold.

### E. `js/main.js` — event handlers

- `onMove` pan/pinch: `App.invalidateOverlay()` removed, `viewDirty = true`
  kept alongside `App.requestRender()`.
- `onUp` / `onCancel` (`pointers.size === 0`): if `viewDirty`, invalidate the
  overlay once and clear the flag.
- `onWheel`: sets `viewDirty`, `wheelActive = true`, restarts a 150 ms timer
  that clears `wheelActive` and invalidates the overlay (the "wheel end"
  equivalent). Removes the per-tick invalidation.

### F. TODO item 3 — global color mode (cycles / frequency)

- `App.colorMode` ('frequency' | 'cycles') on the App object; `defaultAnimMode`
  unchanged ('frequency' in animate, 'cycles' in whole).
- `applyColorMode()` syncs every pencil's `animMode` to `App.colorMode`
  (per-pencil field kept for legacy file compat).
- `App.setColorMode(m)`: whole mode → `Gear.recolorWhole` + overlay rebake
  (color-only, no geometry resample); animate mode → `markDirty` only (colors
  are baked per point; new points only).
- `App.setMode` auto-applies the mode default; `addSubGear`, `resetScene`,
  `loadObject` and `init` re-sync pencils.
- `loadObject`/`init` derive `colorMode` for legacy files: explicit field →
  the mode all pencils agree on → mode default (`colorModeFromScene`).
- `js/gui.js`: the per-pencil cycles/frequency buttons in the context menu are
  REMOVED (the anim-speed slider stays; its prefix follows the global mode:
  'hue/sec ' / 'cycles ' in animate, 'hue cycles ' in whole). The main panel
  gets a 'color mode' row with `cycles` / `frequency` buttons
  (`GUI.setColorMode`).
- `js/gear.js`: `serialize`/`deserialize` carry a top-level `colorMode` field
  (default 'frequency' for legacy files).

### G. TODO item 4 — JS scene files + default.js

- `App.downloadScene` now writes `spirograph.js` — a node-friendly IIFE
  exposing `SETTINGS` (exact pattern from the README example), pretty-printed
  JSON inside. Clipboard copy stays JSON.
- `App.loadFile` accepts `.js` and `.json`; `loadSceneText()` sniffs: leading
  `{`/`[` → JSON, otherwise evaluates the text in a throwaway `<script>` tag
  (file:// friendly) and reads `window.SETTINGS`. `App.loadClipboard` uses the
  same loader.
- `index.html` loads `<script src="default.js"></script>` before `main.js`.
  `init()` falls back to `window.SETTINGS` (if it has `gears`) when there is no
  autosave, then to the built-in `Gear.defaultScene()`.
- A `default.js` is shipped (the scene previously committed as `js/default.js`,
  now a proper SETTINGS module at the repo root; the raw-JSON file in `js/`
  is removed). Saving a scene and renaming it to `default.js` next to
  `index.html` makes it the startup scene.

### H. `js/render.js` — no changes

Existing `R.seg`, `R.dot`, `R.flush`, `R.vCount`, `R.maxVert` API preserved;
only call sites in `main.js` change.

## Edge cases (verified)

- **Wheel zoom, whole mode**: gesture-bypass stays active during the burst
  (150 ms debounce), then a single FBO rebake at the settled zoom. No frozen
  trace, no per-tick rebake.
- **Pinch (2 pointers)**: `pointers.size >= 2` keeps the bypass active for the
  full gesture; release invalidates once. One finger remains → panning
  continues (existing behavior), final release invalidates.
- **Drag pan**: `panning` keeps the bypass active; `onUp` invalidates once.
- **Tap (no movement)**: `viewDirty` is false → no rebake hitch on menu-open.
- **Decimation threshold**: auto-tuned per device; debug via
  `window.SPIRO_GESTURE_SEG_BUDGET`. Verified in the node harness that a small
  budget halves the drawn segments during a gesture and that the release
  rebake restores full quality.
- **Animate mode during a gesture**: sim keeps pushing points; the bypass
  draws the live ring each frame (decimated if over budget). On release the
  full rebake catches everything up — no points lost.
- **Overlay off**: falls through to the direct-draw branch — same path as the
  gesture, behavior unified.
- **`drawTrails` off**: early-return branch unchanged.
- **Resize**: `R.resize` recreates the FBO texture (implicit invalidation).
- **Whole mode idle**: `frame()` no longer sets `needsRender` in whole mode;
  after the initial bake the app renders 0 frames until an invalidation.
- **Ring-wrap indices**: unit-tested for `head = CAP-2` chains (segments
  crossing the ring seam), partial ranges, single segments, empty rings, and
  full-CAP decimated rings.
- **Join-disc gating**: unit-tested — 90° turn at width 4 draws the join disc,
  ~3° turn at width 12 does not, half < 1 draws no discs at all.

## Files touched

- `js/main.js`: hoists + gesture state, `renderScene` gesture branch,
  `drawGearSegments` rewrite, `drawGearSegmentsDecimated`,
  `tuneGestureBudget`, event handlers (`onMove`/`onUp`/`onCancel`/`onWheel`),
  `frame()` whole-mode idle skip, global color mode (`colorMode`,
  `setColorMode`, `applyColorMode`, `colorModeFromScene`), JS scene
  save/load (`sceneJs`, `loadSceneText`, `downloadScene`, `loadFile`,
  `loadClipboard`), `init()` (tune call, `default.js` fallback, color-mode
  sync).
- `js/gui.js`: global 'color mode' toggle row, per-pencil cycles/frequency
  toggle removed from the context menu, `GUI.setColorMode`,
  `GUI.refreshAnimMode` simplified to the slider prefix.
- `js/gear.js`: `serialize`/`deserialize` carry `colorMode`.
- `index.html`: `<script src="default.js"></script>`.
- `default.js` (new): SETTINGS module, startup fallback scene.
- `js/default.js` (removed): raw JSON, previously dead.

## Files NOT touched

- `js/render.js`: no API change.

## Validation

- `node --check` on all js files.
- Node harness (`/tmp/spiro_test/`): boots the real app on a DOM/WebGL shim —
  init, default.js startup scene, frame loop, pan/wheel/pinch events, keyboard
  shortcuts — no exceptions; gesture frames draw direct; release rebakes once.
- Node unit harness: extracts the real `drawGearSegments` /
  `drawGearSegmentsDecimated` sources and asserts segment endpoints, per-point
  colors, join/end-cap gating, ring wraps, decimation merging; gear.js
  roundtrips `colorMode`, `recolorWhole` reproduces `computeWhole` colors, ring
  overflow keeps the newest point.
- Browser (manual): whole mode — pan/zoom at full CAP × 2 pencils stays under
  frame budget; wheel zoom ends with one rebake; idle whole mode shows 0
  renders; color-mode toggle recolors whole-mode figure without resampling;
  save produces `spirograph.js`; renaming it `default.js` makes it the startup
  scene.

## Open questions / future work

- **Release-rebake hitch**: the one-frame full rebake on gesture end is
  typically masked by the pointer release; a chunked 2-frame bake
  (`bakeOverlayChunked`) remains a possible follow-up if it ever measures
  perceptible.
- **World-space FBO**: render the trace once into an oversized FBO and pan/zoom
  by sampling UVs; quality bounded by FBO resolution. Out of scope.
