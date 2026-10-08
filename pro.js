/* Здоровье v7–v8.1 — Free / Pro licensing (fully offline, no server).
 *
 *  • Free for everyone + automatic 7-day Pro trial from the first launch (stored on this device).
 *  • Pro keys are Ed25519-signed tokens  HT1.<base64url payload>.<base64url signature>
 *      payload { k: key id, d: devices 1|3|10|"owner", i: issued (unix s), e: expiry (unix s, 0 = never),
 *                u?: personal ID or [IDs] the key is bound to (v8.1), g?: 1 = gift, f?: gift sender name }
 *    verified with the public key from license-data.js (WebCrypto Ed25519, fallback: vendor/nacl.min.js).
 *    Without the private key (kept offline by the owner) a token cannot be forged or edited.
 *  • Activation: link …/#pro=<token>  or paste the token in Профиль / «Купить Про».
 *  • Legacy v6 access keys (HT-XXXX-XXXX-XXXX) = lifetime Pro, checked against salted PBKDF2 hashes only.
 *    Devices that had unlocked v6 keep lifetime Pro automatically (their stored v6 key decrypts a proof).
 *  • Revocation: revoked.json (list of key ids) fetched when online; the list is remembered offline.
 *  • Clock rollback: the max time seen (device clock + server Date header) is remembered; if the clock
 *    goes back more than 1 day, time-limited Pro (paid keys, trial) pauses until an online check.
 *  • Device limit: written into the key and shown, but NOT enforced (no server) — see onlineActivationCheck().
 *
 *  • Personal ID (v8.1): «ZD-XXXXXX», random per browser, shown in Профиль / «Купить Про», saved in backups.
 *    A key with `u` works only where the ID matches — sharing such a key is useless. Keys without `u` work anywhere.
 * Storage: localStorage 'health.pro.v1' -> { trialStart, token, v6key, maxSeen, revoked: [], revokedAt, last, uid }
 */
