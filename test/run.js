// test/run.js - headless checks for the gear math and the live app.
// run: node test/run.js      (no dependencies, no build)
'use strict';

var Settings = require('../js/settings.js');
var Gear = require('../js/gear.js');
var Camera3 = require('../js/camera3.js');
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

// ---- camera3.js (pure 3D math, no DOM) -------------------------------
(function cameraMath() {
	Camera3.setViewport(600, 600);
	var cam = Camera3.defaultCamera();
	var m = new Float32Array(16), p = [0, 0, 0];
	Camera3.viewProj(m, cam, 600, 600);
	// orbit target projects to screen center.
	Camera3.projectPoint(m, 0, 0, 0, p);
	ok(Math.abs(p[0] - 300) < 0.5 && Math.abs(p[1] - 300) < 0.5, 'orbit target projects to screen center', p[0] + ',' + p[1]);
	// default view (yaw pi/2): the spin-0 figure plane is the XZ plane viewed
	// face-on from +y, so 2D +x maps to screen -x and 2D +y maps to screen up.
	Camera3.projectPoint(m, 0.5, 0, 0, p);
	ok(p[0] < 300 && Math.abs(p[1] - 300) < 1, 'world +x projects left in the default view', p[0] + ',' + p[1]);
	Camera3.projectPoint(m, 0, 0, 0.5, p);
	ok(Math.abs(p[0] - 300) < 1 && p[1] < 300, 'world +z (up) projects up', p[0] + ',' + p[1]);
	// a point behind the camera is reported not-visible. default camera looks
	// from +y toward the origin, so a point far at +y (past the eye) is behind.
	var behind = Camera3.projectPoint(m, 0, 10, 0, [0, 0]);
	ok(behind === false, 'a point behind the camera is flagged');
	// pitch clamps off the poles (no gimbal flip).
	var c3 = Camera3.defaultCamera();
	Camera3.orbitBy(c3, 0, 100);
	ok(Math.abs(c3.pitch) <= Camera3.PITCH_LIMIT + 1e-9, 'pitch clamps at +89 deg', c3.pitch);
	Camera3.orbitBy(c3, 0, -1000);
	ok(Math.abs(c3.pitch) <= Camera3.PITCH_LIMIT + 1e-9, 'pitch clamps at -89 deg', c3.pitch);
	// yaw wraps instead of growing unbounded.
	var c4 = Camera3.defaultCamera();
	for (var i = 0; i < 100; i++) Camera3.orbitBy(c4, 0.5, 0);
	ok(Math.abs(c4.yaw) <= Math.PI, 'yaw normalizes to +-pi', c4.yaw);
	// dolly clamps to a band around the fit radius.
	var c5 = Camera3.defaultCamera();
	for (var j = 0; j < 50; j++) Camera3.dolly(c5, 0.1, 3);
	ok(Math.abs(c5.dist - (0.05 * 3)) < 1e-6, 'dolly clamps at the near floor', c5.dist);
	var c6 = Camera3.defaultCamera();
	for (var k = 0; k < 50; k++) Camera3.dolly(c6, 10, 3);
	ok(Math.abs(c6.dist - (40 * 3)) < 1e-6, 'dolly clamps at the far ceiling', c6.dist);
	// pan moves the target and scales with distance (units/pixel grows with dist).
	var c7 = Camera3.defaultCamera(), t7a = c7.target[0];
	c7.dist = 3; Camera3.panBy(c7, 100, 0, 600, 600); var dSmall = c7.target[0] - t7a;
	var c8 = Camera3.defaultCamera(), t8a = c8.target[0];
	c8.dist = 9; Camera3.panBy(c8, 100, 0, 600, 600); var dLarge = c8.target[0] - t8a;
	ok(Math.abs(dLarge) > Math.abs(dSmall) * 2, 'pan speed scales with distance', dSmall + ' vs ' + dLarge);
	// camera sanitizer tolerates garbage.
	var bad = Camera3.sanitizeCamera({ yaw: 'nope', pitch: 999, dist: -5, target: [1, 2] });
	ok(isFinite(bad.yaw) && Math.abs(bad.pitch) <= Camera3.PITCH_LIMIT && bad.dist > 0, 'sanitizeCamera heals a bad camera');
	// fit distance grows with the scene radius.
	ok(Camera3.fitDist(2) > Camera3.fitDist(1), 'fit distance scales with radius');
})();

// ---- gear: 3D two-axis kinematics + ring stride -----------------------
(function kinematics3D() {
	function build(s2root, s2kid) {
		var root = Gear.makeGear({ r: 0.6, speed: 0.5, speed2: s2root || 0,
			pencil: { d: 0.3, c1: { on: true, color: '#ff4d4d' }, c2: { on: false } } });
		var kid = Gear.makeGear({ r: 0.2, speed: 0.25, speed2: s2kid || 0, internal: true,
			pencil: { d: 0.14, c1: { on: true, color: '#ffd24d' }, c2: { on: false } } });
		root.children.push(kid);
		Gear.initRuntime(root, null);
		return [root];
	}

	// every speed2 == 0 reproduces the flat 2D figure standing in the XZ plane
	// (world y stays 0); the projected (x,z) matches the 2D ring (x,y).
	var flat2 = build(0, 0); Gear.setTreeStride(flat2, false);
	var pf2 = Gear.detectPeriod(flat2, 2000); Gear.computeWhole(flat2, pf2, 3000, false);
	var flat3 = build(0, 0); Gear.setTreeStride(flat3, true);
	var pf3 = Gear.detectPeriod(flat3, 2000, null, true); Gear.computeWhole(flat3, pf3, 3000, true);
	ok(flat3[0].children[0].stride === 6, '3D rings use stride 6');
	var g2 = flat2[0].children[0], g3 = flat3[0].children[0];
	var maxErr = 0, yMax = 0;
	for (var i = 0; i < g3.count; i++) {
		var a = i * 5, b = i * 6;
		maxErr = Math.max(maxErr, Math.hypot(g2.ring[a] - g3.ring[b], g2.ring[a + 1] - g3.ring[b + 2]));
		yMax = Math.max(yMax, Math.abs(g3.ring[b + 1]));
	}
	ok(maxErr < 1e-6, 'speed2=0 reproduces the 2D geometry (x,z)', maxErr.toExponential(2));
	ok(yMax < 1e-9, 'speed2=0 keeps the flat figure in the XZ plane (y=0)', yMax.toExponential(2));

	// a nonzero tilt lifts the pen out of the plane: world y varies -> true 3D.
	var tilt = build(0.3, 0.2); Gear.setTreeStride(tilt, true);
	var pt = Gear.detectPeriod(tilt, 4000, null, true);
	Gear.computeWhole(tilt, pt, Math.min(12000, pt.turns * 120), true);
	var gt = tilt[0].children[0];
	var ty = 0;
	for (var k = 0; k < gt.count; k++) ty = Math.max(ty, Math.abs(gt.ring[k * 6 + 1]));
	ok(ty > 0.05, 'a tilt speed lifts the pen out of plane (y varies)', ty.toFixed(3));
	var ia = gt.head * 6, ib = ((gt.head + gt.count - 1) % gt.cap) * 6;
	var gap = Math.hypot(gt.ring[ia] - gt.ring[ib], gt.ring[ia + 1] - gt.ring[ib + 1], gt.ring[ia + 2] - gt.ring[ib + 2]);
	ok(gap < 0.01, '3D two-axis bake closes on itself (x,y,z)', gap.toExponential(2));

	// the second axis adds a closure constraint: root.speed2 = 0.5 needs u even.
	var half = build(0.5, 0); Gear.setTreeStride(half, true);
	var ph = Gear.detectPeriod(half, 4000, null, true);
	ok(ph.turns % 2 === 0, 'tilt 1/2 forces an even turn count', ph.turns);
	var flatP = Gear.detectPeriod(build(0, 0), 4000, null, true);
	ok(ph.turns >= flatP.turns, 'adding a tilt never shortens the period', ph.turns + ' vs ' + flatP.turns);

	// 2D pushPoint keeps stride 5; the 3D call signature writes z into stride 6.
	var g = Gear.makeGear({ trailCap: 500 });
	Gear.initRuntime(g, null);
	var col = [1, 1, 1];
	for (var q = 0; q < 200; q++) Gear.pushPoint(g, q * 0.01, q * 0.001, col);
	ok(g.stride === 5 && g.ring[g.head * 5 + 1] !== undefined, '2D pushPoint writes stride 5');
})();

// ---- live app (real main.js/gui.js on DOM stubs) ---------------------
var w = boot();

// every slider row of a stub subtree (panel or gear menu), however deeply the
// group boxes nest it: a row is found by its label text, never by position.
function sliderRows(node, out) {
	out = out || [];
	if (!node) return out;
	if (node.input && node.labelEl) out.push(node);
	for (var i = 0; i < (node.children || []).length; i++) sliderRows(node.children[i], out);
	return out;
}
function rowByLabel(node, label) {
	var rs = sliderRows(node);
	for (var i = 0; i < rs.length; i++) if (rs[i].labelEl.textContent.indexOf(label) === 0) return rs[i];
	return null;
}
var App = w.App;
ok(!!App, 'app booted');
ok(App.allGears.length === 2, 'default scene has 2 gears', App.allGears.length);

// drift guard: after init() seeds the live App from Settings.applyApp, every
// persisted field must equal Settings.defaultApp() (the App initializer only
// holds placeholders; the schema is the single source of the live values).
(function liveAppMatchesSchemaDefaults() {
	var d = Settings.defaultApp();
	var matched = 0;
	for (var i = 0; i < Settings.APP_SCHEMA.length; i++) {
		var f = Settings.APP_SCHEMA[i];
		if (!f.persist) continue;
		// object-valued fields (sphereParams) compare by value
		if (JSON.stringify(f.get(App)) === JSON.stringify(d[f.key])) matched++;
		else ok(false, 'live App.' + f.key + ' seeded from schema default', JSON.stringify(f.get(App)) + ' vs ' + JSON.stringify(d[f.key]));
	}
	ok(matched === Settings.APP_SCHEMA.length, 'live App seeded from Settings defaults (' + matched + ' fields)');
})();

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

	function rows() { return sliderRows(w.byId.ctxmenu); }
	function row(label) { return rowByLabel(w.byId.ctxmenu, label); }

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
	// the row is an index slider over a log ladder (0.5.5): the handle
	// position IS the value; assigning a raw point count used to fall off
	// the ladder and set the cap to garbage.
	var ti = Math.floor(trail.values.length / 2);
	trail.input.value = ti;
	trail.input.dispatch('input');
	ok(gear.trailCap === trail.values[ti], 'trail slider sets the per-pencil cap', gear.trailCap);

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
	ok(d.maxPeriod === Settings.LIMITS.maxPeriod.def, 'default app state carries the closure ceiling', d.maxPeriod);
	var roots = scene();
	var obj = Gear.serialize(roots, { zoom: 1, pan: [0, 0] }, 1, 'cycles', {
		mode: 'whole', paused: true, symmetry: true, overlay: false, maxPeriod: 3000,
		showCircles: false, showDial: true, showPoints: true, glowPoints: true, drawTrails: false
	});
	var back = Gear.deserialize(JSON.parse(JSON.stringify(obj)));
	ok(back.app.mode === 'whole' && back.app.paused && back.app.symmetry, 'app flags survive a save/load');
	ok(back.app.maxPeriod === 3000, 'maxPeriod survives a save/load', back.app.maxPeriod);
	ok(back.app.overlay === false && back.app.drawTrails === false, 'off-flags survive a save/load');
	// legacy scenes carry the old skip-the-bake threshold
	var legacy = Gear.deserialize({ gears: [], app: { periodThreshold: 300 } });
	ok(legacy.app.maxPeriod === 300, 'legacy periodThreshold maps onto maxPeriod', legacy.app.maxPeriod);
	var bogus = Gear.deserialize({ gears: [], app: { mode: 'nope', maxPeriod: 999999 } });
	ok(bogus.app.mode === 'animate', 'invalid mode falls back to the default');
	ok(bogus.app.maxPeriod === Settings.LIMITS.maxPeriod.max, 'maxPeriod is clamped', bogus.app.maxPeriod);
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
	App.setMaxPeriod(Settings.LIMITS.maxPeriod.max);
	ok(Date.now() - t0 < 60, 'raising the search ceiling is non-blocking', (Date.now() - t0) + 'ms');
	App.setMode('animate');
	App.resetScene();
})();

