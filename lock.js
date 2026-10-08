/* Health tracker — access-key lock (v6).
 *
 * The real app (markup, CSS, all JS) is shipped only as AES-256-GCM ciphertext in app.enc.json.
 * A random 256-bit master key encrypts it; that master key is wrapped (AES-GCM) once per access key
 * with a key derived by PBKDF2-SHA256 (600 000 iterations, unique 16-byte salt per access key).
 * Without a valid access key the app cannot be decrypted — there is nothing to bypass.
 *
 * Remember-me: the unwrapped master key is kept on this device as a NON-extractable CryptoKey in
 * IndexedDB, so the app opens instantly (and offline) next time. «Выйти» deletes it.
 */
(function (root) {
  'use strict';

  var PAYLOAD_URL = 'app.enc.json';
  var DB_NAME = 'ht-lock', DB_STORE = 'keys', DB_REC = 'master';
  var FAIL_KEY = 'ht-lock-fails';
  var subtle = root.crypto && root.crypto.subtle;

  // ---------- helpers (shared with the build/test scripts) ----------
  var CYR = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y' };
  function normalize(s) {
    s = String(s || '');
    if (s.normalize) s = s.normalize('NFKC');
    s = s.trim().toUpperCase().replace(/\s+/g, '');
    s = s.replace(/[\u2010-\u2015\u2212_]/g, '-').replace(/[АВЕКМНОРСТХУ]/g, function (c) { return CYR[c]; });
    var bare = s.replace(/-/g, '');
    if (/^HT[A-Z0-9]{12}$/.test(bare)) bare = bare.slice(2);
    if (/^[A-Z0-9]{12}$/.test(bare)) s = 'HT-' + bare.slice(0, 4) + '-' + bare.slice(4, 8) + '-' + bare.slice(8);
    return s;
  }
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function utf8(s) { return new TextEncoder().encode(s); }
  // 4-bit bucket hint so a key is only tested against ~1 wrapped entry instead of all 20 (keeps unlock fast on phones)
  function hint(norm) {
    return subtle.digest('SHA-256', utf8('ht-hint|' + norm)).then(function (d) { return new Uint8Array(d)[0] & 15; });
  }
  function unwrapWith(norm, entry, iterations) {
    return subtle.importKey('raw', utf8(norm), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(entry.salt), iterations: iterations },
        base, { name: 'AES-GCM', length: 256 }, false, ['unwrapKey']);
    }).then(function (kek) {
      return subtle.unwrapKey('raw', b64(entry.wrapped), kek, { name: 'AES-GCM', iv: b64(entry.iv) },
        { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    });
  }
  // Resolves to the (non-extractable) master CryptoKey, or rejects if the key is wrong.
  function unlockMaster(input, enc) {
    var norm = normalize(input);
    if (!/^HT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(norm)) return Promise.reject(new Error('format'));
    return hint(norm).then(function (h) {
      var cands = enc.keys.filter(function (e) { return e.h === h; });
      var i = 0;
      function next() {
        if (i >= cands.length) return Promise.reject(new Error('wrong'));
        return unwrapWith(norm, cands[i++], enc.kdf.iterations).catch(next);
      }
      return next();
    });
  }
  function decryptPayload(master, enc) {
    return subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.payload.iv) }, master, b64(enc.payload.ct)).then(function (buf) {
      return JSON.parse(new TextDecoder().decode(buf));
    });
  }

  var core = { normalize: normalize, unlockMaster: unlockMaster, decryptPayload: decryptPayload };
  if (typeof module === 'object' && module.exports) { module.exports = core; return; }

  // ======================================================================
  // Browser UI
  // ======================================================================
  var doc = document, html = doc.documentElement;
  var $ = function (id) { return doc.getElementById(id); };
  var encPromise = null;

  function loadEnc() {
    if (!encPromise) {
      encPromise = fetch(PAYLOAD_URL, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function (e) { encPromise = null; throw e; });
    }
    return encPromise;
  }

  // ---------- IndexedDB: remembered master key (non-extractable CryptoKey) ----------
  function idb() {
    return new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('no idb'));
      var rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(DB_STORE); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(DB_STORE, mode), st = tx.objectStore(DB_STORE), out;
        var rq = fn(st);
        if (rq) rq.onsuccess = function () { out = rq.result; };
        tx.oncomplete = function () { db.close(); res(out); };
        tx.onerror = tx.onabort = function () { db.close(); rej(tx.error); };
      });
    });
  }
  var getKey = function () { return idbDo('readonly', function (s) { return s.get(DB_REC); }); };
  var putKey = function (k) { return idbDo('readwrite', function (s) { return s.put(k, DB_REC); }); };
  var delKey = function () { return idbDo('readwrite', function (s) { return s.delete(DB_REC); }); };

  // ---------- brute-force slowdown (growing delay after failures) ----------
  function fails() { try { return JSON.parse(localStorage.getItem(FAIL_KEY)) || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } }
  function setFails(f) { try { if (f) localStorage.setItem(FAIL_KEY, JSON.stringify(f)); else localStorage.removeItem(FAIL_KEY); } catch (e) { /* private mode */ } }
  function delayFor(n) { return n < 3 ? 0 : Math.min(300, Math.pow(2, n - 2)) * 1000; }  // 3rd fail: 2 s, then 4, 8, 16 … up to 5 min

  var waitTimer = null;
  function setMsg(text, cls) { var m = $('lockMsg'); m.textContent = text || ''; m.className = 'lock-msg' + (cls ? ' ' + cls : ''); }
  function setBusy(on) {
    $('lockForm').classList.toggle('busy', on);
    $('lockBtn').disabled = on; $('lockInput').disabled = on;
  }
  function plSec(n) { var a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'секунду' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'секунды' : 'секунд'; }
  function enforceWait() {
    clearInterval(waitTimer);
    var f = fails();
    function tick() {
      var left = Math.ceil((f.until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(waitTimer); setBusy(false);
        if ($('lockMsg').classList.contains('wait')) setMsg('Можно попробовать снова');
        $('lockInput').focus();
        return true;
      }
      setBusy(true); $('lockForm').classList.remove('busy');
      setMsg('Слишком много попыток. Подождите ' + left + ' ' + plSec(left), 'wait');
      return false;
    }
    if (!tick()) waitTimer = setInterval(tick, 500);
  }
  function wrong(text) {
    var form = $('lockForm'), f = fails();
    f.n += 1; f.until = Date.now() + delayFor(f.n); setFails(f);
    setBusy(false);
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake', 'err');
    setMsg(text || 'Неверный ключ');
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    $('lockInput').select();
    if (f.until > Date.now()) setTimeout(enforceWait, 900);
  }

  function showForm() {
    html.classList.remove('checking', 'opening');
    setTimeout(function () { var i = $('lockInput'); if (i && !i.disabled) i.focus(); }, 60);
    if (fails().until > Date.now()) enforceWait();
  }

  // ---------- inject the decrypted app ----------
  var started = false;
  function start(p) {
    if (started) return; started = true;
    root.HTLock = { logout: logout, version: p.v };
    p.css.forEach(function (c) {
      var st = doc.createElement('style'); st.setAttribute('data-src', c.name); st.textContent = c.text; doc.head.appendChild(st);
    });
    var lock = $('lock');
    doc.body.insertAdjacentHTML('afterbegin', p.html);
    p.js.forEach(function (j) {
      var s = doc.createElement('script');
      s.textContent = j.text + '\n//# sourceURL=' + j.name;
      doc.body.appendChild(s);   // inline scripts run synchronously, in order
    });
    html.classList.remove('checking', 'opening');
    html.classList.add('unlocked');
    setTimeout(function () { if (lock && lock.parentNode) lock.parentNode.removeChild(lock); }, 600);
  }

  function openWith(master, remember) {
    html.classList.add('opening');
    $('lockLoadingTxt').textContent = 'Расшифровка…';
    return loadEnc().then(function (enc) { return decryptPayload(master, enc); }).then(function (p) {
      if (remember) return putKey(master).catch(function () { /* IndexedDB unavailable: ask again next time */ }).then(function () { return p; });
      return p;
    }).then(start);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (fails().until > Date.now()) { enforceWait(); return; }
    var input = $('lockInput').value;
    var form = $('lockForm');
    form.classList.remove('err');
    if (!normalize(input)) { wrong('Введите ключ доступа'); return; }
    if (!subtle) { setMsg('Браузер не поддерживает шифрование (нужен HTTPS)'); return; }
    setBusy(true); setMsg('Проверяем ключ…', 'ok');
    var t0 = Date.now();
    loadEnc().then(function (enc) {
      return unlockMaster(input, enc).then(function (master) {
        setFails(null);
        setMsg('');
        return openWith(master, true);
      }, function () {
        // keep every failure at least ~0.8 s so wrong guesses can't be fired rapidly
        return new Promise(function (r) { setTimeout(r, Math.max(0, 800 - (Date.now() - t0))); }).then(function () { wrong(); });
      });
    }).catch(function (err) {
      html.classList.remove('opening');
      setBusy(false);
      setMsg(navigator.onLine === false ? 'Нет сети: откройте приложение онлайн хотя бы один раз' : 'Не удалось загрузить приложение. Попробуйте ещё раз');
      if (root.console) console.warn('[lock]', err);
    });
  }

  function logout() {
    var done = function () { location.replace(location.pathname + '#today'); location.reload(); };
    delKey().then(done, done);
  }

  function boot() {
    $('lockForm').addEventListener('submit', onSubmit);
    $('lockInput').addEventListener('input', function () { $('lockForm').classList.remove('err'); if (!$('lockMsg').classList.contains('wait')) setMsg(''); });
    if (!subtle) { showForm(); setMsg('Откройте приложение по HTTPS-ссылке'); return; }
    loadEnc().catch(function () { /* surfaced on submit */ });
    getKey().then(function (master) {
      if (!master) return showForm();
      return openWith(master, false).catch(function (err) {
        // remembered key no longer matches this build (keys rotated) → forget it and ask again
        if (root.console) console.warn('[lock] remembered key rejected', err && err.name);
        encPromise = null;
        return delKey().catch(function () {}).then(showForm);
      });
    }, showForm);
  }

  // ---------- service worker (offline) ----------
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // a new version took over: reload once so the page uses fresh files
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    root.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').then(function (reg) { if (reg.update) reg.update(); })
        .catch(function (err) { console.warn('Service worker registration failed:', err); });
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
