/* PWA: registrasi Service Worker, tombol Instal Aplikasi, indikator online, notifikasi versi baru. */
(function () {
  'use strict';
  var ev = null, $ = function (id) { return document.getElementById(id); };
  function btns() { return document.querySelectorAll('[data-install]'); }
  function standalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function toast(html) {
    var t = document.createElement('div');
    t.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center gap-3';
    t.innerHTML = html; document.body.appendChild(t); return t;
  }
  function status() {
    var s = $('pwa-status'); if (!s) return;
    s.textContent = !navigator.onLine ? 'Offline' : standalone() ? 'Aplikasi terpasang' : 'Online';
    s.className = 'px-2 py-0.5 rounded-full text-[11px] font-bold ' + (navigator.onLine ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800');
  }
  addEventListener('online', status); addEventListener('offline', status);
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ev = e; btns().forEach(function (b) { b.classList.remove('hidden'); }); });
  addEventListener('appinstalled', function () { ev = null; btns().forEach(function (b) { b.classList.add('hidden'); }); status(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-install]'); if (!b) return;
    if (ev) { ev.prompt(); ev.userChoice.finally(function () { ev = null; }); return; }
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var t = toast(ios ? 'Di Safari: ketuk <b>Bagikan</b> lalu <b>Tambah ke Layar Utama</b>.' : 'Buka menu browser (⋮) lalu pilih <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.');
    setTimeout(function () { t.remove(); }, 7000);
  });
  document.addEventListener('DOMContentLoaded', function () {
    status();
    if (!standalone()) btns().forEach(function (b) { b.classList.remove('hidden'); }); // selalu tampil agar ada petunjuk di browser yang tak mendukung prompt
    else btns().forEach(function (b) { b.classList.add('hidden'); });
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var n = reg.installing; if (!n) return;
          n.addEventListener('statechange', function () {
            if (n.state === 'installed' && navigator.serviceWorker.controller) {
              var t = toast('Versi baru tersedia. <button class="bg-emerald-500 px-3 py-1 rounded-lg">Muat ulang</button>');
              t.querySelector('button').onclick = function () { n.postMessage('SKIP_WAITING'); };
            }
          });
        });
      }).catch(function () {});
      var r = false; navigator.serviceWorker.addEventListener('controllerchange', function () { if (!r) { r = true; location.reload(); } });
    });
  }
})();
