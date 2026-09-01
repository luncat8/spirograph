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
		showCircles: true,
		showDial: false,
		showPoints: false,
		glowPoints: false,
		drawTrails: true,
		currentPeriod: null,
		overlay: { on: true, invalid: true }
	};

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

	// pick nearest of +-k/d for d in 1..12 (so whole-mode curves close neatly).
	function snapNice(v) {
		var best = v, bestErr = Infinity;
		for (var den = 1; den <= 12; den++) {
			for (var num = 0; num <= den; num++) {
				var cand = num / den;
				if (cand > 1) continue;
				var e1 = Math.abs(v - cand);
				if (e1 < bestErr) { bestErr = e1; best = cand; }
				var e2 = Math.abs(v + cand);
				if (e2 < bestErr) { bestErr = e2; best = -cand; }
			}
		}
		return best;
	}
	App.snapNice = snapNice;

	// after a structural scene change, whole mode must recompute (others just repaint).
	function afterSceneChange() {
		if (App.mode === 'whole') App.recomputeWhole();
		else { markDirty(); if (App.overlay.on) App.invalidateOverlay(); }
	}

	// snap every gear's speed to a low-denominator fraction so whole-mode curves
	// close with a small, clean period (the default scene's raw 0.17/0.41 would
	// otherwise need ~1100 turns). only mutates while in whole mode.
	function snapAllSpeeds() {
		for (var i = 0; i < App.allGears.length; i++)
			App.allGears[i].speed = snapNice(App.allGears[i].speed);
	}

	App.recomputeWhole = function () {
		if (App.mode !== 'whole') return;
		snapAllSpeeds();
		var period = Gear.detectPeriod(App.roots);
		App.currentPeriod = period;
		var sampleCount = Math.max(2, Math.min(Math.round(period.turns * 200), Gear.CAP));
		Gear.computeWhole(App.roots, period, sampleCount);
		if (App.overlay.on) App.invalidateOverlay();
		else markDirty();
		GUI.setPeriod(period.turns, period.capped);
	};

	App.onGearParam = function (gear, kind) {
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
		if (m === 'whole') App.recomputeWhole();      // fills ring + bakes
		else if (m === 'animate') App.clearTraces();   // fresh tracing
		GUI.setMode(m);
		GUI.setColorMode(App.colorMode);
		GUI.refreshAnimMode && GUI.refreshAnimMode();
		markDirty();
		if (App.overlay.on) App.invalidateOverlay();
	};

	App.resetScene = function () {
		App.roots = Gear.defaultScene();
		for (var i = 0; i < App.roots.length; i++) Gear.initRuntime(App.roots[i], null);
		App.view = { zoom: 1, pan: [0, 0] };
		App.globalSpeed = 1;
		recomputeTransform();
		rebuildAll();
		applyColorMode();
		GUI.closeMenu();
		afterSceneChange();
	};

	App.addSubGear = function (parent) {
		var child = Gear.makeGear({
			r: Math.max(0.05, parent.r * 0.45),
			speed: 0.3,
			internal: true,
			pencil: { d: parent.r * 0.2, width: 2, c1: { on: true, color: '#ffffff' }, c2: { on: false, color: '#ff8a3d' } }
		});
		// new sub-gear inherits the global color mode
		child.pencil.animMode = App.colorMode;
		parent.children.push(child);
		Gear.initRuntime(child, parent);
		Gear.update(child, parent, parent.cx, parent.cy, parent.phase != null ? parent.phase : parent.rot, 0, App.globalSpeed);
		rebuildAll();
		afterSceneChange();
		var sc = w2s(child.cx, child.cy);
		GUI.openMenu(child, (sc.x / App.dpr) + App.canvas.getBoundingClientRect().left,
			(sc.y / App.dpr) + App.canvas.getBoundingClientRect().top);
	};

	App.removeGear = function (gear) {
		if (!gear.parent) return;
		var sibs = gear.parent.children;
		var idx = sibs.indexOf(gear);
		if (idx >= 0) sibs.splice(idx, 1);
		rebuildAll();
		GUI.closeMenu();
		afterSceneChange();
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
		return Gear.serialize(App.roots, App.view, App.globalSpeed, App.colorMode);
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

	function loadObject(obj) {
		var d = Gear.deserialize(obj);
		App.roots = d.roots;
		App.view = d.view;
		App.globalSpeed = d.globalSpeed;
		App.colorMode = colorModeFromScene(d);
		rebuildAll();
		applyColorMode();
		GUI.closeMenu();
		GUI.setColorMode(App.colorMode);
		recomputeTransform();
		afterSceneChange();
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
				if (g) GUI.openMenu(g, e.clientX, e.clientY);
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
		var cap = Gear.CAP, head = g.head, ring = g.ring;
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
		var fakeGear = { ring: testRing, head: 0, count: 0 };
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
			var half = Math.max(0.5, (g.pencil.width / 2) * App.dpr);
			if (reset) {
				if (g.count < Gear.CAP) {
					drawGearSegments(g, 0, g.count - 1, half);
					g.drawn = g.count - 1;
				} else {
					drawGearSegments(g, 0, Gear.CAP - 1, half);
					g.drawnNewestRing = (g.head + Gear.CAP - 1) % Gear.CAP;
				}
			} else {
				if (g.count < Gear.CAP) {
					drawGearSegments(g, g.drawn, g.count - 1, half);
					g.drawn = g.count - 1;
				} else {
					var newest = (g.head + Gear.CAP - 1) % Gear.CAP;
					if (newest !== g.drawnNewestRing) {
						drawGearSegments(g, Gear.CAP - 2, Gear.CAP - 1, half);
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
		try {
			var raw = localStorage.getItem(STORE_KEY);
			if (raw) restored = Gear.deserialize(JSON.parse(raw));
		} catch (e) { App.autosaveOK = false; }

		if (restored) {
			App.roots = restored.roots;
			App.view = restored.view;
			App.globalSpeed = restored.globalSpeed;
			App.colorMode = colorModeFromScene(restored);
		} else if (window.SETTINGS && window.SETTINGS.gears && window.SETTINGS.gears.length) {
			try {
				var d = Gear.deserialize(window.SETTINGS);
				App.roots = d.roots;
				App.view = d.view;
				App.globalSpeed = d.globalSpeed;
				App.colorMode = colorModeFromScene(d);
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

		computeLayout();
		window.addEventListener('resize', computeLayout);

		App.canvas.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		App.canvas.addEventListener('pointercancel', onCancel);
		App.canvas.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('keydown', onKey);
		window.addEventListener('beforeunload', saveLocal);

		requestAnimationFrame(frame);
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
