/* Здоровье v9.3 — замеры (талия, шея, бёдра) с грубой оценкой % жира по формуле ВМС США
 * и настоящие фото-чекпоинты «Челюсть 30 дней» (дни 1 / 7 / 30) со сравнением «было / стало».
 * Фото сжимаются (до 1080 px, JPEG) и хранятся только на устройстве в IndexedDB 'ht-photos' — никуда не загружаются.
 * Storage: localStorage 'health.measure.v1' -> { 'YYYY-MM-DD': { waist?, neck?, hip? } } (см) */
(function () {
  'use strict';
  var MKEY = 'health.measure.v1';
  function A() { return window.HTApp; }
  function U() { return window.V9.util; }
  function cm(v) { v = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(v) && v >= 20 && v <= 250 ? Math.round(v * 10) / 10 : null; }
  function cleanM(o) {
    var out = {}; if (!o || typeof o !== 'object') return out;
    Object.keys(o).forEach(function (k) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !o[k]) return;
      var e = {}; ['waist', 'neck', 'hip'].forEach(function (f) { var v = cm(o[k][f]); if (v !== null) e[f] = v; });
      if (Object.keys(e).length) out[k] = e;
    });
    return out;
  }
  var M = (function () { try { return cleanM(JSON.parse(localStorage.getItem(MKEY) || '{}')); } catch (e) { return {}; } })();
  function saveM() { try { localStorage.setItem(MKEY, JSON.stringify(M)); } catch (e) { A().toast('Не удалось сохранить — память заполнена'); } }
  window.addEventListener('storage', function (e) { if (e.key === MKEY) { try { M = cleanM(JSON.parse(e.newValue || '{}')); } catch (x) { /* */ } } });
  function keys() { return Object.keys(M).sort(); }
  function last(f) { var ks = keys(); for (var i = ks.length - 1; i >= 0; i--) if (M[ks[i]][f] !== undefined) return { k: ks[i], v: M[ks[i]][f] }; return null; }
  function first(f) { var ks = keys(); for (var i = 0; i < ks.length; i++) if (M[ks[i]][f] !== undefined) return { k: ks[i], v: M[ks[i]][f] }; return null; }

  /* US Navy body-fat estimate (Hodgdon & Beckett), inputs in cm → inches */
  function navy(sex, height, waist, neck, hip) {
    if (!height || !waist || !neck || (sex !== 'm' && sex !== 'f')) return null;
    var i = function (x) { return x / 2.54; }, bf;
    if (sex === 'm') { if (waist - neck <= 0) return null; bf = 86.010 * Math.log10(i(waist - neck)) - 70.041 * Math.log10(i(height)) + 36.76; }
    else { if (!hip || waist + hip - neck <= 0) return null; bf = 163.205 * Math.log10(i(waist + hip - neck)) - 97.684 * Math.log10(i(height)) - 78.387; }
    return isFinite(bf) && bf > 2 && bf < 70 ? Math.round(bf * 10) / 10 : null;
  }
  function bfNow() {
    var s = A().settings(), w = last('waist'), n = last('neck'), hp = last('hip');
    var v = navy(s.sex, s.height, w && w.v, n && n.v, hp && hp.v);
    return { v: v, need: !s.height ? 'рост' : !s.sex ? 'пол' : !w ? 'талия' : !n ? 'шея' : s.sex === 'f' && !hp ? 'бёдра' : null };
  }
  function due() { var l = keys(); if (!l.length) return false; var u = U(), lk = l[l.length - 1]; return (u.today0() - u.pkey(lk)) / 864e5 >= 7; }

  /* ---------------- #body view ---------------- */
  function render() {
    var root = document.getElementById('bodyRoot'); if (!root || !A()) return;
    var u = U(), s = A().settings(), tk = A().todayKey(), cur = M[tk] || {}, bf = bfNow(), ks = keys().reverse();
    var field = function (f, label, opt) { var l = last(f); return '<label class="fc-field"><span>' + label + (opt ? '*' : '') + '</span><input class="num-input" id="v9m-' + f + '" type="text" inputmode="decimal" maxlength="5" placeholder="' + (l ? u.num(l.v) : '—') + '" value="' + (cur[f] !== undefined ? String(cur[f]).replace('.', ',') : '') + '"></label>'; };
    var change = function (f, label) { var a = first(f), b = last(f); if (!a || !b || a.k === b.k) return ''; var d = Math.round((b.v - a.v) * 10) / 10; return '<li>' + label + ': <b>' + u.num(b.v) + ' см</b> <span class="muted">(' + u.signed(d) + ' см с ' + u.fmtD(a.k, { day: 'numeric', month: 'short' }) + ')</span></li>'; };
    var ch = change('waist', 'Талия') + change('neck', 'Шея') + change('hip', 'Бёдра');
    root.innerHTML = '<header class="top top-back"><a class="icon-btn" href="#profile" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>' +
      '<div class="grow"><h1 class="title">Замеры</h1><div class="subtitle">Раз в неделю, утром, сантиметровой лентой</div></div></header>' +
      '<section class="card"><div class="card-head"><h2>Сегодня</h2><span class="muted small">' + u.fmtD(tk) + '</span></div>' +
      '<div class="fc-grid v9-m-grid">' + field('waist', 'Талия, см') + field('neck', 'Шея, см') + field('hip', 'Бёдра, см', s.sex !== 'f') + '</div>' +
      '<p class="muted small">Талия — на уровне пупка, на выдохе. Шея — под кадыком. Бёдра* — по самой широкой части, по желанию (нужны для оценки у женщин).</p>' +
      '<button type="button" class="btn primary wide" data-v9m="save">Сохранить замеры</button></section>' +
      '<section class="card v9-bf"><div class="card-head"><h2>% жира — грубая оценка</h2></div>' +
      (bf.v !== null ? '<p class="v9-fc-big">≈ ' + u.num(bf.v) + '%</p><p class="muted small">Формула ВМС США по росту, талии, шее' + (s.sex === 'f' ? ' и бёдрам' : '') + '. Ошибка ±3–4%, сильно зависит от того, как держишь ленту. Смотри на динамику, а не на точное число.</p>'
        : '<p class="muted small">Для оценки нужны: ' + (bf.need === 'рост' || bf.need === 'пол' ? '<a href="#profile">' + bf.need + ' в Профиле</a>' : bf.need) + '. Формула ВМС США — ориентир, не диагноз.</p>') + '</section>' +
      (ch ? '<section class="card"><div class="card-head"><h2>Изменения</h2></div><ul class="v9-m-ch">' + ch + '</ul></section>' : '') +
      (ks.length ? '<section class="card"><div class="card-head"><h2>История</h2></div><ul class="v9-m-list">' + ks.slice(0, 20).map(function (k) {
        var e = M[k], bfk = navy(s.sex, s.height, e.waist, e.neck, e.hip);
        return '<li><b>' + u.fmtD(k, { day: 'numeric', month: 'short' }) + '</b><span>' + ['waist', 'neck', 'hip'].filter(function (f) { return e[f] !== undefined; }).map(function (f) { return { waist: 'талия ', neck: 'шея ', hip: 'бёдра ' }[f] + u.num(e[f]); }).join(' · ') + (bfk !== null ? ' · ≈' + u.num(bfk) + '%' : '') + '</span><button type="button" class="icon-btn" data-v9m="del" data-k="' + k + '" aria-label="Удалить">✕</button></li>';
      }).join('') + '</ul></section>' : '');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-v9m]'); if (!b || !A()) return;
    var a = b.getAttribute('data-v9m');
    if (a === 'save') {
      var tk = A().todayKey(), entry = {}, bad = false;
      ['waist', 'neck', 'hip'].forEach(function (f) { var i = document.getElementById('v9m-' + f), raw = i ? i.value.trim() : ''; if (!raw) return; var v = cm(raw); if (v === null) bad = true; else entry[f] = v; });
      if (bad) { A().toast('Проверь значения: 20–250 см'); return; }
      if (!Object.keys(entry).length) { delete M[tk]; saveM(); render(); A().toast('Замеры очищены'); return; }
      M[tk] = entry; saveM(); render(); A().toast('📏 Замеры сохранены');
    } else if (a === 'del') { if (confirm('Удалить замеры за ' + U().fmtD(b.getAttribute('data-k')) + '?')) { delete M[b.getAttribute('data-k')]; saveM(); render(); } }
  });

  /* ---------------- photos: IndexedDB ---------------- */
  var DBN = 'ht-photos', ST = 'photos', dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(ST, mode), s = t.objectStore(ST), out = fn(s); t.oncomplete = function () { res(out ? out.result : undefined); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); }; }); }); }
  function pGet(id) { return tx('readonly', function (s) { return s.get(id); }); }
  function pPut(id, rec) { return tx('readwrite', function (s) { s.put(rec, id); }); }
  function pDel(id) { return tx('readwrite', function (s) { s.delete(id); }); }
  function pAll() { return db().then(function (d) { return new Promise(function (res, rej) { var out = {}, t = d.transaction(ST, 'readonly'), c = t.objectStore(ST).openCursor(); c.onsuccess = function () { var cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); }; c.onerror = function () { rej(c.error); }; }); }); }
  function compress(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1080, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
        var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (b) res({ blob: b, w: w, h: h }); else rej(new Error('blob')); }, 'image/jpeg', 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  var urls = {};
  function urlFor(id, rec) { if (urls[id]) URL.revokeObjectURL(urls[id]); urls[id] = URL.createObjectURL(rec.blob); return urls[id]; }
  var cmpPair = null;
  function mount(elId) {
    var box = document.getElementById(elId); if (!box) return;
    var days = window.JawModule && window.JawModule.photoDays ? window.JawModule.photoDays() : [1, 7, 30];
    pAll().then(function (all) {
      var have = days.filter(function (d) { return all['jaw-' + d]; });
      var slots = days.map(function (d) {
        var r = all['jaw-' + d];
        return '<div class="v9-ph-slot"><div class="v9-ph-img">' + (r ? '<img alt="Фото дня ' + d + '" src="' + urlFor('jaw-' + d, r) + '">' : '<span>📷</span>') + '</div><b>День ' + d + '</b>' +
          (r ? '<small class="muted">' + new Date(r.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + '</small>' : '') +
          '<label class="btn small v9-ph-btn">' + (r ? 'Заменить' : 'Снять / выбрать') + '<input type="file" accept="image/*" capture="user" data-v9ph="' + d + '" hidden></label>' +
          (r ? '<button type="button" class="link-btn small" data-v9ph-del="' + d + '">Удалить</button>' : '') + '</div>';
      }).join('');
      var cmp = '';
      if (have.length >= 2) {
        if (!cmpPair || have.indexOf(cmpPair[0]) < 0 || have.indexOf(cmpPair[1]) < 0) cmpPair = [have[0], have[have.length - 1]];
        var pairs = []; for (var i = 0; i < have.length; i++) for (var j = i + 1; j < have.length; j++) pairs.push([have[i], have[j]]);
        cmp = '<div class="v9-ph-cmp"><div class="v9-ph-cmp-head"><b>Было / стало</b>' + (pairs.length > 1 ? '<div class="seg">' + pairs.map(function (p) { return '<button type="button" class="seg-btn' + (p[0] === cmpPair[0] && p[1] === cmpPair[1] ? ' active' : '') + '" data-v9ph-pair="' + p.join('-') + '">' + p[0] + ' → ' + p[1] + '</button>'; }).join('') + '</div>' : '') + '</div>' +
          '<div class="v9-ph-two"><figure><img alt="Было" src="' + urls['jaw-' + cmpPair[0]] + '"><figcaption>Было · день ' + cmpPair[0] + '</figcaption></figure><figure><img alt="Стало" src="' + urls['jaw-' + cmpPair[1]] + '"><figcaption>Стало · день ' + cmpPair[1] + '</figcaption></figure></div></div>';
      }
      box.innerHTML = '<div class="v9-ph-slots">' + slots + '</div>' + cmp;
    }).catch(function () { box.innerHTML = '<p class="muted small">Хранилище фото недоступно в этом режиме браузера (например, приватном) — можно только отмечать чекпоинты.</p>'; });
  }
  document.addEventListener('change', function (e) {
    var inp = e.target; if (!inp || !inp.hasAttribute || !inp.hasAttribute('data-v9ph') || !inp.files || !inp.files[0]) return;
    var d = inp.getAttribute('data-v9ph');
    compress(inp.files[0]).then(function (r) { return pPut('jaw-' + d, { blob: r.blob, at: Date.now(), w: r.w, h: r.h, type: 'image/jpeg' }); })
      .then(function () { if (window.JawModule && window.JawModule.markPhoto) window.JawModule.markPhoto(d, true); A().toast('📸 Фото дня ' + d + ' сохранено на устройстве'); if (window.JawModule) window.JawModule.render(); })
      .catch(function () { A().toast('Не удалось сохранить фото'); });
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-v9ph-del],[data-v9ph-pair]'); if (!b) return;
    if (b.hasAttribute('data-v9ph-pair')) { cmpPair = b.getAttribute('data-v9ph-pair').split('-').map(Number); mount('v9JawPhotos'); return; }
    var d = b.getAttribute('data-v9ph-del');
    if (!confirm('Удалить фото дня ' + d + ' с этого устройства?')) return;
    pDel('jaw-' + d).then(function () { if (urls['jaw-' + d]) { URL.revokeObjectURL(urls['jaw-' + d]); delete urls['jaw-' + d]; } mount('v9JawPhotos'); });
  });

  /* ---------------- backup: measurements always, photos only on request ---------------- */
  function b64(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = function () { rej(r.error); }; r.readAsDataURL(blob); }); }
  function fromB64(du) { var m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(du || ''); if (!m) return null; var bin = atob(m[2]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: m[1] }); }
  function photosInfo() { return pAll().then(function (all) { var ids = Object.keys(all), size = ids.reduce(function (n, k) { return n + (all[k].blob ? all[k].blob.size : 0); }, 0); return { n: ids.length, bytes: size }; }).catch(function () { return { n: 0, bytes: 0 }; }); }
  window.V9.register('measure', { exp: function () { return keys().length ? M : undefined; }, count: function (o) { var c = cleanM(o); return Object.keys(c).filter(function (k) { return !M[k]; }).length; },
    imp: function (o) { var c = cleanM(o); Object.keys(c).forEach(function (k) { if (!M[k]) M[k] = c[k]; }); saveM(); } });
  window.V9.register('photos', {
    exp: function (opts) {
      if (!opts || !opts.photos) return undefined;
      return pAll().then(function (all) { var ids = Object.keys(all); return Promise.all(ids.map(function (k) { return b64(all[k].blob); })).then(function (d) { var o = {}; ids.forEach(function (k, i) { o[k] = { at: all[k].at, data: d[i] }; }); return ids.length ? o : undefined; }); });
    },
    count: function (o) { return o && typeof o === 'object' ? Object.keys(o).filter(function (k) { return /^jaw-\d{1,2}$/.test(k); }).length : 0; },
    imp: function (o) {
      if (!o || typeof o !== 'object') return;
      pAll().then(function (all) {
        Object.keys(o).forEach(function (k) {
          if (!/^jaw-\d{1,2}$/.test(k) || all[k]) return;
          var bl = fromB64(o[k] && o[k].data); if (!bl || bl.size > 5e6) return;
          pPut(k, { blob: bl, at: Number(o[k].at) || Date.now(), type: bl.type }).then(function () { if (window.JawModule && window.JawModule.markPhoto) window.JawModule.markPhoto(k.slice(4), true); });
        });
      }).catch(function () { /* no idb */ });
    }
  });
  // Profile: «Скачать копию с фото» + size warning (only if there are photos)
  function profileHook() {
    var box = document.getElementById('v9PhotoBackup'); if (!box) return;
    photosInfo().then(function (i) {
      if (!i.n) { box.innerHTML = ''; return; }
      var mb = i.bytes / 1048576, kb = Math.round(i.bytes / 1024);
      box.innerHTML = '<button type="button" class="btn wide" data-v9-photo-backup>Скачать копию с фото</button><p class="muted small">' + i.n + ' ' + U().plural(i.n, 'фото', 'фото', 'фото') + ' ≈ ' + (mb >= 1 ? U().num(mb * 1.37, 1) + ' МБ' : Math.round(kb * 1.37) + ' КБ') + ' в файле копии (в обычную копию фото не входят). Файл с фото храни бережно — в нём твоё лицо.</p>';
    });
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-v9-photo-backup]'); if (b && A()) A().exportJSON({ photos: true }); });

  window.V9Body = { render: render, navy: navy, bfNow: bfNow, last: last, all: function () { return M; }, due: due, profileHook: profileHook,
    text: function () {
      var u = U(), w = last('waist'), n = last('neck'), hp = last('hip'), f = first('waist'), bf = bfNow(), out = [];
      if (w) out.push('Талия ' + u.num(w.v) + ' см (' + u.fmtD(w.k) + ')' + (f && f.k !== w.k ? ', с ' + u.fmtD(f.k) + ' ' + u.signed(Math.round((w.v - f.v) * 10) / 10) + ' см' : ''));
      if (n) out.push('шея ' + u.num(n.v) + ' см'); if (hp) out.push('бёдра ' + u.num(hp.v) + ' см');
      if (bf.v !== null) out.push('% жира по формуле ВМС США ≈ ' + u.num(bf.v) + '% (грубая оценка ±3–4%)');
      return out.length ? 'Замеры: ' + out.join(', ') + '.' : '';
    } };
  window.V9Photos = { mount: mount, all: pAll, info: photosInfo, get: pGet };
})();
