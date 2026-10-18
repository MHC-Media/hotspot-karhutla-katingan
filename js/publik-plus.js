/* publik-plus.js - tambahan dashboard publik (tidak mengubah kode lama):
   1) layer peta citra harian VIIRS True Color (NASA GIBS)  2) sumber air + jarak terdekat
   3) statistik, grafik & tabel lengkap (hotspot, satelit, keyakinan, heatmap, ISPA) */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var WIB = function (o) { return new Date(Date.now() + 7 * 36e5 - (o || 0) * 864e5).toISOString().slice(0, 10); };
  var dayOf = function (t) { var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(t || '')); return m ? m[1] : ''; };
  var km = function (a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2), q = x * x + Math.cos(a * r) * Math.cos(c * r) * y * y; return 12742 * Math.asin(Math.sqrt(q)); };
  var CH = {}, AIR = [], ME = null, ISPA = null, seen = false, lastKey = '', airVer = 0, JENIS_C = { Sungai: '#0284c7', Kolam: '#0d9488', Sumur: '#7c3aed', Embung: '#2563eb', Kanal: '#0891b2', Lainnya: '#64748b' };
  var dark = function () { return document.documentElement.classList.contains('dark'); };
  var CARD = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 sm:p-5';
  var TH = 'text-left text-xs font-bold uppercase text-slate-500 dark:text-slate-400 px-3 py-2', TD = 'px-3 py-2 border-t border-slate-100 dark:border-slate-800';

  /* ---------- 1. LAYER VIIRS TRUE COLOR (NASA GIBS) ---------- */
  function initViirs() {
    if (typeof map === 'undefined' || typeof layersCtl === 'undefined') return;
    var tgl = WIB(0), err = 0;
    var url = function (d) { return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/' + d + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'; };
    var lyr = L.tileLayer(url(tgl), { maxNativeZoom: 9, maxZoom: 18, attribution: 'Citra harian VIIRS True Color &copy; NASA GIBS / EOSDIS (Suomi NPP)' });
    layersCtl.addBaseLayer(lyr, 'Citra Harian VIIRS True Color (NASA GIBS)');
    var ctl = L.control({ position: 'bottomleft' });
    ctl.onAdd = function () {
      var d = L.DomUtil.create('div', 'leaflet-bar'); d.style.cssText = 'background:#fff;padding:6px 8px;font:600 11px system-ui;color:#0f172a;border-radius:8px';
      d.innerHTML = 'Citra VIIRS <input id="gibs-d" type="date" max="' + WIB(0) + '" value="' + tgl + '" style="font:inherit;border:1px solid #cbd5e1;border-radius:6px;padding:1px 4px"> <button id="gibs-p" type="button" style="border:1px solid #cbd5e1;border-radius:6px;padding:0 6px">‹</button> <button id="gibs-n" type="button" style="border:1px solid #cbd5e1;border-radius:6px;padding:0 6px">›</button>';
      L.DomEvent.disableClickPropagation(d); return d;
    };
    var set = function (v) { if (!v || v > WIB(0)) return; tgl = v; err = 0; lyr.setUrl(url(v)); if ($('gibs-d')) $('gibs-d').value = v; };
    var step = function (n) { var t = new Date(tgl + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); set(t.toISOString().slice(0, 10)); };
    map.on('baselayerchange', function (e) {
      if (e.layer === lyr) { ctl.addTo(map); $('gibs-d').onchange = function () { set(this.value); }; $('gibs-p').onclick = function () { step(-1); }; $('gibs-n').onclick = function () { step(1); }; }
      else if (ctl._map) map.removeControl(ctl);
    });
    lyr.on('tileerror', function () { if (++err === 8 && tgl === WIB(0)) step(-1); }); // citra hari ini belum tersedia -> kemarin
  }

  /* ---------- 2. SUMBER AIR ---------- */
  var airGroup = null, userPos = null, nearest = function (la, ln) {
    var b = null, bd = 1e9; AIR.forEach(function (a) { var d = km(la, ln, a.lat, a.lng); if (d < bd) { bd = d; b = a; } }); return b ? { a: b, d: bd } : null;
  };
  function grp() { if (!airGroup) { airGroup = L.layerGroup(); if (typeof layersCtl !== 'undefined') layersCtl.addOverlay(airGroup, 'Sumber Air'); } return airGroup; }
  var nearG = null, hint = null, panel = null, picking = false, seq = 0, chipAir = null, chipNear = null, MK = {};
  /* ===== ikon lucide (format ikon v0.469: ['svg', attrs, [anak]]) ===== */
  var SA = { Sungai: { c: '#0284c7', k: 'waves' }, Kolam: { c: '#0d9488', k: 'droplets' }, Sumur: { c: '#4f46e5', k: 'cylinder' }, Embung: { c: '#2563eb', k: 'glass-water' }, Kanal: { c: '#0891b2', k: 'route' }, Lainnya: { c: '#64748b', k: 'map-pin' } };
  var TAGS = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'];
  function nodesOf(n) { if (!n) return null; if (n[0] === 'svg' && Array.isArray(n[2])) return n[2]; if (Array.isArray(n) && Array.isArray(n[0])) return n; return n.iconNode || null; }
  function ico(j, sz, col, ik) {
    var t = SA[j] || SA.Lainnya, kb = /^[a-z0-9-]{2,30}$/.test(ik || '') ? ik : t.k;
    var pc = kb.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join('');
    var nodes = nodesOf(window.lucide && lucide.icons && lucide.icons[pc]);
    nodes = nodes && nodes.filter(function (x) { return Array.isArray(x) && TAGS.indexOf(x[0]) >= 0; });
    if (!nodes || !nodes.length) return '<i data-lucide="' + kb + '" style="display:inline-block;width:' + sz + 'px;height:' + sz + 'px;color:' + col + '"></i>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="' + col + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + nodes.map(function (x) { return '<' + x[0] + ' ' + Object.keys(x[1] || {}).filter(function (k) { return k !== 'key'; }).map(function (k) { return k + '="' + h(x[1][k]) + '"'; }).join(' ') + '/>'; }).join('') + '</svg>';
  }
  function pin(j, ik) { var t = SA[j] || SA.Lainnya; return L.divIcon({ className: 'sa-pinwrap', html: '<div class="sa-pin" style="background:' + t.c + '"><span>' + ico(j, 15, '#fff', ik) + '</span></div>', iconSize: [30, 30], iconAnchor: [15, 36], popupAnchor: [0, -34] }); }
  function css() {
    if ($('sa-css')) return; var st = document.createElement('style'); st.id = 'sa-css';
    st.textContent = '.sa-pinwrap{background:none;border:0}.sa-pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}.sa-pin span{transform:rotate(45deg);display:flex}' +
      '.sa-popup .leaflet-popup-content-wrapper{padding:0;border-radius:20px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,.38)}.sa-popup .leaflet-popup-content{margin:0!important;width:min(300px,78vw)!important}.sa-popup a.leaflet-popup-close-button{color:#fff!important;top:10px;right:10px;font-size:22px;z-index:3}' +
      '.sa-pop{font:13px/1.35 system-ui,sans-serif;color:#0f172a}.sa-hd{display:flex;gap:12px;align-items:center;padding:16px 38px 15px 14px;color:#fff;background-image:linear-gradient(135deg,rgba(255,255,255,.14),rgba(0,0,0,.2))}' +
      '.sa-ic{width:54px;height:54px;border-radius:16px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.32);display:flex;align-items:center;justify-content:center;flex:none}.sa-k{font-size:11px;opacity:.88;font-weight:600}.sa-t{font-weight:800;font-size:16px;line-height:1.2;margin:2px 0}.sa-l{font-size:12px;opacity:.92}' +
      '.sa-bd{padding:12px 14px;display:flex;flex-direction:column;gap:9px}.sa-loc{width:100%;border:1.5px dashed #94a3b8;border-radius:14px;padding:11px;text-align:center;font-weight:800;color:#0f766e;background:transparent;cursor:pointer;font-size:13px}' +
      '.sa-dist{border-radius:14px;background:#e3f3f0;padding:10px 12px;display:flex;justify-content:space-between;align-items:flex-end;gap:8px}.sa-dist .dl{font-size:11px;color:#475569}.sa-dist .dv{font-size:22px;font-weight:900;line-height:1.1}.sa-dist small{font-size:11px;font-weight:500;color:#64748b}' +
      '.sa-bdg{background:#0f766e;color:#fff;font-size:10px;font-weight:800;border-radius:999px;padding:2px 9px;white-space:nowrap}.sa-note{border-radius:12px;background:#edf3f7;padding:10px 12px}' +
      '.sa-go{display:block;text-align:center;font-weight:800;color:#fff!important;text-decoration:none;border-radius:14px;padding:12px;background-image:linear-gradient(135deg,rgba(255,255,255,.12),rgba(0,0,0,.14))}.sa-ft{font-size:11px;color:#64748b}' +
      '.sa-panel{width:min(340px,calc(100vw - 28px));max-height:70vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 14px 34px rgba(15,23,42,.38);font:13px/1.35 system-ui,sans-serif;color:#0f172a;margin:0 0 22px 10px!important}' +
      '.sa-ph{display:flex;justify-content:space-between;align-items:center;padding:12px 12px 12px 16px;color:#fff;font-weight:800;font-size:15px;background:linear-gradient(135deg,#0e7490,#0f766e)}.sa-ph button{width:34px;height:34px;border-radius:10px;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:17px;cursor:pointer;margin-left:6px}' +
      '.sa-ps{padding:9px 16px 4px;color:#64748b;font-size:12px}.sa-it{display:flex;gap:10px;align-items:center;margin:8px 12px;padding:10px;border:1px solid #cdeae6;background:#effaf8;border-radius:14px;cursor:pointer}.sa-ii{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none}' +
      '.sa-im{flex:1;min-width:0}.sa-im small,.sa-id small{display:block;color:#64748b;font-size:11px}.sa-id{text-align:right;white-space:nowrap}.sa-id b{font-size:15px}.sa-pb{display:flex;gap:8px;padding:6px 12px 12px}.sa-pb a,.sa-pb button{flex:1;text-align:center;border-radius:12px;padding:11px 6px;font-weight:800;font-size:12.5px;cursor:pointer;text-decoration:none}' +
      '.sa-b1{background:#0f9488;color:#fff!important;border:0}.sa-b2{background:transparent;color:#0f766e!important;border:1.5px solid #a7d8d2}.sa-es{display:inline-block;background:#fef3c7;color:#92400e;border-radius:6px;padding:0 5px;font-size:10px;font-weight:700}' +
      '.dark .sa-pop,.dark .sa-panel{color:#e2e8f0}.dark .sa-panel,.dark .sa-popup .leaflet-popup-content-wrapper,.dark .sa-popup .leaflet-popup-tip{background:#1e293b}.dark .sa-dist{background:#134e4a}.dark .sa-note{background:#334155}.dark .sa-it{background:#0f3a3a;border-color:#155e5a}.dark .sa-dist small,.dark .sa-dist .dl,.dark .sa-ft,.dark .sa-ps,.dark .sa-im small,.dark .sa-id small{color:#94a3b8}';
    document.head.appendChild(st);
  }
  var gm = function (o, a) { return 'https://www.google.com/maps/dir/?api=1&destination=' + a.lat + ',' + a.lng + '&travelmode=driving' + (o ? '&origin=' + o[0] + ',' + o[1] : ''); };
  var fT = function (s) { var m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + ' mnt' : Math.floor(m / 60) + ' j ' + (m % 60) + ' mnt'; };
  var fk = function (d) { return (d < 10 ? d.toFixed(2) : d.toFixed(1)).replace('.', ','); };
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var fTgl = function (t) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t || '')); return m ? (+m[3]) + ' ' + BLN[+m[2] - 1] + ' ' + m[1] : ''; };
  var wil = function (a) { return a.desa ? 'Desa/Kel. ' + a.desa + (a.kec ? ', Kec. ' + a.kec : '') : (a.kec ? 'Kec. ' + a.kec : ''); };
  var isNear = function (a) { if (!userPos) return false; var b = nearest(userPos[0], userPos[1]); return !!b && b.a.id === a.id; };
  function popAir(a) {
    var c = (SA[a.jenis] || SA.Lainnya).c, who = [a.oleh, fTgl(a.tgl)].filter(Boolean).join(' · ');
    var top = userPos
      ? '<div class="sa-dist" data-sa-d="' + h(a.id) + '"><div><div class="dl">Jarak dari lokasi Anda saat ini</div><div class="dv"><b>' + fk(km(userPos[0], userPos[1], a.lat, a.lng)) + ' km</b> <small>garis lurus</small></div></div>' + (isNear(a) ? '<span class="sa-bdg">Terdekat</span>' : '') + '</div>'
      : '<button type="button" class="sa-loc" data-sa-loc="' + h(a.id) + '">📍 Hitung jarak dari lokasi saya</button>';
    return '<div class="sa-pop"><div class="sa-hd" style="background-color:' + c + '"><div class="sa-ic">' + ico(a.jenis, 26, '#fff', a.ikon) + '</div><div><div class="sa-k">Sumber air · ' + h(a.jenis) + '</div><div class="sa-t">' + h(a.nama) + '</div><div class="sa-l">' + h(wil(a)) + '</div></div></div><div class="sa-bd">' + top +
      (a.ket ? '<div class="sa-note">' + h(a.ket) + '</div>' : '') + '<a class="sa-go" style="background-color:' + c + '" href="' + gm(userPos, a) + '" target="_blank" rel="noopener">Rute di Google Maps</a><div class="sa-ft">' + a.lat.toFixed(5) + ', ' + a.lng.toFixed(5) + (who ? ' · ' + h(who) : '') + '</div></div></div>';
  }
  /* ===== rute jalan (OSRM / data OpenStreetMap). Bila gagal: estimasi jarak & waktu saja, tanpa garis lurus. Google Maps dibuka lewat tombol. ===== */
  function osrm(p) { var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 9000); return fetch('https://router.project-osrm.org/' + p, { signal: ac.signal }).then(function (r) { return r.json(); }).then(function (j) { if (j.code !== 'Ok') throw new Error('x'); return j; }).finally(function () { clearTimeout(t); }); }
  var estim = function (x) { var d = x.d * 1.35; return { a: x.a, d: d, t: d / 30 * 3600, est: true }; };
  function roads(o, list) {
    var c = list.slice(0, 6);
    return osrm('table/v1/driving/' + [o[1] + ',' + o[0]].concat(c.map(function (x) { return x.a.lng + ',' + x.a.lat; })).join(';') + '?sources=0&annotations=distance,duration').then(function (j) {
      return c.map(function (x, i) { var d = j.distances[0][i + 1], t = j.durations[0][i + 1]; return d == null ? estim(x) : { a: x.a, d: d / 1000, t: t, road: true }; });
    }).catch(function () { return c.map(estim); });
  }
  function line(o, x, main) {
    if (!x.road) return Promise.resolve();
    return osrm('route/v1/driving/' + o[1] + ',' + o[0] + ';' + x.a.lng + ',' + x.a.lat + '?overview=full&geometries=geojson').then(function (j) {
      L.geoJSON(j.routes[0].geometry, { style: { color: main ? '#0369a1' : '#38bdf8', weight: main ? 5 : 3, opacity: .9, dashArray: main ? null : '8 6' } }).bindTooltip(fk(x.d) + ' km · ' + fT(x.t), { sticky: true }).addTo(nearG);
    }).catch(function () { });
  }
  /* ===== panel "Sumber air terdekat" ===== */
  function showPanel() {
    if (!panel) {
      panel = L.control({ position: 'bottomleft' });
      panel.onAdd = function () {
        var d = L.DomUtil.create('div', 'sa-panel'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        d.addEventListener('click', function (e) {
          var b = e.target.closest('[data-sa-act]'), it = e.target.closest('[data-sa-id]');
          if (b) { var k = b.dataset.saAct; if (k === 'close') clearNear(); else if (k === 'refresh') startGPS(); else if (k === 'pick') { picking = true; if (hint) hint.textContent = 'Ketuk peta untuk menandai titik acuan…'; } return; }
          if (it) { var a = AIR.filter(function (x) { return x.id === it.dataset.saId; })[0]; if (a) { map.flyTo([a.lat, a.lng], 15); if (MK[a.id]) setTimeout(function () { MK[a.id].openPopup(); }, 600); } }
        });
        return d;
      };
      panel.addTo(map);
    }
    return panel.getContainer();
  }
  function clearNear() { if (nearG) nearG.clearLayers(); if (panel) { map.removeControl(panel); panel = null; } picking = false; if (hint) hint.textContent = ''; syncChips(); }
  function nearFrom(la, ln, acc, label) {
    if (!AIR.length) { if (hint) hint.textContent = 'Data sumber air belum tersedia.'; return; }
    if (!nearG) nearG = L.layerGroup().addTo(map); nearG.clearLayers(); map.addLayer(grp()); css();
    var my = ++seq, o = [la, ln], P = showPanel();
    var head = '<div class="sa-ph"><span>Sumber air terdekat</span><span><button data-sa-act="refresh" title="Perbarui lokasi GPS">↻</button><button data-sa-act="close" title="Tutup">✕</button></span></div>';
    P.innerHTML = head + '<div class="sa-ps">Mencari rute jalan terdekat…</div>'; syncChips();
    L.circleMarker(o, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip(label || 'Titik acuan').addTo(nearG);
    if (acc && acc < 3000) L.circle(o, { radius: acc, color: '#2563eb', weight: 1, fillOpacity: .08 }).addTo(nearG);
    var cand = AIR.map(function (a) { return { a: a, d: km(la, ln, a.lat, a.lng) }; }).sort(function (x, y) { return x.d - y.d; });
    roads(o, cand).then(function (res) {
      if (my !== seq) return; var t = res.sort(function (x, y) { return x.d - y.d; }).slice(0, 3), pts = [o], est = t.some(function (x) { return x.est; });
      var items = t.map(function (x, i) {
        var c = (SA[x.a.jenis] || SA.Lainnya).c; pts.push([x.a.lat, x.a.lng]);
        return '<div class="sa-it" data-sa-id="' + h(x.a.id) + '"><div class="sa-ii" style="background:' + c + '">' + ico(x.a.jenis, 20, '#fff', x.a.ikon) + '</div><div class="sa-im"><div><b>' + h(x.a.nama) + '</b>' + (i === 0 ? ' <span class="sa-bdg">TERDEKAT</span>' : '') + '</div><small>' + h(x.a.jenis) + (x.a.desa ? ' · ' + h(x.a.desa) : '') + '</small></div><div class="sa-id"><b>' + (x.est ? '≈ ' : '') + fk(x.d) + ' km</b><small>' + fT(x.t) + (x.est ? ' · estimasi' : '') + '</small></div></div>';
      }).join('');
      P.innerHTML = head + '<div class="sa-ps">' + h(label || 'Titik acuan') + (acc ? ' · akurasi ±' + Math.round(acc) + ' m' : '') + ' · ' + (est ? '<span class="sa-es">estimasi, rute jalan belum tersedia</span>' : 'jarak via jalan') + '</div>' + items +
        '<div class="sa-pb"><a class="sa-b1" href="' + gm(o, t[0].a) + '" target="_blank" rel="noopener">Rute ke yang terdekat</a><button class="sa-b2" type="button" data-sa-act="pick">Tandai lokasi di peta</button></div>';
      map.fitBounds(pts, { paddingTopLeft: [40, 40], paddingBottomRight: [40, 260], maxZoom: 15 });
      t.forEach(function (x, i) { line(o, x, i === 0); });
    });
  }
  function startGPS() {
    if (!navigator.geolocation) { if (hint) hint.textContent = 'Lokasi tidak didukung. Gunakan "Tandai lokasi di peta".'; picking = true; return; }
    if (hint) hint.textContent = 'Mencari lokasi Anda…';
    navigator.geolocation.getCurrentPosition(function (p) { userPos = [p.coords.latitude, p.coords.longitude]; if (hint) hint.textContent = ''; airTable(); airMap(); nearFrom(userPos[0], userPos[1], p.coords.accuracy, 'Lokasi GPS Anda'); },
      function () { if (hint) hint.textContent = 'Izin lokasi ditolak. Ketuk peta untuk memilih titik acuan.'; picking = true; }, { enableHighAccuracy: true, timeout: 15000 });
  }
  /* tombol "Hitung jarak dari lokasi saya" di popup titik; jarak jalan dimuat setelah popup terbuka */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-sa-loc]'); if (!b) return; var id = b.dataset.saLoc; b.textContent = 'Mencari lokasi…';
    navigator.geolocation ? navigator.geolocation.getCurrentPosition(function (p) { userPos = [p.coords.latitude, p.coords.longitude]; airTable(); airMap(); if (MK[id]) MK[id].openPopup(); }, function () { b.textContent = 'Izin lokasi ditolak'; }, { enableHighAccuracy: true, timeout: 15000 }) : (b.textContent = 'Lokasi tidak didukung');
  });
  function onPop(e) {
    var el = e.popup && e.popup.getElement && e.popup.getElement(), d = el && el.querySelector('[data-sa-d]'); if (!d || !userPos) return;
    var a = AIR.filter(function (x) { return x.id === d.dataset.saD; })[0]; if (!a) return;
    roads(userPos, [{ a: a, d: km(userPos[0], userPos[1], a.lat, a.lng) }]).then(function (r) { r = r[0]; if (!r || !r.road || !d.isConnected) return; d.querySelector('.dv').innerHTML = '<b>' + fk(r.d) + ' km</b> <small>via jalan · ' + fT(r.t) + '</small>'; });
  }
  function syncChips() {
    if (chipAir) { var o = map.hasLayer(grp()); chipAir.classList.toggle('on', o); chipAir.setAttribute('aria-pressed', o); }
    if (chipNear) { var n = !!panel; chipNear.classList.toggle('on', n); chipNear.setAttribute('aria-pressed', n); }
  }
  function chips() {
    var bar = $('map-chips'); if (!bar || chipAir) return;
    var mk = function (id, icon, txt, title) { var b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'map-chip'; b.title = title; b.innerHTML = '<i data-lucide="' + icon + '"></i><span>' + txt + '</span>'; bar.appendChild(b); return b; };
    chipAir = mk('chip-air', 'droplets', 'Sumber Air', 'Tampilkan titik sumber air di peta');
    chipNear = mk('chip-air-dekat', 'locate-fixed', 'Sumber Air Terdekat', 'Cari sumber air terdekat dari lokasi Anda / titik yang ditandai');
    hint = document.createElement('div'); hint.className = 'basis-full text-xs font-semibold text-sky-700 dark:text-sky-300 px-1'; bar.appendChild(hint);
    grp().on('add remove', syncChips); syncChips();
    map.on('popupopen', onPop);
    map.on('click', function (e) { if (!picking) return; picking = false; if (hint) hint.textContent = ''; nearFrom(e.latlng.lat, e.latlng.lng, null, 'Titik yang Anda tandai'); });
    chipAir.onclick = function () { var g = grp(); map.hasLayer(g) ? map.removeLayer(g) : (map.addLayer(g), window.lucide && setTimeout(function () { lucide.createIcons(); }, 0)); };
    chipNear.onclick = function () { panel ? clearNear() : startGPS(); };
    if (window.lucide) lucide.createIcons();
  }
  function airMap() {
    if (typeof map === 'undefined') return; css();
    grp().clearLayers(); MK = {};
    AIR.forEach(function (a) { MK[a.id] = L.marker([a.lat, a.lng], { icon: pin(a.jenis, a.ikon), title: a.nama }).bindPopup(popAir(a), { className: 'sa-popup', maxWidth: 320, autoPanPadding: [30, 30] }).addTo(airGroup); });
    if (window.lucide) setTimeout(function () { lucide.createIcons(); }, 0);
  }
  function airTable() {
    var jf = $('air-jenis').value, q = ($('air-q').value || '').toLowerCase();
    var l = AIR.filter(function (a) { return (!jf || a.jenis === jf) && (!q || (a.nama + a.desa + a.kec).toLowerCase().indexOf(q) >= 0); }).map(function (a) { return Object.assign({ d: userPos ? km(userPos[0], userPos[1], a.lat, a.lng) : null }, a); });
    if (userPos) l.sort(function (x, y) { return x.d - y.d; });
    var ic = function (a, c) { return '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full mr-1.5 align-middle" style="background:' + c + '">' + ico(a.jenis, 13, '#fff', a.ikon) + '</span>'; };
    $('air-rows').innerHTML = l.length ? l.map(function (a, i) {
      var c = (SA[a.jenis] || SA.Lainnya).c;
      return '<tr><td class="' + TD + '">' + (i + 1) + '</td><td class="' + TD + ' font-semibold">' + ic(a, c) + h(a.nama) + (a.ket ? '<div class="text-[11px] font-normal text-slate-500">' + h(a.ket) + '</div>' : '') + '</td><td class="' + TD + '"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold text-white" style="background:' + c + '">' + h(a.jenis) + '</span></td><td class="' + TD + '">' + h(a.desa ? a.desa + ', ' + a.kec : (a.kec || '-')) + '</td><td class="' + TD + ' font-bold">' + (a.d == null ? '-' : a.d.toFixed(2) + ' km') + '</td><td class="' + TD + ' text-xs whitespace-nowrap">' + a.lat.toFixed(5) + ', ' + a.lng.toFixed(5) + '</td><td class="' + TD + ' whitespace-nowrap"><button class="text-emerald-700 dark:text-emerald-400 font-semibold" data-fly="' + a.lat + ',' + a.lng + '">Peta</button> &middot; <a class="text-sky-700 dark:text-sky-400 font-semibold" target="_blank" rel="noopener" href="' + gm(userPos, a) + '">Rute</a></td></tr>';
    }).join('') : '<tr><td colspan="7" class="' + TD + ' text-center text-slate-500">' + (AIR.length ? 'Tidak ada data yang cocok.' : 'Belum ada data sumber air.') + '</td></tr>';
    // ringkasan per jenis
    var c = {}; AIR.forEach(function (a) { c[a.jenis] = (c[a.jenis] || 0) + 1; });
    $('air-sum').innerHTML = Object.keys(JENIS_C).map(function (j) { var col = (SA[j] || SA.Lainnya).c; return '<div class="rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-2 text-center"><div class="inline-flex items-center justify-center w-8 h-8 rounded-full mb-1" style="background:' + col + '">' + ico(j, 16, '#fff') + '</div><div class="text-xl font-black leading-none" style="color:' + col + '">' + (c[j] || 0) + '</div><div class="text-[11px] font-semibold text-slate-500 mt-0.5">' + j + '</div></div>'; }).join('');
    // sebaran per kecamatan
    var kl = (typeof KECAMATAN_COLORS !== 'undefined' ? Object.keys(KECAMATAN_COLORS) : []), M = {};
    AIR.forEach(function (a) { var k = a.kec || 'Di luar kecamatan'; if (kl.indexOf(k) < 0) kl.push(k); M[k] = M[k] || {}; M[k][a.jenis] = (M[k][a.jenis] || 0) + 1; });
    var js = Object.keys(JENIS_C);
    $('air-kec').innerHTML = '<thead><tr><th class="' + TH + '">Kecamatan</th>' + js.map(function (j) { return '<th class="' + TH + ' text-center">' + j + '</th>'; }).join('') + '<th class="' + TH + ' text-center">Total</th><th class="' + TH + '">Status</th></tr></thead><tbody>' + kl.map(function (k) {
      var m = M[k] || {}, t = js.reduce(function (n, j) { return n + (m[j] || 0); }, 0);
      return '<tr><td class="' + TD + ' font-semibold whitespace-nowrap">' + h(k) + '</td>' + js.map(function (j) { return '<td class="' + TD + ' text-center ' + (m[j] ? 'font-bold' : 'text-slate-300 dark:text-slate-600') + '">' + (m[j] || 0) + '</td>'; }).join('') + '<td class="' + TD + ' text-center font-black">' + t + '</td><td class="' + TD + '">' + (t ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Terdata</span>' : '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">Belum ada data</span>') + '</td></tr>';
    }).join('') + '</tbody>';
  }
  function hotAir(list) {
    var rows = list.slice().sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); }).slice(0, 30);
    $('hot-air').innerHTML = !AIR.length ? '<tr><td colspan="6" class="' + TD + ' text-center text-slate-500">Data sumber air belum tersedia.</td></tr>' : rows.length ? rows.map(function (x) {
      var n = nearest(+x.latitude, +x.longitude), far = n.d > 5;
      return '<tr><td class="' + TD + '">' + h(x.village || '-') + '<div class="text-[11px] text-slate-500">' + h(x.kecamatan || '') + '</div></td><td class="' + TD + '">' + h(x.satellite) + '</td><td class="' + TD + '">' + h(x.confidence) + '%</td><td class="' + TD + '">' + h(n.a.nama) + '<div class="text-[11px] text-slate-500">' + h(n.a.jenis) + '</div></td><td class="' + TD + ' font-bold ' + (far ? 'text-red-600' : 'text-emerald-600') + '">' + n.d.toFixed(2) + ' km</td><td class="' + TD + '"><button class="text-emerald-700 dark:text-emerald-400 font-semibold" data-fly="' + x.latitude + ',' + x.longitude + '">Peta</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="' + TD + ' text-center text-slate-500">Tidak ada titik panas hari ini.</td></tr>';
  }

  /* ---------- 3. STATISTIK, GRAFIK, TABEL ---------- */
  function chart(id, cfg) {
    if (CH[id]) { CH[id].destroy(); delete CH[id]; } var el = $(id); if (!el || !el.offsetParent || typeof Chart === 'undefined') return; // kartu tersembunyi tidak digambar
    Chart.defaults.color = dark() ? '#cbd5e1' : '#475569'; Chart.defaults.borderColor = dark() ? '#334155' : '#e2e8f0';
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, cfg.options || {}); CH[id] = new Chart(el, cfg);
  }
  function stats(force) {
    if (!seen || typeof dataCache === 'undefined' || !dataCache) return;       // lazy: baru digambar saat bagian ini mendekati layar
    var key = [(dataCache.raw || []).length, (dataCache.history || []).length, ((dataCache.raw || [])[0] || {}).time, airVer, dark()].join('|');
    if (key === lastKey && force !== true) return; lastKey = key;               // data tidak berubah -> tidak render ulang
    var raw = dataCache.raw || [], hist = (dataCache.history && dataCache.history.length ? dataCache.history : raw), today = WIB(0);
    var td = raw.filter(function (x) { return dayOf(x.time) === today; }); if (!td.length) td = raw;
    var days = []; for (var i = 6; i >= 0; i--) days.push(WIB(i));
    // tabel per kecamatan (hari ini)
    var K = {}; td.forEach(function (x) { var k = x.kecamatan || '-', o = K[k] = K[k] || { n: 0, hi: 0, frp: 0, d: {}, s: {} }; o.n++; if (x.confidence >= 80) o.hi++; o.frp = Math.max(o.frp, x.frp || 0); o.d[x.village] = 1; o.s[x.satellite] = (o.s[x.satellite] || 0) + 1; });
    var ks = Object.keys(K).sort(function (a, b) { return K[b].n - K[a].n; });
    $('st-kpi').innerHTML = [['Total titik panas', td.length], ['Confidence tinggi (≥80)', td.filter(function (x) { return x.confidence >= 80; }).length], ['Kecamatan terdampak', ks.length], ['FRP tertinggi', Math.max.apply(null, td.map(function (x) { return x.frp || 0; }).concat(0)).toFixed(1) + ' MW']].map(function (k) { return '<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><div class="text-2xl font-black text-emerald-700 dark:text-emerald-400">' + k[1] + '</div><div class="text-xs font-semibold text-slate-500">' + k[0] + '</div></div>'; }).join('');
    $('st-kec').innerHTML = ks.length ? ks.map(function (k) { var o = K[k]; return '<tr><td class="' + TD + ' font-semibold">' + h(k) + '</td><td class="' + TD + ' font-bold">' + o.n + '</td><td class="' + TD + '">' + o.hi + '</td><td class="' + TD + '">' + Object.keys(o.d).length + '</td><td class="' + TD + '">' + o.frp.toFixed(1) + '</td><td class="' + TD + ' text-xs">' + Object.keys(o.s).map(function (s) { return h(s) + ' (' + o.s[s] + ')'; }).join(', ') + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="' + TD + ' text-center text-slate-500">Tidak ada titik panas.</td></tr>';
    // tren 7 hari (lokasi+satelit unik per hari)
    var perDay = days.map(function (d) { var s = {}; hist.forEach(function (x) { if (dayOf(x.time) === d) s[x.latitude + '|' + x.longitude + '|' + x.satellite] = 1; }); return Object.keys(s).length; });
    chart('ch-tren', { type: 'line', data: { labels: days.map(function (d) { return d.slice(5); }), datasets: [{ label: 'Titik panas', data: perDay, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.15)', fill: true, tension: .3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    // keyakinan & satelit
    var cf = [0, 0, 0], sat = {}; td.forEach(function (x) { cf[x.confidence >= 80 ? 2 : x.confidence >= 40 ? 1 : 0]++; sat[x.satellite || '-'] = (sat[x.satellite || '-'] || 0) + 1; });
    chart('ch-conf', { type: 'doughnut', data: { labels: ['Rendah (<40)', 'Sedang (40-79)', 'Tinggi (≥80)'], datasets: [{ data: cf, backgroundColor: ['#94a3b8', '#f59e0b', '#dc2626'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
    chart('ch-sat', { type: 'doughnut', data: { labels: Object.keys(sat), datasets: [{ data: Object.keys(sat).map(function (s) { return sat[s]; }), backgroundColor: ['#059669', '#2563eb', '#7c3aed', '#f59e0b', '#0891b2', '#e11d48'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
    chart('ch-kec', { type: 'bar', data: { labels: ks, datasets: [{ label: 'Hari ini', data: ks.map(function (k) { return K[k].n; }), backgroundColor: '#059669' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } });
    // heatmap kecamatan x 7 hari
    var M = {}, mx = 1; hist.forEach(function (x) { var d = dayOf(x.time); if (days.indexOf(d) < 0) return; var k = x.kecamatan || '-'; M[k] = M[k] || {}; M[k][d] = (M[k][d] || 0) + 1; mx = Math.max(mx, M[k][d]); });
    var mk = Object.keys(M).sort();
    $('st-heat').innerHTML = '<thead><tr><th class="' + TH + '">Kecamatan</th>' + days.map(function (d) { return '<th class="' + TH + ' text-center' + (d === today ? ' text-emerald-600' : '') + '">' + d.slice(5) + '</th>'; }).join('') + '</tr></thead><tbody>' + (mk.length ? mk.map(function (k) { return '<tr><td class="' + TD + ' font-semibold whitespace-nowrap">' + h(k) + '</td>' + days.map(function (d) { var v = M[k][d] || 0; return '<td class="' + TD + ' text-center font-bold" style="background:rgba(220,38,38,' + (v ? .12 + .75 * v / mx : 0) + ');color:' + (v / mx > .55 ? '#fff' : 'inherit') + '">' + (v || '') + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="8" class="' + TD + ' text-center text-slate-500">Belum ada riwayat.</td></tr>') + '</tbody>';
    hotAir(td);
  }
  function ispa(j) {
    if (j) ISPA = j; j = ISPA; if (!seen || !j) return;
    var l = (j && j.daftar) || [], cut = WIB(30), K = {};
    l.filter(function (r) { return r.tgl >= cut; }).forEach(function (r) { var o = K[r.kec] = K[r.kec] || { k: 0, b: 0, last: '' }; o.k += r.kasus; o.b += r.balita || 0; if (r.tgl > o.last) o.last = r.tgl; });
    var ks = Object.keys(K).sort(function (a, b) { return K[b].k - K[a].k; });
    $('ispa-rows').innerHTML = ks.length ? ks.map(function (k) { return '<tr><td class="' + TD + ' font-semibold">' + h(k) + '</td><td class="' + TD + ' font-bold">' + K[k].k + '</td><td class="' + TD + '">' + K[k].b + '</td><td class="' + TD + '">' + h(K[k].last) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="' + TD + ' text-center text-slate-500">Belum ada data ISPA (30 hari terakhir).</td></tr>';
    var T = {}; l.filter(function (r) { return r.tgl >= WIB(60); }).forEach(function (r) { T[r.tgl] = (T[r.tgl] || 0) + r.kasus; }); var ds = Object.keys(T).sort();
    chart('ch-ispa', { type: 'bar', data: { labels: ks, datasets: [{ label: 'Kasus ISPA 30 hari', data: ks.map(function (k) { return K[k].k; }), backgroundColor: '#7c3aed' }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    chart('ch-ispa-t', { type: 'line', data: { labels: ds.map(function (d) { return d.slice(5); }), datasets: [{ label: 'Total kasus', data: ds.map(function (d) { return T[d]; }), borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,.15)', fill: true, tension: .3 }] }, options: { plugins: { legend: { display: false } } } });
  }


  /* ---------- PRAKIRAAN 7 HARI + INDIKATOR RISIKO KARHUTLA (Open-Meteo) ---------- */
  var WMO = { 0: ['☀️', 'Cerah'], 1: ['🌤️', 'Cerah berawan'], 2: ['⛅', 'Berawan sebagian'], 3: ['☁️', 'Mendung'], 45: ['🌫️', 'Kabut'], 48: ['🌫️', 'Kabut'], 51: ['🌦️', 'Gerimis ringan'], 53: ['🌦️', 'Gerimis'], 55: ['🌦️', 'Gerimis lebat'], 61: ['🌧️', 'Hujan ringan'], 63: ['🌧️', 'Hujan sedang'], 65: ['🌧️', 'Hujan lebat'], 80: ['🌦️', 'Hujan lokal ringan'], 81: ['🌧️', 'Hujan lokal sedang'], 82: ['⛈️', 'Hujan lokal lebat'], 95: ['⛈️', 'Badai petir'], 96: ['⛈️', 'Badai petir + es'], 99: ['⛈️', 'Badai petir + es'] };
  var ARAH = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'], FCC = {};
  function risk(r, hum, tmax, wind, et) {
    var sc = (r < 1 ? 3 : r < 5 ? 1.5 : r < 15 ? 0 : -2) + (hum < 60 ? 3 : hum < 70 ? 2 : hum < 80 ? 1 : 0) + (tmax >= 35 ? 2 : tmax >= 33 ? 1 : 0) + (wind >= 25 ? 2 : wind >= 15 ? 1 : 0) + (et >= 5 ? 1 : 0);
    return sc <= 3 ? { l: 'Rendah', c: '#16a34a', s: sc } : sc <= 6 ? { l: 'Sedang', c: '#ca8a04', s: sc } : sc <= 8 ? { l: 'Tinggi', c: '#ea580c', s: sc } : { l: 'Sangat Tinggi', c: '#dc2626', s: sc };
  }
  function fcPoint(k) {
    if (FCC[k]) return FCC[k];
    var p = [-1.88, 113.2];
    try { if (typeof GEOJSON !== 'undefined' && typeof turf !== 'undefined') { var fs = GEOJSON.features.filter(function (f) { return !k || f.properties.kecamatan === k; }); if (fs.length) { var c = turf.centerOfMass({ type: 'FeatureCollection', features: fs }).geometry.coordinates; p = [c[1], c[0]]; } } } catch (e) { }
    return (FCC[k] = p);
  }
  function fcLoad(force) {
    var sel = $('fc-sel'); if (!sel) return; var k = sel.value, p = fcPoint(k), key = 'kt_fc_' + k, body = $('fc-body');
    var render = function (j, ts) {
      var d = j.daily, hh = j.hourly.relative_humidity_2m, rows = d.time.map(function (t, i) {
        var hs = hh.slice(i * 24, i * 24 + 24).filter(function (x) { return x != null; }), hum = hs.length ? hs.reduce(function (a, b) { return a + b; }, 0) / hs.length : 0;
        var rk = risk(d.precipitation_sum[i] || 0, hum, d.temperature_2m_max[i], d.wind_speed_10m_max[i], d.et0_fao_evapotranspiration[i] || 0), w = WMO[d.weather_code[i]] || ['❔', 'Tidak diketahui'];
        var dt = new Date(t + 'T00:00:00'), dir = ARAH[Math.round((d.wind_direction_10m_dominant[i] || 0) / 45) % 8];
        return { t: t, tgl: dt.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }), w: w, tmin: d.temperature_2m_min[i], tmax: d.temperature_2m_max[i], r: d.precipitation_sum[i] || 0, pp: d.precipitation_probability_max[i], hum: hum, wind: d.wind_speed_10m_max[i], gust: d.wind_gusts_10m_max[i], dir: dir, et: d.et0_fao_evapotranspiration[i] || 0, rk: rk };
      });
      var f1 = function (x) { return (+x).toFixed(1).replace('.', ','); };
      body.innerHTML = rows.map(function (r) {
        return '<tr><td class="' + TD + ' font-semibold whitespace-nowrap">' + h(r.tgl) + '</td><td class="' + TD + ' whitespace-nowrap">' + r.w[0] + ' ' + h(r.w[1]) + '</td><td class="' + TD + ' whitespace-nowrap">' + Math.round(r.tmin) + '° – <b>' + Math.round(r.tmax) + '°C</b></td><td class="' + TD + ' text-center">' + f1(r.r) + '</td><td class="' + TD + ' text-center">' + (r.pp == null ? '-' : r.pp + '%') + '</td><td class="' + TD + ' text-center">' + Math.round(r.hum) + '%</td><td class="' + TD + ' text-center whitespace-nowrap">' + Math.round(r.wind) + ' <small class="text-slate-500">' + r.dir + '</small></td><td class="' + TD + ' text-center">' + Math.round(r.gust) + '</td><td class="' + TD + ' text-center">' + f1(r.et) + '</td><td class="' + TD + '"><span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold text-white whitespace-nowrap" style="background:' + r.rk.c + '">' + r.rk.l + '</span></td></tr>';
      }).join('');
      var worst = rows.slice().sort(function (a, b) { return b.rk.s - a.rk.s; })[0], dry = rows.filter(function (r) { return r.r < 1; }).length, rain = rows.reduce(function (a, r) { return a + r.r; }, 0);
      $('fc-sum').innerHTML = [['Hari paling rawan', worst.tgl + ' · ' + worst.rk.l], ['Hari tanpa hujan (<1 mm)', dry + ' dari 7 hari'], ['Total hujan 7 hari', f1(rain) + ' mm'], ['Suhu tertinggi', Math.round(Math.max.apply(null, rows.map(function (r) { return r.tmax; }))) + '°C']].map(function (x) { return '<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><div class="text-sm font-black text-emerald-700 dark:text-emerald-400">' + h(x[1]) + '</div><div class="text-[11px] font-semibold text-slate-500">' + x[0] + '</div></div>'; }).join('');
      $('fc-upd').textContent = 'Diperbarui ' + new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' · titik ' + p[0].toFixed(2) + ', ' + p[1].toFixed(2);
    };
    try { var c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && !force && Date.now() - c.t < 30 * 60000) { render(c.j, c.t); return; } } catch (e) { }
    body.innerHTML = '<tr><td colspan="10" class="' + TD + ' text-center text-slate-500"><i class="kf-mini"></i>Memuat prakiraan…</td></tr>';
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p[0].toFixed(4) + '&longitude=' + p[1].toFixed(4) + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,et0_fao_evapotranspiration&hourly=relative_humidity_2m&timezone=Asia%2FJakarta&forecast_days=7&wind_speed_unit=kmh';
    fetch(url).then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); }).then(function (j) { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), j: j })); } catch (e) { } render(j, Date.now()); if (force && window.KN) KN.notify('Prakiraan 7 hari berhasil diperbarui.', 'ok'); })
      .catch(function () { body.innerHTML = '<tr><td colspan="10" class="' + TD + ' text-center text-red-600">Prakiraan gagal dimuat. Periksa koneksi lalu tekan Muat ulang.</td></tr>'; });
  }

  /* ---------- UI ---------- */
  function build() {
    var main = document.querySelector('main'); if (!main || $('statistik-lengkap')) return;
    var s = document.createElement('section'); s.id = 'statistik-lengkap'; s.className = 'space-y-6';
    var tbl = function (head, id) { return '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr>' + head.map(function (x) { return '<th class="' + TH + '">' + x + '</th>'; }).join('') + '</tr></thead><tbody id="' + id + '"></tbody></table></div>'; };
    var ttl = function (t, sub) { return '<h3 class="font-extrabold text-lg text-slate-900 dark:text-slate-100">' + t + '</h3><p class="text-xs text-slate-500 dark:text-slate-400 mb-3">' + sub + '</p>'; };
    s.innerHTML =
      '<div class="' + CARD + ' hidden">' + ttl('Statistik Hotspot per Kecamatan (Hari Ini)', 'Jumlah titik panas, tingkat keyakinan, desa terdampak, FRP dan satelit pendeteksi.') + '<div id="st-kpi" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"></div><div class="mb-4" style="height:280px"><canvas id="ch-kec"></canvas></div>' + tbl(['Kecamatan', 'Titik panas', 'Conf. ≥80', 'Desa terdampak', 'FRP maks (MW)', 'Satelit'], 'st-kec') + '</div>' +
      '<div class="' + CARD + ' hidden">' + ttl('Tingkat Keyakinan & Per Satelit (Hari Ini)', 'Keyakinan tinggi (≥80%) paling mungkin api nyata.') + '<div class="grid sm:grid-cols-2 gap-4"><div style="height:260px"><canvas id="ch-conf"></canvas></div><div style="height:260px"><canvas id="ch-sat"></canvas></div></div></div>' +
      '<div class="' + CARD + '">' + ttl('Tren Titik Panas Harian (7 Hari)', 'Jumlah titik panas unik (lokasi + satelit) per hari. Arahkan atau ketuk titik untuk melihat tanggalnya.') + '<div style="height:260px"><canvas id="ch-tren"></canvas></div></div>' +
      '<div id="prakiraan" class="' + CARD + '">' + ttl('Prakiraan 7 Hari ke Depan & Risiko Karhutla', 'Prakiraan cuaca harian (Open-Meteo) dan indikator risiko karhutla indikatif dari hujan, kelembapan, suhu, angin, dan penguapan. Bukan prakiraan resmi BMKG.') + '<div class="flex flex-wrap items-center gap-2 mb-3"><select id="fc-sel" class="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg px-2 py-1.5 text-sm"><option value="">Seluruh Kabupaten (titik pusat)</option>' + (typeof KECAMATAN_COLORS !== 'undefined' ? Object.keys(KECAMATAN_COLORS).map(function (k) { return '<option>' + h(k) + '</option>'; }).join('') : '') + '</select><button id="fc-re" type="button" class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg px-3 py-1.5">Muat ulang</button><span id="fc-upd" class="text-xs text-slate-500"></span></div><div id="fc-sum" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr>' + ['Hari', 'Cuaca', 'Suhu', 'Hujan (mm)', 'Peluang hujan', 'Kelembapan', 'Angin maks (km/j)', 'Hembusan (km/j)', 'Penguapan (mm)', 'Risiko karhutla'].map(function (x) { return '<th class="' + TH + '">' + x + '</th>'; }).join('') + '</tr></thead><tbody id="fc-body"></tbody></table></div><p class="text-[11px] text-slate-500 mt-2">Skor risiko: hujan rendah, kelembapan rendah, suhu tinggi, angin kencang, dan penguapan tinggi menaikkan risiko. Gunakan bersama data titik panas dan arahan resmi BMKG/BPBD.</p></div>' +
      '<div class="' + CARD + '">' + ttl('Peta Panas Kecamatan × Hari (7 Hari)', 'Semakin pekat warnanya, semakin banyak titik panas pada kecamatan dan hari itu.') + '<div class="overflow-x-auto"><table id="st-heat" class="w-full text-sm"></table></div></div>' +
      '<div class="' + CARD + '">' + ttl('Ketersediaan Sumber Air', 'Jumlah titik sumber air terdata per jenis dan sebarannya per kecamatan. Kecamatan tanpa titik perlu dilengkapi datanya.') + '<div id="air-sum" class="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4"></div><div class="overflow-x-auto"><table id="air-kec" class="w-full text-sm"></table></div></div>' +
      '<div id="sumber-air" class="' + CARD + '"><div class="flex flex-wrap items-start justify-between gap-2"><div>' + ttl('Daftar Titik Sumber Air', 'Sungai, kolam, sumur, embung, dan kanal yang dapat dipakai untuk pemadaman.') + '</div><a href="admin.html" class="inline-flex items-center gap-1 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg px-3 py-1.5" title="Login admin untuk menambah titik">+ Tambah Titik</a></div><div class="flex flex-wrap gap-2 mb-3"><select id="air-jenis" class="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg px-2 py-1.5 text-sm"><option value="">Semua jenis</option>' + Object.keys(JENIS_C).map(function (j) { return '<option>' + j + '</option>'; }).join('') + '</select><input id="air-q" placeholder="Cari nama / desa…" class="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[8rem]"><button id="air-loc" type="button" class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg px-3 py-1.5">Urutkan dari lokasi saya</button></div>' + tbl(['No', 'Nama Sumber Air', 'Jenis', 'Desa / Kecamatan', 'Jarak dari Anda', 'Koordinat', 'Aksi'], 'air-rows') + '</div>' +
      '<div class="' + CARD + ' hidden">' + ttl('Titik Panas & Sumber Air Terdekat', 'Jarak garis lurus dari tiap titik panas hari ini (30 teratas menurut keyakinan) ke sumber air terdekat. Merah bila > 5 km.') + tbl(['Desa', 'Satelit', 'Confidence', 'Sumber air terdekat', 'Jarak', 'Aksi'], 'hot-air') + '</div>' +
      '<div class="' + CARD + '">' + ttl('Data ISPA per Kecamatan (30 Hari)', 'Rekap agregat yang diinput admin / operator Puskesmas, tanpa data pribadi pasien.') + '<div class="grid lg:grid-cols-2 gap-4 mb-4"><div style="height:240px"><canvas id="ch-ispa"></canvas></div><div style="height:240px"><canvas id="ch-ispa-t"></canvas></div></div>' + tbl(['Kecamatan', 'Total kasus', 'Balita', 'Periode terakhir'], 'ispa-rows') + '</div>';
    main.appendChild(s);
    var nav = document.querySelector('header nav'); if (nav) { var a = document.createElement('a'); a.href = '#statistik-lengkap'; a.className = 'px-3 py-2 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'; a.textContent = 'Statistik & Sumber Air'; nav.insertBefore(a, nav.lastElementChild); }
    $('fc-sel').onchange = function () { fcLoad(); }; $('fc-re').onclick = function () { fcLoad(true); };
    $('air-jenis').onchange = $('air-q').oninput = airTable;
    $('air-loc').onclick = function () {
      if (!navigator.geolocation) return alert('Perangkat tidak mendukung lokasi.');
      navigator.geolocation.getCurrentPosition(function (p) { userPos = [p.coords.latitude, p.coords.longitude]; airTable(); airMap(); }, function () { alert('Izin lokasi ditolak / tidak tersedia.'); }, { enableHighAccuracy: true, timeout: 15000 });
    };
    s.addEventListener('click', function (e) { var b = e.target.closest('[data-fly]'); if (!b || typeof map === 'undefined') return; var c = b.dataset.fly.split(',').map(Number); document.getElementById('gis-map').scrollIntoView({ behavior: 'smooth', block: 'center' }); map.flyTo(c, 14); });
  }
  window.__pp = { air: function () { return AIR; }, nearest: nearest, ispa: function () { return ISPA; } };   // dipakai js/analisis.js
  function jget(a) { return fetch(GAS_API_URL + '?action=' + a + '&_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; }); }
  function loadAll() {
    jget('sumber_air').then(function (j) { AIR = (j && j.daftar) || []; airVer++; airTable(); airMap(); stats(); });
    jget('ispa').then(ispa);
  }
  function start() {
    build(); initViirs(); chips();
    // permintaan sekunder (sumber air, ISPA) menunggu data hotspot utama agar tidak berebut koneksi; paling lama 2,5 dtk
    var t0 = Date.now(), w = setInterval(function () { if ((typeof dataCache !== 'undefined' && dataCache) || Date.now() - t0 > 2500) { clearInterval(w); loadAll(); } }, 120);
    var sec = $('statistik-lengkap');
    if ('IntersectionObserver' in window && sec) { var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); seen = true; stats(true); ispa(); fcLoad(); } }, { rootMargin: '500px' }); io.observe(sec); } else { seen = true; fcLoad(); }
    var t = setInterval(function () { if (typeof dataCache !== 'undefined' && dataCache) { clearInterval(t); stats(); } }, 700);
    var manual = false;
    if (typeof fetchRealtimeData === 'function') {
      var o = window.fetchRealtimeData;
      window.fetchRealtimeData = function () {
        var args = arguments, before = typeof dataCache !== 'undefined' ? dataCache : null, r = o.apply(this, args);
        return Promise.resolve(r).then(function (v) {
          stats();
          try { if (window.WindKit && WindKit.prefetch && typeof dataCache !== 'undefined' && dataCache) { var pts = (dataCache.raw || []).map(function (h) { return { lat: parseFloat(h.latitude || h.lat), lng: parseFloat(h.longitude || h.lng) }; }); setTimeout(function () { WindKit.prefetch(pts); }, 300); } } catch (e) { }   // unduh angin semua titik panas di latar belakang -> popup instan
          var fresh = typeof dataCache !== 'undefined' && dataCache && dataCache !== before && !args[1];
          if (fresh) { try { localStorage.setItem('kt_hs', JSON.stringify({ t: Date.now(), d: dataCache })); } catch (e) { } }   // cache lokal: tampil instan pada kunjungan berikutnya
          if (manual && !args[1]) { manual = false; if (window.KN) KN.notify(fresh ? 'Data berhasil dimuat ulang.' : 'Gagal memuat ulang. Menampilkan data terakhir.', fresh ? 'ok' : 'warn'); }
          return v;
        });
      };
    }
    var ub = $('btn-update-satellite');
    if (ub && window.KN) {
      ub.addEventListener('click', function () { KN.busy('Menarik data satelit terbaru'); });
      new MutationObserver(function () { if (!ub.disabled) KN.done(); }).observe(ub, { attributes: true, attributeFilter: ['disabled'] });
    }
    var tg = $('btn-theme-toggle'); if (tg) tg.addEventListener('click', function () { setTimeout(stats, 50); });
    var rf = $('btn-refresh-data'); if (rf) rf.addEventListener('click', function () { manual = true; loadAll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
