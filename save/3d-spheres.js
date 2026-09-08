// preset: 3d-spheres.js
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
			"rot": 280.89144085230765,
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
					"internal": false,
					"phase0": 0,
					"rot": 505.6045935344095,
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
							"r": 0.08,
							"speed": -0.5,
							"speed2": -0.375,
							"internal": false,
							"phase0": 0,
							"rot": -842.6743225570143,
							"trailCap": 100,
							"pencil": {
								"d": 0.65,
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
									"r": 0.035,
									"speed": -0.8,
									"speed2": 0,
									"internal": false,
									"phase0": 0,
									"rot": -1348.2789160914397,
									"trailCap": 100,
									"pencil": {
										"d": 0.1182222222222223,
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
		"zoom": 0.8607079764250565,
		"pan": [
			-0.0026651629280461386,
			0.12640600568426147
		]
	},
	"globalSpeed": 0.44,
	"colorMode": "frequency",
	"app": {
		"mode": "animate",
		"paused": false,
		"symmetry": true,
		"overlay": true,
		"maxPeriod": 49,
		"samplesPerTurn": 1000,
		"showCircles": true,
		"circleHue": "distance",
		"circleHueTarget": "root",
		"circleHueK": 3,
		"showDial": false,
		"showPoints": true,
		"glowPoints": true,
		"showAxis": false,
		"drawTrails": false,
		"sphereShader": "hollow",
		"sphereColor": "#ff1100",
		"sphereParams": {
			"off": {},
			"hollow": {
				"wall": 0.055,
				"ior": 1.13,
				"tint": 0.25,
				"iris": 0.55,
				"disp": 0.35,
				"layers": 6
			},
			"layers": {
				"wall": 0.075,
				"ior": 1.58,
				"tint": 0.3,
				"iris": 0.35
			}
		},
		"background": "colorbox",
		"autoRotate": false,
		"autoYaw": 0.533,
		"autoPitch": 0.15900000000000003
	},
	"levels": [
		3,
		3,
		2
	],
	"dim": "3d",
	"camera": {
		"yaw": 1.5257962505009506,
		"pitch": -0.9283430342749537,
		"dist": 3.2851663400184723,
		"target": [
			0,
			0,
			0
		]
	}
};
	root.PRESETS = (root.PRESETS || []).concat([{ name: "3d-spheres", scene: S }]);
	if (typeof module !== 'undefined' && module.exports)
		module.exports = { SETTINGS: S, NAME: "3d-spheres" };
})(typeof window !== 'undefined' ? window : globalThis);
