# interactive [spirograph](https://en.wikipedia.org/wiki/Spirograph) (WebGL2)

draw hypotrochoid / epitrochoid curves in the browser. no build step.

![screenshot](screenshot.webp)


## features summary

	interactive parent-child gear tree, add / remove sub-gears
	per-gear: internal/external, speed -1..1, diameter, pencil offset d, width,
	  two color slots (each with its own enable checkbox) -> 0 colors = no pencil,
	  1 color = static, 2 colors = animated blend between them
	  global cycles/frequency color mode (auto per trace mode, user-overridable)
	zoom / pan, pause, clear, reset to default scene
	save scene as a .js file (rename to default.js for startup scene) / load
	  .js or legacy .json (file or clipboard), autosave to localStorage
	60+ FPS pan/zoom in both modes: direct-draw during gestures, one overlay
	  re-bake on release, auto-tuned decimation on weak GPUs
	zero dependencies, WebGL2, runs from file://


### run

no build. run with double click in file explorer.

file:// friendly. no server need. load js script tags, not ES modules.

for node debugging, guard module.exports so the same files run in both.



## layout

square canvas, size = short side of window (snapped to mod 64px texture)

GUI sits left for wide windows, top for tall windows

zoom / pan with pointer, touch and mouse wheel

default scene: main gear is 60% of canvas, pivot fixed at center

GUI has a global animation speed slider

## model

gears form a parent-child tree

	main gear = root, pivot fixed in place
	each child gear attached to parent, rotates around it pivot
	each gear has: radius (size vs parent), speed -1..1, optional pencil at offset d

curve = path traced by an enabled pencil over time

classic params: R fixed, r rolling, d pen offset -> hypotrochoid / epitrochoid

### math

parametric curve, θ = rotation angle of rolling gear:

	hypotrochoid (inside):
		x = (R - r) cos θ + d cos(((R - r)/r) θ)
		y = (R - r) sin θ - d sin(((R - r)/r) θ)
	epitrochoid (outside):
		x = (R + r) cos θ - d cos(((R + r)/r) θ)
		y = (R + r) sin θ - d sin(((R + r)/r) θ)

in this app R,r come from each gear radius vs its ancestor chain; internal/external picks the sign.

### use case

click or mouse over axis of gear - show context menu.
from this menu user can:

	switch is this gear internal or external relative to parent
	sliders: gear diameter and rotation speed -1...1
	move slider of marker pencil position (distance from center of this gear)
	slider of pencil line width
	two color slots, each with its own enable checkbox placed before the picker:
		if none enabled  -> no pencil is drawn
		if one enabled    -> static single color
		if both enabled   -> animated blend between the two colors (speed slider)
	place sub-gear
	remove this gear (and its children)

drag context menu using pointer. move by drag caption 'gear' label with unicode ico ✥ near it

middle mouse pan

### simulation

every frame

	gears rotate according speed, properly calculate position and rotation with parent and child gears.
	enabled pencils draw smooth line from last to current position

### render

![screenshot whole period mode](screenshot2.avif)

smooth antialiased lines

draw modes:

* animated draw similar to pencil using last N segments or FBO draw

* calculate whole line and update interactively while move sliders. properly detect period and improve sliders to fit periods

* without circles but only 'dial' lines from center. look how it draw it - it visually good looks

* only glowing pencil points (no traces, no center of gears)


change (animate) pencil color hue. not blend all but:
example
color 1 = Y
color 2 = R
animation should be Y...G...B...R
light and saturation just blend

#### properly change color of pencil:
for r,b
r-g-b-g-r-r-g-b-g-...
for b,r 
b-r-b-r-...
color1-color2 is not same as color2-color1. and it should not do whole hue wheel 



### dependencies

WebGL2, no framework

no internet links in code. if need any lib to run - download it and link as js file. 



### requirements

modern browser with WebGL2 support


### controls
	space - pause / resume
	wheel or gesture - zoom
	drag - pan
	click / hover gear axis - context menu
	Esc - close context menu (also auto-closes)

	GUI buttons, also keyboard shortcuts:
	c - clear canvas
	x - reset objects to default scene + view transform
	s - copy scene model (gears, view) json to clipboard
	d - download scene model as .js file (rename to default.js for startup scene)
	o - load scene model from file (.js or legacy .json)
	p - load scene model from clipboard
### state

on exit save to localStorage, restored on load. 
if localStorage failed - should be 'autosave unavailable' label near save buttons in GUI 


### scene format

scene saved/loaded by s / d / o / p: clipboard uses json; the file format (d)
wraps the same object in a SETTINGS js module so a saved scene can be renamed to
`default.js` and become the startup scene. legacy .json files still load.
colors are hex strings, parsed to rgb floats internally for webgl, example:

	{
	  "gears": [ { "r": 0.6, "speed": 0.2, "internal": false,
	               "pencil": { "d": 0.4, "width": 2,
	                           "c1": { "on": true, "color": "#ff0000" },
	                           "c2": { "on": false, "color": "#0000ff" },
	                           "animSpeed": 0.1 },
	               "children": [] } ],
	  "view": { "zoom": 1, "pan": [0, 0] },
	  "globalSpeed": 1,
	  "colorMode": "frequency"
	}


### structure

	README.md - this file
	AGENTS.md - guidance for LLM agents
	index.html - entry point (classic <script> tags, no build)
	default.js - startup scene (SETTINGS module; replace to change the default)
	implementation-log.txt - what is already done and next step for LLM agents
	findings-pitfalls-skills.md - notes for LLM agents
	CHANGELOG.md - short release notes
	03-performance-refactoring-plan.md - pan/zoom perf plan (implemented)
	js/main.js - init, loop
	js/gear.js - gear math
	js/render.js - webgl2 line drawing (shaders, buffers, MSAA)
	js/gui.js - context menu, sliders

### license

MIT
