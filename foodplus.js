/* Здоровье v9.2 — быстрый ввод еды: «Повторить вчера», избранное (★), недавние в одно касание, штрихкод.
 * Штрихкод: камера через BarcodeDetector (Chrome на Android и др.), иначе — ввод цифр вручную.
 * Поиск — Open Food Facts (world.openfoodfacts.org), ответ кешируется на устройстве; без сети — ввод КБЖУ вручную.
 * Storage: 'health.foodfav.v1' -> [{ id, name, fid?, g?, kcal, p, f, c, fib? }]
 *          'health.barcode.v1' -> { '<code>': { n, k, p, f, c, fib?, por?, src: 'off'|'me', t } } (на 100 г) */
(function () {
  'use strict';
  var FKEY = 'health.foodfav.v1', BKEY = 'health.barcode.v1', OFF = 'https://world.openfoodfacts.org/api/v2/product/';
  function A() { return window.HTApp; }
  function U() { return window.V9.util; }
  function rd(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function num(v, max) { v = Number(v); return isFinite(v) && v >= 0 && v <= (max || 10000) ? Math.round(v * 10) / 10 : null; }
  function cleanFav(list) {
    return (Array.isArray(list) ? list : []).filter(function (x) { return x && typeof x.name === 'string' && num(x.kcal) !== null; }).slice(0, 40).map(function (x) {
      var o = { id: String(x.id || Math.random().toString(36).slice(2, 10)).slice(0, 24), name: x.name.slice(0, 120), kcal: Math.round(num(x.kcal)), p: num(x.p, 1000) || 0, f: num(x.f, 1000) || 0, c: num(x.c, 2000) || 0 };
      if (typeof x.fid === 'string' && x.fid.length <= 40) o.fid = x.fid;
      if (x.g >= 1 && x.g <= 5000) o.g = Math.round(x.g);
      if (num(x.fib, 300) !== null && x.fib !== undefined) o.fib = num(x.fib, 300);
      if (typeof x.bc === 'string' && /^\d{6,14}$/.test(x.bc)) o.bc = x.bc;
      return o;
    });
  }
  function cleanBc(o) {
    var out = {}; if (!o || typeof o !== 'object') return out;
    Object.keys(o).slice(0, 500).forEach(function (code) {
      var x = o[code]; if (!/^\d{6,14}$/.test(code) || !x || typeof x.n !== 'string' || num(x.k) === null) return;
      out[code] = { n: x.n.slice(0, 120), k: num(x.k), p: num(x.p, 100) || 0, f: num(x.f, 100) || 0, c: num(x.c, 100) || 0, src: x.src === 'me' ? 'me' : 'off', t: Number(x.t) || 0 };
      if (x.fib !== undefined && num(x.fib, 100) !== null) out[code].fib = num(x.fib, 100);
      if (x.por >= 1 && x.por <= 3000) out[code].por = Math.round(x.por);
    });
    return out;
  }
  var FAV = cleanFav(rd(FKEY, [])), BC = cleanBc(rd(BKEY, {}));
  function saveFav() { wr(FKEY, FAV); }
  function saveBc() { wr(BKEY, BC); }
  window.addEventListener('storage', function (e) { if (e.key === FKEY) FAV = cleanFav(rd(FKEY, [])); if (e.key === BKEY) BC = cleanBc(rd(BKEY, {})); });
  function fkey(x) { return x.fid ? 'f:' + x.fid + ':' + (x.g || '') : 'n:' + String(x.name || '').toLowerCase() + ':' + Math.round(x.kcal); }
  function isFav(x) { var k = fkey(x); return FAV.some(function (f) { return fkey(f) === k; }); }
  function toggleFav(x) {
    var k = fkey(x), i = -1;
    FAV.forEach(function (f, j) { if (fkey(f) === k) i = j; });
    if (i >= 0) { FAV.splice(i, 1); saveFav(); return false; }
    FAV.unshift(cleanFav([{ id: Math.random().toString(36).slice(2, 10), name: A().entryName(x), fid: x.fid, g: x.g, kcal: x.kcal, p: x.p, f: x.f, c: x.c, fib: x.fib, bc: x.bc }])[0]);
    FAV = FAV.slice(0, 40); saveFav(); return true;
  }
  function entryById(id) { var src = null, F = A().food(); Object.keys(F).forEach(function (k) { F[k].forEach(function (x) { if (x.id === id) src = x; }); }); return src; }
  function copyOf(x) { var e = { name: A().entryName(x), kcal: x.kcal, p: x.p, f: x.f, c: x.c }; if (x.fid) e.fid = x.fid; if (x.g) e.g = x.g; if (x.fib !== undefined) e.fib = x.fib; if (x.bc) e.bc = x.bc; return e; }
  function recent(n) {
    var F = A().food(), out = [], seen = {}, day = A().foodDay();
    FAV.forEach(function (f) { seen[fkey(f)] = 1; });
    Object.keys(F).sort().reverse().slice(0, 30).forEach(function (k) {
      if (k === day) return;
      F[k].slice().reverse().forEach(function (x) { var key = fkey(x); if (seen[key] || out.length >= n) return; seen[key] = 1; out.push(x); });
    });
    return out;
  }
  function prevDay(k) { var u = U(); return u.key(u.addD(u.pkey(k), -1)); }
  var undo = null;   // { ids, day, until, n }

  /* ---------- quick row on the food screen ---------- */
  function chip(attr, icon, x) { return '<button type="button" class="chip v9-fq" ' + attr + '><span aria-hidden="true">' + icon + '</span> ' + U().esc(A().entryName(x).slice(0, 28)) + ' <small>' + (x.g ? x.g + ' г · ' : '') + Math.round(x.kcal) + ' ккал</small></button>'; }
  function render() {
    var box = document.getElementById('v9FoodQuick'); if (!box || !A()) return;
    var srch = document.getElementById('foodSearch'), pick = document.getElementById('foodPick');
    if ((srch && srch.value.trim()) || (pick && !pick.hidden)) { box.innerHTML = ''; return; }
    var day = A().foodDay(), y = prevDay(day), F = A().food(), yl = F[y] || [], html = '';
    if (undo && undo.until > Date.now() && undo.day === day) html += '<div class="v9-fq-undo">Добавлено из вчера: ' + undo.n + ' ' + U().plural(undo.n, 'позиция', 'позиции', 'позиций') + ' <button type="button" class="link-btn" data-v9food="undo">Отменить</button></div>';
    else if (yl.length) {
      var kc = yl.reduce(function (s, x) { return s + x.kcal; }, 0);
      html += '<button type="button" class="btn v9-repeat" data-v9food="repeat"><span aria-hidden="true">↻</span> Повторить ' + (day === A().todayKey() ? 'вчера' : 'предыдущий день') + ' <small>' + yl.length + ' ' + U().plural(yl.length, 'позиция', 'позиции', 'позиций') + ' · ' + Math.round(kc) + ' ккал</small></button>';
    }
    if (FAV.length) html += '<div class="fres-lbl">★ Избранное</div><div class="v9-fq-row">' + FAV.slice(0, 12).map(function (f) { return chip('data-v9food="fav" data-id="' + f.id + '"', '★', f); }).join('') + '</div>';
    var rec = recent(6);
    if (rec.length) html += '<div class="fres-lbl">Недавние · в одно касание</div><div class="v9-fq-row">' + rec.map(function (x) { return chip('data-v9food="recent" data-id="' + x.id + '"', '＋', x); }).join('') + '</div>';
    if (!FAV.length && (rec.length || yl.length)) html += '<p class="muted small v9-fq-hint">Нажми ☆ у записи в дневнике — она появится здесь в избранном.</p>';
    box.innerHTML = html;
  }

  /* ---------- barcode ---------- */
  var B = { open: false, mode: 'manual', code: '', prod: null, msg: '', stream: null, timer: null, det: null };
  function hasDetector() { return 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia; }
  function eanOk(c) {
    if (!/^\d{8}$|^\d{12,14}$/.test(c)) return /^\d{6,14}$/.test(c);
    var d = c.split('').map(Number), chk = d.pop(), s = 0;
    d.reverse().forEach(function (v, i) { s += v * (i % 2 === 0 ? 3 : 1); });
    return (10 - s % 10) % 10 === chk;
  }
  function stopCam() {
    if (B.timer) { clearInterval(B.timer); B.timer = null; }
    if (B.stream) { B.stream.getTracks().forEach(function (t) { t.stop(); }); B.stream = null; }
  }
  function close() { stopCam(); B.open = false; B.prod = null; B.code = ''; B.msg = ''; paint(); }
  function startCam() {
    if (!hasDetector()) return;
    var formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
    Promise.resolve(window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats() : formats).then(function (sup) {
      var f = formats.filter(function (x) { return sup.indexOf(x) >= 0; });
      if (!f.length) throw new Error('formats');
      B.det = new window.BarcodeDetector({ formats: f });
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    }).then(function (stream) {
      if (!B.open || B.mode !== 'scan') { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      B.stream = stream;
      var v = document.getElementById('v9BcVideo'); if (!v) return stopCam();
      v.srcObject = stream; v.play().catch(function () {});
      B.timer = setInterval(function () {
        if (!B.det || v.readyState < 2) return;
        B.det.detect(v).then(function (codes) {
          var c = codes && codes[0] && String(codes[0].rawValue || '').replace(/\D/g, '');
          if (c && /^\d{6,14}$/.test(c)) { stopCam(); if (navigator.vibrate) navigator.vibrate(60); lookup(c); }
        }).catch(function () {});
      }, 350);
    }).catch(function () { stopCam(); B.mode = 'manual'; B.msg = 'Камера недоступна — введи цифры под штрихкодом.'; paint(); });
  }
  function lookup(code) {
    code = String(code || '').replace(/\D/g, '');
    B.code = code; B.prod = null;
    if (!/^\d{6,14}$/.test(code)) { B.mode = 'manual'; B.msg = 'Нужны 8–14 цифр под штрихкодом.'; paint(); return; }
    if (!eanOk(code)) { B.mode = 'manual'; B.msg = 'Похоже, в цифрах опечатка (не сходится контрольная цифра). Проверь.'; paint(); return; }
    if (BC[code]) { B.prod = BC[code]; B.mode = 'found'; paint(); return; }
    if (navigator.onLine === false) { B.mode = 'notfound'; B.msg = 'Нет сети — найти продукт не получится. Введи КБЖУ с упаковки, в следующий раз он найдётся без интернета.'; paint(); return; }
    B.mode = 'loading'; paint();
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    fetch(OFF + code + '.json?fields=product_name,product_name_ru,generic_name,brands,nutriments,serving_quantity', ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        clearTimeout(to);
        if (B.code !== code) return;
        var p = j && j.product, n = p && p.nutriments;
        var kcal = n && (n['energy-kcal_100g'] !== undefined ? n['energy-kcal_100g'] : n['energy_100g'] !== undefined ? n['energy_100g'] / 4.184 : null);
        if (!p || !n || kcal === null || kcal === undefined || !isFinite(Number(kcal))) {
          B.mode = 'notfound'; B.msg = p ? 'Продукт найден, но без калорийности. Введи КБЖУ с упаковки.' : 'Этого штрихкода нет в Open Food Facts. Введи КБЖУ с упаковки — сохраню на устройстве.'; paint(); return;
        }
        var name = (p.product_name_ru || p.product_name || p.generic_name || ('Продукт ' + code)).trim() + (p.brands ? ' (' + String(p.brands).split(',')[0].trim() + ')' : '');
        var o = { n: name.slice(0, 120), k: num(kcal) || 0, p: num(n.proteins_100g, 100) || 0, f: num(n.fat_100g, 100) || 0, c: num(n.carbohydrates_100g, 100) || 0, src: 'off', t: Date.now() };
        if (n.fiber_100g !== undefined && num(n.fiber_100g, 100) !== null) o.fib = num(n.fiber_100g, 100);
        if (p.serving_quantity >= 1 && p.serving_quantity <= 3000) o.por = Math.round(p.serving_quantity);
        BC[code] = o; saveBc();
        B.prod = o; B.mode = 'found'; paint();
      }).catch(function () {
        clearTimeout(to); if (B.code !== code) return;
        B.mode = 'notfound'; B.msg = 'Не удалось связаться с базой продуктов (нет сети?). Введи КБЖУ с упаковки.'; paint();
      });
  }
  function per(o, g) { var m = g / 100; return { kcal: Math.round(o.k * m), p: Math.round(o.p * m * 10) / 10, f: Math.round(o.f * m * 10) / 10, c: Math.round(o.c * m * 10) / 10, fib: o.fib !== undefined ? Math.round(o.fib * m * 10) / 10 : undefined }; }
  function paint() {
    var box = document.getElementById('v9Barcode'); if (!box) return;
    box.hidden = !B.open; if (!B.open) { box.innerHTML = ''; return; }
    var u = U(), html = '<div class="v9-bc card-in"><div class="v9-bc-head"><b>▥ Штрихкод</b><button type="button" class="icon-btn" data-v9bc="close" aria-label="Закрыть">✕</button></div>';
    if (B.mode === 'scan') html += '<video id="v9BcVideo" class="v9-bc-video" playsinline muted></video><p class="muted small">Наведи камеру на штрихкод. Не получается — введи цифры ниже.</p>';
    if (B.mode === 'loading') html += '<p class="v9-bc-msg">Ищу ' + u.esc(B.code) + ' в Open Food Facts…</p>';
    if (B.mode === 'found') {
      var o = B.prod, g = o.por || 100;
      html += '<div class="v9-bc-prod"><b>' + u.esc(o.n) + '</b><small class="muted">' + u.esc(B.code) + ' · на 100 г: ' + Math.round(o.k) + ' ккал · Б ' + u.num(o.p) + ' · Ж ' + u.num(o.f) + ' · У ' + u.num(o.c) + (o.fib !== undefined ? ' · клетч. ' + u.num(o.fib) : '') + (o.src === 'me' ? ' · введено тобой' : ' · Open Food Facts') + '</small></div>' +
        '<label class="v9-bc-g"><span>Сколько съел, г</span><input class="num-input" id="v9BcGrams" type="text" inputmode="decimal" maxlength="5" value="' + g + '"></label>' +
        '<p class="v9-bc-calc" id="v9BcCalc"></p><button type="button" class="btn primary wide" data-v9bc="add">Добавить в дневник</button>';
    }
    if (B.mode === 'notfound') {
      html += '<p class="v9-bc-msg">' + u.esc(B.msg) + '</p><div class="v9-bc-form">' +
        '<label class="fc-field fc-name"><span>Название</span><input id="v9BcName" type="text" maxlength="120" placeholder="Например: йогурт 2,5%"></label>' +
        '<div class="fc-grid v9-bc-grid">' + [['v9BcK', 'Ккал'], ['v9BcP', 'Белки'], ['v9BcF', 'Жиры'], ['v9BcC', 'Углев.'], ['v9BcFib', 'Клетч.']].map(function (x) { return '<label class="fc-field"><span>' + x[1] + '</span><input class="num-input" id="' + x[0] + '" type="text" inputmode="decimal" maxlength="6" placeholder="' + (x[0] === 'v9BcFib' ? '—' : '0') + '"></label>'; }).join('') + '</div>' +
        '<p class="muted small">Значения на 100 г, как на упаковке.</p>' +
        '<label class="v9-bc-g"><span>Сколько съел, г</span><input class="num-input" id="v9BcGrams" type="text" inputmode="decimal" maxlength="5" value="100"></label>' +
        '<button type="button" class="btn primary wide" data-v9bc="save-add">Сохранить и добавить</button></div>';
    }
    if (B.mode !== 'found' && B.mode !== 'loading') {
      html += '<form class="v9-bc-manual" data-v9bc-form><input id="v9BcCode" class="num-input" type="text" inputmode="numeric" maxlength="14" placeholder="Цифры под штрихкодом" value="' + (B.mode === 'notfound' ? '' : u.esc(B.code)) + '" aria-label="Цифры штрихкода"><button type="submit" class="btn">Найти</button></form>';
      if (B.msg && B.mode !== 'notfound') html += '<p class="muted small v9-bc-msg">' + u.esc(B.msg) + '</p>';
      if (!hasDetector() && B.mode === 'manual' && !B.msg) html += '<p class="muted small">Этот браузер не умеет сканировать штрихкоды камерой (например, Safari на iPhone) — введи цифры под штрихкодом.</p>';
    } else if (B.mode === 'found') html += '<button type="button" class="link-btn v9-bc-again" data-v9bc="again">Другой штрихкод</button>';
    box.innerHTML = html + '</div>';
    if (B.mode === 'found') calc();
    if (B.mode === 'scan') startCam();
  }
  function grams() { var i = document.getElementById('v9BcGrams'); var v = i ? Number(String(i.value).replace(',', '.')) : NaN; return v >= 1 && v <= 3000 ? Math.round(v) : null; }
  function calc() { var c = document.getElementById('v9BcCalc'), g = grams(); if (!c || !B.prod) return; if (!g) { c.textContent = 'Укажи граммы (1–3000)'; return; } var v = per(B.prod, g); c.innerHTML = '<b>' + v.kcal + ' ккал</b> · Б ' + U().num(v.p) + ' · Ж ' + U().num(v.f) + ' · У ' + U().num(v.c) + (v.fib !== undefined ? ' · клетч. ' + U().num(v.fib) : ''); }
  function addProd(o, code) {
    var g = grams(); if (!g) { A().toast('Укажи, сколько граммов съел'); return; }
    var v = per(o, g), e = { name: o.n, g: g, kcal: v.kcal, p: v.p, f: v.f, c: v.c, bc: code };
    if (v.fib !== undefined) e.fib = v.fib;
    A().addEntry(e);
    close();
    A().afterFoodChange('＋ ' + o.n.slice(0, 40) + ' · ' + v.kcal + ' ккал');
  }

  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'v9BcGrams') calc(); if (e.target && e.target.id === 'foodSearch') render(); });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest && e.target.closest('[data-v9bc-form]'); if (!f) return;
    e.preventDefault(); stopCam(); lookup(document.getElementById('v9BcCode').value);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-v9bc],[data-v9food],[data-v9fav]'); if (!b || !A()) return;
    if (b.hasAttribute('data-v9fav')) { var x = entryById(b.getAttribute('data-v9fav')); if (x) { var on = toggleFav(x); A().toast(on ? '★ В избранном' : 'Убрано из избранного'); A().rerender(); } return; }
    var a = b.getAttribute('data-v9bc'), q = b.getAttribute('data-v9food');
    if (a === 'open') { B.open = true; B.prod = null; B.msg = ''; B.code = ''; B.mode = hasDetector() ? 'scan' : 'manual'; paint(); var bx = document.getElementById('v9Barcode'); if (bx) bx.scrollIntoView({ block: 'nearest' }); }
    else if (a === 'close') close();
    else if (a === 'again') { B.prod = null; B.code = ''; B.msg = ''; B.mode = hasDetector() ? 'scan' : 'manual'; paint(); }
    else if (a === 'add' && B.prod) addProd(B.prod, B.code);
    else if (a === 'save-add') {
      var val = function (id) { var i = document.getElementById(id); var s = i ? String(i.value).trim().replace(',', '.') : ''; return s === '' ? null : Number(s); };
      var name = (document.getElementById('v9BcName').value || '').trim(), k = val('v9BcK'), p = val('v9BcP') || 0, f = val('v9BcF') || 0, c = val('v9BcC') || 0, fib = val('v9BcFib');
      if (k === null) k = p * 4 + f * 9 + c * 4;
      if (!(k > 0 && k <= 950) || [p, f, c].some(function (v) { return !(v >= 0 && v <= 100); }) || (fib !== null && !(fib >= 0 && fib <= 100))) { A().toast('Проверь КБЖУ на 100 г'); return; }
      var o = { n: (name || 'Продукт ' + B.code).slice(0, 120), k: num(k), p: num(p), f: num(f), c: num(c), src: 'me', t: Date.now() };
      if (fib !== null) o.fib = num(fib);
      if (/^\d{6,14}$/.test(B.code)) { BC[B.code] = o; saveBc(); }
      addProd(o, B.code);
    }
    else if (q === 'repeat') {
      var day = A().foodDay(), y = prevDay(day), yl = (A().food()[y] || []).slice(), ids = [];
      yl.forEach(function (x) { ids.push(A().addEntry(copyOf(x), day).id); });
      undo = { ids: ids, day: day, n: ids.length, until: Date.now() + 15000 };
      A().afterFoodChange('↻ Добавлено ' + ids.length + ' ' + U().plural(ids.length, 'позиция', 'позиции', 'позиций') + ' из вчера');
      setTimeout(function () { if (undo && undo.until <= Date.now() + 50) { undo = null; render(); } }, 15100);
    }
    else if (q === 'undo' && undo) {
      var F = A().food(), set = {}; undo.ids.forEach(function (i) { set[i] = 1; });
      F[undo.day] = (F[undo.day] || []).filter(function (x) { return !set[x.id]; }); if (!F[undo.day].length) delete F[undo.day];
      undo = null; A().afterFoodChange('Отменено');
    }
    else if (q === 'fav') { var fv = FAV.filter(function (f) { return f.id === b.getAttribute('data-id'); })[0]; if (fv) { A().addEntry(copyOf(fv)); A().afterFoodChange('＋ ' + fv.name.slice(0, 40) + ' · ' + Math.round(fv.kcal) + ' ккал'); } }
    else if (q === 'recent') { var rx = entryById(b.getAttribute('data-id')); if (rx) { A().addEntry(copyOf(rx)); A().afterFoodChange('＋ ' + A().entryName(rx).slice(0, 40) + ' · ' + Math.round(rx.kcal) + ' ккал'); } }
  });
  window.addEventListener('hashchange', function () { if (!/^#food/.test(location.hash) && B.open) close(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopCam(); });

  window.V9.register('foodFav', { exp: function () { return FAV.length ? FAV : undefined; }, count: function (o) { var c = cleanFav(o); return c.filter(function (x) { return !isFav(x); }).length; },
    imp: function (o) { cleanFav(o).forEach(function (x) { if (!isFav(x)) FAV.push(x); }); FAV = FAV.slice(0, 40); saveFav(); } });
  window.V9.register('barcodes', { exp: function () { var me = {}; Object.keys(BC).forEach(function (k) { if (BC[k].src === 'me') me[k] = BC[k]; }); return Object.keys(me).length ? me : undefined; }, count: function () { return 0; },
    imp: function (o) { var c = cleanBc(o); Object.keys(c).forEach(function (k) { if (!BC[k]) BC[k] = c[k]; }); saveBc(); } });
  window.V9Food = { render: render, isFav: isFav, toggleFav: toggleFav, favs: function () { return FAV; }, lookup: lookup, eanOk: eanOk, cache: function () { return BC; }, hasDetector: hasDetector };
})();
