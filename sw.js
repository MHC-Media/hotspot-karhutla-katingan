/* Service Worker - Karhutla Katingan. Naikkan VERSI setiap kali berkas aplikasi diubah.
   Strategi:
   - berkas lokal (js, ikon, manifest)  : tampil dari cache seketika, diperbarui di latar belakang
   - halaman HTML                        : jaringan dulu (maks 3 dtk), lalu cache -> tetap terbuka saat sinyal lemah/offline
   - data API (GET) & cuaca              : jaringan dulu (maks 4,5 dtk), lalu data terakhir -> peta tidak kosong saat sinyal lemah
   - pustaka CDN (Leaflet, Chart, dll)   : cache dulu, tidak diunduh ulang
   - tile peta & semua POST (login/simpan): tidak pernah dicache */
const VERSI = 'karhutla-v5.10.4';
const DATA = 'karhutla-data';           // cache data API, bertahan antar-versi
const SHELL = ['./', 'index.html', 'admin.html', 'manifest.webmanifest', 'js/pwa.js', 'js/ui.js', 'js/luas.js', 'js/publik-plus.js', 'js/analisis.js', 'js/admin-plus.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo-96.png', 'icons/favicon-48.png'];
const API = ['script.google.com', 'script.googleusercontent.com', 'api.open-meteo.com', 'air-quality-api.open-meteo.com', 'api.bmkg.go.id', 'data.bmkg.go.id'];
const CDN = ['unpkg.com', 'cdn.jsdelivr.net', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const bersih = r => { const u = new URL(r.url); u.searchParams.delete('_'); return u.toString(); };   // kunci tanpa cache-buster
const batas = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); }); });

const tandai = r => { try { const h = new Headers(r.headers); h.set('X-Dari-Cache', '1'); return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h }); } catch (e) { return r; } };
async function jaringanDulu(r, ms, nama, kunci) {
  const c = await caches.open(nama);
  try {
    const res = await batas(fetch(r), ms);
    if (res.ok) c.put(kunci || r, res.clone());
    return res;
  } catch (e) {
    const m = await c.match(kunci || r);
    if (m) return tandai(m);   // data lama dari cache: beri tanda agar halaman tahu dan mencoba lagi
    throw e;
  }
}
async function segarkan(r) {
  const c = await caches.open(VERSI), m = await c.match(r);
  const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => m);
  return m || net;
}
async function cacheDulu(r) {
  const c = await caches.open(VERSI), m = await c.match(r);
  if (m) return m;
  const res = await fetch(r);
  if (res.ok || res.type === 'opaque') c.put(r, res.clone());
  return res;
}

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSI).then(c => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSI && n !== DATA).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (API.includes(u.hostname)) {
    if (/action=(update|login|logout)/.test(u.search)) return;               // aksi langsung, jangan dicache
    e.respondWith(jaringanDulu(r, /google/.test(u.hostname) ? 25000 : 4500, DATA, bersih(r)));   // Apps Script bisa lambat (cold start); jangan cepat menyerah ke data lama
    return;
  }
  if (u.origin === location.origin) {
    if (r.mode === 'navigate') e.respondWith(jaringanDulu(r, 3000, VERSI).catch(() => caches.match('index.html')));
    else e.respondWith(segarkan(r));
    return;
  }
  if (CDN.includes(u.hostname)) e.respondWith(cacheDulu(r));                  // lainnya (tile peta, dll) langsung ke jaringan
});
