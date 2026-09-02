# Plan: sub-gear level sliders, symmetry mode, per-pencil trail length, and global period threshold

### draft

to add sliders to left sidebar menu to spawn multiple gears by level
move slider set number of subgears to N. and position them around using  360/N
initially 1 slider. if subgears present - add more sliders for next level.
example
i set slider to 3 - it create 3 gears (120deg) and new slider2
i set slider2 to 4. then for all of 3 parent gears it create 4 subgears ( 90 deg)

Symmetry mode: changing one subgear apply same settings to all same level subgears (i.e. level 2)
When symmetry mode is ON, to simplify and avoid confusion it should work same as move slider (you may bind them when symmetry is on) - add or remove from whole level and keep all in sync

in animate mode - trail length slider  . per pencil. but ensure in symmetry mode it apply to all of same sub-level
in 'whole' mode - period threshold (to skip very long periods). global slider in sidebar.



## goal

Four additions to the spirograph UI:

1. **Level sliders** in the sidebar (lvl 1..N) that grow the gear tree in
   radial symmetry. Always show `lvl 1`; show `lvl k` for k>1 iff any
   depth-`k-1` parent has children. Value N = every parent at that level
   has exactly N children at `i * 360/N` degrees.
2. **Symmetry mode** (single global checkbox in the sidebar). When ON,
   per-gear menu edits mirror to every other gear at the same depth, and
   `add sub-gear` bumps the L slider for that parent's level.
3. **Per-pencil trail length** slider in the per-gear context menu. Sets
   a soft cap on stored trace points (range 500..40000, default 20000).
   With symmetry ON, mirrors to same-depth siblings.
4. **Global period threshold** slider in the sidebar. When the detected
   (uncapped) period in whole mode exceeds the threshold, the bake is
   skipped and a toast notifies the user. Default 2000 turns = today's
   behavior on any scene that fits.

## locked decisions

### level sliders + symmetry

- **Per-sub-gear template** (L slider grow, and `add sub-gear` with sym
  ON): deep-clone the first existing child. If no first child, use the
  **existing** `App.addSubGear` defaults verbatim (`r = max(0.05,
  parent.r*0.45)`, `internal = true`, `speed = 0.3`, `pencil.d = parent.r
  * 0.2`, `c1.on=true, c1.color='#ffffff', c2.on=false`,
  `animMode = App.colorMode`).
- **`add sub-gear` (sym OFF)**: keeps existing defaults unchanged. Both
  the button and the L slider's no-template path share one recipe via
  `makeChildFromTemplate(parent, template, rot)`.
- **Decreasing N**: `parent.children.length = N`.
- **Cascade depth**: unlimited. `.lvl-indent` CSS for levels > 1.
- **Symmetry scope**: ALL context-menu fields — `r`, `speed`,
  `internal`, `pencil.d`, `pencil.width`, `pencil.c1.{on,color}`,
  `pencil.c2.{on,color}`, `pencil.animSpeed`, plus the new
  `trailCap`.
- **Symmetry granularity**: one global checkbox, mirrors by **depth**
  (not parent). Skips `rot`/`phase`.
- **Whole-mode + symmetry**: per-sibling `onGearParam` call so
  `recolorWhole` / `recomputeWhole` / `invalidateOverlay` fire.
- **`clearTrace` in mirror**: only for `'geom'` and `'color'`
  (stale geometry or color). Skip for `'width'` and `'trail'`
  (no impact on existing points).

### trail length (per pencil)

- **Units**: points stored per pencil. Slider range 500..40000 step
  500. Default 20000. Stored as `gear.trailCap`.
- **Storage**: the per-pencil `Float32Array(CAP * 5)` ring buffer is
  allocated at `Gear.initRuntime` time at the **hard** cap (`Gear.CAP =
  40000`). The slider sets a **soft** cap; `pushPoint` wraps when
  `count >= gear.trailCap` instead of `count >= Gear.CAP`. No
  reallocation on slider drag.
- **Shrink semantics**: evict oldest (reuse the existing
  `head = (head + 1) % CAP` ring-eviction branch in
  `js/gear.js:113-114`).
- **Symmetry**: `applySymmetry` adds a new `'trail'` kind that copies
  `gear.trailCap` to siblings. No `clearTrace`.
