/* admin-plus.js - tab "Sumber Air" (khusus admin): tambah, ubah, hapus titik sumber air + jarak terdekat.
   Memakai fungsi bawaan admin.html: api(), wrap(), esc(), toast(), ME, WIL. */
(function () {
  'use strict';
  var IKON = ['waves', 'droplets', 'droplet', 'cylinder', 'glass-water', 'route', 'map-pin', 'fire-extinguisher', 'truck', 'container', 'cloud-rain', 'fish', 'ship', 'anchor', 'pipette', 'shower-head', 'waypoints', 'trees'], JENIS = ['Sungai', 'Kolam', 'Sumur', 'Embung', 'Kanal', 'Lainnya'], DATA = [], pm, pmap, edit = null, ready = false;
  var g = function (id) { return document.getElementById(id); };
  var km = function (a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); };

  function inject() {
    if (ready || g('t-air')) return; var main = document.querySelector('main'); if (!main) return; ready = true;
    var s = document.createElement('section'); s.id = 't-air'; s.className = 'hidden grid lg:grid-cols-3 gap-4';
    s.innerHTML =
      '<form id="fair" class="card space-y-2 lg:col-span-1"><b class="text-sm flex items-center gap-1.5"><i data-lucide="droplets" class="w-4 h-4 text-sky-500"></i><span id="air-judul">Tambah Sumber Air</span></b>' +
      '<input type="hidden" id="air-id">' +
      '<div><label class="lb">Nama / penanda *</label><input id="air-nama" class="in" maxlength="80" required></div>' +
      '<div><label class="lb">Jenis *</label><select id="air-jenis" class="in">' + JENIS.map(function (j) { return '<option>' + j + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="lb">Ikon di peta (halaman index)</label><input type="hidden" id="air-ikon"><div id="air-ikons" class="flex flex-wrap gap-1.5"><button type="button" data-ik="" class="ikb px-2 h-9 rounded-lg border text-[11px] font-semibold">Otomatis</button>' + IKON.map(function (k) { return '<button type="button" data-ik="' + k + '" title="' + k + '" class="ikb w-9 h-9 rounded-lg border inline-flex items-center justify-center"><i data-lucide="' + k + '" class="w-4 h-4 pointer-events-none"></i></button>'; }).join('') + '</div><p class="text-[11px] text-slate-400 mt-1">"Otomatis" memakai ikon bawaan sesuai jenis.</p></div>' +
      '<div><label class="lb">Pilih lokasi di peta (klik / geser pin) *</label><div id="air-map" class="h-72 sm:h-96 rounded-xl border z-0"></div></div>' +
      '<div class="grid grid-cols-2 gap-2"><div><label class="lb">Latitude *</label><input id="air-lat" class="in" required></div><div><label class="lb">Longitude *</label><input id="air-lng" class="in" required></div></div>' +
      '<button type="button" id="air-gps" class="btn g w-full"><i data-lucide="locate-fixed" class="w-4 h-4 inline -mt-0.5 mr-1"></i>Gunakan lokasi saya</button>' +
      '<p id="air-wil" class="text-[11px] font-bold"></p><p id="air-dekat" class="text-[11px] font-semibold text-sky-700 dark:text-sky-300"></p>' +
      '<div><label class="lb">Keterangan</label><input id="air-ket" class="in" maxlength="300" placeholder="mis. debit stabil, akses jalan tanah"></div>' +
      '<div class="flex gap-2"><button class="btn"><i data-lucide="save" class="w-4 h-4 inline -mt-0.5 mr-1"></i>Simpan</button><button type="button" id="air-reset" class="btn g">Kosongkan</button></div></form>' +
      '<div class="card lg:col-span-2 overflow-x-auto"><div class="flex flex-wrap justify-between items-center gap-2 mb-2"><b class="text-sm">Daftar Sumber Air (<span id="air-n">0</span>)</b><select id="air-f" class="in !w-auto"><option value="">Semua jenis</option>' + JENIS.map(function (j) { return '<option>' + j + '</option>'; }).join('') + '</select></div>' +
      '<table class="w-full text-xs"><thead class="text-left text-slate-500"><tr><th class="p-2">Nama</th><th>Jenis</th><th>Lokasi</th><th>Terdekat</th><th></th></tr></thead><tbody id="air-rows"></tbody></table></div>';
    main.appendChild(s);
    g('air-gps').onclick = function () { navigator.geolocation ? navigator.geolocation.getCurrentPosition(function (p) { put(p.coords.latitude, p.coords.longitude, true); }, function () { toast('Izin lokasi ditolak', 'error'); }, { enableHighAccuracy: true, timeout: 15000 }) : toast('Lokasi tidak didukung', 'error'); };
    g('air-lat').onchange = g('air-lng').onchange = function () { var a = parseFloat(g('air-lat').value), b = parseFloat(g('air-lng').value); if (!isNaN(a) && !isNaN(b)) put(a, b, true); };
    g('air-ikons').onclick = function (e) { var b = e.target.closest('button[data-ik]'); if (b) setIk(b.dataset.ik); };
    g('air-reset').onclick = reset; g('air-f').onchange = render;
    g('fair').onsubmit = function (e) {
      e.preventDefault();
      wrap(async function () {
        await api('airSave', { id: g('air-id').value, nama: g('air-nama').value, jenis: g('air-jenis').value, lat: g('air-lat').value, lng: g('air-lng').value, keterangan: g('air-ket').value, ikon: g('air-ikon').value });
        toast('Sumber air tersimpan', 'ok'); reset(); await load();
      });
    };
    g('air-rows').onclick = function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return; var x = DATA.filter(function (d) { return d.id === b.dataset.id; })[0]; if (!x) return;
      if (b.dataset.a === 'e') fillEdit(x);
      else if (confirm('Hapus sumber air "' + x.nama + '"?')) wrap(async function () { await api('airHapus', { id: x.id }); toast('Dihapus', 'ok'); await load(); });
    };
    setIk(''); if (window.lucide) lucide.createIcons();
  }
  /* ===== peta lengkap: layer dasar + batas wilayah + titik tersimpan ===== */
  var bound = null, saved = null;
  function inRing(p, r) { var x = p[0], y = p[1], c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
  function inPoly(p, rs) { if (!inRing(p, rs[0])) return false; for (var i = 1; i < rs.length; i++) if (inRing(p, rs[i])) return false; return true; }
  function wilayahAt(la, ln) {
    if (typeof GJ_DATA === 'undefined') return null;
    for (var i = 0; i < GJ_DATA.features.length; i++) { var f = GJ_DATA.features[i], g = f.geometry, ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (var k = 0; k < ps.length; k++) if (inPoly([ln, la], ps[k])) return f.properties; }
    return null;
  }
  var hue = function (t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return h; };
  function pinIcon(d) { return L.divIcon({ className: 'sa-pinwrap', html: '<div class="sa-pin" style="background:#0284c7"><span><i data-lucide="' + esc(d.ikon || 'map-pin') + '" style="width:15px;height:15px;color:#fff"></i></span></div>', iconSize: [30, 30], iconAnchor: [15, 36], popupAnchor: [0, -34] }); }
  function drawSaved() {
    if (!pmap) return; if (!saved) { saved = L.layerGroup().addTo(pmap); layersCtl && layersCtl.addOverlay(saved, 'Sumber Air Tersimpan'); }
    saved.clearLayers();
    DATA.forEach(function (d) { L.marker([d.lat, d.lng], { icon: pinIcon(d), title: d.nama }).bindPopup('<b>' + esc(d.nama) + '</b><br>' + esc(d.jenis) + (d.desa ? ' · ' + esc(d.desa) + ', ' + esc(d.kec) : '') + '<br><button type="button" class="btn !py-1 mt-1" data-pe="' + esc(d.id) + '">Ubah data ini</button>').addTo(saved); });
    if (window.lucide) setTimeout(function () { lucide.createIcons(); }, 0);
  }
  var layersCtl = null;
  function initMap() {
    if (pmap) { setTimeout(function () { pmap.invalidateSize(); }, 80); return; }
    pmap = L.map('air-map', { center: [-1.9, 112.9], zoom: 8 });
    var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(pmap);
    var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' });
    var d = new Date().toISOString().slice(0, 10), viirs = L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/' + d + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', { maxNativeZoom: 9, maxZoom: 19, attribution: 'NASA GIBS / VIIRS' });
    layersCtl = L.control.layers({ 'Peta Jalan (OSM)': osm, 'Citra Satelit (Esri)': sat, 'VIIRS True Color NASA (harian)': viirs }, {}, { collapsed: true }).addTo(pmap);
    if (typeof GJ_DATA !== 'undefined') {
      bound = L.geoJSON(GJ_DATA, {
        style: function (f) { var h = hue(f.properties.kecamatan || ''); return { color: '#0f172a', weight: 1, opacity: .7, fillColor: 'hsl(' + h + ',65%,50%)', fillOpacity: .16 }; },
        onEachFeature: function (f, l) { l.bindTooltip('<b>' + esc(f.properties.desa) + '</b><br>Kec. ' + esc(f.properties.kecamatan), { sticky: true }); }
      }).addTo(pmap); layersCtl.addOverlay(bound, 'Batas Wilayah (desa/kelurahan)');
      pmap.fitBounds(bound.getBounds());
    }
    pmap.on('click', function (e) { put(e.latlng.lat, e.latlng.lng, false); });
    drawSaved();
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-pe]'); if (!b) return; var x = DATA.filter(function (d) { return d.id === b.dataset.pe; })[0]; if (x) { fillEdit(x); pmap.closePopup(); } });
  function put(la, ln, fly) {
    g('air-lat').value = (+la).toFixed(6); g('air-lng').value = (+ln).toFixed(6);
    if (!pm) { pm = L.marker([la, ln], { draggable: true }).addTo(pmap); pm.on('dragend', function () { var p = pm.getLatLng(); put(p.lat, p.lng, false); }); }
    pm.setLatLng([la, ln]); if (fly) pmap.setView([la, ln], 14);
    var w = wilayahAt(+la, +ln), el = g('air-wil'); if (el) { el.textContent = w ? 'Lokasi: ' + w.desa + ', Kec. ' + w.kecamatan : 'Titik di luar batas wilayah Kabupaten Katingan'; el.className = 'text-[11px] font-bold ' + (w ? 'text-emerald-700' : 'text-red-600'); }
    var n = null, bd = 1e9; DATA.forEach(function (d) { if (d.id === g('air-id').value) return; var k = km(la, ln, d.lat, d.lng); if (k < bd) { bd = k; n = d; } });
    g('air-dekat').textContent = n ? 'Sumber air lain terdekat: ' + n.nama + ' (' + bd.toFixed(2) + ' km)' : '';
  }
  function fillEdit(x) { edit = x; g('air-id').value = x.id; g('air-nama').value = x.nama; g('air-jenis').value = x.jenis; g('air-ket').value = x.ket || ''; setIk(x.ikon || ''); g('air-judul').textContent = 'Ubah Sumber Air'; put(x.lat, x.lng, true); g('fair').scrollIntoView({ behavior: 'smooth' }); }
  function setIk(k) { g('air-ikon').value = k; document.querySelectorAll('#air-ikons .ikb').forEach(function (b) { var on = b.dataset.ik === k; b.classList.toggle('bg-sky-600', on); b.classList.toggle('text-white', on); b.classList.toggle('border-sky-600', on); }); }
  function reset() { g('fair').reset(); setIk(''); g('air-id').value = ''; edit = null; g('air-judul').textContent = 'Tambah Sumber Air'; g('air-dekat').textContent = ''; if (pm) { pmap.removeLayer(pm); pm = null; } }
  function render() {
    var f = g('air-f').value, l = DATA.filter(function (d) { return !f || d.jenis === f; });
    g('air-n').textContent = DATA.length;
    g('air-rows').innerHTML = l.length ? l.map(function (d) {
      var n = null, bd = 1e9; DATA.forEach(function (o) { if (o.id !== d.id) { var k = km(d.lat, d.lng, o.lat, o.lng); if (k < bd) { bd = k; n = o; } } });
      return '<tr class="border-t"><td class="p-2 font-semibold"><i data-lucide="' + esc(d.ikon || 'map-pin') + '" class="w-4 h-4 inline -mt-0.5 mr-1 text-sky-600"></i>' + esc(d.nama) + '</td><td>' + esc(d.jenis) + '</td><td>' + esc(d.desa ? d.desa + ', ' + d.kec : '-') + '<div class="text-[10px] text-slate-400">' + d.lat.toFixed(5) + ', ' + d.lng.toFixed(5) + '</div></td><td>' + (n ? esc(n.nama) + ' · ' + bd.toFixed(2) + ' km' : '-') + '</td><td class="whitespace-nowrap"><button class="btn g !py-1" data-a="e" data-id="' + esc(d.id) + '">Ubah</button> <button class="btn r !py-1" data-a="h" data-id="' + esc(d.id) + '">Hapus</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="p-3 text-center text-slate-500">Belum ada data.</td></tr>';
    if (window.lucide) lucide.createIcons();
  }
  async function load() { var j = await (await fetch(API + '?action=sumber_air&_=' + Date.now(), { cache: 'no-store' })).json(); DATA = j.daftar || []; render(); drawSaved(); }

  /* ===== menu berbentuk card (menggantikan tab menumpuk di header) ===== */
  var MENU = {
    ringkasan: ['layout-dashboard', 'Statistik laporan dan hotspot di wilayah Anda', 'from-emerald-500 to-emerald-700', 'Pantau'],
    laporan: ['clipboard-list', 'Daftar laporan kejadian dan perubahan status', 'from-sky-500 to-blue-700', 'Laporan'],
    riwayat: ['history', 'Riwayat laporan harian yang sudah masuk', 'from-indigo-500 to-indigo-700', 'Laporan'],
    buat: ['file-plus', 'Buat laporan kejadian kebakaran baru', 'from-orange-500 to-red-600', 'Laporan'],
    pdf: ['file-down', 'Unduh laporan harian dalam bentuk PDF', 'from-rose-500 to-red-700', 'Laporan'],
    ispa: ['stethoscope', 'Input dan rekap data ISPA per kecamatan', 'from-violet-500 to-purple-700', 'Data'],
    air: ['droplets', 'Kelola titik sumber air dan ikon di peta', 'from-cyan-500 to-sky-700', 'Data'],
    user: ['users', 'Kelola akun admin dan operator', 'from-amber-500 to-orange-600', 'Pengaturan'],
    log: ['scroll-text', 'Jejak aktivitas pengguna aplikasi', 'from-slate-500 to-slate-700', 'Pengaturan'],
    akun: ['key-round', 'Ganti password dan keamanan akun', 'from-teal-500 to-emerald-700', 'Pengaturan']
  };
  var title = {}, css = document.createElement('style'), T0 = Date.now();
  css.textContent = '#tabs{display:none!important}' +
    '@keyframes mc-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
    '.hh{position:relative;overflow:hidden;border-radius:24px;padding:20px;color:#fff;background:linear-gradient(135deg,#065f46,#0f766e 55%,#0e7490);box-shadow:0 10px 30px rgba(6,95,70,.28);margin-bottom:18px;animation:mc-in .4s both}' +
    '.hh::after{content:"";position:absolute;right:-40px;top:-50px;width:210px;height:210px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.18),transparent)}' +
    '.hh h2{font-size:clamp(20px,4vw,26px);font-weight:900;line-height:1.15}.hh .hs{font-size:12.5px;opacity:.88;margin-top:4px}' +
    '.hh .hc{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:4px 11px;font-size:11.5px;font-weight:700;margin:10px 6px 0 0;backdrop-filter:blur(4px)}' +
    '.kp{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:16px}@media(min-width:640px){.kp{grid-template-columns:repeat(4,1fr)}}' +
    '.kp>div{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:11px 13px;min-width:0}' +
    '.kp b{display:block;font-size:clamp(22px,5vw,28px);font-weight:900;line-height:1.1}.kp span{display:block;font-size:11.5px;opacity:.9;margin-top:2px}' +
    '.mg{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:18px 2px 8px}.dark .mg{color:#94a3b8}' +
    '.mgrid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))}' +
    '.mc{position:relative;display:flex;flex-direction:column;gap:12px;text-align:left;padding:16px;border-radius:20px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,.06);transition:transform .18s,box-shadow .18s,border-color .18s;cursor:pointer;width:100%;overflow:hidden;animation:mc-in .35s both;animation-delay:calc(var(--i,0)*40ms)}' +
    '.mc::before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,var(--a1),var(--a2));opacity:.9}' +
    '.mc:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(15,23,42,.14);border-color:#cbd5e1}.mc:active{transform:scale(.98)}.mc:focus-visible{outline:3px solid #14b8a6;outline-offset:2px}' +
    '.mc .mt{display:flex;align-items:center;gap:12px}.mc .mi{width:48px;height:48px;border-radius:15px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none;box-shadow:0 6px 14px rgba(15,23,42,.18)}' +
    '.mc b{display:block;font-size:15px;line-height:1.2}.mc small{display:block;color:#64748b;font-size:12px;line-height:1.35;margin-top:3px}' +
    '.mc .mv{margin-left:auto;flex:none;color:#94a3b8;transition:transform .18s}.mc:hover .mv{transform:translateX(3px);color:#0d9488}' +
    '.mc .mf{display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-top:1px dashed #e2e8f0;padding-top:10px;min-height:34px}' +
    '.mc .bd{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;background:#f1f5f9;color:#334155}.mc .bd.w{background:#fef3c7;color:#92400e}.mc .bd.g{background:#d1fae5;color:#065f46}.mc .bd.r{background:#fee2e2;color:#991b1b}.mc .bd.b{background:#e0f2fe;color:#075985}' +
    '.dark .mc{background:#1e293b;border-color:#334155}.dark .mc small{color:#94a3b8}.dark .mc .mf{border-color:#334155}.dark .mc .bd{background:#334155;color:#e2e8f0}.dark .mc .bd.w{background:#78350f;color:#fde68a}.dark .mc .bd.g{background:#064e3b;color:#a7f3d0}.dark .mc .bd.r{background:#7f1d1d;color:#fecaca}.dark .mc .bd.b{background:#0c4a6e;color:#bae6fd}' +
    '@media(prefers-reduced-motion:reduce){.mc,.hh{animation:none}.mc:hover{transform:none}}' +
    '.sa-pinwrap{background:none;border:0}.sa-pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}.sa-pin span{transform:rotate(45deg);display:flex}';
  document.head.appendChild(css);
  var COL = { emerald: ['#10b981', '#047857'], sky: ['#0ea5e9', '#1d4ed8'], indigo: ['#6366f1', '#4338ca'], orange: ['#f97316', '#dc2626'], rose: ['#f43f5e', '#b91c1c'], violet: ['#8b5cf6', '#7e22ce'], cyan: ['#06b6d4', '#0369a1'], amber: ['#f59e0b', '#ea580c'], slate: ['#64748b', '#334155'], teal: ['#14b8a6', '#047857'] };
  function acc(cls) { var m = /from-(\w+)-\d+/.exec(cls || ''); return COL[m && m[1]] || COL.slate; }
  var wibDay = function (off) { return new Date(Date.now() + 7 * 36e5 + (off || 0) * 864e5).toISOString().slice(0, 10); };
  var n0 = function (v) { return Number(v || 0).toLocaleString('id-ID'); };
  function stats() {
    var L = (typeof LAP !== 'undefined' && LAP) || [], H = (typeof HSA !== 'undefined' && HSA) || [], td = wibDay(0), yd = wibDay(-1), now = Date.now();
    var hari = L.filter(function (x) { return String(x.Tgl || '').slice(0, 10) === td; }).length;
    var belum = L.filter(function (x) { return typeof ST !== 'undefined' && ST.indexOf(x.Status) >= 0 && ST.indexOf(x.Status) <= 2; }).length;
    var selesai = L.filter(function (x) { return typeof ST !== 'undefined' && x.Status === ST[5]; }).length;
    var h24 = H.filter(function (h) { var t = Date.parse(String(h.time || '').replace(' ', 'T') + '+07:00'); return !isNaN(t) && now - t <= 864e5; }).length;
    var tinggi = H.filter(function (h) { return (+h.confidence || 0) >= 80; }).length;
    var kmrn = L.filter(function (x) { return String(x.Tgl || '').slice(0, 10) === yd; }).length;
    return { tot: L.length, hari: hari, kmrn: kmrn, belum: belum, selesai: selesai, h24: h24, hs: H.length, tinggi: tinggi, ready: L.length + H.length > 0 || Date.now() - T0 > 7000, sig: L.length + '|' + H.length + '|' + hari + '|' + belum };
  }
  function foot(id, st) {
    var w = function (c, t) { return '<span class="bd ' + c + '">' + t + '</span>'; }, p = function () { return '<span class="bd"><i class="kf-mini"></i>Memuat</span>'; };
    if (!st.ready && /^(ringkasan|laporan|riwayat|buat|pdf)$/.test(id)) return p();
    switch (id) {
      case 'ringkasan': return w('g', n0(st.tot) + ' laporan') + w(st.h24 ? 'r' : 'g', n0(st.h24) + ' hotspot 24 jam');
      case 'laporan': return w('b', n0(st.tot) + ' total') + (st.belum ? w('w', n0(st.belum) + ' belum terverifikasi') : w('g', 'Semua terverifikasi'));
      case 'riwayat': return w('b', n0(st.hari) + ' laporan hari ini') + w('', n0(st.kmrn) + ' kemarin');
      case 'buat': return w(st.hs ? 'r' : 'g', n0(st.hs) + ' hotspot terdeteksi') + (st.tinggi ? w('w', n0(st.tinggi) + ' keyakinan tinggi') : '');
      case 'pdf': return w('b', n0(st.selesai) + ' selesai') + w('', n0(st.tot) + ' laporan');
      case 'ispa': return w('b', 'Per kecamatan') + w('', 'Rekap mingguan');
      case 'air': return w('b', 'Peta &amp; jarak') + w('', 'Tambah/ubah');
      case 'user': return w('b', 'Admin &amp; operator') + w('', 'Hak per wilayah');
      case 'log': return w('', 'Audit aktivitas');
      case 'akun': return w('g', 'Password aman') + w('', 'Sesi login');
    }
    return '';
  }
  var homeSig = '';
  function home(soft) {
    var main = document.querySelector('main'), sec = g('t-home');
    if (!sec) { sec = document.createElement('section'); sec.id = 't-home'; main.insertBefore(sec, main.firstChild); }
    var btns = document.querySelectorAll('#tabs [data-t]'), me = (typeof ME !== 'undefined' && ME) || {}, st = stats();
    if (soft && homeSig === st.sig + '|' + btns.length) return; homeSig = st.sig + '|' + btns.length;
    var role = me.r === 'admin' ? 'Admin' : (me.t === 'puskesmas' ? 'Dinkes / Puskesmas' : 'Operator'), wil = me.r === 'admin' ? 'Seluruh Kabupaten Katingan' : (me.t === 'desa' ? 'Desa ' + (me.d || '') + ', Kec. ' + (me.k || '') : 'Kec. ' + (me.k || ''));
    var tg = typeof fmtTgl === 'function' ? fmtTgl(wibDay(0)) : wibDay(0), jam = (new Date(Date.now() + 7 * 36e5)).getUTCHours(), salam = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam';
    var tile = function (v, l, ok) { return '<div><b>' + (ok ? n0(v) : '<i class="kf-mini" style="width:1.1em;height:1.1em"></i>') + '</b><span>' + l + '</span></div>'; };
    var groups = [], gi = {};
    Array.prototype.forEach.call(btns, function (b) {
      var id = b.dataset.t, m = MENU[id] || ['layout-grid', '', 'from-slate-500 to-slate-700', 'Lainnya']; title[id] = b.textContent.trim();
      if (!(m[3] in gi)) { gi[m[3]] = groups.length; groups.push([m[3], []]); }
      var c = acc(m[2]);
      groups[gi[m[3]]][1].push('<button type="button" class="mc" style="--a1:' + c[0] + ';--a2:' + c[1] + ';--i:' + groups[gi[m[3]]][1].length + '" data-go="' + esc(id) + '" aria-label="Buka menu ' + esc(title[id]) + '"><span class="mt"><span class="mi bg-gradient-to-br ' + m[2] + '"><i data-lucide="' + m[0] + '" class="w-6 h-6"></i></span><span style="min-width:0"><b>' + esc(title[id]) + '</b><small>' + esc(m[1]) + '</small></span><i data-lucide="chevron-right" class="w-5 h-5 mv"></i></span><span class="mf">' + foot(id, st) + '</span></button>');
    });
    sec.innerHTML = '<div class="hh"><h2>' + salam + ', ' + esc(me.n || '') + '</h2><div class="hs">' + esc(tg) + '</div>' +
      '<span class="hc"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i>' + esc(role) + '</span><span class="hc"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i>' + esc(wil) + '</span>' +
      '<div class="kp">' + tile(st.hari, 'Laporan hari ini', st.ready) + tile(st.belum, 'Belum terverifikasi', st.ready) + tile(st.h24, 'Hotspot 24 jam', st.ready) + tile(st.tot, 'Total laporan', st.ready) + '</div></div>' +
      groups.map(function (g2) { return '<div class="mg">' + esc(g2[0]) + '</div><div class="mgrid">' + g2[1].join('') + '</div>'; }).join('');
    if (window.lucide) lucide.createIcons();
  }
  // perbarui kartu otomatis saat data selesai dimuat (hanya jika menu utama sedang tampil)
  setInterval(function () { var h = g('t-home'); if (h && !h.classList.contains('hidden') && !document.hidden) home(true); }, 1500);
  function bar(t) {
    var b = g('sec-bar'), main = document.querySelector('main');
    if (!b) { b = document.createElement('div'); b.id = 'sec-bar'; b.className = 'flex items-center gap-3 mb-3'; b.innerHTML = '<button type="button" id="sec-back" class="btn g inline-flex items-center gap-1.5"><i data-lucide="arrow-left" class="w-4 h-4"></i>Menu</button><b id="sec-title" class="text-base sm:text-lg"></b>'; main.insertBefore(b, main.firstChild); g('sec-back').onclick = function () { window.show('home'); }; if (window.lucide) lucide.createIcons(); }
    b.classList.toggle('hidden', t === 'home'); g('sec-title').textContent = title[t] || (t === 'air' ? 'Sumber Air' : '');
  }
  document.addEventListener('click', function (e) { var c = e.target.closest && e.target.closest('[data-go]'); if (c) window.show(c.dataset.go); });
  // sambungkan ke show() bawaan
  var show0 = window.show;
  window.show = function (t) {
    if (t === 'home') { home(); document.querySelectorAll('main>section').forEach(function (s) { s.classList.toggle('hidden', s.id !== 't-home'); }); bar('home'); window.scrollTo(0, 0); return; }
    if (t === 'air') inject();
    show0(t); bar(t);
    if (t === 'air') { initMap(); wrap(load); }
    window.scrollTo(0, 0);
  };
  // (indikator loading api untuk semua permintaan data kini ditangani global di js/ui.js)
  // tab "Sumber Air" untuk admin (masuk ke daftar menu)
  new MutationObserver(function () {
    var nav = g('tabs'); if (!nav || typeof ME === 'undefined' || !ME || ME.r !== 'admin' || nav.querySelector('[data-t="air"]')) return;
    var b = document.createElement('button'); b.className = 'tab flex items-center gap-1.5'; b.dataset.t = 'air'; b.innerHTML = '<i data-lucide="droplets" class="w-4 h-4 pointer-events-none"></i>Sumber Air';
    var ispa = nav.querySelector('[data-t="ispa"]'); nav.insertBefore(b, ispa ? ispa.nextSibling : nav.lastElementChild); if (window.lucide) lucide.createIcons();
    if (g('t-home') && !g('t-home').classList.contains('hidden')) home();
  }).observe(document.body, { childList: true, subtree: true });
})();
