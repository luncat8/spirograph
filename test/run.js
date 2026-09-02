// test/run.js - headless checks for the gear math and the live app.
// run: node test/run.js      (no dependencies, no build)
'use strict';

var Gear = require('../js/gear.js');
var boot = require('./stub-dom.js').boot;

var pass = 0, fail = 0;
function ok(cond, name, extra) {
	if (cond) { pass++; return; }
	fail++;
	console.log('FAIL: ' + name + (extra != null ? '  [' + extra + ']' : ''));
}
function near(a, b, eps, name) { ok(Math.abs(a - b) <= (eps || 1e-9), name, a + ' vs ' + b); }

function scene() {
	var roots = Gear.defaultScene();
	for (var i = 0; i < roots.length; i++) Gear.initRuntime(roots[i], null);
	return roots;
}

// ---- gear.js ---------------------------------------------------------
(function ringGrowth() {
	var g = Gear.makeGear({ trailCap: 1000 });
	Gear.initRuntime(g, null);
	ok(g.ring === null && g.cap === 0, 'ring starts unallocated');
	var col = [1, 0, 0];
	for (var i = 0; i < 5000; i++) Gear.pushPoint(g, i * 0.01, 0, col);
	ok(g.cap <= 1000, 'ring never exceeds trailCap', g.cap);
	ok(g.count === 1000, 'ring holds exactly trailCap points', g.count);
	var oldest = g.ring[g.head * 5];
	ok(oldest > 39, 'oldest points evicted on wrap', oldest);
	g.trailCap = 200;
	Gear.applyTrailCap(g);
	ok(g.count === 200, 'lowering trailCap evicts oldest', g.count);
})();

(function periodDetect() {
	var roots = scene();
	var t0 = Date.now();
	var p = Gear.detectPeriod(roots, 2000);
	ok(Date.now() - t0 < 50, 'detectPeriod is fast', (Date.now() - t0) + 'ms');
	ok(p.exact, 'default scene closes exactly');
	var r2 = scene();
	r2[0].speed = Math.SQRT2 / 3; r2[0].children[0].speed = Math.PI / 7;
	var p2 = Gear.detectPeriod(r2, 500);
	ok(!p2.exact, 'irrational speeds report approximate closure');
	ok(p2.turns >= 1 && p2.turns <= 500, 'approximate period stays within the limit', p2.turns);
	ok(p2.err > 0 && isFinite(p2.err), 'approximate closure reports a gap', p2.err);
	// hidden gears must not constrain the period
	var r3 = scene();
	r3[0].pencil.c1.on = false; r3[0].pencil.c2.on = false;
	r3[0].children[0].pencil.c1.on = false;
	r3[0].children[0].pencil.c2.on = false;
	ok(Gear.detectPeriod(r3, 2000).turns === 1, 'no pencils -> period 1');
})();

(function wholeClosure() {
	var roots = scene();
	var p = Gear.detectPeriod(roots, 2000);
	Gear.computeWhole(roots, p, 4000);
	var g = roots[0].children[0];
	var a = g.head, b = (g.head + g.count - 1) % g.cap;
	var gap = Math.hypot(g.ring[a * 5] - g.ring[b * 5], g.ring[a * 5 + 1] - g.ring[b * 5 + 1]);
	ok(gap < 1e-6, 'baked curve closes on itself', gap);

	// chunked bake == blocking bake
	var r2 = scene();
	var job = Gear.startWhole(r2, p, 4000);
	var steps = 0;
	while (!Gear.stepWhole(job, 97)) steps++;
	ok(steps > 5, 'chunked bake really resumes across steps', steps);
	var h = r2[0].children[0];
	ok(h.count === g.count, 'chunked point count matches', h.count + ' vs ' + g.count);
	var same = true;
	for (var i = 0; i < h.count * 5; i++) if (Math.abs(h.ring[i] - g.ring[i]) > 1e-9) { same = false; break; }
	ok(same, 'chunked bake is bit-identical to the blocking one');
})();

