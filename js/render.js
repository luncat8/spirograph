// js/render.js - WebGL2 antialiased line renderer (analytic AA, no MSAA needed)
// classic <script>; guards module.exports for node.

(function (root) {
	'use strict';

	var MAXSEG = 200000;             // max line segments drawn per frame
	var FLOATS = 11;                 // per vertex: pos(2) aA(2) aB(2) color(4) half(1)
	var MAXVERT = MAXSEG * 6;
	var scratch = new Float32Array(MAXVERT * FLOATS);
	var vCount = 0;

	// precomputed unit circle for filled round-join discs (no per-call trig).
	var DOT_TRI = 24;
	var dotCos = new Float32Array(DOT_TRI);
	var dotSin = new Float32Array(DOT_TRI);
	for (var _di = 0; _di < DOT_TRI; _di++) {
		var _ang = (_di / DOT_TRI) * Math.PI * 2;
		dotCos[_di] = Math.cos(_ang);
		dotSin[_di] = Math.sin(_ang);
	}

	var gl = null, canvas = null;
	var W = 1, H = 1;
	var lineProg = null, vao = null, vbo = null, uResLoc = null;
	var quadProg = null, quadVao = null, quadVbo = null, uTexLoc = null;
	var fbo = null, fboTex = null, fboW = 1, fboH = 1;

	// ---- additive glow point-sprite pass (Points mode) ----
	var GLOW_CAP = 4096;
	var glowProg = null, glowVao = null, glowVbo = null, glowResLoc = null;
	var glowScratch = new Float32Array(GLOW_CAP * 7);
	var glowCount = 0;
	var GLOW_VS = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 aPos;',
		'in vec4 aColor;',
		'in float aSize;',
		'uniform vec2 uRes;',
		'out vec4 vColor;',
		'void main(){',
		'  vColor = aColor;',
		'  vec2 clip = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);',
		'  gl_Position = vec4(clip, 0.0, 1.0);',
		'  gl_PointSize = aSize;',
		'}'
	].join('\n');
	var GLOW_FS = [
		'#version 300 es',
		'precision highp float;',
		'in vec4 vColor;',
		'out vec4 outColor;',
		'void main(){',
		'  vec2 pc = gl_PointCoord - 0.5;',           // -0.5 .. 0.5
		'  float d = length(pc) * 2.0;',              // 0 at centre, 1 at inscribed edge
		'  float strength = pow(0.2 / max(d, 0.0008), 1.5);', // inverse-distance light
		'  strength *= smoothstep(1.0, 0.0, min(d, 1.0));',     // fade to 0 at edge (no seam)
		'  vec3 col = strength * vColor.rgb;',
		'  col = 1.0 - exp(-col);',                   // tone map -> white-hot core
		'  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);',
		'  outColor = vec4(col, a);',                 // premultiplied; additive (ONE, ONE)
		'}'
	].join('\n');

	function glowInit() {
		glowProg = gl.createProgram();
		gl.attachShader(glowProg, compile(gl.VERTEX_SHADER, GLOW_VS));
		gl.attachShader(glowProg, compile(gl.FRAGMENT_SHADER, GLOW_FS));
		gl.linkProgram(glowProg);
		if (!gl.getProgramParameter(glowProg, gl.LINK_STATUS)) {
			throw new Error('glow link: ' + gl.getProgramInfoLog(glowProg));
		}
		glowResLoc = gl.getUniformLocation(glowProg, 'uRes');
		glowVao = gl.createVertexArray();
		glowVbo = gl.createBuffer();
		gl.bindVertexArray(glowVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, glowVbo);
		gl.bufferData(gl.ARRAY_BUFFER, glowScratch.byteLength, gl.DYNAMIC_DRAW);
		var stride = 7 * 4;
		var pLoc = gl.getAttribLocation(glowProg, 'aPos');
		gl.enableVertexAttribArray(pLoc);
		gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, stride, 0);
		var cLoc = gl.getAttribLocation(glowProg, 'aColor');
		gl.enableVertexAttribArray(cLoc);
		gl.vertexAttribPointer(cLoc, 4, gl.FLOAT, false, stride, 8);
		var sLoc = gl.getAttribLocation(glowProg, 'aSize');
		gl.enableVertexAttribArray(sLoc);
		gl.vertexAttribPointer(sLoc, 1, gl.FLOAT, false, stride, 24);
		gl.bindVertexArray(null);
	}

	function glowBegin() {
		gl.useProgram(glowProg);
		gl.uniform2f(glowResLoc, W, H);
		gl.bindVertexArray(glowVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, glowVbo);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		glowCount = 0;
	}

	function glowPoint(x, y, sizePx, r, g, b, a) {
		if (glowCount >= GLOW_CAP) return;
		var o = glowCount * 7;
		glowScratch[o] = x; glowScratch[o + 1] = y;
		glowScratch[o + 2] = r; glowScratch[o + 3] = g; glowScratch[o + 4] = b;
		glowScratch[o + 5] = a; glowScratch[o + 6] = sizePx;
		glowCount++;
	}

	function glowFlush() {
		if (glowCount === 0) return;
		gl.bindVertexArray(glowVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, glowVbo);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, glowScratch.subarray(0, glowCount * 7));
		gl.useProgram(glowProg);
		gl.uniform2f(glowResLoc, W, H);
		gl.drawArrays(gl.POINTS, 0, glowCount);
		gl.bindVertexArray(null);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	}

	var VS = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 aPos;',
		'in vec2 aA;',
		'in vec2 aB;',
		'in vec4 aColor;',
		'in float aHalf;',
		'uniform vec2 uRes;',
		'out vec2 vA;',
		'out vec2 vB;',
		'out vec4 vColor;',
		'out float vHalf;',
		'void main(){',
		'  vA = aA; vB = aB; vColor = aColor; vHalf = aHalf;',
		'  vec2 p = aPos;',
		'  vec2 clip = vec2(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0);',
		'  gl_Position = vec4(clip, 0.0, 1.0);',
		'}'
	].join('\n');

	var FS = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 vA;',
		'in vec2 vB;',
		'in vec4 vColor;',
		'in float vHalf;',
		'uniform vec2 uRes;',
		'out vec4 outColor;',
		'float distToSeg(vec2 p, vec2 a, vec2 b){',
		'  vec2 ab = b - a;',
		'  vec2 ap = p - a;',
		'  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);',
		'  vec2 proj = a + t * ab;',
		'  return length(p - proj);',
		'}',
		'void main(){',
		'  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
		'  float d = distToSeg(fc, vA, vB);',
		'  float aa = 1.0;',
		'  float a = 1.0 - smoothstep(vHalf - aa, vHalf + aa, d);',
		'  if (a <= 0.0) discard;',
		'  outColor = vec4(vColor.rgb * a, vColor.a * a);',
		'}'
	].join('\n');

	function compile(type, src) {
		var s = gl.createShader(type);
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
			throw new Error('shader: ' + gl.getShaderInfoLog(s));
		}
		return s;
	}

	function init(cv) {
		canvas = cv;
		gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
		if (!gl) throw new Error('WebGL2 not supported');
		lineProg = gl.createProgram();
		gl.attachShader(lineProg, compile(gl.VERTEX_SHADER, VS));
		gl.attachShader(lineProg, compile(gl.FRAGMENT_SHADER, FS));
		gl.linkProgram(lineProg);
		if (!gl.getProgramParameter(lineProg, gl.LINK_STATUS)) {
			throw new Error('link: ' + gl.getProgramInfoLog(lineProg));
		}
		uResLoc = gl.getUniformLocation(lineProg, 'uRes');
		vao = gl.createVertexArray();
		vbo = gl.createBuffer();
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, scratch.byteLength, gl.DYNAMIC_DRAW);
		var stride = FLOATS * 4;
		var loc = {
			pos: gl.getAttribLocation(lineProg, 'aPos'),
			aA: gl.getAttribLocation(lineProg, 'aA'),
			aB: gl.getAttribLocation(lineProg, 'aB'),
			color: gl.getAttribLocation(lineProg, 'aColor'),
			half: gl.getAttribLocation(lineProg, 'aHalf')
		};
		gl.enableVertexAttribArray(loc.pos);
		gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(loc.aA);
		gl.vertexAttribPointer(loc.aA, 2, gl.FLOAT, false, stride, 8);
		gl.enableVertexAttribArray(loc.aB);
		gl.vertexAttribPointer(loc.aB, 2, gl.FLOAT, false, stride, 16);
		gl.enableVertexAttribArray(loc.color);
		gl.vertexAttribPointer(loc.color, 4, gl.FLOAT, false, stride, 24);
		gl.enableVertexAttribArray(loc.half);
		gl.vertexAttribPointer(loc.half, 1, gl.FLOAT, false, stride, 40);
		gl.bindVertexArray(null);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		overlayInit(W, H);
		glowInit();
	}

	function resize(w, h) {
		W = w; H = h;
		canvas.width = w;
		canvas.height = h;
		gl.viewport(0, 0, w, h);
		if (fbo) overlayResize(w, h);
	}

	function begin(bg) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, W, H);
		gl.clearColor(bg[0], bg[1], bg[2], 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		vCount = 0;
	}

	function pushVert(px, py, ax, ay, bx, by, r, g, b, a, half) {
		var o = vCount * FLOATS;
		if (o + FLOATS > scratch.length) return;
		scratch[o] = px; scratch[o + 1] = py;
		scratch[o + 2] = ax; scratch[o + 3] = ay;
		scratch[o + 4] = bx; scratch[o + 5] = by;
		scratch[o + 6] = r; scratch[o + 7] = g; scratch[o + 8] = b; scratch[o + 9] = a;
		scratch[o + 10] = half;
		vCount++;
	}

	// add one line segment (a-b) expanded to width 2*half with AA.
	// per-endpoint colors (r0,g0,b0)->(r1,g1,b1) let the shader interpolate, so a
	// trace keeps the color it was drawn with (persistent pen).
	function seg(x0, y0, x1, y1, half, r0, g0, b0, r1, g1, b1, a) {
		if (vCount + 6 > MAXVERT) return;
		var dx = x1 - x0, dy = y1 - y0;
		var len = Math.sqrt(dx * dx + dy * dy);
		var nx, ny;
		if (len < 1e-6) { nx = 0; ny = half; }
		else { nx = -dy / len * half; ny = dx / len * half; }
		var ax = x0 + nx, ay = y0 + ny;
		var bx = x0 - nx, by = y0 - ny;
		var cx = x1 + nx, cy = y1 + ny;
		var dx2 = x1 - nx, dy2 = y1 - ny;
		pushVert(ax, ay, x0, y0, x1, y1, r0, g0, b0, a, half);
		pushVert(bx, by, x0, y0, x1, y1, r0, g0, b0, a, half);
		pushVert(cx, cy, x0, y0, x1, y1, r1, g1, b1, a, half);
		pushVert(cx, cy, x0, y0, x1, y1, r1, g1, b1, a, half);
		pushVert(bx, by, x0, y0, x1, y1, r0, g0, b0, a, half);
		pushVert(dx2, dy2, x0, y0, x1, y1, r1, g1, b1, a, half);
	}

	function circle(cx, cy, radius, half, r, g, b, a, segs) {
		if (radius <= 0.5) { seg(cx - half, cy, cx + half, cy, half, r, g, b, r, g, b, a); return; }
		var n = segs || 48;
		var px = cx + radius, py = cy;
		for (var i = 1; i <= n; i++) {
			var ang = (i / n) * Math.PI * 2;
			var x = cx + Math.cos(ang) * radius;
			var y = cy + Math.sin(ang) * radius;
			seg(px, py, x, y, half, r, g, b, r, g, b, a);
			px = x; py = y;
		}
	}

	// filled round-join disc: triangle fan with all verts anchored at the centre
	// (distToSeg => distance to centre => filled circle of the given radius).
	function dot(cx, cy, radius, r, g, b, a) {
		if (vCount + DOT_TRI * 3 > MAXVERT) return;
		for (var i = 0; i < DOT_TRI; i++) {
			var i2 = (i + 1) % DOT_TRI;
			var x0 = cx + dotCos[i] * radius, y0 = cy + dotSin[i] * radius;
			var x1 = cx + dotCos[i2] * radius, y1 = cy + dotSin[i2] * radius;
			pushVert(cx, cy, cx, cy, cx, cy, r, g, b, a, radius);
			pushVert(x0, y0, cx, cy, cx, cy, r, g, b, a, radius);
			pushVert(x1, y1, cx, cy, cx, cy, r, g, b, a, radius);
		}
	}

	function flush() {
		if (vCount === 0) return;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, scratch.subarray(0, vCount * FLOATS));
		gl.useProgram(lineProg);
		gl.uniform2f(uResLoc, W, H);
		gl.drawArrays(gl.TRIANGLES, 0, vCount);
		gl.bindVertexArray(null);
		vCount = 0;
	}

	var QUAD_VS = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 aPos;',
		'in vec2 aUv;',
		'out vec2 vUv;',
		'void main(){',
		'  vUv = aUv;',
		'  gl_Position = vec4(aPos, 0.0, 1.0);',
		'}'
	].join('\n');

	var QUAD_FS = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 vUv;',
		'uniform sampler2D uTex;',
		'out vec4 outColor;',
		'void main(){',
		'  outColor = texture(uTex, vUv);',
		'}'
	].join('\n');

	function overlayInit(w, h) {
		quadProg = gl.createProgram();
		gl.attachShader(quadProg, compile(gl.VERTEX_SHADER, QUAD_VS));
		gl.attachShader(quadProg, compile(gl.FRAGMENT_SHADER, QUAD_FS));
		gl.linkProgram(quadProg);
		if (!gl.getProgramParameter(quadProg, gl.LINK_STATUS)) {
			throw new Error('quad link: ' + gl.getProgramInfoLog(quadProg));
		}
		uTexLoc = gl.getUniformLocation(quadProg, 'uTex');
		quadVao = gl.createVertexArray();
		quadVbo = gl.createBuffer();
		gl.bindVertexArray(quadVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
		var verts = new Float32Array([
			-1, -1, 0, 0,
			 1, -1, 1, 0,
			-1,  1, 0, 1,
			 1,  1, 1, 1
		]);
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
		var pLoc = gl.getAttribLocation(quadProg, 'aPos');
		gl.enableVertexAttribArray(pLoc);
		gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 16, 0);
		var uLoc = gl.getAttribLocation(quadProg, 'aUv');
		gl.enableVertexAttribArray(uLoc);
		gl.vertexAttribPointer(uLoc, 2, gl.FLOAT, false, 16, 8);
		gl.bindVertexArray(null);
		overlayResize(w, h);
	}

	function overlayResize(w, h) {
		fboW = w; fboH = h;
		if (fboTex) gl.deleteTexture(fboTex);
		if (fbo) gl.deleteFramebuffer(fbo);
		fboTex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, fboTex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
		var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		if (status !== gl.FRAMEBUFFER_COMPLETE) {
			throw new Error('overlay FBO incomplete: 0x' + status.toString(16));
		}
	}

	var overlay = {
		init: overlayInit,
		resize: overlayResize,
		bind: function () {
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.viewport(0, 0, fboW, fboH);
		},
		unbind: function () {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, W, H);
		},
		clear: function () {
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		},
		blitToScreen: function () {
			gl.bindVertexArray(quadVao);
			gl.useProgram(quadProg);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, fboTex);
			gl.uniform1i(uTexLoc, 0);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			gl.bindVertexArray(null);
		}
	};

	var R = {
		init: init,
		resize: resize,
		begin: begin,
		seg: seg,
		circle: circle,
		dot: dot,
		flush: flush,
		overlay: overlay,
		glowBegin: glowBegin,
		glowPoint: glowPoint,
		glowFlush: glowFlush,
		maxVert: MAXVERT,
		vCount: function () { return vCount; }
	};

	root.R = R;
	if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : this);
