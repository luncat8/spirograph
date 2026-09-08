// preset: 2d-circles.js
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
			"rot": 235.48298518584596,
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
					"rot": 423.8693733347527,
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
							"rot": -706.4489555581092,
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
							"children": [
								{
									"r": 0.021428571428571425,
									"speed": -0.8,
									"speed2": 0,
									"internal": true,
									"phase0": 0,
									"rot": -1130.3183288925918,
									"trailCap": 100,
									"pencil": {
										"d": 0.19,
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
								},
								{
									"r": 0.021428571428571425,
									"speed": -0.8,
									"speed2": 0,
									"internal": true,
									"phase0": 3.141592653589793,
									"rot": -1130.3183288925918,
									"trailCap": 100,
									"pencil": {
										"d": 0.19,
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
		"zoom": 0.7408182206817168,
		"pan": [
			-0.12845955960331062,
			0.11384871028214247
		]
	},
	"globalSpeed": 2.48,
	"colorMode": "frequency",
	"app": {
		"mode": "animate",
		"paused": false,
		"symmetry": true,
		"overlay": true,
		"maxPeriod": 49,
		"samplesPerTurn": 1000,
		"showCircles": true,
		"showDial": false,
		"showPoints": true,
		"glowPoints": false,
		"showAxis": true,
		"drawTrails": false,
		"sphereShader": "layers",
		"sphereColor": "#ff1100",
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
		"circleHue": "off",
		"circleHueTarget": "grandparent",
		"circleHueK": 1,
		"autoYaw": 0.533,
		"autoPitch": 0.15900000000000003
	},
	"levels": [
		3,
		6,
		2
	],
	"dim": "2d",
	"camera": null
};
	root.PRESETS = (root.PRESETS || []).concat([{ name: "2d-circles", scene: S }]);
	if (typeof module !== 'undefined' && module.exports)
		module.exports = { SETTINGS: S, NAME: "2d-circles" };
})(typeof window !== 'undefined' ? window : globalThis);