(function phaseOffsets() {
	// phase0 must place a sibling as a RIGID ROTATION of the same figure (a
	// rosette), not merely as a phase shift along one shared curve.
	function build(p0) {
		var root = Gear.makeGear({ r: 0.6, speed: 0, pencil: { d: 0.3, c1: { on: false }, c2: { on: false } } });
		var kid = Gear.makeGear({
			r: 0.225, speed: 1, phase0: p0, internal: true,
			pencil: { d: 0.18, width: 2, c1: { on: true, color: '#ffd24d' }, c2: { on: false } }
		});
		root.children.push(kid);
		Gear.initRuntime(root, null);
		return { root: root, kid: kid };
	}
	var A = build(0), B = build(2 * Math.PI / 3);
	var p = Gear.detectPeriod([A.root], 2000);
	ok(p.turns === 3, 'nice ratios give a short period', p.turns);
	Gear.computeWhole([A.root], p, 1200);
	Gear.computeWhole([B.root], p, 1200);
	function pt(g, j) { var i = (g.head + j) % g.cap; return [g.ring[i * 5], g.ring[i * 5 + 1]]; }
	var c = Math.cos(2 * Math.PI / 3), s = Math.sin(2 * Math.PI / 3);
	var worst = 0;
	for (var j = 0; j < Math.min(A.kid.count, B.kid.count); j += 7) {
		var a = pt(A.kid, j), b = pt(B.kid, j);
		worst = Math.max(worst, Math.hypot(a[0] * c - a[1] * s - b[0], a[0] * s + a[1] * c - b[1]));
	}
	ok(worst < 1e-6, 'phase0 rotates the whole figure (rosette symmetry)', worst);

	// and it must spread siblings in the animate integrator too
	var two = build(0);
	var second = Gear.makeGear({ r: 0.225, speed: 1, phase0: Math.PI, internal: true, pencil: { d: 0.18, c1: { on: true }, c2: { on: false } } });
	two.root.children.push(second);
	Gear.initRuntime(two.root, null);
	Gear.update(two.root, null, 0, 0, 0, 0.5, 1);
	ok(Math.hypot(two.kid.cx - second.cx, two.kid.cy - second.cy) > 0.1, 'animate mode spreads siblings');
	near(two.kid.rot, second.rot, 1e-12, 'phase0 is a mount offset, not integrated state');
})();

(function serialization() {
	var roots = scene();
	roots[0].children[0].phase0 = 1.234;
	roots[0].children[0].trailCap = 3500;
	var obj = Gear.serialize(roots, { zoom: 1, pan: [0, 0] }, 1, 'cycles');
	var back = Gear.deserialize(JSON.parse(JSON.stringify(obj)));
	near(back.roots[0].children[0].phase0, 1.234, 1e-9, 'phase0 survives a save/load');
	ok(back.roots[0].children[0].trailCap === 3500, 'trailCap survives a save/load');
})();

// ---- live app (real main.js/gui.js on DOM stubs) ---------------------
var w = boot();
var App = w.App;
ok(!!App, 'app booted');
ok(App.allGears.length === 2, 'default scene has 2 gears', App.allGears.length);

(function levelsFromZero() {
	App.applyLevel(1, 3);
	var kids = App.roots[0].children;
	ok(kids.length === 3, 'lvl 1 = 3 creates three children', kids.length);
	near(kids[0].phase0, 0, 1e-12, 'child 0 at 0 deg');
	near(kids[1].phase0, 2 * Math.PI / 3, 1e-12, 'child 1 at 120 deg');
	near(kids[2].phase0, 4 * Math.PI / 3, 1e-12, 'child 2 at 240 deg');
	ok(App.levelCount(1) === 3, 'level slider reads back 3');
	App.applyLevel(1, 0);
	ok(App.roots[0].children.length === 0, 'lvl 1 = 0 empties the level');
	ok(App.maxDepth() === 0, 'level slider count collapses to lvl 1 only');
	ok(App.allGears.length === 1, 'only the root remains', App.allGears.length);
})();

