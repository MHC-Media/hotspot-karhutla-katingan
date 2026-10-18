/* ui.js - modul bersama (index & admin): 1) animasi loading api karhutla  2) notifikasi popup  3) penanganan error global.
   Dimuat di <head> secara sinkron (kecil) agar CSS animasi sudah siap sebelum halaman tampil. */
(function () {
  'use strict';
  var SCRIPT = document.currentScript, WAIT_DATA = SCRIPT && SCRIPT.getAttribute('data-wait') === 'data';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- CSS ---------- */
  var LPATH = "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";   // path ikon Lucide "flame" (sama dengan ikon di halaman login)
  var FLAME = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z' fill='%23f97316' fill-opacity='.4' stroke='%23ef4444' stroke-width='2'/%3E%3C/svg%3E\")";
  var css =
    '@keyframes kf-sway{0%{transform:scale(1,1) skewX(0)}25%{transform:scale(.96,1.06) skewX(-3deg)}50%{transform:scale(1.03,.97) skewX(2deg)}75%{transform:scale(.97,1.05) skewX(-2deg)}100%{transform:scale(1,1) skewX(0)}}' +
    '@keyframes kf-glow{0%,100%{opacity:.55;transform:translateX(-50%) scale(.9)}50%{opacity:1;transform:translateX(-50%) scale(1.15)}}' +
    '@keyframes kf-ember{0%{transform:translate(0,0) scale(1);opacity:0}15%{opacity:1}100%{transform:translate(var(--x),-70px) scale(.2);opacity:0}}' +
    '@keyframes kf-in{from{opacity:0;transform:translate(-50%,-14px) scale(.96)}to{opacity:1;transform:translate(-50%,0) scale(1)}}' +
    '@keyframes kf-pop{0%{transform:scale(0)}70%{transform:scale(1.2)}100%{transform:scale(1)}}' +
    '@keyframes kf-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}' +
    '@keyframes kf-fade{from{opacity:0}to{opacity:1}}' +
    '@keyframes kf-fill{0%,100%{opacity:.25;transform:scale(.82,.7)}50%{opacity:.85;transform:scale(1,1)}}' +
    '@keyframes kf-flick{0%,100%{filter:drop-shadow(0 0 3px rgba(239,68,68,.55))}50%{filter:drop-shadow(0 0 9px rgba(249,115,22,.95))}}' +
    '.kf{position:relative;display:inline-block;width:var(--s,64px);height:var(--s,64px)}' +
    '.kf .g{position:absolute;left:50%;bottom:4%;width:150%;height:70%;transform:translateX(-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(251,146,60,.5),rgba(251,146,60,0));animation:kf-glow 1.2s ease-in-out infinite}' +
    '.kf svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;transform-origin:50% 100%;animation:kf-sway 1.15s ease-in-out infinite,kf-flick 1.2s ease-in-out infinite}' +
    '.kf .fi{fill:#f97316;stroke:none;transform-box:fill-box;transform-origin:50% 100%;animation:kf-fill 1.2s ease-in-out infinite}' +
    '.kf .fo{fill:none;stroke:#ef4444;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.kf .e{position:absolute;bottom:55%;left:50%;width:6%;height:6%;min-width:3px;min-height:3px;border-radius:50%;background:#fbbf24;opacity:0;animation:kf-ember 1.8s ease-out infinite}' +
    '.kf .e:nth-of-type(3){--x:-18px;animation-delay:.2s}.kf .e:nth-of-type(4){--x:14px;animation-delay:.8s}.kf .e:nth-of-type(5){--x:-4px;animation-delay:1.3s}' +
    '.kf-mini{display:inline-block;width:1.15em;height:1.15em;vertical-align:-.22em;margin-right:.35em;background:' + FLAME + ' center/contain no-repeat;transform-origin:50% 100%;animation:kf-sway 1s ease-in-out infinite}' +
    '.wk-load::before{content:"";display:block;margin:0 auto 8px;width:30px;height:30px;background:' + FLAME + ' center/contain no-repeat;transform-origin:50% 100%;animation:kf-sway 1s ease-in-out infinite}' +
    'i.wait{display:inline-block;width:15px;height:15px;margin-right:6px;vertical-align:-3px;border:0!important;border-radius:0!important;background:' + FLAME + ' center/contain no-repeat!important;animation:kf-sway 1s ease-in-out infinite!important}' +
    '.kf-splash,.kf-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;text-align:center;font-family:system-ui,sans-serif;transition:opacity .35s}' +
    '.kf-splash{background:#fff;color:#0f172a}' +
    '@keyframes kf-spin{to{transform:rotate(360deg)}}' +
    '.kf-ring{position:relative;display:inline-flex;align-items:center;justify-content:center;width:var(--r,96px);height:var(--r,96px)}' +
    '.kf-arc{position:absolute;inset:0;border-radius:50%;border:4px solid #fee2e2;border-top-color:#ef4444;border-right-color:#f97316;animation:kf-spin .9s linear infinite}' +
    '.kf-splash .kf-t{font-size:17px;margin:18px 0 0;color:#334155}' +
    '.kf-ov{background:rgba(2,14,38,.62);backdrop-filter:blur(3px);color:#fff;animation:kf-fade .2s}' +
    '.kf-splash.out,.kf-ov.out{opacity:0;pointer-events:none}' +
    '.kf-t{font-weight:900;letter-spacing:.02em;font-size:18px;margin:14px 0 4px}.kf-s{font-size:12.5px;opacity:.8;margin:0}' +
    '.kf-dots::after{content:"";animation:kf-d 1.2s steps(4) infinite}@keyframes kf-d{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}' +
    '.kf-pill{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);transform:translateX(-50%);z-index:9998;display:flex;align-items:center;gap:8px;background:#0f172a;color:#fff;font:600 12.5px system-ui;padding:8px 16px 8px 12px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.35);transition:opacity .25s,transform .25s}' +
    '.kf-pill.out{opacity:0;pointer-events:none;transform:translateX(-50%) translateY(10px)}.kf-pill .kf-mini{margin:0}' +
    '#kn-wrap{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translateX(-50%);z-index:100000;display:flex;flex-direction:column;gap:8px;width:min(420px,calc(100vw - 20px));pointer-events:none}' +
    '.kn{position:relative;left:50%;pointer-events:auto;display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:16px;background:#fff;color:#0f172a;box-shadow:0 12px 32px rgba(15,23,42,.28);border:1px solid #e2e8f0;overflow:hidden;font:600 13.5px/1.35 system-ui,sans-serif;animation:kf-in .28s cubic-bezier(.2,.9,.3,1.2) both;width:100%}' +
    '.kn.out{opacity:0;transform:translate(-50%,-10px);transition:all .25s}' +
    '.kn .ic{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;animation:kf-pop .4s .1s both}' +
    '.kn.ok .ic{background:#059669}.kn.error .ic{background:#dc2626}.kn.info .ic{background:#0284c7}.kn.warn .ic{background:#d97706}' +
    '.kn .tx{flex:1;min-width:0;word-break:break-word}.kn .x{flex:none;border:0;background:transparent;color:#94a3b8;font-size:18px;line-height:1;cursor:pointer;padding:4px}' +
    '.kn .pb{position:absolute;left:0;right:0;bottom:0;height:3px;transform-origin:left;animation:kf-bar linear forwards}.kn.ok .pb{background:#059669}.kn.error .pb{background:#dc2626}.kn.info .pb{background:#0284c7}.kn.warn .pb{background:#d97706}' +
    '.dark .kn{background:#1e293b;color:#e2e8f0;border-color:#334155}' +
    '@media (prefers-reduced-motion:reduce){.kf svg,.kf .fi,.kf-mini,.kf .g,.kf .e,.kf-arc{animation-duration:3s}.kf .e{display:none}}';
  var st = document.createElement('style'); st.id = 'kf-css'; st.textContent = css; document.head.appendChild(st);

  /* ---------- komponen api ---------- */
  function flame(size) { return '<span class="kf" style="--s:' + (size || 64) + 'px"><span class="g"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path class="fi" d="' + LPATH + '"/><path class="fo" d="' + LPATH + '"/></svg><span class="e"></span><span class="e"></span><span class="e"></span></span>'; }
  function ring(size) { var r = Math.round(size * 2.1); return '<span class="kf-ring" style="--r:' + r + 'px"><span class="kf-arc"></span>' + flame(size) + '</span>'; }   // ikon api Lucide + garis melingkar berputar
  function fill() { document.querySelectorAll('[data-kf]').forEach(function (el) { if (!el.firstChild) el.innerHTML = el.hasAttribute('data-ring') ? ring(+el.getAttribute('data-kf') || 46) : flame(+el.getAttribute('data-kf') || 64); }); }

  /* ---------- splash awal ---------- */
  var splash, t0 = Date.now(), loaded = false;
  function hideSplash() { splash = splash || $('kf-splash'); if (!splash || splash.classList.contains('out')) return; var d = Math.max(0, 700 - (Date.now() - t0)); setTimeout(function () { splash.classList.add('out'); setTimeout(function () { splash.remove(); }, 450); }, d); }
  function tick() {
    if (!loaded) return;
    if (!WAIT_DATA || (typeof dataCache !== 'undefined' && dataCache) || Date.now() - t0 > 9000) { hideSplash(); return; }
    setTimeout(tick, 150);
  }
  document.addEventListener('DOMContentLoaded', fill);
  addEventListener('load', function () { loaded = true; tick(); });
  setTimeout(hideSplash, 12000); // pengaman: splash tidak pernah macet

  /* ---------- overlay & pill loading ---------- */
  var ov = null, pill = null, pt = null;
  function busy(msg) {
    if (!ov) { ov = document.createElement('div'); ov.className = 'kf-ov'; ov.setAttribute('role', 'status'); ov.setAttribute('aria-live', 'polite'); document.body.appendChild(ov); }
    ov.classList.remove('out'); ov.innerHTML = '<div>' + flame(78) + '<p class="kf-t" style="font-size:15px">' + (msg || 'Memuat') + '<span class="kf-dots"></span></p></div>';
  }
  function done() { if (ov) ov.classList.add('out'); }
  function pillOn(msg) {
    clearTimeout(pt);
    pt = setTimeout(function () { // tampil hanya jika proses > 350 ms agar tidak berkedip
      if (!pill) { pill = document.createElement('div'); pill.className = 'kf-pill out'; pill.setAttribute('role', 'status'); document.body.appendChild(pill); }
      pill.innerHTML = '<i class="kf-mini"></i>' + (msg || 'Memuat data') + '<span class="kf-dots"></span>'; pill.classList.remove('out');
    }, 350);
  }
  function pillOff() { clearTimeout(pt); if (pill) pill.classList.add('out'); }

  /* ---------- notifikasi ---------- */
  var ICON = {
    ok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 8h.01M11 12h1v5h1"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>'
  };
  function notify(msg, type) {
    type = ICON[type] ? type : 'info'; msg = String(msg == null ? '' : msg); if (!msg) return;
    var w = $('kn-wrap'); if (!w) { w = document.createElement('div'); w.id = 'kn-wrap'; w.setAttribute('role', 'region'); w.setAttribute('aria-live', 'assertive'); document.body.appendChild(w); }
    var dup = Array.prototype.filter.call(w.children, function (c) { return c.dataset.m === type + msg; })[0]; if (dup) dup.remove();   // tidak menumpuk pesan sama
    while (w.children.length >= 4) w.firstChild.remove();
    var ms = type === 'error' ? 6500 : type === 'warn' ? 5000 : 3600, el = document.createElement('div');
    el.className = 'kn ' + type; el.dataset.m = type + msg; el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = '<div class="ic">' + ICON[type] + '</div><div class="tx"></div><button class="x" aria-label="Tutup">&times;</button><div class="pb" style="animation-duration:' + ms + 'ms"></div>';
    el.querySelector('.tx').textContent = msg; w.appendChild(el);
    var close = function () { if (!el.parentNode) return; el.classList.add('out'); setTimeout(function () { el.remove(); }, 260); };
    el.querySelector('.x').onclick = close; setTimeout(close, ms);
  }
  var classify = function (m) { return /^(gagal|error|tidak dapat|terjadi kesalahan|server)/i.test(m) ? 'error' : /^(berhasil|sukses|login berhasil)/i.test(m) ? 'ok' : 'info'; };

  /* ---------- indikator api otomatis untuk SEMUA permintaan data (Apps Script, BMKG, Open-Meteo) ---------- */
  var inflight = 0, WATCH = /script\.google\.com|script\.googleusercontent\.com|api\.open-meteo\.com|air-quality-api\.open-meteo\.com|api\.bmkg\.go\.id|firms\.modaps/i;
  if (window.fetch && !window.__kfFetch) {
    window.__kfFetch = 1;
    var f0 = window.fetch.bind(window);
    window.fetch = function (input) {
      var u = typeof input === 'string' ? input : (input && input.url) || '', on = WATCH.test(u), p;
      if (on) { inflight++; if (!(ov && !ov.classList.contains('out'))) pillOn('Memuat data'); }
      try { p = f0.apply(null, arguments); } catch (e) { if (on) end(); throw e; }
      if (on) p.then(end, end);
      return p;
    };
    var end = function () { if (--inflight <= 0) { inflight = 0; pillOff(); } };
  }

  window.KN = { flame: flame, notify: notify, busy: busy, done: done, pillOn: pillOn, pillOff: pillOff, fill: fill, hideSplash: hideSplash };
  if (SCRIPT && SCRIPT.getAttribute('data-alert') === 'toast') window.alert = function (m) { notify(m, classify(String(m))); };   // alert() bawaan diganti popup non-blocking

  /* ---------- penanganan error global (tanpa kebisingan) ---------- */
  var last = 0, BENIGN = /ResizeObserver|Script error|AbortError|Failed to fetch|Load failed|NetworkError|cancelled|The operation was aborted/i;
  function oops(msg) { if (!msg || BENIGN.test(msg) || Date.now() - last < 8000) return; last = Date.now(); notify('Terjadi kesalahan kecil pada tampilan. Muat ulang halaman jika ada bagian yang tidak tampil.', 'warn'); }
  if (!(SCRIPT && SCRIPT.getAttribute('data-noerr') === '1')) {
    addEventListener('error', function (e) { if (e && e.target && e.target !== window) return; console.error(e.error || e.message); oops(String(e.message || '')); });
    addEventListener('unhandledrejection', function (e) { var m = e.reason && (e.reason.message || String(e.reason)); console.error(e.reason); oops(m); });
  }
})();
