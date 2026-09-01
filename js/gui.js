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
	// reference into the open per-gear menu so refreshAnimMode() can relabel the
	// anim-speed slider prefix after the global color mode changes.
	var speedLabRefresh = null;

	function el(tag, cls, txt) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (txt != null) e.textContent = txt;
		return e;
	}

	function sliderRow(label, min, max, step, value, onInput, snap) {
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
		return wrap;
	}

	function fmt(v) { return (Math.round(v * 1000) / 1000).toString(); }

	function checkboxRow(label, checked, onChange) {
		var wrap = el('div', 'row');
		var lab = el('label', null, label);
		var inp = document.createElement('input');
		inp.type = 'checkbox';
		inp.checked = checked;
		inp.addEventListener('change', function () { onChange(inp.checked); });
		wrap.appendChild(lab);
		wrap.appendChild(inp);
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
		}));

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
		}));

		// view toggles (independent checkboxes, combinable)
		panel.appendChild(checkboxRow('circles', app.showCircles, function (v) { app.setShowCircles(v); }));
		panel.appendChild(checkboxRow('dial', app.showDial, function (v) { app.setShowDial(v); }));
		panel.appendChild(checkboxRow('draw trail', app.drawTrails, function (v) { app.setDrawTrails(v); }));
		panel.appendChild(checkboxRow('points', app.showPoints, function (v) { app.setShowPoints(v); }));
		panel.appendChild(checkboxRow('glow points', app.glowPoints, function (v) { app.setGlow(v); }));
		panel.appendChild(el('div', 'help',
			'Uncheck "draw trail" to hide the traced curve (points-only view).'));

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
			'space pause - wheel zoom - drag pan - click gear to edit - Esc close');
		panel.appendChild(help);

		GUI.setMode(app.mode);
		GUI.setColorMode(app.colorMode || 'frequency');
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

	function openMenu(gear, clientX, clientY) {
		currentGear = gear;
		menu.innerHTML = '';
		menu.appendChild(el('div', 'ptitle', gear.parent ? 'Gear' : 'Main gear'));

		menu.appendChild(checkboxRow('internal (roll inside parent)', gear.internal, function (v) {
			gear.internal = v; app.onGearParam(gear, 'geom');
		}));

		menu.appendChild(sliderRow('diameter', 0.04, 2.0, 0.01, gear.r * 2, function (v) {
			gear.r = v / 2; app.onGearParam(gear, 'geom');
		}));

		menu.appendChild(sliderRow('speed', -1, 1, 0.01, gear.speed, function (v) {
			gear.speed = v; app.onGearParam(gear, 'geom');
		}, function (v) { return app.mode === 'whole' ? app.snapNice(v) : v; }));

		menu.appendChild(sliderRow('pencil d', 0, 1, 0.01, gear.pencil.d, function (v) {
			gear.pencil.d = v; app.onGearParam(gear, 'geom');
		}));

		menu.appendChild(sliderRow('pencil width', 0.5, 12, 0.5, gear.pencil.width, function (v) {
			gear.pencil.width = v; app.onGearParam(gear, 'width');
		}));

		menu.appendChild(colorCheckRow('color 1', gear.pencil.c1.on, gear.pencil.c1.color,
			function (v) { gear.pencil.c1.on = v; app.onGearParam(gear, 'color'); },
			function (v) { gear.pencil.c1.color = v; app.onGearParam(gear, 'color'); }));

		menu.appendChild(colorCheckRow('color 2', gear.pencil.c2.on, gear.pencil.c2.color,
			function (v) { gear.pencil.c2.on = v; app.onGearParam(gear, 'color'); },
			function (v) { gear.pencil.c2.color = v; app.onGearParam(gear, 'color'); }));

		var speedRow = sliderRow('speed', 0, 4, 0.01, gear.pencil.animSpeed, function (v) {
			gear.pencil.animSpeed = v; app.onGearParam(gear, 'color');
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

		var gb = el('div', 'btns');
		gb.appendChild(buttonRow('add sub-gear', function () { app.addSubGear(gear); }));
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
