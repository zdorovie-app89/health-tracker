/* Health tracker service worker — caches the app shell for offline use.
 * Strategy: network-first for same-origin GET (always fresh when online),
 * falling back to the cache when offline. Bump CACHE_VERSION on each release.
 * v4: the app is fully offline (food database, exercise library and tips are bundled); any /api/* path is never cached.
 * v5: «Челюсть 30 дней» (jaw-data.js, jaw.js) and «Уход за кожей» (skin.js) + face.css.
 * v6: violet-blue theme (theme.css) + new icon (icons/icon.svg).
 * v7: open app (no lock screen) + Pro (license-data.js, pro.js, vendor/nacl.min.js), AI assistant (ai.js), pro.css,
 *     exercise illustrations img/ex/*.svg + img/jaw/*.svg (cached in the background after install).
 *     revoked.json (key revocation list + server time) is never cached.
 * v8: activity history (history.js), AI chat via LLM + food photo (ai.js, ai-config.js); pages and app files are
 *     revalidated with the server (cache: no-cache) so a new release is picked up immediately.
 * v8.1: auto-update — the page registers this file with updateViaCache:'none' and checks for a new version on launch,
 *     when the app comes back to the foreground and every 30 min; a new worker activates at once (skipWaiting +
 *     clients.claim) and the page reloads (silently if untouched since launch, otherwise via an «Обновить» banner).
 * v9.0: «Сегодня» = one next action, own goals, weekly summary, free JSON backup (v9.js, v9.css).
 * v9.1: sleep as bedtime/wake interval + regularity (sleeptimes.js), weight forecast + observations (insights.js).
 * v9.2: food speed — repeat yesterday, favourites, recent, barcode via Open Food Facts (foodplus.js; the lookups are
 *     cross-origin, so this worker never caches them); next-weight suggestions in the live workout (history.js).
 * v9.3: measurements + private progress photos in IndexedDB (body.js), local reminders (remind.js) — a tap on a
 *     reminder notification focuses / opens the app (notificationclick below).
 * v9.6: black · blue · purple redesign (noir.css, loaded last) + refreshed icon; payment screen (pay-config.js).
 * v9.5: integrity self-check requests (header X-HT-IC) and /download/ (Android APK) bypass this worker.
 * v9.4: store-guard.js (localStorage quota guard), vendor/zxing.min.js (barcode from a photo, kept for offline use). */
'use strict';

