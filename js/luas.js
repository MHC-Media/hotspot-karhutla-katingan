/* luas.js - Estimasi LUAS AREA KEBAKARAN dari data titik panas (NASA FIRMS).
   Pengganti "luas piksel" (batas atas deteksi sensor yang tidak menggambarkan luas terbakar).
   Metode (Fire Radiative Energy, Wooster dkk. 2005):
     energi api (MJ)  = FRP (MW) x durasi api efektif (detik)
     biomassa (kg)    = energi x 0,368 kg/MJ
     luas (m2)        = biomassa / beban bahan bakar terbakar (kg/m2)
   Karena durasi & bahan bakar (gambut, semak, hutan sekunder) tidak diketahui pasti, hasil berupa RENTANG:
     rendah  = durasi 2 jam, bahan bakar 3,0 kg/m2   |   tengah = 4 jam, 2,0 kg/m2   |   tinggi = 8 jam, 1,5 kg/m2
   Titik berdekatan (<= 1,5 km) digabung menjadi satu klaster kebakaran. Dalam satu klaster dipakai total FRP pada lintasan satelit
   yang sama (satelit + jam yang sama), lalu diambil lintasan terbesar, agar titik yang sama tidak terhitung berulang.
   INDIKATIF untuk prioritas verifikasi lapangan, bukan hasil pengukuran. */
(function (g) {
  'use strict';
  var BIO = 0.368, SC = { lo: [2, 3.0], mid: [4, 2.0], hi: [8, 1.5] }, R = 1.5;
  function ha(frp, s) { return Math.max(0, +frp || 0) * s[0] * 3600 * BIO / s[1] / 1e4; }
  function fromFrp(frp) { return { lo: ha(frp, SC.lo), mid: ha(frp, SC.mid), hi: ha(frp, SC.hi) }; }
  function ep(t) {
    if (typeof t === 'number') return t;
    var m = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(t || ''));
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var d = Date.parse(String(t || '')); return isNaN(d) ? 0 : d;
  }
  // list: [{lat,lng,frp,satellite,time}] -> [{idx:[...], n, frp, lo, mid, hi}]  (get() opsional untuk memetakan field)
  function clusters(list, get) {
    get = get || function (x) { return { lat: +x.lat, lng: +x.lng, frp: +x.frp, sat: x.satellite, t: ep(x.time) }; };
    var P = list.map(get), n = P.length, par = []; for (var i = 0; i < n; i++) par[i] = i;
    var f = function (a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    var dl = R / 111, cell = {}, key = function (a, b) { return a + '|' + b; };
    P.forEach(function (p, i) { var k = key(Math.floor(p.lat / dl), Math.floor(p.lng / dl)); (cell[k] = cell[k] || []).push(i); });
    P.forEach(function (p, i) {
      var ci = Math.floor(p.lat / dl), cj = Math.floor(p.lng / dl), cs = Math.cos(p.lat * Math.PI / 180);
      for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) (cell[key(ci + a, cj + b)] || []).forEach(function (j) {
        if (j <= i) return; var q = P[j], dy = (q.lat - p.lat) * 111, dx = (q.lng - p.lng) * 111 * cs;
        if (dx * dx + dy * dy <= R * R) par[f(j)] = f(i);
      });
    });
    var G = {}; P.forEach(function (p, i) { var r = f(i); (G[r] = G[r] || []).push(i); });
    return Object.keys(G).map(function (r) {
      var idx = G[r], pass = {}, mx = 0;
      idx.forEach(function (i) { var p = P[i], k = (p.sat || '') + '|' + Math.floor((p.t || 0) / 1.2e6); pass[k] = (pass[k] || 0) + (p.frp || 0); });
      Object.keys(pass).forEach(function (k) { if (pass[k] > mx) mx = pass[k]; });
      var e = fromFrp(mx); return { idx: idx, n: idx.length, frp: mx, lo: e.lo, mid: e.mid, hi: e.hi };
    });
  }
  // beri setiap titik h.fa = estimasi klaster tempat titik itu berada
  function annotate(list) {
    if (!list || list.length > 4000) return;
    clusters(list).forEach(function (c) { c.idx.forEach(function (i) { list[i].fa = c; }); });
  }
  function num(v) { v = +v || 0; var d = v < 10 ? 1 : 0; return v.toFixed(d).replace('.', ','); }
  function range(c) { return num(c.lo) + '–' + num(c.hi) + ' ha'; }
  g.KarhutlaLuas = { time: ep, fromFrp: fromFrp, clusters: clusters, annotate: annotate, fmt: function (v) { return num(v); }, mainTxt: function (c) { return '≈ ' + num(c.mid) + ' ha'; }, rangeTxt: range, PARAM: { bio: BIO, skenario: SC, radiusKm: R } };
})(window);