(function deepLevels() {
	App.applyLevel(1, 2);
	App.applyLevel(2, 2);
	App.applyLevel(3, 2);
	App.applyLevel(4, 2);
	ok(App.gearsAtDepth(1).length === 2, 'depth 1 count');
	ok(App.gearsAtDepth(2).length === 4, 'depth 2 count');
	ok(App.gearsAtDepth(3).length === 8, 'depth 3 count');
	ok(App.gearsAtDepth(4).length === 16, 'depth 4 count', App.gearsAtDepth(4).length);
	ok(App.maxDepth() === 4, 'lvl 5 slider becomes available', App.maxDepth());
	var d4 = App.gearsAtDepth(4);
	var spread = 0;
	for (var i = 0; i < d4.length; i++) if (Math.abs(d4[i].phase0 - Math.PI) < 1e-9) spread++;
	ok(spread === 8, 'half of the depth-4 gears sit at 180 deg', spread);
	// distinct world positions (deep levels really place gears apart)
	w.tick(2);
	var uniq = {};
	for (var j = 0; j < d4.length; j++) uniq[d4[j].cx.toFixed(4) + ',' + d4[j].cy.toFixed(4)] = 1;
	ok(Object.keys(uniq).length === 16, 'depth-4 gears occupy 16 distinct positions', Object.keys(uniq).length);
	ok(App.levelCount(5) === 0, 'lvl 5 reads 0 (empty level)');
	// a deep level must be a rigid rosette: rotating the whole tree by 360/N
	// maps depth-2 gear positions onto each other
	App.resetScene();
	App.applyLevel(1, 3);
	App.applyLevel(2, 2);
	w.tick(2);
	var d2 = App.gearsAtDepth(2);
	var cs = Math.cos(2 * Math.PI / 3), sn = Math.sin(2 * Math.PI / 3);
	var matched = 0;
	for (var m = 0; m < d2.length; m++) {
		var rx = d2[m].cx * cs - d2[m].cy * sn, ry = d2[m].cx * sn + d2[m].cy * cs;
		for (var n2 = 0; n2 < d2.length; n2++) {
			if (Math.hypot(d2[n2].cx - rx, d2[n2].cy - ry) < 1e-9) { matched++; break; }
		}
	}
	ok(matched === d2.length, 'depth-2 gears form a 3-fold rosette', matched + '/' + d2.length);

	// removing a middle level removes everything below it
	App.applyLevel(1, 2);
	App.applyLevel(2, 2);
	App.applyLevel(3, 2);
	App.applyLevel(4, 2);
	App.applyLevel(3, 0);
	ok(App.maxDepth() === 2, 'lvl 3 = 0 removes levels 3 and 4', App.maxDepth());
})();

(function gearLimit() {
	App.resetScene();
	App.applyLevel(1, 12);
	App.applyLevel(2, 12);
	var before = App.allGears.length;
	App.applyLevel(3, 12);            // 12*12*12 would blow past the guard
	ok(App.allGears.length === before, 'tree-size guard blocks a runaway level', App.allGears.length);
	App.resetScene();
})();

(function symmetry() {
	App.applyLevel(1, 3);
	App.setSymmetry(true);
	var kids = App.roots[0].children;
	kids[0].speed = 0.75;
	App.applySymmetry(kids[0], 'geom');
	ok(kids[1].speed === 0.75 && kids[2].speed === 0.75, 'symmetry mirrors speed to the level');
	ok(kids[1].phase0 !== kids[0].phase0, 'symmetry does not mirror phase');
	kids[0].pencil.c1.color = '#00ff00';
	App.applySymmetry(kids[0], 'color');
	ok(kids[2].pencil.c1.color === '#00ff00', 'symmetry mirrors color');
	ok(kids[2].pencil.c1 !== kids[0].pencil.c1, 'mirrored color slots are not shared objects');
	App.setSymmetry(false);
	kids[0].pencil.width = 9;
	App.applySymmetry(kids[0], 'width');
	ok(kids[1].pencil.width !== 9, 'symmetry off = no mirroring');
	App.resetScene();
})();

(function radiusScalesSubtree() {
	var root = App.roots[0], child = root.children[0];
	var ratio = child.r / root.r;
	App.setGearRadius(root, root.r * 0.5);
	near(child.r / root.r, ratio, 1e-12, 'resizing a gear keeps child ratios (period stable)');
	App.resetScene();
})();

