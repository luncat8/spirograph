// js/gui.js - global panel + per-gear context menu + scene save/load UI
// classic <script>; guards module.exports for node.

(function (root) {
	'use strict';

	var app = null;
	var menu = null;       // context menu element
	var panel = null;
	var autosaveLabel = null;
	var currentGear = null;
	var menuX = 0, menuY = 0;
	var pauseBtn = null;
	var modeBtns = {};
	var dimBtns = {};
	var colorModeBtns = {};
	var periodLine = null;
	var wholeBox = null;
	var dim3Box = null;          // 3D section (camera controls), hidden in 2D
	var helpLine = null;
	// checkbox refs so Settings.applyApp can sync the UI when a scene with a
	// saved "app" state is loaded (or when the reset button restores defaults).
	var checkboxRefs = {};
	var sliderRefs = {};   // dit for range inputs
	var colorRefs = {};    // dit for color inputs (sphere tint etc.)
	var selectRefs = {};   // dit for <select> inputs (glass shader)
	var sphereHost = null; // glass shader slider rows host
	var sphereRows = {};   // param key -> slider row of the selected shader
	var presetHost = null; // preset dropdown host (scene section), rebuilt in place
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

	function nearestIndex(list, v) {
		var bi = 0, bestErr = Infinity;
		for (var i = 0; i < list.length; i++) {
			var e = Math.abs(list[i] - v);
			if (e < bestErr) { bestErr = e; bi = i; }
		}
		return bi;
	}

	// a slider row. with `values` the input becomes an index over that list, so
	// the handle can only land on a valid value (whole mode uses it for speed
	// and diameter, where arbitrary reals mean an unclosable figure). snapping
	// the value after the fact instead fights the drag and hides the grid.
	function sliderRow(label, min, max, step, value, onInput, values, key) {
		var wrap = el('div', 'row');
		var lab = el('label', null, label + ' ');
		var val = el('span', 'val', fmt(value));
		var inp = document.createElement('input');
		inp.type = 'range';
		if (values && values.length) {
			inp.min = 0; inp.max = values.length - 1; inp.step = 1;
			inp.value = nearestIndex(values, value);
			val.textContent = fmt(values[nearestIndex(values, value)]);
			inp.addEventListener('input', function () {
				var v = values[parseInt(inp.value, 10)];
				val.textContent = fmt(v);
				onInput(v);
			});
		} else {
			inp.min = min; inp.max = max; inp.step = step; inp.value = value;
			inp.addEventListener('input', function () {
				var v = parseFloat(inp.value);
				val.textContent = fmt(v);
				onInput(v);
			});
		}
		lab.appendChild(inp);
		lab.appendChild(val);
		wrap.appendChild(lab);
		wrap.input = inp;
		wrap.valEl = val;
		wrap.labelEl = lab;
		wrap.values = values || null;
		if (key) sliderRefs[key] = { input: inp, val: val, values: values || null };
		return wrap;
	}

	// 3 significant digits, not 3 decimals: log-scale values span decades and
	// fixed decimals flatten the low end (0.0107 and 0.0114 both read "0.011").
	function fmt(v) { return String(Number((+v).toPrecision(3))); }

	// round to 3 significant digits (keeps the low end of a log ladder
	// distinct: 0.0107 vs 0.0114).
	function sig3(v) {
		var mag = Math.pow(10, Math.floor(Math.log10(v)));
		return Math.round((v / mag) * 100) / 100 * mag;
	}

	// the one ladder behind every log-scale slider (max period, trail length,
	// auto-camera speeds): n index-slider values from min to max, rounded
	// (Math.round for counts, sig3 for rates), duplicates dropped - a
	// duplicate fires an input event that changes nothing (spurious re-bake /
	// edit). callers prepend 0 themselves when the value can mean "off".
	function logLadder(min, max, n, round) {
		var out = [];
		for (var i = 0; i < n; i++) {
			var v = round(min * Math.pow(max / min, i / (n - 1)));
			if (out[out.length - 1] !== v) out.push(v);
		}
		return out;
	}

	// sync a labeled slider (plain or ladder-mapped) from a loaded / reset
	// value without re-firing its input handler.
	function syncSlider(key, v) {
		var r = sliderRefs[key];
		if (!r) return;
		if (r.values) {
			var idx = nearestIndex(r.values, v);
			r.input.value = idx;
			r.val.textContent = fmt(r.values[idx]);
		} else {
			r.input.value = v;
			r.val.textContent = fmt(v);
		}
	}

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

	function colorRow(label, value, onChange, key) {
		var wrap = el('div', 'row');
		var lab = el('label', null, label);
		var inp = document.createElement('input');
		inp.type = 'color';
		inp.value = value;
		inp.addEventListener('input', function () { onChange(inp.value); });
		wrap.appendChild(lab);
		wrap.appendChild(inp);
		if (key) colorRefs[key] = inp;
		return wrap;
	}

	// a <select> row over a list of ids; labelOf(id) -> option text.
	function selectRow(label, ids, labelOf, value, onChange, key) {
		var wrap = el('div', 'row');
		var lab = el('label', null, label + ' ');
		var sel = document.createElement('select');
		for (var i = 0; i < ids.length; i++) {
			var opt = document.createElement('option');
			opt.value = ids[i];
			opt.textContent = labelOf(ids[i]);
			sel.appendChild(opt);
		}
		sel.value = value;
		sel.addEventListener('change', function () { onChange(sel.value); });
		lab.appendChild(sel);
		wrap.appendChild(lab);
		if (key) selectRefs[key] = sel;
		return wrap;
	}

	// preset dropdown: a placeholder option plus one option per preset
	// (default.js's PRESETS list, filled by presets_combine.py). after a pick
	// the selection falls back to the placeholder so the same preset can be
	// chosen twice in a row.
	function presetRow(names, onPick) {
		var wrap = el('div', 'row');
		var lab = el('label', null, 'preset ');
		var sel = document.createElement('select');
		var ph = document.createElement('option');
		ph.value = '';
		ph.textContent = 'load\u2026';
		sel.appendChild(ph);
		for (var i = 0; i < names.length; i++) {
			var o = document.createElement('option');
			o.value = names[i];
			o.textContent = names[i];
			sel.appendChild(o);
		}
		sel.value = '';
		sel.addEventListener('change', function () {
			var name = sel.value;
			sel.value = '';
			if (name) onPick(name);
		});
		lab.appendChild(sel);
		wrap.appendChild(lab);
		return wrap;
	}

	// fill the (always present) preset host: dropdown + help when presets
	// exist, nothing otherwise. re-runnable - opening a combined default.js
	// via open/paste adopts its preset list.
	function rebuildPresetRow() {
		if (!presetHost) return;
		presetHost.innerHTML = '';
		var presets = app.presets();
		if (!presets.length) return;
		var names = [];
		for (var i = 0; i < presets.length; i++) names.push(presets[i].name);
		presetHost.appendChild(presetRow(names, function (name) { app.loadPreset(name); }));
		presetHost.appendChild(el('div', 'help',
			'presets live in default.js: save scenes next to index.html, run presets_combine.py.'));
	}

	// slider rows of the selected glass shader (one per param in its table).
	// rebuilt on selection; values sync through setSphereParams.
	function rebuildSphereRows() {
		if (!sphereHost) return;
		sphereHost.innerHTML = '';
		sphereRows = {};
		var id = app.sphereShader;
		var P = Settings.SPHERE_SHADERS[id].params;
		var bag = app.sphereParams[id];
		Object.keys(P).forEach(function (k) {
			var L = P[k];
			var row = sliderRow(k, L.min, L.max, L.step, bag[k], function (v) { app.setSphereParam(k, v); });
			sphereRows[k] = row;
			sphereHost.appendChild(row);
		});
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
		colorRefs = {};

		var btns = el('div', 'btns');
		pauseBtn = buttonRow(app.paused ? 'play (space)' : 'pause (space)', function () { app.togglePause(); });
		btns.appendChild(pauseBtn);
		btns.appendChild(buttonRow('clear (c)', function () { app.clearTraces(); }));
		btns.appendChild(buttonRow('reset (x)', function () { app.resetScene(); }));
		panel.appendChild(btns);

		// dimension switch: 2D / 3D (g key). the 3D section below is shown only
		// in 3D mode (setDim toggles it).
		var dimWrap = el('div', 'btns');
		function dimBtn(label, d) {
			var b = buttonRow(label, function () { app.setDim(d); });
			dimBtns[d] = b; dimWrap.appendChild(b);
		}
		dimBtn('2D', '2d');
		dimBtn('3D', '3d');
		panel.appendChild(dimWrap);

		panel.appendChild(sliderRow('anim speed', 0, 30, 0.01, app.globalSpeed, function (v) {
			app.globalSpeed = v;
			app.markDirty();
		}, null, 'globalSpeed'));

		// 3D section: camera controls. the second rotation axis is PER GEAR -
		// each gear has its own tilt speed (speed2) in its edit menu; there is
		// no global spin. 0 on every gear reproduces the flat 2D figure.
		dim3Box = el('div');
		dim3Box.appendChild(el('div', 'sub', '3D'));
		dim3Box.appendChild(el('div', 'help',
			'Each gear spins about two axes: the in-plane speed plus a tilt speed ' +
			'(set it in a gear menu). drag an empty area to orbit the selected gear; ' +
			'0 tilt keeps the figure flat.'));
		dim3Box.appendChild(checkboxRow('auto-rotate camera', !!app.autoRotate, function (v) {
			app.setAutoRotate(v);
		}, 'autoRotate'));
		// auto-camera speeds, log scale, 0 = that axis stays still. pitch
		// drift bounces at the clamp (main.js), so a two-axis setting tours
		// the figure instead of pinning at the pole.
		var yawL = Settings.LIMITS.autoYaw, pitL = Settings.LIMITS.autoPitch;
		dim3Box.appendChild(sliderRow('auto yaw', yawL.min, yawL.max, 0.01, app.autoYaw, function (v) {
			app.setAutoYaw(v);
		}, [0].concat(logLadder(yawL.min, yawL.max, 100, sig3)), 'autoYaw'));
		dim3Box.appendChild(sliderRow('auto pitch', pitL.min, pitL.max, 0.01, app.autoPitch, function (v) {
			app.setAutoPitch(v);
		}, [0].concat(logLadder(pitL.min, pitL.max, 100, sig3)), 'autoPitch'));
		var cbtns = el('div', 'btns');
		cbtns.appendChild(buttonRow('fit view (f)', function () { app.fitView(); }));
		cbtns.appendChild(buttonRow('reset camera', function () { app.resetCamera(); }));
		dim3Box.appendChild(cbtns);
		panel.appendChild(dim3Box);

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

		// whole-mode box: live period readout (with bake progress) + the
		// closure-search ceiling. shown only in whole mode.
		wholeBox = el('div');
		periodLine = el('div', 'sub', '');
		wholeBox.appendChild(periodLine);
		// log-ish ladder of ceilings. duplicates are dropped: at the low end the
		// curve rounds several indices to the same value, and a drag across them
		// used to fire onInput with an unchanged value (a re-bake of the identical
		// figure - visible as a canvas flicker).
		var mpL = Settings.LIMITS.maxPeriod;
		wholeBox.appendChild(sliderRow('max period', mpL.min, mpL.max, mpL.step, app.maxPeriod, function (v) {
			app.setMaxPeriod(v);
		}, logLadder(mpL.min, mpL.max, 100, Math.round), 'maxPeriod'));
		wholeBox.appendChild(el('div', 'help',
			'UPPER LIMIT of the closure search, not a target: the readout shows the ' +
			'SMALLEST turn count that closes the figure, which for gear ratios on the ' +
			'whole-mode grid is usually far below the limit. lower it to cut a long ' +
			'figure short (drawn as ~approx), raise it to let a long one close.'));
		var spL = Settings.LIMITS.samplesPerTurn;
		wholeBox.appendChild(sliderRow('detail', spL.min, spL.max, spL.step, app.samplesPerTurn, function (v) {
			app.setSamplesPerTurn(v);
		}, null, 'samplesPerTurn'));
		wholeBox.appendChild(el('div', 'help',
			'points per turn of the baked curve - this is the smoothness knob ' +
			'(period x detail points, capped at ' + Settings.LIMITS.trailCap.max + ' per pencil).'));
		panel.appendChild(wholeBox);

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

		// glass sphere shells over the gear discs: a selector picks the ray
		// tracer (render.js), the slider rows below it are rebuilt per shader
		// from Settings.SPHERE_SHADERS (each shader keeps its own bag).
		panel.appendChild(el('div', 'sub', 'spheres'));
		panel.appendChild(selectRow('glass shader', Settings.SPHERE_SHADER_IDS, function (id) {
			return Settings.SPHERE_SHADERS[id].label;
		}, app.sphereShader, function (v) { app.setSphereShader(v); rebuildSphereRows(); }, 'sphereShader'));
		panel.appendChild(colorRow('sphere tint', app.sphereColor, function (v) { app.setSphereColor(v); }, 'sphereColor'));
		sphereHost = el('div', 'levels');
		panel.appendChild(sphereHost);
		rebuildSphereRows();
		panel.appendChild(el('div', 'help',
			'Ray-traced glass shells on every gear. hollow bubbles: membrane wall, ' +
			'iridescence, dispersion, see-through depth (layers). layered glass: ' +
			'nearest three shells composited.'));

		// gear tree: level sliders grow every parent at a depth by the same
		// child count, radially spaced; symmetry mirrors menu edits per level.
		panel.appendChild(el('div', 'sub', 'tree'));
		panel.appendChild(checkboxRow('symmetry mode', app.symmetry, function (v) {
			app.setSymmetry(v);
		}, 'symmetry'));
		panel.appendChild(el('div', 'help',
			'When ON, menu edits apply to every sibling at the same level. Add-sub-gear grows the whole level.'));
		levelsHost = el('div', 'levels');
		levelRows.length = 0;
		panel.appendChild(levelsHost);
		var treeBtns = el('div', 'btns');
		resetLevelsBtn = buttonRow('reset levels', function () {
			var maxD = app.maxDepth();
			for (var l = 1; l <= maxD; l++) app.applyLevel(l, 1);
		});
		resetLevelsBtn.style.display = 'none';
		treeBtns.appendChild(resetLevelsBtn);
		panel.appendChild(treeBtns);
		panel.appendChild(el('div', 'help',
			'lvl N = children per parent at that level, placed at i * 360/N. 0 removes the level.'));

		var sval = el('div', 'sub', 'scene');
		panel.appendChild(sval);
		// preset dropdown (default.js's PRESETS) above the save/load buttons.
		// the host is permanent so the row can be rebuilt in place when a
		// combined default.js is opened and its preset list adopted.
		presetHost = el('div', 'levels');
		panel.appendChild(presetHost);
		rebuildPresetRow();
		var sbtns = el('div', 'btns');
		sbtns.appendChild(buttonRow('copy (s)', function () { app.copyScene(); }));
		sbtns.appendChild(buttonRow('save (d)', function () { app.downloadScene(); }));
		sbtns.appendChild(buttonRow('open (o)', function () { app.loadFile(); }));
		sbtns.appendChild(buttonRow('paste (p)', function () { app.loadClipboard(); }));
		panel.appendChild(sbtns);

		autosaveLabel = el('div', 'auto', 'autosave: on');
		panel.appendChild(autosaveLabel);

		helpLine = el('div', 'help',
			'space pause - wheel zoom - drag pan - click gear to edit - rmb browser menu - Esc close');
		panel.appendChild(helpLine);

		GUI.setMode(app.mode);
		GUI.setColorMode(app.colorMode || 'frequency');
		GUI.setDim(app.dim || '2d');
		rebuildLevels();
	}

	// lvl sliders run 0..maxLevelN: 0 empties the level (and everything below
	// it), which is how a level is removed.
	function makeLevelRow(L) {
		var wrap = sliderRow('lvl ' + L, 0, app.maxLevelN, 1, app.levelCount(L), function (v) {
			app.applyLevel(L, v);
		});
		if (L > 1) wrap.classList.add('lvl-indent');
		levelsHost.appendChild(wrap);
		return { wrap: wrap, input: wrap.input, val: wrap.valEl };
	}

	// rows are added / removed in place as the tree grows or shrinks; the row
	// the user is currently dragging is never recreated under the pointer
	// (detaching an active range input releases pointer capture and kills the
	// drag) and never overwritten mid-drag.
	function rebuildLevels() {
		if (!levelsHost) return;
		var need = app.maxDepth() + 1;
		while (levelRows.length > need) levelsHost.removeChild(levelRows.pop().wrap);
		while (levelRows.length < need) levelRows.push(makeLevelRow(levelRows.length + 1));
		for (var i = 0; i < levelRows.length; i++) {
			if (document.activeElement === levelRows[i].input) continue;
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
		// the orbit pivot follows the SELECTED gear, set once at selection.
		// a refresh of the open menu (mode switch, whole-mode slider swap)
		// is not a new selection: re-targeting would jump the camera to the
		// gear's current position and force a needless overlay re-bake.
		var reselect = currentGear !== gear;
		currentGear = gear;
		if (reselect && app.dim === '3d' && app.setOrbitGear) app.setOrbitGear(gear);
		menu.innerHTML = '';
		var whole = app.mode === 'whole';
		var title = el('div', 'ptitle drag');
		title.appendChild(document.createTextNode(gear.parent ? 'Gear ' : 'Main gear '));
		title.appendChild(document.createTextNode('\u2725 '));
		attachDragHandle(title, menu);
		menu.appendChild(title);

		menu.appendChild(checkboxRow('internal (roll inside parent)', gear.internal, function (v) {
			gear.internal = v; edit(gear, 'geom');
		}));

		// diameter scales the sub-tree mounted on this gear, so gear ratios (and
		// with them the period) survive the edit. in whole mode the reachable
		// diameters are the rational multiples of the parent's.
		menu.appendChild(sliderRow('diameter', 0.04, 2.0, 0.01, gear.r * 2, function (v) {
			app.setGearRadius(gear, v / 2); edit(gear, 'geom');
		}, whole ? app.diameterChoices(gear) : null));

		menu.appendChild(sliderRow('speed', -1, 1, 0.01, gear.speed, function (v) {
			gear.speed = v; edit(gear, 'geom');
		}, whole ? app.speedChoices() : null));

		// 3D second axis: this gear's tilt / precession speed (0 = stays in plane).
		// whole mode snaps like speed so the two-axis bake closes. editing it is
		// a geometry change (App.setGearSpeed2 clears the subtree / re-bakes).
		if (app.dim === '3d') {
			menu.appendChild(sliderRow('tilt speed', -1, 1, 0.01, gear.speed2 || 0, function (v) {
				app.setGearSpeed2(gear, v);
			}, whole ? app.speedChoices() : null));
		}

		menu.appendChild(sliderRow('pencil d', 0, 1, 0.01, gear.pencil.d, function (v) {
			gear.pencil.d = v; edit(gear, 'geom');
		}));

		menu.appendChild(sliderRow('pencil width', 0.5, 12, 0.5, gear.pencil.width, function (v) {
			gear.pencil.width = v; edit(gear, 'width');
		}));

		menu.appendChild(colorCheckRow('color 1', gear.pencil.c1.on, gear.pencil.c1.color,
			function (v) { gear.pencil.c1.on = v; edit(gear, 'color'); },
			function (v) { gear.pencil.c1.color = v; edit(gear, 'color'); }));

		menu.appendChild(colorCheckRow('color 2', gear.pencil.c2.on, gear.pencil.c2.color,
			function (v) { gear.pencil.c2.on = v; edit(gear, 'color'); },
			function (v) { gear.pencil.c2.color = v; edit(gear, 'color'); }));

		var speedRow = sliderRow('speed', 0, 4, 0.01, gear.pencil.animSpeed, function (v) {
			gear.pencil.animSpeed = v; edit(gear, 'color');
		});
		var speedLab = speedRow.labelEl;
		// prefix follows the GLOBAL color mode (cycles/frequency panel toggle).
		// in whole mode both formulas share the same slider value (hue cycles per
		// closed period), so the prefix is identical regardless of color mode.
		speedLabRefresh = function () {
			var cm = app.colorMode || 'frequency';
			speedLab.firstChild.nodeValue = app.mode === 'whole' ? 'hue cycles ' : (cm === 'frequency' ? 'hue/sec ' : 'cycles ');
		};
		speedLabRefresh();
		menu.appendChild(speedRow);

		if (!whole) {
			var tcL = Settings.LIMITS.trailCap;
			menu.appendChild(sliderRow('trail length', tcL.min, tcL.max, tcL.step, gear.trailCap, function (v) {
				app.setTrailCap(gear, v); edit(gear, 'trail');
			}, logLadder(tcL.min, tcL.max, 100, Math.round)));
			menu.appendChild(el('div', 'help',
				'how many points of the trail stay on screen (animate mode). whole mode ' +
				'draws the entire closed curve - its smoothness is the sidebar detail slider. ' +
				'works best with auto-rotate camera enabled.'));
		}

		// 3D: quick camera row (reframing after editing a gear is common).
		if (app.dim === '3d') {
			var vb = el('div', 'btns');
			vb.appendChild(buttonRow('fit view (f)', function () { app.fitView(); }));
			vb.appendChild(buttonRow('reset camera', function () { app.resetCamera(); }));
			menu.appendChild(el('div', 'sub', 'view'));
			menu.appendChild(vb);
		}

		var gb = el('div', 'btns');
		// symmetry ON: add-sub-gear grows the whole level (App.addSubGear routes it).
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
		menuX = Math.max(8, x); menuY = Math.max(8, y);
		menu.style.left = menuX + 'px';
		menu.style.top = menuY + 'px';
	}

	// one edit path: mirror to the level first (no-op when symmetry is off),
	// then run the normal per-gear update.
	function edit(gear, kind) {
		app.applySymmetry(gear, kind);
		app.onGearParam(gear, kind);
	}

	function closeMenu() {
		menu.classList.add('hidden');
		currentGear = null;
		speedLabRefresh = null;
		// camera falls back to orbiting the root once the menu closes.
		if (app.dim === '3d' && app.setOrbitGear) app.setOrbitGear(null);
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
			if (wholeBox) wholeBox.style.display = (m === 'whole') ? '' : 'none';
		},
		setColorMode: function (m) {
			for (var key in colorModeBtns) colorModeBtns[key].classList.toggle('active', key === m);
		},
		// show/hide the 3D section + help wording and the dim button state.
		setDim: function (d) {
			for (var key in dimBtns) dimBtns[key].classList.toggle('active', key === d);
			if (dim3Box) dim3Box.style.display = (d === '3d') ? '' : 'none';
			if (helpLine) helpLine.textContent = (d === '3d')
				? 'g back to 2D - drag orbit - wheel dolly - right/middle drag pan - f fit - click gear to edit'
				: 'space pause - wheel zoom - drag pan - click gear to edit - g 3D - rmb browser menu - Esc close';
		},
		setAutoRotate: function (v) { if (checkboxRefs.autoRotate) checkboxRefs.autoRotate.checked = !!v; },
		// live readout: exact vs approximate closure, plus background bake
		// progress. never a modal / blocking toast - the figure keeps updating.
		setPeriod: function (period, progress, points) {
			if (!periodLine || !period) return;
			var txt = 'period: ' + (period.exact ? '' : '~') + period.turns +
				' turn' + (period.turns === 1 ? '' : 's');
			if (!period.exact) txt += ' (approx, gap ' + period.err.toFixed(3) + ')';
			if (points) txt += ', ' + points + ' pts';
			if (progress != null && progress < 1) txt += ' - baking ' + Math.round(progress * 100) + '%';
			periodLine.textContent = txt;
		},
		// ---- setters that sync a checkbox/range input with a saved app value ----
		// called by Settings.applyApp when loading a scene with a saved app bag
		// (or when reset restores defaults). They update the DOM without
		// re-firing the input handlers, then the App state stays consistent.
		setSymmetry: function (v) { if (checkboxRefs.symmetry) checkboxRefs.symmetry.checked = v; },
		setOverlay: function (v) { if (checkboxRefs.overlay) checkboxRefs.overlay.checked = v; },
		setShowCircles: function (v) { if (checkboxRefs.showCircles) checkboxRefs.showCircles.checked = v; },
		setShowDial: function (v) { if (checkboxRefs.showDial) checkboxRefs.showDial.checked = v; },
		setShowPoints: function (v) { if (checkboxRefs.showPoints) checkboxRefs.showPoints.checked = v; },
		setGlow: function (v) { if (checkboxRefs.glowPoints) checkboxRefs.glowPoints.checked = v; },
		setDrawTrails: function (v) { if (checkboxRefs.drawTrails) checkboxRefs.drawTrails.checked = v; },
		setSphereShader: function (v) {
			if (selectRefs.sphereShader) selectRefs.sphereShader.value = v;
			rebuildSphereRows();
		},
		setSphereColor: function (v) { if (colorRefs.sphereColor) colorRefs.sphereColor.value = v; },
		setSphereParams: function (bags) {
			var bag = bags && bags[app.sphereShader];
			if (!bag) return;
			for (var k in sphereRows) {
				if (bag[k] == null) continue;
				sphereRows[k].input.value = bag[k];
				sphereRows[k].valEl.textContent = fmt(bag[k]);
			}
		},
		setGlobalSpeed: function (v) { syncSlider('globalSpeed', v); },
		setMaxPeriod: function (v) { syncSlider('maxPeriod', v); },
		setSamplesPerTurn: function (v) { syncSlider('samplesPerTurn', v); },
		setAutoYaw: function (v) { syncSlider('autoYaw', v); },
		setAutoPitch: function (v) { syncSlider('autoPitch', v); },
		// preset list changed (a combined default.js was opened / pasted).
		setPresets: rebuildPresetRow,
		// relabel the open menu's anim-speed slider prefix (color mode or trace
		// mode changed while the menu is open).
		refreshAnimMode: function () {
			if (!currentGear) return;
			if (speedLabRefresh) speedLabRefresh();
		},
		// rebuild the open menu in place (trace mode changed: whole mode swaps
		// the continuous sliders for their valid-position variants).
		refreshMenu: function () {
			if (currentGear) openMenu(currentGear, menuX, menuY);
		}
	};

	root.GUI = GUI;
	if (typeof module !== 'undefined' && module.exports) module.exports = GUI;
})(typeof window !== 'undefined' ? window : this);
