// preset: 3d-tails-whole-rainbow3.js
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
			"rot": 809.6878359186177,
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
				"animMode": "frequency"
			},
			"children": [
				{
					"r": 0.2571428571428571,
					"speed": 0.3,
					"speed2": 0.75,
					"internal": true,
					"phase0": 0,
					"rot": 1457.438104653546,
					"trailCap": 20000,
					"pencil": {
						"d": 0.135,
						"width": 2,
						"c1": {
							"on": true,
							"color": "#ffffff"
						},
						"c2": {
							"on": false,
							"color": "#ff8a3d"
						},
						"animSpeed": 0.25,
						"animMode": "frequency"
					},
					"children": [
						{
							"r": 0.12857142857142856,
							"speed": -0.5,
							"speed2": -0.375,
							"internal": true,
							"phase0": 0,
							"rot": -2429.0635077561205,
							"trailCap": 100,
							"pencil": {
								"d": 0.88,
								"width": 0.5,
								"c1": {
									"on": true,
									"color": "#ffffff"
								},
								"c2": {
									"on": true,
									"color": "#ff8a3d"
								},
								"animSpeed": 2.12,
								"animMode": "frequency"
							},
							"children": []
						}
					]
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
	"globalSpeed": 7.07,
	"colorMode": "frequency",
	"app": {
		"mode": "animate",
		"paused": false,
		"symmetry": true,
		"overlay": true,
		"maxPeriod": 55,
		"samplesPerTurn": 740,
		"showCircles": false,
		"circleHue": "off",
		"circleHueTarget": "grandparent",
		"circleHueK": 1,
		"showDial": true,
		"showPoints": false,
		"glowPoints": false,
		"showAxis": true,
		"drawTrails": true,
		"sphereShader": "layers",
		"sphereColor": "#ffc800",
		"sphereParams": {
			"off": {},
			"hollow": {
				"wall": 0.05,
				"ior": 1.18,
				"tint": 0.85,
				"iris": 0.25,
				"disp": 0.75,
				"layers": 6
			},
			"layers": {
				"wall": 0.075,
				"ior": 1.58,
				"tint": 0.3,
				"iris": 0.35
			}
		},
		"background": "black",
		"autoRotate": true,
		"autoYaw": 0.2,
		"autoPitch": 0
	},
	"levels": [
		2,
		3
	],
	"dim": "3d",
	"camera": {
		"yaw": -0.5191015755629742,
		"pitch": -0.4033430342749497,
		"dist": 3.832448317642625,
		"target": [
			0,
			0,
			0
		]
	}
};
	root.PRESETS = (root.PRESETS || []).concat([{ name: "3d-tails-whole-rainbow3", scene: S }]);
	if (typeof module !== 'undefined' && module.exports)
		module.exports = { SETTINGS: S, NAME: "3d-tails-whole-rainbow3" };
})(typeof window !== 'undefined' ? window : globalThis);
