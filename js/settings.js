// js/settings.js - single source of truth for slider bounds, the persisted
// app-state schema and autosave. classic <script> (no modules); guards
// module.exports for node. loaded BEFORE gear.js so gear.js can read the
// defaults from inside defaultAppState()/deserialize().
//
// every persisted field has one APP_SCHEMA entry: default, type, a getter off
// the live App, a clean() that coerces/sanitizes a loaded value, and an
// apply() recipe that pushes a sanitized bag into the live App + GUI. adding
// a persisted toggle is one entry here - nothing else changes.

(function (root) {
	'use strict';

	var STORE_KEY = 'spiro.autosave.v1';

	// ---- slider bounds + runtime clamps --------------------------------
	// one place per bounded setting: the GUI rows read min/max/step from here,
	// the runtime setters and the save loader both go through clamp().
	// `floor` (optional) is the hard runtime minimum when it differs from the
	// slider minimum.
	var LIMITS = {
		maxPeriod: { min: 4, max: 4000, step: 4, def: 2000 },
		samplesPerTurn: { min: 20, max: 2000, step: 20, def: 200 },
		// max MUST equal Gear.CAP (js/gear.js) - the ring buffer hard ceiling.
		// floor is gear.js applyTrailCap's hard minimum; min is the slider's.
		trailCap: { min: 500, max: 40000, step: 500, floor: 100 }
	};

	// round + clamp a user/loaded value for a bounded field.
	function clamp(field, v) {
		var L = LIMITS[field];
		var lo = L.floor != null ? L.floor : L.min;
		var x = Math.round(v || 0);
		return Math.max(lo, Math.min(L.max, x));
	}

	// ---- glass sphere shaders ------------------------------------------
	// selector id -> label + per-shader slider table (min/max/step/def). the
	// GUI builds one slider row per param of the selected shader, main.js
	// feeds the bag to the matching fragment program (render.js). the
	// defaults are the reference presets from luncat8/glass-spheres-shader.
	var SPHERE_SHADERS = {
		off: { label: 'off', params: {} },
		hollow: {
			label: 'hollow glass bubbles',
			params: {
				wall: { min: 0.005, max: 0.5, step: 0.005, def: 0.115 },
				ior: { min: 1.0, max: 2.0, step: 0.01, def: 1.45 },
				tint: { min: 0.0, max: 3.0, step: 0.05, def: 0.70 },
				iris: { min: 0.0, max: 1.0, step: 0.05, def: 0.55 },
				disp: { min: 0.0, max: 1.0, step: 0.05, def: 0.35 },
				layers: { min: 1, max: 10, step: 1, def: 6 }
			}
		},
		layers: {
			label: 'analytic layered glass',
			params: {
				wall: { min: 0.005, max: 0.25, step: 0.005, def: 0.045 },
				ior: { min: 1.0, max: 2.0, step: 0.01, def: 1.42 },
				tint: { min: 0.0, max: 3.0, step: 0.05, def: 0.55 },
				iris: { min: 0.0, max: 1.0, step: 0.05, def: 0.55 }
			}
		}
	};
	var SPHERE_SHADER_IDS = ['off', 'hollow', 'layers'];

	function clampSphereParam(shader, key, v) {
		var L = SPHERE_SHADERS[shader].params[key];
		if (typeof v !== 'number' || !isFinite(v)) return L.def;
		return Math.max(L.min, Math.min(L.max, v));
	}

	// fresh { shader: { key: def } } bag for every shader that has sliders.
	function sphereDefaults() {
		var out = {};
		for (var i = 0; i < SPHERE_SHADER_IDS.length; i++) {
			var id = SPHERE_SHADER_IDS[i], P = SPHERE_SHADERS[id].params, bag = {};
			for (var k in P) bag[k] = P[k].def;
			out[id] = bag;
		}
		return out;
	}

	// coerce a loaded bag: unknown shaders / keys dropped, missing ones at
	// their defaults, values clamped.
	function sanitizeSphereParams(v) {
		var d = sphereDefaults();
		if (!v || typeof v !== 'object') return d;
		for (var id in d) {
			var src = v[id];
			if (!src || typeof src !== 'object') continue;
			for (var k in d[id]) {
				if (typeof src[k] === 'number') d[id][k] = clampSphereParam(id, k, src[k]);
			}
		}
		return d;
	}

	// coerce a loaded flag to a real boolean. default-on fields stay ON for
	// every value except an explicit false / 0 (matches the old loader, which
	// only honored an actual boolean and treated numeric 0 as off).
	function boolOn(v) { return v !== false && v !== 0; }
	function boolOff(v) { return v === true || v === 1; }

	// ---- persisted app-state schema ------------------------------------
	// each entry:
	//   key    : field name in the saved `app` bag and on the live App
	//   def    : default value (also used by reset and missing-field fallback)
	//   persist: false = runtime-only (never saved); true = snapshotted
	//   alwaysApply: run the recipe even when the live value already matches
	//   get(App) : read the live value
	//   clean(v, s) : coerce a loaded value; return undefined to keep default
	//   apply(s, App, GUI) : push the sanitized value into live App + GUI
	// recipes call App.markDirty() (a public App method) rather than any
	// main.js-local function: this file has its own scope and cannot see
	// main.js locals.
	var APP_SCHEMA = [
		{
			key: 'mode', def: 'animate', persist: true, alwaysApply: true,
			get: function (A) { return A.mode; },
			clean: function (v) { return (v === 'animate' || v === 'whole') ? v : undefined; },
			apply: function (s, A, GUI) {
				// alwaysApply: the same-mode branch still re-syncs the GUI mode
				// buttons + color mode (mirrors the old applyAppState).
				if (s.mode !== A.mode) A.setMode(s.mode);
				else { GUI.setMode(A.mode); GUI.setColorMode(A.colorMode); }
			}
		},
		{
			key: 'paused', def: false, persist: true,
			get: function (A) { return A.paused; },
			clean: function (v) { return boolOff(v); },
			apply: function (s, A, GUI) { A.paused = s.paused; GUI.setPaused(s.paused); }
		},
		{
			key: 'symmetry', def: false, persist: true,
			get: function (A) { return A.symmetry; },
			clean: function (v) { return boolOff(v); },
			apply: function (s, A, GUI) { A.symmetry = s.symmetry; GUI.setSymmetry(s.symmetry); }
		},
		{
			key: 'overlay', def: true, persist: true,
			get: function (A) { return A.overlay.on; },
			// overlay defaults ON: only an explicit false / 0 turns it off.
			clean: function (v) { return boolOn(v); },
			apply: function (s, A, GUI) {
				// runs only when the value differs: s.overlay true means
				// "becoming on", so the (now invalid) overlay must rebake.
				A.overlay.on = s.overlay;
				if (s.overlay) A.invalidateOverlay();
				GUI.setOverlay(s.overlay);
				A.markDirty();
			}
		},
		{
			key: 'maxPeriod', def: LIMITS.maxPeriod.def, persist: true,
			get: function (A) { return A.maxPeriod; },
			clean: function (v, s) {
				// legacy files carry `periodThreshold` (old skip-the-bake
				// limit); it maps onto the closure-search ceiling.
				var mp = (typeof v === 'number' && isFinite(v)) ? v : s.periodThreshold;
				if (typeof mp !== 'number' || !(mp > 0)) return undefined;
				return clamp('maxPeriod', mp);
			},
			// write the field directly + sync the slider; do NOT call
			// App.setMaxPeriod here (it would trigger a redundant recompute -
			// the caller runs afterSceneChange / loadObject which bakes once).
			apply: function (s, A, GUI) { A.maxPeriod = s.maxPeriod; GUI.setMaxPeriod(s.maxPeriod); }
		},
		{
			key: 'samplesPerTurn', def: LIMITS.samplesPerTurn.def, persist: true,
			get: function (A) { return A.samplesPerTurn; },
			clean: function (v) {
				if (typeof v !== 'number' || !(v > 0)) return undefined;
				return clamp('samplesPerTurn', v);
			},
			apply: function (s, A, GUI) { A.samplesPerTurn = s.samplesPerTurn; GUI.setSamplesPerTurn(s.samplesPerTurn); }
		},
		{
			key: 'showCircles', def: true, persist: true,
			get: function (A) { return A.showCircles; },
			clean: function (v) { return boolOn(v); },
			apply: function (s, A, GUI) { A.showCircles = s.showCircles; GUI.setShowCircles(s.showCircles); A.markDirty(); }
		},
		{
			key: 'showDial', def: false, persist: true,
			get: function (A) { return A.showDial; },
			clean: function (v) { return boolOff(v); },
			apply: function (s, A, GUI) { A.showDial = s.showDial; GUI.setShowDial(s.showDial); A.markDirty(); }
		},
		{
			key: 'showPoints', def: false, persist: true,
			get: function (A) { return A.showPoints; },
			clean: function (v) { return boolOff(v); },
			apply: function (s, A, GUI) { A.showPoints = s.showPoints; GUI.setShowPoints(s.showPoints); A.markDirty(); }
		},
		{
			key: 'glowPoints', def: false, persist: true,
			get: function (A) { return A.glowPoints; },
			clean: function (v) { return boolOff(v); },
			apply: function (s, A, GUI) { A.glowPoints = s.glowPoints; GUI.setGlow(s.glowPoints); A.markDirty(); }
		},
		{
			key: 'drawTrails', def: true, persist: true,
			get: function (A) { return A.drawTrails; },
			clean: function (v) { return boolOn(v); },
			apply: function (s, A, GUI) {
				A.drawTrails = s.drawTrails;
				if (s.drawTrails && A.overlay.on) A.invalidateOverlay();
				GUI.setDrawTrails(s.drawTrails);
				A.markDirty();
			}
		},
		// glass sphere shells over the gear discs (view-only option; spheres
		// draw live every frame, so no overlay re-bake is needed).
		{
			key: 'sphereShader', def: 'off', persist: true,
			get: function (A) { return A.sphereShader; },
			clean: function (v, s) {
				if (SPHERE_SHADERS[v]) return v;
				// legacy 0.7.2 bag: boolean `spheres` toggle
				if (s && (s.spheres === true || s.spheres === 1)) return 'hollow';
				return undefined;
			},
			apply: function (s, A, GUI) { A.sphereShader = s.sphereShader; GUI.setSphereShader(s.sphereShader); A.markDirty(); }
		},
		{
			key: 'sphereColor', def: '#9fd8ff', persist: true,
			get: function (A) { return A.sphereColor; },
			clean: function (v) {
				return (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) ? v.toLowerCase() : undefined;
			},
			apply: function (s, A, GUI) { A.sphereColor = s.sphereColor; GUI.setSphereColor(s.sphereColor); A.markDirty(); }
		},
		{
			// per-shader slider bags: { hollow: {wall, ior, ...}, layers: {...} }.
			// the default getter hands out a FRESH bag each call, so applyApp's
			// identity skip never fires for this field (alwaysApply).
			key: 'sphereParams', persist: true, alwaysApply: true,
			get def() { return sphereDefaults(); },
			get: function (A) { return A.sphereParams; },
			clean: function (v) { return sanitizeSphereParams(v); },
			apply: function (s, A, GUI) { A.sphereParams = s.sphereParams; GUI.setSphereParams(s.sphereParams); A.markDirty(); }
		}
	];

	// fresh app-state bag with every field at its default.
	function defaultApp() {
		var d = {};
		for (var i = 0; i < APP_SCHEMA.length; i++) d[APP_SCHEMA[i].key] = APP_SCHEMA[i].def;
		return d;
	}

	// coerce an untrusted loaded bag (missing/null/partial, legacy fields)
	// into a complete, in-range app-state bag.
	function sanitizeApp(s) {
		var d = defaultApp();
		if (!s || typeof s !== 'object') return d;
		for (var i = 0; i < APP_SCHEMA.length; i++) {
			var f = APP_SCHEMA[i];
			var v = f.clean(s[f.key], s);
			if (v !== undefined) d[f.key] = v;
		}
		return d;
	}

	// snapshot the persisted fields off the live App (save / autosave).
	function snapshotApp(App) {
		var bag = {};
		for (var i = 0; i < APP_SCHEMA.length; i++) {
			var f = APP_SCHEMA[i];
			if (f.persist) bag[f.key] = f.get(App);
		}
		return bag;
	}

	// push a loaded/reset bag into the live App + GUI. sanitizes first, then
	// skips fields already matching (unless alwaysApply). the caller owns the
	// post-load bake (loadObject / init / resetScene call afterSceneChange).
	function applyApp(raw, App, GUI) {
		var s = sanitizeApp(raw);
		for (var i = 0; i < APP_SCHEMA.length; i++) {
			var f = APP_SCHEMA[i];
			if (!f.alwaysApply && f.get(App) === s[f.key]) continue;
			f.apply(s, App, GUI);
		}
	}

	var Settings = {
		STORE_KEY: STORE_KEY,
		LIMITS: LIMITS,
		APP_SCHEMA: APP_SCHEMA,
		clamp: clamp,
		SPHERE_SHADERS: SPHERE_SHADERS,
		SPHERE_SHADER_IDS: SPHERE_SHADER_IDS,
		clampSphereParam: clampSphereParam,
		sphereDefaults: sphereDefaults,
		sanitizeSphereParams: sanitizeSphereParams,
		defaultApp: defaultApp,
		sanitizeApp: sanitizeApp,
		snapshotApp: snapshotApp,
		applyApp: applyApp
	};

	root.Settings = Settings;
	if (typeof module !== 'undefined' && module.exports) module.exports = Settings;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