(function wholeModeBackgroundBake() {
	App.setMode('whole');
	ok(App.currentPeriod != null, 'whole mode detected a period');
	// speeds must have landed on the valid grid
	var choices = App.speedChoices();
	var onGrid = true;
	for (var i = 0; i < App.allGears.length; i++) {
		if (choices.indexOf(App.allGears[i].speed) < 0) onGrid = false;
	}
	ok(onGrid, 'entering whole mode snaps speeds onto slider positions');
	var pencil = App.allGears[1];
	ok(pencil.count === 0, 'bake has not finished synchronously (runs in background)');
	var guard = 0;
	while (pencil.count === 0 && guard++ < 200) w.tick(1);
	ok(pencil.count > 0, 'background bake fills the ring over frames', pencil.count);
	guard = 0;
	while (guard++ < 4000 && pencil.count < 1000) w.tick(1);
	ok(pencil.count > 1000, 'bake progresses to a full figure', pencil.count);
	// slider edit while baking must not throw and must restart the job
	App.onGearParam(pencil, 'geom');
	w.tick(3);
	ok(true, 'editing during a bake is safe');
	var dia = App.diameterChoices(pencil);
	ok(dia.length > 4, 'whole mode offers discrete diameters', dia.length);
	ok(dia.indexOf(pencil.parent.r * 2) >= 0, 'parent diameter itself is a valid position');
	App.setMode('animate');
})();

(function trailCapLive() {
	var g = App.allGears[1];
	g.trailCap = 600;
	App.onGearParam(g, 'trail');
	for (var i = 0; i < 400; i++) w.tick(1, 32);
	ok(g.count <= 600, 'animate trail respects the per-pencil cap', g.count);
	ok(g.cap <= 600, 'ring memory follows the cap', g.cap);
})();

(function contextMenu() {
	App.resetScene();
	var GUI = w.GUI;
	var gear = App.allGears[1];

	function rows() {
		var out = [];
		var kids = w.byId.ctxmenu.children;
		for (var i = 0; i < kids.length; i++) if (kids[i].input) out.push(kids[i]);
		return out;
	}
	function row(label) {
		var rs = rows();
		for (var i = 0; i < rs.length; i++) {
			if (rs[i].labelEl && rs[i].labelEl.textContent.indexOf(label) === 0) return rs[i];
		}
		return null;
	}

	GUI.openMenu(gear, 100, 100);
	ok(GUI.isMenuOpen(), 'context menu opens');
	ok(GUI.menuGear() === gear, 'menu tracks its gear');
	var speed = row('speed');
	ok(!!speed, 'menu has a speed slider');
	ok(String(speed.input.min) === '-1', 'animate mode: continuous speed slider', speed.input.min);
	speed.input.value = 0.42;
	speed.input.dispatch('input');
	near(gear.speed, 0.42, 1e-9, 'dragging the speed slider edits the gear');

	var trail = row('trail length');
	ok(!!trail, 'menu has a trail length slider');
	trail.input.value = 1500;
	trail.input.dispatch('input');
	ok(gear.trailCap === 1500, 'trail slider sets the per-pencil cap', gear.trailCap);

	// whole mode swaps in the valid-position sliders and rebuilds the open menu
	App.setMode('whole');
	ok(GUI.isMenuOpen(), 'menu survives the mode switch');
	speed = row('speed');
	var choices = App.speedChoices();
	ok(String(speed.input.max) === String(choices.length - 1), 'whole mode: index slider over valid speeds', speed.input.max);
	speed.input.value = 0;
	speed.input.dispatch('input');
	ok(choices.indexOf(gear.speed) >= 0, 'every reachable speed is a valid position', gear.speed);
	var dia = row('diameter');
	dia.input.value = 1;
	dia.input.dispatch('input');
	ok(App.diameterChoices(gear).indexOf(gear.r * 2) >= 0, 'every reachable diameter is a valid position', gear.r * 2);
	w.tick(3);

	// symmetry mirrors a menu edit across the level
	App.setMode('animate');
	App.applyLevel(1, 3);
	App.setSymmetry(true);
	GUI.openMenu(App.roots[0].children[0], 100, 100);
	row('pencil width').input.value = 7;
	row('pencil width').input.dispatch('input');
	ok(App.roots[0].children[2].pencil.width === 7, 'menu edit mirrors with symmetry on');
	App.setSymmetry(false);
	GUI.closeMenu();
	ok(!GUI.isMenuOpen(), 'menu closes');
	App.resetScene();
})();

