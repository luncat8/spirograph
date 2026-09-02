// js/gui.js - global panel + per-gear context menu + scene save/load UI
// classic <script>; guards module.exports for node.

(function (root) {
	'use strict';

	var app = null;
	var menu = null;       // context menu element
	var panel = null;
	var autosaveLabel = null;
	var currentGear = null;
	var pauseBtn = null;
	var modeBtns = {};
	var colorModeBtns = {};
	var periodLine = null;
	// checkbox refs so applyAppState() can sync the UI when a scene with a saved
	// "app" state is loaded (or when the reset button restores defaults).
	var checkboxRefs = {};
	var sliderRefs = {};   // dit for range inputs
	// reference into the open per-gear menu so refreshAnimMode() can relabel the
	// anim-speed slider prefix after the global color mode changes.
	var speedLabRefresh = null;
	// level-slider host + persistent rows: values are written into the live
	// inputs (rebuilding them mid-drag would detach an active range input and
	// kill the drag).
	var levelsHost = null;
	var levelRows = [];
	var resetLevelsBtn = null;

	function el(tag, cls, txt) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (txt != null) e.textContent = txt;
		return e;
	}

	function sliderRow(label, min, max, step, value, onInput, snap, key) {
		var wrap = el('div', 'row');
		var lab = el('label', null, label + ' ');
		var val = el('span', 'val', fmt(value));
		var inp = document.createElement('input');
		inp.type = 'range';
		inp.min = min; inp.max = max; inp.step = step; inp.value = value;
		inp.addEventListener('input', function () {
			var v = parseFloat(inp.value);
			if (snap) { v = snap(v); inp.value = v; }
			val.textContent = fmt(v);
			onInput(v);
		});
		lab.appendChild(inp);
		lab.appendChild(val);
		wrap.appendChild(lab);
		if (key) sliderRefs[key] = { input: inp, val: val };
		return wrap;
	}

	function fmt(v) { return (Math.round(v * 1000) / 1000).toString(); }

	function checkboxRow(label, checked, onChange, key) {
		var wrap = el('div', 'row');
		var lab = el('label', null, label);
		var inp = document.createElement('input');
		inp.type = 'checkbox';
		inp.checked = checked;
		inp.addEventListener('change', function () { onChange(inp.checked); });
		wrap.appendChild(lab);
		wrap.appendChild(inp);
		if (key) checkboxRefs[key] = inp;
		return wrap;
	}

	function colorRow(label, value, onChange) {
		var wrap = el('div', 'row');
		var lab = el('label', null, label);
		var inp = document.createElement('input');
		inp.type = 'color';
		inp.value = value;
		inp.addEventListener('input', function () { onChange(inp.value); });
		wrap.appendChild(lab);
		wrap.appendChild(inp);
		return wrap;
	}

	function colorCheckRow(label, checkVal, colorVal, onCheck, onColor) {
		var wrap = el('div', 'row');
		var chk = document.createElement('input');
		chk.type = 'checkbox';
		chk.checked = checkVal;
		chk.addEventListener('change', function () { onCheck(chk.checked); });
		var lab = el('label', null, label);
		var inp = document.createElement('input');
		inp.type = 'color';
		inp.value = colorVal;
		inp.addEventListener('input', function () { onColor(inp.value); });
		wrap.appendChild(chk);
		wrap.appendChild(lab);
		wrap.appendChild(inp);
		return wrap;
	}

	function buttonRow(text, fn) {
		var b = el('button', 'btn', text);
		b.addEventListener('click', fn);
		return b;
	}

	function init(a) {
		app = a;
		panel = document.getElementById('panel');
		menu = document.getElementById('ctxmenu');
		buildPanel();
	}

	function buildPanel() {
		panel.innerHTML = '';
		checkboxRefs = {};
		sliderRefs = {};
		var title = el('div', 'ptitle', 'Spirograph');
		panel.appendChild(title);

		var btns = el('div', 'btns');
		pauseBtn = buttonRow(app.paused ? 'play (space)' : 'pause (space)', function () { app.togglePause(); });
		btns.appendChild(pauseBtn);
		btns.appendChild(buttonRow('clear (c)', function () { app.clearTraces(); }));
		btns.appendChild(buttonRow('reset (x)', function () { app.resetScene(); }));
		panel.appendChild(btns);

		panel.appendChild(sliderRow('anim speed', 0, 30, 0.01, app.globalSpeed, function (v) {
			app.globalSpeed = v;
			app.markDirty();
		}, null, 'globalSpeed'));

		// trace mode: animate / whole (exclusive switch)
		var modeWrap = el('div', 'btns');
		function modeBtn(label, m) {
			var b = buttonRow(label, function () { app.setMode(m); });
			modeBtns[m] = b; modeWrap.appendChild(b);
		}
		modeBtn('Animate', 'animate');
		modeBtn('Whole', 'whole');
		panel.appendChild(modeWrap);

		// color animation mode is GLOBAL (applies to every pencil). auto-switches
		// with the trace mode (frequency in animate, cycles in whole) but the
		// user can override at any time.
		panel.appendChild(el('div', 'sub', 'color mode'));
		var cmWrap = el('div', 'btns');
		function colorModeBtn(label, m) {
			var b = buttonRow(label, function () { app.setColorMode(m); });
			colorModeBtns[m] = b; cmWrap.appendChild(b);
		}
		colorModeBtn('cycles', 'cycles');
		colorModeBtn('frequency', 'frequency');
		panel.appendChild(cmWrap);

		periodLine = el('div', 'sub', '');
		periodLine.style.display = 'none';
		panel.appendChild(periodLine);

		panel.appendChild(checkboxRow('bake full figure (overlay)', app.overlay.on, function (v) {
			app.setOverlay(v);
		}, 'overlay'));

		// view toggles (independent checkboxes, combinable)
		panel.appendChild(checkboxRow('circles', app.showCircles, function (v) { app.setShowCircles(v); }, 'showCircles'));
		panel.appendChild(checkboxRow('dial', app.showDial, function (v) { app.setShowDial(v); }, 'showDial'));
		panel.appendChild(checkboxRow('draw trail', app.drawTrails, function (v) { app.setDrawTrails(v); }, 'drawTrails'));
		panel.appendChild(checkboxRow('points', app.showPoints, function (v) { app.setShowPoints(v); }, 'showPoints'));
		panel.appendChild(checkboxRow('glow points', app.glowPoints, function (v) { app.setGlow(v); }, 'glowPoints'));
		panel.appendChild(el('div', 'help',
			'Uncheck "draw trail" to hide the traced curve (points-only view).'));

		// gear tree: level sliders grow every parent at a depth by the same
		// child count, radially spaced; symmetry mirrors menu edits per level.
		panel.appendChild(el('div', 'sub', 'tree'));
		panel.appendChild(checkboxRow('symmetry mode', app.symmetry, function (v) {
			app.symmetry = v;
		}, 'symmetry'));
		panel.appendChild(el('div', 'help',
			'When ON, menu edits apply to every sibling at the same level. Add-sub-gear grows the whole level.'));
		levelsHost = el('div', 'levels');
		levelRows.length = 0;
		panel.appendChild(levelsHost);
		var treeBtns = el('div', 'btns');
		resetLevelsBtn = buttonRow('reset levels', function () {
			var maxD = app.maxDepth(app.roots);
			for (var l = 1; l <= maxD; l++) app.applyLevel(l, 1);
		});
		resetLevelsBtn.style.display = 'none';
		treeBtns.appendChild(resetLevelsBtn);
		panel.appendChild(treeBtns);
		panel.appendChild(el('div', 'help',
			'lvl k = uniform child count for every parent at that depth. Positions are i * 360/N degrees.'));

		panel.appendChild(el('div', 'sub', 'whole mode'));
		panel.appendChild(sliderRow('period threshold', 50, 2000, 50, app.periodThreshold, function (v) {
			app.setPeriodThreshold(v);
		}, null, 'periodThreshold'));
		panel.appendChild(el('div', 'help',
			'Skip the bake when the period exceeds this many turns.'));

		var sval = el('div', 'sub', 'scene');
		panel.appendChild(sval);
		var sbtns = el('div', 'btns');
		sbtns.appendChild(buttonRow('copy (s)', function () { app.copyScene(); }));
		sbtns.appendChild(buttonRow('save (d)', function () { app.downloadScene(); }));
		sbtns.appendChild(buttonRow('open (o)', function () { app.loadFile(); }));
		sbtns.appendChild(buttonRow('paste (p)', function () { app.loadClipboard(); }));
		panel.appendChild(sbtns);

		autosaveLabel = el('div', 'auto', 'autosave: on');
		panel.appendChild(autosaveLabel);

		var help = el('div', 'help',
			'space pause - wheel zoom - drag pan - click gear to edit - rmb browser menu - Esc close');
		panel.appendChild(help);

		GUI.setMode(app.mode);
		GUI.setColorMode(app.colorMode || 'frequency');
		rebuildLevels();
	}

	function makeLevelRow(L) {
		var wrap = sliderRow('lvl ' + L, 1, 12, 1, 1, function (v) {
			app.applyLevel(L, v);
		});
		if (L > 1) wrap.classList.add('lvl-indent');
		levelsHost.appendChild(wrap);
		return { wrap: wrap, input: wrap.querySelector('input'), val: wrap.querySelector('.val') };
	}

	function rebuildLevels() {
		if (!levelsHost) return;
		var need = Math.max(1, app.maxDepth(app.roots) + 1);
		while (levelRows.length > need) levelsHost.removeChild(levelRows.pop().wrap);
		while (levelRows.length < need) levelRows.push(makeLevelRow(levelRows.length + 1));
		for (var i = 0; i < levelRows.length; i++) {
			var n = app.levelCount(i + 1);
			levelRows[i].input.value = n;
			levelRows[i].val.textContent = n;
		}
		resetLevelsBtn.style.display = need > 1 ? '' : 'none';
	}

	function setPaused(p) {
		if (!pauseBtn) return;
		pauseBtn.textContent = p ? 'play (space)' : 'pause (space)';
	}

	function setAutosave(ok) {
		if (!autosaveLabel) return;
		autosaveLabel.textContent = ok ? 'autosave: on' : 'autosave: unavailable';
		autosaveLabel.className = ok ? 'auto' : 'auto bad';
	}

	function attachDragHandle(handle, target) {
		var pid = null, offX = 0, offY = 0;
		function down(e) {
			pid = e.pointerId;
			var r = target.getBoundingClientRect();
			offX = e.clientX - r.left;
			offY = e.clientY - r.top;
			handle.setPointerCapture(pid);
			e.stopPropagation();
			e.preventDefault();
		}
		function move(e) {
			if (e.pointerId !== pid) return;
			var x = Math.max(8, Math.min(window.innerWidth - 40, e.clientX - offX));
			var y = Math.max(8, Math.min(window.innerHeight - 24, e.clientY - offY));
			target.style.left = x + 'px';
			target.style.top = y + 'px';
		}
		function up(e) { if (e.pointerId === pid) pid = null; }
		handle.addEventListener('pointerdown', down);
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', up);
		handle.addEventListener('pointercancel', up);
	}

	function openMenu(gear, clientX, clientY) {
		currentGear = gear;
		menu.innerHTML = '';
		var title = el('div', 'ptitle drag');
		title.appendChild(document.createTextNode(gear.parent ? 'Gear ' : 'Main gear '));
		title.appendChild(document.createTextNode('\u2725 '));
		attachDragHandle(title, menu);
		menu.appendChild(title);

		menu.appendChild(checkboxRow('internal (roll inside parent)', gear.internal, function (v) {
			gear.internal = v; app.applySymmetry(gear, 'geom'); app.onGearParam(gear, 'geom');
		}));

		menu.appendChild(sliderRow('diameter', 0.04, 2.0, 0.01, gear.r * 2, function (v) {
			gear.r = v / 2; app.applySymmetry(gear, 'geom'); app.onGearParam(gear, 'geom');
		}));

		menu.appendChild(sliderRow('speed', -1, 1, 0.01, gear.speed, function (v) {
			gear.speed = v; app.applySymmetry(gear, 'geom'); app.onGearParam(gear, 'geom');
		}, function (v) { return app.mode === 'whole' ? app.snapNice(v) : v; }));

		menu.appendChild(sliderRow('pencil d', 0, 1, 0.01, gear.pencil.d, function (v) {
			gear.pencil.d = v; app.applySymmetry(gear, 'geom'); app.onGearParam(gear, 'geom');
		}));

		menu.appendChild(sliderRow('pencil width', 0.5, 12, 0.5, gear.pencil.width, function (v) {
			gear.pencil.width = v; app.applySymmetry(gear, 'width'); app.onGearParam(gear, 'width');
		}));

		menu.appendChild(colorCheckRow('color 1', gear.pencil.c1.on, gear.pencil.c1.color,
			function (v) { gear.pencil.c1.on = v; app.applySymmetry(gear, 'color'); app.onGearParam(gear, 'color'); },
			function (v) { gear.pencil.c1.color = v; app.applySymmetry(gear, 'color'); app.onGearParam(gear, 'color'); }));

		menu.appendChild(colorCheckRow('color 2', gear.pencil.c2.on, gear.pencil.c2.color,
			function (v) { gear.pencil.c2.on = v; app.applySymmetry(gear, 'color'); app.onGearParam(gear, 'color'); },
			function (v) { gear.pencil.c2.color = v; app.applySymmetry(gear, 'color'); app.onGearParam(gear, 'color'); }));

		var speedRow = sliderRow('speed', 0, 4, 0.01, gear.pencil.animSpeed, function (v) {
			gear.pencil.animSpeed = v; app.applySymmetry(gear, 'color'); app.onGearParam(gear, 'color');
		});
		var speedLab = speedRow.firstChild;
		// prefix follows the GLOBAL color mode (cycles/frequency panel toggle).
		// in whole mode both formulas share the same slider value (hue cycles per
		// closed period), so the prefix is identical regardless of color mode.
		speedLabRefresh = function () {
			var cm = app.colorMode || 'frequency';
			speedLab.firstChild.nodeValue = app.mode === 'whole' ? 'hue cycles ' : (cm === 'frequency' ? 'hue/sec ' : 'cycles ');
		};
		speedLabRefresh();
		menu.appendChild(speedRow);

		menu.appendChild(sliderRow('trail length', 500, Gear.CAP, 500, gear.trailCap, function (v) {
			app.setTrailCap(gear, v);
			app.applySymmetry(gear, 'trail');
			app.onGearParam(gear, 'trail');
		}));
		menu.appendChild(el('div', 'help',
			'soft cap on stored points per pencil (animate mode). period threshold is in the sidebar.'));

		var gb = el('div', 'btns');
		gb.appendChild(buttonRow('add sub-gear', function () {
			// symmetry: add-sub-gear grows the whole level (every same-depth
			// parent gains one child), instead of just this gear.
			if (app.symmetry) {
				var depth = app.depthOf(app.roots, gear);
				if (depth >= 0) { app.applyLevel(depth + 1, gear.children.length + 1); return; }
			}
			app.addSubGear(gear);
		}));
		var rm = buttonRow('remove', function () { app.removeGear(gear); });
		if (!gear.parent) rm.disabled = true;
		gb.appendChild(rm);
		gb.appendChild(buttonRow('close', function () { closeMenu(); }));
		menu.appendChild(gb);

		menu.classList.remove('hidden');
		// position, clamped to viewport
		var mw = menu.offsetWidth || 240;
		var mh = menu.offsetHeight || 320;
		var x = Math.min(clientX, window.innerWidth - mw - 8);
		var y = Math.min(clientY, window.innerHeight - mh - 8);
		menu.style.left = Math.max(8, x) + 'px';
		menu.style.top = Math.max(8, y) + 'px';
	}

	function closeMenu() {
		menu.classList.add('hidden');
		currentGear = null;
		speedLabRefresh = null;
	}

	function isMenuOpen() { return currentGear != null; }

	var GUI = {
		init: init,
		openMenu: openMenu,
		closeMenu: closeMenu,
		isMenuOpen: isMenuOpen,
		menuGear: function () { return currentGear; },
		rebuildLevels: rebuildLevels,
		setAutosave: setAutosave,
		setPaused: setPaused,
		setMode: function (m) {
			for (var key in modeBtns) modeBtns[key].classList.toggle('active', key === m);
			if (periodLine) periodLine.style.display = (m === 'whole') ? '' : 'none';
		},
		setColorMode: function (m) {
			for (var key in colorModeBtns) colorModeBtns[key].classList.toggle('active', key === m);
		},
		setPeriod: function (turns, capped) {
			if (!periodLine) return;
			periodLine.textContent = 'period: ' + turns + ' turn' + (turns === 1 ? '' : 's') + (capped ? ' (capped)' : '');
		},
		// ---- setters that sync a checkbox/range input with a saved app value ----
		// called by App.applyAppState when loading a scene with a saved app bag
		// (or by App.resetScene when restoring defaults). They update the DOM
		// without re-firing the input handlers, then notify the App so the
		// overlay/state is consistent.
		setSymmetry: function (v) { if (checkboxRefs.symmetry) checkboxRefs.symmetry.checked = v; },
		setOverlay: function (v) { if (checkboxRefs.overlay) checkboxRefs.overlay.checked = v; },
		setShowCircles: function (v) { if (checkboxRefs.showCircles) checkboxRefs.showCircles.checked = v; },
		setShowDial: function (v) { if (checkboxRefs.showDial) checkboxRefs.showDial.checked = v; },
		setShowPoints: function (v) { if (checkboxRefs.showPoints) checkboxRefs.showPoints.checked = v; },
		setGlow: function (v) { if (checkboxRefs.glowPoints) checkboxRefs.glowPoints.checked = v; },
		setDrawTrails: function (v) { if (checkboxRefs.drawTrails) checkboxRefs.drawTrails.checked = v; },
		setGlobalSpeed: function (v) {
			var r = sliderRefs.globalSpeed; if (!r) return;
			r.input.value = v; r.val.textContent = fmt(v);
		},
		setPeriodThreshold: function (v) {
			var r = sliderRefs.periodThreshold; if (!r) return;
			r.input.value = v; r.val.textContent = fmt(v);
		},
		// relabel the open menu's anim-speed slider prefix (color mode or trace
		// mode changed while the menu is open).
		refreshAnimMode: function () {
			if (!currentGear) return;
			if (speedLabRefresh) speedLabRefresh();
		}
	};

	root.GUI = GUI;
	if (typeof module !== 'undefined' && module.exports) module.exports = GUI;
})(typeof window !== 'undefined' ? window : this);
