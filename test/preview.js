// test/preview.js - offline renderer: bakes a scene with the real gear math and
// writes a PNG (zlib only, no deps) so a headless agent can eyeball the result.
// usage: node test/preview.js out.png
'use strict';

var zlib = require('zlib');
var fs = require('fs');
var Gear = require('../js/gear.js');

var W = 700, H = 700;
var buf = Buffer.alloc(W * H * 3);
for (var i = 0; i < buf.length; i += 3) { buf[i] = 11; buf[i + 1] = 14; buf[i + 2] = 20; }

function px(x, y, r, g, b) {
	if (x < 0 || y < 0 || x >= W || y >= H) return;
	var o = ((y | 0) * W + (x | 0)) * 3;
	buf[o] = Math.min(255, r * 255); buf[o + 1] = Math.min(255, g * 255); buf[o + 2] = Math.min(255, b * 255);
}

function line(x0, y0, x1, y1, r, g, b) {
	var dx = x1 - x0, dy = y1 - y0;
	var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
	for (var i = 0; i <= n; i++) px(x0 + dx * i / n, y0 + dy * i / n, r, g, b);
}

function png(path) {
	var raw = Buffer.alloc((W * 3 + 1) * H);
	for (var y = 0; y < H; y++) {
		raw[y * (W * 3 + 1)] = 0;
		buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
	}
	function chunk(type, data) {
		var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
		var td = Buffer.concat([Buffer.from(type), data]);
		var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
		return Buffer.concat([len, td, crc]);
	}
	var ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
	ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
	fs.writeFileSync(path, Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
	]));
}

var crcTable = (function () {
	var t = [];
	for (var n = 0; n < 256; n++) {
		var c = n;
		for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(b) {
	var c = 0xffffffff;
	for (var i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function render(roots, path) {
	var S = 300, cx = W / 2, cy = H / 2;
	var all = Gear.flatten(roots);
	var worst = 0;
	for (var gi = 0; gi < all.length; gi++) {
		var g = all[gi];
		if (!(g.pencil.c1.on || g.pencil.c2.on) || g.count < 2) continue;
		for (var k = 0; k < g.count - 1; k++) {
			var ia = (g.head + k) % g.cap, ib = (g.head + k + 1) % g.cap;
			line(cx + g.ring[ia * 5] * S, cy - g.ring[ia * 5 + 1] * S,
				cx + g.ring[ib * 5] * S, cy - g.ring[ib * 5 + 1] * S,
				g.ring[ia * 5 + 2], g.ring[ia * 5 + 3], g.ring[ia * 5 + 4]);
		}
		var f = g.head, l = (g.head + g.count - 1) % g.cap;
		worst = Math.max(worst, Math.hypot(g.ring[f * 5] - g.ring[l * 5], g.ring[f * 5 + 1] - g.ring[l * 5 + 1]));
	}
	png(path);
	console.log('gears', all.length, 'closure gap', worst.toExponential(2), '->', path);
}

module.exports = { render: render };

// ---- demo scene: 3-fold level 1, 2-fold level 2 (what level sliders build) ----
if (require.main === module) {
	var TAU = Math.PI * 2;
	var child = function (r, speed, phase0, d, c1, c2) {
		return Gear.makeGear({
			r: r, speed: speed, phase0: phase0, internal: true,
			pencil: { d: d, width: 2, c1: { on: true, color: c1 }, c2: { on: !!c2, color: c2 || '#4d7dff' }, animSpeed: 1 }
		});
	};
	var root = Gear.makeGear({
		r: 0.6, speed: 0, internal: false,
		pencil: { d: 0.3, width: 2, c1: { on: false, color: '#ff4d4d' }, c2: { on: false, color: '#4d7dff' } }
	});
	for (var a = 0; a < 3; a++) {
		var c = child(0.225, 1, a * TAU / 3, 0.18, '#ffd24d', '#4dffd2');
		for (var b = 0; b < 2; b++) c.children.push(child(0.075, -1, b * TAU / 2, 0.06, '#ff7ad2'));
		root.children.push(c);
	}
	var roots = [root];
	Gear.initRuntime(root, null);
	var period = Gear.detectPeriod(roots, 2000);
	console.log('period', JSON.stringify(period));
	Gear.computeWhole(roots, period, 30000);
	render(roots, process.argv[2] || '/tmp/spiro.png');
}
