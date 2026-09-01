# interactive [spirograph](https://en.wikipedia.org/wiki/Spirograph) (WebGL2)

draw hypotrochoid / epitrochoid curves in the browser. no build step.

![screenshot](screenshot.webp)


## features summary

	interactive parent-child gear tree, add / remove sub-gears
	per-gear: internal/external, speed -1..1, diameter, pencil offset d, width,
	  two color slots (each with its own enable checkbox) -> 0 colors = no pencil,
	  1 color = static, 2 colors = animated blend between them
	zoom / pan, pause, clear, reset to default scene
	save / load scene as json (file or clipboard), autosave to localStorage
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


### TODO

read
README.md

review plan and improve if need
03-performance-refactoring-plan.md

1
review implemented:
```change anim speed slider should cause rebuild in mode whole. optimize if possible to not recalculate all but change color```

currently it has render performance issue while user do Pan/zoom. user prefer it 60+FPS in both animate and whole mode

2.
whole mode should not recreate whole image every frame after done if no changes.

we had toggle switch 
rasterized draw FBO - fast inpaint only last segments. do not keep geometry of already drawn segments at all, only texture.
and 
'keep geometry' - rebuild geometry on geometry settings change. if color change rebuild only color (possible change color of already drawn). if zoom change more then 20% - render already existing geometry. if pan changed - just pan cached image
at commit 88de92be9915a59441c1c95c93276ff3b8348c56
but somehow this functionality lost. sure this is LLM hallucination.
need to investigate.

3.
cycles/frequency of pencil color change
is currently 'anim speed' cycles/frequency implemented properly?

for best uix behavior optional
animate mode toggle it to frequency (color change speed, like hue per tick)
Whole mode toggle it to number of hue cycles 
user also can manually toggle

remove per-pencil toggle of cycles/frequency. it is just place for slider. but it should toggle all globally.


4.
improve save/load to file
save file as js, but not json. and load 'default.js' at startup.
example from other project

(function (root) {
var S = {
"version": 1,
"current": {
	"count": 50000,
}
};
if (typeof module !== 'undefined' && module.exports) module.exports = S;
else root.SETTINGS = S;
})(typeof window !== 'undefined' ? window : globalThis);


5. implement


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
	d - download scene model as json
	o - load scene model from file
	p - load scene model from clipboard
### state

on exit save to localStorage, restored on load. 
if localStorage failed - should be 'autosave unavailable' label near save buttons in GUI 


### scene format

json saved/loaded by s / d / o / p. colors are hex strings in json, parsed to rgb floats internally for webgl, example:

	{
	  "gears": [ { "r": 0.6, "speed": 0.2, "internal": false,
	               "pencil": { "d": 0.4, "width": 2,
	                           "c1": { "on": true, "color": "#ff0000" },
	                           "c2": { "on": false, "color": "#0000ff" },
	                           "animSpeed": 0.1 },
	               "children": [] } ],
	  "view": { "zoom": 1, "pan": [0, 0] }
	}


### structure

	README.md - this file
	AGENTS.md - guidance for LLM agents
	index.html - entry point (classic <script> tags, no build)
	implementation-log.txt - what is already done and next step for LLM agents
	findings-pitfalls-skills.md - notes for LLM agents
	CHANGELOG.md - short release notes
	js/main.js - init, loop
	js/gear.js - gear math
	js/render.js - webgl2 line drawing (shaders, buffers, MSAA)
	js/gui.js - context menu, sliders

### license

MIT
