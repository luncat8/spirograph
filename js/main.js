// js/main.js - init, loop, interaction, autosave
// classic <script>; depends on Gear, R, GUI (global).

(function () {
	'use strict';

	var BG = [0.043, 0.055, 0.078];

	var App = {
		roots: [],
		allGears: [],
		view: { zoom: 1, pan: [0, 0] },
		globalSpeed: 1,
		time: 0,
		canvas: null,
		size: 600,
		dpr: 1,
		// screen = (cx0 + (x + panX) * S, cy0 + (y + panY) * Sy). 2D sets
		// Sy = -S (world y up, screen y down); the 3D trail draw installs a
		// true identity (S = Sy = 1, no offset) over already-projected pixels.
		S: 1, Sy: -1, cx0: 0, cy0: 0,
		autosaveOK: true,
		needsRender: false,
		colorMode: 'frequency',
		currentPeriod: null,
		overlay: { on: true, invalid: true },
		// ---- 3D mode state ----
		// dim/cam are scene fields (top-level, saved with the file).
		// cam is seeded on entering 3D via fitView() (loadObject can set it).
		// each gear carries its own second-axis speed (gear.speed2); there is
		// no global spin - 3D is a nested two-axis mechanism, not a plane sweep.
		dim: '2d',
		cam: null,
		orbitGear: null,            // orbit pivot (menu gear, else nearest root)
		autoRotate: false,          // session-only (not persisted)
		// persisted settings (mode, toggles, bake options) are PLACEHOLDERS
		// here: defaults, bounds, clamps and the load/save recipes all live in
		// js/settings.js, and init() seeds the live values via
		// Settings.applyApp(Settings.defaultApp(), App, GUI).
		mode: 'animate',
		paused: false,
		symmetry: false,
		maxPeriod: 0,
		samplesPerTurn: 0,
		showCircles: false,
		showDial: false,
		showPoints: false,
		glowPoints: false,
		drawTrails: false,
		spheres: false,
		sphereColor: '#9fd8ff',
		sphereTrans: 0.25
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
	var GESTURE_SEG_BUDGET_3D = 48000;   // 3D gesture path (projection adds cost)
	var GESTURE_FRAME_SLICE_MS = 8;      // target ms per frame for gesture draw

	var last = 0;
	var panning = false;
	var lastPx = 0, lastPy = 0;
	var saveTimer = 0;

	// ---- 3D scratch (allocated once; mutated in place, never in the frame loop)
	// trails are stored as real 3D points (x y z rgb, stride 6). every frame the
	// world points are projected to screen pixels into projScratch (stride 5:
	// sx sy rgb), which feeds the shared 2D draw loops through projGear under
	// an identity transform - no allocation on the hot path.
	var matM = new Float32Array(16);        // view-proj matrix (reused per frame)
	var projScratch = null;                  // lazily sized to CAP*5 (sx,sy,r,g,b)
	var projGear = { ring: null, cap: 0, head: 0, count: 0, stride: 5 };
	var projPoint = [0, 0];                  // single-point projection scratch
	var ZERO_PAN = [0, 0];                   // identity transform for projGear draws
	// 3D camera interaction state
	var orbiting = false;
	var camEase = null;                       // {from, to, t0, dur} while easing
	var camFitR = 3;                          // last fit radius (dolly clamp anchor)

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
		// 3D: camera motion (orbit drag, pan drag, pinch, wheel, fit ease,
		// auto-rotate) takes the same gesture bypass as 2D pan/zoom and re-bakes
		// the overlay once on settle.
		if (App.dim === '3d') {
			return orbiting || panning || pointers.size >= 2 || wheelActive ||
				!!camEase || App.autoRotate;
		}
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
		App.Sy = -App.S;
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
			// in 3D the tilt speed must land on the same grid as speed so the
			// two-axis baked curve closes (2D ignores speed2 entirely).
			if (App.dim === '3d') g.speed2 = snapNice(g.speed2 || 0);
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
		// 3D closure uses the nested two-axis frame model (per-gear speed2).
		var period = Gear.detectPeriod(App.roots, App.maxPeriod, null, App.dim === '3d');
		App.currentPeriod = period;
		var n = wholeSampleCount(period);
		if (draft) {
			n = Math.max(64, Math.round(n / 4));
			refineTimer = setTimeout(function () {
				refineTimer = 0; lastWholeStart = 0; App.recomputeWhole(true);
			}, DRAFT_MS + 20);
		}
		wholeJob = Gear.startWhole(App.roots, period, n, App.dim === '3d');
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
		App.maxPeriod = Settings.clamp('maxPeriod', v);
		if (App.mode === 'whole') App.recomputeWhole();
	};

	// whole-mode bake resolution (points per turn of the root). this - not the
	// per-pencil trail length - is what makes a baked curve smooth or faceted.
	App.setSamplesPerTurn = function (v) {
		App.samplesPerTurn = Settings.clamp('samplesPerTurn', v);
		if (App.mode === 'whole') App.recomputeWhole();
	};

	// ---- 3D mode API ----
	// the orbit pivot is a FIXED world point set when the user selects a gear
	// (its sphere centre at that moment), else the root centre (the origin).
	// it must NOT chase the gear frame-by-frame: the trail overlay is baked
	// incrementally under a stationary-camera assumption, and a moving target
	// would smear that baked trail while the spheres use the live camera - the
	// trail would appear in a different transform than the spheres.
	function pivotOut(out) {
		var g = App.orbitGear;
		if (g && App.allGears.indexOf(g) >= 0) { out[0] = g.c3[0]; out[1] = g.c3[1]; out[2] = g.c3[2]; }
		else { out[0] = 0; out[1] = 0; out[2] = 0; }
		return out;
	}
	// point the orbit target at the given gear (or root) NOW, once. returns
	// nothing; callers may pass the gear's c3. a repaint + overlay rebake follows.
	function retargetCamera(g) {
		App.orbitGear = (g && App.allGears.indexOf(g) >= 0) ? g : (App.roots[0] || null);
		if (!App.cam) App.cam = Camera3.defaultCamera();
		var t = App.cam.target;
		var ox = t[0], oy = t[1], oz = t[2];
		pivotOut(t);
		// the view matrix only changes when the pivot actually moved (a menu
		// refresh re-selects the same gear); a moved pivot is a camera move.
		if (t[0] === ox && t[1] === oy && t[2] === oz) return;
		settleCamera();
	}
	App.setOrbitGear = function (g) { retargetCamera(g); };

	App.setDim = function (d) {
		d = (d === '3d') ? '3d' : '2d';
		if (d === App.dim) { GUI.setDim && GUI.setDim(d); return; }
		App.dim = d;
		camEase = null;
		// rings switch stride (5 <-> 6) and are cleared - 3D and 2D sample
		// different coordinates, so the old trace is never reused.
		Gear.setTreeStride(App.roots, d === '3d');
		if (d === '3d') {
			// give every gear an initial 3D pose so spheres/pens draw even
			// before the first animate tick (and while paused / in whole mode).
			for (var r0 = 0; r0 < App.roots.length; r0++) Gear.pose3All(App.roots[r0], null);
			App.cam = Camera3.sanitizeCamera(App.cam);
			App.orbitGear = App.roots[0] || null;
			camFitR = fitRadius();
			App.cam.dist = Camera3.fitDist(camFitR);
			pivotOut(App.cam.target);
			GUI.setDim && GUI.setDim('3d');
			toast('3D: drag to orbit the selected gear, wheel to dolly, right/middle drag to pan, f to fit');
		} else {
			orbiting = false;
			App.orbitGear = null;
			GUI.setDim && GUI.setDim('2d');
		}
		viewDirty = true;
		// whole mode re-detects + re-bakes (stride changed); animate just retraces.
		if (App.mode === 'whole') App.recomputeWhole();
		else { markDirty(); if (App.overlay.on) App.invalidateOverlay(); }
	};

	App.toggleDim = function () { App.setDim(App.dim === '3d' ? '2d' : '3d'); };

	// per-gear second-axis speed (3D precession / tilt). 0 = stays in plane.
	// whole mode snaps like `speed` so the two-axis bake closes.
	App.setGearSpeed2 = function (gear, v) {
		v = Math.max(-3, Math.min(3, v));
		if (App.mode === 'whole') v = snapNice(v);
		if (Math.abs(v - (gear.speed2 || 0)) < 1e-9) return;
		gear.speed2 = v;
		App.applySymmetry(gear, 'speed2');   // mirror the tilt to the level (no-op off)
		if (App.mode === 'whole') App.recomputeWhole();
		else { clearSubtree(gear); if (App.overlay.on) App.invalidateOverlay(); markDirty(); }
	};

	// auto-rotate is a camera gesture that never "ends" by pointer: while it
	// runs the trail draws directly, and switching it off must settle the
	// camera (re-bake the overlay at the final yaw) exactly like a drag end,
	// or the cached FBO from the yaw where it was switched ON stays blitted
	// under spheres drawn at the yaw where it was switched OFF.
	App.setAutoRotate = function (v) {
		v = !!v;
		if (v === App.autoRotate) return;
		App.autoRotate = v;
		if (v) { viewDirty = true; App.requestRender(); }
		else settleCamera();
	};

	App.fitView = function () { startFit(true); };
	App.resetCamera = function () {
		if (!App.cam) App.cam = Camera3.defaultCamera();
		camFitR = fitRadius();
		var to = Camera3.defaultCamera();
		to.dist = Camera3.fitDist(camFitR);
		camEase = { from: Camera3.cloneCamera(App.cam), to: to, t0: nowMs(), dur: 300 };
		viewDirty = true; App.requestRender();
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
	// glass sphere shells (view-only; drawn live each render, no overlay bake).
	App.setSpheres = function (v) { App.spheres = !!v; markDirty(); };
	App.setSphereColor = function (v) {
		if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) return;
		App.sphereColor = v.toLowerCase(); markDirty();
	};
	App.setSphereTrans = function (v) {
		v = Math.max(0, Math.min(1, +v));
		if (!isFinite(v) || v === App.sphereTrans) return;
		App.sphereTrans = v; markDirty();
	};

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
		Settings.applyApp(Settings.defaultApp(), App, GUI);
		App.colorMode = defaultAnimMode(App.mode);
		applyColorMode();
		GUI.setColorMode(App.colorMode);
		GUI.refreshAnimMode && GUI.refreshAnimMode();
		// reset the dimension too: a clean slate starts in 2D with no camera.
		App.dim = '2d'; App.cam = null; camEase = null; App.autoRotate = false; App.orbitGear = null;
		Gear.setTreeStride(App.roots, false);
		GUI.setDim && GUI.setDim('2d');
		if (App.mode === 'whole') snapSceneForWhole();
		afterSceneChange();
		GUI.rebuildLevels();
	};

	// deep clone of a gear, sub-tree included. a level template must carry its
	// own children, otherwise growing lvl 1 produces childless clones and every
	// deeper level goes asymmetric (the old shallow copy did exactly that).
	function cloneGear(src) {
		var g = Gear.makeGear({
			r: src.r, speed: src.speed, speed2: src.speed2 || 0, internal: src.internal,
			phase0: src.phase0, trailCap: src.trailCap, rot: src.rot,
			pencil: {
				d: src.pencil.d, width: src.pencil.width,
				c1: { on: src.pencil.c1.on, color: src.pencil.c1.color },
				c2: { on: src.pencil.c2.on, color: src.pencil.c2.color },
				animSpeed: src.pencil.animSpeed, animMode: src.pencil.animMode
			}
		});
		// carry the accumulated tilt too (initRuntime resets rot2 to 0; it is
		// re-asserted by makeChildFromTemplate after init). siblings must share
		// the SAME accumulated rotation as their template, or the constant
		// phase0 mount offsets (i*2pi/N) no longer space them evenly.
		g.rot2 = src.rot2 || 0;
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
		// initRuntime zeroes the accumulated tilt; re-assert the template's so
		// siblings tilt in phase too (rot was preserved by initRuntime).
		if (template) child.rot2 = template.rot2 || 0;
		// new sub-gear inherits the global color mode
		child.pencil.animMode = App.colorMode;
		// place the new gear so its live pose matches (2D planar update + a 3D
		// pose if we are in 3D). 2D needs the carry phase; 3D inherits the
		// parent's nested frame.
		var anc = parent, carry = anc ? (anc.phase != null ? anc.phase : anc.rot) : 0;
		Gear.update(child, parent, parent.cx, parent.cy, carry, 0, App.globalSpeed);
		// 3D: the new sub-tree must store xyz (stride 6) like the rest of the
		// tree - a fresh gear defaults to the 2D stride and its trail would
		// be skipped by every 3D draw - and gets a full pose (a clone may
		// carry its own children; pose3All uses the parent link wired above).
		if (App.dim === '3d') { Gear.setTreeStride([child], true); Gear.pose3All(child, parent); }
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
		var sx, sy;
		if (App.dim === '3d') {
			App.orbitGear = child;             // orbit the newly opened gear
			var s3 = w2s3D(child.c3[0], child.c3[1], child.c3[2]);
			sx = s3.x; sy = s3.y;
		} else {
			var sc = w2s(child.cx, child.cy);
			sx = sc.x; sy = sc.y;
		}
		GUI.openMenu(child,
			(sx / App.dpr) + App.canvas.getBoundingClientRect().left,
			(sy / App.dpr) + App.canvas.getBoundingClientRect().top);
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
				s.speed2 = gear.speed2 || 0;
				s.internal = gear.internal;
				s.pencil.d = gear.pencil.d;
			} else if (kind === 'speed2') {
				s.speed2 = gear.speed2 || 0;
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
		gear.trailCap = Settings.clamp('trailCap', v);
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

	// the persisted app-state snapshot (mode, toggles, bake options) is built
	// by Settings.snapshotApp from the same schema that loads/validates it.
	// dimension fields (dim / camera) are top-level scene fields, not part of
	// the `app` bag; per-gear second-axis speeds ride on the gears (speed2).
	function sceneObject() {
		var o = Gear.serialize(App.roots, App.view, App.globalSpeed, App.colorMode, Settings.snapshotApp(App));
		o.dim = App.dim;
		o.camera = App.dim === '3d' && App.cam ? Camera3.cloneCamera(App.cam) : null;
		return o;
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

	// apply the top-level 3D fields (dim / camera) from a raw scene object.
	// missing fields default to 2D. called AFTER Settings.applyApp so GUI
	// controls exist. does not bake; the caller runs afterSceneChange. rings
	// are switched to the target stride (and cleared) like a manual setDim.
	function applyScene3D(obj) {
		var dim = (obj && obj.dim === '3d') ? '3d' : '2d';
		App.dim = dim;
		Gear.setTreeStride(App.roots, dim === '3d');
		if (dim === '3d') {
			App.cam = Camera3.sanitizeCamera(obj && obj.camera);
			App.orbitGear = App.roots[0] || null;
			camFitR = fitRadius();
			if (!obj || !obj.camera) App.cam.dist = Camera3.fitDist(camFitR);
			for (var r1 = 0; r1 < App.roots.length; r1++) Gear.pose3All(App.roots[r1], null);
			pivotOut(App.cam.target);
		} else {
			App.cam = null; App.orbitGear = null;
		}
		GUI.setDim(dim);
	}

	// pushing a saved app-state bag into the live App (sanitize + per-field
	// recipes, syncing the panel controls without re-firing their handlers) is
	// owned by js/settings.js (Settings.applyApp); the caller runs the
	// post-load afterSceneChange so we never double-bake.

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
		// Settings.applyApp may set the mode (which auto-sets colorMode to the
		// mode default). Restore the saved colorMode AFTER if it was an explicit
		// field and the scene agrees with the (possibly newly-set) mode. Whole-mode
		// always renders with cycles semantics regardless of the saved flag, so
		// we honor the saved value in animate mode only.
		var savedColorMode = (obj && obj.colorMode === 'cycles') ? 'cycles'
			: (obj && obj.colorMode === 'frequency') ? 'frequency' : null;
		Settings.applyApp(d.app, App, GUI);
		if (savedColorMode && App.mode === 'animate') {
			App.colorMode = savedColorMode;
			applyColorMode();
			GUI.setColorMode(App.colorMode);
			GUI.refreshAnimMode && GUI.refreshAnimMode();
		}
		applyScene3D(obj);
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
		try { localStorage.setItem(Settings.STORE_KEY, serialize()); }
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
		if (App.dim === '3d') return hitGear3D(xb, yb);
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

	// 3D hit test: screen distance to the projected SPHERE centre; a sphere's
	// silhouette is a screen circle whose radius is the projected radius. the
	// rim point is taken along the camera-right screen axis so the projected
	// size is correct from any viewing angle (never smaller than 8 buffer px).
	function hitGear3D(xb, yb) {
		var best = null, bestEff = Infinity, bestD = Infinity;
		var eye = Camera3.eyeOf(App.cam, eyeScratch3);
		var fx = eye[0] - App.cam.target[0], fy = eye[1] - App.cam.target[1], fz = eye[2] - App.cam.target[2];
		var fl = Math.hypot(fx, fy, fz) || 1;
		fx /= fl; fy /= fl; fz /= fl;
		// camera right = normalize(cross(forward, up=+z)); reuse per gear (scale by r).
		var ux = fy, uy = -fx, ul = Math.hypot(ux, uy) || 1;
		ux /= ul; uy /= ul;
		for (var i = 0; i < App.allGears.length; i++) {
			var g = App.allGears[i];
			var c = w2s3DC(g.c3[0], g.c3[1], g.c3[2]);
			var rim = w2s3D(g.c3[0] + ux * g.r, g.c3[1] + uy * g.r, g.c3[2]);
			var eff = Math.max(Math.hypot(rim.x - c.x, rim.y - c.y), 8 * App.dpr);
			var dx = xb - c.x, dy = yb - c.y;
			var d = Math.sqrt(dx * dx + dy * dy);
			if (d < eff) {
				if (eff < bestEff - 1e-9 || (Math.abs(eff - bestEff) <= 1e-9 && d < bestD)) {
					bestEff = eff; bestD = d; best = g;
				}
			}
		}
		return best;
	}
	var eyeScratch3 = [0, 0, 0];

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
			pendingGear = null; panning = false; orbiting = false;
			var it = pointers.values(); var a = it.next().value, b = it.next().value;
			var ax = (a.x - rect.left) * App.dpr, ay = (a.y - rect.top) * App.dpr;
			var bx = (b.x - rect.left) * App.dpr, by = (b.y - rect.top) * App.dpr;
			pinchDist = Math.hypot(ax - bx, ay - by);
			pinchMidX = (ax + bx) / 2; pinchMidY = (ay + by) / 2;
			return;
		}
		if (pointers.size === 1) {
			var is3d = App.dim === '3d';
			var g = hitGear(xb, yb);
			if (e.pointerType === 'mouse') {
				// right btn - native context menu
				if (e.button === 2) return;
				if (is3d) {
					// 3D: left drag = orbit, middle/right drag = pan; gear = menu.
					if (e.button === 1) {
						pendingGear = null; panning = true; orbiting = false;
						lastPx = e.clientX; lastPy = e.clientY; App.requestRender();
					} else if (g) GUI.openMenu(g, e.clientX, e.clientY);
					else { GUI.closeMenu(); orbiting = true; panning = false; lastPx = e.clientX; lastPy = e.clientY; App.requestRender(); }
					return;
				}
				// middle button - pan;.
				if (e.button === 1) {
					pendingGear = null;
					panning = true; lastPx = e.clientX; lastPy = e.clientY; App.requestRender();
				} else if (g) GUI.openMenu(g, e.clientX, e.clientY);
				else { GUI.closeMenu(); panning = true; lastPx = e.clientX; lastPy = e.clientY; App.requestRender(); }
			} else {
				if (g) { pendingGear = g; pendingX = e.clientX; pendingY = e.clientY; }
				else if (is3d) { GUI.closeMenu(); orbiting = true; panning = false; lastPx = e.clientX; lastPy = e.clientY; App.requestRender(); }
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
				if (App.dim === '3d' && App.cam) {
					// pinch = dolly + pan (midpoint drag).
					Camera3.dolly(App.cam, newDist / pinchDist, camFitR);
					Camera3.panBy(App.cam, newMidX - pinchMidX, newMidY - pinchMidY,
						App.size * App.dpr, App.size * App.dpr);
				} else {
					zoomAbout(newMidX, newMidY, newDist / pinchDist);
					App.view.pan[0] += (newMidX - pinchMidX) / App.S;
					App.view.pan[1] -= (newMidY - pinchMidY) / App.S;
				}
				viewDirty = true;
				App.requestRender();
			}
			pinchDist = newDist; pinchMidX = newMidX; pinchMidY = newMidY;
			return;
		}
		if (App.dim === '3d' && App.cam) {
			var ddx = (e.clientX - lastPx) * App.dpr, ddy = (e.clientY - lastPy) * App.dpr;
			if (orbiting) {
				// drag right orbits to the right (content follows the finger);
				// drag down tilts the view down.
				Camera3.orbitBy(App.cam, -ddx * 0.005, ddy * 0.005);
				lastPx = e.clientX; lastPy = e.clientY;
				viewDirty = true; App.requestRender();
			} else if (panning) {
				Camera3.panBy(App.cam, ddx, ddy, App.size * App.dpr, App.size * App.dpr);
				lastPx = e.clientX; lastPy = e.clientY;
				viewDirty = true; App.requestRender();
			} else if (pendingGear !== null && pointers.size === 1) {
				if (Math.hypot(e.clientX - pendingX, e.clientY - pendingY) > TAP_PX) {
					// 3D touch drag on empty space = orbit.
					orbiting = true; panning = false; lastPx = e.clientX; lastPy = e.clientY; pendingGear = null;
				}
			}
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
			// dropping from a pinch: remaining finger keeps panning/orbiting.
			var rem = pointers.values().next().value;
			lastPx = rem.x; lastPy = rem.y;
			if (App.dim === '3d') { /* keep orbiting state as-is */ }
			else panning = true;
		} else if (pointers.size === 0) {
			panning = false; orbiting = false; pendingGear = null;
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
			panning = false; orbiting = false; pendingGear = null;
			if (viewDirty) {
				if (App.overlay.on) App.invalidateOverlay();
				viewDirty = false;
			}
		}
		else if (pointers.size === 1) {
			if (App.dim !== '3d') panning = true;
			var rem = pointers.values().next().value;
			lastPx = rem.x; lastPy = rem.y;
		}
	}

	function onWheel(e) {
		e.preventDefault();
		var rect = App.canvas.getBoundingClientRect();
		var xb = (e.clientX - rect.left) * App.dpr;
		var yb = (e.clientY - rect.top) * App.dpr;
		if (App.dim === '3d' && App.cam) {
			Camera3.dolly(App.cam, Camera3.wheelFactor(e.deltaY), camFitR);
		} else {
			zoomAbout(xb, yb, Math.exp(-e.deltaY * 0.0015));
		}
		viewDirty = true;
		// wheel has no native end event: keep the gesture-bypass active for a
		// short quiet period after the last tick, then re-bake the overlay once.
		wheelActive = true;
		if (wheelTimer) clearTimeout(wheelTimer);
		wheelTimer = setTimeout(function () {
			wheelTimer = 0;
			wheelActive = false;
			// in 3D the fit anchor may change as the user dollies; refresh it.
			if (App.dim === '3d') camFitR = fitRadius();
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
			case 'g': App.toggleDim(); break;
			case 'f': if (App.dim === '3d') App.fitView(); break;
		}
	}

	// double-click on empty 3D canvas => fit view.
	function onDblClick(e) {
		if (App.dim !== '3d') return;
		var rect = App.canvas.getBoundingClientRect();
		var xb = (e.clientX - rect.left) * App.dpr, yb = (e.clientY - rect.top) * App.dpr;
		if (!hitGear3D(xb, yb)) App.fitView();
	}

	// ---- render loop ----
	// Draw ring segments [startK, endK] in ring order. Hot path shared by the
	// overlay bake, the overlay-off fallback and the gesture direct-draw: hoisted
	// R.* locals, pre-loaded first pair, running ring index (no % per step).
	// Round join discs (72 verts each, ~92 % of a full rebake's vertex count)
	// are drawn ONLY where a segment turns sharply enough for the corner notch
	// (radius `half`) to be visible: sin(turn) * half > 1.2 px. Dense traces
	// never trigger it; sparse thick traces keep their rounded joins.
	// a chunk that starts mid-ring (incremental overlay append) preloads the
	// direction of the segment before it, so the join disc at the chunk start
	// fires exactly as it would in one full draw. `noCap` skips the round
	// end-cap disc: an incremental bake must not stamp a cap into the cached
	// pixels at every frame's chunk end (the live tip is drawn on screen by
	// drawTrailTips instead), or the cached trail grows beads the redraw path
	// never shows.
	function drawGearSegments(g, startK, endK, half, noCap) {
		var ring = g.ring;
		if (!ring) return;
		var cap = g.cap;
		var head = g.head;
		var n = g.count - 1;
		var s = Math.max(0, startK), e = Math.min(endK, n);
		if (e <= s) return;

		var panX = App.view.pan[0], panY = App.view.pan[1];
		var S = App.S, Sy = App.Sy, cx0 = App.cx0, cy0 = App.cy0;

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
		if (s > 0) {
			var idxP = idxA === 0 ? cap - 1 : idxA - 1;
			pdx = ax - ring[idxP * 5]; pdy = ay - ring[idxP * 5 + 1];
			pLen2 = pdx * pdx + pdy * pdy;
			havePrev = true;
		}

		for (var k = s; k < e; k++) {
			var s0x = cx0 + (ax + panX) * S;
			var s0y = cy0 + (ay + panY) * Sy;
			var s1x = cx0 + (bx + panX) * S;
			var s1y = cy0 + (by + panY) * Sy;

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
		if (half >= 1.0 && !noCap) {
			var ex = cx0 + (ax + panX) * S;
			var ey = cy0 + (ay + panY) * Sy;
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
		var S = App.S, Sy = App.Sy, cx0 = App.cx0, cy0 = App.cy0;
		var lastIa = -1;
		for (var k = 0; k < n; k += step) {
			var end = Math.min(k + step, n);
			var ia = head + k;   if (ia >= cap) ia -= cap;
			var ib = head + end; if (ib >= cap) ib -= cap;
			var s0x = cx0 + (ring[ia * 5] + panX) * S;
			var s0y = cy0 + (ring[ia * 5 + 1] + panY) * Sy;
			var s1x = cx0 + (ring[ib * 5] + panX) * S;
			var s1y = cy0 + (ring[ib * 5 + 1] + panY) * Sy;
			Rseg(s0x, s0y, s1x, s1y, half,
				ring[ia * 5 + 2], ring[ia * 5 + 3], ring[ia * 5 + 4],
				ring[ib * 5 + 2], ring[ib * 5 + 3], ring[ib * 5 + 4], 1);
			if (RvCount() > RmaxVert - 200) Rflush();
			lastIa = ib;
		}
		// end-cap disc at the last drawn point (keeps tip rounded under decimation)
		if (half >= 1.0 && lastIa >= 0) {
			var ex = cx0 + (ring[lastIa * 5] + panX) * S;
			var ey = cy0 + (ring[lastIa * 5 + 1] + panY) * Sy;
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
		// 3D gesture path also projects each point (2 trig + mat multiply), so
		// budget a bit lower; override applies to both.
		GESTURE_SEG_BUDGET_3D = Math.max(1000, Math.floor(bestUnder * 0.8));
		if (typeof window.SPIRO_GESTURE_SEG_BUDGET === 'number')
			GESTURE_SEG_BUDGET_3D = GESTURE_SEG_BUDGET;
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

	// ================= 3D mode =================
	// trails are real 3D points (stride 6: x y z r g b). each frame we project
	// the stored world points through the live camera into projScratch (stride 5:
	// sx sy rgb) and reuse the 2D draw loops under an identity transform. the
	// gears are spheres drawn as OUTLINES only: a sphere's silhouette projects
	// to a screen-space circle (not an ellipse like a tilted disc), so the
	// outline is a single R.circle at the projected centre.

	function ensureProjBuffer() {
		if (!projScratch) { projScratch = new Float32Array(Gear.CAP * 5); projGear.ring = projScratch; projGear.cap = Gear.CAP; }
	}

	// world -> screen in 3D (top-left buffer pixels) into a reused {x,y}.
	// callers that need TWO points at once must use distinct scratch objects
	// (projectPoint shares projPoint); w2s3D is the single-point variant.
	var w2sScratch = { x: 0, y: 0 };
	var w2sScratchC = { x: 0, y: 0 };
	function w2s3D(wx, wy, wz) {
		Camera3.projectPoint(matM, wx, wy, wz, projPoint);
		w2sScratch.x = projPoint[0]; w2sScratch.y = projPoint[1];
		return w2sScratch;
	}
	function w2s3DC(wx, wy, wz) {
		Camera3.projectPoint(matM, wx, wy, wz, projPoint);
		w2sScratchC.x = projPoint[0]; w2sScratchC.y = projPoint[1];
		return w2sScratchC;
	}

	// project logical ring points [startK, endK) into projScratch as screen
	// pixels + copied rgb (stride 5). the output is LINEAR: logical point k
	// lands in slot k - startK, so projGear is read with head 0. indexing the
	// output by the source ring SLOT (idx % cap) was the 3D trail bug: once
	// the ring had wrapped, the 2D loop walked head..cap..0 through a buffer
	// whose slots past the wrap were stale, and the trail broke away from
	// the spheres. reads the stored world xyz; allocation-free.
	function projectRing(g, startK, endK) {
		var ring = g.ring, cap = g.cap, head = g.head;
		var e = Math.min(endK, g.count);
		var idx = head + startK;
		if (idx >= cap) idx -= cap;
		var o5 = 0;
		for (var k = startK; k < e; k++) {
			var o6 = idx * 6;
			Camera3.projectPoint(matM, ring[o6], ring[o6 + 1], ring[o6 + 2], projPoint);
			projScratch[o5] = projPoint[0]; projScratch[o5 + 1] = projPoint[1];
			projScratch[o5 + 2] = ring[o6 + 3]; projScratch[o5 + 3] = ring[o6 + 4]; projScratch[o5 + 4] = ring[o6 + 5];
			o5 += 5;
			if (++idx >= cap) idx = 0;
		}
		projGear.head = 0;
		projGear.count = e - startK;
		return projGear.count;
	}

	// world-space bounding radius of the trail (or the sphere train fallback)
	// measured from the orbit pivot, used to fit the camera frame.
	function fitRadius() {
		var piv = pivotOut([0, 0, 0]);
		var px = piv[0], py = piv[1], pz = piv[2];
		var best = 0, any = false;
		for (var i = 0; i < App.allGears.length; i++) {
			var g = App.allGears[i];
			if (g.ring && g.count > 1 && g.stride === 6) {
				any = true;
				var cap = g.cap, head = g.head;
				for (var k = 0; k < g.count; k++) {
					var idx = (head + k) % cap;
					var dx = g.ring[idx * 6] - px, dy = g.ring[idx * 6 + 1] - py, dz = g.ring[idx * 6 + 2] - pz;
					var m = Math.sqrt(dx * dx + dy * dy + dz * dz);
					if (m > best) best = m;
				}
			}
		}
		if (!any) {
			for (var j = 0; j < App.allGears.length; j++) {
				var gg = App.allGears[j];
				var m2 = Math.hypot(gg.c3[0] - px, gg.c3[1] - py, gg.c3[2] - pz) + gg.r + gg.pencil.d;
				if (m2 > best) best = m2;
			}
		}
		return Math.max(0.2, best * 1.05);
	}

	// ease the camera to a framing view (fit) centred on the orbit pivot.
	// keepAngle=true preserves yaw/pitch ("reframe"); false resets the pose.
	function startFit(keepAngle) {
		if (!App.cam) App.cam = Camera3.defaultCamera();
		camFitR = fitRadius();
		var to = Camera3.cloneCamera(App.cam);
		to.dist = Camera3.fitDist(camFitR);
		pivotOut(to.target);
		if (!keepAngle) { to.yaw = Math.PI / 2; to.pitch = 0.3; }
		camEase = { from: Camera3.cloneCamera(App.cam), to: to, t0: nowMs(), dur: 300 };
		viewDirty = true;
		App.requestRender();
	}

	// camera settled after a gesture/ease: re-bake the overlay once.
	function settleCamera() {
		viewDirty = false;
		if (App.overlay.on) App.invalidateOverlay();
		App.requestRender();
	}

	// project a world offset (camera-right x radius) to get a sphere's
	// on-screen silhouette radius (pixels). a sphere silhouette is a circle.
	var rightScratch = [0, 0, 0];
	function sphereScreenRadius(g) {
		var eye = Camera3.eyeOf(App.cam, rightScratch);
		var fx = eye[0] - App.cam.target[0], fy = eye[1] - App.cam.target[1], fz = eye[2] - App.cam.target[2];
		var fl = Math.hypot(fx, fy, fz) || 1;
		fx /= fl; fy /= fl; fz /= fl;
		// camera right = normalize(cross(forward, world up +z)); cross(f,(0,0,1))
		var rx = fy * 1 - fz * 0, ry = fz * 0 - fx * 1, rz = 0;
		var rl = Math.hypot(rx, ry) || 1;
		rx = rx / rl * g.r; ry = ry / rl * g.r;
		var ctr = w2s3DC(g.c3[0], g.c3[1], g.c3[2]);
		var rim = w2s3D(g.c3[0] + rx, g.c3[1] + ry, g.c3[2] + rz);
		return { c: ctr, rad: Math.hypot(rim.x - ctr.x, rim.y - ctr.y) };
	}

	// 3D gear guidework: sphere outline circles + dial arms + faint world axes.
	// outlines only (no fill/shade) for a clean drawing. depth OFF so guides
	// stay readable. a sphere outline is a screen circle, so R.circle is exact.
	function drawSkeleton3D() {
		// faint world axes at the root (X red, Y green, Z blue). read the
		// projected scalars immediately - w2s3D returns a shared scratch.
		var ax0, ay0;
		w2s3DC(0, 0, 0); ax0 = w2sScratchC.x; ay0 = w2sScratchC.y;
		var p;
		p = w2s3D(0.4, 0, 0);
		Rseg(ax0, ay0, p.x, p.y, 1 * App.dpr, 0.5, 0.2, 0.25, 0.5, 0.2, 0.25, 0.6);
		p = w2s3D(0, 0.4, 0);
		Rseg(ax0, ay0, p.x, p.y, 1 * App.dpr, 0.2, 0.5, 0.25, 0.2, 0.5, 0.25, 0.6);
		p = w2s3D(0, 0, 0.4);
		Rseg(ax0, ay0, p.x, p.y, 1 * App.dpr, 0.25, 0.35, 0.6, 0.25, 0.35, 0.6, 0.6);
		for (var j = 0; j < App.allGears.length; j++) {
			var gg = App.allGears[j];
			var sm = sphereScreenRadius(gg);
			var ctr = sm.c;
			if (App.showCircles) {
				var rad = Math.max(sm.rad, 2 * App.dpr);
				R.circle(ctr.x, ctr.y, rad, 1.2 * App.dpr, 0.45, 0.55, 0.72, 0.5, 48);
				Rdot(ctr.x, ctr.y, 2 * App.dpr, 0.9, 0.95, 1.0, 0.9);
			}
			if (App.showDial) {
				var col = gg.parent ? [0.5, 0.55, 0.62] : [0.6, 0.66, 0.74];
				// arm to the live pen point (read scalars before the next call).
				var penS = w2s3D(gg.pen3[0], gg.pen3[1], gg.pen3[2]);
				var pxp = penS.x, pyp = penS.y;
				Rseg(ctr.x, ctr.y, pxp, pyp, 1.5 * App.dpr, col[0], col[1], col[2], col[0], col[1], col[2], 0.85);
				if (gg.parent) {
					// parent centre into the distinct center-scratch so ctr is safe.
					var pc = w2s3DC(gg.parent.c3[0], gg.parent.c3[1], gg.parent.c3[2]);
					Rseg(pc.x, pc.y, ctr.x, ctr.y, 1.2 * App.dpr, 0.4, 0.45, 0.52, 0.4, 0.45, 0.52, 0.8);
				}
				Rdot(ctr.x, ctr.y, 2 * App.dpr, 0.7, 0.75, 0.82, 0.95);
			}
		}
	}

	// pen points projected to the live 3D camera (uses stored world pen3).
	function drawPenPoints3D() {
		if (App.glowPoints) {
			R.glowBegin();
			for (var i = 0; i < App.allGears.length; i++) {
				var g = App.allGears[i];
				if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
				var pc = Gear.pencilColor(g, App.time); if (!pc) pc = [1, 1, 1];
				var sc = w2s3D(g.pen3[0], g.pen3[1], g.pen3[2]);
				R.glowPoint(sc.x, sc.y, (12 + g.pencil.width * 4) * App.dpr, pc[0], pc[1], pc[2], 1);
			}
			R.glowFlush();
		} else {
			for (var j = 0; j < App.allGears.length; j++) {
				var gg = App.allGears[j];
				if (!(gg.pencil.c1.on || gg.pencil.c2.on)) continue;
				var pc2 = Gear.pencilColor(gg, App.time); if (!pc2) pc2 = [1, 1, 1];
				var sc2 = w2s3D(gg.pen3[0], gg.pen3[1], gg.pen3[2]);
				Rdot(sc2.x, sc2.y, Math.max(2, gg.pencil.width * App.dpr), pc2[0], pc2[1], pc2[2], 1);
			}
			Rflush();
		}
	}

	// bake the projected trail into the overlay FBO (3D). mirrors bakeOverlay
	// but projects through the camera and installs the identity transform.
	// the camera stays fixed across a bake (gesture/ease end triggers it), so
	// incremental appends line up with the earlier projected pixels.
	function bakeOverlay3D(reset) {
		for (var i = 0; i < App.allGears.length; i++) {
			var g = App.allGears[i];
			if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
			if (g.count < 2 || g.stride !== 6) continue;
			var half = Math.max(0.5, (g.pencil.width / 2) * App.dpr);
			var startK = reset ? 0 : unbakedStart(g);
			if (startK < 0) continue;
			// one point before the chunk so the join test at its first point
			// sees the previous direction (projGear is linear from `from`).
			var from = startK > 0 ? startK - 1 : 0;
			var n = projectRing(g, from, g.count);
			pushIdentity(); drawGearSegments(projGear, startK - from, n - 1, half, true); popIdentity();
			g.baked = g.pushed;
			Rflush();
		}
	}

	// the projected buffer already holds screen pixels, so the 2D draw loops
	// must run with an identity transform. save the real transform / restore it
	// around a 3D trail draw (no per-frame closure; module scratch holds it).
	// a TRUE identity: Sy = +1 as well. the 2D transform negates y (world y
	// up vs screen y down); projected pixels are already screen-down, and the
	// old S=1-only identity mirrored every 3D trail to negative y (off the
	// canvas / upside down relative to the spheres).
	var xformSave = { S: 1, Sy: -1, pan: ZERO_PAN, cx0: 0, cy0: 0 };
	function pushIdentity() {
		xformSave.S = App.S; xformSave.Sy = App.Sy; xformSave.pan = App.view.pan;
		xformSave.cx0 = App.cx0; xformSave.cy0 = App.cy0;
		App.S = 1; App.Sy = 1; App.view.pan = ZERO_PAN; App.cx0 = 0; App.cy0 = 0;
	}
	function popIdentity() {
		App.S = xformSave.S; App.Sy = xformSave.Sy; App.view.pan = xformSave.pan;
		App.cx0 = xformSave.cx0; App.cy0 = xformSave.cy0;
	}

	// draw all projected 3D trails (shared by gesture direct-draw and the
	// overlay-off path). decimates when `budget` is given and segs exceed it.
	function drawTrails3D(budget) {
		var pencilGears = 0, totalSegs = 0;
		for (var gi = 0; gi < App.allGears.length; gi++) {
			var gg = App.allGears[gi];
			if (!(gg.pencil.c1.on || gg.pencil.c2.on)) continue;
			pencilGears++; totalSegs += Math.max(0, gg.count - 1);
		}
		var decimate = budget > 0 && totalSegs > budget;
		var perGearBudget = Math.max(1, Math.floor(budget / Math.max(1, pencilGears)));
		for (var gj = 0; gj < App.allGears.length; gj++) {
			var g3 = App.allGears[gj];
			if (!(g3.pencil.c1.on || g3.pencil.c2.on) || g3.stride !== 6 || g3.count < 2) continue;
			var half3 = Math.max(0.5, (g3.pencil.width / 2) * App.dpr);
			var n = projectRing(g3, 0, g3.count);
			pushIdentity();
			if (decimate) drawGearSegmentsDecimated(projGear, half3, perGearBudget);
			else drawGearSegments(projGear, 0, n - 1, half3);
			popIdentity();
			Rflush();
		}
	}

	// ---- glass sphere pass (shared by 2D and 3D) ----------------------------
	// every gear is drawn as a ray-shaded glass shell impostor (see render.js).
	// occlusion is painter + blend: spheres are sorted far -> near each render
	// (3D: camera depth; 2D: radius, so parents paint under the children
	// mounted inside them) and shaded in two passes - far shell before the
	// trail layer, near shell after it - so trails and child spheres inside a
	// parent read through its glass. a sphere's trail strand crossing depth
	// layers is not depth-tested (the trail vertex stream has no z), which is
	// fine for glass: "in front" vs "inside" differ only by one wall's tint.
	var SPH_WALL = 0.16;                    // relative glass wall thickness
	var sphKeys = new Float32Array(MAX_GEARS);   // sort keys (far -> near desc)
	var sphCx = new Float32Array(MAX_GEARS);
	var sphCy = new Float32Array(MAX_GEARS);
	var sphRad = new Float32Array(MAX_GEARS);
	var sphOrder = [];                      // permutation over the sorted keys
	var sphValid = 0;                        // spheres batched this render
	var sphEye = [0, 0, 0];
	var sphBasis = { right: new Float32Array(3), up: new Float32Array(3), out: new Float32Array(3) };
	var sphTint = new Float32Array([0.62, 0.85, 1.0]);
	var sphTintParsed = '';
	var sphUniforms = { right: sphBasis.right, up: sphBasis.up, out: sphBasis.out, tint: sphTint, opac: 0, wall: SPH_WALL, pass: 0 };

	function sphCmp(a, b) { return sphKeys[b] - sphKeys[a]; }

	function parseSphTint() {
		if (App.sphereColor === sphTintParsed) return;
		sphTintParsed = App.sphereColor;
		sphTint[0] = parseInt(sphTintParsed.substr(1, 2), 16) / 255;
		sphTint[1] = parseInt(sphTintParsed.substr(3, 2), 16) / 255;
		sphTint[2] = parseInt(sphTintParsed.substr(5, 2), 16) / 255;
	}

	function collectSpheres(is3) {
		R.sphReset();
		sphValid = 0;
		parseSphTint();
		var bx = sphBasis.right, by = sphBasis.up, bo = sphBasis.out;
		var n = Math.min(App.allGears.length, MAX_GEARS);
		var i, g, rp;
		if (is3) {
			var eye = Camera3.eyeOf(App.cam, sphEye);
			var t = App.cam.target;
			var fx = t[0] - eye[0], fy = t[1] - eye[1], fz = t[2] - eye[2];
			var fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
			// camera basis in world (same construction as mat4LookAt):
			// right = normalize(f x worldUp), up = right x f, out = -f.
			var rx = fy, ry = -fx, rr = Math.hypot(rx, ry) || 1; rx /= rr; ry /= rr;
			var ux = ry * fz, uy = -rx * fz, uz = rx * fy - ry * fx;
			bx[0] = rx; bx[1] = ry; bx[2] = 0;
			by[0] = ux; by[1] = uy; by[2] = uz;
			bo[0] = -fx; bo[1] = -fy; bo[2] = -fz;
			for (i = 0; i < n; i++) {
				g = App.allGears[i];
				sphOrder[i] = i;
				var c = w2s3DC(g.c3[0], g.c3[1], g.c3[2]);
				var rim = w2s3D(g.c3[0] + rx * g.r, g.c3[1] + ry * g.r, g.c3[2]);
				rp = Math.hypot(rim.x - c.x, rim.y - c.y);
				sphCx[i] = c.x; sphCy[i] = c.y; sphRad[i] = rp;
				sphKeys[i] = rp >= 0.75 ? (fx * (g.c3[0] - eye[0]) + fy * (g.c3[1] - eye[1]) + fz * (g.c3[2] - eye[2])) : -1e30;
			}
		} else {
			// 2D: the flat figure sits in the virtual XZ plane; view it from a
			// slightly raised angle so the glass highlights sit naturally.
			bx[0] = 1; bx[1] = 0; bx[2] = 0;
			by[0] = 0; by[1] = 0; by[2] = 1;
			var oi = 1 / Math.hypot(1.35, 0.45);
			bo[0] = 0; bo[1] = -1.35 * oi; bo[2] = 0.45 * oi;
			var panX = App.view.pan[0], panY = App.view.pan[1];
			var S = App.S, cx0 = App.cx0, cy0 = App.cy0;
			for (i = 0; i < n; i++) {
				g = App.allGears[i];
				sphOrder[i] = i;
				rp = g.r * S;
				sphCx[i] = cx0 + (g.cx + panX) * S;
				sphCy[i] = cy0 - (g.cy + panY) * S;
				sphRad[i] = rp;
				sphKeys[i] = rp >= 0.75 ? g.r : -1e30;
			}
		}
		sphOrder.length = n;
		sphOrder.sort(sphCmp);
		for (i = 0; i < n; i++) {
			var gi = sphOrder[i];
			if (sphKeys[gi] <= -1e29) break;   // sub-pixel spheres stay 2D outlines
			R.sphPush(sphCx[gi], sphCy[gi], sphRad[gi]);
			sphValid++;
		}
	}

	// one shell pass: re-grabs the scene texture (the caller draws the trail
	// layer between the far and near passes, so the near shell refracts it).
	function drawSpherePass(pass) {
		if (!App.spheres || !sphValid) return;
		R.sphGrab();
		sphUniforms.opac = 1 - App.sphereTrans;
		sphUniforms.pass = pass;
		R.sphDraw(sphUniforms);
	}

	// ---- render modes (shared by 2D and 3D) --------------------------------
	// two ways to put the trail on screen:
	//   overlay ON  ("keep"): the trail is baked into a cached FBO once per
	//     view and only the points pushed since the last bake are appended
	//     each frame; the FBO is blitted under the live gear skeleton. any
	//     change of the view transform (2D pan/zoom, 3D camera orbit / dolly
	//     / pan / fit / auto-rotate / pivot change) invalidates the cache.
	//   overlay OFF ("redraw"): the whole ring is re-projected and redrawn
	//     from scratch every render (bounded by the trail cap).
	// during an active gesture both modes draw directly (decimated when the
	// ring is bigger than the tuned budget) and the overlay re-bakes once on
	// settle. the 3D variant projects the world ring through the camera into
	// projScratch first and draws under a true identity transform.

	// the cached overlay is only valid for the view it was baked with. every
	// code path that moves the view is supposed to invalidate it (gesture
	// end, wheel settle, fit ease, auto-rotate stop, pivot change, resize),
	// but the render checks the actual key too: a bake under a stale view is
	// exactly the "trail drawn under a different transform than the gears"
	// failure, and this makes the cache correct by construction rather than
	// by every caller remembering. plain fields, mutated in place.
	var bakedView = { dim: '', S: 0, cx0: 0, panX: 0, panY: 0, yaw: 0, pitch: 0, dist: 0, tx: 0, ty: 0, tz: 0 };
	function rememberBakedView(is3) {
		bakedView.dim = App.dim;
		bakedView.S = App.S; bakedView.cx0 = App.cx0;
		bakedView.panX = App.view.pan[0]; bakedView.panY = App.view.pan[1];
		if (!is3) return;
		var c = App.cam;
		bakedView.yaw = c.yaw; bakedView.pitch = c.pitch; bakedView.dist = c.dist;
		bakedView.tx = c.target[0]; bakedView.ty = c.target[1]; bakedView.tz = c.target[2];
	}
	function viewMatchesBake(is3) {
		if (bakedView.dim !== App.dim || bakedView.S !== App.S || bakedView.cx0 !== App.cx0) return false;
		if (bakedView.panX !== App.view.pan[0] || bakedView.panY !== App.view.pan[1]) return false;
		if (!is3) return true;
		var c = App.cam;
		return bakedView.yaw === c.yaw && bakedView.pitch === c.pitch && bakedView.dist === c.dist &&
			bakedView.tx === c.target[0] && bakedView.ty === c.target[1] && bakedView.tz === c.target[2];
	}

	// first logical ring index the overlay has not painted yet, or -1 when
	// nothing new arrived. `pushed - baked` points are new; the segment that
	// joins them to the last baked point starts one before. eviction only
	// drops points older than that (the ring keeps >= count points), so the
	// index is clamped, never wrapped.
	function unbakedStart(g) {
		var fresh = g.pushed - g.baked;
		if (fresh <= 0) return -1;
		return Math.max(0, g.count - fresh - 1);
	}

	function bakeOverlay(reset) {
		for (var i = 0; i < App.allGears.length; i++) {
			var g = App.allGears[i];
			if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
			if (g.count < 2) continue;
			var half = Math.max(0.5, (g.pencil.width / 2) * App.dpr);
			var startK = reset ? 0 : unbakedStart(g);
			if (startK < 0) continue;
			drawGearSegments(g, startK, g.count - 1, half, true);
			g.baked = g.pushed;
			Rflush();
		}
	}

	// full direct draw of every trail at the live 2D view; decimated when the
	// total segment count exceeds `budget` (0 = never decimate).
	function drawTrails2D(budget) {
		var pencilGears = 0, totalSegs = 0;
		for (var gi = 0; gi < App.allGears.length; gi++) {
			var gg = App.allGears[gi];
			if (!(gg.pencil.c1.on || gg.pencil.c2.on)) continue;
			pencilGears++;
			totalSegs += Math.max(0, gg.count - 1);
		}
		var decimate = budget > 0 && totalSegs > budget;
		var perGearBudget = Math.max(1, Math.floor(budget / Math.max(1, pencilGears)));
		for (var i = 0; i < App.allGears.length; i++) {
			var g = App.allGears[i];
			if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
			var half = Math.max(0.5, (g.pencil.width / 2) * App.dpr);
			if (decimate) drawGearSegmentsDecimated(g, half, perGearBudget);
			else drawGearSegments(g, 0, g.count - 1, half);
			Rflush();
		}
	}

	// keep mode draws the trail into the FBO without end caps (a cap baked at
	// every append would bead the cached line). the round tip of each trail
	// is drawn live on screen instead, at the newest ring point, so the
	// cached picture matches what the redraw mode paints.
	function drawTrailTips(is3) {
		for (var i = 0; i < App.allGears.length; i++) {
			var g = App.allGears[i];
			if (!(g.pencil.c1.on || g.pencil.c2.on) || g.count < 2) continue;
			var half = Math.max(0.5, (g.pencil.width / 2) * App.dpr);
			if (half < 1.0) continue;
			var st = g.stride, o = ((g.head + g.count - 1) % g.cap) * st;
			var sx, sy;
			if (is3) { var sc = w2s3D(g.ring[o], g.ring[o + 1], g.ring[o + 2]); sx = sc.x; sy = sc.y; }
			else {   // inline w2s (no per-frame object)
				sx = App.cx0 + (g.ring[o] + App.view.pan[0]) * App.S;
				sy = App.cy0 + (g.ring[o + 1] + App.view.pan[1]) * App.Sy;
			}
			Rdot(sx, sy, half, g.ring[o + st - 3], g.ring[o + st - 2], g.ring[o + st - 1], 1);
		}
	}

	// gear skeleton + pen markers on top of whatever trail pass ran.
	function drawGuides(is3) {
		if (is3) drawSkeleton3D(); else drawGearOverlay();
		Rflush();
		if (!App.showPoints) return;
		if (is3) drawPenPoints3D(); else drawPenPoints();
	}

	function drawTrailsDirect(is3, budget) {
		if (is3) { R.depth(true); drawTrails3D(budget); R.depth(false); }
		else drawTrails2D(budget);
	}

	function bakeTrails(is3, reset) {
		if (is3) { R.depth(true); bakeOverlay3D(reset); R.depth(false); }
		else bakeOverlay(reset);
	}

	function renderScene() {
		var is3 = App.dim === '3d';
		if (is3) {
			if (!App.cam) App.cam = Camera3.defaultCamera();
			ensureProjBuffer();
			Camera3.setViewport(App.size * App.dpr, App.size * App.dpr);
			// the orbit target is a fixed pivot set at selection (retargetCamera);
			// do not chase the moving gear here or the baked trail desyncs.
			Camera3.viewProj(matM, App.cam, App.size * App.dpr, App.size * App.dpr);
		}
		var sphereOn = App.spheres;
		if (sphereOn) collectSpheres(is3);
		if (!App.drawTrails) {                 // trail hidden: skeleton + points only
			R.begin(BG);
			drawSpherePass(0);
			drawSpherePass(1);
			drawGuides(is3);
			return;
		}
		if (isGestureActive()) {               // gesture: direct draw at the live view
			R.begin(BG);
			drawSpherePass(0);
			drawTrailsDirect(is3, is3 ? GESTURE_SEG_BUDGET_3D : GESTURE_SEG_BUDGET);
			drawSpherePass(1);
			drawGuides(is3);
			return;
		}
		if (App.overlay.on) {                  // keep mode: cached FBO + append
			R.overlay.bind();
			if (App.overlay.invalid || !viewMatchesBake(is3)) {
				R.overlay.clear();
				App.overlay.invalid = false;
				bakeTrails(is3, true);
				rememberBakedView(is3);
				viewDirty = false;             // overlay now matches the settled view
			} else {
				bakeTrails(is3, false);
			}
			R.overlay.unbind();
			R.begin(BG);
			drawSpherePass(0);
			R.overlay.blitToScreen();
			drawTrailTips(is3);
			if (sphereOn) Rflush();            // tips must be pixels before the grab
			drawSpherePass(1);
			drawGuides(is3);
			return;
		}
		R.begin(BG);                           // redraw mode: full trail every render
		drawSpherePass(0);
		drawTrailsDirect(is3, 0);
		drawSpherePass(1);
		drawGuides(is3);
	}

	function frame(now) {
		var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
		last = now;
		// background whole-mode bake: a time-sliced chunk per frame. it runs
		// even while paused (it is a computation, not an animation) and paints
		// progressively, so the UI never blocks on a long period.
		if (wholeJob) stepWholeJob();
		// 3D camera ease (fit) advances per frame; on completion it re-bakes.
		if (App.dim === '3d' && camEase) {
			var t = (now - camEase.t0) / camEase.dur;
			if (t >= 1) { t = 1; Camera3.lerpCam(App.cam, camEase.from, camEase.to, 1); camEase = null; settleCamera(); }
			else { Camera3.lerpCam(App.cam, camEase.from, camEase.to, t); App.requestRender(); }
		}
		if (!App.paused) {
			App.time += dt;
			if (App.mode === 'animate') {               // animate advances sim + trail
				var is3 = App.dim === '3d';
				if (is3) {
					// two-axis nested frames: each gear precesses about its own
					// spin + tilt axes; store the live 3D pen point (x,y,z).
					for (var r3 = 0; r3 < App.roots.length; r3++)
						Gear.update3(App.roots[r3], null, dt, App.globalSpeed);
				} else {
					for (var i = 0; i < App.roots.length; i++)
						Gear.update(App.roots[i], null, 0, 0, 0, dt, App.globalSpeed);
				}
				for (var k = 0; k < App.allGears.length; k++) {
					var g = App.allGears[k];
					if (g.pencil.c1.on || g.pencil.c2.on) {
						var col = Gear.pencilColor(g, App.time);
						if (!col) continue;
						if (is3) Gear.pushPoint(g, g.pen3[0], g.pen3[1], g.pen3[2], col);
						else Gear.pushPoint(g, g.penx, g.peny, col);
					}
				}
				App.needsRender = true;
			}
			// whole mode is static once baked: render only on invalidation
			// (scene edits, view changes, overlay toggles), never per frame.
		}
		// 3D auto-rotate: slow yaw drift keeps the scene moving per frame.
		if (App.dim === '3d' && App.autoRotate && !App.paused) {
			if (App.cam) Camera3.orbitBy(App.cam, dt * 0.2, 0);
			App.requestRender();
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
		var initApp = Settings.defaultApp();
		var rawScene = null;
		try {
			var raw = localStorage.getItem(Settings.STORE_KEY);
			if (raw) { var parsed = JSON.parse(raw); restored = Gear.deserialize(parsed); rawScene = parsed; }
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
				rawScene = window.SETTINGS;
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
		Settings.applyApp(initApp, App, GUI);
		// restore dimension / spin / camera (top-level scene fields).
		applyScene3D(rawScene);

		computeLayout();
		window.addEventListener('resize', computeLayout);

		App.canvas.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		App.canvas.addEventListener('pointercancel', onCancel);
		App.canvas.addEventListener('wheel', onWheel, { passive: false });
		App.canvas.addEventListener('dblclick', onDblClick);
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
