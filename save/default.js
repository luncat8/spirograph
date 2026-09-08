// spirograph default scene + preset list.
// SETTINGS = the startup scene (loads when there is no autosave);
// PRESETS = the panel's preset dropdown. regenerate with
// presets_merge_to_default.js.py: it appends the scene files in this
// folder and renames the consumed files to *.delete-me
// (link_presets_to_html.py is the multi-file alternative).

(function (root) {
	var S = {
	"gears": [
		{
			"r": 0.6,
			"speed": 0.16666666666666666,
			"internal": false,
			"pencil": {
				"d": 0.3,
				"width": 2,
				"c1": {
					"on": false,
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
					"r": 0.335,
					"speed": -0.5454545454545454,
					"internal": true,
					"pencil": {
						"d": 0.45,
						"width": 3,
						"c1": {
							"on": true,
							"color": "#ff0000"
						},
						"c2": {
							"on": true,
							"color": "#eaff4d"
						},
						"animSpeed": 4,
						"animMode": "cycles"
					},
					"children": []
				},
				{
					"r": 0.06,
					"speed": 0.3,
					"internal": true,
					"pencil": {
						"d": 0.12,
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
	],
	"view": {
		"zoom": 0.9999999999999961,
		"pan": [
			-0.1409313811428684,
			-0.20378209070158715
		]
	},
	"globalSpeed": 9.81,
	"colorMode": "cycles"
};
	var PRESETS = [
	{
		"name": "2d-circles",
		"scene": {
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 1.0471975511965976,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 2.0943951023931953,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 3.141592653589793,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 4.1887902047863905,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 5.235987755982989,
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
						},
						{
							"r": 0.2571428571428571,
							"speed": 0.3,
							"speed2": 0.75,
							"internal": true,
							"phase0": 2.0943951023931953,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 1.0471975511965976,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 2.0943951023931953,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 3.141592653589793,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 4.1887902047863905,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 5.235987755982989,
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
						},
						{
							"r": 0.2571428571428571,
							"speed": 0.3,
							"speed2": 0.75,
							"internal": true,
							"phase0": 4.1887902047863905,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 1.0471975511965976,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 2.0943951023931953,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 3.141592653589793,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 4.1887902047863905,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 5.235987755982989,
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
				"autoYaw": 0.533,
				"autoPitch": 0.15900000000000003
			},
			"dim": "2d",
			"camera": null
		}
	},
	{
		"name": "2d-dials",
		"scene": {
			"gears": [
				{
					"r": 0.6,
					"speed": 0.16666666666666666,
					"speed2": 0,
					"internal": false,
					"phase0": 0,
					"rot": 335.10792025243256,
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
							"rot": 603.1942564528237,
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
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 1.0471975511965976,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 2.0943951023931953,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 3.141592653589793,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 4.1887902047863905,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 5.235987755982989,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
						},
						{
							"r": 0.2571428571428571,
							"speed": 0.3,
							"speed2": 0.75,
							"internal": true,
							"phase0": 2.0943951023931953,
							"rot": 603.1942564528237,
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
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 1.0471975511965976,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 2.0943951023931953,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 3.141592653589793,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 4.1887902047863905,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 5.235987755982989,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
						},
						{
							"r": 0.2571428571428571,
							"speed": 0.3,
							"speed2": 0.75,
							"internal": true,
							"phase0": 4.1887902047863905,
							"rot": 603.1942564528237,
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
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 1.0471975511965976,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 2.0943951023931953,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 3.141592653589793,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 4.1887902047863905,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 5.235987755982989,
									"rot": -1005.3237607559416,
									"trailCap": 142,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 0,
											"rot": -185.97848501995128,
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
											"r": 0.02,
											"speed": -0.79,
											"speed2": 0,
											"internal": true,
											"phase0": 3.141592653589793,
											"rot": -185.97848501995128,
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
				"zoom": 0.6376281516217726,
				"pan": [
					-0.03240372402054731,
					0.2965266915538487
				]
			},
			"globalSpeed": 1.71,
			"colorMode": "frequency",
			"app": {
				"mode": "animate",
				"paused": false,
				"symmetry": true,
				"overlay": true,
				"maxPeriod": 55,
				"samplesPerTurn": 740,
				"showCircles": false,
				"showDial": true,
				"showPoints": true,
				"glowPoints": false,
				"drawTrails": false,
				"sphereShader": "off",
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
				"autoYaw": 0.2,
				"autoPitch": 0
			},
			"dim": "2d",
			"camera": null
		}
	},
	{
		"name": "3d-short-trails",
		"scene": {
			"gears": [
				{
					"r": 0.6,
					"speed": 0.16666666666666666,
					"speed2": 0,
					"internal": false,
					"phase0": 0,
					"rot": 208.83740508538,
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
							"rot": 375.9073291536059,
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
									"rot": -626.5122152563565,
									"trailCap": 142,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 2.0943951023931953,
									"rot": -626.5122152563565,
									"trailCap": 142,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 4.1887902047863905,
									"rot": -626.5122152563565,
									"trailCap": 142,
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
						},
						{
							"r": 0.2571428571428571,
							"speed": 0.3,
							"speed2": 0.75,
							"internal": true,
							"phase0": 3.141592653589793,
							"rot": 375.9073291536059,
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
									"rot": -626.5122152563565,
									"trailCap": 142,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 2.0943951023931953,
									"rot": -626.5122152563565,
									"trailCap": 142,
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
								},
								{
									"r": 0.12857142857142856,
									"speed": -0.5,
									"speed2": -0.375,
									"internal": true,
									"phase0": 4.1887902047863905,
									"rot": -626.5122152563565,
									"trailCap": 142,
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
				"showDial": true,
				"showPoints": false,
				"glowPoints": false,
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
				}
			},
			"dim": "3d",
			"camera": {
				"yaw": -1.0313909612038978,
				"pitch": -0.4033430342749497,
				"dist": 3.832448317642625,
				"target": [
					0,
					0,
					0
				]
			}
		}
	}
];
	if (typeof module !== 'undefined' && module.exports) module.exports = { SETTINGS: S, PRESETS: PRESETS };
	else { root.SETTINGS = S; root.PRESETS = PRESETS; }
})(typeof window !== 'undefined' ? window : globalThis);
