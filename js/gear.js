// js/gear.js - gear model, kinematics, serialization, trace ring buffer
// classic <script> (no modules); guards module.exports for node.

(function (root) {
	'use strict';

	var CAP = 40000;        // max stored trace points per pencil (ring buffer)
	var EPS = 0.0009;      // min world-distance between stored trace points

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

	function makeGear(opts) {
		opts = opts || {};
		return {
			r: opts.r != null ? opts.r : 0.6,
			speed: opts.speed != null ? opts.speed : 0.2,
			internal: opts.internal != null ? opts.internal : false,
			pencil: normalizePencil(opts.pencil),
			children: [],
			// runtime (filled by initRuntime)
			parent: null,
			rot: 0,
			cx: 0, cy: 0,
			penx: 0, peny: 0,
			ratio: 1,
			ring: null, head: 0, count: 0
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
		gear.rot = 0;
		gear.ring = new Float32Array(CAP * 5);
		gear.head = 0;
		gear.count = 0;
		gear.drawn = 0;
		gear.drawnNewestRing = undefined;
		gear.cx = 0; gear.cy = 0; gear.penx = 0; gear.peny = 0;
		for (var i = 0; i < gear.children.length; i++) initRuntime(gear.children[i], gear);
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
	function pushPoint(gear, x, y, col) {
		if (gear.count === 0) {
			gear.ring[0] = x; gear.ring[1] = y;
			gear.ring[2] = col[0]; gear.ring[3] = col[1]; gear.ring[4] = col[2];
			gear.head = 0; gear.count = 1;
			return;
		}
		var li = (gear.head + gear.count - 1) % CAP;
		var lx = gear.ring[li * 5], ly = gear.ring[li * 5 + 1];
		var dx = x - lx, dy = y - ly;
		if (dx * dx + dy * dy < EPS * EPS) return;
		var idx = (gear.head + gear.count) % CAP;
		gear.ring[idx * 5] = x; gear.ring[idx * 5 + 1] = y;
		gear.ring[idx * 5 + 2] = col[0]; gear.ring[idx * 5 + 3] = col[1]; gear.ring[idx * 5 + 4] = col[2];
		if (gear.count < CAP) gear.count++;
		else gear.head = (gear.head + 1) % CAP;
	}

	// call cb(x0,y0,r0,g0,b0, x1,y1,r1,g1,b1) per consecutive segment (ring order, no wrap seam)
	function forEachSegment(gear, cb) {
		var n = gear.count;
		for (var j = 0; j < n - 1; j++) {
			var ia = (gear.head + j) % CAP;
			var ib = (gear.head + j + 1) % CAP;
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
		var a = carry + rot;
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
		var penA = carry + rot * ratio;
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
	function gcd(a, b) {
		a = Math.abs(a | 0); b = Math.abs(b | 0);
		while (b) { var t = b; b = a % b; a = t; }
		return a || 1;
	}
	function lcm(a, b) { return (a / gcd(a, b)) * b; }

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

	var MAX_TURNS = 2000;

	// smallest integer u (in turns) making the whole figure periodic in phi.
	function detectPeriod(roots) {
		var dens = [];
		(function walk(g, ratio) {
			// every gear's own rotation term (speed) and its rolling term
			// (speed*ratio) enter the closure sum of itself and ALL descendants,
			// so collect both for every gear — not just pencil ones. skipping a
			// non-pencil ancestor's speed*ratio term let compound figures close
			// on the wrong (non-integer) period, leaving a visible seam.
			dens.push(rationalize(g.speed).den);
			dens.push(rationalize(g.speed * ratio).den);
			for (var i = 0; i < g.children.length; i++) {
				var c = g.children[i];
				var cr = c.internal ? (g.r - c.r) / c.r : (g.r + c.r) / c.r;
				walk(c, cr);
			}
		})(roots[0], 1);
		var u = 1;
		for (var i = 0; i < dens.length; i++) u = lcm(u, dens[i]);
		var capped = false;
		if (u > MAX_TURNS) { u = MAX_TURNS; capped = true; }
		return { u: u, P: 2 * Math.PI * u, turns: u, capped: capped };
	}

	// sample the full closed figure over [0, P] into every pencil ring.
	function computeWhole(roots, period, sampleCount) {
		var all = flatten(roots);
		for (var i = 0; i < all.length; i++) clearTrace(all[i]);
		// keep room for the inclusive endpoint (phi = P == phi = 0 location) so the
		// curve's start point is never evicted from the ring by the closing sample.
		sampleCount = Math.min(sampleCount, Gear.CAP - 1);
		var dphi = period.P / sampleCount;
		function sample(gear, parent, pcx, pcy, carry, phi) {
			var rot = gear.speed * phi;
			var st = stateAt(gear, parent, pcx, pcy, carry, rot);
			gear.rot = rot;
			gear.cx = st.cx; gear.cy = st.cy; gear.ratio = st.ratio;
			gear.phase = st.penA;
			gear.penx = st.cx + gear.pencil.d * Math.cos(st.penA);
			gear.peny = st.cy + gear.pencil.d * Math.sin(st.penA);
			if (gear.pencil.c1.on || gear.pencil.c2.on) {
				var t = wholeColorT(phi / period.P, gear.pencil);
				var col;
				if (gear.pencil.c1.on && gear.pencil.c2.on) {
					col = mixHue(slotRgb(gear.pencil.c1), slotRgb(gear.pencil.c2), t);
				} else {
					col = gear.pencil.c1.on ? slotRgb(gear.pencil.c1) : slotRgb(gear.pencil.c2);
				}
				pushPoint(gear, gear.penx, gear.peny, col);
			}
			for (var ci = 0; ci < gear.children.length; ci++) {
				sample(gear.children[ci], gear, st.cx, st.cy, st.penA, phi);
			}
		}
		for (var s = 0; s <= sampleCount; s++) {
			var phi = s * dphi;
			for (var r = 0; r < roots.length; r++) sample(roots[r], null, 0, 0, 0, phi);
		}
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
			if (n < 1) continue;
			var denom = n - 1;
			var c1on = g.pencil.c1.on, c2on = g.pencil.c2.on;
			for (var k = 0; k < n; k++) {
				var idx = (g.head + k) % Gear.CAP;
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

	function mixRGB(a, b, t) {
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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

	function hslToRgb(h, l, s, o) {
		if (s === 0) { o[0] = o[1] = o[2] = l; return; }
		var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		var p = 2 * l - q, hk = h / 360;
		function h2rgb(t) {
			if (t < 0) t += 1; if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		}
		o[0] = h2rgb(hk + 1 / 3); o[1] = h2rgb(hk); o[2] = h2rgb(hk - 1 / 3);
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

	function serialize(roots, view, globalSpeed) {
		return {
			gears: roots.map(serializeGear),
			view: { zoom: view.zoom, pan: [view.pan[0], view.pan[1]] },
			globalSpeed: globalSpeed
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
		for (var i = 0; i < roots.length; i++) initRuntime(roots[i], null);
		return { roots: roots, view: view, globalSpeed: gs };
	}

	var Gear = {
		CAP: CAP,
		makeGear: makeGear,
		defaultScene: defaultScene,
		initRuntime: initRuntime,
		clearTrace: clearTrace,
		clearAllTraces: clearAllTraces,
		pushPoint: pushPoint,
		forEachSegment: forEachSegment,
		update: update,
		stateAt: stateAt,
		rationalize: rationalize,
		detectPeriod: detectPeriod,
		computeWhole: computeWhole,
		recolorWhole: recolorWhole,
		flatten: flatten,
		hexToRgb: hexToRgb,
		mixRGB: mixRGB,
		mixHue: mixHue,
		pencilColor: pencilColor,
		serialize: serialize,
		deserialize: deserialize
	};

	root.Gear = Gear;
	if (typeof module !== 'undefined' && module.exports) module.exports = Gear;
})(typeof window !== 'undefined' ? window : this);
