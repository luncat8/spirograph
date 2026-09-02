// js/camera3.js - minimal mat4 math + orbit camera for 3D mode.
// classic <script> (no modules); guards module.exports for node. no DOM.
//
// the line renderer consumes SCREEN pixels, so 3D mode projects world points
// to screen pixels in JS (one view-proj mat4 per frame) and feeds the existing
// 2D renderer unchanged. this file is pure math (output arrays passed in, no
// per-call allocation) so it unit-tests under node.
//
// world convention: z is UP. the 3D mechanism lives in nested frames; the flat
// (all-tilt-0) figure stands in the XZ plane (in-plane axes e1 = +x, e3 = +z,
// disc normal / spin axis e2 = +y), viewed face-on from +y (default yaw = pi/2).
// the orbit target is the selected gear's sphere centre (else the root's), so
// dragging orbits around the gear the user is editing.

(function (root) {
	'use strict';

	var FOVY = 50 * Math.PI / 180;
	var PITCH_LIMIT = 89 * Math.PI / 180;   // never reach the pole (no gimbal flip)
	var WHEEL_K = 0.0015;                   // same constant as the 2D wheel zoom

	function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

	// column-agnostic row-major storage: m[row*4 + col].
	function mat4Identity(out) {
		for (var i = 0; i < 16; i++) out[i] = 0;
		out[0] = out[5] = out[10] = out[15] = 1;
		return out;
	}

	// perspective projection looking down -z (OpenGL convention).
	function mat4Perspective(out, fovy, aspect, near, far) {
		var f = 1 / Math.tan(fovy / 2);
		mat4Identity(out);
		out[0] = f / aspect;
		out[5] = f;
		out[10] = (far + near) / (near - far);
		out[11] = (2 * far * near) / (near - far);
		out[14] = -1;
		out[15] = 0;
		return out;
	}

	// view matrix for an eye looking at `target`, with world up `up`.
	// row-major; standard OpenGL lookAt (forward = eye -> target is -view z).
	function mat4LookAt(out, eye, target, up) {
		// f = normalize(target - eye)
		var fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
		var fl = Math.hypot(fx, fy, fz) || 1;
		fx /= fl; fy /= fl; fz /= fl;
		// s = normalize(f x up)
		var sx = fy * up[2] - fz * up[1];
		var sy = fz * up[0] - fx * up[2];
		var sz = fx * up[1] - fy * up[0];
		var sl = Math.hypot(sx, sy, sz) || 1;
		sx /= sl; sy /= sl; sz /= sl;
		// u = s x f
		var ux = sy * fz - sz * fy;
		var uy = sz * fx - sx * fz;
		var uz = sx * fy - sy * fx;
		out[0] = sx;  out[1] = sy;  out[2] = sz;  out[3] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
		out[4] = ux;  out[5] = uy;  out[6] = uz;  out[7] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
		out[8] = -fx; out[9] = -fy; out[10] = -fz; out[11] = (fx * eye[0] + fy * eye[1] + fz * eye[2]);
		out[12] = 0;  out[13] = 0;  out[14] = 0;   out[15] = 1;
		return out;
	}

	// out = a * b (row-major, out[row*4+col] = sum_k a[row*4+k] * b[k*4+col]).
	function mat4Mul(out, a, b) {
		for (var r = 0; r < 4; r++) {
			for (var c = 0; c < 4; c++) {
				var v = 0;
				for (var k = 0; k < 4; k++) v += a[r * 4 + k] * b[k * 4 + c];
				out[r * 4 + c] = v;
			}
		}
		return out;
	}

	// camera state factory. dist is refit on entering 3D; target is the orbit
	// pivot (world). plain object -> serializes directly into the scene file.
	function defaultCamera() {
		return { yaw: Math.PI / 2, pitch: 0.3, dist: 3, target: [0, 0, 0] };
	}

	function cloneCamera(c) {
		return { yaw: c.yaw, pitch: c.pitch, dist: c.dist, target: [c.target[0], c.target[1], c.target[2]] };
	}

	// sanitize a loaded camera bag; returns a fresh valid camera.
	function sanitizeCamera(o) {
		var d = defaultCamera();
		if (!o || typeof o !== 'object') return d;
		if (isFinite(o.yaw)) d.yaw = o.yaw;
		d.pitch = clamp(isFinite(o.pitch) ? o.pitch : d.pitch, -PITCH_LIMIT, PITCH_LIMIT);
		if (isFinite(o.dist) && o.dist > 0) d.dist = o.dist;
		if (o.target && o.target.length >= 3 && isFinite(o.target[0])) {
			d.target = [o.target[0], o.target[1], o.target[2]];
		}
		return d;
	}

	// eye position for a camera state (written into `out` vec3).
	function eyeOf(cam, out) {
		var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		out[0] = cam.target[0] + cam.dist * cp * Math.cos(cam.yaw);
		out[1] = cam.target[1] + cam.dist * cp * Math.sin(cam.yaw);
		out[2] = cam.target[2] + cam.dist * sp;
		return out;
	}

	// build the view-proj matrix for a camera into `m` (scratch, reused).
	// W/H are buffer pixels (canvas is square, aspect 1).
	function viewProj(m, cam, W, H) {
		var eye = eyeOf(cam, eyeScratch);
		mat4LookAt(viewScratch, eye, cam.target, UP);
		var near = Math.max(0.005 * cam.dist, 1e-4);
		var far = 200 * cam.dist;
		mat4Perspective(projScratch, FOVY, W / H, near, far);
		mat4Mul(m, projScratch, viewScratch);
		return m;
	}

	// project a world point through m into top-left-origin buffer pixels.
	// writes out[0]=sx, out[1]=sy; returns false when the point is at/behind
	// the near plane (caller clamps so segments run to the screen edge).
	// m is row-major (m[row*4 + col]).
	function projectPoint(m, x, y, z, out) {
		var nx = m[0] * x + m[1] * y + m[2] * z + m[3];
		var ny = m[4] * x + m[5] * y + m[6] * z + m[7];
		var w = m[12] * x + m[13] * y + m[14] * z + m[15];
		if (w < 1e-3) { out[0] = 0; out[1] = 0; return false; }
		var ndx = nx / w, ndy = ny / w;
		// clamp off-screen points to a wide band so behind-camera segments
		// streak to the edge instead of exploding across the canvas.
		if (ndx < -8) ndx = -8; else if (ndx > 8) ndx = 8;
		if (ndy < -8) ndy = -8; else if (ndy > 8) ndy = 8;
		out[0] = (ndx + 1) * 0.5 * projW;
		out[1] = (1 - ndy) * 0.5 * projH;
		return w >= 1e-3;
	}

	// orbit: yaw free (normalized), pitch clamped off the poles.
	function orbitBy(cam, dyaw, dpitch) {
		cam.yaw += dyaw;
		if (cam.yaw > Math.PI) cam.yaw -= Math.PI * 2;
		else if (cam.yaw < -Math.PI) cam.yaw += Math.PI * 2;
		cam.pitch = clamp(cam.pitch + dpitch, -PITCH_LIMIT, PITCH_LIMIT);
	}

	// exponential dolly; clamped to a fraction/multiple of the fit radius.
	function dolly(cam, factor, fitR) {
		var lo = 0.05 * fitR, hi = 40 * fitR;
		cam.dist = clamp(cam.dist * factor, lo, hi);
	}

	function wheelFactor(deltaY) { return Math.exp(-deltaY * WHEEL_K); }

	// world units per buffer pixel at the target depth (for constant-speed pan).
	function unitsPerPixel(cam, H) {
		return (2 * cam.dist * Math.tan(FOVY / 2)) / H;
	}

	// pan the orbit TARGET by a screen-pixel delta, in the camera plane.
	// drag right/down moves the content with the pointer (muscle memory from
	// the 2D pan): target slides opposite the finger in world space.
	function panBy(cam, dxPx, dyPx, W, H) {
		var eye = eyeOf(cam, eyeScratch);
		// camera right / up axes
		var fx = eye[0] - cam.target[0], fy = eye[1] - cam.target[1], fz = eye[2] - cam.target[2];
		var fl = Math.hypot(fx, fy, fz) || 1;
		fx /= fl; fy /= fl; fz /= fl;
		var rx = UP[1] * fz - UP[2] * fy;
		var ry = UP[2] * fx - UP[0] * fz;
		var rz = UP[0] * fy - UP[1] * fx;
		var rl = Math.hypot(rx, ry, rz) || 1;
		rx /= rl; ry /= rl; rz /= rl;
		var ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
		var s = unitsPerPixel(cam, H);
		cam.target[0] += (-rx * dxPx + ux * dyPx) * s;
		cam.target[1] += (-ry * dxPx + uy * dyPx) * s;
		cam.target[2] += (-rz * dxPx + uz * dyPx) * s;
	}

	// distance that frames a sphere of `radius` around the target.
	function fitDist(radius) {
		return (radius / Math.tan(FOVY / 2)) * 1.15;
	}

	// linear interpolation between two camera states (allocation-free; writes
	// into `dst`). t in [0,1].
	function lerpCam(dst, a, b, t) {
		dst.yaw = a.yaw + (b.yaw - a.yaw) * t;
		dst.pitch = a.pitch + (b.pitch - a.pitch) * t;
		dst.dist = a.dist + (b.dist - a.dist) * t;
		for (var i = 0; i < 3; i++) dst.target[i] = a.target[i] + (b.target[i] - a.target[i]) * t;
		return dst;
	}

	// module scratch (event-time / frame setup, never per-point).
	var UP = [0, 0, 1];
	var eyeScratch = [0, 0, 0];
	var viewScratch = new Float32Array(16);
	var projScratch = new Float32Array(16);
	var projW = 1, projH = 1;

	// set the buffer size used by projectPoint (call once per frame/resize).
	function setViewport(w, h) { projW = w; projH = h; }

	var Camera3 = {
		FOVY: FOVY,
		PITCH_LIMIT: PITCH_LIMIT,
		mat4Identity: mat4Identity,
		mat4Perspective: mat4Perspective,
		mat4LookAt: mat4LookAt,
		mat4Mul: mat4Mul,
		defaultCamera: defaultCamera,
		cloneCamera: cloneCamera,
		sanitizeCamera: sanitizeCamera,
		eyeOf: eyeOf,
		viewProj: viewProj,
		projectPoint: projectPoint,
		orbitBy: orbitBy,
		dolly: dolly,
		wheelFactor: wheelFactor,
		panBy: panBy,
		fitDist: fitDist,
		lerpCam: lerpCam,
		setViewport: setViewport
	};

	root.Camera3 = Camera3;
	if (typeof module !== 'undefined' && module.exports) module.exports = Camera3;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
