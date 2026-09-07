// spirograph default scene + preset list.
// SETTINGS = the startup scene (loads when there is no autosave);
// PRESETS = the panel's preset dropdown. regenerate with
// presets_combine.py: it appends the scene files saved next to
// index.html and renames the consumed files to *.delete-me.
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
	var PRESETS = [];
	if (typeof module !== 'undefined' && module.exports) module.exports = { SETTINGS: S, PRESETS: PRESETS };
	else { root.SETTINGS = S; root.PRESETS = PRESETS; }
})(typeof window !== 'undefined' ? window : globalThis);