var CACHE_VERSION = 'health-tracker-v9.6';
var APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=9.6',
  './face.css?v=9.6',
  './theme.css?v=9.6',
  './pro.css?v=9.6',
  './v9.css?v=9.6',
  './noir.css?v=9.6',
  './store-guard.js?v=9.6',
  './license-data.js?v=9.6',
  './pay-config.js?v=9.6',
  './pro.js?v=9.6',
  './foods.js?v=9.6',
  './exercises.js?v=9.6',
  './tips.js?v=9.6',
  './jaw-data.js?v=9.6',
  './jaw.js?v=9.6',
  './skin.js?v=9.6',
  './history.js?v=9.6',
  './v9.js?v=9.6',
  './sleeptimes.js?v=9.6',
  './insights.js?v=9.6',
  './foodplus.js?v=9.6',
  './body.js?v=9.6',
  './remind.js?v=9.6',
  './ai-config.js?v=9.6',
  './ai.js?v=9.6',
  './app.js?v=9.6',
  './vendor/nacl.min.js?v=9.6',
  './vendor/zxing.min.js?v=9.6',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon.svg',
  './favicon.ico'
];
var IMAGES = [
  './img/jaw/chew.svg?v=7',
  './img/jaw/chin.svg?v=7',
  './img/jaw/clav.svg?v=7',
  './img/jaw/cold.svg?v=7',
  './img/jaw/curl.svg?v=7',
  './img/jaw/jut.svg?v=7',
  './img/jaw/kiss.svg?v=7',
  './img/jaw/side.svg?v=7',
  './img/jaw/tongue.svg?v=7',
  './img/jaw/vowels.svg?v=7',
  './img/ex/ab_wheel.svg?v=7',
  './img/ex/air_squat.svg?v=7',
  './img/ex/assisted_pullup.svg?v=7',
  './img/ex/back_extension.svg?v=7',
  './img/ex/back_squat.svg?v=7',
  './img/ex/band_pull_apart.svg?v=7',
  './img/ex/band_pulldown.svg?v=7',
  './img/ex/barbell_curl.svg?v=7',
  './img/ex/barbell_row.svg?v=7',
  './img/ex/bench_dips.svg?v=7',
  './img/ex/bench_press.svg?v=7',
  './img/ex/bike.svg?v=7',
  './img/ex/bird_dog.svg?v=7',
  './img/ex/brisk_walk.svg?v=7',
  './img/ex/burpees.svg?v=7',
  './img/ex/cable_fly.svg?v=7',
  './img/ex/cable_row.svg?v=7',
  './img/ex/calf_raise.svg?v=7',
  './img/ex/cat_cow.svg?v=7',
  './img/ex/chest_press.svg?v=7',
  './img/ex/crunch.svg?v=7',
  './img/ex/db_bench.svg?v=7',
  './img/ex/db_curl.svg?v=7',
  './img/ex/db_lunge.svg?v=7',
  './img/ex/db_ohp.svg?v=7',
  './img/ex/db_overhead_ext.svg?v=7',
  './img/ex/db_rdl.svg?v=7',
  './img/ex/db_row.svg?v=7',
  './img/ex/dead_bug.svg?v=7',
  './img/ex/deadlift.svg?v=7',
  './img/ex/decline_pushup.svg?v=7',
  './img/ex/diamond_pushup.svg?v=7',
  './img/ex/dips.svg?v=7',
  './img/ex/face_pull.svg?v=7',
  './img/ex/glute_bridge.svg?v=7',
  './img/ex/goblet_squat.svg?v=7',
  './img/ex/hammer_curl.svg?v=7',
  './img/ex/hanging_leg_raise.svg?v=7',
  './img/ex/high_knees.svg?v=7',
  './img/ex/hip_stretch.svg?v=7',
  './img/ex/hip_thrust.svg?v=7',
  './img/ex/incline_db_press.svg?v=7',
  './img/ex/incline_pushup.svg?v=7',
  './img/ex/incline_walk.svg?v=7',
  './img/ex/inverted_row.svg?v=7',
  './img/ex/jump_rope.svg?v=7',
  './img/ex/jump_squat.svg?v=7',
  './img/ex/jumping_jacks.svg?v=7',
  './img/ex/kb_swing.svg?v=7',
  './img/ex/knee_pushup.svg?v=7',
  './img/ex/lat_pulldown.svg?v=7',
  './img/ex/lateral_raise.svg?v=7',
  './img/ex/leg_curl.svg?v=7',
  './img/ex/leg_ext.svg?v=7',
  './img/ex/leg_press.svg?v=7',
  './img/ex/leg_raise.svg?v=7',
  './img/ex/machine_shoulder.svg?v=7',
  './img/ex/mountain_climbers.svg?v=7',
  './img/ex/ohp.svg?v=7',
  './img/ex/pike_pushup.svg?v=7',
  './img/ex/plank.svg?v=7',
  './img/ex/pullup.svg?v=7',
  './img/ex/pushup.svg?v=7',
  './img/ex/rdl.svg?v=7',
  './img/ex/reverse_lunge.svg?v=7',
  './img/ex/rower.svg?v=7',
  './img/ex/russian_twist.svg?v=7',
  './img/ex/side_plank.svg?v=7',
  './img/ex/single_leg_bridge.svg?v=7',
  './img/ex/split_squat.svg?v=7',
  './img/ex/step_up.svg?v=7',
  './img/ex/stretch.svg?v=7',
  './img/ex/superman.svg?v=7',
  './img/ex/triceps_pushdown.svg?v=7',
  './img/ex/wall_sit.svg?v=7',
  './img/ex/warmup.svg?v=7',
  './img/ex/ytw.svg?v=7'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

// a page can ask a waiting worker (e.g. one installed by an older page) to take over right away
self.addEventListener('message', function (event) {
  if (event.data === 'skipWaiting' || (event.data && event.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE_VERSION) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
  // illustrations: fetched in the background so the first start is not slowed down
  caches.open(CACHE_VERSION).then(function (c) {
    return Promise.all(IMAGES.map(function (u) { return c.match(u).then(function (hit) { return hit || c.add(u).catch(function () {}); }); }));
  });
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') !== -1) return;
  if (/\/revoked\.json$/.test(url.pathname)) return;   // always straight from the network
  if (url.pathname.indexOf('/download/') !== -1) return;   // v9.5: the Android APK is never cached
  if (req.headers.get('X-HT-IC')) return;   // v9.5: integrity self-check reads the real files from the network
  var isNav = req.mode === 'navigate';

  event.respondWith(
    // versioned files (?v=) can use the HTTP cache; the page and unversioned files are revalidated (cheap 304)
    (isNav || !url.search ? fetch(isNav ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' })) : fetch(req)).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(isNav ? './index.html' : req, copy); });
      }
      return res;
    }).catch(function () {
      if (isNav) return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      return caches.match(req).then(function (r) { return r || caches.match(req, { ignoreSearch: true }); });
    })
  );
});

// v9.3: a tap on a reminder notification brings the app to the front (or opens it)
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = new URL((event.notification.data && event.notification.data.url) || 'index.html' + '#today', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ('focus' in c) { if (c.url !== url && c.navigate) c.navigate(url).catch(function () {}); return c.focus(); }
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
