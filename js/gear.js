// js/gear.js - gear model, kinematics, serialization, trace ring buffer
// classic <script> (no modules); guards module.exports for node.

(function (root) {
	'use strict';

	var CAP = 40000;        // hard ceiling of stored trace points per pencil
	var MIN_RING = 2048;    // first lazy ring allocation (grows by doubling)
	var DEF_TRAIL = 20000;  // default soft cap (gear.trailCap)
	var EPS = 0.0009;      // min world-distance between stored trace points
	var TAU = Math.PI * 2;

	// normalize a pencil config (new or legacy) into the canonical shape:
	// c1/c2 are color slots each with its own enable checkbox; the pencil draws
	// when at least one is enabled. both enabled => 2-color animation.
	function makeSlot(on, color) {
		return { on: on, color: color, _rgb: null, _hex: null };
	}

	function normalizePencil(o) {
		o = o || {};
		var p = {
			d: o.d != null ? o.d : 0.4,
			width: o.width != null ? o.width : 2,
			c1: makeSlot(true, '#ff4d4d'),
			c2: makeSlot(false, '#4d7dff'),
			animSpeed: o.animSpeed != null ? o.animSpeed : 0.25,
			animMode: o.animMode != null ? o.animMode : 'frequency'
		};
		if (o.on !== undefined && !o.c1 && !o.c2) {
			// legacy format
			p.c1.on = !!o.on; p.c1.color = o.color || '#ff4d4d';
			var a = o.anim || {};
			p.c2.on = !!a.on; p.c2.color = a.color2 || '#4d7dff';
			p.animSpeed = a.speed != null ? a.speed : 0.1;
			return p;
		}
		if (o.c1) { p.c1.on = !!o.c1.on; p.c1.color = o.c1.color || '#ff4d4d'; }
		if (o.c2) { p.c2.on = !!o.c2.on; p.c2.color = o.c2.color || '#4d7dff'; }
		if (o.animSpeed != null) p.animSpeed = o.animSpeed;
		if (o.animMode != null) p.animMode = o.animMode;
		return p;
	}

	function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

	function makeGear(opts) {
		opts = opts || {};
		return {
			r: opts.r != null ? opts.r : 0.6,
			speed: opts.speed != null ? opts.speed : 0.2,
			internal: opts.internal != null ? opts.internal : false,
			// constant mount offset (radians): spreads the children of one
			// parent evenly (i * 2pi / N) so a level forms a symmetric rosette.
			// it is a phase, NOT integrated state: both `update` and the
			// whole-curve sampler start from it, so animate and whole agree and
			// the offset can never drift away (which is what an offset baked
			// into `rot` did - see findings-pitfalls-skills.md).
			phase0: opts.phase0 != null ? opts.phase0 : 0,
			// soft cap on stored trace points; the ring grows lazily up to it.
			trailCap: clamp(opts.trailCap != null ? opts.trailCap : DEF_TRAIL, 100, CAP),
			pencil: normalizePencil(opts.pencil),
			children: [],
			// runtime (filled by initRuntime)
			parent: null,
			rot: opts.rot != null ? opts.rot : 0,
			cx: 0, cy: 0,
			penx: 0, peny: 0,
			ratio: 1,
			ring: null, cap: 0, head: 0, count: 0
		};
	}

	function defaultScene() {
		var root = makeGear({
			r: 0.6, speed: 0.17, internal: false,
			pencil: { d: 0.3, width: 2, c1: { on: false, color: '#ff4d4d' }, c2: { on: false, color: '#4d7dff' } }
		});
		var child = makeGear({
			r: 0.22, speed: 0.41, internal: true,
			pencil: { d: 0.14, width: 2, c1: { on: true, color: '#ffd24d' }, c2: { on: true, color: '#4dffd2' }, animSpeed: 1.0 }
		});
		root.children.push(child);
		return [root];
	}

	function initRuntime(gear, parent) {
		gear.parent = parent || null;
		if (gear.rot == null) gear.rot = 0;
		if (gear.phase0 == null) gear.phase0 = 0;
		// rings are allocated on first use (see ensureRing): a 200-gear tree
		// used to cost 200 * CAP * 5 floats (~160 MB) before drawing anything.
		gear.ring = null;
		gear.cap = 0;
		gear.head = 0;
		gear.count = 0;
		gear.drawn = 0;
		gear.drawnNewestRing = undefined;
		gear.cx = 0; gear.cy = 0; gear.penx = 0; gear.peny = 0;
		for (var i = 0; i < gear.children.length; i++) initRuntime(gear.children[i], gear);
	}

	// move the stored points into a fresh buffer of `cap` points (newest kept).
	function reallocRing(gear, cap) {
		var ring = new Float32Array(cap * 5);
		var n = Math.min(gear.count, cap);
		if (gear.ring && n > 0) {
			var skip = gear.count - n;                 // keep the newest n points
			for (var k = 0; k < n; k++) {
				var si = (gear.head + skip + k) % gear.cap;
				ring[k * 5] = gear.ring[si * 5];
				ring[k * 5 + 1] = gear.ring[si * 5 + 1];
				ring[k * 5 + 2] = gear.ring[si * 5 + 2];
				ring[k * 5 + 3] = gear.ring[si * 5 + 3];
				ring[k * 5 + 4] = gear.ring[si * 5 + 4];
			}
		}
		gear.ring = ring;
		gear.cap = cap;
		gear.head = 0;
		gear.count = n;
		if (gear.drawn > n) gear.drawn = n;
		gear.drawnNewestRing = undefined;              // ring indices moved
	}

	// grow the ring so it can hold at least `need` points (never above the
	// gear's trailCap). rings start unallocated and double on demand.
	function ensureRing(gear, need) {
		var want = Math.min(need, gear.trailCap);
		if (gear.cap >= want) return;
		var cap = gear.cap || MIN_RING;
		while (cap < want) cap *= 2;
		if (cap > gear.trailCap) cap = gear.trailCap;
		reallocRing(gear, cap);
	}

	// trailCap lowered: drop the oldest points and hand the memory back.
	function applyTrailCap(gear) {
		gear.trailCap = clamp(gear.trailCap, 100, CAP);
		if (!gear.ring || gear.cap <= gear.trailCap) return;
		reallocRing(gear, gear.trailCap);
		gear.drawn = 0;
	}

	function clearTrace(gear) {
		gear.head = 0;
		gear.count = 0;
		gear.drawn = 0;
		gear.drawnNewestRing = undefined;
	}

	function clearAllTraces(gear) {
		clearTrace(gear);
		for (var i = 0; i < gear.children.length; i++) clearAllTraces(gear.children[i]);
	}

	// push a pen sample (world position + rgb color baked at draw time) into the
	// ring buffer; later color changes only affect new points, not existing line.
	// the ring grows by doubling until trailCap, then evicts the oldest point.
	function pushPoint(gear, x, y, col) {
		if (gear.count > 0) {
			var li = (gear.head + gear.count - 1) % gear.cap;
			var dx = x - gear.ring[li * 5], dy = y - gear.ring[li * 5 + 1];
			if (dx * dx + dy * dy < EPS * EPS) return;
		}
		if (gear.count >= gear.cap) ensureRing(gear, gear.cap ? gear.cap * 2 : MIN_RING);
		var idx;
		if (gear.count < gear.cap) {
			idx = (gear.head + gear.count) % gear.cap;
			gear.count++;
		} else {                                      // full at trailCap: drop oldest
			idx = gear.head;
			gear.head = (gear.head + 1) % gear.cap;
		}
		gear.ring[idx * 5] = x; gear.ring[idx * 5 + 1] = y;
		gear.ring[idx * 5 + 2] = col[0]; gear.ring[idx * 5 + 3] = col[1]; gear.ring[idx * 5 + 4] = col[2];
	}

	// call cb(x0,y0,r0,g0,b0, x1,y1,r1,g1,b1) per consecutive segment (ring order, no wrap seam)
	function forEachSegment(gear, cb) {
		var n = gear.count;
		if (!gear.ring) return;
		for (var j = 0; j < n - 1; j++) {
			var ia = (gear.head + j) % gear.cap;
			var ib = (gear.head + j + 1) % gear.cap;
			cb(
				gear.ring[ia * 5], gear.ring[ia * 5 + 1], gear.ring[ia * 5 + 2], gear.ring[ia * 5 + 3], gear.ring[ia * 5 + 4],
				gear.ring[ib * 5], gear.ring[ib * 5 + 1], gear.ring[ib * 5 + 2], gear.ring[ib * 5 + 3], gear.ring[ib * 5 + 4]
			);
		}
	}

	// pure geometry at a given rotation `rot` (shared by `update` and whole-curve
	// sampling so the two paths can never diverge). `carry` is the accumulated
	// orbit phase inherited from ancestors.
	function stateAt(gear, parent, pcx, pcy, carry, rot) {
		// phase0 is a rigid mount offset: it rotates this gear's whole frame
		// (orbit AND pen, and through the inherited carry its entire subtree)
		// around the parent centre. adding it to `rot` instead would only slide
		// the pen along the same curve - identical figure, no symmetry.
		var base = carry + (gear.phase0 || 0);
		var a = base + rot;
		var cx, cy;
		if (!parent) {
			cx = 0; cy = 0;
		} else {
			var orbitR = gear.internal ? (parent.r - gear.r) : (parent.r + gear.r);
			cx = pcx + orbitR * Math.cos(a);
			cy = pcy + orbitR * Math.sin(a);
		}
		// rolling ratio: matches classic hypotrochoid / epitrochoid equations
		var ratio = parent ? (gear.internal ? (parent.r - gear.r) / gear.r : (parent.r + gear.r) / gear.r) : 1;
		// absolute spin = parent phase (rigid frame rotation) + this gear's own
		// rolling spin (rot * ratio). the parent phase is added, NOT multiplied,
		// otherwise counter-rotating gears would cancel the pen instead of letting
		// it sweep a circle around the (then stationary) sub-gear center.
		var penA = base + rot * ratio;
		return { cx: cx, cy: cy, ratio: ratio, penA: penA };
	}

	// advance rotation and compute world transforms + pen position (recursive).
	// `carry` is the accumulated orbit phase inherited from ancestors, so the
	// root (main) gear's rotation drives the whole assembly (a rigid phase
	// shift of each level), while each gear keeps its own relative speed.
	function update(gear, parent, pcx, pcy, carry, dt, globalSpeed) {
		gear.rot += gear.speed * globalSpeed * dt;
		var st = stateAt(gear, parent, pcx, pcy, carry, gear.rot);
		gear.cx = st.cx; gear.cy = st.cy; gear.ratio = st.ratio;
		gear.phase = st.penA;
		gear.penx = st.cx + gear.pencil.d * Math.cos(st.penA);
		gear.peny = st.cy + gear.pencil.d * Math.sin(st.penA);
		var ch = gear.children;
		for (var i = 0; i < ch.length; i++) update(ch[i], gear, st.cx, st.cy, st.penA, dt, globalSpeed);
	}

	// ---- period detection (whole-curve mode) ----
	//
	// every pen position is a sum of rotating vectors:
	//   pen(g) = SUM over the ancestor chain of  orbitR_i * e^(i * f_i * phi)
	//            + d_g * e^(i * fpen_g * phi)
	// with all frequencies f measured in turns per unit phi (phi = 2*pi is one
	// turn of the root). the figure repeats after u turns exactly when every
	// f * u is an integer.
	//
	// exact rational arithmetic (LCM of the speed denominators) is brittle: a
	// speed of 0.2001 instead of 0.2 explodes the period even though the two
	// figures are indistinguishable, and a tiny far-out harmonic weighs as much
	// as the dominant one. so we search for the smallest u whose worst
	// *positional* closure error stays under a tolerance, weighting each
	// frequency by the radius it drives:
	//   err = |frac(f*u)| * 2*pi * amplitude   (world units)
	// the scan is O(maxTurns * harmonics) with an early break on the first
	// harmonic that cannot win, i.e. a fraction of a millisecond for normal
	// scenes, and it degrades gracefully: if nothing closes within maxTurns we
	// return the best u found instead of refusing to draw.

	// continued-fraction rationalization of x -> {num, den} (den capped at maxDen).
	function rationalize(x, maxDen) {
		maxDen = maxDen || 2000;
		if (!isFinite(x)) return { num: 1, den: 1 };
		if (x < 0) { var r = rationalize(-x, maxDen); return { num: -r.num, den: r.den }; }
		if (x < 1e-12) return { num: 0, den: 1 };
		var hPrev2 = 0, hPrev1 = 1, kPrev2 = 1, kPrev1 = 0;
		var a0 = Math.floor(x);
		var rem = x - a0;
		var h = a0 * hPrev1 + hPrev2; // = a0
		var k = a0 * kPrev1 + kPrev2; // = 1
		hPrev2 = hPrev1; hPrev1 = h; kPrev2 = kPrev1; kPrev1 = k;
		while (k < maxDen && rem > 1e-9) {
			var inv = 1 / rem;
			var b = Math.floor(inv);
			h = b * hPrev1 + hPrev2;
			k = b * kPrev1 + kPrev2;
			hPrev2 = hPrev1; hPrev1 = h; kPrev2 = kPrev1; kPrev1 = k;
			rem = inv - b;
		}
		return { num: h, den: k };
	}

	var MAX_TURNS = 20000;      // hard ceiling for the closure scan
	var TOL_POS = 0.0015;       // closure tolerance in world units (~0.5 px @ zoom 1)

	// harmonics of the current scene, rebuilt per detectPeriod call (user
	// action, never the frame loop). parallel arrays: frequency + amplitude.
	var harmF = [], harmA = [];

	function pushHarm(f, amp) {
		if (!isFinite(f) || !isFinite(amp)) return;
		if (Math.abs(f) < 1e-9 || amp < 1e-6) return;    // static term: always closed
		for (var i = 0; i < harmF.length; i++) {
			if (Math.abs(harmF[i] - f) < 1e-12) {         // same frequency: keep the widest radius
				if (amp > harmA[i]) harmA[i] = amp;
				return;
			}
		}
		harmF.push(f); harmA.push(amp);
	}

	// returns true when this subtree contributes to a drawn curve. only then do
	// its rotations constrain the period (a hidden gear may spin at any rate).
	function walkHarmonics(g, parent, carryF) {
		var ratio = parent ? (g.internal ? (parent.r - g.r) / g.r : (parent.r + g.r) / g.r) : 1;
		var orbitF = carryF + g.speed;
		var penF = carryF + g.speed * ratio;
		var draws = !!(g.pencil.c1.on || g.pencil.c2.on);
		for (var i = 0; i < g.children.length; i++) {
			if (walkHarmonics(g.children[i], g, penF)) draws = true;
		}
		if (!draws) return false;
		if (parent) pushHarm(orbitF, Math.abs(g.internal ? parent.r - g.r : parent.r + g.r));
		if (g.pencil.c1.on || g.pencil.c2.on) pushHarm(penF, g.pencil.d);
		return true;
	}

	function collectHarmonics(roots) {
		harmF.length = 0; harmA.length = 0;
		for (var i = 0; i < roots.length; i++) walkHarmonics(roots[i], null, 0);
	}

	// smallest u (in turns) that closes the figure within `tol` world units.
	// `exact` = closed within tolerance, `err` = worst residual gap. always
	// answers: the caller never has to refuse to draw.
	function detectPeriod(roots, maxTurns, tol) {
		maxTurns = Math.max(1, Math.min(maxTurns || 2000, MAX_TURNS));
		tol = tol || TOL_POS;
		collectHarmonics(roots);
		var m = harmF.length;
		if (!m) return { turns: 1, P: TAU, exact: true, err: 0, maxTurns: maxTurns, harmonics: 0 };
		var bestU = 1, bestErr = Infinity;
		for (var u = 1; u <= maxTurns; u++) {
			var worst = 0;
			for (var i = 0; i < m; i++) {
				var x = harmF[i] * u;
				var e = Math.abs(x - Math.round(x)) * TAU * harmA[i];
				if (e > worst) {
					worst = e;
					if (worst > tol && worst >= bestErr) break;   // cannot win: skip u
				}
			}
			if (worst <= tol) return { turns: u, P: TAU * u, exact: true, err: worst, maxTurns: maxTurns, harmonics: m };
			if (worst < bestErr) { bestErr = worst; bestU = u; }
		}
		return { turns: bestU, P: TAU * bestU, exact: false, err: bestErr, maxTurns: maxTurns, harmonics: m };
	}

	// ---- whole-curve sampling (chunked so it can run in the background) ----
	function sampleAt(gear, parent, pcx, pcy, carry, phi, invP) {
		var rot = gear.speed * phi;
		var st = stateAt(gear, parent, pcx, pcy, carry, rot);
		gear.rot = rot;
		gear.cx = st.cx; gear.cy = st.cy; gear.ratio = st.ratio;
		gear.phase = st.penA;
		gear.penx = st.cx + gear.pencil.d * Math.cos(st.penA);
		gear.peny = st.cy + gear.pencil.d * Math.sin(st.penA);
		var p = gear.pencil;
		if (p.c1.on || p.c2.on) {
			var col;
			if (p.c1.on && p.c2.on) col = mixHue(slotRgb(p.c1), slotRgb(p.c2), wholeColorT(phi * invP, p));
			else col = p.c1.on ? slotRgb(p.c1) : slotRgb(p.c2);
			pushPoint(gear, gear.penx, gear.peny, col);
		}
		for (var ci = 0; ci < gear.children.length; ci++) {
			sampleAt(gear.children[ci], gear, st.cx, st.cy, st.penA, phi, invP);
		}
	}

	// prepare a resumable bake job over [0, P]. rings are cleared and grown to
	// the exact size needed once, so stepping never reallocates.
	function startWhole(roots, period, sampleCount) {
		var all = flatten(roots);
		var maxTrail = CAP;
		for (var i = 0; i < all.length; i++) {
			clearTrace(all[i]);
			if (all[i].pencil.c1.on || all[i].pencil.c2.on) maxTrail = Math.min(maxTrail, all[i].trailCap);
		}
		// keep room for the inclusive endpoint (phi = P == phi = 0 location) so
		// the curve's start point is never evicted by the closing sample.
		sampleCount = Math.max(2, Math.min(sampleCount, maxTrail - 1));
		for (var j = 0; j < all.length; j++) {
			if (all[j].pencil.c1.on || all[j].pencil.c2.on) ensureRing(all[j], sampleCount + 1);
		}
		return {
			roots: roots, period: period, total: sampleCount, i: 0,
			dphi: period.P / sampleCount, invP: 1 / period.P, done: false
		};
	}

	// advance a job by up to `budget` samples. returns true when finished.
	function stepWhole(job, budget) {
		if (job.done) return true;
		var end = Math.min(job.total, job.i + budget - 1);
		for (var s = job.i; s <= end; s++) {
			var phi = s * job.dphi;
			for (var r = 0; r < job.roots.length; r++) sampleAt(job.roots[r], null, 0, 0, 0, phi, job.invP);
		}
		job.i = end + 1;
		if (job.i > job.total) job.done = true;
		return job.done;
	}

	// blocking convenience wrapper (tests, node harness).
	function computeWhole(roots, period, sampleCount) {
		var job = startWhole(roots, period, sampleCount);
		while (!stepWhole(job, 4096)) { }
		return job;
	}

	// re-bake only the color of every ring point (keeps x,y geometry intact).
	// used in whole mode for color-only edits (c1/c2 slots, anim speed) so we
	// skip the expensive phi traversal and just walk the existing ring.
	function recolorWhole(roots) {
		var all = flatten(roots);
		for (var i = 0; i < all.length; i++) {
			var g = all[i];
			if (!(g.pencil.c1.on || g.pencil.c2.on)) continue;
			var n = g.count;
			if (n < 1 || !g.ring) continue;
			var denom = n - 1;
			var c1on = g.pencil.c1.on, c2on = g.pencil.c2.on;
			for (var k = 0; k < n; k++) {
				var idx = (g.head + k) % g.cap;
				var t = wholeColorT(denom > 0 ? k / denom : 0, g.pencil);
				var col;
				if (c1on && c2on) col = mixHue(slotRgb(g.pencil.c1), slotRgb(g.pencil.c2), t);
				else col = c1on ? slotRgb(g.pencil.c1) : slotRgb(g.pencil.c2);
				g.ring[idx * 5 + 2] = col[0];
				g.ring[idx * 5 + 3] = col[1];
				g.ring[idx * 5 + 4] = col[2];
			}
		}
	}

	function flatten(roots, out) {
		out = out || [];
		for (var i = 0; i < roots.length; i++) {
			out.push(roots[i]);
			flatten(roots[i].children, out);
		}
		return out;
	}

	// ---- color helpers ----
	function hexToRgb(hex) {
		if (hex[0] !== '#') hex = '#' + hex;
		if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
		var n = parseInt(hex.slice(1), 16);
		return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
	}

	// preallocated scratch so the hot paths (per-frame pencilColor and per-sample
	// computeWhole) never allocate.
	var hslScratchA = { h: 0, l: 0, s: 0 };
	var hslScratchB = { h: 0, l: 0, s: 0 };
	var hslOut = { h: 0, l: 0, s: 0 };
	var hueOut = new Float32Array(3);

	function rgbToHsl(r, g, b, o) {
		var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
		o.l = (mx + mn) * 0.5;
		if (mx === mn) { o.s = 0; o.h = 0; return; }
		var d = mx - mn;
		o.s = o.l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
		var h;
		if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
		else if (mx === g) h = ((b - r) / d + 2);
		else h = ((r - g) / d + 4);
		o.h = h * 60;
	}

	// hoisted out of hslToRgb: a nested function literal there allocated a
	// closure on every colored sample (per-frame + per-bake-sample hot path).
	function hue2rgb(p, q, t) {
		if (t < 0) t += 1; else if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	}

	function hslToRgb(h, l, s, o) {
		if (s === 0) { o[0] = o[1] = o[2] = l; return; }
		var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		var p = 2 * l - q, hk = h / 360;
		o[0] = hue2rgb(p, q, hk + 1 / 3); o[1] = hue2rgb(p, q, hk); o[2] = hue2rgb(p, q, hk - 1 / 3);
	}

	// blend a and b by t: lightness and saturation interpolate linearly; hue
	// follows the direction the user asked for (c1 -> c2 = signed forward delta,
	// never the long or short alternative). t oscillates 0->1->0 in pencilColor
	// so the trace cycles c1 -> c2 -> c1 along that exact arc.
	function mixHue(a, b, t) {
		rgbToHsl(a[0], a[1], a[2], hslScratchA);
		rgbToHsl(b[0], b[1], b[2], hslScratchB);
		var d = hslScratchB.h - hslScratchA.h;
		var h = hslScratchA.h + d * t;
		if (h < 0) h += 360; else if (h >= 360) h -= 360;
		hslOut.h = h;
		hslOut.l = hslScratchA.l + (hslScratchB.l - hslScratchA.l) * t;
		hslOut.s = hslScratchA.s + (hslScratchB.s - hslScratchA.s) * t;
		hslToRgb(hslOut.h, hslOut.l, hslOut.s, hueOut);
		return hueOut;
	}

	var mixOut = new Float32Array(3);

	function slotRgb(slot) {
		if (slot._hex !== slot.color || !slot._rgb) {
			var c = hexToRgb(slot.color);
			slot._rgb = slot._rgb || new Float32Array(3);
			slot._rgb[0] = c[0]; slot._rgb[1] = c[1]; slot._rgb[2] = c[2];
			slot._hex = slot.color;
		}
		return slot._rgb;
	}

	// normalize progress in [0,1] into the same 0->1->0 sine bump that
	// pencilColor uses, so whole-mode's ring color flows forward along the
	// c1->c2 arc then retraces it back (color1-color2 and back). animSpeed
	// scales how many such forward+back cycles fit in one closed period.
	function oscT(progress, animSpeed) {
		var f = (progress * animSpeed) % 1;
		if (f < 0) f += 1;
		return 0.5 - 0.5 * Math.cos(f * 2 * Math.PI);
	}

	// whole-mode color interpolation, per-pencil animMode aware.
	//   'cycles'    : oscT (0->1->0 bump; animSpeed = bumps per closed period)
	//   'frequency' : frac(progress * animSpeed); hue advances linearly along
	//                 the closed curve and wraps. seamless wrap, no muddy
	//                 mid-bump — gives the same "hue/sec along the trace"
	//                 feel as animate-mode frequency.
	function wholeColorT(progress, p) {
		if (p.animMode === 'frequency') {
			var f = progress * p.animSpeed;
			f = f - Math.floor(f);
			return f;
		}
		return oscT(progress, p.animSpeed);
	}

	function pencilColor(gear, time) {
		var p = gear.pencil;
		var a = p.c1.on ? slotRgb(p.c1) : null;
		var b = p.c2.on ? slotRgb(p.c2) : null;
		if (a && b) {
			var t;
			if (p.animMode === 'cycles') t = 0.5 - 0.5 * Math.cos(time * p.animSpeed * 2 * Math.PI);
			else t = (time * p.animSpeed) % 1;
			if (t < 0) t += 1;
			return mixHue(a, b, t);
		}
		return a || b || null;
	}

	// ---- serialization ----
		function serializeGear(gear) {
			return {
				r: gear.r,
				speed: gear.speed,
				internal: gear.internal,
				phase0: gear.phase0 || 0,
				rot: gear.rot,
				trailCap: gear.trailCap,
				pencil: {
					d: gear.pencil.d,
					width: gear.pencil.width,
					c1: { on: gear.pencil.c1.on, color: gear.pencil.c1.color },
					c2: { on: gear.pencil.c2.on, color: gear.pencil.c2.color },
					animSpeed: gear.pencil.animSpeed,
					animMode: gear.pencil.animMode
				},
				children: gear.children.map(serializeGear)
			};
		}

	function deserializeGear(o) {
		var g = makeGear(o);
		g.children = (o.children || []).map(deserializeGear);
		return g;
	}

	// default app-state (view toggles, bake options, mode).  one source of truth
	// for "what does a fresh app look like"; used by reset, by legacy-file fallback
	// (anything missing in the scene falls back to this), and by deserialization
	// sanity defaults.
	function defaultAppState() {
		return {
			mode: 'animate',
			paused: false,
			symmetry: false,
			overlay: true,
			maxPeriod: 2000,
			showCircles: true,
			showDial: false,
			showPoints: false,
			glowPoints: false,
			drawTrails: true
		};
	}

	function serialize(roots, view, globalSpeed, colorMode, appState) {
		return {
			gears: roots.map(serializeGear),
			view: { zoom: view.zoom, pan: [view.pan[0], view.pan[1]] },
			globalSpeed: globalSpeed,
			colorMode: colorMode || 'frequency',
			app: appState || defaultAppState()
		};
	}

	function deserialize(obj) {
		var roots = (obj.gears || []).map(deserializeGear);
		var view = { zoom: 1, pan: [0, 0] };
		if (obj.view) {
			view.zoom = obj.view.zoom != null ? obj.view.zoom : 1;
			if (obj.view.pan) view.pan = [obj.view.pan[0] || 0, obj.view.pan[1] || 0];
		}
		var gs = obj.globalSpeed != null ? obj.globalSpeed : 1;
		var cm = (obj.colorMode === 'cycles' || obj.colorMode === 'frequency') ? obj.colorMode : 'frequency';
		var app = defaultAppState();
		if (obj.app && typeof obj.app === 'object') {
			if (obj.app.mode === 'animate' || obj.app.mode === 'whole') app.mode = obj.app.mode;
			app.paused = !!obj.app.paused;
			app.symmetry = !!obj.app.symmetry;
			app.overlay = obj.app.overlay !== false;
			// legacy files carry `periodThreshold` (the old skip-the-bake
			// limit); it maps onto the closure-search ceiling.
			var mp = obj.app.maxPeriod != null ? obj.app.maxPeriod : obj.app.periodThreshold;
			if (typeof mp === 'number' && mp > 0) app.maxPeriod = Math.min(20000, Math.max(100, Math.round(mp)));
			app.showCircles = obj.app.showCircles !== false;
			app.showDial = !!obj.app.showDial;
			app.showPoints = !!obj.app.showPoints;
			app.glowPoints = !!obj.app.glowPoints;
			app.drawTrails = obj.app.drawTrails !== false;
		}
		for (var i = 0; i < roots.length; i++) initRuntime(roots[i], null);
		return { roots: roots, view: view, globalSpeed: gs, colorMode: cm, app: app };
	}

	var Gear = {
		CAP: CAP,
		makeGear: makeGear,
		defaultScene: defaultScene,
		initRuntime: initRuntime,
		clearTrace: clearTrace,
		clearAllTraces: clearAllTraces,
		pushPoint: pushPoint,
		ensureRing: ensureRing,
		applyTrailCap: applyTrailCap,
		forEachSegment: forEachSegment,
		update: update,
		stateAt: stateAt,
		rationalize: rationalize,
		detectPeriod: detectPeriod,
		computeWhole: computeWhole,
		startWhole: startWhole,
		stepWhole: stepWhole,
		recolorWhole: recolorWhole,
		flatten: flatten,
		hexToRgb: hexToRgb,
		mixHue: mixHue,
		pencilColor: pencilColor,
		serialize: serialize,
		deserialize: deserialize,
		defaultAppState: defaultAppState
	};

	root.Gear = Gear;
	if (typeof module !== 'undefined' && module.exports) module.exports = Gear;
})(typeof window !== 'undefined' ? window : this);
