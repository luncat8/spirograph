// js/main.js - init, loop, interaction, autosave
// classic <script>; depends on Gear, R, GUI (global).

(function () {
	'use strict';

	var BG = [0.043, 0.055, 0.078];
	var STORE_KEY = 'spiro.autosave.v1';

	var App = {
		roots: [],
		allGears: [],
		view: { zoom: 1, pan: [0, 0] },
		globalSpeed: 1,
		paused: false,
		time: 0,
		canvas: null,
		size: 600,
		dpr: 1,
		S: 1, cx0: 0, cy0: 0,
		autosaveOK: true,
		needsRender: false,
		mode: 'animate',
		colorMode: 'frequency',
		symmetry: false,
		maxPeriod: 2000,
		samplesPerTurn: 200,
		showCircles: true,
		showDial: false,
		showPoints: false,
		glowPoints: false,
		drawTrails: true,
		currentPeriod: null,
		overlay: { on: true, invalid: true }
	};

	var TAU = Math.PI * 2;
	var MAX_GEARS = 400;              // tree-size guard for the level sliders
	var MIN_GEAR_R = 0.002;           // absolute floor, far below any parent
	var MAX_LEVEL_N = 12;             // max children per parent from a level slider
	var WHOLE_POINT_BUDGET = 1500000; // total stored whole-mode points, all pencils
	var WHOLE_SLICE_MS = 6;           // per-frame time slice for the background bake
	var WHOLE_CHUNK = 256;            // samples per step call inside that slice
	var wholeJob = null;              // resumable Gear bake job (null = idle)

	// hoisted renderer refs for the per-frame hot path (created once at init).
	var Rseg = R.seg, Rflush = R.flush, Rdot = R.dot;
	var RvCount = R.vCount, RmaxVert = R.maxVert;

	// gesture-draw segment budget: auto-tuned at init by tuneGestureBudget() to
	// the largest ring size this device can push inside GESTURE_FRAME_SLICE_MS.
	// scenes exceeding it are decimated only while a pan/zoom gesture is active.
	var GESTURE_SEG_BUDGET = 60000;      // provisional; replaced at init
	var GESTURE_FRAME_SLICE_MS = 8;      // target ms per frame for gesture draw

	var last = 0;
	var panning = false;
	var lastPx = 0, lastPy = 0;
	var saveTimer = 0;

	// touch / multi-pointer state
	var pointers = new Map();
	var pinchDist = 0, pinchMidX = 0, pinchMidY = 0;
	var pendingGear = null, pendingX = 0, pendingY = 0;
	var TAP_PX = 8;

	// view-change tracking: while a gesture (drag / pinch / wheel) is active the
	// trail is drawn directly to screen at the live transform and the overlay
	// FBO is re-baked once on release (see renderScene / onUp / onWheel).
	var viewDirty = false;
	var wheelActive = false;
	var wheelTimer = 0;

	function isGestureActive() {
		return panning || pointers.size >= 2 || wheelActive;
	}

	function computeLayout() {
		var shortSide = Math.min(window.innerWidth, window.innerHeight);
		var snapped = Math.max(64, Math.floor(shortSide / 64) * 64);
		App.size = snapped;
		App.dpr = window.devicePixelRatio || 1;
		var c = App.canvas;
		c.style.width = snapped + 'px';
		c.style.height = snapped + 'px';
		R.resize(snapped * App.dpr, snapped * App.dpr);
		recomputeTransform();
		App.requestRender();
		if (App.overlay.on) App.invalidateOverlay();
	}

	function recomputeTransform() {
		App.S = (App.size / 2) * App.dpr * App.view.zoom;
		App.cx0 = (App.size / 2) * App.dpr;
		App.cy0 = (App.size / 2) * App.dpr;
	}

	function w2s(wx, wy) {
		return {
			x: App.cx0 + (wx + App.view.pan[0]) * App.S,
			y: App.cy0 - (wy + App.view.pan[1]) * App.S
		};
	}

	function s2w(xb, yb) {
		return {
			x: (xb - App.cx0) / App.S - App.view.pan[0],
			y: (App.cy0 - yb) / App.S - App.view.pan[1]
		};
	}

	function rebuildAll() {
		App.allGears = Gear.flatten(App.roots);
	}

	function clearSubtree(gear) {
		Gear.clearTrace(gear);
		for (var i = 0; i < gear.children.length; i++) clearSubtree(gear.children[i]);
	}

	// ---- gear-tree helpers for level sliders + symmetry mode ----
	// user-input time only (never per-frame).
	function subtreeSize(g) {
		var n = 1;
		for (var i = 0; i < g.children.length; i++) n += subtreeSize(g.children[i]);
		return n;
	}

	// every gear sitting exactly `depth` levels below the roots (depth 0 = roots).
	function gearsAtDepth(depth, out) {
		out = out || [];
		var level = App.roots;
		for (var d = 0; d < depth; d++) {
			var next = [];
			for (var i = 0; i < level.length; i++) {
				for (var j = 0; j < level[i].children.length; j++) next.push(level[i].children[j]);
			}
			level = next;
			if (!level.length) break;
		}
		for (var k = 0; k < level.length; k++) out.push(level[k]);
		return out;
	}
	App.gearsAtDepth = gearsAtDepth;

	function depthOf(gear) {
		var d = 0, g = gear;
		while (g && g.parent) { g = g.parent; d++; }
		return d;
	}
	App.depthOf = depthOf;

	// deepest depth that still holds gears. 0 = roots only.
	function maxDepth() {
		var d = 0;
		for (var i = 0; i < App.allGears.length; i++) {
			var gd = depthOf(App.allGears[i]);
			if (gd > d) d = gd;
		}
		return d;
	}
	App.maxDepth = maxDepth;

	// slider value for level L: children per parent at that depth (max over the
	// parents, so a hand-built asymmetric tree still shows the level exists).
	// 0 is a legitimate value: the level is empty / does not exist.
	App.levelCount = function (level) {
		var parents = gearsAtDepth(level - 1);
		var n = 0;
		for (var i = 0; i < parents.length; i++) {
			if (parents[i].children.length > n) n = parents[i].children.length;
		}
		return n;
	};
	App.maxLevelN = MAX_LEVEL_N;

	// ---- App API used by GUI ----
	App.onGearGeom = function (gear) { clearSubtree(gear); markDirty(); if (App.overlay.on) App.invalidateOverlay(); };
	App.markDirty = function () { markDirty(); };
	App.requestRender = function () { App.needsRender = true; };
	App.invalidateOverlay = function () { App.overlay.invalid = true; App.requestRender(); };
	App.setDrawTrails = function (v) {
		App.drawTrails = v;
		if (v && App.overlay.on) App.invalidateOverlay();
		App.markDirty();
	};
	App.toggleTrails = function () { App.setDrawTrails(!App.drawTrails); };
	App.setOverlay = function (v) {
		App.overlay.on = v;
		if (v) App.invalidateOverlay();
		App.markDirty();
	};
	App.toggleOverlay = function () { App.setOverlay(!App.overlay.on); };
	App.togglePause = function () {
		App.paused = !App.paused;
		GUI.setPaused(App.paused);
		toast(App.paused ? 'paused' : 'running');
	};

	App.clearTraces = function () {
		for (var i = 0; i < App.roots.length; i++) Gear.clearAllTraces(App.roots[i]);
		markDirty();
		if (App.overlay.on) App.invalidateOverlay();
	};

	// ---- whole-mode "valid positions" ----------------------------------
	// a closed figure needs commensurable frequencies, so in whole mode the
	// sliders do not move continuously: they step through the discrete set of
	// values that keep the period short. speed -> +-k/d (d <= 12); diameter ->
	// a rational multiple of the parent diameter (the ratio is what enters the
	// rolling frequency). the slider itself is index-based over these lists, so
	// every position the user can reach is a valid one - no silent post-snap
	// that fights the drag.
	function buildSpeedChoices(maxDen) {
		var seen = {}, out = [];
		for (var den = 1; den <= maxDen; den++) {
			for (var num = 0; num <= den; num++) {
				var v = num / den;
				if (v > 1) continue;
				var k = v.toFixed(6);
				if (!seen[k]) { seen[k] = 1; out.push(v); if (v > 0) out.push(-v); }
			}
		}
		out.sort(function (a, b) { return a - b; });
		return out;
	}
	var SPEED_CHOICES = buildSpeedChoices(12);

	// diameters reachable from a parent: parent diameter * q/p (p,q <= 8).
	// the root has no parent, so it only needs a plain grid (scaling the root
	// scales its whole subtree - see setGearRadius - so the period is unaffected).
	function diameterChoices(gear) {
		var out = [], seen = {}, i;
		if (!gear.parent) {
			for (i = 1; i <= 40; i++) out.push(i * 0.05);
			return out;
		}
		var pd = gear.parent.r * 2;
		for (var p = 1; p <= 8; p++) {
			for (var q = 1; q <= 8; q++) {
				var d = pd * q / p;
				if (d < 0.04 || d > 2.0) continue;
				var k = d.toFixed(5);
				if (seen[k]) continue;
				seen[k] = 1; out.push(d);
			}
		}
		out.sort(function (a, b) { return a - b; });
		return out;
	}

	function nearestChoice(list, v) {
		var best = v, bestErr = Infinity;
		for (var i = 0; i < list.length; i++) {
			var e = Math.abs(list[i] - v);
			if (e < bestErr) { bestErr = e; best = list[i]; }
		}
		return best;
	}

	function snapNice(v) { return nearestChoice(SPEED_CHOICES, v); }
	App.snapNice = snapNice;
	App.speedChoices = function () { return SPEED_CHOICES; };
	App.diameterChoices = diameterChoices;

	// snap the scene onto the whole-mode grid once (entering whole mode or
	// loading a scene there). top-down, so each gear snaps against an
	// already-snapped parent.
	function snapSceneForWhole() {
		function walk(g) {
			g.speed = snapNice(g.speed);
			if (g.parent) g.r = nearestChoice(diameterChoices(g), g.r * 2) / 2;
			for (var i = 0; i < g.children.length; i++) walk(g.children[i]);
		}
		for (var i = 0; i < App.roots.length; i++) walk(App.roots[i]);
	}

	// after a structural scene change, whole mode must recompute (others just repaint).
	function afterSceneChange() {
		if (App.mode === 'whole') App.recomputeWhole();
		else { markDirty(); if (App.overlay.on) App.invalidateOverlay(); }
	}

	// resolution of the bake: ~200 samples per turn, bounded by the ring size
	// and by a global point budget so a 100-pencil tree cannot ask for 100 x
	// 40k points.
	function wholeSampleCount(period) {
		var pencils = 0;
		for (var i = 0; i < App.allGears.length; i++) {
			var p = App.allGears[i].pencil;
			if (p.c1.on || p.c2.on) pencils++;
		}
		var perGear = Math.floor(WHOLE_POINT_BUDGET / Math.max(1, pencils));
		var n = Math.round(period.turns * App.samplesPerTurn);
		return Math.max(64, Math.min(n, perGear, Gear.CAP - 1));
	}

	// whole mode never blocks and never refuses to update: detection is a
	// bounded closure scan (sub-millisecond) and the bake itself is a resumable
	// job stepped from the frame loop in small time slices, so sliders stay
	// responsive and the figure appears progressively instead of freezing the
	// tab behind a "period too long" popup.
	// while a slider is being dragged (recomputes closer than DRAFT_MS apart)
	// the figure is baked at a quarter of the resolution and refined once the
	// user stops moving.
	var DRAFT_MS = 300;
	var lastWholeStart = 0;
	var refineTimer = 0;

	// `force` skips the drag-draft heuristic and bakes at full resolution
	// (used by the refine timer and by the test harness).
	App.recomputeWhole = function (force) {
		wholeJob = null;
		if (refineTimer) { clearTimeout(refineTimer); refineTimer = 0; }
		if (App.mode !== 'whole') return;
		var now = Date.now();
		var draft = !force && (now - lastWholeStart) < DRAFT_MS;
		lastWholeStart = now;
		var period = Gear.detectPeriod(App.roots, App.maxPeriod);
		App.currentPeriod = period;
		var n = wholeSampleCount(period);
		if (draft) {
			n = Math.max(64, Math.round(n / 4));
			refineTimer = setTimeout(function () {
				refineTimer = 0; lastWholeStart = 0; App.recomputeWhole(true);
			}, DRAFT_MS + 20);
		}
		wholeJob = Gear.startWhole(App.roots, period, n);
		if (App.overlay.on) App.invalidateOverlay();   // clear once; the bake appends
		App.requestRender();
		GUI.setPeriod(period, 0, wholeJob.total + 1);
	};

	function nowMs() {
		return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
	}

	// drive the background bake; called once per frame while a job is pending.
	function stepWholeJob() {
		var t0 = nowMs();
		do { Gear.stepWhole(wholeJob, WHOLE_CHUNK); }
		while (!wholeJob.done && nowMs() - t0 < WHOLE_SLICE_MS);
		GUI.setPeriod(App.currentPeriod, wholeJob.i / (wholeJob.total + 1), wholeJob.total + 1);
		App.needsRender = true;
		if (wholeJob.done) {
			wholeJob = null;
			markDirty();
		}
	}

	// the closure search ceiling: how many turns detectPeriod may spend before
	// it settles for the best approximate closure it found.
	App.setMaxPeriod = function (v) {
		App.maxPeriod = Math.max(4, Math.min(20000, Math.round(v)));
		if (App.mode === 'whole') App.recomputeWhole();
	};

	// whole-mode bake resolution (points per turn of the root). this - not the
	// per-pencil trail length - is what makes a baked curve smooth or faceted.
	App.setSamplesPerTurn = function (v) {
		App.samplesPerTurn = Math.max(20, Math.min(2000, Math.round(v)));
		if (App.mode === 'whole') App.recomputeWhole();
	};

	// the open context menu may point at a gear a level change removed.
	function syncMenu() {
		var g = GUI.menuGear && GUI.menuGear();
		if (g && App.allGears.indexOf(g) < 0) GUI.closeMenu();
	}

	App.onGearParam = function (gear, kind) {
		if (kind === 'trail') {
			// ring may have been trimmed: a bake that keeps evicted pixels is wrong
			Gear.applyTrailCap(gear);
			if (App.mode === 'whole') App.recomputeWhole();   // trail cap bounds the bake
			else { if (App.overlay.on) App.invalidateOverlay(); markDirty(); }
			return;
		}
		if (App.mode === 'whole') {
			if (kind === 'width') { if (App.overlay.on) App.invalidateOverlay(); else markDirty(); }
			else if (kind === 'color') {
				Gear.recolorWhole(App.roots);
				if (App.overlay.on) App.invalidateOverlay(); else markDirty();
			}
			else App.recomputeWhole();
		} else {
			if (kind === 'geom') App.onGearGeom(gear); else markDirty();
		}
	};

	App.setShowCircles = function (v) { App.showCircles = v; markDirty(); };
	App.setShowDial = function (v) { App.showDial = v; markDirty(); };
	App.setShowPoints = function (v) { App.showPoints = v; markDirty(); };
	App.setGlow = function (v) { App.glowPoints = v; markDirty(); };

	// mode-appropriate default for the GLOBAL color mode. 'frequency' (hue/sec)
	// is the natural reading in animate mode (continuous color flow at a rate);
	// 'cycles' (forward+back sweeps per period) is the natural reading in whole
	// mode (a closed curve has an integer number of color cycles). the user can
	// override globally; the next mode switch re-applies the mode default.
	function defaultAnimMode(mode) { return mode === 'whole' ? 'cycles' : 'frequency'; }

	// color mode is global (single toggle in the panel, applies to every pencil).
	// pencils still carry a per-pencil animMode so legacy files keep working, but
	// it is always synced to App.colorMode after load / setColorMode / setMode.
	function applyColorMode() {
		for (var i = 0; i < App.allGears.length; i++) App.allGears[i].pencil.animMode = App.colorMode;
	}

	App.setColorMode = function (m) {
		if (m !== 'cycles' && m !== 'frequency') m = defaultAnimMode(App.mode);
		App.colorMode = m;
		applyColorMode();
		if (App.mode === 'whole') {
			// ring colors are baked: re-bake color-only and repaint
			Gear.recolorWhole(App.roots);
			if (App.overlay.on) App.invalidateOverlay(); else markDirty();
		} else {
			// animate mode bakes color per point: only new points are affected
			markDirty();
		}
		GUI.setColorMode(m);
		GUI.refreshAnimMode && GUI.refreshAnimMode();
	};

	App.setMode = function (m) {
		App.mode = m;
		App.colorMode = defaultAnimMode(m);
		applyColorMode();
		if (m === 'whole') {
			snapSceneForWhole();                       // land on the valid grid once
			App.recomputeWhole();                      // starts the background bake
		} else {
			wholeJob = null;
			App.clearTraces();                         // fresh tracing
			// the bake may have grown rings past the animate trail cap
			for (var i = 0; i < App.allGears.length; i++) Gear.applyTrailCap(App.allGears[i]);
		}
		GUI.setMode(m);
		GUI.setColorMode(App.colorMode);
		GUI.refreshAnimMode && GUI.refreshAnimMode();
		GUI.refreshMenu && GUI.refreshMenu();          // whole mode swaps in the valid-position sliders
		markDirty();
		if (App.overlay.on) App.invalidateOverlay();
	};

	App.resetScene = function () {
		App.roots = Gear.defaultScene();
		for (var i = 0; i < App.roots.length; i++) Gear.initRuntime(App.roots[i], null);
		App.view = { zoom: 1, pan: [0, 0] };
		App.globalSpeed = 1;
		GUI.setGlobalSpeed && GUI.setGlobalSpeed(1);
		recomputeTransform();
		rebuildAll();
		applyColorMode();
		GUI.closeMenu();
		// restore every saved setting back to its default so reset is a full
		// clean slate (symmetry/overlay/period threshold/view toggles/pause).
		applyAppState(Gear.defaultAppState());
		App.colorMode = defaultAnimMode(App.mode);
		applyColorMode();
		GUI.setColorMode(App.colorMode);
		GUI.refreshAnimMode && GUI.refreshAnimMode();
		if (App.mode === 'whole') snapSceneForWhole();
		afterSceneChange();
		GUI.rebuildLevels();
	};

	// deep clone of a gear, sub-tree included. a level template must carry its
	// own children, otherwise growing lvl 1 produces childless clones and every
	// deeper level goes asymmetric (the old shallow copy did exactly that).
	function cloneGear(src) {
		var g = Gear.makeGear({
			r: src.r, speed: src.speed, internal: src.internal,
			phase0: src.phase0, trailCap: src.trailCap,
			pencil: {
				d: src.pencil.d, width: src.pencil.width,
				c1: { on: src.pencil.c1.on, color: src.pencil.c1.color },
				c2: { on: src.pencil.c2.on, color: src.pencil.c2.color },
				animSpeed: src.pencil.animSpeed, animMode: src.pencil.animMode
			}
		});
		for (var i = 0; i < src.children.length; i++) g.children.push(cloneGear(src.children[i]));
		return g;
	}

	// one recipe for every new sub-gear: clone of the level template (so a
	// grown level stays symmetric, sub-trees included) or the plain defaults.
	function makeChildFromTemplate(parent, template, phase0) {
		// a new gear is always a fraction of ITS parent. the old
		// Math.max(0.05, parent.r * 0.45) floor made every gear below depth 3
		// exactly 0.05: same size as its parent => orbit radius
		// (parent.r - r) = 0, rolling ratio 0, and all siblings collapsed onto
		// the parent centre. that was the "lvl >= 4 does nothing" bug.
		var cr = Math.max(MIN_GEAR_R, parent.r * 0.45);
		var child = template ? cloneGear(template) : Gear.makeGear({
			r: cr,
			speed: 0.3,
			internal: true,
			pencil: { d: cr * 0.5, width: 2, c1: { on: true, color: '#ffffff' }, c2: { on: false, color: '#ff8a3d' } }
		});
		fitToParent(child, parent);
		child.phase0 = phase0;
		parent.children.push(child);
		Gear.initRuntime(child, parent);
		// new sub-gear inherits the global color mode
		child.pencil.animMode = App.colorMode;
		Gear.update(child, parent, parent.cx, parent.cy,
			parent.phase != null ? parent.phase : parent.rot, 0, App.globalSpeed);
		return child;
	}

	// spread a parent's children evenly: child i sits at i * 360/N degrees.
	// phase0 is a real model field (serialized, honored by both the animate
	// integrator and the whole-curve sampler), not a runtime-only nudge - an
	// offset written into `rot` drifts away frame by frame and is wiped
	// entirely by the whole-mode sampler (rot = speed * phi), which is why
	// levels used to collapse onto a single gear.
	function spreadChildren(parent) {
		var kids = parent.children, n = kids.length;
		for (var i = 0; i < n; i++) kids[i].phase0 = (i * TAU) / n;
	}

	function setChildCount(parent, n) {
		var kids = parent.children;
		if (n < kids.length) kids.length = n;
		var template = kids[0] || null;
		while (kids.length < n) makeChildFromTemplate(parent, template, 0);
		spreadChildren(parent);
	}

	// symmetry ON grows the whole level (same as bumping its slider), OFF adds
	// a single sub-gear to this parent only.
	App.addSubGear = function (parent) {
		if (App.symmetry) {
			App.applyLevel(depthOf(parent) + 1, parent.children.length + 1);
			return;
		}
		var child = makeChildFromTemplate(parent, parent.children[0] || null, 0);
		spreadChildren(parent);
		rebuildAll();
		applyColorMode();
		afterSceneChange();
		GUI.rebuildLevels();
		var sc = w2s(child.cx, child.cy);
		GUI.openMenu(child,
			(sc.x / App.dpr) + App.canvas.getBoundingClientRect().left,
			(sc.y / App.dpr) + App.canvas.getBoundingClientRect().top);
	};

	// level slider: every parent at depth level-1 gets exactly n children,
	// spread over i * 360/n degrees. n = 0 empties the level (and everything
	// below it) - that is how a level is removed, which is why the sliders
	// start at 0 instead of 1.
	App.applyLevel = function (level, n) {
		n = Math.max(0, Math.min(MAX_LEVEL_N, Math.round(n)));
		var parents = gearsAtDepth(level - 1);
		if (!parents.length) return;
		var add = 0;
		for (var i = 0; i < parents.length; i++) {
			var kids = parents[i].children;
			if (n > kids.length) add += (n - kids.length) * (kids[0] ? subtreeSize(kids[0]) : 1);
		}
		if (App.allGears.length + add > MAX_GEARS) {
			toast('gear limit (' + MAX_GEARS + ') reached');
			GUI.rebuildLevels();
			return;
		}
		for (var j = 0; j < parents.length; j++) setChildCount(parents[j], n);
		rebuildAll();
		applyColorMode();
		syncMenu();
		afterSceneChange();
		GUI.rebuildLevels();
	};

	// resizing a gear resizes what is mounted on it, so gear ratios (and with
	// them the period) are preserved and children never end up bigger than a
	// shrunk parent.
	function scaleSubtree(gear, f) {
		for (var i = 0; i < gear.children.length; i++) {
			var c = gear.children[i];
			c.r *= f;
			c.pencil.d *= f;
			scaleSubtree(c, f);
		}
	}

	// a gear mounted inside its parent must stay smaller than it, otherwise the
	// orbit radius (parent.r - r) goes to zero or negative and the gear degenerates
	// (sits on the parent centre / flips 180 deg). used when a clone lands under
	// a smaller parent.
	function fitToParent(gear, parent) {
		if (!parent || !gear.internal) return;
		if (gear.r < parent.r * 0.9) return;
		var f = (parent.r * 0.45) / gear.r;
		gear.r *= f;
		gear.pencil.d *= f;
		scaleSubtree(gear, f);
	}

	App.setGearRadius = function (gear, r) {
		r = Math.max(0.01, r);
		var old = gear.r;
		gear.r = r;
		if (old > 1e-9) scaleSubtree(gear, r / old);
	};

	// symmetry mode: mirror the edited gear's fields onto every gear at the
	// same depth (phase0 is deliberately NOT mirrored - it is what makes the
	// level a rosette). the caller's single onGearParam(gear, kind) then
	// repaints / re-bakes everything: whole-mode recompute and recolor are
	// tree-global, so one call covers the siblings too.
	App.applySymmetry = function (gear, kind) {
		if (!App.symmetry) return;
		var sibs = gearsAtDepth(depthOf(gear));
		for (var i = 0; i < sibs.length; i++) {
			var s = sibs[i];
			if (s === gear) continue;
			if (kind === 'geom') {
				App.setGearRadius(s, gear.r);
				s.speed = gear.speed;
				s.internal = gear.internal;
				s.pencil.d = gear.pencil.d;
			} else if (kind === 'width') {
				s.pencil.width = gear.pencil.width;
			} else if (kind === 'color') {
				s.pencil.c1.on = gear.pencil.c1.on; s.pencil.c1.color = gear.pencil.c1.color;
				s.pencil.c2.on = gear.pencil.c2.on; s.pencil.c2.color = gear.pencil.c2.color;
				s.pencil.animSpeed = gear.pencil.animSpeed;
				s.pencil.animMode = gear.pencil.animMode;
			} else if (kind === 'trail') {
				App.setTrailCap(s, gear.trailCap);
			}
			if (App.mode !== 'whole' && (kind === 'geom' || kind === 'color')) clearSubtree(s);
		}
		if (sibs.length > 1 && App.overlay.on) App.invalidateOverlay();
	};

	App.setSymmetry = function (v) { App.symmetry = !!v; };

	// soft cap on stored trail points. lowering it below the current count
	// evicts the oldest points and hands the memory back.
	App.setTrailCap = function (gear, v) {
		gear.trailCap = Math.max(100, Math.min(Math.round(v), Gear.CAP));
		Gear.applyTrailCap(gear);
	};

	App.removeGear = function (gear) {
		if (!gear.parent) return;
		var parent = gear.parent;
		var idx = parent.children.indexOf(gear);
		if (idx >= 0) parent.children.splice(idx, 1);
		spreadChildren(parent);
		rebuildAll();
		GUI.closeMenu();
		afterSceneChange();
		GUI.rebuildLevels();
	};

	App.copyScene = function () {
		var json = serialize();
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(json).then(function () { toast('copied to clipboard'); },
				function () { fallbackCopy(json); });
		} else fallbackCopy(json);
	};

	// scene file format is a JS module exposing SETTINGS (node-friendly IIFE),
	// so a saved file can be dropped in next to index.html as `default.js` to
	// become the startup scene. legacy .json files still load.
	App.downloadScene = function () {
		var blob = new Blob([sceneJs()], { type: 'application/javascript' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url; a.download = 'spirograph.js';
		document.body.appendChild(a); a.click(); document.body.removeChild(a);
		URL.revokeObjectURL(url);
		toast('saved spirograph.js (rename to default.js for startup scene)');
	};

	App.loadFile = function () {
		var inp = document.createElement('input');
		inp.type = 'file'; inp.accept = '.js,.json,.txt,application/json,application/javascript,text/javascript';
		inp.addEventListener('change', function () {
			var f = inp.files[0];
			if (!f) return;
			var rd = new FileReader();
			rd.onload = function () {
				try { loadSceneText(rd.result); toast('scene loaded'); }
				catch (e) { toast('load failed: ' + e.message); }
			};
			rd.readAsText(f);
		});
		inp.click();
	};

	App.loadClipboard = function () {
		if (navigator.clipboard && navigator.clipboard.readText) {
			navigator.clipboard.readText().then(function (t) {
				try { loadSceneText(t); toast('scene loaded'); }
				catch (e) { toast('paste failed: ' + e.message); }
			}, function () { toast('clipboard blocked'); });
		} else toast('clipboard unavailable');
	};

	function sceneObject() {
		return Gear.serialize(App.roots, App.view, App.globalSpeed, App.colorMode, appState());
	}

	// snapshot of the non-geometry app settings saved alongside the scene so
	// reload / open-file reproduce exactly what the user had on screen.
	function appState() {
		return {
			mode: App.mode,
			paused: App.paused,
			symmetry: App.symmetry,
			overlay: App.overlay.on,
			maxPeriod: App.maxPeriod,
			samplesPerTurn: App.samplesPerTurn,
			showCircles: App.showCircles,
			showDial: App.showDial,
			showPoints: App.showPoints,
			glowPoints: App.glowPoints,
			drawTrails: App.drawTrails
		};
	}

	function serialize() {
		return JSON.stringify(sceneObject());
	}

	function sceneJs() {
		return '(function (root) {\n' +
			'var S = ' + JSON.stringify(sceneObject(), null, '\t') + ';\n' +
			'if (typeof module !== \'undefined\' && module.exports) module.exports = S;\n' +
			'else root.SETTINGS = S;\n' +
			'})(typeof window !== \'undefined\' ? window : globalThis);\n';
	}

	// accept a JSON scene or a SETTINGS js module (evaluated in a throwaway
	// script tag so file:// works; the module writes window.SETTINGS).
	function loadSceneText(txt) {
		var t = txt.replace(/^\uFEFF/, '').trim();
		if (t.charAt(0) === '{' || t.charAt(0) === '[') {
			loadObject(JSON.parse(t));
			return;
		}
		var s = document.createElement('script');
		s.textContent = txt;
		document.body.appendChild(s);
		document.body.removeChild(s);
		if (!window.SETTINGS) throw new Error('no SETTINGS export found');
		loadObject(window.SETTINGS);
	}

	// colorMode for a loaded scene: explicit field, else the mode all pencils
	// agree on (legacy files), else the current mode's default.
	function colorModeFromScene(d) {
		if (d.colorMode === 'cycles' || d.colorMode === 'frequency') return d.colorMode;
		var mode = null, agree = true;
		var all = Gear.flatten(d.roots);
		for (var i = 0; i < all.length; i++) {
			var pm = all[i].pencil.animMode;
			if (pm !== 'cycles' && pm !== 'frequency') continue;
			if (mode === null) mode = pm;
			else if (mode !== pm) { agree = false; break; }
		}
		return (agree && mode) ? mode : defaultAnimMode(App.mode);
	}

	// push a saved app-state bag into the live App. applies mode/colorMode via the
	// existing setters only when they actually differ (those setters bake / clear
	// traces, so calling them on a no-op would be wasted work); other toggles
	// just write the field and sync the checkbox/range without re-firing the
	// input handler. The caller is responsible for the post-load afterSceneChange
	// (loadObject / init / resetScene), so we never double-bake.
	function applyAppState(s) {
		if (!s) return;
		if ((s.mode === 'animate' || s.mode === 'whole') && App.mode !== s.mode) {
			App.setMode(s.mode);
		} else if ((s.mode === 'animate' || s.mode === 'whole') && App.mode === s.mode) {
			GUI.setMode(App.mode);
			GUI.setColorMode(App.colorMode);
		}
		if (typeof s.paused === 'boolean' && App.paused !== s.paused) {
			App.paused = s.paused;
			GUI.setPaused(App.paused);
		}
		if (typeof s.symmetry === 'boolean' && App.symmetry !== s.symmetry) {
			App.symmetry = s.symmetry;
			GUI.setSymmetry && GUI.setSymmetry(App.symmetry);
		}
		if (typeof s.overlay === 'boolean' && App.overlay.on !== s.overlay) {
			App.overlay.on = s.overlay;
			if (App.overlay.on) App.invalidateOverlay();
			GUI.setOverlay && GUI.setOverlay(App.overlay.on);
			markDirty();
		}
		if (typeof s.maxPeriod === 'number' && App.maxPeriod !== s.maxPeriod) {
			App.maxPeriod = s.maxPeriod;
			GUI.setMaxPeriod && GUI.setMaxPeriod(App.maxPeriod);
		}
		if (typeof s.samplesPerTurn === 'number' && App.samplesPerTurn !== s.samplesPerTurn) {
			App.samplesPerTurn = s.samplesPerTurn;
			GUI.setSamplesPerTurn && GUI.setSamplesPerTurn(App.samplesPerTurn);
		}
		if (typeof s.showCircles === 'boolean' && App.showCircles !== s.showCircles) {
			App.showCircles = s.showCircles; GUI.setShowCircles && GUI.setShowCircles(App.showCircles); markDirty();
		}
		if (typeof s.showDial === 'boolean' && App.showDial !== s.showDial) {
			App.showDial = s.showDial; GUI.setShowDial && GUI.setShowDial(App.showDial); markDirty();
		}
		if (typeof s.showPoints === 'boolean' && App.showPoints !== s.showPoints) {
			App.showPoints = s.showPoints; GUI.setShowPoints && GUI.setShowPoints(App.showPoints); markDirty();
		}
		if (typeof s.glowPoints === 'boolean' && App.glowPoints !== s.glowPoints) {
			App.glowPoints = s.glowPoints; GUI.setGlow && GUI.setGlow(App.glowPoints); markDirty();
		}
		if (typeof s.drawTrails === 'boolean' && App.drawTrails !== s.drawTrails) {
			App.drawTrails = s.drawTrails;
			GUI.setDrawTrails && GUI.setDrawTrails(App.drawTrails);
			markDirty();
		}
	}

	function loadObject(obj) {
		var d = Gear.deserialize(obj);
		App.roots = d.roots;
		App.view = d.view;
		App.globalSpeed = d.globalSpeed;
		GUI.setGlobalSpeed && GUI.setGlobalSpeed(App.globalSpeed);
		App.colorMode = colorModeFromScene(d);
		rebuildAll();
		applyColorMode();
		GUI.closeMenu();
		GUI.setColorMode(App.colorMode);
		recomputeTransform();
		// applyAppState may set the mode (which auto-sets colorMode to the mode
		// default). Restore the saved colorMode AFTER if it was an explicit field
		// and the scene agrees with the (possibly newly-set) mode. Whole-mode
		// always renders with cycles semantics regardless of the saved flag, so
		// we honor the saved value in animate mode only.
		var savedColorMode = (obj && obj.colorMode === 'cycles') ? 'cycles'
			: (obj && obj.colorMode === 'frequency') ? 'frequency' : null;
		applyAppState(d.app);
		if (savedColorMode && App.mode === 'animate') {
			App.colorMode = savedColorMode;
			applyColorMode();
			GUI.setColorMode(App.colorMode);
			GUI.refreshAnimMode && GUI.refreshAnimMode();
		}
		if (App.mode === 'whole') snapSceneForWhole();
		afterSceneChange();
		GUI.rebuildLevels();
	}

	function fallbackCopy(text) {
		var ta = document.createElement('textarea');
		ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
		document.body.appendChild(ta); ta.select();
		try { document.execCommand('copy'); toast('copied to clipboard'); }
		catch (e) { toast('copy failed'); }
		document.body.removeChild(ta);
	}

	function markDirty() {
		App.requestRender();
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(saveLocal, 400);
	}

	function saveLocal() {
		if (!App.autosaveOK) return;
		try { localStorage.setItem(STORE_KEY, serialize()); }
		catch (e) { App.autosaveOK = false; GUI.setAutosave(false); }
	}

	function toast(msg) {
		var t = document.getElementById('toast');
		if (!t) return;
		t.textContent = msg;
		t.classList.add('show');
		clearTimeout(toast._t);
		toast._t = setTimeout(function () { t.classList.remove('show'); }, 1400);
	}

	// ---- pointer interaction ----
	function hitGear(xb, yb) {
		var best = null, bestEff = Infinity, bestD = Infinity;
		for (var i = 0; i < App.allGears.length; i++) {
			var g = App.allGears[i];
			var sc = w2s(g.cx, g.cy);
			var eff = Math.max(g.r * App.S, 6 * App.dpr);
			var dx = xb - sc.x, dy = yb - sc.y;
			var d = Math.sqrt(dx * dx + dy * dy);
			if (d < eff) {
				if (eff < bestEff - 1e-9 || (Math.abs(eff - bestEff) <= 1e-9 && d < bestD)) {
					bestEff = eff; bestD = d; best = g;
				}
			}
		}
		return best;
	}

	// zoom about a buffer-space point so the world point under the cursor/finger
	// stays fixed (shared by wheel + pinch).
	function zoomAbout(xb, yb, factor) {
		var w = s2w(xb, yb);
		App.view.zoom = Math.max(0.05, Math.min(60, App.view.zoom * factor));
		recomputeTransform();
		App.view.pan[0] = (xb - App.cx0) / App.S - w.x;
		App.view.pan[1] = (App.cy0 - yb) / App.S - w.y;
	}

	function onDown(e) {
		var rect = App.canvas.getBoundingClientRect();
		var xb = (e.clientX - rect.left) * App.dpr;
		var yb = (e.clientY - rect.top) * App.dpr;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
		try { App.canvas.setPointerCapture(e.pointerId); } catch (err) { }
		if (pointers.size === 2) {
			GUI.closeMenu();
			pendingGear = null; panning = false;
			var it = pointers.values(); var a = it.next().value, b = it.next().value;
			var ax = (a.x - rect.left) * App.dpr, ay = (a.y - rect.top) * App.dpr;
			var bx = (b.x - rect.left) * App.dpr, by = (b.y - rect.top) * App.dpr;
			pinchDist = Math.hypot(ax - bx, ay - by);
			pinchMidX = (ax + bx) / 2; pinchMidY = (ay + by) / 2;
			return;
		}
		if (pointers.size === 1) {
			var g = hitGear(xb, yb);
			if (e.pointerType === 'mouse') {
				// right btn - native context menu
				if (e.button === 2) return;
				// middle button - pan;.
				if (e.button === 1) {
					pendingGear = null;
					panning = true; lastPx = e.clientX; lastPy = e.clientY; App.requestRender();
				} else if (g) GUI.openMenu(g, e.clientX, e.clientY);
				else { GUI.closeMenu(); panning = true; lastPx = e.clientX; lastPy = e.clientY; App.requestRender(); }
			} else {
				if (g) { pendingGear = g; pendingX = e.clientX; pendingY = e.clientY; }
				else { GUI.closeMenu(); panning = true; lastPx = e.clientX; lastPy = e.clientY; App.requestRender(); }
			}
		}
	}

	function onMove(e) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
		if (pointers.size >= 2) {
			var rect = App.canvas.getBoundingClientRect();
			var it = pointers.values(); var a = it.next().value, b = it.next().value;
			var ax = (a.x - rect.left) * App.dpr, ay = (a.y - rect.top) * App.dpr;
			var bx = (b.x - rect.left) * App.dpr, by = (b.y - rect.top) * App.dpr;
			var newDist = Math.hypot(ax - bx, ay - by);
			var newMidX = (ax + bx) / 2, newMidY = (ay + by) / 2;
			if (pinchDist > 0) {
				zoomAbout(newMidX, newMidY, newDist / pinchDist);
				App.view.pan[0] += (newMidX - pinchMidX) / App.S;
				App.view.pan[1] -= (newMidY - pinchMidY) / App.S;
				viewDirty = true;
				App.requestRender();
			}
			pinchDist = newDist; pinchMidX = newMidX; pinchMidY = newMidY;
			return;
		}
		if (panning) {
			var dxb = (e.clientX - lastPx) * App.dpr;
			var dyb = (e.clientY - lastPy) * App.dpr;
			App.view.pan[0] += dxb / App.S;
			App.view.pan[1] -= dyb / App.S;
			lastPx = e.clientX; lastPy = e.clientY;
			viewDirty = true;
			App.requestRender();
		} else if (pendingGear !== null && pointers.size === 1) {
			if (Math.hypot(e.clientX - pendingX, e.clientY - pendingY) > TAP_PX) {
				panning = true; lastPx = e.clientX; lastPy = e.clientY; pendingGear = null;
			}
		}
	}

	function onUp(e) {
		pointers.delete(e.pointerId);
		try { App.canvas.releasePointerCapture(e.pointerId); } catch (err) { }
		if (pendingGear !== null && pointers.size === 0) {
			GUI.openMenu(pendingGear, pendingX, pendingY);
			pendingGear = null;
		}
		if (pointers.size < 2) pinchDist = 0;
		if (pointers.size === 1) {
			panning = true;
			var rem = pointers.values().next().value;
			lastPx = rem.x; lastPy = rem.y;
		} else if (pointers.size === 0) {
			panning = false; pendingGear = null;
			// gesture over: re-bake the overlay once at the settled view instead
			// of re-baking on every move/wheel event during the gesture.
			if (viewDirty) {
				if (App.overlay.on) App.invalidateOverlay();
				viewDirty = false;
			}
		}
	}

	function onCancel(e) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinchDist = 0;
		if (pointers.size === 0) {
			panning = false; pendingGear = null;
			if (viewDirty) {
				if (App.overlay.on) App.invalidateOverlay();
				viewDirty = false;
			}
		}
		else if (pointers.size === 1) {
			panning = true;
			var rem = pointers.values().next().value;
			lastPx = rem.x; lastPy = rem.y;
		}
	}

	function onWheel(e) {
		e.preventDefault();
		var rect = App.canvas.getBoundingClientRect();
		var xb = (e.clientX - rect.left) * App.dpr;
		var yb = (e.clientY - rect.top) * App.dpr;
		zoomAbout(xb, yb, Math.exp(-e.deltaY * 0.0015));
		viewDirty = true;
		// wheel has no native end event: keep the gesture-bypass active for a
		// short quiet period after the last tick, then re-bake the overlay once.
		wheelActive = true;
		if (wheelTimer) clearTimeout(wheelTimer);
		wheelTimer = setTimeout(function () {
			wheelTimer = 0;
			wheelActive = false;
			if (App.overlay.on) App.invalidateOverlay();
		}, 150);
		App.requestRender();
	}

	function onKey(e) {
		if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
		switch (e.key) {
			case ' ': e.preventDefault(); App.togglePause(); break;
			case 'c': App.clearTraces(); break;
			case 'x': App.resetScene(); break;
			case 's': App.copyScene(); break;
			case 'd': App.downloadScene(); break;
			case 'o': App.loadFile(); break;
			case 'p': App.loadClipboard(); break;
			case 'Escape': GUI.closeMenu(); break;
			case 'r': App.toggleTrails(); break;
			case 'v': App.toggleOverlay(); break;
		}
	}

	// ---- render loop ----
	// Draw ring segments [startK, endK] in ring order. Hot path shared by the
	// overlay bake, the overlay-off fallback and the gesture direct-draw: hoisted
	// R.* locals, pre-loaded first pair, running ring index (no % per step).
	// Round join discs (72 verts each, ~92 % of a full rebake's vertex count)
	// are drawn ONLY where a segment turns sharply enough for the corner notch
	// (radius `half`) to be visible: sin(turn) * half > 1.2 px. Dense traces
	// never trigger it; sparse thick traces keep their rounded joins.
	function drawGearSegments(g, startK, endK, half) {
		var ring = g.ring;
		if (!ring) return;
		var cap = g.cap;
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

		// previous segment direction (unnormalized) for the join test. no sqrt:
		// sin(turn)^2 * len^2 * plen^2 > (1.2 px)^2  <=>  sin(turn)*half > 1.2 px.
		var pdx = 0, pdy = 0, pLen2 = 0, havePrev = false;
		var thr2 = half >= 1.0 ? 1.44 / (half * half) : Infinity;

		for (var k = s; k < e; k++) {
			var s0x = cx0 + (ax + panX) * S;
			var s0y = cy0 - (ay + panY) * S;
			var s1x = cx0 + (bx + panX) * S;
			var s1y = cy0 - (by + panY) * S;

			Rseg(s0x, s0y, s1x, s1y, half, ar, ag, ab, br, bg, bb, 1);

			// join disc at this segment's start point, only on sharp turns.
			if (havePrev) {
				var dx = bx - ax, dy = by - ay;
				var cross = dx * pdy - dy * pdx;
				var len2 = dx * dx + dy * dy;
				if (cross * cross > len2 * pLen2 * thr2) Rdot(s0x, s0y, half, ar, ag, ab, 1);
				pdx = dx; pdy = dy; pLen2 = len2;
			} else {
				pdx = bx - ax; pdy = by - ay; pLen2 = pdx * pdx + pdy * pdy;
				havePrev = true;
			}

			// chunked flush: bound every draw to MAXVERT so a full CAP ring never
			// overflows/drops (drawn across several flushes). headroom covers one
			// segment + one join disc.
			if (RvCount() > RmaxVert - 200) Rflush();

			ax = bx; ay = by;
			ar = br; ag = bg; ab = bb;
			idxA = idxB;
			if (++idxB >= cap) idxB = 0;
			bx = ring[idxB * 5]; by = ring[idxB * 5 + 1];
			br = ring[idxB * 5 + 2]; bg = ring[idxB * 5 + 3]; bb = ring[idxB * 5 + 4];
		}

		// round cap disc at the final endpoint so the tip is rounded.
		if (half >= 1.0 && e > s) {
			var ex = cx0 + (ax + panX) * S;
			var ey = cy0 - (ay + panY) * S;
			Rdot(ex, ey, half, ar, ag, ab, 1);
		}
	}

	// gesture-only path: merge `step` consecutive points per segment so the trace
	// stays continuous at reduced vertex count while the user pans/zooms. quality
	// is restored by the full overlay re-bake on gesture end.
	function drawGearSegmentsDecimated(g, half, perGearBudget) {
		var n = g.count - 1;
		if (n <= 0) return;
		var step = Math.max(1, Math.ceil(n / Math.max(1, perGearBudget)));
		if (step <= 1) { drawGearSegments(g, 0, n, half); return; }
		if (!g.ring) return;
		var cap = g.cap, head = g.head, ring = g.ring;
		var panX = App.view.pan[0], panY = App.view.pan[1];
		var S = App.S, cx0 = App.cx0, cy0 = App.cy0;
		var lastIa = -1;
		for (var k = 0; k < n; k += step) {
			var end = Math.min(k + step, n);
			var ia = head + k;   if (ia >= cap) ia -= cap;
			var ib = head + end; if (ib >= cap) ib -= cap;
			var s0x = cx0 + (ring[ia * 5] + panX) * S;
			var s0y = cy0 - (ring[ia * 5 + 1] + panY) * S;
			var s1x = cx0 + (ring[ib * 5] + panX) * S;
			var s1y = cy0 - (ring[ib * 5 + 1] + panY) * S;
			Rseg(s0x, s0y, s1x, s1y, half,
				ring[ia * 5 + 2], ring[ia * 5 + 3], ring[ia * 5 + 4],
				ring[ib * 5 + 2], ring[ib * 5 + 3], ring[ib * 5 + 4], 1);
			if (RvCount() > RmaxVert - 200) Rflush();
			lastIa = ib;
		}
		// end-cap disc at the last drawn point (keeps tip rounded under decimation)
		if (half >= 1.0 && lastIa >= 0) {
			var ex = cx0 + (ring[lastIa * 5] + panX) * S;
			var ey = cy0 - (ring[lastIa * 5 + 1] + panY) * S;
			Rdot(ex, ey, half, ring[lastIa * 5 + 2], ring[lastIa * 5 + 3], ring[lastIa * 5 + 4], 1);
		}
	}

	// one-time benchmark at init: find the largest ring size this device can
	// push through the exact gesture draw path inside GESTURE_FRAME_SLICE_MS.
	// scenes above the resulting budget are decimated only during gestures.
	function tuneGestureBudget() {
		if (typeof window.SPIRO_GESTURE_SEG_BUDGET === 'number') {
			GESTURE_SEG_BUDGET = Math.max(1000, window.SPIRO_GESTURE_SEG_BUDGET | 0);
			return;
		}
		// synthetic ring laid out like a real gear ring (xy rgb per point),
		// smooth enough that no join discs fire during the measurement.
		var TEST_CAP = 200000;
		var testRing = new Float32Array(TEST_CAP * 5);
		for (var i = 0; i < TEST_CAP; i++) {
			var t = i / TEST_CAP;
			testRing[i * 5]     = Math.cos(t * 200) * 2;
			testRing[i * 5 + 1] = Math.sin(t * 137) * 2;
			testRing[i * 5 + 2] = 0.5 + 0.5 * Math.cos(t);
			testRing[i * 5 + 3] = 0.5 + 0.5 * Math.sin(t);
			testRing[i * 5 + 4] = 0.8;
		}
		var fakeGear = { ring: testRing, cap: TEST_CAP, head: 0, count: 0 };
		var samples = [8000, 16000, 32000, 64000, 96000, 128000, 160000, 200000];
		var bestUnder = 10000;   // floor: below this the decimated trace looks sparse
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
			var perFrame = (performance.now() - t0) / 4;
			if (perFrame <= GESTURE_FRAME_SLICE_MS) bestUnder = n;
			else break;
		}
		GESTURE_SEG_BUDGET = bestUnder;
	}

	// gear skeleton: draws circles and/or dial hands depending on the
	// independent toggles. Both may be on at once.
	function drawGearOverlay() {
		for (var j = 0; j < App.allGears.length; j++) {
			var gg = App.allGears[j];
			var sc = w2s(gg.cx, gg.cy);
			if (App.showCircles) {
				var rad = Math.max(gg.r * App.S, 1.5 * App.dpr);
				R.circle(sc.x, sc.y, rad, 1.2 * App.dpr, 0.45, 0.55, 0.72, 0.5, 64);
				R.circle(sc.x, sc.y, 3 * App.dpr, 1.2 * App.dpr, 0.9, 0.95, 1.0, 0.95, 16);
			}
			if (App.showDial) {
				// clock-hand skeleton anchored to the REAL gear centres so it
				// overlays the trace. Each hand points along the gear's pencil
				// angle (gg.phase) so it passes through the pen; an arm links each
				// pivot to its parent so the train reads as connected. Robust for
				// any gear depth (no dependency on child placement kinematics).
				var ang = (gg.phase != null) ? gg.phase : gg.rot;
				var rx = gg.cx + gg.r * Math.cos(ang);
				var ry = gg.cy + gg.r * Math.sin(ang);
				var srim = w2s(rx, ry);
				var col = gg.parent ? [0.5, 0.55, 0.62] : [0.6, 0.66, 0.74];
				R.seg(sc.x, sc.y, srim.x, srim.y, 1.5 * App.dpr, col[0], col[1], col[2], col[0], col[1], col[2], 1);
				if (gg.parent) {
					var psc = w2s(gg.parent.cx, gg.parent.cy);
					R.seg(psc.x, psc.y, sc.x, sc.y, 1.2 * App.dpr, 0.4, 0.45, 0.52, 0.4, 0.45, 0.52, 1);
				}
				R.circle(sc.x, sc.y, 3 * App.dpr, 1.2 * App.dpr, 0.7, 0.75, 0.82, 0.95, 16);
			}
		}
	}

	// pen-point overlay: a marker at each drawing gear's live pen position.
	// Glow (additive) when App.glowPoints is set, otherwise a solid AA disc.
	function drawPenPoints() {
		if (App.glowPoints) {
			R.glowBegin();
			for (var i = 0; i < App.allGears.length; i++) {
				var g = App.allGears[i];
				if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
				var pc = Gear.pencilColor(g, App.time);
				if (!pc) pc = [1, 1, 1];
				var sc = w2s(g.penx, g.peny);
				var size = (12 + g.pencil.width * 4) * App.dpr;
				R.glowPoint(sc.x, sc.y, size, pc[0], pc[1], pc[2], 1);
			}
			R.glowFlush();
		} else {
			for (var i = 0; i < App.allGears.length; i++) {
				var g = App.allGears[i];
				if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
				var pc = Gear.pencilColor(g, App.time);
				if (!pc) pc = [1, 1, 1];
				var sc = w2s(g.penx, g.peny);
				R.dot(sc.x, sc.y, Math.max(2, g.pencil.width * App.dpr), pc[0], pc[1], pc[2], 1);
			}
			R.flush();
		}
	}

	function bakeOverlay(reset) {
		for (var i = 0; i < App.allGears.length; i++) {
			var g = App.allGears[i];
			if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
			if (g.count < 2) continue;
			var half = Math.max(0.5, (g.pencil.width / 2) * App.dpr);
			if (reset) {
				if (g.count < g.cap) {
					drawGearSegments(g, 0, g.count - 1, half);
					g.drawn = g.count - 1;
				} else {
					drawGearSegments(g, 0, g.cap - 1, half);
					g.drawnNewestRing = (g.head + g.cap - 1) % g.cap;
				}
			} else {
				if (g.count < g.cap) {
					drawGearSegments(g, g.drawn, g.count - 1, half);
					g.drawn = g.count - 1;
				} else {
					var newest = (g.head + g.cap - 1) % g.cap;
					if (newest !== g.drawnNewestRing) {
						drawGearSegments(g, g.cap - 2, g.cap - 1, half);
						g.drawnNewestRing = newest;
					}
				}
			}
			R.flush();
		}
	}

	function renderScene() {
		if (!App.drawTrails) {                 // trail hidden: gear skeleton + points only
			R.begin(BG);
			drawGearOverlay();
			R.flush();
			if (App.showPoints) drawPenPoints();
			return;
		}
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
		if (App.overlay.on) {
			R.overlay.bind();
			if (App.overlay.invalid) {
				R.overlay.clear();
				for (var i = 0; i < App.allGears.length; i++) {
					App.allGears[i].drawn = 0;
					App.allGears[i].drawnNewestRing = undefined;
				}
				App.overlay.invalid = false;
				bakeOverlay(true);
				viewDirty = false;   // overlay now matches the settled view
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
	}

	function frame(now) {
		var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
		last = now;
		// background whole-mode bake: a time-sliced chunk per frame. it runs
		// even while paused (it is a computation, not an animation) and paints
		// progressively, so the UI never blocks on a long period.
		if (wholeJob) stepWholeJob();
		if (!App.paused) {
			App.time += dt;
			if (App.mode === 'animate') {               // animate advances sim + trail
				for (var i = 0; i < App.roots.length; i++)
					Gear.update(App.roots[i], null, 0, 0, 0, dt, App.globalSpeed);
				for (var k = 0; k < App.allGears.length; k++) {
					var g = App.allGears[k];
					if (g.pencil.c1.on || g.pencil.c2.on) {
						var col = Gear.pencilColor(g, App.time);
						if (col) Gear.pushPoint(g, g.penx, g.peny, col);
					}
				}
				App.needsRender = true;
			}
			// whole mode is static once baked: render only on invalidation
			// (scene edits, view changes, overlay toggles), never per frame.
		}
		if (App.needsRender) { renderScene(); App.needsRender = false; }
		requestAnimationFrame(frame);
	}

	function init() {
		App.canvas = document.getElementById('c');
		try { R.init(App.canvas); }
		catch (e) { document.body.innerHTML = '<p style="color:#fff;padding:20px">WebGL2 error: ' + e.message + '</p>'; return; }

		// one-time auto-tune of the gesture-draw segment budget to this device.
		// runs before the first scene is loaded / painted, so the synthetic
		// benchmark draws are invisible (blank canvas).
		tuneGestureBudget();

		// restore autosave, else default.js (SETTINGS module next to index.html),
		// else the built-in default scene.
		var restored = null;
		var initApp = Gear.defaultAppState();
		try {
			var raw = localStorage.getItem(STORE_KEY);
			if (raw) restored = Gear.deserialize(JSON.parse(raw));
		} catch (e) { App.autosaveOK = false; }

		if (restored) {
			App.roots = restored.roots;
			App.view = restored.view;
			App.globalSpeed = restored.globalSpeed;
			App.colorMode = colorModeFromScene(restored);
			initApp = restored.app;
		} else if (window.SETTINGS && window.SETTINGS.gears && window.SETTINGS.gears.length) {
			try {
				var d = Gear.deserialize(window.SETTINGS);
				App.roots = d.roots;
				App.view = d.view;
				App.globalSpeed = d.globalSpeed;
				App.colorMode = colorModeFromScene(d);
				initApp = d.app;
			} catch (e2) {
				App.roots = Gear.defaultScene();
				for (var i = 0; i < App.roots.length; i++) Gear.initRuntime(App.roots[i], null);
			}
		} else {
			App.roots = Gear.defaultScene();
			for (var i = 0; i < App.roots.length; i++) Gear.initRuntime(App.roots[i], null);
		}
		rebuildAll();
		applyColorMode();

		GUI.init(App);
		GUI.setAutosave(App.autosaveOK);
		GUI.setGlobalSpeed && GUI.setGlobalSpeed(App.globalSpeed);
		// restore the saved app-state (view toggles, mode, etc.). order matters:
		// GUI.init must run first so the setters exist; mode/colorMode before
		// afterSceneChange so the post-load bake uses the right trace mode.
		applyAppState(initApp);

		computeLayout();
		window.addEventListener('resize', computeLayout);

		App.canvas.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		App.canvas.addEventListener('pointercancel', onCancel);
		App.canvas.addEventListener('wheel', onWheel, { passive: false });
		// right mouse button: let the browser show its native context menu so the
		// user can "save image as" etc. do not preventDefault on contextmenu, and
		// do not block the auxclick that follows a right-button release.
		App.canvas.addEventListener('auxclick', function (e) { if (e.button === 1) e.preventDefault(); });
		window.addEventListener('keydown', onKey);
		window.addEventListener('beforeunload', saveLocal);

		requestAnimationFrame(frame);
	}

	// debug / test handle: the node harness (test/run.js) drives the real App.
	if (typeof window !== 'undefined') window.App = App;

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
