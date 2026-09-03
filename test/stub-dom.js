// test/stub-dom.js - minimal DOM + WebGL2 stubs so the real app boots in node.
// no build step, no dependencies: the four browser files are eval'd into one
// shared sandbox exactly like index.html loads them.
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

function makeClassList(node) {
	var set = {};
	return {
		add: function (c) { set[c] = 1; node.className = Object.keys(set).join(' '); },
		remove: function (c) { delete set[c]; node.className = Object.keys(set).join(' '); },
		toggle: function (c, on) { if (on) this.add(c); else this.remove(c); },
		contains: function (c) { return !!set[c]; }
	};
}

function makeEl(tag) {
	var node = {
		tagName: (tag || 'div').toUpperCase(),
		style: {}, children: [], listeners: {},
		className: '', textContent: '', value: '', checked: false, disabled: false,
		offsetWidth: 240, offsetHeight: 320,
		firstChild: null
	};
	node.classList = makeClassList(node);
	node.appendChild = function (c) {
		node.children.push(c);
		if (!node.firstChild) node.firstChild = c;
		if (c && c.nodeType === 3 && !node.firstChild.nodeType) node.firstChild = c;
		return c;
	};
	node.removeChild = function (c) {
		var i = node.children.indexOf(c);
		if (i >= 0) node.children.splice(i, 1);
		node.firstChild = node.children[0] || null;
		return c;
	};
	node.replaceChild = function (neu, old) {
		var i = node.children.indexOf(old);
		if (i >= 0) node.children[i] = neu;
		node.firstChild = node.children[0] || null;
		return old;
	};
	node.addEventListener = function (t, fn) { (node.listeners[t] = node.listeners[t] || []).push(fn); };
	node.removeEventListener = function () { };
	node.dispatch = function (t, ev) {
		var ls = node.listeners[t] || [];
		for (var i = 0; i < ls.length; i++) ls[i](ev || {});
	};
	node.getBoundingClientRect = function () { return { left: 0, top: 0, width: 600, height: 600 }; };
	node.setPointerCapture = function () { };
	node.releasePointerCapture = function () { };
	node.click = function () { node.dispatch('click', {}); };
	node.getContext = function () { return glStub(); };
	Object.defineProperty(node, 'innerHTML', {
		get: function () { return ''; },
		set: function () { node.children.length = 0; node.firstChild = null; }
	});
	return node;
}

// every gl call returns a truthy handle; status queries return true.
function glStub() {
	var target = {
		getProgramParameter: function () { return true; },
		getShaderParameter: function () { return true; },
		getUniformLocation: function () { return {}; },
		getAttribLocation: function () { return 0; },
		getParameter: function () { return 4096; },
		checkFramebufferStatus: function () { return 36053; },
		FRAMEBUFFER_COMPLETE: 36053
	};
	return new Proxy(target, {
		get: function (t, k) {
			if (k in t) return t[k];
			if (typeof k !== 'string') return undefined;
			if (k === k.toUpperCase()) { t[k] = 1; return 1; }      // gl constants
			t[k] = function () { return {}; };
			return t[k];
		}
	});
}

function boot(opts) {
	opts = opts || {};
	var byId = {
		c: makeEl('canvas'), panel: makeEl('div'), ctxmenu: makeEl('div'), toast: makeEl('div')
	};
	var frames = [];
	var timers = [];
	function sbSetTimeout(fn, ms) { var id = timers.length; timers.push({ fn: fn, due: Date.now() + (ms || 0), id: id }); return id; }
	function sbClearTimeout(id) { if (timers[id]) timers[id] = null; }
	// run every scheduled sandbox timer whose time has come (drives the
	// debounced autosave / wheel / refine paths deterministically in tests).
	function flushTimers(waitMs) {
		var horizon = Date.now() + (waitMs || 0);
		for (var i = 0; i < timers.length; i++) {
			var t = timers[i];
			if (t && t.due <= horizon) { timers[i] = null; t.fn(); }
		}
	}
	var sandbox = {
		console: console,
		Math: Math, Date: Date, JSON: JSON, Float32Array: Float32Array, Uint16Array: Uint16Array,
		setTimeout: sbSetTimeout, clearTimeout: sbClearTimeout,
		flushTimers: flushTimers,
		performance: { now: function () { return Date.now(); } },
		navigator: { clipboard: null },
		localStorage: opts.autosave === false ? null : {
			_d: {},
			getItem: function (k) { return this._d[k] || null; },
			setItem: function (k, v) { this._d[k] = v; },
			removeItem: function (k) { delete this._d[k]; }
		},
		requestAnimationFrame: function (fn) { frames.push(fn); return frames.length; },
		devicePixelRatio: 1, innerWidth: 900, innerHeight: 700
	};
	sandbox.addEventListener = function () { };
	sandbox.removeEventListener = function () { };
	sandbox.window = sandbox;
	sandbox.globalThis = sandbox;
	sandbox.document = {
		readyState: 'complete',
		body: makeEl('body'),
		activeElement: null,
		getElementById: function (id) { return byId[id] || null; },
		createElement: makeEl,
		createTextNode: function (t) { return { nodeType: 3, nodeValue: t, textContent: t }; },
		addEventListener: function () { }
	};
	sandbox.document.body.innerHTML = '';
	vm.createContext(sandbox);
	var root = path.join(__dirname, '..');
	function load(f) { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f }); }
	['js/settings.js', 'js/gear.js', 'js/render.js', 'js/camera3.js'].forEach(load);
	// segment tap: main.js hoists R.seg into a local at load time, so the
	// wrapper must be installed BEFORE main.js runs. every seg call (trail
	// and guides alike) lands in sandbox.segLog while sandbox.segTrace is on;
	// each entry is [x0, y0, x1, y1, identity] with identity = true when the
	// 3D trail draw had its identity transform installed (cx0 === 0).
	sandbox.segLog = [];
	sandbox.segTrace = false;
	var realSeg = sandbox.R.seg;
	sandbox.R.seg = function (x0, y0, x1, y1) {
		if (sandbox.segTrace) sandbox.segLog.push([x0, y0, x1, y1, sandbox.App ? sandbox.App.cx0 === 0 : false]);
		return realSeg.apply(this, arguments);
	};
	['js/gui.js', 'js/main.js'].forEach(load);
	// run pending rAF callbacks n times (drives the frame loop by hand).
	// the frame timestamp is a monotonic sandbox clock advancing dtMs per
	// tick, so every tick is a real dt (two ticks in the same wall-clock
	// millisecond used to yield dt = 0: no rotation, no new trail point).
	var clock = Date.now();
	sandbox.tick = function (n, dtMs) {
		for (var i = 0; i < (n || 1); i++) {
			clock += (dtMs || 16);
			var due = frames.splice(0, frames.length);
			for (var j = 0; j < due.length; j++) due[j](clock);
		}
	};
	sandbox.byId = byId;
	return sandbox;
}

module.exports = { boot: boot, makeEl: makeEl };
