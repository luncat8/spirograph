(function (root) {
var S = {
	"gears": [
		{
			"r": 0.6,
			"speed": 0.16666666666666666,
			"speed2": 0,
			"internal": false,
			"phase0": 0,
			"rot": 62.831853071795855,
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
					"r": 0.2571428571428571,
					"speed": 0.3,
					"speed2": 0.75,
					"internal": true,
					"phase0": 0,
					"rot": 113.09733552923254,
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
						"animMode": "cycles"
					},
					"children": [
						{
							"r": 0.11020408163265305,
							"speed": 0.3,
							"speed2": 0,
							"internal": true,
							"phase0": 0,
							"rot": 113.09733552923254,
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
								"animMode": "cycles"
							},
							"children": [
								{
									"r": 0.055102040816326525,
									"speed": 0.3,
									"speed2": 0,
									"internal": true,
									"phase0": 0,
									"rot": 113.09733552923254,
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
										"animMode": "cycles"
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
	"colorMode": "cycles",
	"app": {
		"mode": "whole",
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
		"autoPitch": 0.252
	},
	"levels": [
		3,
		3,
		2
	],
	"dim": "3d",
	"camera": {
		"yaw": -2.479975407473555,
		"pitch": 0.5985262846068989,
		"dist": 1.8103204003629465,
		"target": [
			0,
			0,
			0
		]
	}
};
if (typeof module !== 'undefined' && module.exports) module.exports = S;
else root.SETTINGS = S;
})(typeof window !== 'undefined' ? window : globalThis);