// ---- app-state bag (mode / toggles / search ceiling) ------------------
(function appStateRoundtrip() {
	var d = Gear.defaultAppState();
	ok(d.maxPeriod === 2000, 'default app state carries the closure ceiling', d.maxPeriod);
	var roots = scene();
	var obj = Gear.serialize(roots, { zoom: 1, pan: [0, 0] }, 1, 'cycles', {
		mode: 'whole', paused: true, symmetry: true, overlay: false, maxPeriod: 5000,
		showCircles: false, showDial: true, showPoints: true, glowPoints: true, drawTrails: false
	});
	var back = Gear.deserialize(JSON.parse(JSON.stringify(obj)));
	ok(back.app.mode === 'whole' && back.app.paused && back.app.symmetry, 'app flags survive a save/load');
	ok(back.app.maxPeriod === 5000, 'maxPeriod survives a save/load', back.app.maxPeriod);
	ok(back.app.overlay === false && back.app.drawTrails === false, 'off-flags survive a save/load');
	// legacy scenes carry the old skip-the-bake threshold
	var legacy = Gear.deserialize({ gears: [], app: { periodThreshold: 300 } });
	ok(legacy.app.maxPeriod === 300, 'legacy periodThreshold maps onto maxPeriod', legacy.app.maxPeriod);
	var bogus = Gear.deserialize({ gears: [], app: { mode: 'nope', maxPeriod: 999999 } });
	ok(bogus.app.mode === 'animate', 'invalid mode falls back to the default');
	ok(bogus.app.maxPeriod === 20000, 'maxPeriod is clamped', bogus.app.maxPeriod);
	// no app block at all (pre-0.5.1 file)
	ok(Gear.deserialize({ gears: [] }).app.mode === 'animate', 'legacy file with no app block gets defaults');
})();

// ---- panel: level sliders start at 0 ---------------------------------
(function panelLevelRows() {
	App.resetScene();
	var rows = [];
	(function walk(n) {
		if (n.input && n.labelEl && n.labelEl.textContent.indexOf('lvl ') === 0) rows.push(n);
		for (var i = 0; i < (n.children || []).length; i++) walk(n.children[i]);
	})(w.byId.panel);
	ok(rows.length >= 2, 'panel shows one slider per level (+1 empty)', rows.length);
	ok(String(rows[0].input.min) === '0', 'lvl sliders start at 0', rows[0].input.min);
	ok(String(rows[0].input.max) === String(App.maxLevelN), 'lvl sliders stop at maxLevelN', rows[0].input.max);
	rows[0].input.value = 4;
	rows[0].input.dispatch('input');
	ok(App.roots[0].children.length === 4, 'dragging lvl 1 grows the level', App.roots[0].children.length);
	rows[0].input.value = 0;
	rows[0].input.dispatch('input');
	ok(App.roots[0].children.length === 0, 'dragging lvl 1 to 0 removes the level');
	App.resetScene();
	ok(App.allGears.length === 2, 'reset restores the default tree');
})();

// ---- whole mode never blocks and never refuses --------------------
(function nonBlockingPeriod() {
	App.resetScene();
	// irrational speeds: the old exact-LCM path exploded and the bake was
	// skipped behind a popup. now it must answer fast and still draw.
	App.roots[0].speed = Math.SQRT2 / 3;
	App.roots[0].children[0].speed = Math.PI / 7;
	App.roots[0].children[0].pencil.c1.on = true;
	var t0 = Date.now();
	App.setMode('whole');
	var dt = Date.now() - t0;
	ok(dt < 60, 'entering whole mode returns immediately', dt + 'ms');
	ok(App.currentPeriod != null, 'a period is always reported');
	var pencil = App.allGears[1];
	var guard = 0;
	while (guard++ < 4000 && pencil.count < 500) w.tick(1);
	ok(pencil.count >= 500, 'the figure is drawn even without exact closure', pencil.count);
	ok(w.byId.toast.textContent.indexOf('threshold') < 0, 'no blocking threshold popup');
	// raising the ceiling re-runs the search without blocking
	t0 = Date.now();
	App.setMaxPeriod(20000);
	ok(Date.now() - t0 < 60, 'raising the search ceiling is non-blocking', (Date.now() - t0) + 'ms');
	App.setMode('animate');
	App.resetScene();
})();

console.log((fail ? 'FAILED' : 'OK') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
