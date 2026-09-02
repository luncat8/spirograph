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
		if (f.get(App) === d[f.key]) matched++;
		else ok(false, 'live App.' + f.key + ' seeded from schema default', f.get(App) + ' vs ' + d[f.key]);
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
	ok(String(mp.input.min) === String(Settings.LIMITS.maxPeriod.min) &&
		String(mp.input.max) === String(Settings.LIMITS.maxPeriod.max), 'max period range comes from Settings.LIMITS',
		mp.input.min + '..' + mp.input.max);
	var det = findRow('detail');
	ok(!!det, 'panel has a detail (samples/turn) slider');
	det.input.value = 400;
	det.input.dispatch('input');
	ok(App.samplesPerTurn === 400, 'detail slider drives the bake resolution', App.samplesPerTurn);
	App.setSamplesPerTurn(200);
	// context menu: trail length is animate-only
	App.setMode('animate');
	w.GUI.openMenu(App.allGears[1], 50, 50);
	var rows = w.byId.ctxmenu.children, hasTrail = false;
	for (var i = 0; i < rows.length; i++) if (rows[i].labelEl && rows[i].labelEl.textContent.indexOf('trail length') === 0) hasTrail = true;
	ok(hasTrail, 'animate mode: menu has the trail length slider');
	App.setMode('whole');
	rows = w.byId.ctxmenu.children; hasTrail = false;
	for (var j = 0; j < rows.length; j++) if (rows[j].labelEl && rows[j].labelEl.textContent.indexOf('trail length') === 0) hasTrail = true;
	ok(!hasTrail, 'whole mode: no trail length slider (it has no meaning there)');
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

console.log((fail ? 'FAILED' : 'OK') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
