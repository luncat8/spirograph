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

	// identity pen frame (columns e1 = in-plane cos axis, e2 = disc normal /
	// spin axis, e3 = in-plane sin axis). root frame stands the disc in XZ so
	// the face-on camera looks down its normal (world +y) and up is +z.
	var FRAME_ZERO = [1,0,0, 0,1,0, 0,0,1];

	function makeGear(opts) {
		opts = opts || {};
		return {
			r: opts.r != null ? opts.r : 0.6,
			speed: opts.speed != null ? opts.speed : 0.2,
			// second axis speed (3D only): precession / tilt about an in-plane
			// diameter. 0 = the gear stays in its parent's plane (pure 2D).
			speed2: opts.speed2 != null ? opts.speed2 : 0,
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
			rot2: 0,                               // integrated tilt (3D)
			cx: 0, cy: 0,
			penx: 0, peny: 0,
			ratio: 1,
			// 3D pose: pen frame (9 floats, columns e1/e2/e3), world center and
			// pen point. filled by the 3D kinematics in 3D mode.
			f3: FRAME_ZERO.slice(),
			c3: [0, 0, 0], pen3: [0, 0, 0],
			// trace ring. stride 5 = 2D (x y r g b); stride 6 = 3D (x y z r g b).
			// main.js switches the stride on entering/leaving 3D and clears.
			// pushed = points pushed since the last clear (monotonic, survives
			// eviction and realloc); baked = `pushed` as of the last overlay
			// bake, so the bake knows how many NEW points to paint.
			ring: null, stride: 5, cap: 0, head: 0, count: 0, pushed: 0, baked: 0
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
		if (gear.speed2 == null) gear.speed2 = 0;
		gear.rot2 = 0;
		if (gear.phase0 == null) gear.phase0 = 0;
		// rings are allocated on first use (see ensureRing): a 200-gear tree
		// used to cost 200 * CAP floats before drawing anything.
		gear.ring = null;
		gear.stride = gear.stride || 5;
		gear.cap = 0;
		gear.head = 0;
		gear.count = 0;
		gear.pushed = 0;
		gear.baked = 0;
		gear.cx = 0; gear.cy = 0; gear.penx = 0; gear.peny = 0;
		// 3D pose
		gear.f3 = [1,0,0, 0,1,0, 0,0,1];
		gear.c3 = [0, 0, 0]; gear.pen3 = [0, 0, 0];
		for (var i = 0; i < gear.children.length; i++) initRuntime(gear.children[i], gear);
	}

	// ring floats per point for a dimension (5 = 2D xy rgb, 6 = 3D xyz rgb).
	function strideFor3D(is3D) { return is3D ? 6 : 5; }

	// move the stored points into a fresh buffer of `cap` points (newest kept).
	// when the stride grows (2D -> 3D) new points get z = 0; when it shrinks the
	// z channel is dropped.
	function reallocRing(gear, cap, stride) {
		stride = stride || gear.stride;
		var ring = new Float32Array(cap * stride);
		var n = Math.min(gear.count, cap);
		if (gear.ring && n > 0) {
			var skip = gear.count - n;                 // keep the newest n points
			var old = gear.stride;
			for (var k = 0; k < n; k++) {
				var si = (gear.head + skip + k) % gear.cap;
				if (stride === 6) {
					ring[k * 6] = gear.ring[si * old];
					ring[k * 6 + 1] = gear.ring[si * old + 1];
					ring[k * 6 + 2] = old === 6 ? gear.ring[si * old + 2] : 0;
					ring[k * 6 + 3] = gear.ring[si * old + (old - 3)];
					ring[k * 6 + 4] = gear.ring[si * old + (old - 2)];
					ring[k * 6 + 5] = gear.ring[si * old + (old - 1)];
				} else {
					ring[k * 5] = gear.ring[si * old];
					ring[k * 5 + 1] = gear.ring[si * old + 1];
					ring[k * 5 + 2] = gear.ring[si * old + (old - 3)];
					ring[k * 5 + 3] = gear.ring[si * old + (old - 2)];
					ring[k * 5 + 4] = gear.ring[si * old + (old - 1)];
				}
			}
		}
		gear.ring = ring;
		gear.stride = stride;
		gear.cap = cap;
		gear.head = 0;
		gear.count = n;
		// pushed/baked are counts, not slots: they survive the move untouched.
	}

	// grow the ring so it can hold at least `need` points. rings start
	// unallocated and double on demand. `force` lifts the trailCap ceiling:
	// the whole-mode bake sizes rings by its own resolution (the trail cap is
	// an animate-mode trail *length*, not a curve quality knob).
	function ensureRing(gear, need, force) {
		var want = force ? Math.min(need, CAP) : Math.min(need, gear.trailCap);
		if (gear.cap >= want) return;
		var cap = gear.cap || MIN_RING;
		while (cap < want) cap *= 2;
		if (cap > want && !force) cap = want;
		if (cap > CAP) cap = CAP;
		reallocRing(gear, cap, gear.stride);
	}

	// dimension switch: reallocate every ring at the target stride and clear it
	// (3D and 2D sample different coordinates; old points are not reused).
	function setRingStride(gear, is3D) {
		var stride = strideFor3D(is3D);
		if (gear.stride !== stride) { gear.ring = null; gear.cap = 0; gear.stride = stride; }
		clearTrace(gear);
	}
	function setTreeStride(roots, is3D) {
		var all = flatten(roots);
		for (var i = 0; i < all.length; i++) setRingStride(all[i], is3D);
	}

	// trailCap lowered: drop the oldest points and hand the memory back.
	function applyTrailCap(gear) {
		gear.trailCap = clamp(gear.trailCap, 100, CAP);
		if (!gear.ring || gear.cap <= gear.trailCap) return;
		reallocRing(gear, gear.trailCap, gear.stride);
	}

	function clearTrace(gear) {
		gear.head = 0;
		gear.count = 0;
		gear.pushed = 0;
		gear.baked = 0;
	}

	function clearAllTraces(gear) {
		clearTrace(gear);
		for (var i = 0; i < gear.children.length; i++) clearAllTraces(gear.children[i]);
	}

	// push a pen sample (world position + rgb color baked at draw time) into the
	// ring buffer; later color changes only affect new points, not existing line.
	// the ring grows by doubling until trailCap, then evicts the oldest point.
	// 2D callers pass (x, y, col); 3D passes (x, y, z, col). the buffer stride
	// (5 or 6 floats per point) decides where color lives.
	function pushPoint(gear, x, y, z, col) {
		if (col === undefined) { col = z; z = 0; }    // 2D call signature
		var st = gear.stride;
		if (gear.count > 0) {
			var li = (gear.head + gear.count - 1) % gear.cap;
			var dx = x - gear.ring[li * st], dy = y - gear.ring[li * st + 1];
			var dz = st === 6 ? z - gear.ring[li * st + 2] : 0;
			if (dx * dx + dy * dy + dz * dz < EPS * EPS) return;
		}
		if (!gear.ring || gear.count >= gear.cap) ensureRing(gear, gear.cap ? gear.cap * 2 : MIN_RING);
		var idx;
		if (gear.count < gear.cap) {
			idx = (gear.head + gear.count) % gear.cap;
			gear.count++;
		} else {                                      // full at trailCap: drop oldest
			idx = gear.head;
			gear.head = (gear.head + 1) % gear.cap;
		}
		var o = idx * st;
		gear.ring[o] = x; gear.ring[o + 1] = y;
		if (st === 6) gear.ring[o + 2] = z;
		gear.ring[o + st - 3] = col[0]; gear.ring[o + st - 2] = col[1]; gear.ring[o + st - 1] = col[2];
		gear.pushed++;
	}

	// call cb(x0,y0[,z0],r0,g0,b0, x1,y1[,z1],r1,g1,b1) per consecutive segment
	// (ring order, no wrap seam). stride follows the gear's ring.
	function forEachSegment(gear, cb) {
		var n = gear.count, st = gear.stride;
		if (!gear.ring) return;
		for (var j = 0; j < n - 1; j++) {
			var ia = (gear.head + j) % gear.cap, ib = (gear.head + j + 1) % gear.cap;
			var oa = ia * st, ob = ib * st;
			if (st === 6) {
				cb(
					gear.ring[oa], gear.ring[oa + 1], gear.ring[oa + 2],
					gear.ring[oa + 3], gear.ring[oa + 4], gear.ring[oa + 5],
					gear.ring[ob], gear.ring[ob + 1], gear.ring[ob + 2],
					gear.ring[ob + 3], gear.ring[ob + 4], gear.ring[ob + 5]);
			} else {
				cb(
					gear.ring[oa], gear.ring[oa + 1], gear.ring[oa + 2], gear.ring[oa + 3], gear.ring[oa + 4],
					gear.ring[ob], gear.ring[ob + 1], gear.ring[ob + 2], gear.ring[ob + 3], gear.ring[ob + 4]);
			}
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

	// ---- 3D kinematics: two rotation axes per gear (nested frames) --------
	// each gear is a sphere carrying a 3D orientation frame (columns e1,e2,e3
	// stored as 9 floats; e2 is the disc normal / spin axis). a gear is mounted
	// in its parent's PEN frame (the root is mounted in the world frame) and
	// rotates about TWO perpendicular axes of that frame:
	//   - spin about e2 by angle a = phase0 + rot   (the ordinary in-plane
	//     rolling/orbit rotation; speed)
	//   - tilt about the spun e1 by angle b = rot2  (precession out of the
	//     plane; speed2). 0 = the gear stays in its parent's plane.
	// the child sphere orbits the parent centre along the resulting e1, and the
	// pen rolls an extra rot*(ratio-1) about the (tilted) spin axis e2 - the
	// same rolling law as 2D. children mount in this gear's pen frame, so
	// tilts nest down the tree and every speed2 == 0 reproduces the flat 2D
	// figure standing in the XZ plane (e1 = +x, e2 = +y, e3 = +z).
	//
	// rotate frame f about its e2 axis by angle a (e1 sweeps toward e3):
	//   e1 -> e1*cos a + e3*sin a ; e3 -> -e1*sin a + e3*cos a ; e2 fixed.
	function rotE2(f, ca, sa) {
		var x1 = f[0]*ca + f[6]*sa, y1 = f[1]*ca + f[7]*sa, z1 = f[2]*ca + f[8]*sa;
		var x3 = -f[0]*sa + f[6]*ca, y3 = -f[1]*sa + f[7]*ca, z3 = -f[2]*sa + f[8]*ca;
		f[0]=x1; f[1]=y1; f[2]=z1; f[6]=x3; f[7]=y3; f[8]=z3;
	}
	// rotate frame f about its e1 axis by angle b (e2 tips toward e3):
	//   e2 -> e2*cos b + e3*sin b ; e3 -> -e2*sin b + e3*cos b ; e1 fixed.
	function rotE1(f, cb, sb) {
		var x2 = f[3]*cb + f[6]*sb, y2 = f[4]*cb + f[7]*sb, z2 = f[5]*cb + f[8]*sb;
		var x3 = -f[3]*sb + f[6]*cb, y3 = -f[4]*sb + f[7]*cb, z3 = -f[5]*sb + f[8]*cb;
		f[3]=x2; f[4]=y2; f[5]=z2; f[6]=x3; f[7]=y3; f[8]=z3;
	}

	// compute one gear's 3D pose from gear.rot / gear.rot2 (callers set both).
	// writes gear.f3 (the PEN frame children mount in), gear.c3 (world centre),
	// gear.pen3 (world pen point), gear.ratio. `parent` is the parent gear or
	// null for a root (mounted in the world/identity frame at the origin).
	function pose3(gear, parent) {
		var F = gear.f3, P = parent ? parent.f3 : null;
		if (P) { F[0]=P[0];F[1]=P[1];F[2]=P[2]; F[3]=P[3];F[4]=P[4];F[5]=P[5]; F[6]=P[6];F[7]=P[7];F[8]=P[8]; }
		else { F[0]=1;F[1]=0;F[2]=0; F[3]=0;F[4]=1;F[5]=0; F[6]=0;F[7]=0;F[8]=1; }
		var ratio = parent ? (gear.internal ? (parent.r - gear.r) / gear.r : (parent.r + gear.r) / gear.r) : 1;
		gear.ratio = ratio;
		var a = (gear.phase0 || 0) + gear.rot;
		rotE2(F, Math.cos(a), Math.sin(a));             // spin (orbit direction)
		rotE1(F, Math.cos(gear.rot2), Math.sin(gear.rot2)); // tilt / precession
		var c = gear.c3;
		if (!parent) { c[0]=0; c[1]=0; c[2]=0; }
		else {
			var orbitR = gear.internal ? (parent.r - gear.r) : (parent.r + gear.r);
			c[0]=parent.c3[0]+orbitR*F[0]; c[1]=parent.c3[1]+orbitR*F[1]; c[2]=parent.c3[2]+orbitR*F[2];
		}
		var extra = parent ? gear.rot * (ratio - 1) : 0; // pen rolling about e2
		if (extra) rotE2(F, Math.cos(extra), Math.sin(extra));
		var pen = gear.pen3;
		pen[0] = c[0] + gear.pencil.d * F[0];
		pen[1] = c[1] + gear.pencil.d * F[1];
		pen[2] = c[2] + gear.pencil.d * F[2];
	}

	// recursive 3D animate step (mirrors update(); the frame replaces `carry`).
	function update3(gear, parent, dt, globalSpeed) {
		gear.rot += gear.speed * globalSpeed * dt;
		gear.rot2 += (gear.speed2 || 0) * globalSpeed * dt;
		pose3(gear, parent);
		for (var i = 0; i < gear.children.length; i++) update3(gear.children[i], gear, dt, globalSpeed);
	}

	// recompute every gear's 3D pose once at the current rot/rot2 (entry into
	// 3D, gear add while paused, whole-mode sampling setup).
	function pose3All(gear, parent) {
		pose3(gear, parent);
		for (var i = 0; i < gear.children.length; i++) pose3All(gear.children[i], gear);
	}

	// whole-mode 3D sample at global parameter phi (parallel to sampleAt).
	function sample3(gear, parent, phi, timeT) {
		gear.rot = gear.speed * phi;
		gear.rot2 = (gear.speed2 || 0) * phi;
		pose3(gear, parent);
		var p = gear.pencil;
		if (p.c1.on || p.c2.on) {
			var col;
			if (p.c1.on && p.c2.on) col = mixHue(slotRgb(p.c1), slotRgb(p.c2), wholeColorT(timeT, p));
			else col = p.c1.on ? slotRgb(p.c1) : slotRgb(p.c2);
			pushPoint(gear, gear.pen3[0], gear.pen3[1], gear.pen3[2], col);
		}
		for (var ci = 0; ci < gear.children.length; ci++) sample3(gear.children[ci], gear, phi, timeT);
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

	// 3D closure: frames are nested by two rotations per gear, so the whole
	// chain repeats iff every relative rotation of a gear in a drawn subtree is
	// a whole turn (rotations about tilted axes cannot cancel, unlike 2D). for
	// each such gear we push three rates (in turns per root turn):
	//   speed        - spin (gear centre orbits on this)
	//   speed*ratio  - pen-frame spin incl. the extra roll; children mount in
	//                  the pen frame, and the gear's own pen point uses it
	//   speed2       - tilt / precession (the second axis)
	// amplitudes are the radii those rotations drive, so the positional
	// tolerance enforces angular closure. this is a sufficient condition
	// (exactly what the frame physics needs for the whole mechanism to repeat).
	function walkHarmonics3(g, parent) {
		var ratio = parent ? (g.internal ? (parent.r - g.r) / g.r : (parent.r + g.r) / g.r) : 1;
		var draws = !!(g.pencil.c1.on || g.pencil.c2.on);
		for (var i = 0; i < g.children.length; i++) draws = walkHarmonics3(g.children[i], g) || draws;
		if (!draws) return false;
		if (parent) pushHarm(Math.abs(g.speed), Math.abs(g.internal ? parent.r - g.r : parent.r + g.r));
		if (g.pencil.c1.on || g.pencil.c2.on || g.children.length) {
			pushHarm(Math.abs(g.speed * ratio), Math.max(g.pencil.d, 0.01));
		}
		pushHarm(Math.abs(g.speed2 || 0), 1);
		return true;
	}

	function collectHarmonics(roots, is3D) {
		harmF.length = 0; harmA.length = 0;
		for (var i = 0; i < roots.length; i++) {
			if (is3D) walkHarmonics3(roots[i], null);
			else walkHarmonics(roots[i], null, 0);
		}
	}

	// smallest u (in turns) that closes the figure within `tol` world units.
	// `exact` = closed within tolerance, `err` = worst residual gap. always
	// answers: the caller never has to refuse to draw. is3D uses the two-axis
	// frame closure (see walkHarmonics3); 2D uses the positional harmonics.
	function detectPeriod(roots, maxTurns, tol, is3D) {
		maxTurns = Math.max(1, Math.min(maxTurns || 2000, MAX_TURNS));
		tol = tol || TOL_POS;
		collectHarmonics(roots, is3D);
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

	// whole-curve sampler dispatcher: 3D uses nested-frame sample3, 2D uses the
	// planar sampleAt. timeT = phi/P is the curve progress used by color flow.
	function sampleAtAll(roots, phi, invP, is3D) {
		if (is3D) for (var r = 0; r < roots.length; r++) sample3(roots[r], null, phi, phi * invP);
		else for (var k = 0; k < roots.length; k++) sampleAt(roots[k], null, 0, 0, 0, phi, invP);
	}

	// prepare a resumable bake job over [0, P]. rings are cleared and grown to
	// the exact size needed once, so stepping never reallocates. is3D samples
	// nested-frame poses (sample3) into stride-6 rings; otherwise planar.
	function startWhole(roots, period, sampleCount, is3D) {
		var all = flatten(roots);
		// rings must already be at the target stride (main switches on setDim);
		// clearTrace keeps geometry/dimension but empties the trace.
		for (var i = 0; i < all.length; i++) clearTrace(all[i]);
		// keep room for the inclusive endpoint (phi = P == phi = 0 location) so
		// the curve's start point is never evicted by the closing sample.
		sampleCount = Math.max(2, Math.min(sampleCount, CAP - 1));
		for (var j = 0; j < all.length; j++) {
			if (all[j].pencil.c1.on || all[j].pencil.c2.on) ensureRing(all[j], sampleCount + 1, true);
		}
		return {
			roots: roots, period: period, total: sampleCount, i: 0, is3D: !!is3D,
			dphi: period.P / sampleCount, invP: 1 / period.P, done: false
		};
	}

	// advance a job by up to `budget` samples. returns true when finished.
	function stepWhole(job, budget) {
		if (job.done) return true;
		var end = Math.min(job.total, job.i + budget - 1);
		for (var s = job.i; s <= end; s++) {
			sampleAtAll(job.roots, s * job.dphi, job.invP, job.is3D);
		}
		job.i = end + 1;
		if (job.i > job.total) job.done = true;
		return job.done;
	}

	// blocking convenience wrapper (tests, node harness).
	function computeWhole(roots, period, sampleCount, is3D) {
		var job = startWhole(roots, period, sampleCount, is3D);
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
			var denom = n - 1, st = g.stride;
			var c1on = g.pencil.c1.on, c2on = g.pencil.c2.on;
			for (var k = 0; k < n; k++) {
				var idx = (g.head + k) % g.cap;
				var o = idx * st;
				var t = wholeColorT(denom > 0 ? k / denom : 0, g.pencil);
				var col;
				if (c1on && c2on) col = mixHue(slotRgb(g.pencil.c1), slotRgb(g.pencil.c2), t);
				else col = c1on ? slotRgb(g.pencil.c1) : slotRgb(g.pencil.c2);
				g.ring[o + st - 3] = col[0];
				g.ring[o + st - 2] = col[1];
				g.ring[o + st - 1] = col[2];
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
				speed2: gear.speed2 || 0,
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

	// default app-state (view toggles, bake options, mode). the schema,
	// defaults and clamps live in js/settings.js (single source of truth);
	// this thin wrapper stays so serialize's fallback and older callers keep
	// working.
	function defaultAppState() {
		return Settings.defaultApp();
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
		// sanitize/whitelist/clamp (incl. the legacy periodThreshold alias)
		// is owned by js/settings.js - the single source of the app schema.
		var app = Settings.sanitizeApp(obj.app || {});
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
		setTreeStride: setTreeStride,
		strideFor3D: strideFor3D,
		update: update,
		update3: update3,
		pose3: pose3,
		pose3All: function (root, parent) { pose3All(root, parent || null); },
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
