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
	var fbo = null, fboTex = null, fboDepth = null, fboW = 1, fboH = 1;

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

	// ---- glass sphere pass (full-screen analytic ray trace) ----------------
	// one full-screen quad; the fragment shader casts a camera ray per pixel
	// through the gear spheres (world-space vec4 centre+radius uniform array,
	// fed per render by main.js) and shades hollow glass shells analytically -
	// no geometry, no impostors, no raymarching. two selectable shaders (ports
	// of luncat8/glass-spheres-shader, spheres only):
	//   hollow : membrane tracing. the ray is walked event by event through up
	//            to uLayers thin shells (outer + inner surface), refracting
	//            through each wall with Fresnel, Beer-Lambert tint and a
	//            thin-film iridescence, with chromatic dispersion at the tail.
	//   layers : nearest-three-layers glass, composited back to front.
	// what lies behind the glass is a framebuffer copy (sphGrab) sampled along
	// the bent tail ray (shift capped to a few px: hairline trails moire when
	// the refracted read jumps across strands). depth order is exact in the
	// ray domain, so nested / overlapping spheres and a camera INSIDE a sphere
	// all just work - the previous impostor pass lost whole shells whenever a
	// nearer parent was painted after its child with the same stale copy.
	var SPH_CAP = 64;                        // uniform array size (shaders cap lower)
	var sphProgs = {};                       // id -> { prog, loc }
	var sphVao = null, sphQuadVbo = null;
	var sphTex = null;
	var sphScratch = new Float32Array(SPH_CAP * 4);   // world x, y, z, r
	var sphCount = 0;

	var SPH_VS = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 aQ;',
		'void main(){ gl_Position = vec4(aQ, 0.0, 1.0); }'
	].join('\n');

	// shared prelude: camera rays, view-space studio environment, background
	// sampling through the framebuffer copy, Fresnel, thin film.
	var SPH_COMMON = [
		'#version 300 es',
		'precision highp float;',
		'#define MAXB 64',
		'#define BIG 1e9',
		'#define PI 3.14159265359',
		'uniform vec2 uRes;',
		'uniform sampler2D uTex;',
		'uniform vec3 uCamPos;',
		'uniform vec3 uCamRt;',
		'uniform vec3 uCamUp;',
		'uniform vec3 uCamFw;',
		'uniform float uFocal;',    // perspective: 1 / tan(fovy / 2)
		'uniform float uOrtho;',    // > 0: orthographic, world half-width of the view
		'uniform float uBgDist;',   // world distance the tail ray is extended before projecting
		'uniform float uMaxShift;', // refraction sample shift cap, px
		'uniform vec4 uBubbles[MAXB];',
		'uniform int uCount;',
		'uniform vec3 uTint;',      // glass colour (transmitted)
		'uniform float uWall;',
		'uniform float uIor;',
		'uniform float uDensity;',
		'uniform float uIrid;',
		'uniform float uDisp;',
		'uniform float uLayers;',
		'uniform float uTime;',
		'out vec4 outColor;',
		'',
		'float saturate1(float x){ return clamp(x, 0.0, 1.0); }',
		'float fresnel(float c, float f0){ return f0 + (1.0 - f0) * pow(saturate1(1.0 - c), 5.0); }',
		'vec3 tonemap(vec3 c){',
		'  c = max(c, vec3(0.0));',
		'  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);',
		'  return clamp(c, vec3(0.0), vec3(1.0));',
		'}',
		'vec2 ray_sphere(vec3 ro, vec3 rd, vec3 c, float r){',
		'  vec3 oc = ro - c;',
		'  float b = dot(oc, rd);',
		'  float cc = dot(oc, oc) - r * r;',
		'  float h = b * b - cc;',
		'  if (h < 0.0) return vec2(1.0, -1.0);',
		'  h = sqrt(h);',
		'  return vec2(-b - h, -b + h);',
		'}',
		'float swirl(vec3 p){',
		'  float a = sin(p.x * 1.7 + sin(p.z * 1.3) * 1.2);',
		'  float b = cos(p.y * 1.9 - sin(p.x * 1.1) * 0.9);',
		'  float c = sin(p.z * 1.4 + cos(p.y * 1.6) * 1.1);',
		'  return (a * b + c) * 0.5;',
		'}',
		'vec3 filmTint(float d){',
		'  return 0.5 + 0.5 * cos(2.0 * PI * (d * vec3(1.0, 0.82, 0.66) + vec3(0.0, 0.28, 0.55)));',
		'}',
		'vec3 hueTint(float i){',
		'  float h = fract(i * 0.6180339887);',
		'  return 0.5 + 0.5 * cos(2.0 * PI * (h + vec3(0.0, 0.33, 0.67)));',
		'}',
		// camera ray for a pixel (gl_FragCoord, bottom-left origin)
		'void camera(vec2 fc, out vec3 ro, out vec3 rd){',
		'  vec2 ndc = fc / uRes * 2.0 - 1.0;',
		'  float aspect = uRes.x / uRes.y;',
		'  if (uOrtho > 0.0) {',
		'    ro = uCamPos + uCamRt * (ndc.x * uOrtho) + uCamUp * (ndc.y * uOrtho / aspect);',
		'    rd = uCamFw;',
		'    return;',
		'  }',
		'  ro = uCamPos;',
		'  rd = normalize(uCamFw * uFocal + uCamRt * (ndc.x * aspect) + uCamUp * ndc.y);',
		'}',
		// world point -> texture uv of the framebuffer copy
		'vec2 projUv(vec3 P){',
		'  vec3 v = P - uCamPos;',
		'  float x = dot(v, uCamRt), y = dot(v, uCamUp), z = dot(v, uCamFw);',
		'  float aspect = uRes.x / uRes.y;',
		'  vec2 ndc;',
		'  if (uOrtho > 0.0) ndc = vec2(x / uOrtho, y * aspect / uOrtho);',
		'  else { z = max(z, 1e-4); ndc = vec2(uFocal * x / (aspect * z), uFocal * y / z); }',
		'  return ndc * 0.5 + 0.5;',
		'}',
		// what the (bent) tail ray sees: the scene copy, shifted by the
		// projected deviation, capped in pixels.
		'vec3 background(vec3 ro, vec3 rd, vec2 fc){',
		'  vec2 uv0 = fc / uRes;',
		'  vec2 uv = projUv(ro + rd * uBgDist);',
		'  vec2 shift = (uv - uv0) * uRes;',
		'  float l = length(shift);',
		'  if (l > uMaxShift) shift *= uMaxShift / l;',
		'  return texture(uTex, uv0 + shift / uRes).rgb;',
		'}',
		// environment in VIEW space (x right, y up, z toward the eye): a soft
		// pastel sky (bright above, dusk below - the reference shaders reflect
		// a daylight sky, which is what makes the rims read) with cloud
		// banding, plus a key light and a cool fill so the shells stay legible
		// against the dark canvas.
		'vec3 envView(vec3 d){',
		'  float h = saturate1(d.y * 0.5 + 0.5);',
		'  vec3 col = mix(vec3(0.16, 0.13, 0.20), vec3(0.62, 0.72, 0.88), pow(h, 0.7));',
		'  col += vec3(0.45, 0.28, 0.15) * pow(1.0 - h, 6.0) * 0.5;',
		'  float cl = saturate1(0.5 + 0.5 * swirl(d * 4.5 + vec3(0.0, 1.7, 0.0)));',
		'  col = mix(col, vec3(0.92, 0.94, 0.98), cl * cl * 0.35 * h);',
		'  vec3 l1 = normalize(vec3(0.55, 0.55, 0.65));',
		'  vec3 l2 = normalize(vec3(-0.50, -0.25, 0.80));',
		'  col += vec3(1.25, 1.10, 0.90) * (pow(max(dot(d, l1), 0.0), 3000.0) * 14.0 + pow(max(dot(d, l1), 0.0), 20.0) * 0.30);',
		'  col += vec3(0.42, 0.58, 0.98) * pow(max(dot(d, l2), 0.0), 26.0) * 0.35;',
		'  return col;',
		'}',
		'vec3 envSun(vec3 dw){',
		'  vec3 d = normalize(vec3(dot(dw, uCamRt), dot(dw, uCamUp), -dot(dw, uCamFw)));',
		'  return envView(d);',
		'}',
		// per-sphere absorption: the user tint, nudged per sphere around the hue wheel
		'vec3 absorbOf(float i){',
		'  vec3 base = vec3(1.0) - uTint;',
		'  return mix(base, vec3(1.0) - hueTint(i), 0.3);',
		'}',
		'vec3 sphereTint(float i){ return mix(uTint, hueTint(i), 0.3); }'
	].join('\n');

	// ---- shader 1: hollow glass bubbles (membrane tracing) -----------------
	var SPH_FS_HOLLOW = SPH_COMMON + '\n' + [
		'#define EPS 0.0025',
		'vec4 innerOf(vec4 sp){ return vec4(sp.xyz, max(sp.w * (1.0 - uWall), sp.w * 0.02)); }',
		'vec2 sphereHit(vec3 ro, vec3 rd, vec4 sp, out vec3 n1, out vec3 n2){',
		'  vec2 h = ray_sphere(ro, rd, sp.xyz, sp.w);',
		'  n1 = (ro + rd * h.x - sp.xyz) / sp.w;',
		'  n2 = (ro + rd * h.y - sp.xyz) / sp.w;',
		'  return h;',
		'}',
		// one membrane crossing: refract in at face A, traverse the glass,
		// refract out at face B. adds the two Fresnel reflections, attenuates
		// the throughput by the Beer-Lambert tint of the glass travelled and
		// leaves the bent ray in (ro, rd). bend accumulates the deviation for
		// the dispersion at the tail.
		'vec3 crossWall(inout vec3 ro, inout vec3 rd, inout vec3 tp, inout vec3 bend,',
		'               vec4 sp, float idx, bool entering, float tHit, vec3 nHit){',
		'  vec3 col = vec3(0.0);',
		'  vec3 c = sp.xyz;',
		'  float R = sp.w;',
		'  vec4 inner = innerOf(sp);',
		'  vec3 rd0 = rd;',
		'  float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);',
		'  vec3 n1, n2;',
		'  vec3 pA, nA;',
		'  if (entering) { pA = ro + rd * tHit; nA = nHit; }',
		'  else {',
		'    vec2 hi = sphereHit(ro, rd, inner, n1, n2);',
		'    bool cavity = hi.y > EPS && hi.y < tHit && hi.y >= hi.x;',
		'    pA = ro + rd * (cavity ? hi.y : tHit);',
		'    nA = cavity ? -n2 : nHit;',
		'  }',
		'  float ndv = saturate1(dot(-rd, nA));',
		'  float F = fresnel(ndv, f0);',
		'  float sw = 1.0 + 0.55 * swirl((pA - c) / R * 2.6 + vec3(0.0, uTime * 0.05, idx * 3.1));',
		'  float optical = uWall * R * 9.0 * sw / max(ndv, 0.16);',
		'  vec3 film = mix(vec3(1.0), filmTint(optical), uIrid);',
		'  col += tp * F * envSun(reflect(rd, nA)) * film;',
		'  tp *= (1.0 - F) * mix(vec3(1.0), clamp(vec3(1.45) - film, 0.0, 1.0), uIrid * 0.8);',
		'  vec3 rd1 = refract(rd, nA, 1.0 / uIor);',
		'  if (dot(rd1, rd1) < 1e-5) {',        // total internal reflection
		'    rd = reflect(rd, nA);',
		'    ro = pA + rd * EPS;',
		'    return col;',
		'  }',
		'  float chord;',
		'  vec3 q = pA + rd1 * EPS;',
		'  vec3 pB, nB;',
		'  vec2 hin = sphereHit(q, rd1, inner, n1, n2);',
		'  if (entering && hin.x > 0.0 && hin.y > hin.x) {',
		'    chord = hin.x; pB = q + rd1 * chord; nB = n1;',
		'  } else {',
		'    vec2 hout = sphereHit(q, rd1, sp, n1, n2);',
		'    chord = max(hout.y, 0.0); pB = q + rd1 * chord; nB = -n2;',
		'  }',
		'  tp *= exp(-absorbOf(idx) * uDensity * chord / max(uWall * R, 1e-4) * 0.16);',
		'  float F2 = fresnel(saturate1(dot(-rd1, nB)), f0);',
		'  col += tp * F2 * envSun(reflect(rd1, nB)) * film * 0.85;',
		'  tp *= (1.0 - F2);',
		'  vec3 rd2 = refract(rd1, nB, uIor);',
		'  if (dot(rd2, rd2) < 1e-5) rd2 = reflect(rd1, nB);',
		'  bend += rd2 - rd0;',
		'  ro = pB + rd2 * EPS;',
		'  rd = normalize(rd2);',
		'  return col;',
		'}',
		'vec3 traceMembranes(vec3 ro0, vec3 rd0, out float firstT,',
		'                    out vec3 finalRo, out vec3 finalRd, out vec3 finalTp, out vec3 finalBend){',
		'  vec3 col = vec3(0.0);',
		'  vec3 tp = vec3(1.0);',
		'  vec3 bend = vec3(0.0);',
		'  int layers = clamp(int(uLayers + 0.5), 1, 10);',
		'  firstT = BIG;',
		'  vec3 ro = ro0, rd = rd0;',
		'  int nBub = min(uCount, 32);',
		'  for (int L = 0; L < layers; L++) {',
		'    float bestT = BIG;',
		'    int bi = -1;',
		'    bool entering = true;',
		'    vec3 bestN = vec3(0.0);',
		'    vec3 nA, nB;',
		'    for (int i = 0; i < nBub; i++) {',
		'      vec2 h = sphereHit(ro, rd, uBubbles[i], nA, nB);',
		'      if (h.y < h.x) continue;',
		'      bool ent = h.x > EPS;',
		'      float te = ent ? h.x : h.y;',
		'      if (te <= EPS || te >= bestT) continue;',
		'      bestT = te; bi = i; entering = ent; bestN = ent ? nA : -nB;',
		'    }',
		'    if (bi < 0) break;',
		'    if (L == 0) firstT = bestT;',
		'    col += crossWall(ro, rd, tp, bend, uBubbles[bi], float(bi), entering, bestT, bestN);',
		'    if (max(tp.x, max(tp.y, tp.z)) < 0.02) break;',
		'  }',
		'  finalRo = ro; finalRd = rd; finalTp = tp; finalBend = bend;',
		'  return col;',
		'}',
		'void main(){',
		'  vec2 fc = gl_FragCoord.xy;',
		'  vec3 ro, rd;',
		'  camera(fc, ro, rd);',
		'  float firstT;',
		'  vec3 fRo, fRd, fTp, fBend;',
		'  vec3 col = traceMembranes(ro, rd, firstT, fRo, fRd, fTp, fBend);',
		'  if (firstT >= BIG) discard;',      // no glass on this pixel: keep the scene
		'  vec3 bg = background(fRo, fRd, fc);',
		'  float k = uDisp * 0.4;',
		'  if (k > 0.001 && dot(fBend, fBend) > 1e-6) {',
		'    vec3 a = normalize(fRd + fBend * k);',
		'    vec3 b = normalize(fRd - fBend * k);',
		'    bg = vec3(background(fRo, a, fc).r, bg.g, background(fRo, b, fc).b);',
		'  }',
		'  outColor = vec4(tonemap(col) + fTp * bg, 1.0);',
		'}'
	].join('\n');

	// ---- shader 2: analytic layered glass (nearest 3 layers) ---------------
	var SPH_FS_LAYERS = SPH_COMMON + '\n' + [
		'#define LAYERS 3',
		'#define EPS 0.002',
		'void pushLayer(inout vec4 hits[LAYERS], vec4 h){',
		'  if (h.x < hits[0].x) { hits[2] = hits[1]; hits[1] = hits[0]; hits[0] = h; return; }',
		'  if (h.x < hits[1].x) { hits[2] = hits[1]; hits[1] = h; return; }',
		'  hits[2] = h;',
		'}',
		'int sphereHits(vec3 ro, vec3 rd, out vec4 hits[LAYERS]){',
		'  for (int i = 0; i < LAYERS; i++) hits[i] = vec4(BIG, BIG, -1.0, 0.0);',
		'  int count = 0;',
		'  int n = min(uCount, 61);',
		'  for (int i = 0; i < n; i++) {',
		'    vec2 h = ray_sphere(ro, rd, uBubbles[i].xyz, uBubbles[i].w);',
		'    if (h.y <= EPS || h.y < h.x) continue;',
		'    float t = h.x > EPS ? h.x : h.y;',
		'    if (t >= hits[2].x) continue;',
		'    pushLayer(hits, vec4(t, h.y, float(i), 0.0));',
		'    count = min(count + 1, LAYERS);',
		'  }',
		'  return count;',
		'}',
		'vec3 shadeGlass(vec3 behind, vec3 ro, vec3 rd, float t, float tx, vec3 n, vec3 nx, vec4 sph, float id){',
		'  vec3 p = ro + rd * t;',
		'  float ndv = saturate1(dot(-rd, n));',
		'  float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);',
		'  float F = fresnel(ndv, f0);',
		'  float wallPath = uWall * sph.w / max(ndv, 0.13);',
		'  vec3 tint = sphereTint(id);',
		'  vec3 transmit = behind * exp(-(vec3(1.08) - tint) * uDensity * wallPath / max(uWall * sph.w, 1e-4) * 0.3);',
		'  vec3 refr = refract(rd, n, 1.0 / max(uIor, 1.001));',
		'  if (dot(refr, refr) > 0.001) transmit = mix(transmit, transmit * envSun(refr), 0.08 * (1.0 - F));',
		'  float sw = swirl((p - sph.xyz) / sph.w * 4.0 + vec3(0.0, uTime * 0.08, id * 1.7));',
		'  float optical = wallPath / max(sph.w, 1e-4) * 12.0 * (1.0 + 0.35 * sw);',
		'  vec3 film = mix(vec3(1.0), filmTint(optical), uIrid);',
		'  vec3 reflected = envSun(reflect(rd, n)) * film;',
		'  vec3 col = mix(transmit, reflected, F);',
		'  col = mix(col, col * (0.78 + 0.38 * tint), 0.22);',
		'  vec3 glassBody = behind * 0.72 + tint * 0.10;',
		'  col = mix(col, glassBody, 0.12 + 0.08 * (1.0 - ndv));',
		'  float rim = pow(1.0 - ndv, 2.4);',
		'  float backRim = 0.0;',
		'  if (tx > t + EPS) backRim = pow(1.0 - abs(dot(rd, nx)), 4.0);',
		'  col += film * (0.03 + 0.42 * rim + 0.12 * backRim) * tint;',
		'  return col;',
		'}',
		'vec3 shadeLayer(vec3 behind, vec3 ro, vec3 rd, vec4 hit){',
		'  vec4 sph = uBubbles[int(hit.z)];',
		'  vec2 h = ray_sphere(ro, rd, sph.xyz, sph.w);',
		'  vec3 n = (ro + rd * h.x - sph.xyz) / sph.w;',
		'  vec3 nx = (ro + rd * h.y - sph.xyz) / sph.w;',
		'  if (h.x <= EPS) n = -nx;',
		'  return shadeGlass(behind, ro, rd, hit.x, hit.y, n, nx, sph, hit.z);',
		'}',
		'void main(){',
		'  vec2 fc = gl_FragCoord.xy;',
		'  vec3 ro, rd;',
		'  camera(fc, ro, rd);',
		'  vec4 hits[LAYERS];',
		'  int count = sphereHits(ro, rd, hits);',
		'  if (count == 0) discard;',
		// a small refraction of the scene copy through the nearest shell
		'  vec3 nearN = normalize(ro + rd * hits[0].x - uBubbles[int(hits[0].z)].xyz);',
		'  vec3 bent = refract(rd, nearN, 1.0 / max(uIor, 1.001));',
		'  if (dot(bent, bent) < 0.001) bent = rd;',
		'  vec3 col = background(ro + rd * hits[0].x, normalize(mix(rd, bent, 0.5)), fc);',
		'  for (int i = count - 1; i >= 0; i--) col = shadeLayer(col, ro, rd, hits[i]);',
		'  outColor = vec4(col, 1.0);',
		'}'
	].join('\n');

	var SPH_SOURCES = { hollow: SPH_FS_HOLLOW, layers: SPH_FS_LAYERS };
	var SPH_UNIFORMS = ['uRes', 'uTex', 'uCamPos', 'uCamRt', 'uCamUp', 'uCamFw', 'uFocal', 'uOrtho',
		'uBgDist', 'uMaxShift', 'uBubbles[0]', 'uCount', 'uTint', 'uWall', 'uIor', 'uDensity',
		'uIrid', 'uDisp', 'uLayers', 'uTime'];

	// programs compile lazily on first use (each is a full ray tracer; only
	// the selected one is ever needed).
	function sphProgram(id) {
		var e = sphProgs[id];
		if (e) return e;
		var src = SPH_SOURCES[id];
		if (!src) return null;
		var prog = gl.createProgram();
		gl.attachShader(prog, compile(gl.VERTEX_SHADER, SPH_VS));
		gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, src));
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			throw new Error('sphere link (' + id + '): ' + gl.getProgramInfoLog(prog));
		}
		var loc = {};
		for (var i = 0; i < SPH_UNIFORMS.length; i++) loc[SPH_UNIFORMS[i]] = gl.getUniformLocation(prog, SPH_UNIFORMS[i]);
		e = { prog: prog, loc: loc };
		sphProgs[id] = e;
		return e;
	}

	function sphInit() {
		// scene-copy texture (refraction / transmission background)
		sphTex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, sphTex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		sphResize(1, 1);
		sphVao = gl.createVertexArray();
		gl.bindVertexArray(sphVao);
		sphQuadVbo = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, sphQuadVbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		// attribute 0 in every sphere program: aQ is the only attribute
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
		gl.bindVertexArray(null);
	}

	function sphResize(w, h) {
		gl.bindTexture(gl.TEXTURE_2D, sphTex);
		// RGB8: the canvas context is created with alpha:false, so the back
		// buffer is RGB and only an RGB-class destination accepts the copy
		// (RGBA8 trips "Invalid copy texture format combination" on ANGLE).
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
	}

	// copy the current default framebuffer into the scene texture. bottom-left
	// origins match, so the shader samples it with gl_FragCoord.xy / uRes -
	// no y flip needed.
	function sphGrab() {
		gl.bindTexture(gl.TEXTURE_2D, sphTex);
		gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
	}

	function sphReset() { sphCount = 0; }

	// world-space sphere (centre xyz, radius r)
	function sphPush(x, y, z, r) {
		if (sphCount >= SPH_CAP) return;
		var o = sphCount * 4;
		sphScratch[o] = x; sphScratch[o + 1] = y; sphScratch[o + 2] = z; sphScratch[o + 3] = r;
		sphCount++;
	}

	// p: { shader, camPos, camRt, camUp, camFw (vec3 arrays), focal, ortho,
	//      bgDist, maxShift, tint (vec3), wall, ior, density, irid, disp,
	//      layers, time }
	function sphDraw(p) {
		if (sphCount === 0) return;
		var e = sphProgram(p.shader);
		if (!e) return;
		var L = e.loc;
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.useProgram(e.prog);
		gl.uniform2f(L.uRes, W, H);
		gl.uniform3f(L.uCamPos, p.camPos[0], p.camPos[1], p.camPos[2]);
		gl.uniform3f(L.uCamRt, p.camRt[0], p.camRt[1], p.camRt[2]);
		gl.uniform3f(L.uCamUp, p.camUp[0], p.camUp[1], p.camUp[2]);
		gl.uniform3f(L.uCamFw, p.camFw[0], p.camFw[1], p.camFw[2]);
		gl.uniform1f(L.uFocal, p.focal);
		gl.uniform1f(L.uOrtho, p.ortho);
		gl.uniform1f(L.uBgDist, p.bgDist);
		gl.uniform1f(L.uMaxShift, p.maxShift);
		gl.uniform4fv(L['uBubbles[0]'], sphScratch.subarray(0, sphCount * 4));
		gl.uniform1i(L.uCount, sphCount);
		gl.uniform3f(L.uTint, p.tint[0], p.tint[1], p.tint[2]);
		gl.uniform1f(L.uWall, p.wall);
		gl.uniform1f(L.uIor, p.ior);
		gl.uniform1f(L.uDensity, p.density);
		gl.uniform1f(L.uIrid, p.irid);
		gl.uniform1f(L.uDisp, p.disp);
		gl.uniform1f(L.uLayers, p.layers);
		gl.uniform1f(L.uTime, p.time);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, sphTex);
		gl.uniform1i(L.uTex, 0);
		gl.bindVertexArray(sphVao);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.bindVertexArray(null);
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
		sphInit();
	}

	function resize(w, h) {
		W = w; H = h;
		canvas.width = w;
		canvas.height = h;
		gl.viewport(0, 0, w, h);
		if (fbo) overlayResize(w, h);
		if (sphTex) sphResize(w, h);
	}

	function begin(bg) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, W, H);
		// 2D path never uses depth (flat painter order); keep it off so a stale
		// depth buffer cannot discard later 2D draws.
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.clearColor(bg[0], bg[1], bg[2], 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		vCount = 0;
	}

	// 3D path: depth test resolves occlusion (baked overlay + direct draws).
	// the default framebuffer already has a depth attachment (webgl2 defaults
	// depth:true); the overlay FBO gets a DEPTH renderbuffer (overlayResize).
	function depth(on) {
		if (on) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); }
		else { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); }
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
		if (fboDepth) gl.deleteRenderbuffer(fboDepth);
		if (fbo) gl.deleteFramebuffer(fbo);
		fboTex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, fboTex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		// 3D bakes need a depth buffer so the baked figure resolves occlusion
		// once (the blit is a flat quad; the 2D path never enables depth).
		fboDepth = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, fboDepth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
		fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboDepth);
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
			gl.clearDepth(1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
		depth: depth,
		seg: seg,
		circle: circle,
		dot: dot,
		flush: flush,
		overlay: overlay,
		glowBegin: glowBegin,
		glowPoint: glowPoint,
		glowFlush: glowFlush,
		sphReset: sphReset,
		sphPush: sphPush,
		sphGrab: sphGrab,
		sphDraw: sphDraw,
		maxVert: MAXVERT,
		vCount: function () { return vCount; }
	};

	root.R = R;
	if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : this);
