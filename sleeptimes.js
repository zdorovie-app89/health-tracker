/* Здоровье v9.1 — сон как интервал: время отбоя и подъёма, длительность считается сама (через полночь),
 * необязательная оценка качества, регулярность подъёма (разброс в минутах).
 * Storage: localStorage 'health.sleeptimes.v1' -> { 'YYYY-MM-DD' (ночь, как в health.v2): { b: 'HH:MM', w: 'HH:MM', q?: 1..3 } }
 * Hours stay in health.v2 (data.sleep) exactly as before, so old hours-only records, the heatmap and stats keep working. */
(function () {
  'use strict';
  var KEY = 'health.sleeptimes.v1', TRX = /^([01]\d|2[0-3]):[0-5]\d$/;
  var QN = ['', 'плохо', 'нормально', 'отлично'], QE = ['', '😣', '🙂', '😌'];
  function A() { return window.HTApp; }
  function U() { return window.V9.util; }
  function clean(o) {
    var out = {}; if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    Object.keys(o).forEach(function (k) {
      var x = o[k]; if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !x || !TRX.test(x.b) || !TRX.test(x.w)) return;
      var e = { b: x.b, w: x.w }; if (x.q >= 1 && x.q <= 3) e.q = Math.round(x.q); out[k] = e;
    });
    return out;
  }
  var S = (function () { try { return clean(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return {}; } })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* full */ } }
  window.addEventListener('storage', function (e) { if (e.key === KEY) { try { S = clean(JSON.parse(e.newValue || '{}')); } catch (x) { /* */ } } });
  function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function dur(b, w) { if (!TRX.test(b) || !TRX.test(w)) return null; var m = (toMin(w) - toMin(b) + 1440) % 1440; return m >= 60 ? m : null; }   // minutes
  function hm(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return h + ' ч' + (m ? ' ' + m + ' мин' : ''); }
  function hours(min) { return Math.round(min / 60 * 100) / 100; }
  function lastTimes() { var ks = Object.keys(S).sort(); return ks.length ? S[ks[ks.length - 1]] : { b: '23:30', w: '07:30' }; }
  function get(k) { return S[k] || null; }
  function put(k, b, w, q) { var e = { b: b, w: w }; if (q) e.q = q; S[k] = e; save(); }

  /* регулярность: стандартное отклонение времени подъёма (мин) за последние n ночей с указанным временем */
  function regularity(n, endKey) {
    var u = U(), end = endKey ? u.pkey(endKey) : u.today0(), ws = [];
    for (var i = 0; i < (n || 14); i++) { var k = u.key(u.addD(end, -i)); if (S[k]) ws.push(toMin(S[k].w)); }
    if (ws.length < 5) return { n: ws.length, sd: null };
    var ref = ws[0], rel = ws.map(function (m) { var d = m - ref; if (d > 720) d -= 1440; if (d < -720) d += 1440; return d; });
    var mean = rel.reduce(function (a, b) { return a + b; }, 0) / rel.length;
    var sd = Math.sqrt(rel.reduce(function (a, d) { return a + (d - mean) * (d - mean); }, 0) / rel.length);
    var avgW = ((Math.round(ref + mean) % 1440) + 1440) % 1440;
    return { n: ws.length, sd: Math.round(sd), avgWake: String(Math.floor(avgW / 60)).padStart(2, '0') + ':' + String(avgW % 60).padStart(2, '0') };
  }
  function regWord(sd) { return sd <= 20 ? 'очень ровный режим' : sd <= 45 ? 'ровный режим' : sd <= 75 ? 'режим плавает' : 'режим сбит'; }
  function regText(r) { return r && r.sd !== null ? 'Регулярность: подъём ±' + r.sd + ' мин (' + regWord(r.sd) + ', ' + r.n + ' ночей)' : ''; }

  /* ---------- Today: quick input in the «Сколько спал?» card ---------- */
  function quickHtml() {
    var t = lastTimes();
    return '<div class="v9-st" data-v9st="quick"><label><span>Лёг</span><input type="time" id="v9qBed" value="' + t.b + '"></label>' +
      '<label><span>Встал</span><input type="time" id="v9qWake" value="' + t.w + '"></label>' +
      '<button type="button" class="btn primary" data-v9st="save-quick">Сохранить</button></div>' +
      '<p class="muted small v9-st-dur" id="v9qDur">' + durLine(t.b, t.w) + '</p><p class="muted small v9-st-or">или просто часы:</p>';
  }
  function durLine(b, w) { var m = dur(b, w); return m ? 'Получается ' + hm(m) : 'Проверь время'; }

  /* ---------- log sheet (Добавить → Сон) ---------- */
  var sheetK = null, touched = false;
  function box() {
    var b = document.getElementById('v9SleepTimes');
    if (b) return b;
    var num = document.getElementById('numericInput'); if (!num) return null;
    b = document.createElement('div'); b.id = 'v9SleepTimes'; b.className = 'v9-st-sheet'; b.hidden = true;
    b.innerHTML = '<div class="v9-st"><label><span>Лёг</span><input type="time" id="v9sBed"></label><label><span>Встал</span><input type="time" id="v9sWake"></label></div>' +
      '<div class="v9-st-q" role="group" aria-label="Качество сна">' + [1, 2, 3].map(function (q) { return '<button type="button" class="chip" data-v9st-q="' + q + '">' + QE[q] + ' ' + QN[q] + '</button>'; }).join('') + '</div>' +
      '<p class="muted small" id="v9sHint">Укажи время — длительность посчитается сама. Можно и просто ввести часы ниже.</p>';
    num.parentNode.insertBefore(b, num);
    return b;
  }
  var sheetQ = 0;
  function paintQ() { document.querySelectorAll('#v9SleepTimes [data-v9st-q]').forEach(function (b) { b.classList.toggle('on', Number(b.getAttribute('data-v9st-q')) === sheetQ); }); }
  function onSheet(id, k) {
    var b = box(); if (!b) return;
    b.hidden = id !== 'sleep'; if (id !== 'sleep') return;
    sheetK = k; touched = false;
    var e = S[k], t = e || lastTimes();
    document.getElementById('v9sBed').value = e ? e.b : '';
    document.getElementById('v9sWake').value = e ? e.w : '';
    document.getElementById('v9sBed').placeholder = t.b; document.getElementById('v9sWake').placeholder = t.w;
    sheetQ = e && e.q ? e.q : 0; paintQ();
    document.getElementById('v9sHint').textContent = e ? 'Сон ' + hm(dur(e.b, e.w)) + ' (' + e.b + ' → ' + e.w + ')' : 'Укажи время — длительность посчитается сама. Можно и просто ввести часы ниже.';
  }
  function sheetTimes() { var b = document.getElementById('v9sBed'), w = document.getElementById('v9sWake'); return b && w ? { b: b.value, w: w.value } : { b: '', w: '' }; }
  function onTimeInput() {
    var t = sheetTimes();
    if (!t.b && !t.w) return;
    if (!t.b) { document.getElementById('v9sBed').value = t.b = (S[sheetK] || lastTimes()).b; }
    if (!t.w) { document.getElementById('v9sWake').value = t.w = (S[sheetK] || lastTimes()).w; }
    var m = dur(t.b, t.w), vi = document.getElementById('valInput');
    touched = true;
    document.getElementById('v9sHint').textContent = m ? 'Получается ' + hm(m) : 'Проверь время';
    if (m && vi) { vi.value = String(hours(m)).replace('.', ','); vi.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  // called by app.js saveSheet (sleep): keep the times only when they still match the saved hours
  function onSave(k, v) {
    var t = sheetTimes(), m = dur(t.b, t.w);
    if (m && Math.abs(hours(m) - v) <= 0.26) put(k, t.b, t.w, sheetQ || undefined);
    else if (S[k] && (touched || Math.abs(hours(dur(S[k].b, S[k].w)) - v) > 0.26)) { delete S[k]; save(); }   // hours typed by hand → plain hours record
    else if (S[k] && sheetQ !== (S[k].q || 0)) { if (sheetQ) S[k].q = sheetQ; else delete S[k].q; save(); }
  }
  function onClear(k) { if (S[k]) { delete S[k]; save(); } }

  document.addEventListener('input', function (e) {
    if (e.target && (e.target.id === 'v9sBed' || e.target.id === 'v9sWake')) onTimeInput();
    if (e.target && (e.target.id === 'v9qBed' || e.target.id === 'v9qWake')) { var d = document.getElementById('v9qDur'); if (d) d.textContent = durLine(document.getElementById('v9qBed').value, document.getElementById('v9qWake').value); }
  });
  document.addEventListener('click', function (e) {
    var q = e.target.closest && e.target.closest('[data-v9st-q]');
    if (q) { var n = Number(q.getAttribute('data-v9st-q')); sheetQ = sheetQ === n ? 0 : n; paintQ(); return; }
    var s = e.target.closest && e.target.closest('[data-v9st="save-quick"]');
    if (s) {
      var b = document.getElementById('v9qBed').value, w = document.getElementById('v9qWake').value, m = dur(b, w);
      if (!m) { A().toast('Проверь время отбоя и подъёма'); return; }
      if (m > 16 * 60) { A().toast('Больше 16 часов — проверь время'); return; }
      var k = U().key(U().addD(U().today0(), -1));
      put(k, b, w); A().setMetric('sleep', k, hours(m));
      A().toast('🌙 Сон: ' + hm(m) + ' (' + b + ' → ' + w + ')'); A().rerender();
    }
  });

  window.V9.register('sleepTimes', {
    exp: function () { return Object.keys(S).length ? S : undefined; },
    count: function (o) { var c = clean(o); return Object.keys(c).filter(function (k) { return !S[k]; }).length; },
    imp: function (o) { var c = clean(o); Object.keys(c).forEach(function (k) { if (!S[k]) S[k] = c[k]; }); save(); }
  });
  window.V9Sleep = {
    get: get, all: function () { return S; }, dur: dur, hm: hm, quickHtml: quickHtml, regularity: regularity, regText: regText, regWord: regWord,
    onSheet: onSheet, onSave: onSave, onClear: onClear, QN: QN,
    line: function (k) { var e = S[k]; return e ? e.b + '–' + e.w + (e.q ? ' ' + QE[e.q] : '') : ''; }
  };
})();
