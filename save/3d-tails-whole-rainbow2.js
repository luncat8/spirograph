// preset: 3d-tails-whole-rainbow2.js
// linked from index.html by link_presets_to_html.py - renaming or
// deleting this file and re-running the script moves or drops the
// link; the marker line above is how the script tracks renames.
(function (root) {
	var S = {
	"gears": [
		{
			"r": 0.6,
			"speed": 0.16666666666666666,
			"speed2": 0,
			"internal": false,
			"phase0": 0,
			"rot": 6.283185307179586,
			"trailCap": 20000,
			"pencil": {
				"d": 0.3,
				"width": 2,
				"c1": {
					"on": true,
					"color": "#ff4d4d"
				},
				"c2": {
					"on": false,
					"color": "#4d7dff"
				},
				"animSpeed": 0.25,
				"animMode": "cycles"
			},
			"children": [
				{
					"r": 0.12,
					"speed": -0.8333333333333334,
					"speed2": 1,
					"internal": false,
					"phase0": 0,
					"rot": -31.41592653589793,
					"trailCap": 20000,
					"pencil": {
						"d": 0.06,
						"width": 2,
						"c1": {
							"on": true,
							"color": "#ff0066"
						},
						"c2": {
							"on": true,
							"color": "#ff8a3d"
						},
						"animSpeed": 4,
						"animMode": "cycles"
					},
					"children": []
				}
			]
		}
	],
	"view": {
		"zoom": 0.6376281516217727,
		"pan": [
			0.039932277760720856,
			-0.044025910065325496
		]
	},
	"globalSpeed": 0.95,
	"colorMode": "cycles",
	"app": {
		"mode": "whole",
		"paused": false,
		"symmetry": true,
		"overlay": false,
		"maxPeriod": 49,
		"samplesPerTurn": 1200,
		"showCircles": false,
		"showDial": false,
		"showPoints": false,
		"glowPoints": false,
		"drawTrails": true,
		"sphereShader": "off",
		"sphereColor": "#ffc800",
		"sphereParams": {
			"off": {},
			"hollow": {
				"wall": 0.055,
				"ior": 1.26,
				"tint": 0.85,
				"iris": 0.35,
				"disp": 0.3,
				"layers": 6
			},
			"layers": {
				"wall": 0.055,
				"ior": 1.41,
				"tint": 0.3,
				"iris": 0.35
			}
		},
		"autoRotate": true,
		"autoYaw": 0.47500000000000003,
		"autoPitch": 0
	},
	"levels": [
		3
	],
	"dim": "3d",
	"camera": {
		"yaw": 1.671222609355191,
		"pitch": 0.06820621182762776,
		"dist": 2.707704540561648,
		"target": [
			0,
			0,
			0
		]
	}
};
	root.PRESETS = (root.PRESETS || []).concat([{ name: "3d-tails-whole-rainbow2", scene: S }]);
	if (typeof module !== 'undefined' && module.exports)
		module.exports = { SETTINGS: S, NAME: "3d-tails-whole-rainbow2" };
})(typeof window !== 'undefined' ? window : globalThis);
