// preset: 3d-whole-rainbow-sequence.js
// linked from index.html by link_presets_to_html.py - renaming or
// deleting this file and re-running the script moves or drops the
// link; the marker line above is how the script tracks renames.
(function (root) {
	var S = {
	"gears": [
		{
			"r": 0.6,
			"speed": -0.1,
			"speed2": 0,
			"internal": false,
			"phase0": 0,
			"rot": -17.59291886010284,
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
					"r": 0.22499999999999998,
					"speed": 0.14285714285714285,
					"speed2": 0.75,
					"internal": false,
					"phase0": 0,
					"rot": 25.132741228718345,
					"trailCap": 20000,
					"pencil": {
						"d": 0.135,
						"width": 2,
						"c1": {
							"on": true,
							"color": "#ff0000"
						},
						"c2": {
							"on": true,
							"color": "#e100ff"
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
		"maxPeriod": 99,
		"samplesPerTurn": 580,
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
		"autoYaw": 0.2,
		"autoPitch": 0
	},
	"levels": [
		9
	],
	"dim": "3d",
	"camera": {
		"yaw": -1.1489027826043765,
		"pitch": 0.1439726305688816,
		"dist": 3.298618836231796,
		"target": [
			0,
			0,
			0
		]
	}
};
	root.PRESETS = (root.PRESETS || []).concat([{ name: "3d-whole-rainbow-sequence", scene: S }]);
	if (typeof module !== 'undefined' && module.exports)
		module.exports = { SETTINGS: S, NAME: "3d-whole-rainbow-sequence" };
})(typeof window !== 'undefined' ? window : globalThis);