- **`onGearParam('trail')`**: no resample. In animate mode, `markDirty`.
  In whole mode, also `markDirty` (do NOT call `recomputeWhole` —
  `trailCap` doesn't affect whole-mode sampling because
  `computeWhole` pushes exactly `sampleCount` points, which is
  always <= `Gear.CAP - 1`).

### period threshold (global)

- **Units**: max period in turns. Slider range 50..2000 step 50,
  default 2000 (matches today's `MAX_TURNS`).
- **Behavior on exceed**: `App.recomputeWhole` checks the **uncapped**
  LCM against `App.periodThreshold`. If exceeded, return early with
  a toast. Existing trace stays on screen.
- **Detect-period change**: `Gear.detectPeriod` returns BOTH the
  capped `turns` (existing field, used by the bake's
  `sampleCount = turns * 200`) AND a new `turnsRaw` (the uncapped
  LCM). The internal `MAX_TURNS` cap stays as a hard ceiling so the
  LCM walk doesn't blow up; the threshold check uses `turnsRaw`.
- **Wire**: `MAX_TURNS` is unchanged inside `gear.js` (defensive
  ceiling). The user-facing threshold is the new authoritative value.
  The `capped` flag (returned by `detectPeriod` when the LCM
  exceeded `MAX_TURNS`) is preserved in the period-line readout.

## files touched

- `js/main.js` — helpers, `App.applyLevel`, `App.applySymmetry`,
  `App.symmetry`, `App.maxDepth`, `App.depthOf`,
  `App.siblingsAtDepth`, `App.periodThreshold`;
  `makeChildFromTemplate`; refactor `addSubGear`; wire
  `GUI.rebuildLevels` from `resetScene` / `addSubGear` /
  `removeGear` / `loadObject`; `App.setPeriodThreshold`;
  modify `App.recomputeWhole` to honor threshold; add `'trail'`
  case to `App.onGearParam`.
- `js/gear.js` — `gear.trailCap` field on `makeGear`; `pushPoint`
  honors `gear.trailCap`; `detectPeriod` returns `turnsRaw`;
  `serializeGear` carries `trailCap`.
- `js/gui.js` — `levelsHost` + `symRow` + `periodThresholdSlider` in
  `buildPanel`; per-pencil `trail length` slider at the end of
  `openMenu`; `GUI.rebuildLevels`; bind `add sub-gear` to L slider
  when sym ON; insert `app.applySymmetry(gear, kind)` before each
  `app.onGearParam` in `openMenu` (10 call sites).
- `index.html` — one new CSS rule `.lvl-indent`.
- `implementation-log.txt` + `CHANGELOG.md` — short note.

No changes to `js/render.js`.

## implementation tasks

All tabs, LF endings, no new comments, no per-frame allocations.

### task 1 — `js/main.js`: tree helpers + state

- `App.symmetry = false`
- `App.periodThreshold = 2000`  (initial value matches current
  `MAX_TURNS`)
- `App.maxDepth(roots)` — walk, return deepest depth with any
  children. 0 = no sub-gears.
- `App.depthOf(roots, gear)` — walk, return depth or -1.
- `App.siblingsAtDepth(roots, depth)` — walk, return flat list.

### task 2 — `js/main.js`: `makeChildFromTemplate(parent, template, rot)`

```js
function makeChildFromTemplate(parent, template, rot) {
  var opts;
  if (template) {
    opts = {
      r: template.r,
      speed: template.speed,
      internal: template.internal,
      pencil: {
        d: template.pencil.d,
        width: template.pencil.width,
        c1: { on: template.pencil.c1.on, color: template.pencil.c1.color, _hex: null, _rgb: null },
        c2: { on: template.pencil.c2.on, color: template.pencil.c2.color, _hex: null, _rgb: null },
        animSpeed: template.pencil.animSpeed,
        animMode: template.pencil.animMode
      }
    };
  } else {
    opts = {
      r: Math.max(0.05, parent.r * 0.45),
      speed: 0.3,
      internal: true,
      pencil: { d: parent.r * 0.2, width: 2, c1: { on: true, color: '#ffffff' }, c2: { on: false, color: '#ff8a3d' } }
    };
  }
  var child = Gear.makeGear(opts);
  child.pencil.animMode = App.colorMode;
  child.trailCap = 20000;            // default (task 11)
  child.rot = rot;
  parent.children.push(child);
  Gear.initRuntime(child, parent);
  Gear.update(child, parent, parent.cx, parent.cy,
    parent.phase != null ? parent.phase : parent.rot, 0, App.globalSpeed);
  return child;
}
```

### task 3 — `js/main.js`: refactor `App.addSubGear`

Replace the body of `App.addSubGear` (`js/main.js:254-271`) with:

```js
App.addSubGear = function (parent) {
  var child = makeChildFromTemplate(parent, null, 0);
  rebuildAll();
  afterSceneChange();
  var sc = w2s(child.cx, child.cy);
  GUI.openMenu(child,
    (sc.x / App.dpr) + App.canvas.getBoundingClientRect().left,
    (sc.y / App.dpr) + App.canvas.getBoundingClientRect().top);
};
```

Bit-for-bit identical to today's `addSubGear`.

### task 4 — `js/main.js`: `App.applyLevel(level, n)`

1. Walk tree; collect parents at depth `level-1` into `parents[]`.
2. For each parent, set `parent.children.length` to N:
   - **Grow** (`old < N`): template = `parent.children[0] || null`;
     for `i in [old..N-1]`,
     `makeChildFromTemplate(parent, template, (i * 2*Math.PI) / N)`.
   - **Shrink** (`old > N`): `parent.children.length = N`.
3. `rebuildAll()`, `afterSceneChange()`.
4. `GUI.rebuildLevels()`.

### task 5 — `js/main.js`: `App.applySymmetry(gear, kind)`

When `App.symmetry === false`: return.

Otherwise:
- `depth = App.depthOf(App.roots, gear)`; bail if -1.
- `sibs = App.siblingsAtDepth(App.roots, depth)`.
- For each `s !== gear`:
  - `'geom'`: `s.r = gear.r; s.speed = gear.speed; s.internal = gear.internal;`
    then `Gear.clearTrace(s)`.
  - `'width'`: `s.pencil.width = gear.pencil.width;` (no clearTrace).
  - `'color'`: replace `s.pencil.c1`, `s.pencil.c2`, copy
    `s.pencil.animSpeed` from `gear.pencil` (slot recipe as in
    task 2); then `Gear.clearTrace(s)`.
  - `'trail'`: `s.trailCap = gear.trailCap;` (no clearTrace).
- After the field copy, call `App.onGearParam(s, kind)` so the
  existing whole-mode recolor/resample path fires.

### task 6 — `js/main.js`: `App.onGearParam` accepts `'trail'`

Extend the dispatch in `App.onGearParam` (`js/main.js:181-192`) to
add a `'trail'` case that just calls `markDirty()` in both animate
and whole mode (no resample, no recolor — see locked decisions).

### task 7 — `js/main.js`: `App.setPeriodThreshold` + `recomputeWhole`

```js
App.setPeriodThreshold = function (v) {
  App.periodThreshold = v;
  if (App.mode === 'whole') App.recomputeWhole();
};
```

Modify `App.recomputeWhole` (`js/main.js:169-179`):

```js
App.recomputeWhole = function () {
  if (App.mode !== 'whole') return;
  snapAllSpeeds();
  var period = Gear.detectPeriod(App.roots);
  App.currentPeriod = period;
  if (period.turnsRaw > App.periodThreshold) {
    toast('period ' + period.turnsRaw + ' > threshold ' + App.periodThreshold + ' (bake skipped)');
    GUI.setPeriod(period.turns, period.capped);
    return;
  }
  var sampleCount = Math.max(2, Math.min(Math.round(period.turns * 200), Gear.CAP));
  Gear.computeWhole(App.roots, period, sampleCount);
  if (App.overlay.on) App.invalidateOverlay();
  else markDirty();
  GUI.setPeriod(period.turns, period.capped);
};
```

### task 8 — `js/gear.js`: `detectPeriod` returns `turnsRaw`

In `detectPeriod` (`js/gear.js:202-223`), add the uncapped value
to the returned object. Replace the `return` at line 222 with:

```js
var turnsRaw = u;
var capped = false;
if (u > MAX_TURNS) { u = MAX_TURNS; capped = true; }
return { u: u, P: 2 * Math.PI * u, turns: u, turnsRaw: turnsRaw, capped: capped };
```

`turns` stays the capped value (used by the existing `sampleCount`
calc and the period-line readout). `turnsRaw` is the true LCM
(used by the threshold check).

### task 9 — `js/gear.js`: `trailCap` field

- `makeGear` (`js/gear.js:42-58`): add `trailCap: opts.trailCap !=
  null ? opts.trailCap : 20000`.
- `initRuntime` (`js/gear.js:73-83`): no change. The ring buffer
  stays at `CAP * 5`. `trailCap` is preserved across `initRuntime`
  calls because `makeGear` already set it.
- `pushPoint` (`js/gear.js:99-115`): change
  `if (gear.count < CAP) gear.count++;` to
  `if (gear.count < (gear.trailCap || 20000)) gear.count++;
   else gear.head = (gear.head + 1) % CAP;`
- `serializeGear` (`js/gear.js:410-425`): add `trailCap:
  gear.trailCap`.
- `deserializeGear` (`js/gear.js:427-431`): no change (passes opts
  through to `makeGear`).

### task 10 — `js/gui.js`: sidebar additions

In `buildPanel`, after the `glow points` row + help (line 155-157)
and before the `scene` sub-section (line 159). New structure:

```js
panel.appendChild(el('div', 'sub', 'tree'));
panel.appendChild(checkboxRow('symmetry mode', App.symmetry, function (v) {
  App.symmetry = v;
}));
panel.appendChild(el('div', 'help',
  'When ON, menu edits apply to every sibling at the same level. Add-sub-gear grows the whole level.'));
panel.appendChild(levelsHost);
panel.appendChild(el('div', 'btns').appendChild(buttonRow('reset levels', ...)) ...);
panel.appendChild(el('div', 'help',
  'lvl k = uniform child count for every parent at that depth. Positions are i * 360/N degrees.'));

panel.appendChild(el('div', 'sub', 'whole mode'));
panel.appendChild(sliderRow('period threshold', 50, 2000, 50, App.periodThreshold,
  function (v) { app.setPeriodThreshold(v); }));
panel.appendChild(el('div', 'help',
  'Skip the bake when the period exceeds this many turns.'));
```

`GUI.rebuildLevels()`:
1. Empty `levelsHost`.
2. `maxD = App.maxDepth(App.roots)`.
3. For `L = 1..max(maxD+1, 1)` (always render L1):
   - `n` = (L===1) `App.roots[0].children.length` else "child count
     of the first parent at depth L-1 that has any children, else 1."
   - Build via existing `sliderRow('lvl ' + L, 1, 12, 1, n, cb)`.
     Add `.lvl-indent` to the wrap for L>1.
   - `cb(v)`: `App.applyLevel(L, v)`.
4. If `maxD > 0`, append a "reset levels" button that iterates
   `L = 1..maxD`, calling `App.applyLevel(L, 1)`.

### task 11 — `js/gui.js`: bind `add sub-gear` to L slider when sym ON

Replace the button at `js/gui.js:267`:

```js
gb.appendChild(buttonRow('add sub-gear', function () {
  if (app.symmetry && gear.children.length > 0) {
    var depth = app.depthOf(app.roots, gear);
    if (depth >= 0) app.applyLevel(depth + 1, gear.children.length + 1);
  } else {
    app.addSubGear(gear);
  }
}));
```

### task 12 — `js/gui.js`: insert `applySymmetry` in menu handlers

In `openMenu` (`js/gui.js:215-272`), insert
`app.applySymmetry(gear, 'kind');` *before* each
`app.onGearParam(gear, 'kind');`. 10 call sites: internal, diameter,
speed, pencil d, pencil width, c1 on, c1 color, c2 on, c2 color,
anim speed, plus the new trail-length row (task 13).

### task 13 — `js/gui.js`: per-pencil trail-length slider in context menu

In `openMenu`, append AFTER the existing `anim speed` row (line
264) and BEFORE the buttons row (line 266):

```js
menu.appendChild(sliderRow('trail length', 500, Gear.CAP, 500,
  gear.trailCap, function (v) {
    gear.trailCap = v;
    app.applySymmetry(gear, 'trail');
    app.onGearParam(gear, 'trail');
  }));
menu.appendChild(el('div', 'help',
  'soft cap on stored points per pencil. global period threshold is in the sidebar.'));
```

`Gear.CAP` (40000) is the upper bound. `applySymmetry('trail')` is
a no-op when sym is OFF. `onGearParam('trail')` calls `markDirty`
in both modes (task 6).

### task 14 — `js/main.js`: wire `GUI.rebuildLevels`

Add `if (GUI.rebuildLevels) GUI.rebuildLevels();` at the end of:
- `App.resetScene` (line 252)
- refactored `App.addSubGear` (task 3)
- `App.removeGear` (line 281)
- `App.loadObject` (line 388)

`App.applyLevel` already calls it (task 4, step 4).

### task 15 — `index.html`: CSS

Append inside the existing `<style>` block:

```css
.lvl-indent { padding-left: 10px; }
```

### task 16 — `implementation-log.txt` + `CHANGELOG.md`

Append a "done (0.5.0)" heading:

- Level sliders (lvl 1..N) with first-child clone template.
- Symmetry mode (global checkbox) mirrors every context-menu edit
  to all same-depth siblings; per-sibling `onGearParam` keeps
  whole mode valid.
- Per-pencil trail length slider (context menu), default 20000.
  Mirrored by symmetry mode.
- Global period threshold slider (sidebar), default 2000. Skips
  the whole-mode bake when the uncapped LCM exceeds it.
- `node --check` clean on all four js files.

`CHANGELOG.md`: a `0.5.0` section summarising the above.

## failure modes / edge cases

- **Slider range mismatch** (saved scene with 5 children somewhere):
  slider reads 5; shrinking truncates.
- **Non-uniform tree**: L slider is a uniforming tool.
- **N=1 with already-singular parents**: structural no-op; the
  single child's `rot` is not reset.
- **Whole-mode snap**: `applyLevel` does not change `speed` on
  existing siblings.
- **Period blow-up**: 12×12 = 144 sub-gears; slider max 12
  bounds it; gesture segment budget auto-decimates if needed.
- **Symmetry on root with L1=1**: `siblingsAtDepth(0)` is
  `[the_root]`; loop skips `gear` itself.
- **Symmetry on a removed gear**: `remove` is a button, not a
  field-edit handler; sym does not run on remove.
- **Symmetry does NOT mirror `rot`/`phase`**.
- **Shared `_hex`/`_rgb` cache aliasing**: avoided by fresh slot
  objects in tasks 2 and 5.
- **Trail length shrink**: oldest points are evicted; the
  recent trail is preserved. The ring is already at
  `CAP * 5` so no reallocation.
- **Trail length `CAP` upper bound**: the slider's `max` is
  `Gear.CAP` (40000), so it can never exceed the hard ring
  size. `pushPoint`'s cap-check is `gear.trailCap || 20000`
  with a fallback to the default for safety.
- **`onGearParam('trail')` in whole mode**: just `markDirty`,
  no resample. `trailCap` doesn't affect whole-mode sampling.
- **Period threshold exceed (uncapped LCM)**: `recomputeWhole`
  returns early. Existing trace stays on screen. User sees a
  toast. Next mode toggle or scene edit retries.
- **`MAX_TURNS` in `gear.js`**: kept as a hard upper bound
  inside `detectPeriod` so the LCM walk doesn't blow up on
  pathological inputs. The user-facing threshold is at the
  `App.recomputeWhole` layer.
- **Period threshold slider while in animate mode**:
  `setPeriodThreshold` updates `App.periodThreshold` and
  re-runs `recomputeWhole` only if `App.mode === 'whole'`.
- **Hot path**: untouched. All new functions run only on user
  input.
- **Multiple roots from a saved scene**: L1 slider reads
  `App.roots[0].children.length`; applying equalizes across
  all roots.
- **`addSubGear` `Gear.update` post-creation**: preserved by
  `makeChildFromTemplate`.
- **Init order**: `GUI.init(App)` runs after `App.roots` is
  set; `buildPanel` calls `GUI.rebuildLevels` at the end so
  the panel renders correctly from the first paint.
- **Symmetry mirror cost**: 12 same-level siblings = 12
  `onGearParam` calls. In whole mode, each may trigger a
  `recolorWhole` or `recomputeWhole`. This is a one-time
  user action, not per-frame. Acceptable.

## validation

- `node --check js/main.js js/gui.js js/gear.js` (existing
  convention).
- Manual smoke:

  **Level sliders**:
  1. Default scene: drag L1 to 3 — three roots at 0/120/240
     deg with white sub-gears; L2 appears. Drag L2 to 4 —
     every root grows 4 sub-gears at 0/90/180/270 deg.
  2. Drag L1 back to 1 — tree collapses; L2 disappears.
     "reset levels" does the same.
  3. Drag L1 to 5. Click a child, recolor to red, set speed
     to 0.3. Drag L1 to 2 (first child kept). Drag L1 to 5 —
     kept child keeps red+0.3; new siblings are deep-clones.
  4. Whole mode with L1=3, L2=2 — period finite, no seam.
  5. Save (d) → reload — slider layout restored from tree.

  **Symmetry mode**:
  1. L1=2, sym OFF. Edit root A's diameter — only A changes.
  2. Sym ON. Edit root A's diameter — both resize.
  3. L1=2, L2=3, sym ON. Recolor a level-2 sub-gear — all
     6 turn red; level-1 untouched.
  4. Edit a level-3 sub-gear's speed — all level-3 siblings
     sync.
  5. Sym OFF, recolor a level-2 sub-gear — only the clicked
     one changes.
  6. L1=1, sym ON. Edit the single root — no error.

  **Whole mode + symmetry**:
  1. L1=2, L2=3, whole mode, sym ON. Edit a level-2
     sub-gear's speed — all 6 resample; period updates; no
     seam.

  **Add-button binding (sym ON)**:
  1. L1=3, sym ON. Click a root, `add sub-gear` → L1 slider
     bumps to 4; all 3 roots grow a new sibling (deep-clone).
  2. Sym OFF → only the clicked parent grows by one.

  **Trail length (per pencil)**:
  1. Open any gear's context menu; drag `trail length` to
     1000. Animate mode: existing trace shrinks to ~1k
     points (oldest evicted). Drawing continues.
  2. Open a different gear; its `trail length` is the
     default 20000 — independent per pencil.
  3. Sym ON. Open a level-2 sub-gear, set trail length to
     3000 → all 6 level-2 sub-gears show 3000; level-1
     roots unchanged.
  4. In whole mode, change `trail length` — no resample,
     no toast, just `markDirty`. Existing whole-mode trace
     stays.

  **Period threshold (global)**:
  1. Drag `period threshold` to 100. Switch to whole mode
     with the default scene (uncapped period ~1100 turns
     after snap). Toast: "period 1100 > threshold 100
     (bake skipped)". Existing trace stays.
  2. Drag threshold to 2000. The bake runs; the figure
     re-renders.
  3. Symmetry does NOT affect the period threshold.

  **Context-menu / slider coexistence**:
  1. Right-click a child, `remove` → slider count drops.
  2. Add a sub-gear manually with sym OFF → slider count
     bumps; sym does not propagate.

## out of scope (explicitly)

- Per-level symmetry checkboxes.
- Animated slider grow.
- Persisting slider state across reloads (tree shape is the
  source of truth).
- Hard level-depth cap.
- Mirror of `rot` / `phase`.
- Per-slider controls for the new siblings' r / speed /
  internal.
- Per-pencil period threshold (period detection is a
  whole-tree walk; the sidebar global is enough).
- Trail length as a percent or in seconds (points are the
  natural unit and match the existing ring buffer).

## amendments (review pass, pre-implementation)

Verified against the code at 2bdcec3 with node probes. Six
defects fixed, plus smaller items; everything else stays as
decided above.

1. **applyLevel re-spaces kept children.** The draft assigns
   `rot = i*2π/N` only to NEW children, but `rot` drifts every
   frame (`update` advances it; a whole bake leaves
   `rot = speed·phi`), so a plain 1→3 grow puts the kept child
   off-grid (measured: child.rot = 1.52 after 3.7 s) and the
   level is visibly uneven. Grow AND shrink now set
   `children[i].rot = i*2π/N` for every kept child and
   `clearSubtree` any child whose rot actually moved (whole mode
   re-bakes anyway). The slider becomes deterministic: same N ⇒
   same layout, and N→M→N round-trips. `applyLevel` also clamps
   n to 1..12 (the slider bounds) so the sym-ON add-button
   cannot push a level past what the slider can display.
2. **`rot` is serialized.** `serializeGear` never carried `rot`,
   so a saved radial layout reloaded with every child at rot 0 —
   all siblings overlapping. `makeGear` reads `opts.rot`,
   `initRuntime` zeroes it only when null, `serializeGear` writes
   it. Legacy files (no rot) behave exactly as today.
3. **applySymmetry mirrors fields only; ONE onGearParam.** The
   plan called `onGearParam(s, kind)` per sibling, but in whole
   mode each of those runs the same tree-global
   `recomputeWhole`/`recolorWhole` — N redundant full bakes per
   slider input event. The single existing
   `onGearParam(gear, kind)` call already repaints the whole
   tree. Corrections while here: `'geom'` also copies
   `pencil.d` (the pencil-d slider dispatches kind `'geom'`;
   the plan's field list missed it — it would not have
   mirrored); `'geom'` clears with `clearSubtree` (matching
   `onGearGeom`, gears may have children), not `clearTrace`;
   `'color'` clears nothing (the single-gear animate path does
   not clear on color edits — stay consistent).
4. **Whole mode bypasses the trail soft cap; lowering the cap
   trims the ring.** Two related bugs:
   (a) task 9's `count >= trailCap` check would truncate any
   whole bake with sampleCount+1 > trailCap down to the newest
   points — an open arc instead of a closed figure (the plan's
   "sampleCount <= CAP-1" reasoning compares against the wrong
   cap). `pushPoint(gear, x, y, col, limit)` gains an optional
   limit; `computeWhole` passes `Gear.CAP`, animate defaults to
   `gear.trailCap`.
   (b) verified: lowering trailCap NEVER shrinks `count` (the
   eviction branch holds count at the cap only while it is
   already there — count 3000 with cap 500 stays 3000), so the
   plan's validation case "trace shrinks to ~1k points" fails.
   New `App.setTrailCap(gear, v)` clamps the value 1..CAP and,
   in animate mode only, drops the oldest
   `(count - trailCap)` points. Symmetry `'trail'` mirrors via
   `App.setTrailCap` so siblings trim too.
   `onGearParam('trail')` invalidates the overlay in animate
   mode (a bake that keeps evicted pixels is wrong) and plain
   `markDirty` otherwise.
5. **rebuildLevels updates rows in place.** Task 4 step 4
   rebuilds the level sliders inside applyLevel — i.e. while the
   dragged slider's own input event is firing. Detaching an
   active range input releases pointer capture and kills the
   drag, so a 1→5 drag would stall at 2. Rows are now persistent
   (`levelRows[]`): trailing rows are appended/removed, values
   are written into the existing inputs. `App.levelCount(L)`
   (main.js, beside the other tree helpers) supplies the value:
   first parent at depth L-1 with children, else 1.
   `levelsHost` gets a `levels` class for that walk.
6. **Template clones carry `trailCap`** (deep-clone means
   trailCap too). Task 2's unconditional
   `child.trailCap = 20000` line is dropped — makeGear's
   default (clamped 1..CAP) already covers the no-template path.

Smaller items: `add sub-gear` with sym ON always routes through
`applyLevel(depth+1, count+1)` (the plan's `children.length > 0`
guard made the 0-children case grow only the clicked gear —
against the draft's "add or remove from whole level");
`detectPeriod` walks ALL roots (verified it silently ignored
every root after the first — 1/2 + 1/3 gave turns 2 instead of
6; matters once level sliders make big trees cheap, and plan 05
already assumes per-root terms); applyLevel closes the context
menu if its gear was truncated away (orphaned menus edited
detached gears — new `GUI.menuGear()`); the threshold-skip
readout shows `turnsRaw` (showing the 2000-capped value next to
a toast about the raw number reads as a contradiction); README
is updated too (the plan forgot it).
