/* Health tracker service worker — caches the app shell for offline use.
 * Strategy: network-first for same-origin GET (always fresh when online),
 * falling back to the cache when offline. Bump CACHE_VERSION on each release.
 * v4: the app is fully offline (food database, exercise library and tips are bundled); any /api/* path is never cached.
 * v5: «Челюсть 30 дней» (jaw-data.js, jaw.js) and «Уход за кожей» (skin.js) + face.css.
 * v6: violet-blue theme (theme.css) + new icon (icons/icon.svg).
 * v7: open app (no lock screen) + Pro (license-data.js, pro.js, vendor/nacl.min.js), AI assistant (ai.js), pro.css,
 *     exercise illustrations img/ex/*.svg + img/jaw/*.svg (cached in the background after install).
 *     revoked.json (key revocation list + server time) is never cached. */
'use strict';

var CACHE_VERSION = 'health-tracker-v7';
var APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=7',
  './face.css?v=7',
  './theme.css?v=7',
  './pro.css?v=7',
  './license-data.js?v=7',
  './pro.js?v=7',
  './foods.js?v=7',
  './exercises.js?v=7',
  './tips.js?v=7',
  './jaw-data.js?v=7',
  './jaw.js?v=7',
  './skin.js?v=7',
  './ai.js?v=7',
  './app.js?v=7',
  './vendor/nacl.min.js?v=7',
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
  var isNav = req.mode === 'navigate';

  event.respondWith(
    fetch(req).then(function (res) {
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
