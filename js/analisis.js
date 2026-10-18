/* analisis.js - Analisis Daerah Rawan Kebakaran Parah + Rekomendasi untuk Pemerintah (kartu di bawah "Tren Titik Panas Harian (7 Hari)").
   Memakai data yang sudah ada: titik panas NASA FIRMS (24 jam & riwayat 7 hari), FRP, confidence, estimasi luas terbakar (js/luas.js, dari FRP),
   prakiraan hujan/angin BMKG + Open-Meteo, sumber air, dan data ISPA. Skor bersifat INDIKATIF untuk prioritas kewaspadaan, bukan prediksi pasti. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CARD = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 sm:p-5';
  var LV = [{ n: 'Rendah', c: '#16a34a', min: 0 }, { n: 'Sedang', c: '#ca8a04', min: 30 }, { n: 'Tinggi', c: '#ea580c', min: 50 }, { n: 'Sangat Tinggi', c: '#dc2626', min: 70 }];
  var lvOf = function (s) { var r = LV[0]; LV.forEach(function (l) { if (s >= l.min) r = l; }); return r; };
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'], BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var tglID = function (d) { var w = new Date(d.getTime() + 7 * 36e5); return HARI[w.getUTCDay()] + ', ' + String(w.getUTCDate()).padStart(2, '0') + ' ' + BLN[w.getUTCMonth()] + ' ' + w.getUTCFullYear(); };
  var jamID = function (d) { var w = new Date(d.getTime() + 7 * 36e5); return String(w.getUTCHours()).padStart(2, '0') + '.' + String(w.getUTCMinutes()).padStart(2, '0') + ' WIB'; };
  var f1 = function (v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); };
  var epoch = function (t) { var m = /(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(String(t || '')); return m ? Date.parse(m[1] + 'T' + m[2] + ':00+07:00') : NaN; };
  var dayWIB = function (e) { return new Date(e + 7 * 36e5).toISOString().slice(0, 10); };
  var ARAH = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
  var arah = function (d) { return ARAH[Math.round((((d % 360) + 360) % 360) / 45) % 8]; };
  var last = null, sigOld = '', wxReady = false, wxAsked = false, ALL = false;

  /* ---------- peta desa -> kode & titik tengah ---------- */
  var VIL = null;
  function villages() {
    if (VIL) return VIL; VIL = {};
    if (typeof GEOJSON === 'undefined') return VIL;
    GEOJSON.features.forEach(function (f) {
      var p = f.properties, g = f.geometry, mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
      (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(function (pl) { pl[0].forEach(function (c) { if (c[0] < mnx) mnx = c[0]; if (c[0] > mxx) mxx = c[0]; if (c[1] < mny) mny = c[1]; if (c[1] > mxy) mxy = c[1]; }); });
      VIL[p.desa + '|' + p.kecamatan] = { kode: p.kode, jenis: p.jenis || 'Desa', lat: (mny + mxy) / 2, lng: (mnx + mxx) / 2 };
    });
    return VIL;
  }

  /* ---------- analisis ---------- */
  function analyze() {
    var raw = dataCache.raw || [], hist = (dataCache.history && dataCache.history.length ? dataCache.history : []), now = Date.now(), V = villages();
    var uniq = {}, all = [];
    raw.concat(hist).forEach(function (x) {
      var e = epoch(x.time), la = parseFloat(x.latitude || x.lat), ln = parseFloat(x.longitude || x.lng); if (isNaN(e) || isNaN(la) || isNaN(ln)) return;
      var k = e + '|' + la.toFixed(4) + '|' + ln.toFixed(4) + '|' + (x.satellite || ''); if (uniq[k]) return;
      uniq[k] = 1; all.push({ e: e, lat: la, lng: ln, conf: +x.confidence || 0, frp: +x.frp || 0, sat: x.satellite || '', desa: x.village || '-', kec: x.kecamatan || '-', scan: x.scan, track: x.track, satellite: x.satellite });
    });
    var w7 = now - 7 * 864e5, w24 = now - 864e5, rec = all.filter(function (x) { return x.e >= w7; }), r24 = rec.filter(function (x) { return x.e >= w24; });
    // klaster: jumlah titik 24 jam dalam radius 1,5 km
    r24.forEach(function (a) { a.cl = 0; r24.forEach(function (b) { var dy = (a.lat - b.lat) * 111, dx = (a.lng - b.lng) * 111 * Math.cos(a.lat * Math.PI / 180); if (dx * dx + dy * dy <= 2.25) a.cl++; }); });
    var D = {};
    rec.forEach(function (x) {
      var k = x.desa + '|' + x.kec, o = D[k] = D[k] || { desa: x.desa, kec: x.kec, n24: 0, n7: 0, hi: 0, lo: 0, frpSum: 0, frpMax: 0, ha: 0, haLo: 0, haHi: 0, pts: [], cl: 0, days: {}, lat: 0, lng: 0, sat: {} };
      o.n7++; o.days[dayWIB(x.e)] = 1;
      if (x.e >= w24) { o.n24++; if (x.conf >= 80) o.hi++; if (x.conf < 40) o.lo++; o.frpSum += x.frp; if (x.frp > o.frpMax) o.frpMax = x.frp; o.pts.push(x); if (x.cl > o.cl) o.cl = x.cl; o.lat += x.lat; o.lng += x.lng; o.sat[x.sat] = 1; }
    });
    // estimasi luas area kebakaran per desa: gabungan klaster titik panas 24 jam (js/luas.js)
    Object.keys(D).forEach(function (k) {
      var o = D[k]; if (!o.pts.length || !window.KarhutlaLuas) return;
      KarhutlaLuas.clusters(o.pts, function (x) { return { lat: x.lat, lng: x.lng, frp: x.frp, sat: x.sat, t: x.e }; }).forEach(function (c) { o.ha += c.mid; o.haLo += c.lo; o.haHi += c.hi; });
    });
    var today = dayWIB(now), res = Object.keys(D).map(function (k) {
      var o = D[k], v = V[k] || {}, nd = Object.keys(o.days).length, run = 0;
      for (var i = 0; i < 7; i++) { if (o.days[dayWIB(now - i * 864e5)]) run++; else if (i > 0) break; else if (i === 0) continue; }
      if (o.n24) { o.lat /= o.n24; o.lng /= o.n24; } else if (v.lat != null) { o.lat = v.lat; o.lng = v.lng; }
      var wx = (window.__wx && v.kode) ? window.__wx.of(v.kode) : null, hasWx = !!(wx && wx.rain7 != null);
      var A = 25 * Math.min(1, o.n24 / 10), B = 10 * Math.min(1, o.frpMax / 50) + 10 * Math.min(1, o.frpSum / 200), C = 10 * Math.min(1, o.hi / 5),
        Dd = 15 * Math.min(1, Math.max(nd, run) / 5), E = 10 * Math.min(1, o.cl / 5), F = 10 * Math.min(1, o.ha / 50);
      var rp = !hasWx ? 3 : wx.rain7 < 10 ? 6 : wx.rain7 < 30 ? 4 : wx.rain7 < 60 ? 2 : 0, wp = !wx || wx.wind == null ? 0 : wx.wind >= 20 ? 4 : wx.wind >= 12 ? 2 : wx.wind >= 6 ? 1 : 0, W = Math.min(10, rp + wp);
      var sc = Math.round(A + B + C + Dd + E + F + W), why = [];
      if (o.n24) why.push(o.n24 + ' titik/24 jam'); if (o.frpMax >= 20) why.push('FRP maks ' + f1(o.frpMax) + ' MW'); if (o.hi) why.push(o.hi + ' keyakinan tinggi');
      if (run >= 2) why.push('berturut-turut ' + run + ' hari'); else if (nd >= 3) why.push('terdeteksi ' + nd + ' dari 7 hari'); if (o.cl >= 3) why.push('klaster ' + o.cl + ' titik ≤1,5 km');
      if (o.ha >= 2) why.push('estimasi luas terbakar ± ' + f1(o.ha) + ' ha');
      if (hasWx && wx.rain7 < 10) why.push('hujan 7 hari hanya ' + f1(wx.rain7) + ' mm'); if (wx && wx.wind >= 12) why.push('angin ' + Math.round(wx.wind) + ' km/jam');
      return { k: k, desa: o.desa, kec: o.kec, kode: v.kode, jenis: v.jenis || 'Desa', n24: o.n24, n7: o.n7, hi: o.hi, lo: o.lo, frpMax: o.frpMax, frpSum: o.frpSum, ha: o.ha, haLo: o.haLo, haHi: o.haHi, cl: o.cl, days: nd, run: run, lat: o.lat, lng: o.lng, wx: wx, hasWx: hasWx, score: sc, lv: lvOf(sc), why: why,
        parts: [['Jumlah titik 24 jam', A, 25], ['Intensitas FRP', B, 20], ['Keyakinan tinggi', C, 10], ['Persistensi (hari)', Dd, 15], ['Klaster titik', E, 10], ['Estimasi luas terbakar', F, 10], ['Cuaca (hujan & angin)', W, 10]] };
    }).sort(function (a, b) { return b.score - a.score || b.n24 - a.n24; });
    // kecamatan
    var K = {};
    res.forEach(function (r) { var o = K[r.kec] = K[r.kec] || { kec: r.kec, ds: [], n24: 0, ha: 0, frpMax: 0, hi: 0 }; o.ds.push(r); o.n24 += r.n24; o.ha += r.ha; o.hi += r.hi; if (r.frpMax > o.frpMax) o.frpMax = r.frpMax; });
    var ks = Object.keys(K).map(function (k) { var o = K[k], t = o.ds.slice().sort(function (a, b) { return b.score - a.score; }), top = t.slice(0, 3), avg = top.reduce(function (a, b) { return a + b.score; }, 0) / top.length; o.score = Math.round(0.6 * t[0].score + 0.4 * avg); o.lv = lvOf(o.score); o.rawan = o.ds.filter(function (d) { return d.score >= 50; }).length; o.top = t[0]; return o; }).sort(function (a, b) { return b.score - a.score; });
    return { desa: res, kec: ks, r24: r24, rec: rec, now: now, today: today, last: dataCache.last };
  }

  /* ---------- rekomendasi ---------- */
  function recs(A) {
    var R = [], D = A.desa, names = function (l, n) { return l.slice(0, n || 3).map(function (d) { return d.desa + ' (Kec. ' + d.kec + ')'; }).join(', '); };
    var sangat = D.filter(function (d) { return d.score >= 70; }), tinggi = D.filter(function (d) { return d.score >= 50 && d.score < 70; }), sedang = D.filter(function (d) { return d.score >= 30 && d.score < 50; });
    var pp = window.__pp || {}, AIR = (pp.air && pp.air()) || [], near = pp.nearest;
    if (!A.r24.length) {
      R.push({ p: 2, pr: 'Pantau', who: 'BPBD / Satgas Karhutla', t: 'Tidak ada titik panas dalam 24 jam terakhir. Pertahankan siaga dan patroli pencegahan' + (A.rec.length ? ', terutama di ' + names(D, 3) + ' yang memiliki riwayat deteksi 7 hari' : '') + '.', b: 'Data NASA FIRMS 24 jam & 7 hari' });
    }
    if (sangat.length) R.push({ p: 0, pr: 'Segera', who: 'Bupati / BPBD / Satgas Karhutla', t: 'Aktifkan posko siaga darurat dan kirim tim gabungan (Manggala Agni, BPBD, TNI/Polri, MPA) ke ' + names(sangat, 4) + '. Pertimbangkan pemadaman udara (water bombing) bila akses darat sulit.', b: sangat.length + ' desa/kelurahan berskor ≥ 70 (Sangat Tinggi)' });
    if (tinggi.length) R.push({ p: 1, pr: '24 jam', who: 'Camat / Kepala Desa / Lurah', t: 'Siagakan Masyarakat Peduli Api, lakukan patroli terpadu dan sekat bakar di ' + names(tinggi, 5) + '. Terbitkan imbauan larangan membakar lahan.', b: tinggi.length + ' desa/kelurahan berskor 50–69 (Tinggi)' });
    var top = D.filter(function (d) { return d.score >= 50; }).slice(0, 6);
    if (top.length) {
      var wind = top.filter(function (d) { return d.wx && d.wx.wind >= 12 && d.wx.windDir != null; });
      if (wind.length) R.push({ p: 1, pr: '24 jam', who: 'BPBD / Camat', t: 'Angin cukup kuat: api berpotensi menjalar ke arah ' + wind.slice(0, 3).map(function (d) { return d.desa + ' → ' + arah(d.wx.windDir + 180) + ' (' + Math.round(d.wx.wind) + ' km/jam)'; }).join('; ') + '. Siagakan permukiman, sekolah, dan fasilitas umum di sisi searah angin; siapkan jalur evakuasi.', b: 'Prakiraan angin BMKG' });
      var gambut = top.filter(function (d) { return d.run >= 3 || d.days >= 4; });
      if (gambut.length) R.push({ p: 1, pr: '24 jam', who: 'BPBD / Dinas Lingkungan Hidup / BRGM', t: 'Titik panas bertahan beberapa hari di ' + names(gambut, 3) + ' (indikasi kebakaran bawah permukaan/gambut). Prioritaskan pembasahan, penyekatan kanal, dan penjagaan hingga benar-benar padam.', b: 'Persistensi deteksi ≥ 3 hari berturut-turut' });
      if (AIR.length && near) {
        var far = top.map(function (d) { var n = near(d.lat, d.lng); return n ? { d: d, km: n.d, a: n.a } : null; }).filter(function (x) { return x && x.km > 5; });
        if (far.length) R.push({ p: 1, pr: '24 jam', who: 'BPBD / Dinas PU', t: 'Sumber air terdekat lebih dari 5 km dari ' + far.slice(0, 3).map(function (x) { return x.d.desa + ' (' + f1(x.km) + ' km, ' + x.a.nama + ')'; }).join(', ') + '. Siapkan pompa portabel, tangki/truk air, atau relay selang; usulkan embung/sekat kanal permanen.', b: 'Jarak titik ke sumber air tersimpan' });
      } else if (!AIR.length) R.push({ p: 2, pr: 'Pantau', who: 'Admin / Operator desa', t: 'Data sumber air belum ada. Lengkapi titik sumber air (menu admin: Sumber Air) agar jarak pemadaman dapat dianalisis.', b: 'Data sumber air kosong' });
      var low = top.filter(function (d) { return d.n24 && d.lo >= Math.ceil(d.n24 / 2); });
      if (low.length) R.push({ p: 2, pr: 'Pantau', who: 'Operator desa / Kecamatan', t: 'Sebagian besar titik di ' + names(low, 3) + ' berkeyakinan rendah (< 40%). Lakukan verifikasi lapangan sebelum pengerahan besar dan catat melalui menu Buat Laporan.', b: 'Confidence satelit < 40%' });
    }
    var rw = D.filter(function (d) { return d.hasWx && d.score >= 30; });
    if (rw.length) {
      var avg = rw.reduce(function (a, d) { return a + d.wx.rain7; }, 0) / rw.length;
      if (avg < 15) R.push({ p: 1, pr: '24 jam', who: 'Pemerintah Kabupaten / BPBD', t: 'Rata-rata hujan 7 hari di wilayah rawan hanya ± ' + f1(avg) + ' mm. Ajukan/aktifkan Teknologi Modifikasi Cuaca (TMC) dan operasi pembasahan lahan gambut bersama BNPB/BMKG.', b: 'Prakiraan hujan 7 hari desa rawan' });
      else if (avg >= 60) R.push({ p: 2, pr: 'Pantau', who: 'BPBD / BMKG', t: 'Hujan 7 hari ke depan cukup (± ' + f1(avg) + ' mm di wilayah rawan): risiko menurun, namun tetap pantau lahan gambut dan titik yang bertahan.', b: 'Prakiraan hujan 7 hari desa rawan' });
    }
    var kk = A.kec.filter(function (k) { return k.score >= 50; });
    if (kk.length) {
      var ispa = (pp.ispa && pp.ispa()) || null, txt = '';
      try { if (ispa && ispa.daftar) { var cut = new Date(Date.now() + 7 * 36e5 - 30 * 864e5).toISOString().slice(0, 10), sum = 0; ispa.daftar.forEach(function (r) { if (r.tgl >= cut && kk.some(function (k) { return k.kec === r.kec; })) sum += r.kasus; }); txt = ' Kasus ISPA 30 hari di kecamatan tersebut: ' + sum + '.'; } } catch (e) { }
      R.push({ p: 1, pr: '24 jam', who: 'Dinas Kesehatan / Puskesmas', t: 'Siapkan posko kesehatan, masker, dan pantau ISPA di Kec. ' + kk.slice(0, 4).map(function (k) { return k.kec; }).join(', ') + '; beri imbauan warga rentan (balita, lansia) membatasi aktivitas luar ruang.' + txt, b: 'Kecamatan berskor ≥ 50' });
    }
    if (sedang.length) R.push({ p: 2, pr: 'Pantau', who: 'Camat / Kepala Desa / Lurah', t: 'Tingkatkan patroli rutin dan sosialisasi pencegahan di ' + names(sedang, 5) + '.', b: sedang.length + ' desa/kelurahan berskor 30–49 (Sedang)' });
    R.push({ p: 3, pr: 'Rutin', who: 'Admin / Operator', t: 'Perbarui data satelit berkala, catat kejadian lewat menu Buat Laporan, dan tinjau ulang analisis ini minimal setiap pagi dan sore.', b: 'Kelengkapan data pengambilan keputusan' });
    return R.sort(function (a, b) { return a.p - b.p; });
  }

  /* ---------- tampilan ---------- */
  var badge = function (lv, s) { return '<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white whitespace-nowrap" style="background:' + lv.c + '">' + h(lv.n) + (s != null ? ' · ' + s : '') + '</span>'; };
  var PR = { 'Segera': '#dc2626', '24 jam': '#ea580c', 'Pantau': '#0284c7', 'Rutin': '#64748b' };
  function ensureCard() {
    var c = $('analisis-risiko'); if (c) return c; var sd = $('sumber-data'); if (!sd || !sd.parentNode) return null;
    // diletakkan paling bawah, tepat sebelum bagian Sumber Data
    var w = document.createElement('section'); w.id = 'analisis-risiko-wrap'; w.className = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 w-full scroll-mt-20';
    c = document.createElement('div'); c.id = 'analisis-risiko'; c.className = CARD; w.appendChild(c); sd.parentNode.insertBefore(w, sd); return c;
  }
  function render() {
    var c = ensureCard(); if (!c || typeof dataCache === 'undefined' || !dataCache) return;
    var A = last = analyze(), R = recs(A), D = A.desa, top = A.kec[0], max = D[0], nowD = new Date(A.now);
    var count = function (min, max2) { return D.filter(function (d) { return d.score >= min && d.score < (max2 || 101); }).length; };
    var overall = max ? max.lv : LV[0], ha24 = A.desa.reduce(function (a, d) { return a + d.ha; }, 0);
    var kpi = [['Sangat Tinggi', count(70), '#dc2626', 'desa/kelurahan'], ['Tinggi', count(50, 70), '#ea580c', 'desa/kelurahan'], ['Titik panas 24 jam', A.r24.length, '#0f172a', 'unik (lokasi + satelit)'], ['Estimasi luas terbakar 24 jam', '± ' + f1(ha24) + ' ha', '#0f172a', 'indikatif dari FRP, perlu verifikasi lapangan'], ['Kecamatan prioritas', top ? h(top.kec) : '–', top ? top.lv.c : '#16a34a', top ? 'skor ' + top.score + ' · ' + top.lv.n : 'tidak ada deteksi']];
    var rows = (ALL ? D : D.slice(0, 10)).map(function (d, i) {
      var wx = d.wx, cu = d.hasWx ? 'hujan 7 hr <b>' + f1(wx.rain7) + ' mm</b>' + (wx.wind != null ? '<br>angin ' + Math.round(wx.wind) + ' km/jam' : '') : '<span class="text-slate-400">cuaca memuat…</span>';
      return '<tr><td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800 text-slate-400 font-bold">' + (i + 1) + '</td><td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800"><b>' + h(d.desa) + '</b><div class="text-[11px] text-slate-500">Kec. ' + h(d.kec) + '</div></td>' +
        '<td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800">' + badge(d.lv, d.score) + '<div class="mt-1 h-1.5 rounded bg-slate-200 dark:bg-slate-700 w-24"><i class="block h-full rounded" style="width:' + d.score + '%;background:' + d.lv.c + '"></i></div></td>' +
        '<td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800 text-center"><b>' + d.n24 + '</b><div class="text-[11px] text-slate-500">7 hr: ' + d.n7 + '</div></td>' +
        '<td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800 text-center">' + f1(d.frpMax) + '<div class="text-[11px] text-slate-500">MW</div></td>' +
        '<td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800 text-center">' + f1(d.ha) + '<div class="text-[11px] text-slate-500">ha (' + f1(d.haLo) + '–' + f1(d.haHi) + ')</div></td>' +
        '<td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800 text-xs">' + cu + '</td>' +
        '<td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800 text-[11.5px] min-w-[200px]">' + (d.why.length ? d.why.map(function (w) { return '<span class="inline-block bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 mr-1 mb-1">' + h(w) + '</span>'; }).join('') : '-') + '</td>' +
        '<td class="px-2 py-2 border-t border-slate-100 dark:border-slate-800"><button type="button" data-fly="' + d.lat.toFixed(5) + ',' + d.lng.toFixed(5) + '" class="text-xs font-bold text-sky-700 dark:text-sky-300 underline whitespace-nowrap">Lihat di peta</button></td></tr>';
    }).join('');
    var kecH = A.kec.slice(0, 8).map(function (k) {
      return '<div class="flex items-center gap-2 text-sm"><div class="w-28 sm:w-40 truncate font-semibold" title="' + h(k.kec) + '">' + h(k.kec) + '</div><div class="flex-1 h-5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded flex items-center justify-end pr-1.5 text-[10.5px] font-extrabold text-white" style="width:' + Math.max(8, k.score) + '%;background:' + k.lv.c + '">' + k.score + '</div></div><div class="w-28 sm:w-36 text-[11px] text-slate-500 text-right leading-tight">' + k.n24 + ' titik · ' + k.rawan + ' desa rawan</div></div>';
    }).join('');
    var recH = R.map(function (r) {
      return '<li class="flex gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3"><span class="shrink-0 h-fit rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white" style="background:' + PR[r.pr] + '">' + h(r.pr) + '</span><div class="min-w-0"><div class="text-[11px] font-bold uppercase tracking-wide text-slate-500">' + h(r.who) + '</div><div class="text-sm leading-snug">' + h(r.t) + '</div><div class="text-[11px] text-slate-400 mt-0.5">Dasar: ' + h(r.b) + '</div></div></li>';
    }).join('');
    c.innerHTML =
      '<div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-extrabold text-lg text-slate-900 dark:text-slate-100">Analisis Daerah Rawan Kebakaran Parah &amp; Rekomendasi</h3><p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Skor 0–100 per desa/kelurahan dari titik panas yang terdeteksi (jumlah, FRP, keyakinan, persistensi, klaster, estimasi luas terbakar) dan cuaca (hujan &amp; angin). Indikatif untuk prioritas kewaspadaan.</p></div>' +
      '<div class="flex flex-wrap gap-2"><button type="button" id="an-csv" class="text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5">⬇ CSV</button><button type="button" id="an-copy" class="text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5">Salin ringkasan</button><button type="button" id="an-print" class="text-xs font-bold rounded-lg bg-slate-800 text-white px-3 py-1.5">Cetak / PDF</button></div></div>' +
      '<div class="flex flex-wrap items-center gap-2 rounded-xl p-3 mb-3 text-white" style="background:' + overall.c + '"><b class="text-sm">Status wilayah: ' + h(overall.n) + '</b><span class="text-xs opacity-90">' + (max ? 'Tertinggi: ' + h(max.desa) + ', Kec. ' + h(max.kec) + ' (skor ' + max.score + ')' : 'Tidak ada titik panas terdeteksi 7 hari terakhir') + '</span><span class="text-xs opacity-80 ml-auto">' + h(tglID(nowD)) + ' · ' + h(jamID(nowD)) + '</span></div>' +
      '<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">' + kpi.map(function (k) { return '<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><div class="text-[11px] font-bold uppercase text-slate-500">' + k[0] + '</div><div class="text-xl font-black truncate" style="color:' + k[2] + '">' + k[1] + '</div><div class="text-[11px] text-slate-400">' + k[3] + '</div></div>'; }).join('') + '</div>' +
      (A.kec.length ? '<div class="mb-4"><div class="text-sm font-extrabold mb-2">Peringkat kecamatan</div><div class="space-y-1.5">' + kecH + '</div></div>' : '') +
      '<div class="text-sm font-extrabold mb-2">Desa/Kelurahan prioritas</div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-[11px] font-bold uppercase text-slate-500"><th class="px-2 py-2">#</th><th class="px-2 py-2">Desa/Kelurahan</th><th class="px-2 py-2">Skor</th><th class="px-2 py-2 text-center">Titik 24 jam</th><th class="px-2 py-2 text-center">FRP maks</th><th class="px-2 py-2 text-center">Est. luas terbakar</th><th class="px-2 py-2">Cuaca</th><th class="px-2 py-2">Faktor utama</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="9" class="px-2 py-4 text-center text-slate-500">Tidak ada titik panas terdeteksi dalam 7 hari terakhir.</td></tr>') + '</tbody></table></div>' +
      (D.length > 10 ? '<button type="button" id="an-more" class="mt-2 text-xs font-bold text-sky-700 dark:text-sky-300 underline">' + (ALL ? 'Tampilkan 10 teratas saja' : 'Tampilkan semua ' + D.length + ' desa/kelurahan') + '</button>' : '') +
      '<div class="text-sm font-extrabold mt-5 mb-2">Rekomendasi sistem untuk pemerintah</div><ul class="space-y-2">' + recH + '</ul>' +
      '<details class="mt-4 text-xs text-slate-600 dark:text-slate-300"><summary class="cursor-pointer font-bold">Cara skor dihitung &amp; batasannya</summary><div class="mt-2 space-y-1"><p>Skor = jumlah titik 24 jam (maks 25) + intensitas FRP (20) + keyakinan tinggi ≥80% (10) + persistensi hari terdeteksi (15) + klaster ≤1,5 km (10) + estimasi luas terbakar dari FRP (10; 50 ha = nilai penuh) + cuaca: hujan 7 hari kecil &amp; angin kuat menaikkan skor (10). Kelas: Rendah &lt; 30, Sedang 30–49, Tinggi 50–69, Sangat Tinggi ≥ 70. Skor kecamatan = 60% desa tertinggi + 40% rata-rata 3 desa tertinggi.</p><p>Estimasi luas terbakar dihitung dari energi api (FRP) × durasi api ÷ beban bahan bakar, ditampilkan sebagai rentang rendah–tinggi; titik ≤1,5 km digabung sebagai satu klaster. Ini perkiraan, bukan hasil ukur lapangan. Analisis belum memuat jenis lahan/gambut, kepadatan penduduk, dan akses lapangan; gunakan bersama laporan lapangan dan keputusan petugas berwenang.</p></div></details>';
    wire(c);
  }
  function wire(c) {
    var q = function (id, fn) { var b = c.querySelector('#' + id); if (b) b.onclick = fn; };
    q('an-more', function () { ALL = !ALL; render(); });
    q('an-csv', csv); q('an-copy', copy); q('an-print', print);
  }
  function csv() {
    if (!last) return; var qq = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var L = [['Peringkat', 'Desa/Kelurahan', 'Kecamatan', 'Skor', 'Kelas', 'Titik 24 jam', 'Titik 7 hari', 'Confidence tinggi', 'FRP maks (MW)', 'FRP total (MW)', 'Estimasi luas terbakar 24 jam (ha)', 'Rentang luas rendah (ha)', 'Rentang luas tinggi (ha)', 'Hari terdeteksi (7 hr)', 'Hari berturut-turut', 'Hujan 7 hari (mm)', 'Angin (km/jam)', 'Faktor utama', 'Latitude', 'Longitude'].map(qq).join(',')];
    last.desa.forEach(function (d, i) { L.push([i + 1, d.desa, d.kec, d.score, d.lv.n, d.n24, d.n7, d.hi, f1(d.frpMax), f1(d.frpSum), f1(d.ha), f1(d.haLo), f1(d.haHi), d.days, d.run, d.hasWx ? f1(d.wx.rain7) : '', d.wx && d.wx.wind != null ? Math.round(d.wx.wind) : '', d.why.join('; '), d.lat.toFixed(5), d.lng.toFixed(5)].map(qq).join(',')); });
    var a = document.createElement('a'), u = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.href = u; a.download = 'analisis-rawan-karhutla-' + last.today + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }
  function summaryText() {
    var A = last, R = recs(A), n = new Date(A.now), L = ['ANALISIS RAWAN KEBAKARAN HUTAN & LAHAN - KABUPATEN KATINGAN', tglID(n) + ' ' + jamID(n), 'Titik panas 24 jam: ' + A.r24.length + ' | Desa Sangat Tinggi: ' + A.desa.filter(function (d) { return d.score >= 70; }).length + ' | Tinggi: ' + A.desa.filter(function (d) { return d.score >= 50 && d.score < 70; }).length, '', 'PRIORITAS DESA:'];
    A.desa.slice(0, 8).forEach(function (d, i) { L.push((i + 1) + '. ' + d.desa + ' (Kec. ' + d.kec + ') - ' + d.lv.n + ' ' + d.score + ' - ' + d.n24 + ' titik/24 jam, FRP maks ' + f1(d.frpMax) + ' MW'); });
    L.push('', 'REKOMENDASI:'); R.forEach(function (r) { L.push('[' + r.pr + '] ' + r.who + ': ' + r.t); });
    L.push('', 'Catatan: indikatif; estimasi luas terbakar dihitung dari FRP x durasi api / beban bahan bakar (rentang rendah-tinggi), bukan hasil ukur lapangan. Verifikasi lapangan diperlukan.'); return L.join('\n');
  }
  function copy() {
    if (!last) return; var t = summaryText();
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { if (window.KN) KN.notify('Ringkasan disalin. Tempel ke WhatsApp/dokumen.', 'ok'); }).catch(function () { window.prompt('Salin ringkasan:', t); });
  }
  function print() {
    if (!last) return; var A = last, R = recs(A), n = new Date(A.now), w = window.open('', '_blank'); if (!w) { if (window.KN) KN.notify('Pop-up diblokir. Izinkan pop-up untuk mencetak.', 'warn'); return; }
    var rows = A.desa.slice(0, 20).map(function (d, i) { return '<tr><td>' + (i + 1) + '</td><td>' + h(d.desa) + '</td><td>' + h(d.kec) + '</td><td style="color:' + d.lv.c + ';font-weight:700">' + h(d.lv.n) + ' (' + d.score + ')</td><td>' + d.n24 + '</td><td>' + f1(d.frpMax) + '</td><td>' + f1(d.ha) + '</td><td>' + h(d.why.join('; ')) + '</td></tr>'; }).join('');
    w.document.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Analisis Rawan Karhutla Katingan</title><style>body{font:12px/1.45 system-ui,sans-serif;margin:24px;color:#0f172a}h1{font-size:17px;margin:0}h2{font-size:14px;margin:18px 0 6px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f5f9}li{margin:0 0 6px}.pr{font-weight:800}small{color:#64748b}</style></head><body><h1>Analisis Daerah Rawan Kebakaran Hutan &amp; Lahan - Kabupaten Katingan</h1><small>' + h(tglID(n)) + ' · ' + h(jamID(n)) + ' · Titik panas 24 jam: ' + A.r24.length + '</small><h2>Desa/Kelurahan prioritas</h2><table><thead><tr><th>#</th><th>Desa/Kelurahan</th><th>Kecamatan</th><th>Kelas (skor)</th><th>Titik 24 jam</th><th>FRP maks (MW)</th><th>Est. luas terbakar (ha)</th><th>Faktor utama</th></tr></thead><tbody>' + rows + '</tbody></table><h2>Rekomendasi</h2><ul>' + R.map(function (r) { return '<li><span class="pr">[' + h(r.pr) + ']</span> <b>' + h(r.who) + '</b>: ' + h(r.t) + '<br><small>Dasar: ' + h(r.b) + '</small></li>'; }).join('') + '</ul><p><small>Catatan: skor indikatif untuk prioritas kewaspadaan. Estimasi luas terbakar dihitung dari FRP (rentang rendah–tinggi), bukan luas lahan terbakar pasti. Wajib diverifikasi di lapangan. Sumber: NASA FIRMS, BMKG, Open-Meteo.</small></p></body></html>');
    w.document.close(); setTimeout(function () { try { w.focus(); w.print(); } catch (e) { } }, 400);
  }

  /* ---------- pemicu ---------- */
  function tick() {
    if (document.hidden || typeof dataCache === 'undefined' || !dataCache || !$('ch-tren')) return;
    if (!wxAsked && window.__wx) { wxAsked = true; window.__wx.ensure().then(function () { wxReady = true; sigOld = ''; }); }
    var raw = dataCache.raw || [], sig = [raw.length, (dataCache.history || []).length, (raw[0] || {}).time, ((window.__pp && window.__pp.air && window.__pp.air()) || []).length, wxReady, ALL, document.documentElement.classList.contains('dark')].join('|');
    if (sig === sigOld && $('analisis-risiko')) return; sigOld = sig;
    try { render(); } catch (e) { console.error(e); }
  }
  setInterval(tick, 1500); window.addEventListener('load', function () { setTimeout(tick, 800); });
  window.AnalisisKit = { render: render, analyze: analyze, recs: recs };
})();
