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
	var periodLine = null;
	// references into the open per-gear menu so refreshAnimMode() can sync the
	// cycles/frequency toggle + slider prefix after App.setMode auto-switches
	// animMode on every pencil.
	var speedRowModeBtns = null;
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

		var modeWrap = el('div', 'btns');
		var cyclesBtn = buttonRow('cycles', function () { setModeBtn('cycles'); });
		var freqBtn = buttonRow('frequency', function () { setModeBtn('frequency'); });
		var animBtns = { cycles: cyclesBtn, frequency: freqBtn };
		speedRowModeBtns = animBtns;
		modeWrap.appendChild(cyclesBtn);
		modeWrap.appendChild(freqBtn);
		menu.appendChild(modeWrap);

		var speedRow = sliderRow('speed', 0, 4, 0.01, gear.pencil.animSpeed, function (v) {
			gear.pencil.animSpeed = v; app.onGearParam(gear, 'color');
		});
		var speedLab = speedRow.firstChild;
		// in whole mode both formulas use the same slider value (hue cycles per
		// closed period), so the prefix is identical regardless of animMode.
		speedLabRefresh = function () {
			speedLab.firstChild.nodeValue = app.mode === 'whole' ? 'hue cycles ' : (gear.pencil.animMode === 'frequency' ? 'hue/sec ' : 'cycles ');
		};
		for (var k in animBtns) animBtns[k].classList.toggle('active', k === (gear.pencil.animMode || 'cycles'));
		function setModeBtn(m) {
			gear.pencil.animMode = m;
			for (var k in animBtns) animBtns[k].classList.toggle('active', k === m);
			speedLabRefresh();
			app.onGearParam(gear, 'color');
		}
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
		speedRowModeBtns = null;
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
		setPeriod: function (turns, capped) {
			if (!periodLine) return;
			periodLine.textContent = 'period: ' + turns + ' turn' + (turns === 1 ? '' : 's') + (capped ? ' (capped)' : '');
		},
		// sync the per-pencil cycles/frequency toggle + slider prefix to the
		// pencil's current animMode (after App.setMode auto-switched them).
		refreshAnimMode: function () {
			if (!currentGear) return;
			var p = currentGear.pencil;
			var m = p.animMode || 'cycles';
			var btns = speedRowModeBtns;
			if (btns) for (var k in btns) btns[k].classList.toggle('active', k === m);
			if (speedLabRefresh) speedLabRefresh();
		}
	};

	root.GUI = GUI;
	if (typeof module !== 'undefined' && module.exports) module.exports = GUI;
})(typeof window !== 'undefined' ? window : this);
