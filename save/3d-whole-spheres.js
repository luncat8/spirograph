// preset: 3d-whole-spheres.js
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
			"rot": 82.03299973851857,
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
					"rot": 147.65939952922128,
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
							"r": 0.11020408163265305,
							"speed": 0.3,
							"speed2": 0,
							"internal": true,
							"phase0": 0,
							"rot": 147.65939952922128,
							"trailCap": 20000,
							"pencil": {
								"d": 0.05785714285714285,
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
									"r": 0.055102040816326525,
									"speed": 0.3,
									"speed2": 0,
									"internal": true,
									"phase0": 0,
									"rot": 147.65939952922128,
									"trailCap": 20000,
									"pencil": {
										"d": 0.026035714285714284,
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
									"children": []
								}
							]
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
	"globalSpeed": 0.95,
	"colorMode": "frequency",
	"app": {
		"mode": "animate",
		"paused": false,
		"symmetry": true,
		"overlay": false,
		"maxPeriod": 61,
		"samplesPerTurn": 580,
		"showCircles": false,
		"showDial": false,
		"showPoints": false,
		"glowPoints": false,
		"drawTrails": false,
		"sphereShader": "hollow",
		"sphereColor": "#ffc800",
		"sphereParams": {
			"off": {},
			"hollow": {
				"wall": 0.2,
				"ior": 1.23,
				"tint": 1.9,
				"iris": 0.3,
				"disp": 0.35,
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
		"autoPitch": 0.252
	},
	"levels": [
		3,
		3,
		2
	],
	"dim": "3d",
	"camera": {
		"yaw": -1.0275566361911925,
		"pitch": 0.06237108460688943,
		"dist": 1.8103204003629463,
		"target": [
			0,
			0,
			0
		]
	}
};
	root.PRESETS = (root.PRESETS || []).concat([{ name: "3d-whole-spheres", scene: S }]);
	if (typeof module !== 'undefined' && module.exports)
		module.exports = { SETTINGS: S, NAME: "3d-whole-spheres" };
})(typeof window !== 'undefined' ? window : globalThis);