// ---- deep levels really shrink (the lvl >= 4 bug) --------------------
(function deepLevelSizes() {
	App.resetScene();
	for (var l = 1; l <= 5; l++) App.applyLevel(l, 3);
	var okShrink = true, okOrbit = true, okRatio = true;
	for (var i = 0; i < App.allGears.length; i++) {
		var g = App.allGears[i];
		if (!g.parent) continue;
		if (!(g.r < g.parent.r * 0.9)) okShrink = false;
		var orbitR = g.internal ? (g.parent.r - g.r) : (g.parent.r + g.r);
		if (!(orbitR > 1e-4)) okOrbit = false;
		var ratio = g.internal ? (g.parent.r - g.r) / g.r : (g.parent.r + g.r) / g.r;
		if (!(Math.abs(ratio) > 0.05)) okRatio = false;
	}
	ok(okShrink, 'every new gear is a fraction of its own parent (no 0.05 floor)');
	ok(okOrbit, 'no gear degenerates onto its parent centre (orbit radius > 0)');
	ok(okRatio, 'every gear still rolls (rolling ratio != 0)');
	// evenly spaced at depth 4, in the animate integrator
	w.tick(3);
	var p = App.gearsAtDepth(3)[0], kids = p.children;
	var angs = [], dists = [];
	for (var k = 0; k < kids.length; k++) {
		angs.push(Math.atan2(kids[k].cy - p.cy, kids[k].cx - p.cx));
		dists.push(Math.hypot(kids[k].cx - p.cx, kids[k].cy - p.cy));
	}
	var d01 = Math.abs(((angs[1] - angs[0]) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
	var d12 = Math.abs(((angs[2] - angs[1]) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
	near(d01, 2 * Math.PI / 3, 1e-9, 'depth-4 siblings are 120 deg apart (animate)');
	near(d12, 2 * Math.PI / 3, 1e-9, 'depth-4 siblings keep the spacing all round');
	near(dists[0], dists[2], 1e-12, 'depth-4 siblings share one orbit radius');
	// a clone that lands under a smaller parent is scaled to fit
	App.resetScene();
	App.applyLevel(1, 2);
	var big = App.roots[0].children[0];
	App.setGearRadius(big, 0.08);
	App.applyLevel(2, 2);
	var fits = true;
	for (var m = 0; m < big.children.length; m++) if (big.children[m].r >= big.r) fits = false;
	ok(fits, 'a sub-gear never ends up as large as its parent');
	App.resetScene();
})();

// ---- trail length is a LENGTH, detail is the smoothness --------------
(function trailVsDetail() {
	App.resetScene();
	App.setMode('whole');
	function bake() {
		App.recomputeWhole(true);              // skip the drag-draft heuristic
		var guard = 0;
		while (guard++ < 8000 && wholeBusy()) w.tick(1);
		w.tick(50);
	}
	function wholeBusy() { return App.allGears[1].count === 0; }
	App.setSamplesPerTurn(200);
	bake();
	var turns = App.currentPeriod.turns;
	var hi = App.allGears[1].count;
	ok(hi > turns * 100, 'detail 200 bakes ~200 points per turn', hi + ' for ' + turns + ' turns');
	// the per-pencil trail cap must NOT change the baked curve
	App.setTrailCap(App.allGears[1], 1000);
	App.onGearParam(App.allGears[1], 'trail');
	bake();
	ok(App.allGears[1].count > 1000, 'whole bake ignores the animate trail cap', App.allGears[1].count);
	// detail does
	App.setSamplesPerTurn(40);
	bake();
	var lo = App.allGears[1].count;
	ok(lo < hi / 3, 'lowering detail makes the bake coarser', lo + ' vs ' + hi);
	// and leaving whole mode gives the memory back to the trail cap
	App.setMode('animate');
	ok(App.allGears[1].cap <= 1000, 'rings shrink back to the trail cap on exit', App.allGears[1].cap);
	App.setTrailCap(App.allGears[1], 20000);
	App.resetScene();
})();

// ---- rosette spacing holds when gears are added mid-animation ---------
(function rosetteAfterMidAnimGrowth() {
	function gaps(ang) {
		var d = ang.map(function (a) { return a * 180 / Math.PI; }).sort(function (a, b) { return a - b; });
		var g = [];
		for (var i = 0; i < d.length; i++) { var x = d[(i + 1) % d.length] - d[i]; if (i === d.length - 1) x += 360; g.push(x); }
		return g;
	}
	for (var dim = 0; dim < 2; dim++) {
		var is3 = dim === 1;
		App.resetScene();
		if (is3) App.setDim('3d');
		w.tick(300, 16);                 // let gears accumulate rot first
		App.applyLevel(1, 3);            // grow siblings mid-animation
		w.tick(5, 16);
		var p = App.roots[0], kids = p.children;
		var e1 = p.f3;
		var ang = kids.map(function (g) {
			if (!is3) return Math.atan2(g.cy - p.cy, g.cx - p.cx);
			var dx = g.c3[0] - p.c3[0], dy = g.c3[1] - p.c3[1], dz = g.c3[2] - p.c3[2];
			return Math.atan2(dx * e1[6] + dy * e1[7] + dz * e1[8], dx * e1[0] + dy * e1[1] + dz * e1[2]);
		});
		var g = gaps(ang);
		ok(g.length === 3 && g.every(function (x) { return Math.abs(x - 120) < 2; }),
			(is3 ? '3D' : '2D') + ' siblings added mid-animation stay 360/N apart', g.map(function (x) { return x.toFixed(0); }).join(','));
	}
	App.setDim('2d');
	App.resetScene();
})();

// ---- 3D orbit pivot stays fixed while a menu is open (trail sync) -----
(function orbitPivotFixedWhileMenuOpen() {
	App.resetScene();
	App.setDim('3d');
	w.tick(60, 16);
	var kid = App.roots[0].children[0];
	w.GUI.openMenu(kid, 50, 50);
	var t0 = App.cam.target.slice();
	w.tick(300, 16);                 // animate a lot; pivot must not chase the gear
	var t1 = App.cam.target.slice();
	ok(Math.hypot(t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]) < 1e-9,
		'orbit camera target is fixed while a gear menu is open', Math.hypot(t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]).toExponential(2));
	w.GUI.closeMenu();
	ok(App.orbitGear === App.roots[0], 'closing the menu returns the pivot to the root');
	App.setDim('2d');
	App.resetScene();
})();

// ---- 3D trail pixels == projected ring == sphere pen (render modes) ---
// the 3D trail is drawn by projecting the world ring through the camera and
// feeding the 2D segment loop under an identity transform. every segment
// the renderer receives must be exactly the projection of the ring, in BOTH
// render modes (overlay bake + append, and full redraw), also once the ring
// has wrapped (head != 0) - the two defects behind "trails do not match the
// spheres" were a mirrored y (identity kept the 2D y flip) and a projection
// buffer indexed by ring SLOT, which the 2D loop then read through a wrapped
// head. a third one skipped the incremental append entirely once the ring
// was full.
(function trail3DMatchesProjection() {
	function projectAll(g) {
		var W = App.size * App.dpr, m = new Float32Array(16), p = [0, 0], out = [];
		Camera3.setViewport(W, W); Camera3.viewProj(m, App.cam, W, W);
		for (var k = 0; k < g.count; k++) {
			var idx = (g.head + k) % g.cap;
			Camera3.projectPoint(m, g.ring[idx * 6], g.ring[idx * 6 + 1], g.ring[idx * 6 + 2], p);
			out.push([p[0], p[1]]);
		}
		return out;
	}
	function trailSegs() { return w.segLog.filter(function (e) { return e[4]; }); }
	function worstErr(segs, pts, offset) {
		var worst = 0;
		for (var k = 0; k < segs.length; k++) {
			var a = pts[offset + k], b = pts[offset + k + 1], sg = segs[k];
			if (!a || !b) return Infinity;
			worst = Math.max(worst, Math.hypot(sg[0] - a[0], sg[1] - a[1]), Math.hypot(sg[2] - b[0], sg[3] - b[1]));
		}
		return worst;
	}
	App.resetScene();
	App.setDim('3d');
	App.setShowCircles(false);
	var g = App.roots[0].children[0];
	App.setTrailCap(g, 500); App.onGearParam(g, 'trail');
	w.tick(700, 16);                                   // 700 pushes into a 500 ring -> wrapped
	ok(g.count === g.cap && g.head > 0, '3D test ring is full and wrapped', g.count + '/' + g.cap + ' head ' + g.head);

	// keep mode, full re-bake at the settled camera
	w.segTrace = true; w.segLog.length = 0;
	App.invalidateOverlay(); w.tick(1, 16);
	var segs = trailSegs(), pts = projectAll(g);
	ok(segs.length === g.count - 1, 'overlay rebake paints every ring segment', segs.length + ' vs ' + (g.count - 1));
	var e1 = worstErr(segs, pts, 0);
	ok(e1 < 1e-3, '3D baked trail pixels equal the camera projection of the ring (no y mirror, no wrap garbage)', e1.toFixed(3) + ' px');
	var onCanvas = segs.every(function (sg) { return sg[1] >= 0 && sg[3] >= 0 && sg[1] <= App.size * App.dpr && sg[3] <= App.size * App.dpr; });
	ok(onCanvas, 'projected trail lies inside the canvas (was at negative y)');

	// keep mode, incremental append while the ring is full: one new point per
	// frame -> one appended segment that ends at the live pen sphere.
	var perFrame = [];
	for (var f = 0; f < 5; f++) { w.segLog.length = 0; w.tick(1, 16); perFrame.push(trailSegs().length); }
	ok(perFrame.every(function (n) { return n === 1; }), 'full ring still appends the newest segment each frame', perFrame.join(','));
	var last = trailSegs()[0];
	var W = App.size * App.dpr, m = new Float32Array(16), pen = [0, 0];
	Camera3.setViewport(W, W); Camera3.viewProj(m, App.cam, W, W);
	Camera3.projectPoint(m, g.pen3[0], g.pen3[1], g.pen3[2], pen);
	ok(Math.hypot(last[2] - pen[0], last[3] - pen[1]) < 1e-3, 'appended segment ends exactly at the projected pen (trail meets the sphere)',
		Math.hypot(last[2] - pen[0], last[3] - pen[1]).toFixed(3) + ' px');

	// redraw mode (overlay off): the whole ring every render, same pixels.
	App.setOverlay(false);
	w.segLog.length = 0; w.tick(1, 16);
	var segs2 = trailSegs(), pts2 = projectAll(g);
	ok(segs2.length === g.count - 1, 'overlay-off redraw paints every ring segment', segs2.length);
	var e2 = worstErr(segs2, pts2, 0);
	ok(e2 < 1e-3, 'overlay-off 3D trail equals the projection too', e2.toFixed(3) + ' px');
	App.setOverlay(true);

	// after an orbit the cached overlay is stale: it must be re-baked at the
	// new camera on settle, and the new bake must again match the projection.
	var yaw0 = App.cam.yaw;
	Camera3.orbitBy(App.cam, 0.7, 0.2);
	App.invalidateOverlay();                          // what onUp / settleCamera do after the gesture
	w.segLog.length = 0; w.tick(1, 16);
	var segs3 = trailSegs(), pts3 = projectAll(g);
	ok(Math.abs(App.cam.yaw - yaw0) > 0.5 && worstErr(segs3, pts3, 0) < 1e-3, 'rebake after orbit follows the new camera',
		worstErr(segs3, pts3, 0).toFixed(3) + ' px');
	w.segTrace = false; w.segLog.length = 0;
	App.setShowCircles(true);
	App.setDim('2d');
	App.resetScene();
})();

// ---- camera moves always invalidate the cached overlay --------------
(function cameraMovesInvalidateOverlay() {
	App.resetScene();
	App.setDim('3d');
	w.tick(30, 16);
	ok(!App.overlay.invalid, 'overlay is settled after entering 3D');
	// auto-rotate: on = gesture (direct draw), off = settle -> rebake.
	App.setAutoRotate(true);
	w.tick(20, 16);
	App.setAutoRotate(false);
	ok(App.overlay.invalid, 'stopping auto-rotate re-bakes the overlay at the final yaw');
	w.tick(2, 16);
	// selecting a gear moves the orbit pivot -> the view matrix changed.
	var kid = App.roots[0].children[0];
	w.GUI.openMenu(kid, 50, 50);
	ok(App.overlay.invalid, 'moving the orbit pivot to a gear re-bakes');
	w.tick(2, 16);
	// re-opening the same gear (menu refresh) keeps the pivot: no needless rebake.
	w.GUI.openMenu(kid, 50, 50);
	ok(!App.overlay.invalid, 'same pivot again does not thrash the bake');
	w.GUI.closeMenu();
	ok(App.overlay.invalid, 'pivot back to the root re-bakes');
	w.tick(2, 16);
	// belt and braces: even a camera change that forgot to invalidate (a
	// direct write to App.cam) is caught by the render's view key - the
	// next settled frame re-bakes the whole ring instead of appending.
	w.segTrace = true;
	function trailCount() { return w.segLog.filter(function (e) { return e[4]; }).length; }
	var kid2 = App.roots[0].children[0];
	w.segLog.length = 0; w.tick(1, 16);
	var appended = trailCount();
	App.cam.yaw += 0.3;                              // no invalidate call on purpose
	w.segLog.length = 0; w.tick(1, 16);
	ok(appended <= 2 && trailCount() >= kid2.count - 2, 'a stale view key forces a full re-bake even without an explicit invalidate',
		appended + ' -> ' + trailCount() + ' segs for ' + kid2.count + ' points');
	w.segTrace = false; w.segLog.length = 0;
	App.setDim('2d');
	App.resetScene();
})();

// ---- gears added while in 3D store 3D trails ---------------------------
(function addedGearsGet3DRings() {
	App.resetScene();
	App.setDim('3d');
	w.tick(30, 16);
	App.applyLevel(1, 3);
	App.addSubGear(App.roots[0].children[1]);
	w.tick(60, 16);
	var strides = App.allGears.map(function (g) { return g.stride; });
	ok(strides.every(function (st) { return st === 6; }), 'gears added in 3D use stride-6 rings (their trails draw)', strides.join(','));
	var drawn = App.allGears.filter(function (g) { return (g.pencil.c1.on || g.pencil.c2.on) && g.count > 10; }).length;
	var pencils = App.allGears.filter(function (g) { return g.pencil.c1.on || g.pencil.c2.on; }).length;
	ok(drawn === pencils, 'every pencil added in 3D grows a trail', drawn + '/' + pencils);
	w.GUI.closeMenu();
	App.setDim('2d');
	App.resetScene();
})();

// ---- 2D overlay append across a full (wrapped) ring -------------------
(function overlayAppendWrapped2D() {
	App.resetScene();
	App.setShowCircles(false);
	var g = App.roots[0].children[0];
	App.setTrailCap(g, 500); App.onGearParam(g, 'trail');
	w.tick(700, 16);
	ok(g.count === g.cap && g.head > 0, '2D test ring is full and wrapped');
	w.segTrace = true;
	w.segLog.length = 0; App.invalidateOverlay(); w.tick(1, 16);
	ok(w.segLog.length === g.count - 1, '2D overlay rebake paints the whole ring', w.segLog.length);
	var per = [];
	for (var f = 0; f < 4; f++) { w.segLog.length = 0; w.tick(1, 16); per.push(w.segLog.length); }
	ok(per.every(function (n) { return n === 1; }), '2D full ring appends exactly the newest segment per frame', per.join(','));
	// a burst of several points between two renders is appended whole.
	for (var i = 0; i < 12; i++) w.Gear.pushPoint(g, 0.3 + i * 0.01, 0.1, [1, 1, 1]);
	w.segLog.length = 0; w.tick(1, 16);
	ok(w.segLog.length >= 12, 'a multi-point burst is appended completely', w.segLog.length);
	w.segTrace = false; w.segLog.length = 0;
	App.setShowCircles(true);
	App.resetScene();
})();

// ---- max period is a ceiling, not a target ---------------------------
(function maxPeriodCeiling() {
	App.resetScene();
	App.setMode('whole');
	w.tick(20);
	var full = App.currentPeriod;
	ok(full.exact, 'the snapped default scene closes exactly', full.turns);
	ok(full.turns <= App.maxPeriod, 'the reported period is the SMALLEST closing one, well under the ceiling',
		full.turns + ' <= ' + App.maxPeriod);
	App.setMaxPeriod(8);
	w.tick(20);
	ok(App.currentPeriod.turns <= 8, 'a low ceiling cuts the figure short', App.currentPeriod.turns);
	ok(!App.currentPeriod.exact, 'a cut-short figure is reported as approximate');
	App.setMaxPeriod(Settings.LIMITS.maxPeriod.def);
	w.tick(20);
	ok(App.currentPeriod.turns === full.turns, 'raising the ceiling restores the exact period');
	App.setMode('animate');
	App.resetScene();
})();

// ---- panel: max period + detail sliders ------------------------------
(function wholePanelRows() {
	function findRow(label) {
		var found = null;
		(function walk(n) {
			if (found) return;
			if (n.input && n.labelEl && n.labelEl.textContent.indexOf(label) === 0) { found = n; return; }
			for (var i = 0; i < (n.children || []).length; i++) walk(n.children[i]);
		})(w.byId.panel);
		return found;
	}
	var mp = findRow('max period');
	ok(!!mp, 'panel has a max period slider');
	ok(String(mp.input.min) === '0' && String(mp.input.max) === String(mp.values.length - 1),
		'max period slider uses logarithmic index range');
	var mpRising = mp.values.length > 50;
	for (var mvi = 1; mvi < mp.values.length; mvi++) if (mp.values[mvi] <= mp.values[mvi - 1]) mpRising = false;
	ok(mpRising, 'max period steps are strictly increasing (no duplicate ceilings)', mp.values.length);
	ok(mp.values[0] === Settings.LIMITS.maxPeriod.min, 'first mapped value is min');
	ok(mp.values[mp.values.length - 1] === Settings.LIMITS.maxPeriod.max, 'last mapped value is max');
	var det = findRow('detail');
	ok(!!det, 'panel has a detail (samples/turn) slider');
	det.input.value = 400;
	det.input.dispatch('input');
	ok(App.samplesPerTurn === 400, 'detail slider drives the bake resolution', App.samplesPerTurn);
	App.setSamplesPerTurn(200);
	// context menu: trail length is animate-only
	App.setMode('animate');
	w.GUI.openMenu(App.allGears[1], 50, 50);
	ok(!!rowByLabel(w.byId.ctxmenu, 'trail length'), 'animate mode: menu has the trail length slider');
	App.setMode('whole');
	ok(!rowByLabel(w.byId.ctxmenu, 'trail length'), 'whole mode: no trail length slider (it has no meaning there)');
	App.setMode('animate');
	w.GUI.closeMenu();
	App.resetScene();
})();

// ---- 3D mode (live app on stubs) -------------------------------------
(function mode3D() {
	App.resetScene();
	ok(App.dim === '2d', 'fresh app starts in 2D');
	App.setDim('3d');
	ok(App.dim === '3d', 'switch to 3D');
	ok(!!App.cam && isFinite(App.cam.dist) && App.cam.dist > 0, '3D entry creates a fit camera', App.cam && App.cam.dist);
	ok(App.allGears[1].stride === 6, '3D entry switches rings to stride 6');

	// animate: the trail grows as real 3D points (z channel used). with all
	// tilt speeds 0 the default flat scene stays in the XZ plane (y ~ 0); once
	// a gear tilts, world y leaves 0.
	w.tick(120, 16);
	var pencil = App.allGears[1];
	ok(pencil.count > 100, '3D animate grows a trail', pencil.count);
	App.setGearSpeed2(App.roots[0], 0.5);
	w.tick(300, 16);
	var ySeen = 0;
	for (var i = 0; i < pencil.count; i++) ySeen = Math.max(ySeen, Math.abs(pencil.ring[i * 6 + 1]));
	ok(ySeen > 0.01, '3D animate pen leaves the plane under tilt', ySeen.toFixed(3));
	ok(isFinite(App.roots[0].rot2) && App.roots[0].rot2 > 0.01, 'tilt angle (rot2) accumulates', App.roots[0].rot2.toFixed(3));

	// whole mode: per-gear tilt is snapped to the grid; the baked 3D ring closes.
	App.setGearSpeed2(pencil, 0.5);
	App.setMode('whole');
	ok(Math.abs(pencil.speed2 - 0.5) < 1e-9, 'snappable tilt kept in whole mode');
	App.recomputeWhole(true);
	var guard = 0;
	while (guard++ < 20000) {
		w.tick(1);
		var c = App.allGears[1].count;
		if (c > 5000) { var stable = true; for (var s = 0; s < 30; s++) { w.tick(1); if (App.allGears[1].count !== c) { stable = false; break; } } if (stable) break; }
	}
	var g3 = App.allGears[1];
	ok(g3.count > 1000 && g3.stride === 6, '3D whole bake produced a stride-6 ring', g3.count);
	var ia = g3.head * 6, ib = ((g3.head + g3.count - 1) % g3.cap) * 6;
	var gap3 = Math.hypot(g3.ring[ia] - g3.ring[ib], g3.ring[ia + 1] - g3.ring[ib + 1], g3.ring[ia + 2] - g3.ring[ib + 2]);
	ok(gap3 < 0.02, '3D whole ring closes on itself (x,y,z)', gap3.toFixed(4));

	// irrational tilt snaps onto the grid in whole mode (never stays irrational).
	App.setGearSpeed2(pencil, Math.SQRT2 / 7);
	var choices = App.speedChoices();
	ok(choices.indexOf(pencil.speed2) >= 0, 'tilt snaps onto the whole-mode grid', pencil.speed2);

	// camera helpers drive state; the orbit pivot follows the menu gear.
	var yaw0 = App.cam.yaw, pit0 = App.cam.pitch;
	Camera3.orbitBy(App.cam, 0.4, 0.2);
	ok(Math.abs(App.cam.yaw - yaw0) > 0.3 && Math.abs(App.cam.pitch - pit0) > 0.1, 'orbit changes yaw + pitch');
	var dist0 = App.cam.dist;
	Camera3.dolly(App.cam, Camera3.wheelFactor(-400), 3);
	ok(App.cam.dist > dist0, 'wheel dolly moves the camera out');
	w.GUI.openMenu(pencil, 60, 60);
	ok(App.orbitGear === pencil, 'opening a menu orbits that gear');
	App.fitView();
	w.tick(40, 16);
	ok(true, 'fit ease completes without throwing');
	App.resetCamera();
	w.tick(40, 16);
	ok(true, 'reset camera completes without throwing');
	w.GUI.closeMenu();
	ok(App.orbitGear !== pencil, 'closing the menu returns the orbit pivot to the root');

	// GUI: per-gear tilt slider in the menu + auto-rotate row in the panel.
	var panelText = '';
	(function walk(n) {
		if (n.textContent) panelText += '|' + n.textContent;
		for (var k2 = 0; k2 < (n.children || []).length; k2++) walk(n.children[k2]);
	})(w.byId.panel);
	ok(panelText.indexOf('auto-rotate') >= 0, 'panel has an auto-rotate row');
	w.GUI.openMenu(pencil, 60, 60);
	var menuText = '';
	(function walk2(n) {
		if (n.textContent) menuText += '|' + n.textContent;
		for (var k3 = 0; k3 < (n.children || []).length; k3++) walk2(n.children[k3]);
	})(w.byId.ctxmenu);
	ok(menuText.indexOf('tilt speed') >= 0, '3D gear menu has a tilt-speed slider');
	var menuHasView = menuText.indexOf('fit view') >= 0;
	ok(menuHasView, '3D context menu has a view quick row');
	w.GUI.closeMenu();

	// back to 2D restores stride 5.
	App.setMode('animate');
	App.setDim('2d');
	ok(App.dim === '2d', 'back to 2D');
	ok(App.allGears[1].stride === 5, '2D entry switches rings back to stride 5');
	w.tick(5, 16);
	App.resetScene();
})();

// 3D scene save/load round-trip (dim/tilt/camera are persisted).
(function scene3DRoundtrip() {
	App.resetScene();
	App.setDim('3d');
	App.setGearSpeed2(App.roots[0].children[0], 0.25);
	App.roots[0].speed2 = 0.15;
	w.tick(10, 16);
	// serialize via the debounced autosave (markDirty -> saveLocal), then flush
	// the sandbox timer queue so the write lands.
	App.markDirty();
	w.flushTimers(1000);
	var stored = w.localStorage._d['spiro.autosave.v1'];
	ok(!!stored, '3D scene autosaves');
	var parsed = JSON.parse(stored);
	ok(parsed.dim === '3d', 'saved scene carries dim');
	ok(Math.abs(parsed.gears[0].children[0].speed2 - 0.25) < 1e-9, 'saved scene carries per-gear tilt', parsed.gears[0].children[0].speed2);
	ok(Math.abs(parsed.gears[0].speed2 - 0.15) < 1e-9, 'root tilt persists');
	ok(!!parsed.camera && isFinite(parsed.camera.yaw) && parsed.camera.target.length === 3, 'saved scene carries the camera');
	// loading a legacy scene with no dim defaults to 2D (no crash).
	var leg = Gear.deserialize({ gears: Gear.serialize(App.roots, { zoom: 1, pan: [0, 0] }, 1, 'frequency').gears });
	ok(leg.app.mode === 'animate', 'legacy-style deserialize still works');
	App.setDim('2d');
	App.resetScene();
})();

// ---- glass spheres -----------------------------------------------------
(function glassSpheres() {
	var d = Settings.defaultApp();
	ok(d.sphereShader === 'off' && d.sphereColor === '#9fd8ff', 'sphere defaults live in the schema', JSON.stringify([d.sphereShader, d.sphereColor]));
	var hb = d.sphereParams.hollow, al = d.sphereParams.layers;
	ok(hb && Math.abs(hb.wall - 0.115) < 1e-12 && hb.ior === 1.45 && hb.tint === 0.7 && hb.iris === 0.55 && hb.disp === 0.35 && hb.layers === 6,
		'hollow bubbles preset (wall .115 ior 1.45 tint .7 iris .55 disp .35 layers 6)', JSON.stringify(hb));
	ok(al && Math.abs(al.wall - 0.045) < 1e-12 && al.ior === 1.42 && al.tint === 0.55 && al.iris === 0.55 && al.disp === undefined,
		'analytic layers preset (wall .045 ior 1.42 tint .55 iris .55, no disp/layers)', JSON.stringify(al));
	ok(Settings.defaultApp().sphereParams !== d.sphereParams, 'sphereParams default is a fresh bag per call');
	Settings.applyApp({ sphereShader: 'layers', sphereColor: '#FF8800', sphereParams: { layers: { wall: 99, ior: 'x' }, bogus: { wall: 1 } } }, App, w.GUI);
	ok(App.sphereShader === 'layers', 'shader selector applies to the live app', App.sphereShader);
	ok(App.sphereColor === '#ff8800', 'sphere tint sanitizes to lowercase hex', App.sphereColor);
	ok(App.sphereParams.layers.wall === 0.25 && App.sphereParams.layers.ior === 1.42, 'per-shader params clamp / default per key', JSON.stringify(App.sphereParams.layers));
	ok(!App.sphereParams.bogus, 'unknown shader bags are dropped');
	Settings.applyApp({ sphereShader: 'cubes', sphereColor: 'red', sphereParams: 7 }, App, w.GUI);
	ok(App.sphereShader === 'off' && App.sphereColor === '#9fd8ff' && App.sphereParams.hollow.layers === 6,
		'bad sphere values fall back to the schema defaults');
	ok(Settings.sanitizeApp({ spheres: true }).sphereShader === 'hollow', 'legacy 0.7.2 boolean toggle maps to hollow bubbles');
	ok(Settings.sanitizeApp({ spheres: false }).sphereShader === 'off', 'legacy toggle off stays off');
	// panel rows (select + color picker + per-shader sliders)
	function panelText() {
		var txt = '';
		(function walk(n) {
			if (n.textContent) txt += '|' + n.textContent;
			for (var i = 0; i < (n.children || []).length; i++) walk(n.children[i]);
		})(w.byId.panel);
		return txt;
	}
	var txt = panelText();
	ok(txt.indexOf('glass shader') >= 0, 'panel has the shader selector');
	ok(txt.indexOf('hollow glass bubbles') >= 0 && txt.indexOf('analytic layered glass') >= 0, 'selector lists both shaders');
	ok(txt.indexOf('sphere tint') >= 0, 'panel has the sphere tint color picker');
	ok(txt.indexOf('|wall ') < 0, 'shader off: no slider rows', txt);
	App.setSphereShader('hollow'); w.GUI.setSphereShader('hollow');
	txt = panelText();
	ok(txt.indexOf('|wall ') >= 0 && txt.indexOf('|disp ') >= 0 && txt.indexOf('|layers ') >= 0, 'hollow bubbles: wall/ior/tint/iris/disp/layers rows', txt);
	App.setSphereShader('layers'); w.GUI.setSphereShader('layers');
	txt = panelText();
	ok(txt.indexOf('|iris ') >= 0 && txt.indexOf('|disp ') < 0 && txt.indexOf('|layers ') < 0, 'analytic layers: no disp/layers rows', txt);
	// render frames with each shader on, 2D and 3D (must not throw / break trails)
	Settings.applyApp({ sphereShader: 'hollow' }, App, w.GUI);
	w.tick(150, 16);
	ok(App.allGears[1].count > 100, '2D trail keeps growing with spheres on', App.allGears[1].count);
	App.setDim('3d');
	w.tick(150, 16);
	ok(App.allGears[1].count > 100, '3D trail keeps growing with spheres on', App.allGears[1].count);
	App.setSphereShader('layers');
	w.tick(20, 16);
	App.setDim('2d');
	w.tick(20, 16);
	// transient state through the setters
	App.setSphereColor('#3366ff');
	App.setSphereParam('wall', 0.2);
	App.setSphereParam('disp', 0.5);            // not a layers param: ignored
	App.setSphereShader('hollow');
	App.setSphereParam('disp', 0.5);
	w.tick(10, 16);
	ok(App.sphereColor === '#3366ff' && App.sphereParams.layers.wall === 0.2 && App.sphereParams.layers.disp === undefined && App.sphereParams.hollow.disp === 0.5,
		'sphere setters drive the live app (params are per shader)', JSON.stringify(App.sphereParams));
	// persisted through the app bag (autosave), restored to defaults
	App.markDirty(); w.flushTimers(1000);
	var stored = JSON.parse(w.localStorage._d['spiro.autosave.v1']);
	ok(stored.app.sphereShader === 'hollow', 'shader selection autosaves in the app bag');
	ok(stored.app.sphereParams.layers.wall === 0.2 && stored.app.sphereParams.hollow.disp === 0.5, 'per-shader params autosave', JSON.stringify(stored.app.sphereParams));
	ok(stored.app.sphereColor === '#3366ff', 'sphere tint autosaves');
	Settings.applyApp(Settings.defaultApp(), App, w.GUI);
	ok(App.sphereShader === 'off' && App.sphereColor === '#9fd8ff' && App.sphereParams.layers.wall === 0.045, 'restore-defaults applies the sphere schema');
	App.resetScene();
	w.tick(5, 16);
	ok(App.sphereShader === 'off', 'full scene reset leaves spheres off');
})();

// ---- whole-mode sliders never re-bake an identical figure -----------
// max period is a search CEILING and detail is quantized (point budget, ring
// cap), so long stretches of either slider map to the very same curve. a
// re-bake there clears the canvas and redraws the same pixels: a flicker for
// no reason. bakes are counted through Gear.startWhole (main.js resolves it
// off the global Gear object at call time).
(function wholeSlidersSkipNoopBakes() {
	App.resetScene();
	App.setMode('whole');
	App.recomputeWhole(true);
	w.tick(60, 16);
	ok(!App.currentPeriod || App.currentPeriod.turns > 0, 'whole mode has a detected period');
	var realStart = w.Gear.startWhole, bakes = 0;
	w.Gear.startWhole = function () { bakes++; return realStart.apply(this, arguments); };
	function bakesFor(fn) { bakes = 0; fn(); w.flushTimers(1000); w.tick(60, 16); return bakes; }

	var mp0 = App.maxPeriod;
	ok(bakesFor(function () { App.setMaxPeriod(mp0); }) === 0, 're-setting max period to its current value does nothing');
	// a much lower ceiling that still exceeds the detected period: same figure.
	var above = Math.max(Settings.LIMITS.maxPeriod.min, App.currentPeriod.turns * 2);
	ok(bakesFor(function () { App.setMaxPeriod(above); }) === 0,
		'a different ceiling that yields the same period does not re-bake', App.maxPeriod + ' vs period ' + App.currentPeriod.turns);
	ok(App.maxPeriod === Settings.clamp('maxPeriod', above), 'the ceiling value is still stored', App.maxPeriod);
	// a ceiling below the closure cuts the figure short: real change, real bake.
	var cutBakes = bakesFor(function () { App.setMaxPeriod(Settings.LIMITS.maxPeriod.min); });
	ok(cutBakes > 0, 'a ceiling below the closure re-bakes', cutBakes);
	App.setMaxPeriod(mp0); w.flushTimers(1000); w.tick(60, 16);

	var sp0 = App.samplesPerTurn;
	ok(bakesFor(function () { App.setSamplesPerTurn(sp0); }) === 0, 're-setting detail to its current value does nothing');
	ok(bakesFor(function () { App.setSamplesPerTurn(sp0 + Settings.LIMITS.samplesPerTurn.step); }) > 0, 'a real detail change re-bakes');
	// above the per-pencil point cap every detail value gives the same sample
	// count, so the second move must be a no-op.
	App.setSamplesPerTurn(Settings.LIMITS.samplesPerTurn.max);
	w.flushTimers(1000); w.tick(120, 16);
	var capped = App.allGears.filter(function (g) { return g.count > 0; })[0];
	var atCap = capped && capped.count >= w.Gear.CAP - 1;
	if (atCap) ok(bakesFor(function () { App.setSamplesPerTurn(Settings.LIMITS.samplesPerTurn.max - Settings.LIMITS.samplesPerTurn.step); }) === 0,
		'detail moves that clamp to the same sample count do not re-bake');
	else ok(true, 'detail cap case not reachable with this scene (skipped)');
	w.Gear.startWhole = realStart;
	App.setMode('animate');
	App.resetScene();
	w.flushTimers(1000);
})();

// ---- gesture draw quality is measured, not predicted -----------------
// orbiting in 3D used to fall back to the decimated "simple geometry" draw
// for every ring above a device benchmark, even at 60 fps. detail is now shed
// only after a gesture frame actually costs more than 20 ms, and taken back
// once frames are fast again.
(function gestureQualityFollowsFrameTime() {
	// the CPU timer is pinned to 0 for this block: the frame cost the
	// controller sees is then exactly the rAF interval the test feeds it, so a
	// loaded machine cannot trip the 20 ms slow-frame threshold on its own.
	// (this check is about RING SIZE no longer decimating, not about how fast
	// node renders under test.)
	var realNow = w.performance.now;
	w.performance.now = function () { return 0; };
	App.resetScene();
	App.setDim('3d');
	var g = App.roots[0].children[0];
	App.setTrailCap(g, 20000); App.onGearParam(g, 'trail');
	w.tick(400, 16);
	App.setAutoRotate(true);                       // camera motion == gesture path
	w.tick(5, 16);
	var q = App.gestureQuality();
	ok(q.budget === 0 && q.drawn === q.segs, 'fast camera frames draw the full trail', JSON.stringify(q));

	// a big ring at 60 fps is still drawn in full (the old device benchmark
	// decimated by ring size alone). fill it directly instead of simulating
	// 14k frames.
	var col = [1, 0.5, 0.2];
	for (var i = 0; i < 14000; i++)
		w.Gear.pushPoint(g, Math.cos(i * 0.01) * 2, Math.sin(i * 0.013) * 2, Math.sin(i * 0.007), col);
	w.tick(4, 16);
	var big = App.gestureQuality();
	var segs = big.segs;
	ok(segs > 8000, 'test ring is large enough to decimate', segs);
	ok(big.budget === 0 && big.drawn === segs, 'a large ring at 60 fps is still drawn in full', JSON.stringify(big));

	// slow frames: the rAF interval is the visible cost (the GPU runs async).
	w.tick(6, 60);                                 // 60 ms per frame
	var slow = App.gestureQuality();
	ok(slow.budget > 0 && slow.budget < segs, 'slow camera frames shed detail', JSON.stringify(slow));
	ok(slow.budget >= 8000, 'decimation never goes below the shape floor', slow.budget);

	w.tick(60, 16);                                // fast again: quality returns
	ok(App.gestureQuality().budget === 0, 'full detail comes back once frames are fast', JSON.stringify(App.gestureQuality()));

	// debug override still pins the budget and disables adaptation.
	w.SPIRO_GESTURE_SEG_BUDGET = 5000;
	w.tick(4, 60);
	ok(App.gestureQuality().budget === 5000, 'debug override pins the gesture budget', App.gestureQuality().budget);
	delete w.SPIRO_GESTURE_SEG_BUDGET;
	w.performance.now = realNow;
	App.setAutoRotate(false);
	App.setDim('2d');
	App.resetScene();
	w.tick(5, 16);
})();

// ---- 0.7.5: preset save names ----------------------------------------
(function presetSaveName() {
	App.resetScene();
	ok(/^2d-tails-\d\d-\d\d-\d\d-\d\d-\d\d-\d\d\.js$/.test(App.sceneFileName()),
		'default save name: 2d + tails + timestamp', App.sceneFileName());
	App.setDrawTrails(false);
	ok(/^2d-\d\d-/.test(App.sceneFileName()) && App.sceneFileName().indexOf('tails') < 0,
		'trail hidden -> no -tails flag');
	App.setMode('whole');
	ok(/^2d-whole-/.test(App.sceneFileName()), 'whole mode adds -whole');
	App.setDim('3d');
	ok(/^3d-whole-/.test(App.sceneFileName()), '3D swaps the prefix');
	App.setMode('animate'); App.setDrawTrails(true); App.setDim('2d');
	// end-to-end: the save button offers the auto name on the download anchor
	// and writes a SETTINGS module (what presets_combine.py consumes).
	var realCreate = w.document.createElement, anchor = null, blobText = '';
	var RealBlob = w.Blob;
	w.Blob = function (parts) { blobText = parts[0]; };
	w.document.createElement = function (tag) { var n = realCreate(tag); if (tag === 'a') anchor = n; return n; };
	App.downloadScene();
	w.document.createElement = realCreate;
	w.Blob = RealBlob;
	ok(/^(2d|3d)-(tails-)?(whole-)?\d\d-\d\d-\d\d-\d\d-\d\d-\d\d\.js$/.test(anchor.download),
		'save button downloads the auto-named file', anchor.download);
	ok(blobText.indexOf('var S =') >= 0 && blobText.indexOf('root.SETTINGS') >= 0,
		'saved file is a SETTINGS module (a valid preset)');
})();

// ---- 0.7.5: preset dropdown + loadPreset ------------------------------
(function presetsUI() {
	function tree(nKids) {
		var roots = Gear.defaultScene();
		for (var i = 0; i < nKids; i++) {
			roots[0].children.push(Gear.makeGear({
				r: 0.1, speed: 0.3, internal: true,
				pencil: { d: 0.05, c1: { on: true, color: '#ffffff' }, c2: { on: false } }
			}));
		}
		Gear.initRuntime(roots[0], null);
		return roots;
	}
	function findPresetSelect(host) {
		var found = null;
		(function walk(n) {
			if (found || !n) return;
			if (n.tagName === 'SELECT' && n.children.length && n.children[0].value === '') { found = n; return; }
			for (var i = 0; i < (n.children || []).length; i++) walk(n.children[i]);
		})(host);
		return found;
	}
	// boot exactly like index.html would with a combined default.js:
	// SETTINGS = startup scene, PRESETS = dropdown entries.
	var startup = Gear.serialize(tree(3), { zoom: 2.5, pan: [0.1, -0.2] }, 2, 'frequency');
	var sceneA = Gear.serialize(Gear.defaultScene(), { zoom: 1, pan: [0, 0] }, 1, 'frequency');
	var sceneB = Gear.serialize(tree(2), { zoom: 1, pan: [0, 0] }, 1, 'frequency');
	sceneB.dim = '3d';
	sceneB.app = Settings.sanitizeApp({ mode: 'whole' });
	var w2 = boot({
		settings: startup,
		presets: [
			{ name: '2d-25-01-01-00-00-00', scene: sceneA },
			{ name: '3d-tails-whole-25-01-01-00-00-01', scene: sceneB }
		]
	});
	var App2 = w2.App;
	ok(App2.allGears.length === 5, 'window.SETTINGS loads as the startup scene', App2.allGears.length);
	ok(App2.view.zoom === 2.5 && App2.globalSpeed === 2, 'startup scene restores view + speed');
	var sel = findPresetSelect(w2.byId.panel);
	ok(!!sel, 'preset dropdown present when presets exist');
	ok(sel.children.length === 3, 'placeholder + one option per preset', sel.children.length);
	sel.value = '3d-tails-whole-25-01-01-00-00-01';
	sel.dispatch('change');
	ok(sel.value === '', 'selection falls back to the placeholder after a pick');
	ok(App2.allGears.length === 4 && App2.dim === '3d' && App2.mode === 'whole',
		'preset load restores gears + dim + mode', App2.allGears.length + ' ' + App2.dim + ' ' + App2.mode);
	App2.loadPreset('2d-25-01-01-00-00-00');
	ok(App2.allGears.length === 2 && App2.dim === '2d' && App2.mode === 'animate', 'loadPreset by name');
	App2.loadPreset('nope');
	ok(w2.byId.toast.textContent.indexOf('preset not found') === 0, 'unknown preset toasts');
	// the main boot (no PRESETS) shows no dropdown at all
	ok(!findPresetSelect(w.byId.panel), 'no preset dropdown without presets');
})();

// ---- 0.7.5: shipped default.js shape ----------------------------------
(function shippedDefaultFile() {
	var dj = require('../save/default.js');
	ok(dj.SETTINGS && dj.SETTINGS.gears && dj.SETTINGS.gears.length > 0, 'shipped default.js exports its startup scene');
	ok(Array.isArray(dj.PRESETS), 'shipped default.js exports a preset list');
	var good = true, names = [];
	for (var i = 0; i < dj.PRESETS.length; i++) {
		var p = dj.PRESETS[i];
		if (!p || typeof p.name !== 'string' || !p.name ||
			!p.scene || typeof p.scene !== 'object' || !Array.isArray(p.scene.gears)) good = false;
		if (p && typeof p.name === 'string') names.push(p.name);
	}
	ok(good, 'shipped presets are valid {name, scene} entries');
	ok(names.length === new Set(names).size, 'shipped preset names are unique', names.join(','));
})();

// ---- 0.7.5: auto-camera speed sliders (log scale, pitch bounce) -------
(function autoCameraSpeeds() {
	function findPanelRow(label) {
		var found = null;
		(function walk(n) {
			if (found) return;
			if (n.input && n.labelEl && n.labelEl.textContent.indexOf(label) === 0) { found = n; return; }
			for (var i = 0; i < (n.children || []).length; i++) walk(n.children[i]);
		})(w.byId.panel);
		return found;
	}
	var d = Settings.defaultApp();
	ok(d.autoYaw === 0.2 && d.autoPitch === 0, 'auto-camera defaults: yaw 0.2 rad/s, pitch still',
		JSON.stringify([d.autoYaw, d.autoPitch]));
	ok(Settings.clamp('autoYaw', 0) === 0 && Settings.clamp('autoYaw', 99) === 3, 'speed clamp keeps 0 (off) and caps the top');
	ok(Settings.sanitizeApp({ autoYaw: -1 }).autoYaw === 0, 'a negative speed clamps to 0');
	ok(Settings.sanitizeApp({ autoPitch: 'x' }).autoPitch === 0, 'garbage speed falls back to the default');
	var yawRow = findPanelRow('auto yaw'), pitRow = findPanelRow('auto pitch');
	ok(!!yawRow && !!pitRow, 'panel has the auto yaw / auto pitch sliders');
	ok(yawRow.values[0] === 0 && pitRow.values[0] === 0, 'speed ladders start at 0 = axis off');
	var rising = yawRow.values.length > 50;
	for (var i = 1; i < yawRow.values.length; i++) if (yawRow.values[i] <= yawRow.values[i - 1]) rising = false;
	ok(rising, 'speed ladder is a strictly rising log scale', yawRow.values.length);
	ok(yawRow.values[yawRow.values.length - 1] === Settings.LIMITS.autoYaw.max, 'speed ladder ends at the max');
	ok(yawRow.values.indexOf(0.2) >= 0, 'the 0.2 default is a ladder value (no display drift)');
	var idx = Math.floor(yawRow.values.length * 0.7);
	yawRow.input.value = idx;
	yawRow.input.dispatch('input');
	ok(App.autoYaw === yawRow.values[idx], 'yaw slider drives the speed', App.autoYaw);

	// live behaviour: default yaw drift, pitch still, rate follows the slider
	App.resetScene();
	App.setDim('3d');
	App.setAutoRotate(true);
	w.tick(10, 16);
	var pit0 = App.cam.pitch;
	ok(App.cam.yaw !== 0 && App.cam.pitch === pit0, 'auto-rotate drifts yaw only at the default pitch speed');
	App.setAutoYaw(2);
	var yawB = App.cam.yaw;
	w.tick(10, 16);
	ok(App.cam.yaw - yawB > 0.16, 'raising the yaw speed rotates faster', (App.cam.yaw - yawB).toFixed(3));
	// pitch drift bounces at the clamp instead of pinning at the pole
	App.setAutoPitch(3);
	App.cam.pitch = Camera3.PITCH_LIMIT - 0.02;
	w.tick(3, 16);
	ok(App.cam.pitch < Camera3.PITCH_LIMIT - 0.01, 'auto pitch bounces at the clamp',
		App.cam.pitch.toFixed(3));
	ok(Math.abs(App.cam.pitch) <= Camera3.PITCH_LIMIT, 'pitch never leaves the clamp band');
	// persisted in the app bag, restored by reset
	App.setAutoYaw(1.5); App.setAutoPitch(0.5);
	App.markDirty(); w.flushTimers(1000);
	var stored = JSON.parse(w.localStorage._d['spiro.autosave.v1']);
	ok(stored.app.autoYaw === 1.5 && stored.app.autoPitch === 0.5, 'auto-camera speeds autosave in the app bag');
	App.setAutoRotate(false);
	App.resetScene();
	ok(App.autoYaw === 0.2 && App.autoPitch === 0, 'reset restores the speed defaults');
})();

// ---- 0.7.5: presets_combine.py merges scene files into default.js -----
(function presetsCombinePy() {
	var cp = require('child_process'), fs = require('fs'), os = require('os'), p = require('path'), vm = require('vm');
	var py = null;
	['python3', 'python'].some(function (cmd) {
		try { cp.execSync(cmd + ' --version', { stdio: 'pipe' }); py = cmd; return true; } catch (e) { return false; }
	});
	if (!py) { ok(true, 'python not available - presets_merge_to_default.js.py checks skipped'); return; }
	function moduleJs(s) {
		return '(function (root) {\n\tvar S = ' + JSON.stringify(s) + ';\n' +
			'\tif (typeof module !== \'undefined\' && module.exports) module.exports = S;\n' +
			'\telse root.SETTINGS = S;\n' +
			'})(typeof window !== \'undefined\' ? window : globalThis);\n';
	}
	// the scripts work on the save/ folder next to index.html
	function runCombine(dir) {
		cp.execSync(py + ' ' + JSON.stringify(p.join(__dirname, '..', 'save', 'presets_merge_to_default.js.py')), { cwd: dir, stdio: 'pipe' });
	}
	function loadDefault(dir) {
		var ctx = {};
		vm.createContext(ctx);
		vm.runInContext(fs.readFileSync(p.join(dir, 'save', 'default.js'), 'utf8'), ctx, { filename: 'default.js' });
		return ctx;
	}
	var sA = Gear.serialize(Gear.defaultScene(), { zoom: 2, pan: [0, 0] }, 1, 'frequency');
	var sB = Gear.serialize(Gear.defaultScene(), { zoom: 3, pan: [0, 0] }, 1, 'frequency');
	sB.dim = '3d';
	var dir = fs.mkdtempSync(p.join(os.tmpdir(), 'spiro-presets-'));
	try {
		fs.mkdirSync(p.join(dir, 'save'));
		var base = Gear.serialize(Gear.defaultScene(), { zoom: 1, pan: [0, 0] }, 1, 'frequency');
		fs.writeFileSync(p.join(dir, 'save', 'default.js'), moduleJs(base));
		fs.writeFileSync(p.join(dir, 'save', '2d-25-01-01-10-00-00.js'), moduleJs(sA));
		fs.writeFileSync(p.join(dir, 'save', '3d-tails-whole-25-01-01-11-00-00.js'), moduleJs(sB));
		fs.writeFileSync(p.join(dir, 'save', 'plain.json'), JSON.stringify(sA));
		fs.writeFileSync(p.join(dir, 'save', 'not-a-scene.js'), 'console.log("not a scene");\n');
		fs.writeFileSync(p.join(dir, 'outside.js'), moduleJs(sA));   // not in save/: ignored
		runCombine(dir);
		var ctx = loadDefault(dir);
		ok(ctx.SETTINGS && ctx.SETTINGS.view.zoom === 1, 'combiner preserves the startup scene');
		ok(Array.isArray(ctx.PRESETS) && ctx.PRESETS.length === 3, 'every scene file in save/ became a preset',
			ctx.PRESETS && ctx.PRESETS.length);
		var names = ctx.PRESETS.map(function (x) { return x.name; });
		ok(names.join(',') === '2d-25-01-01-10-00-00,3d-tails-whole-25-01-01-11-00-00,plain',
			'preset names come from the file names', names.join(','));
		ok(ctx.PRESETS[0].scene.view.zoom === 2 && ctx.PRESETS[1].scene.dim === '3d' && ctx.PRESETS[2].scene.view.zoom === 2,
			'preset scenes keep their content');
		ok(fs.existsSync(p.join(dir, 'save', '2d-25-01-01-10-00-00.js.delete-me')) &&
			fs.existsSync(p.join(dir, 'save', 'plain.json.delete-me')), 'combined files are renamed *.delete-me');
		ok(fs.existsSync(p.join(dir, 'save', 'not-a-scene.js')), 'non-scene files are left alone');
		ok(fs.existsSync(p.join(dir, 'outside.js')), 'scene files outside save/ are ignored');
		var gen = fs.readFileSync(p.join(dir, 'save', 'default.js'), 'utf8');
		runCombine(dir);
		ok(fs.readFileSync(p.join(dir, 'save', 'default.js'), 'utf8') === gen, 'a second run changes nothing (rename = done marker)');
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	var dir2 = fs.mkdtempSync(p.join(os.tmpdir(), 'spiro-presets-'));
	try {
		fs.mkdirSync(p.join(dir2, 'save'));
		fs.writeFileSync(p.join(dir2, 'save', '2d-25-01-01-00-00-00.js'), moduleJs(sA));
		runCombine(dir2);
		var ctx2 = loadDefault(dir2);
		ok(ctx2.SETTINGS === null && ctx2.PRESETS.length === 1,
			'missing save/default.js is created (no startup scene, presets kept)');
	} finally {
		fs.rmSync(dir2, { recursive: true, force: true });
	}
	// no save/ folder: the script says so instead of writing anywhere
	var dir3 = fs.mkdtempSync(p.join(os.tmpdir(), 'spiro-presets-'));
	try {
		var threw = false;
		try { runCombine(dir3); } catch (e) { threw = true; }
		ok(threw && !fs.existsSync(p.join(dir3, 'default.js')),
			'no save/ folder: the script fails without writing a default.js');
	} finally {
		fs.rmSync(dir3, { recursive: true, force: true });
	}
})();

// ---- 0.7.6: symmetry save - one gear per level ------------------------
(function symmetrySave() {
	function depthCounts(roots) {
		var counts = [], level = roots;
		for (;;) {
			counts.push(level.length);
			var next = [];
			for (var i = 0; i < level.length; i++)
				for (var j = 0; j < level[i].children.length; j++)
					next.push(level[i].children[j]);
			if (!next.length) break;
			level = next;
		}
		return counts;
	}
	function gearSig(g) {
		return [g.r, g.speed, g.speed2, g.internal, g.rot, g.trailCap,
			g.pencil.d, g.pencil.width, g.pencil.c1.on, g.pencil.c1.color,
			g.pencil.c2.on, g.pencil.c2.color, g.pencil.animSpeed, g.pencil.animMode].join('|');
	}
	function uniformLevels(roots) {
		var level = roots.slice();
		for (;;) {
			if (level.length > 1) {
				var s = gearSig(level[0]);
				for (var i = 1; i < level.length; i++)
					if (gearSig(level[i]) !== s) return false;
			}
			var next = [];
			for (var j = 0; j < level.length; j++)
				for (var k = 0; k < level[j].children.length; k++)
					next.push(level[j].children[k]);
			if (!next.length) break;
			level = next;
		}
		return true;
	}

	App.resetScene();
	App.setSymmetry(true);
	App.applyLevel(1, 3);
	App.applyLevel(2, 2);
	ok(App.allGears.length === 10, 'symmetric scene: 1+3+6 gears', App.allGears.length);
	ok(uniformLevels(App.roots), 'symmetry on: the live tree is uniform per level');

	// the save keeps the one-gear-per-level spine + the per-level counts
	App.markDirty();
	w.flushTimers(1000);
	var stored = JSON.parse(w.localStorage._d['spiro.autosave.v1']);
	ok(stored.levels && stored.levels.join(',') === '3,2', 'symmetry save stores the per-level counts',
		stored.levels && stored.levels.join(','));
	var spine = stored.gears[0];
	ok(spine.children.length === 1 && spine.children[0].children.length === 1 &&
		spine.children[0].children[0].children.length === 0,
		'symmetry save keeps one gear per level');

	// the same scene with symmetry off is the full (larger) save
	App.setSymmetry(false);
	App.markDirty();
	w.flushTimers(1000);
	var full = JSON.parse(w.localStorage._d['spiro.autosave.v1']);
	ok(!('levels' in full) && full.gears[0].children.length === 3,
		'symmetry off: full save without counts');
	ok(JSON.stringify(stored).length < JSON.stringify(full).length,
		'symmetry save is smaller than the full save',
		JSON.stringify(stored).length + ' vs ' + JSON.stringify(full).length);

	// the loader re-expands the spine into the same rosette
	var d = Gear.deserialize(JSON.parse(JSON.stringify(stored)));
	ok(depthCounts(d.roots).join(',') === '1,3,6', 'expand: the full rosette is restored',
		depthCounts(d.roots).join(','));
	ok(uniformLevels(d.roots), 'expand: every level is uniform again');
	var spreadOk = true;
	var l1 = d.roots[0].children;
	for (var i = 0; i < l1.length && spreadOk; i++)
		for (var k = 0; k < l1[i].children.length; k++)
			if (Math.abs(l1[i].children[k].phase0 - k * (Math.PI * 2) / l1[i].children.length) > 1e-9)
				spreadOk = false;
	ok(spreadOk, 'expand: phase0 is re-spread over i*2pi/n');
	// and the expanded tree matches the pre-save one gear for gear
	var live = App.allGears, exp = Gear.flatten(d.roots);
	var match = live.length === exp.length;
	for (var m = 0; m < live.length && match; m++)
		if (gearSig(live[m]) !== gearSig(exp[m])) match = false;
	ok(match, 'roundtrip: expanded gears equal the saved scene');

	// toggling symmetry ON over an asymmetric tree commits it to a rosette
	App.resetScene();
	App.addSubGear(App.roots[0]);                 // 2 children (clone of the first)
	var kids = App.roots[0].children;
	kids[1].speed = 0.9;                          // siblings now differ
	App.addSubGear(kids[0]);                       // level 2 under one parent only
	ok(App.allGears.length === 1 + 2 + 1, 'asymmetric pre-state', App.allGears.length);
	App.setSymmetry(true);
	kids = App.roots[0].children;
	ok(kids[0].speed === kids[1].speed, 'toggle-on: the level clones its template',
		kids[0].speed + ' vs ' + kids[1].speed);
	ok(App.allGears.length === 1 + 2 + 2 && App.levelCount(2) === 1,
		'toggle-on: the deeper level is evened out (max count per level)',
		App.allGears.length);
	ok(uniformLevels(App.roots), 'toggle-on: the tree is uniform per level');

	// removing a gear under symmetry shrinks the WHOLE level
	App.applyLevel(1, 3);
	App.removeGear(App.roots[0].children[1]);
	kids = App.roots[0].children;
	ok(kids.length === 2, 'symmetry remove: the level shrinks, not one branch', kids.length);
	ok(Math.abs(kids[1].phase0 - Math.PI) < 1e-9, 'symmetry remove: siblings re-spread');

	// an old-format save (full tree, symmetry on) commits on load
	App.resetScene();
	App.setSymmetry(true);
	App.applyLevel(1, 4);
	var oldFmt = Gear.serialize(App.roots, App.view, App.globalSpeed, App.colorMode, Settings.snapshotApp(App));
	oldFmt.gears[0].children[2].speed = 0.11;     // desync one sibling (the old format allowed it)
	oldFmt.app.symmetry = true;
	var w3 = boot({ settings: oldFmt });
	var k3 = w3.App.roots[0].children;
	ok(k3.length === 4, 'old-format symmetric load: the level size survives', k3.length);
	ok(k3[1].speed === k3[0].speed && k3[2].speed === k3[0].speed && k3[3].speed === k3[0].speed,
		'old-format symmetric load: commits to the level template',
		k3.map(function (g) { return g.speed; }).join(','));
})();

// ---- 0.7.6: the auto-rotate checkbox persists -------------------------
(function autoRotatePersists() {
	function findCheckbox(labelText) {
		var found = null;
		(function walk(n) {
			if (found || !n) return;
			if (n.children) {
				for (var i = 0; i < n.children.length; i++) {
					var c = n.children[i];
					if (c.tagName === 'INPUT' && c.type === 'checkbox') {
						for (var j = 0; j < n.children.length; j++) {
							var s = n.children[j];
							if (s !== c && s.textContent && s.textContent.indexOf(labelText) >= 0) { found = c; return; }
						}
					}
				}
			}
			for (var k = 0; k < (n.children || []).length; k++) walk(n.children[k]);
		})(w.byId.panel);
		return found;
	}
	var d = Settings.defaultApp();
	ok(d.autoRotate === false, 'autoRotate defaults to off');
	ok(Settings.sanitizeApp({ autoRotate: 'x' }).autoRotate === false, 'garbage autoRotate -> off');
	ok(Settings.sanitizeApp({ autoRotate: 1 }).autoRotate === true, 'autoRotate 1 sanitizes to true');

	App.setAutoRotate(true);
	ok(App.autoRotate === true, 'setAutoRotate turns it on');
	App.markDirty();
	w.flushTimers(1000);
	var stored = JSON.parse(w.localStorage._d['spiro.autosave.v1']);
	ok(stored.app && stored.app.autoRotate === true, 'autoRotate autosaves in the app bag');

	var back = Gear.deserialize(JSON.parse(JSON.stringify(stored)));
	ok(back.app.autoRotate === true, 'the saved app bag carries autoRotate');
	var box = findCheckbox('auto-rotate camera');
	ok(!!box, 'auto-rotate checkbox exists');
	// a load where the saved value differs: the recipe must sync both
	App.setAutoRotate(false);
	Settings.applyApp(back.app, App, w.GUI);      // what loadObject does
	ok(App.autoRotate === true && box.checked === true,
		'applying the bag restores state + checkbox');
	App.resetScene();
	ok(App.autoRotate === false && box.checked === false,
		'reset turns autoRotate back off (state + checkbox)');
})();

// ---- 0.7.6: opening a linked preset file (multi-file workflow) --------
(function presetOpenDialog() {
	var startup = Gear.serialize(Gear.defaultScene(), { zoom: 1, pan: [0, 0] }, 1, 'frequency');
	var sceneA = Gear.serialize(Gear.defaultScene(), { zoom: 3, pan: [0, 0] }, 1, 'frequency');
	var sceneB = Gear.serialize(Gear.defaultScene(), { zoom: 7, pan: [0, 0] }, 1, 'frequency');
	// what link_presets_to_html.py writes: one PRESETS entry, never SETTINGS
	var fileText = '// preset: bundled.js\n' +
		'(function (root) {\n' +
		'\tvar S = ' + JSON.stringify(sceneB) + ';\n' +
		'\troot.PRESETS = (root.PRESETS || []).concat([{ name: "bundled", scene: S }]);\n' +
		'})(typeof window !== \'undefined\' ? window : globalThis);\n';
	var w2 = boot({ settings: startup, presets: [{ name: 'bundled', scene: sceneA }] });
	var App2 = w2.App;
	ok(App2.view.zoom === 1, 'linked boot: the startup scene loads', App2.view.zoom);
	ok(App2.presets().length === 1, 'linked boot: the bundled preset is listed');

	var captured = null;
	var realCreate = w2.document.createElement;
	w2.document.createElement = function (tag) {
		var e = realCreate(tag);
		if (tag === 'input') captured = e;
		return e;
	};
	App2.loadFile();
	w2.document.createElement = realCreate;
	ok(!!captured, 'loadFile creates a file input');
	captured.files = [{ name: 'bundled.js', _text: fileText }];
	captured.dispatch('change');
	ok(App2.view.zoom === 7, 'opening a preset file loads that file\'s scene', App2.view.zoom);
	ok(w2.SETTINGS.view.zoom === 1, 'preset files do not clobber window.SETTINGS');
	// the opened entry duplicates the bundled name: last one wins, once
	var list = App2.presets();
	ok(list.length === 1 && list[0].scene.view.zoom === 7,
		'preset list dedupes by name (last wins)', list.length);
	App2.loadPreset('bundled');
	ok(App2.view.zoom === 7, 'loadPreset resolves the deduped (latest) entry');
});

// ---- 0.7.6: link_presets_to_html.py -----------------------------------
(function presetsLinkPy() {
	var cp = require('child_process'), fs = require('fs'), os = require('os'), p = require('path'), vm = require('vm');
	var py = null;
	['python3', 'python'].some(function (cmd) {
		try { cp.execSync(cmd + ' --version', { stdio: 'pipe' }); py = cmd; return true; } catch (e) { return false; }
	});
	if (!py) { ok(true, 'python not available - link_presets_to_html.py checks skipped'); return; }
	var root = p.join(__dirname, '..');
	// the scripts work on the save/ folder next to index.html
	function runLink(dir) {
		cp.execSync(py + ' ' + JSON.stringify(p.join(root, 'save', 'link_presets_to_html.py')), { cwd: dir, stdio: 'pipe' });
	}
	function moduleJs(s) {
		return '(function (root) {\n\tvar S = ' + JSON.stringify(s) + ';\n' +
			'\tif (typeof module !== \'undefined\' && module.exports) module.exports = S;\n' +
			'\telse root.SETTINGS = S;\n' +
			'})(typeof window !== \'undefined\' ? window : globalThis);\n';
	}
	// load like the browser would: default.js, then the managed tags in order
	function loadAll(dir) {
		var html = fs.readFileSync(p.join(dir, 'index.html'), 'utf8');
		var order = [], re = /<script src="([^"]+)" class="preset"><\/script>/g, m;
		while ((m = re.exec(html))) order.push(m[1]);
		var ctx = {};
		vm.createContext(ctx);
		vm.runInContext(fs.readFileSync(p.join(dir, 'save', 'default.js'), 'utf8'), ctx, { filename: 'default.js' });
		for (var i = 0; i < order.length; i++)
			vm.runInContext(fs.readFileSync(p.join(dir, order[i]), 'utf8'), ctx, { filename: order[i] });
		return { ctx: ctx, order: order };
	}
	var sA = Gear.serialize(Gear.defaultScene(), { zoom: 2, pan: [0, 0] }, 1, 'frequency');
	var sB = Gear.serialize(Gear.defaultScene(), { zoom: 3, pan: [0, 0] }, 1, 'frequency');
	var sC = Gear.serialize(Gear.defaultScene(), { zoom: 5, pan: [0, 0] }, 1, 'frequency');
	var dir = fs.mkdtempSync(p.join(os.tmpdir(), 'spiro-link-'));
	try {
		fs.copyFileSync(p.join(root, 'index.html'), p.join(dir, 'index.html'));
		fs.mkdirSync(p.join(dir, 'save'));
		var base = Gear.serialize(Gear.defaultScene(), { zoom: 1, pan: [0, 0] }, 1, 'frequency');
		fs.writeFileSync(p.join(dir, 'save', 'default.js'),
			'(function (root) {\n' +
			'\tvar S = ' + JSON.stringify(base) + ';\n' +
			'\tvar PRESETS = [];\n' +
			'\tif (typeof module !== \'undefined\' && module.exports) module.exports = { SETTINGS: S, PRESETS: PRESETS };\n' +
			'\telse { root.SETTINGS = S; root.PRESETS = PRESETS; }\n' +
			'})(typeof window !== \'undefined\' ? window : globalThis);\n');
		fs.writeFileSync(p.join(dir, 'save', 'a.js'), moduleJs(sA));
		fs.writeFileSync(p.join(dir, 'save', 'b.js'), moduleJs(sB));
		fs.writeFileSync(p.join(dir, 'save', 'plain.json'), JSON.stringify(sA));
		fs.writeFileSync(p.join(dir, 'save', 'not-a-scene.js'), 'console.log("x");\n');

		// 1. first run: a tag per scene file, files converted, markers written
		runLink(dir);
		var html1 = fs.readFileSync(p.join(dir, 'index.html'), 'utf8');
		ok(html1.indexOf('<script src="save/a.js" class="preset"></script>') > 0 &&
			html1.indexOf('<script src="save/b.js" class="preset"></script>') > 0,
			'link inserts a save/ preset tag per scene file');
		var dIdx = html1.indexOf('src="save/default.js"'), aIdx = html1.indexOf('src="save/a.js"'), mIdx = html1.indexOf('src="js/main.js"');
		ok(dIdx > -1 && dIdx < aIdx && aIdx < mIdx, 'tags sit between save/default.js and js/main.js');
		ok(html1.indexOf('src="save/plain.json"') < 0, 'json files are not linked');
		var fa = fs.readFileSync(p.join(dir, 'save', 'a.js'), 'utf8');
		ok(fa.split('\n')[0] === '// preset: a.js', 'the marker line records the file name');
		ok(fa.indexOf('root.PRESETS') > 0 && fa.indexOf('root.SETTINGS = S') < 0,
			'linked files append to PRESETS, never set SETTINGS');
		// second run: byte-stable
		runLink(dir);
		ok(fs.readFileSync(p.join(dir, 'index.html'), 'utf8') === html1 &&
			fs.readFileSync(p.join(dir, 'save', 'a.js'), 'utf8') === fa,
			'a second run changes nothing (idempotent)');

		// the page picks the presets up in tag order, startup scene intact
		var sim = loadAll(dir);
		ok(sim.ctx.SETTINGS && sim.ctx.SETTINGS.view.zoom === 1,
			'linked files leave the startup scene alone');
		ok(sim.ctx.PRESETS.map(function (x) { return x.name; }).join(',') === 'a,b',
			'linked files append their presets in tag order',
			sim.ctx.PRESETS.map(function (x) { return x.name; }).join(','));
		ok(sim.ctx.PRESETS[0].scene.view.zoom === 2 && sim.ctx.PRESETS[1].scene.view.zoom === 3,
			'linked preset scenes keep their content');

		// 2. rename: the tag follows the file (via its marker)
		fs.renameSync(p.join(dir, 'save', 'a.js'), p.join(dir, 'save', 'a2.js'));
		runLink(dir);
		var html2 = fs.readFileSync(p.join(dir, 'index.html'), 'utf8');
		ok(html2.indexOf('src="save/a2.js"') > 0 && html2.indexOf('src="save/a.js"') < 0, 'rename moves the tag');
		ok(fs.readFileSync(p.join(dir, 'save', 'a2.js'), 'utf8').split('\n')[0] === '// preset: a2.js',
			'the marker follows the rename');

		// 3. delete: the tag is dropped
		fs.unlinkSync(p.join(dir, 'save', 'b.js'));
		runLink(dir);
		var html3 = fs.readFileSync(p.join(dir, 'index.html'), 'utf8');
		ok(html3.indexOf('src="save/b.js"') < 0, 'delete drops the tag');
		ok(html3.indexOf('src="save/a2.js"') > 0, 'other tags survive the cleanup');

		// 4. a new file gains a tag on the next run
		fs.writeFileSync(p.join(dir, 'save', 'c.js'), moduleJs(sC));
		runLink(dir);
		var sim2 = loadAll(dir);
		ok(sim2.ctx.PRESETS.map(function (x) { return x.name; }).join(',') === 'a2,c',
			'a new file is picked up on the next run',
			sim2.ctx.PRESETS.map(function (x) { return x.name; }).join(','));

		// 5. the merge script leaves linked files alone, consumes the rest
		fs.writeFileSync(p.join(dir, 'save', 'plain2.js'), moduleJs(sB));
		cp.execSync(py + ' ' + JSON.stringify(p.join(root, 'save', 'presets_merge_to_default.js.py')), { cwd: dir, stdio: 'pipe' });
		ok(fs.existsSync(p.join(dir, 'save', 'a2.js')) && fs.existsSync(p.join(dir, 'save', 'c.js')),
			'merge leaves linked files in place');
		ok(fs.existsSync(p.join(dir, 'save', 'plain2.js.delete-me')), 'merge consumes the unlinked file');
		var djCtx = {};
		vm.createContext(djCtx);
		vm.runInContext(fs.readFileSync(p.join(dir, 'save', 'default.js'), 'utf8'), djCtx, { filename: 'default.js' });
		ok(djCtx.PRESETS.map(function (x) { return x.name; }).join(',') === 'plain,plain2',
			'merged presets land in default.js only',
			djCtx.PRESETS.map(function (x) { return x.name; }).join(','));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
})();

// ---- 0.7.8: the panel + gear menu are split into striped groups --------
(function guiGroups() {
	var fs = require('fs'), path = require('path');
	function text(n) {
		var s = n.textContent || '';
		for (var i = 0; i < (n.children || []).length; i++) s += ' ' + text(n.children[i]);
		return s;
	}
	function groups(node, out) {
		out = out || [];
		for (var i = 0; i < (node.children || []).length; i++) {
			var c = node.children[i];
			if (c.className === 'group') out.push(c); else groups(c, out);
		}
		return out;
	}
	function byTitle(gs, title) {
		for (var i = 0; i < gs.length; i++) {
			var h = gs[i].children[0];
			if (h && h.className === 'gh' && h.textContent === title) return gs[i];
		}
		return null;
	}
	// every section of the panel lives in a group (only the footer help line
	// hangs loose), every group is titled and holds rows to stripe
	var loose = [];
	for (var i = 0; i < w.byId.panel.children.length; i++) {
		var c = w.byId.panel.children[i];
		if (c.className !== 'group' && c.className !== 'help') loose.push(c.className || c.tagName);
	}
	ok(loose.length === 0, 'panel: every section sits in a group', loose.join(','));
	var gs = groups(w.byId.panel);
	ok(gs.length >= 7, 'panel: several logical groups', gs.length);
	var titled = 0, withRows = 0;
	for (var j = 0; j < gs.length; j++) {
		if (gs[j].children[0] && gs[j].children[0].className === 'gh') titled++;
		if (gs[j].children.length >= 2) withRows++;
	}
	ok(titled === gs.length, 'panel: every group has a title band');
	ok(withRows === gs.length, 'panel: every group has rows under its title');
	// the groups the task named: the transport in one, everything save-related
	// in the next - and nothing shared between them
	var play = byTitle(gs, 'playback'), scene = byTitle(gs, 'scene');
	ok(!!play && !!scene, 'panel: a playback group and a scene group');
	ok(/play \(space\)|pause \(space\)/.test(text(play)) && text(play).indexOf('clear (c)') >= 0 &&
		text(play).indexOf('reset (x)') >= 0, 'playback group: pause + clear + reset together');
	ok(text(play).indexOf('anim speed') >= 0, 'playback group: the global speed knob');
	ok(text(scene).indexOf('copy (s)') >= 0 && text(scene).indexOf('save (d)') >= 0 &&
		text(scene).indexOf('open (o)') >= 0 && text(scene).indexOf('paste (p)') >= 0,
		'scene group: the whole save / load row');
	ok(text(scene).indexOf('autosave') >= 0, 'scene group: the autosave status line');
	ok(text(play).indexOf('save (d)') < 0 && text(scene).indexOf('reset (x)') < 0,
		'panel: transport and save stay in separate groups');
	var view = byTitle(gs, 'view'), tree = byTitle(gs, 'tree');
	ok(text(view).indexOf('circles') >= 0 && text(view).indexOf('dial') >= 0 &&
		text(view).indexOf('points') >= 0 && text(view).indexOf('3D axis') >= 0,
		'view group: the draw toggles together');
	ok(text(tree).indexOf('symmetry') >= 0 && text(tree).indexOf('lvl 1') >= 0 &&
		text(tree).indexOf('reset levels') >= 0, 'tree group: symmetry + level sliders + reset');
	// the gear menu follows the same shape: a drag title over groups only
	App.resetScene();
	w.GUI.openMenu(App.allGears[1], 100, 100);
	var mg = groups(w.byId.ctxmenu);
	var mTitles = mg.map(function (g) { return g.children[0].textContent; }).join(',');
	ok(mTitles === 'geometry,pen,trail,gears', 'gear menu: geometry / pen / trail / gears groups', mTitles);
	var mLoose = 0;
	for (var m = 0; m < w.byId.ctxmenu.children.length; m++) {
		var cm = w.byId.ctxmenu.children[m].className;
		if (cm !== 'group' && cm.indexOf('ptitle') < 0) mLoose++;
	}
	ok(mLoose === 0, 'gear menu: only the drag title hangs outside the groups');
	w.GUI.closeMenu();
	// the stripes themselves are CSS (one band per row of a group)
	var css = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
	ok(css.indexOf('.group > :not(.gh):nth-child(even)') >= 0, 'CSS: striped rows inside a group');
	ok(css.indexOf('.group > .gh') >= 0, 'CSS: the group title band');
})();

// ---- 0.7.8: the gear tree under the level sliders ----------------------
(function gearTreeList() {
	var GUI = w.GUI;
	function dep(g) { var d = 0; while (g.parent) { g = g.parent; d++; } return d; }
	App.resetScene();
	App.applyLevel(1, 3);
	App.applyLevel(2, 2);                 // 10 gears: 1 root, 3 at level 1, 6 at level 2
	var rows = GUI.gearTree();
	ok(rows.length === App.allGears.length, 'tree: one row per gear', rows.length + '/' + App.allGears.length);
	var covered = 0;
	for (var i = 0; i < App.allGears.length; i++)
		for (var j = 0; j < rows.length; j++) if (rows[j].gear === App.allGears[i]) { covered++; break; }
	ok(covered === rows.length, 'tree: every gear appears exactly once');
	var byLevel = true;
	for (var k = 1; k < rows.length; k++) if (dep(rows[k].gear) < dep(rows[k - 1].gear)) byLevel = false;
	ok(byLevel, 'tree: the rows run level by level');
	ok(rows[0].gear === App.roots[0], 'tree: the roots lead');
	var paths = rows.map(function (r) { return r.node.children[2].textContent; });
	ok(paths[0] === '#0' && paths[1] === '#0.0' && paths[4] === '#0.0.0' && paths[paths.length - 1] === '#0.2.1',
		'tree: each row names its place in the tree', paths.join(' '));
	var heads = [];
	(function walk(n) {
		for (var i = 0; i < (n.children || []).length; i++) {
			if (n.children[i].className === 'tlev') heads.push(n.children[i].textContent);
			else walk(n.children[i]);
		}
	})(w.byId.panel);
	ok(heads.join('|') === 'main gears - 1|lvl 1 - 3|lvl 2 - 6',
		'tree: one header per level, counting its gears', heads.join('|'));
	var chip = rows[1].node.children[0];
	ok(chip.className === 'chip' && /^#[0-9a-f]{6}$/i.test(String(chip.style.background)),
		'tree: a row carries its pencil colour as a dot', chip.style.background);
	// click a row -> that gear's menu opens and the row lights up (one row only)
	var pick = rows[4];
	pick.node.dispatch('click');
	ok(GUI.isMenuOpen() && GUI.menuGear() === pick.gear, 'tree: clicking a row opens that gear menu');
	var sel = rows.filter(function (r) { return r.node.classList.contains('sel'); });
	ok(sel.length === 1 && sel[0] === pick, 'tree: exactly the picked row is highlighted');
	// a menu edit follows into the row, without a rebuild
	var dia = rowByLabel(w.byId.ctxmenu, 'diameter');
	dia.input.value = 0.4;
	dia.input.dispatch('input');
	ok(pick.info.textContent.indexOf('d 0.4') === 0, 'tree: the row follows the diameter slider', pick.info.textContent);
	GUI.closeMenu();
	ok(rows.filter(function (r) { return r.node.classList.contains('sel'); }).length === 0,
		'tree: closing the menu clears the highlight');
	// a mirrored (symmetry) edit touched the whole level, so every row follows
	App.setSymmetry(true);
	GUI.openMenu(App.roots[0].children[0], 20, 20);
	dia = rowByLabel(w.byId.ctxmenu, 'diameter');
	dia.input.value = 0.3;
	dia.input.dispatch('input');
	var lvl1 = GUI.gearTree().filter(function (r) { return r.gear.parent === App.roots[0]; });
	var mirrored = lvl1.length === 3 && lvl1.every(function (r) {
		return r.info.textContent.indexOf('d 0.3') === 0;
	});
	ok(mirrored, 'tree: a symmetry edit refreshes every sibling row',
		lvl1.map(function (r) { return r.info.textContent; }).join(' | '));
	GUI.closeMenu();
	App.setSymmetry(false);
	// the same highlight from the other direction: a pick ON THE CANVAS. a
	// one-gear scene keeps the hit test unambiguous (the SMALLEST circle under
	// the pointer wins, so overlapping gears would steal the pick).
	App.applyLevel(1, 0);
	var root = App.roots[0];
	ok(GUI.gearTree().length === 1, 'tree: emptying level 1 leaves just the root row');
	w.byId.c.dispatch('pointerdown', {
		pointerId: 1, pointerType: 'mouse', button: 0,
		clientX: App.cx0 + (root.cx + App.view.pan[0]) * App.S,
		clientY: App.cy0 + (root.cy + App.view.pan[1]) * App.Sy
	});
	ok(GUI.menuGear() === root, 'canvas: clicking a gear still opens its menu');
	ok(GUI.gearTree()[0].node.classList.contains('sel'), 'canvas: the picked gear lights up in the tree');
	w.byId.c.dispatch('pointercancel', { pointerId: 1 });
	GUI.closeMenu();
	// and the list tracks the tree itself
	App.applyLevel(1, 3);
	ok(GUI.gearTree().length === App.allGears.length, 'tree: growing a level adds its rows', GUI.gearTree().length);
	App.applyLevel(2, 2);
	ok(GUI.gearTree().length === App.allGears.length, 'tree: a new level brings its rows', GUI.gearTree().length);
	App.removeGear(App.roots[0].children[0]);
	ok(GUI.gearTree().length === App.allGears.length,
		'tree: removing a gear drops its sub-tree rows too', GUI.gearTree().length);
	App.resetScene();
})();

// ---- 0.7.8 fix: the hue distance measures to a CHOSEN anchor -----------
(function circleHueAnchor() {
	function dep(g) { var d = 0; while (g.parent) { g = g.parent; d++; } return d; }
	if (App.paused) App.togglePause();
	App.setMode('animate');
	App.resetScene();
	App.applyLevel(1, 2);
	App.applyLevel(2, 2);                 // 7 gears: 1 root, 2 at level 1, 4 at level 2
	App.setCircleHue('distance');
	ok(App.circleHueTarget === 'grandparent',
		'the hue anchor defaults one level further out than the parent');
	// the outline colours, read off the real draw call: the hue outline is the
	// only circle drawn with the hue alpha (0.85). every call of snapshot()
	// renders exactly one frame.
	function snapshot() {
		var cols = [];
		var real = w.R.circle;
		w.R.circle = function (x, y, rad, lw, r, g, b, a) {
			if (a === 0.85) cols.push(r.toFixed(4) + ',' + g.toFixed(4) + ',' + b.toFixed(4));
			return real.apply(this, arguments);
		};
		w.tick(1, 32);
		w.R.circle = real;
		return cols.sort().join(' ');
	}
	// the parent anchor is CONSTANT by construction - the mount is rigid, so
	// the centre distance is |R +/- r| forever, in 2D and with a 3D tilt alike.
	// that is what 0.7.7 shipped and why its colours never moved.
	App.setCircleHueTarget('parent');
	w.tick(2, 32);
	var s0 = snapshot();
	ok(s0.length > 0 && s0 === snapshot(), 'parent anchor: the guide colours stay put frame after frame');
	ok(App.allGears[1].distPrev > 0, 'parent anchor: a child still measures its mount radius');
	var deep = App.allGears.filter(function (g) { return dep(g) === 2; });
	var l1 = App.allGears[1];
	// the root anchor: a level-1 gear sits on a fixed circle around it, the
	// level-2 ones ride in and out - and the colour follows them.
	App.setCircleHueTarget('root');
	w.tick(2, 32);
	ok(snapshot() !== snapshot(), 'root anchor: the guide colours change from frame to frame');
	ok(App.allGears[0].distPrev === 0, 'a gear with no anchor measures 0 (the base hue)');
	var was2 = deep[0].distPrev, was1 = l1.distPrev;
	w.tick(6, 32);
	ok(Math.abs(deep[0].distPrev - was2) > 1e-4,
		'root anchor: a level-2 distance really moves', Math.abs(deep[0].distPrev - was2));
	ok(Math.abs(l1.distPrev - was1) < 1e-9,
		'root anchor: a level-1 gear stays on its fixed circle');
	// 'speed' is the rate of the SAME measurement
	App.setCircleHue('speed');
	w.tick(30, 32);
	var moving = 0;
	for (var i = 0; i < deep.length; i++) if (Math.abs(deep[i].distRate) > 1e-3) moving++;
	ok(moving === deep.length, 'speed: every moving gear reports a real rate', moving + '/' + deep.length);
	// switching the anchor re-primes the scratch: the jump is never read as a rate
	App.setCircleHueTarget('parent');
	var primed = true;
	for (var k = 0; k < App.allGears.length; k++) if (App.allGears[k].distRate !== 0) primed = false;
	ok(primed, 'switching the anchor zeroes every rate');
	w.tick(1, 32);
	ok(deep[0].distRate === 0, 'the first frame after a switch holds, it does not diff');
	w.tick(40, 32);
	var mx = 0;
	for (var m = 0; m < App.allGears.length; m++) mx = Math.max(mx, Math.abs(App.allGears[m].distRate));
	ok(mx < 1e-9, 'a constant anchor leaves the rate at nothing (no fake animation)', mx);
	// the same measurement through the 3D centres: the parent anchor stays
	// constant there too, the root one keeps moving (0 tilt reproduces the
	// flat figure standing in XZ).
	App.setCircleHue('distance');
	App.setDim('3d');
	w.tick(2, 32);
	ok(snapshot() === snapshot(), '3D: the parent anchor is constant there as well');
	App.setCircleHueTarget('root');
	var was3 = deep[0].distPrev;
	w.tick(2, 32);
	ok(Math.abs(deep[0].distPrev - was3) > 1e-4, '3D: the distance is measured on the 3D centres');
	ok(snapshot() !== snapshot(), '3D: the anchor distance keeps repainting the outline colours');
	App.setDim('2d');
	// persisted next to the hue mode, and the panel select drives it
	var bag = Settings.snapshotApp(App);
	ok(bag.circleHue === 'distance' && bag.circleHueTarget === 'root', 'the app bag carries hue + anchor');
	ok(Settings.sanitizeApp({ circleHueTarget: 'moon' }).circleHueTarget === 'grandparent',
		'garbage anchor falls back to the default');
	var saved = Gear.serialize(App.roots, App.view, App.globalSpeed, App.colorMode, bag);
	var w2 = boot({ settings: saved });
	ok(w2.App.circleHue === 'distance' && w2.App.circleHueTarget === 'root',
		'a saved scene restores hue mode + anchor');
	var anchorSel = null;
	(function walk(n) {
		if (anchorSel || !n || !n.children) return;
		if (n.tagName === 'SELECT' && n.children.some &&
			n.children.some(function (o) { return o.value === 'grandparent'; })) { anchorSel = n; return; }
		for (var q = 0; q < n.children.length; q++) walk(n.children[q]);
	})(w2.byId.panel);
	ok(!!anchorSel, 'panel: the hue anchor select exists');
	ok(anchorSel.value === 'root', 'the select syncs to the loaded anchor');
	anchorSel.value = 'parent';
	anchorSel.dispatch('change');
	ok(w2.App.circleHueTarget === 'parent', 'the select drives App.setCircleHueTarget');
	App.resetScene();
})();

console.log((fail ? 'FAILED' : 'OK') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
