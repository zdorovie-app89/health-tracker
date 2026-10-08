/* Health tracker service worker — key-locked build (v6).
 * Caches the public lock page and the ENCRYPTED app payload (app.enc.json) so the app opens offline.
 * Strategy: network-first for same-origin GET, falling back to the cache when offline. */
'use strict';

var CACHE_VERSION = 'health-tracker-v6';
var APP_SHELL = [
  './',
  './index.html',
  './lock.css?v=6',
  './lock.js?v=6',
  './app.enc.json',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './favicon.ico'
];
// build: 20261008T062632-7c9838

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
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
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