(function () {
  'use strict';
  var KEY = 'health.pro.v1';
  var DAY = 86400000, TRIAL_DAYS = 7;
  var TG_URL = 'https://t.me/FoZIKS7', TG_NAME = '@FoZIKS7';
  var TARIFFS = [{ d: 1, p: 399, w: '1 устройство' }, { d: 3, p: 549, w: '3 устройства' }, { d: 10, p: 999, w: '10 устройств' }];
  var LIC = window.HT_LICENSE || {};
  var subtle = window.crypto && window.crypto.subtle;

  /* ---------------- storage ---------------- */
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    if (!(s.trialStart > 0)) s.trialStart = 0;
    if (!Array.isArray(s.revoked)) s.revoked = [];
    if (!(s.maxSeen > 0)) s.maxSeen = 0;
    return s;
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }
  if (!S.trialStart) { S.trialStart = Date.now(); save(); }

  /* ---------------- personal ID (v8.1) ---------------- */
  var ID_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L — easy to read and dictate
  var ID_RX = /^ZD-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
  function newUid() {
    var a = new Uint8Array(6), s = 'ZD-', i;
    try { window.crypto.getRandomValues(a); } catch (e) { for (i = 0; i < 6; i++) a[i] = Math.floor(Math.random() * 256); }
    for (i = 0; i < 6; i++) s += ID_ALPHA[a[i] % ID_ALPHA.length];
    return s;
  }
  function validId(x) { return typeof x === 'string' && ID_RX.test(x); }
  if (!validId(S.uid)) { S.uid = newUid(); save(); }
  function userId() { return S.uid; }

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function b64uToBytes(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
  }
  function b64ToBytes(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function bytesToB64(u) { var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function utf8(s) { return new TextEncoder().encode(s); }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
  function fmtDate(ms) { return new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function devWord(d) { return d === 'owner' ? 'без ограничений' : 'до ' + d + ' ' + plural(d, 'устройства', 'устройств', 'устройств'); }

  /* ---------------- trusted time / clock rollback ---------------- */
  var anchor = null;   // { server: ms (from Date header), perf: performance.now() } — set by a successful online check
  function trustedNow() { return anchor ? anchor.server + (performance.now() - anchor.perf) : Date.now(); }
  function clockPaused() { return !anchor && S.maxSeen > 0 && Date.now() < S.maxSeen - DAY; }
  function effNow() { return Math.max(trustedNow(), S.maxSeen || 0); }
  function touchTime() {
    if (clockPaused()) return;
    var n = trustedNow();
    if (n > (S.maxSeen || 0)) { S.maxSeen = n; save(); }
  }

  /* ---------------- Ed25519 verification ---------------- */
  var naclPromise = null;
  function loadNacl() {
    if (window.nacl && window.nacl.sign) return Promise.resolve(window.nacl);
    if (!naclPromise) {
      naclPromise = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = 'vendor/nacl.min.js?v=9.0';
        s.onload = function () { window.nacl && window.nacl.sign ? res(window.nacl) : rej(new Error('nacl')); };
        s.onerror = function () { naclPromise = null; rej(new Error('nacl load')); };
        document.head.appendChild(s);
      });
    }
    return naclPromise;
  }
  var edKey = null, verifier = '';
  function edVerify(msg, sig) {
    var pub = b64uToBytes(LIC.pub || '');
    function viaNacl() { return loadNacl().then(function (n) { verifier = 'tweetnacl'; return n.sign.detached.verify(msg, sig, pub); }); }
    if (!subtle) return viaNacl();
    return Promise.resolve().then(function () {
      if (!edKey) edKey = subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
      return edKey;
    }).then(function (k) {
      return subtle.verify({ name: 'Ed25519' }, k, sig, msg).then(function (ok) { verifier = 'WebCrypto'; return ok; });
    }, function () { edKey = null; return viaNacl(); });   // Ed25519 not supported by this browser → bundled fallback
  }

  // → Promise<{ ok, p (payload), err }>
  function checkToken(tok) {
    var m = /^HT1\.([A-Za-z0-9_-]{10,1200})\.([A-Za-z0-9_-]{85,86})$/.exec(String(tok || '').trim());
    if (!m) return Promise.resolve({ ok: false, err: 'format' });
    var p;
    try { p = JSON.parse(new TextDecoder().decode(b64uToBytes(m[1]))); } catch (e) { return Promise.resolve({ ok: false, err: 'format' }); }
    var sig = b64uToBytes(m[2]);
    if (sig.length !== 64) return Promise.resolve({ ok: false, err: 'format' });
    return edVerify(utf8('HT1.' + m[1]), sig).then(function (ok) {
      if (!ok) return { ok: false, err: 'signature' };
      if (!p || typeof p.k !== 'string' || !/^[A-Z0-9]{4,12}$/.test(p.k) || !(p.d === 'owner' || p.d === 1 || p.d === 3 || p.d === 10) ||
        typeof p.i !== 'number' || typeof p.e !== 'number' || (p.d !== 'owner' && !(p.e > p.i))) return { ok: false, err: 'payload' };
      var ids = p.u === undefined ? null : [].concat(p.u);
      if (ids && (!ids.length || ids.length > 10 || !ids.every(validId))) return { ok: false, err: 'payload' };
      if ((p.g !== undefined && p.g !== 1) || (p.f !== undefined && (typeof p.f !== 'string' || p.f.length > 60))) return { ok: false, err: 'payload' };
      if (S.revoked.indexOf(p.k) >= 0) return { ok: false, err: 'revoked', p: p };
      if (ids && ids.indexOf(S.uid) < 0) return { ok: false, err: 'otherid', p: p };
      if (p.e && p.e * 1000 <= effNow()) return { ok: false, err: 'expired', p: p };
      return { ok: true, p: p };
    }, function () { return { ok: false, err: 'noverify' }; });
  }

  /* ---------------- legacy v6 access keys (salted PBKDF2 hashes only) ---------------- */
  var CYR = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y' };
  function normV6(s) {
    s = String(s || ''); if (s.normalize) s = s.normalize('NFKC');
    s = s.trim().toUpperCase().replace(/\s+/g, '');
    s = s.replace(/[\u2010-\u2015\u2212_]/g, '-').replace(/[АВЕКМНОРСТХУ]/g, function (c) { return CYR[c]; });
    var bare = s.replace(/-/g, '');
    if (/^HT[A-Z0-9]{12}$/.test(bare)) bare = bare.slice(2);
    if (/^[A-Z0-9]{12}$/.test(bare)) s = 'HT-' + bare.slice(0, 4) + '-' + bare.slice(4, 8) + '-' + bare.slice(8);
    return s;
  }
  function checkV6(input) {
    var norm = normV6(input);
    if (!/^HT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(norm) || !LIC.v6 || !subtle) return Promise.resolve(null);
    return subtle.importKey('raw', utf8(norm), 'PBKDF2', false, ['deriveBits']).then(function (base) {
      return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(LIC.v6.salt), iterations: LIC.v6.iter }, base, 128);
    }).then(function (bits) {
      return LIC.v6.hashes.indexOf(bytesToB64(new Uint8Array(bits))) >= 0 ? norm : null;
    }).catch(function () { return null; });
  }
  // a device that unlocked v6 still holds the v6 master key (non-extractable) in IndexedDB 'ht-lock'
  function checkV6Device() {
    if (!window.indexedDB || !subtle || !LIC.v6dev) return Promise.resolve(false);
    return new Promise(function (res) {
      var done = false, fin = function (v) { if (!done) { done = true; res(v); } };
      setTimeout(function () { fin(false); }, 2500);
      try {
        var rq = indexedDB.open('ht-lock', 1);
        rq.onupgradeneeded = function () { try { rq.transaction.abort(); } catch (e) { /* no v6 db */ } fin(false); };
        rq.onerror = function () { fin(false); };
        rq.onsuccess = function () {
          var db = rq.result;
          try {
            var g = db.transaction('keys', 'readonly').objectStore('keys').get('master');
            g.onsuccess = function () {
              var k = g.result; db.close();
              if (!k) return fin(false);
              subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(LIC.v6dev.iv) }, k, b64ToBytes(LIC.v6dev.ct)).then(function (pt) {
                fin(new TextDecoder().decode(pt) === LIC.v6dev.pt);
              }, function () { fin(false); });
            };
            g.onerror = function () { db.close(); fin(false); };
          } catch (e) { db.close(); fin(false); }
        };
      } catch (e) { fin(false); }
    });
  }

  /* ---------------- device limit hook (NOT enforced — there is no server) ----------------
   * Plug an online activation check in here later (e.g. POST { kid, deviceId } to a server that counts
   * devices per key id and answers { ok:false } over the limit). Today it always allows. */
  function deviceId() { return S.uid; }
  function onlineActivationCheck(payload) {   // eslint-disable-line no-unused-vars
    return Promise.resolve({ ok: true, enforced: false, deviceId: deviceId() });
  }

  /* ---------------- state ---------------- */
  var V = { tok: null, tokErr: null, v6: false, dev: false, checked: false };
  var listeners = [];
  var status = S.last && typeof S.last === 'object' ? S.last : null;

  function compute() {
    var now = effNow(), paused = clockPaused(), st;
    var trialEnd = S.trialStart + TRIAL_DAYS * DAY;
    var tp = V.tok;
    if (tp && tp.d === 'owner' && S.revoked.indexOf(tp.k) < 0) st = { tier: 'owner', pro: true, kid: tp.k, devices: 'owner' };
    else if (V.v6 || V.dev) st = { tier: 'lifetime', pro: true, source: V.v6 ? 'v6key' : 'v6device' };
    else if (tp && S.revoked.indexOf(tp.k) >= 0) st = { tier: 'free', pro: false, note: 'revoked', kid: tp.k };
    else if (tp && paused) st = { tier: 'paused', pro: false, kid: tp.k, devices: tp.d, until: tp.e * 1000 };
    else if (tp && tp.e * 1000 > now) st = { tier: 'pro', pro: true, kid: tp.k, devices: tp.d, until: tp.e * 1000, daysLeft: Math.max(1, Math.ceil((tp.e * 1000 - now) / DAY)) };
    else if (paused && trialEnd > Date.now()) st = { tier: 'paused', pro: false };
    else if (trialEnd > now) st = { tier: 'trial', pro: true, until: trialEnd, daysLeft: Math.min(TRIAL_DAYS, Math.max(1, Math.ceil((trialEnd - now) / DAY))) };
    else if (V.other) st = { tier: 'free', pro: false, note: 'otherid', kid: V.other.k };
    else st = { tier: 'free', pro: false, note: tp ? 'expired' : (S.trialStart ? 'trialOver' : ''), kid: tp ? tp.k : undefined, until: tp ? tp.e * 1000 : undefined };
    st.trialEnd = trialEnd;
    return st;
  }
  function publish() {
    touchTime();
    var prev = status ? JSON.stringify([status.tier, status.pro, status.until, status.kid]) : '';
    status = compute();
    S.last = { tier: status.tier, pro: status.pro, until: status.until, kid: status.kid, devices: status.devices, daysLeft: status.daysLeft };
    save();
    document.documentElement.classList.toggle('is-pro', !!status.pro);
    document.documentElement.classList.toggle('is-free', !status.pro);
    if (prev !== JSON.stringify([status.tier, status.pro, status.until, status.kid])) listeners.forEach(function (fn) { try { fn(status); } catch (e) { /* ignore */ } });
  }

  function verifyStored() {
    var jobs = [];
    jobs.push(S.token ? checkToken(S.token).then(function (r) {
      V.tok = r.ok ? r.p : (r.err === 'expired' || r.err === 'revoked' ? r.p : null);
      V.tokErr = r.ok ? null : r.err;
      V.other = r.err === 'otherid' ? r.p : null;   // kept (not deleted): restoring the right ID from a backup re-enables it
      if (!r.ok && (r.err === 'signature' || r.err === 'format' || r.err === 'payload')) { S.token = null; save(); }
    }) : Promise.resolve(V.tok = null));
    jobs.push(S.v6key ? checkV6(S.v6key).then(function (n) { V.v6 = !!n; if (!n) { S.v6key = null; save(); } }) : Promise.resolve());
    jobs.push(checkV6Device().then(function (ok) { V.dev = ok; }));
    return Promise.all(jobs).then(function () { V.checked = true; publish(); });
  }

  /* ---------------- online: revocation list + server time ---------------- */
  var lastOnline = 0;
  function refreshOnline() {
    if (!window.fetch || (navigator.onLine === false)) return Promise.resolve(false);
    lastOnline = Date.now();
    return fetch('revoked.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = Date.parse(r.headers.get('Date') || '');
      return r.json().then(function (j) {
        if (j && Array.isArray(j.revoked)) { S.revoked = j.revoked.filter(function (k) { return typeof k === 'string'; }); S.revokedAt = Date.now(); }
        if (isFinite(d) && d > 1.7e12) { anchor = { server: d, perf: performance.now() }; S.maxSeen = d; S.serverSeenAt = d; }
        save();
        return verifyStored().then(function () { return true; });
      });
    }).catch(function () { return false; });
  }

  /* ---------------- activation ---------------- */
  var ERR = {
    format: 'Это не похоже на ключ. Скопируй ключ целиком (начинается с HT1.) или открой ссылку-ключ.',
    signature: 'Ключ повреждён или подделан — подпись не совпадает.',
    payload: 'Ключ повреждён — неверные данные внутри.',
    expired: 'Срок действия этого ключа уже истёк.',
    revoked: 'Этот ключ отозван. Напиши в поддержку ' + TG_NAME + '.',
    noverify: 'Не удалось проверить ключ на этом устройстве. Обнови браузер или напиши ' + TG_NAME + '.',
    v6: 'Ключ доступа не найден. Проверь, что он введён без ошибок.',
    paused: 'Время на устройстве сдвинуто назад. Подключись к интернету, чтобы проверить ключ.',
    otherid: 'Этот ключ для другого ID.'
  };
  function idList(p) { return [].concat(p && p.u || []); }
  function giftInfo(p) { return p && p.g === 1 ? { from: p.f || '', days: p.e ? Math.max(1, Math.round((p.e - p.i) / 86400)) : 0, until: p.e * 1000 } : null; }
  function extractToken(input) {
    var s = String(input || '').trim();
    var i = s.indexOf('#pro=');
    if (i >= 0) s = s.slice(i + 5);
    try { s = decodeURIComponent(s); } catch (e) { /* keep */ }
    return s.replace(/\s+/g, '');
  }
  function activate(input) {
    var raw = String(input || '').trim();
    if (!raw) return Promise.resolve({ ok: false, msg: 'Вставь ключ или ссылку-ключ.' });
    var tok = extractToken(raw);
    if (/^HT1\./.test(tok)) {
      return checkToken(tok).then(function (r) {
        if (!r.ok) {
          var msg = ERR[r.err] || ERR.format;
          if (r.err === 'expired' && r.p) msg = 'Срок действия ключа ' + r.p.k + ' истёк ' + fmtDate(r.p.e * 1000) + ' — напиши ' + TG_NAME + ' для продления.';
          if (r.err === 'otherid' && r.p) msg = 'Этот ключ для другого ID (' + idList(r.p).join(', ') + '). Твой ID: ' + S.uid + '. Если это твой ключ — восстанови ID из резервной копии или напиши ' + TG_NAME + '.';
          return { ok: false, msg: msg, err: r.err };
        }
        return onlineActivationCheck(r.p).then(function (chk) {
          if (!chk.ok) return { ok: false, msg: chk.msg || 'Превышен лимит устройств для этого ключа.' };
          var cur = V.tok && V.tokErr === null ? V.tok : null;
          if (cur && cur.d === 'owner' && r.p.d !== 'owner') return { ok: true, msg: 'У тебя уже владельческий доступ — всё включено.', kept: true };
          if (cur && cur.d !== 'owner' && r.p.d !== 'owner' && cur.e > r.p.e) return { ok: true, msg: 'У тебя уже есть ключ с более поздним сроком (до ' + fmtDate(cur.e * 1000) + ').', kept: true };
          var renewed = cur && cur.k === r.p.k;
          S.token = tok; save();
          V.tok = r.p; V.tokErr = null; V.other = null;
          publish();
          var gift = giftInfo(r.p);
          var m = r.p.d === 'owner' ? 'Владельческий доступ активирован: все функции бессрочно.'
            : gift ? '🎁 Тебе подарили Про на ' + gift.days + ' ' + plural(gift.days, 'день', 'дня', 'дней') + (gift.from ? ' от ' + gift.from : '') + '! Действует до ' + fmtDate(gift.until)
            : (renewed ? 'Про продлён' : 'Про активирован') + ' до ' + fmtDate(r.p.e * 1000) + ' · ' + devWord(r.p.d) + '.';
          return { ok: true, msg: m, status: status, gift: gift };
        });
      });
    }
    if (/^HT1/i.test(tok)) return Promise.resolve({ ok: false, msg: ERR.format, err: 'format' });
    return checkV6(raw).then(function (norm) {
      if (!norm) return { ok: false, msg: /^HT-?/i.test(normV6(raw)) ? ERR.v6 : ERR.format, err: 'v6' };
      S.v6key = norm; save(); V.v6 = true; publish();
      return { ok: true, msg: 'Ключ доступа принят: Про навсегда на этом устройстве.', status: status };
    });
  }
  function deactivate() { S.token = null; S.v6key = null; V.tok = null; V.v6 = false; save(); publish(); }

  /* ---------------- UI: shared bits ---------------- */
  var LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
  function badge(extra) { return '<span class="pro-badge' + (extra ? ' ' + extra : '') + '">' + LOCK_SVG + 'Pro</span>'; }
  function lockCard(title, text, from) {
    return '<section class="card pro-lock-card"><div class="pro-lock-ic">' + LOCK_SVG + '</div><h2>' + esc(title) + ' ' + badge() + '</h2>' +
      '<p class="muted small">' + esc(text) + '</p>' +
      '<a class="btn primary big" href="#buy' + (from ? '/' + from : '') + '">Открыть Про · от 399 ₽/мес</a></section>';
  }
  var toastT = null;
  function toast(msg) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function modal(html) {
    var m = document.getElementById('proModal');
    if (!m) { m = document.createElement('div'); m.id = 'proModal'; m.className = 'pro-modal'; document.body.appendChild(m); }
    m.innerHTML = '<div class="pro-modal-card card" role="dialog" aria-modal="true">' + html + '<button type="button" class="btn wide" data-pro-close>Закрыть</button></div>';
    m.hidden = false;
    m.onclick = function (e) { if (e.target === m || e.target.closest('[data-pro-close]')) m.hidden = true; };
  }
  function giftModal(g) {
    modal('<div class="pro-gift-ic" aria-hidden="true">🎁</div><h2>Тебе подарили Про!</h2>' +
      '<p class="pro-gift-line">На <b>' + g.days + ' ' + plural(g.days, 'день', 'дня', 'дней') + '</b>' + (g.from ? ' от <b>' + esc(g.from) + '</b>' : '') + '</p>' +
      '<p class="muted">Все функции открыты до ' + fmtDate(g.until) + ': ИИ-ассистент, вся программа для челюсти, персональный уход, статистика и таблица CSV. Приятного пользования ✨</p>');
    var c = document.querySelector('#proModal .pro-modal-card'); if (c) c.classList.add('pro-gift-card');
  }
  function statusLine(st) {
    st = st || status || compute();
    if (st.tier === 'owner') return { t: 'Владелец', s: 'Все функции · бессрочно', cls: 'owner' };
    if (st.tier === 'lifetime') return { t: 'Про навсегда', s: st.source === 'v6device' ? 'Ключ доступа v6 на этом устройстве' : 'По ключу доступа v6', cls: 'pro' };
    if (st.tier === 'pro') return { t: 'Про до ' + fmtDate(st.until), s: 'Осталось ' + st.daysLeft + ' ' + plural(st.daysLeft, 'день', 'дня', 'дней'), cls: 'pro' };
    if (st.tier === 'trial') return { t: 'Пробный Про: ' + st.daysLeft + ' ' + plural(st.daysLeft, 'день', 'дня', 'дней'), s: 'до ' + fmtDate(st.until) + ', затем — бесплатная версия', cls: 'trial' };
    if (st.tier === 'paused') return { t: 'Про на паузе', s: 'Время на устройстве сдвинуто назад. Подключись к интернету для проверки.', cls: 'paused' };
    var s = st.note === 'revoked' ? 'Ключ ' + st.kid + ' отозван' : st.note === 'otherid' ? 'Ключ ' + st.kid + ' привязан к другому ID' : st.note === 'expired' ? 'Срок ключа ' + st.kid + ' истёк ' + fmtDate(st.until) : 'Пробный период закончился';
    return { t: 'Бесплатная версия', s: s, cls: 'free' };
  }
  var flash = null;   // result of the last activation, kept across re-renders for a few seconds
  function activateForm(id) {
    var f = flash && Date.now() - flash.at < 15000 ? flash : null;
    return '<form class="pro-activate" data-pro-form autocomplete="off" novalidate>' +
      '<label class="pro-act-lbl" for="' + id + '">Есть ключ? Вставь его сюда</label>' +
      '<div class="pro-act-row"><input id="' + id + '" class="pro-key-input" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="HT1.… или ссылка-ключ">' +
      '<button type="submit" class="btn primary">Активировать</button></div><div class="pro-act-msg' + (f ? ' ' + f.cls : '') + '" aria-live="polite">' + (f ? esc(f.text) : '') + '</div></form>';
  }

  /* ---------------- Profile card ---------------- */
  function renderProfileCard() {
    var box = document.getElementById('proCard'); if (!box) return;
    var st = status || compute(), l = statusLine(st), rows = '';
    if (st.devices) rows += '<div class="pro-kv"><span>Устройства</span><b>' + (st.devices === 'owner' ? 'без ограничений' : devWord(st.devices)) + '</b></div>';
    if (st.kid) rows += '<div class="pro-kv"><span>Номер ключа</span><b class="mono">' + esc(st.kid) + '</b></div>';
    if (V.tok && V.tok.u && !V.tokErr) rows += '<div class="pro-kv"><span>Привязка</span><b>к твоему ID ✓</b></div>';
    if (st.tier === 'pro' || st.tier === 'owner') rows += '<div class="pro-kv"><span>Проверка ключа</span><b>подпись ✓' + (S.revokedAt ? ' · список отзыва ' + new Date(S.revokedAt).toLocaleDateString('ru-RU') : '') + '</b></div>';
    box.innerHTML = '<div class="card-head"><h2>Про-доступ</h2><span class="pro-tier ' + l.cls + '">' + (st.pro ? '★ ' : '') + esc(l.t.split(':')[0].replace(/ до .*/, '')) + '</span></div>' +
      '<div class="pro-status ' + l.cls + '"><b>' + esc(l.t) + '</b><small>' + esc(l.s) + '</small></div>' + idBox('Твой ID') + rows +
      (st.tier === 'owner' || st.tier === 'lifetime' ? '' : '<a class="btn primary wide pro-buy-btn" href="#buy">' + (st.tier === 'pro' ? 'Продлить Про' : 'Купить Про · от 399 ₽') + '</a>') +
      activateForm('proKeyProfile') +
      (st.devices && st.devices !== 'owner' ? '<p class="muted small">Число устройств записано в ключе. Пожалуйста, используй ключ только на своих устройствах.</p>' : '') +
      '<a class="btn wide pro-support" href="' + TG_URL + '" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> Поддержка · ' + TG_NAME + '</a>';
  }

  function idBox(label, note) {
    return '<div class="pro-id"><span class="pro-id-l">' + esc(label) + '</span><b class="mono" id="proUid">' + esc(S.uid) + '</b>' +
      '<button type="button" class="btn small" data-pro-copyid>Копировать</button>' + (note ? '<small class="muted">' + note + '</small>' : '') + '</div>';
  }

  /* ---------------- Buy screen ---------------- */
  var buySel = 3;
  function tariff() { return TARIFFS.filter(function (x) { return x.d === buySel; })[0]; }
  function hintText() { var t = tariff(); return 'Хочу Про на ' + t.w + ' (' + t.p + ' ₽/мес). Мой ID: ' + S.uid; }
  function giftHintText() { var t = tariff(); return 'Хочу подарить Про на ' + t.w + ' (' + t.p + ' ₽/мес). ID друга: ZD-______ (или нужна непривязанная ссылка-подарок). От кого: ______'; }
  // v9: what stays free (grows with the v9 parts that are loaded)
  function freeText() {
    var a = ['все показатели и свои цели', '«Сегодня» с подсказкой следующего дела', 'текущая серия', 'итоги недели',
      'резервная копия данных (JSON) и импорт'];
    if (window.V9Insights) a.push('прогноз веса и наблюдения за 7 дней');
    if (window.V9Sleep) a.push('сон по времени отбоя и подъёма, регулярность');
    a.push('поиск и дневник еды' + (window.V9Food ? ' со штрихкодами, избранным и «Повторить вчера»' : ''));
    a.push('тренировки с картинками' + (window.V9Workout ? ' и подсказкой следующего веса' : ''));
    if (window.V9Body) a.push('замеры талии и шеи, фото «было / стало»');
    if (window.V9Remind) a.push('напоминания');
    a.push('неделя 1 программы для челюсти', 'базовый уход за кожей', 'статистика за 7 дней');
    return a.join(', ');
  }
  function renderBuy() {
    var root = document.getElementById('buyRoot'); if (!root) return;
    var st = status || compute(), l = statusLine(st);
    var feats = [
      ['🤖', 'ИИ-ассистент', 'отвечает по твоим данным, знает КБЖУ продуктов, комментирует итоги недели; с облачным ИИ — свободный чат и распознавание еды по фото'],
      ['📒', 'Графики прогресса по упражнениям', 'рост веса и повторов по каждому упражнению из истории тренировок'],
      ['💪', 'Вся программа «Челюсть 30 дней»', 'недели 2–4 и финал, а не только первая неделя'],
      ['🧴', 'Персональный уход за кожей', 'тест на тип кожи, кислоты и шаги под твою кожу'],
      ['📈', 'Вся статистика и тренды', 'годовая карта, «всё время», рекорды и лучшая серия' + (window.V9Insights ? '; наблюдения за 30 и 90 дней' : '')],
      ['📊', 'Таблица CSV', 'все записи для Excel или Google Таблиц (резервная копия JSON — бесплатно)']
    ];
    root.innerHTML =
      '<header class="top top-back"><a class="icon-btn" href="#profile" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>' +
      '<div class="grow"><h1 class="title">Купить Про</h1><div class="subtitle">Все функции «Здоровья» без ограничений</div></div></header>' +
      '<section class="card pro-hero"><div class="pro-hero-star">★</div><div class="pro-status ' + l.cls + '"><b>Сейчас: ' + esc(l.t) + '</b><small>' + esc(l.s) + '</small></div></section>' +
      '<section class="card"><div class="card-head"><h2>Что входит в Про</h2></div><ul class="pro-feats">' +
      feats.map(function (f) { return '<li><span class="pro-fi">' + f[0] + '</span><span><b>' + f[1] + '</b><small>' + f[2] + '</small></span></li>'; }).join('') +
      '</ul><p class="muted small">Бесплатно навсегда: ' + freeText() + '.</p></section>' +
      '<section class="card"><div class="card-head"><h2>Тарифы</h2><span class="muted small">в месяц</span></div><div class="pro-tariffs" role="radiogroup">' +
      TARIFFS.map(function (t) {
        return '<button type="button" role="radio" aria-checked="' + (t.d === buySel) + '" class="pro-tariff' + (t.d === buySel ? ' on' : '') + '" data-tariff="' + t.d + '">' +
          (t.d === 3 ? '<span class="pro-pop">выгодно</span>' : '') + '<b>' + t.p + ' ₽</b><span>' + t.w + '</span></button>';
      }).join('') + '</div></section>' +
      '<section class="card"><div class="card-head"><h2>Как купить</h2></div>' +
      idBox('Твой ID — пришли его при покупке', 'Ключ будет привязан к этому ID и не сработает у других. ID есть и в «Профиле», он сохраняется в резервной копии.') +
      '<ol class="pro-steps">' +
      '<li>Напиши в Telegram <a href="' + TG_URL + '" target="_blank" rel="noopener">' + TG_NAME + '</a>, выбери тариф и пришли свой ID.</li>' +
      '<li>Оплати переводом по СБП (реквизиты пришлют в личке).</li>' +
      '<li>Получи ссылку-ключ и открой её — или вставь ключ ниже.</li></ol>' +
      '<div class="pro-hint"><span class="muted small">Можно отправить так:</span><b id="proHint">«' + esc(hintText()) + '»</b>' +
      '<button type="button" class="link-btn small" data-pro-copy>Скопировать</button></div>' +
      '<a class="btn primary big pro-tg" href="' + TG_URL + '" target="_blank" rel="noopener" data-pro-tg><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 4.5L2.8 11.7c-1 .4-1 1.8.1 2.1l4.6 1.4 1.8 5.5c.3.8 1.3 1 1.9.4l2.6-2.5 4.8 3.5c.8.6 1.9.1 2.1-.9l3-15c.2-1.1-.9-2-1.9-1.6zM9.6 14.4l8.3-7.4-6.6 8.6-.3 3.3z"/></svg>Написать в Telegram</a>' +
      '<button type="button" class="btn wide pro-card-soon" disabled>💳 Оплата картой — скоро</button></section>' +
      '<section class="card pro-gift"><div class="card-head"><h2>🎁 Подарить Про</h2></div><ol class="pro-steps">' +
      '<li>Напиши <a href="' + TG_URL + '" target="_blank" rel="noopener">' + TG_NAME + '</a> и выбери тариф для друга (тариф выше).</li>' +
      '<li>Пришли <b>ID друга</b> — он найдёт его в «Профиль → Про-доступ». Тогда подарок сработает только у него. Если хочешь сюрприз — попроси непривязанную ссылку-подарок.</li>' +
      '<li>Оплати переводом по СБП.</li>' +
      '<li>Получи ссылку-подарок и отправь другу: при открытии он увидит «🎁 Тебе подарили Про» и твоё имя.</li></ol>' +
      '<p class="muted small">Честно: непривязанная ссылка сработает у любого, кто её откроет, — отправляй её только другу лично. Ссылка, привязанная к ID, работает только у него.</p>' +
      '<div class="pro-hint"><span class="muted small">Можно отправить так:</span><b id="proGiftHint">«' + esc(giftHintText()) + '»</b>' +
      '<button type="button" class="link-btn small" data-pro-copygift>Скопировать</button></div>' +
      '<a class="btn wide" href="' + TG_URL + '" target="_blank" rel="noopener" data-pro-tggift>🎁 Подарить через Telegram</a></section>' +
      '<section class="card">' + activateForm('proKeyBuy') + '</section>' +
      '<p class="muted small pro-foot">Ключ действует 30 дней с момента выдачи, продление — новым ключом. Вопросы — <a href="' + TG_URL + '" target="_blank" rel="noopener">' + TG_NAME + '</a>.</p>';
  }
  function copyText(s) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return false; }); } catch (e) { /* ignore */ }
    return Promise.resolve(false);
  }

  /* ---------------- events ---------------- */
  document.addEventListener('submit', function (e) {
    var f = e.target.closest && e.target.closest('[data-pro-form]'); if (!f) return;
    e.preventDefault();
    var inp = f.querySelector('input'), msg = f.querySelector('.pro-act-msg'), btn = f.querySelector('button');
    btn.disabled = true; msg.className = 'pro-act-msg'; msg.textContent = 'Проверяю…';
    activate(inp.value).then(function (r) {
      btn.disabled = false;
      msg.className = 'pro-act-msg ' + (r.ok ? 'ok' : 'err'); msg.textContent = r.msg;
      flash = { cls: r.ok ? 'ok' : 'err', text: r.msg, at: Date.now() };
      if (r.ok && r.gift) giftModal(r.gift);
      if (r.ok) { inp.value = ''; toast(r.msg); renderProfileCard(); if (document.getElementById('buyRoot') && location.hash.indexOf('#buy') === 0) setTimeout(renderBuy, 1200); }
    });
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-tariff]');
    if (t) { buySel = Number(t.getAttribute('data-tariff')); renderBuy(); return; }
    if (e.target.closest && e.target.closest('[data-pro-copy]')) { copyText(hintText()).then(function (ok) { toast(ok ? 'Текст скопирован — вставь его в чат' : hintText()); }); return; }
    if (e.target.closest && e.target.closest('[data-pro-tg]')) { copyText(hintText()); }
    if (e.target.closest && e.target.closest('[data-pro-copyid]')) { copyText(S.uid).then(function (ok) { toast(ok ? 'ID скопирован: ' + S.uid : 'Твой ID: ' + S.uid); }); return; }
    if (e.target.closest && e.target.closest('[data-pro-copygift]')) { copyText(giftHintText()).then(function (ok) { toast(ok ? 'Текст скопирован — вставь его в чат' : giftHintText()); }); return; }
    if (e.target.closest && e.target.closest('[data-pro-tggift]')) { copyText(giftHintText()); }
    var lk = e.target.closest && e.target.closest('[data-pro-lock]');
    if (lk) { e.preventDefault(); location.hash = '#buy/' + (lk.getAttribute('data-pro-lock') || ''); }
  });

  /* ---------------- activation link  #pro=<token> ---------------- */
  var pendingLink = null;
  function grabLink() {
    var h = location.hash || '';
    if (h.indexOf('#pro=') !== 0) return false;
    pendingLink = h.slice(5);
    try { history.replaceState(null, '', location.pathname + location.search + '#profile'); } catch (e) { location.hash = '#profile'; }
    return true;
  }
  function handleLink() {
    if (!pendingLink) return;
    var tok = pendingLink; pendingLink = null;
    activate(tok).then(function (r) {
      renderProfileCard();
      if (r.ok && r.gift) { giftModal(r.gift); return; }
      modal('<div class="pro-modal-ic ' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? '★' : '!') + '</div><h2>' + (r.ok ? 'Готово!' : 'Ключ не принят') + '</h2><p class="muted">' + esc(r.msg) + '</p>' +
        (r.ok ? '' : '<a class="btn primary wide" href="' + TG_URL + '" target="_blank" rel="noopener">Написать ' + TG_NAME + '</a>'));
    });
  }
  grabLink();
  window.addEventListener('hashchange', function () { if (grabLink()) { ready.then(handleLink); } });

  /* ---------------- boot ---------------- */
  // instant status for the first paint: a previously verified paid/owner status is trusted until re-verification finishes
  (function () {
    touchTime();
    status = compute();
    var L = S.last;
    if (!status.pro && L && L.pro && (L.tier === 'owner' || L.tier === 'lifetime' || (L.tier === 'pro' && L.until > effNow()))) {
      status = { tier: L.tier, pro: true, until: L.until, kid: L.kid, devices: L.devices, daysLeft: L.daysLeft, trialEnd: status.trialEnd, cached: true };
    }
    document.documentElement.classList.toggle('is-pro', !!status.pro);
    document.documentElement.classList.toggle('is-free', !status.pro);
  })();
  var ready = verifyStored().then(function () { handleLink(); });
  ready.then(function () { if (navigator.onLine !== false) refreshOnline(); });
  window.addEventListener('online', function () { refreshOnline(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    publish();
    if (Date.now() - lastOnline > 6 * 3600000) refreshOnline();
  });
  setInterval(publish, 60000);

  window.HTPro = {
    ready: ready,
    status: function () { return status || compute(); },
    isPro: function () { return !!(status || compute()).pro; },
    can: function () { return !!(status || compute()).pro; },   // every Pro feature unlocks together
    onChange: function (fn) { listeners.push(fn); },
    activate: activate, deactivate: deactivate, refreshOnline: refreshOnline,
    badge: badge, lockCard: lockCard, statusLine: statusLine, toast: toast,
    renderProfileCard: renderProfileCard, renderBuy: renderBuy,
    onlineActivationCheck: onlineActivationCheck,
    userId: userId, validId: validId,
    setUserId: function (id) { if (!validId(id)) return false; S.uid = id; save(); verifyStored(); renderProfileCard(); return true; },
    _debug: function () { return { verifier: verifier, anchor: anchor, maxSeen: S.maxSeen, paused: clockPaused(), V: V }; },
    TG_URL: TG_URL, TG_NAME: TG_NAME
  };
})();
