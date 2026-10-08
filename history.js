/* Здоровье v8 — «История» (view #history): log of everything done.
 *  • Workout sessions: started from a plan day («▶ Начать») or empty («Свободная тренировка»); every set is logged
 *    during the workout («✓ сделал подход») with weight / reps / seconds, a rest timer runs between sets.
 *    Finishing saves date + weekday + start/end time + duration and adds the minutes to the «Тренировка» metric.
 *  • Past workouts can be added (or edited) by hand with a date.
 *  • Jaw sessions (JawModule.history()) and skincare days (SkinModule.history()) are shown alongside.
 *  Routes: #history · #history/day/YYYY-MM-DD · #history/ex/<exerciseId> · #history/live · #history/add · #history/edit/<id>
 *  Free: whole log, day details, per-exercise last results and best set. Pro: per-exercise progress chart.
 *  Storage: localStorage 'health.history.v1' -> { v: 1, workouts: [Workout], live: Session|null }
 *    Workout = { id, date: 'YYYY-MM-DD', start: ms, end: ms, dur: min, title, src: 'plan'|'free'|'manual', ex: [
 *               { id: exerciseId, name, k: 'w'|'r'|'s'|'m', sets: [{ w?: kg, r?: reps, s?: sec, m?: min }] }], note? }
 *  Exposed as window.HistoryModule (used by app.js, ai.js, export/import). */
(function () {
  'use strict';
  var KEY = 'health.history.v1';
  function load() {
    var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    return sanitize(s);
  }
  function numOr(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : undefined; }
  function sanitizeSet(st) {
    var o = {}, w = numOr(st && st.w, 0, 1000), r = numOr(st && st.r, 0, 1000), s = numOr(st && st.s, 0, 36000), m = numOr(st && st.m, 0, 1440);
    if (w) o.w = w; if (r) o.r = Math.round(r); if (s) o.s = Math.round(s); if (m) o.m = m;
    if (st && st.done) o.done = true;
    return o;
  }
  function sanitizeWorkout(w) {
    if (!w || typeof w !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(w.date || ''))) return null;
    var ex = (Array.isArray(w.ex) ? w.ex : []).slice(0, 40).map(function (e) {
      if (!e || !e.id) return null;
      return { id: String(e.id).slice(0, 40), name: String(e.name || '').slice(0, 80), k: ['w', 'r', 's', 'm'].indexOf(e.k) >= 0 ? e.k : 'w',
        sets: (Array.isArray(e.sets) ? e.sets : []).slice(0, 30).map(sanitizeSet).filter(function (s) { return s.w || s.r || s.s || s.m; }) };
    }).filter(function (e) { return e && e.sets.length; });
    return { id: String(w.id || ('w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6))).slice(0, 40), date: w.date,
      start: Number(w.start) || 0, end: Number(w.end) || 0, dur: Math.max(0, Math.min(600, Math.round(Number(w.dur) || 0))),
      title: String(w.title || 'Тренировка').slice(0, 80), src: ['plan', 'free', 'manual'].indexOf(w.src) >= 0 ? w.src : 'manual', ex: ex,
      note: w.note ? String(w.note).slice(0, 300) : undefined };
  }
  function sanitize(s) {
    var o = { v: 1, workouts: [], live: null };
    if (!s || typeof s !== 'object') return o;
    if (Array.isArray(s.workouts)) o.workouts = s.workouts.map(sanitizeWorkout).filter(Boolean);
    if (s.live && typeof s.live === 'object' && Array.isArray(s.live.ex) && s.live.start) o.live = s.live;
    sortW(o.workouts);
    return o;
  }
  function sortW(list) { list.sort(function (a, b) { return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.start - b.start); }); }
  var H = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(H)); return true; } catch (e) { toast('Не удалось сохранить — память браузера заполнена'); return false; } }
  var saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }

  /* ---------------- helpers ---------------- */
  var A = function () { return window.HTApp; };
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v, f) { return Number(v).toLocaleString('ru-RU', { maximumFractionDigits: f === undefined ? 1 : f }); }
  function plural(n, a, b, c) { n = Math.abs(Math.round(n)); var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
  function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function pkey(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function addD(k, n) { var d = pkey(k); d.setDate(d.getDate() + n); return dkey(d); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtDay(k, withYear) {
    var d = pkey(k), o = { weekday: 'long', day: 'numeric', month: 'long' };
    if (withYear || d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return cap(d.toLocaleDateString('ru-RU', o));
  }
  function fmtDayShort(k) { return pkey(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); }
  function fmtTime(ms) { if (!ms) return ''; var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }
  function toast(m) { if (A() && A().toast) A().toast(m); }
  function isPro() { return window.HTPro ? window.HTPro.isPro() : true; }
  function exById(id) { return A() && A().exById ? A().exById(id) : null; }
  function exName(e) { var x = exById(e.id); return (x && x.ru) || e.name || e.id; }
  function exImg(id, cls) { return exById(id) ? '<img class="ex-img ' + (cls || '') + '" src="img/ex/' + esc(id) + '.svg?v=7" alt="" loading="lazy" width="240" height="180">' : '<span class="ex-img ' + (cls || '') + ' hs-noimg">🏋️</span>'; }
  function parseNum(v) { var n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; }
  function kindOf(x, u) {
    if (u === 'm' || (x && x.mins)) return 'm';
    if (u === 's' || u === 'ss' || (x && x.secs)) return 's';
    return x && x.eq === 'bw' ? 'r' : 'w';
  }
  function setStr(st, k) {
    if (k === 'm') return num(st.m || 0) + ' мин';
    if (k === 's') return (st.w ? num(st.w) + ' кг · ' : '') + num(st.s || 0, 0) + ' с';
    return st.w ? num(st.w) + ' кг × ' + (st.r || 0) : (st.r || 0) + ' повт.';
  }
  function setsStr(e) {
    // «60 кг × 10, 10, 8» when the weight is the same; otherwise every set in full
    var sets = e.sets, k = e.k;
    if ((k === 'w' || k === 'r') && sets.length > 1 && sets.every(function (s) { return (s.w || 0) === (sets[0].w || 0); })) {
      return (sets[0].w ? num(sets[0].w) + ' кг × ' : '') + sets.map(function (s) { return s.r || 0; }).join(', ') + (sets[0].w ? '' : ' повт.');
    }
    return sets.map(function (s) { return setStr(s, k); }).join(', ');
  }
  function tonnage(w) { var t = 0; w.ex.forEach(function (e) { e.sets.forEach(function (s) { if (s.w && s.r) t += s.w * s.r; }); }); return t; }
  function setCount(w) { return w.ex.reduce(function (n, e) { return n + e.sets.length; }, 0); }
  function e1rm(s) { return s.w && s.r ? s.w * (1 + Math.min(s.r, 15) / 30) : 0; }
  function setScore(s, k) { return k === 'm' ? (s.m || 0) : k === 's' ? (s.s || 0) + (s.w || 0) : (k === 'w' || s.w) ? e1rm(s) || (s.r || 0) / 100 : (s.r || 0); }
  function uidW() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------------- queries (also used by the AI assistant) ---------------- */
  function list() { return H.workouts.slice(); }
  function workoutsBetween(k1, k2) { return H.workouts.filter(function (w) { return w.date >= k1 && w.date <= k2; }); }
  function jawList() { return window.JawModule && window.JawModule.history ? window.JawModule.history() : []; }
  function skinList() { return window.SkinModule && window.SkinModule.history ? window.SkinModule.history() : []; }
  function exSessions(id) {
    var out = [];
    H.workouts.forEach(function (w) { w.ex.forEach(function (e) { if (e.id === id) out.push({ w: w, e: e }); }); });
    return out;
  }
  function bestOf(sessions) {
    var best = null;
    sessions.forEach(function (x) { x.e.sets.forEach(function (s) { var sc = setScore(s, x.e.k); if (!best || sc > best.sc) best = { sc: sc, s: s, k: x.e.k, date: x.w.date }; }); });
    return best;
  }
  function doneExercises() {
    var m = {};
    H.workouts.forEach(function (w) { w.ex.forEach(function (e) { var o = m[e.id] = m[e.id] || { id: e.id, name: exName(e), n: 0, last: '' }; o.n++; if (w.date >= o.last) o.last = w.date; }); });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : b.n - a.n; });
  }
  // compact text for the LLM prompt
  function forAI(days) {
    var since = addD(dkey(), -(days || 30) + 1), lines = [];
    workoutsBetween(since, dkey()).forEach(function (w) {
      lines.push(w.date + ' (' + pkey(w.date).toLocaleDateString('ru-RU', { weekday: 'short' }) + ')' + (w.start && w.src !== 'manual' ? ' ' + fmtTime(w.start) : '') + ', ' + w.dur + ' мин, «' + w.title + '»: ' +
        w.ex.map(function (e) { return exName(e) + ' ' + setsStr(e); }).join('; ') + (tonnage(w) ? ' [тоннаж ' + Math.round(tonnage(w)) + ' кг]' : ''));
    });
    var jw = jawList().filter(function (j) { return j.date >= since; });
    if (jw.length) lines.push('Челюсть (сессии): ' + jw.map(function (j) { return j.date + ' день ' + j.day + (j.at ? ' ' + fmtTime(j.at) : '') + ' ~' + j.minutes + ' мин'; }).join('; '));
    var sk = skinList().filter(function (s) { return s.date >= since; });
    if (sk.length) lines.push('Уход за кожей (дни с отметками): ' + sk.map(function (s) { return s.date + ' ' + s.steps.length + ' шаг.' + (s.full ? ' полностью' : ''); }).join('; '));
    return lines.join('\n').slice(0, 5000);
  }

  /* ---------------- live session ---------------- */
  function lastSetsFor(id) { var s = exSessions(id); return s.length ? s[s.length - 1].e.sets : null; }
  function newSet(exId, k, it, i) {
    var prev = lastSetsFor(exId), p = prev && (prev[i] || prev[prev.length - 1]);
    var st = {};
    if (k === 'm') st.m = p && p.m ? p.m : it ? it.hi || it.lo : 20;
    else if (k === 's') { st.s = p && p.s ? p.s : it ? it.hi || it.lo : 30; if (p && p.w) st.w = p.w; }
    else { st.r = p && p.r ? p.r : it ? it.hi || it.lo : 10; if (p && p.w) st.w = p.w; }
    return st;
  }
  function liveEx(exId, it) {
    var x = exById(exId), k = kindOf(x, it && it.u), n = it ? it.sets || 1 : 3, sets = [];
    for (var i = 0; i < n; i++) sets.push(newSet(exId, k, it, i));
    return { id: exId, name: x ? x.ru : exId, k: k, target: it ? (A().fmtReps ? (it.sets > 1 ? it.sets + ' × ' : '') + A().fmtReps(it) : '') : '', rest: it ? it.rest : (x && x.compound ? 90 : 60), sets: sets };
  }
  function startPlanDay(i) {
    var ps = A().plan(), d = ps && ps.plan && ps.plan.days[i];
    if (!d) return;
    if (H.live && !confirm('Уже идёт тренировка «' + H.live.title + '». Начать новую? Текущая будет удалена.')) { location.hash = '#history/live'; return; }
    H.live = { id: uidW(), start: Date.now(), title: A().dayTitle ? A().dayTitle(d) : 'Тренировка', src: 'plan',
      ex: d.items.filter(function (it) { return it.k !== 'w'; }).map(function (it) { return liveEx(it.id, it); }) };
    save(); location.hash = '#history/live';
  }
  function startFree() {
    if (H.live) { location.hash = '#history/live'; return; }
    H.live = { id: uidW(), start: Date.now(), title: 'Свободная тренировка', src: 'free', ex: [] };
    save(); location.hash = '#history/live';
  }
  function finishLive() {
    var L = H.live; if (!L) return;
    var ex = L.ex.map(function (e) { return { id: e.id, name: e.name, k: e.k, sets: e.sets.filter(function (s) { return s.done; }).map(function (s) { var o = sanitizeSet(s); delete o.done; return o; }) }; })
      .filter(function (e) { return e.sets.length; });
    if (!ex.length) {
      if (confirm('Ни один подход не отмечен «✓». Удалить эту тренировку?')) { H.live = null; save(); location.hash = '#history'; }
      return;
    }
    var end = Date.now(), dur = Math.max(1, Math.round((end - L.start) / 60000));
    if (dur > 300) dur = Math.max(1, Math.min(300, Math.round(ex.reduce(function (n, e) { return n + e.sets.length; }, 0) * 2.5)));   // forgot to finish
    var w = sanitizeWorkout({ id: L.id, date: dkey(new Date(L.start)), start: L.start, end: end, dur: dur, title: L.title, src: L.src, ex: ex });
    H.workouts.push(w); sortW(H.workouts); H.live = null; save();
    if (A().addWorkoutMinutes) A().addWorkoutMinutes(w.date, w.dur);
    stopRest();
    toast('Тренировка сохранена: ' + w.dur + ' мин, ' + setCount(w) + ' ' + plural(setCount(w), 'подход', 'подхода', 'подходов'));
    location.hash = '#history/day/' + w.date;
  }

  /* ---------------- manual / edit draft (in memory) ---------------- */
  var draft = null;
  function newDraft(src) {
    var now = new Date();
    return { id: null, date: dkey(now), time: '18:00', dur: 45, title: 'Тренировка', note: '', ex: [] , from: src || null };
  }
  function draftFrom(w) {
    return { id: w.id, date: w.date, time: w.start ? fmtTime(w.start) : '18:00', dur: w.dur, title: w.title, note: w.note || '', src: w.src, start: w.start, end: w.end,
      ex: w.ex.map(function (e) { return { id: e.id, name: e.name, k: e.k, sets: e.sets.map(function (s) { return JSON.parse(JSON.stringify(s)); }) }; }) };
  }
  function saveDraft() {
    var D = draft; if (!D) return;
    var date = String(D.date || ''), today = dkey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) { toast('Укажи дату не позже сегодняшней'); return; }
    var dur = Math.round(parseNum(D.dur) || 0);
    if (!(dur >= 1 && dur <= 600)) { toast('Длительность — от 1 до 600 минут'); return; }
    var tm = /^(\d{1,2}):(\d{2})$/.exec(D.time || '') || [0, 18, 0], p = date.split('-');
    var start = new Date(+p[0], +p[1] - 1, +p[2], Math.min(23, +tm[1]), Math.min(59, +tm[2])).getTime();
    var ex = D.ex.map(function (e) { return { id: e.id, name: e.name, k: e.k, sets: e.sets.map(sanitizeSet).map(function (s) { delete s.done; return s; }) }; });
    var old = D.id ? H.workouts.filter(function (w) { return w.id === D.id; })[0] : null;
    var keepTimes = old && old.src !== 'manual' && old.date === date && fmtTime(old.start) === D.time;
    var w = sanitizeWorkout({ id: D.id || uidW(), date: date, start: keepTimes ? old.start : start, end: keepTimes ? old.end : start + dur * 60000, dur: dur,
      title: (D.title || '').trim() || 'Тренировка', src: old ? old.src : 'manual', ex: ex, note: (D.note || '').trim() || undefined });
    if (!w.ex.length && !confirm('Упражнения не добавлены. Сохранить только время тренировки?')) return;
    if (old) {
      H.workouts = H.workouts.filter(function (x) { return x.id !== old.id; });
      if (A().addWorkoutMinutes) A().addWorkoutMinutes(old.date, -old.dur);
    }
    H.workouts.push(w); sortW(H.workouts); save();
    if (A().addWorkoutMinutes) A().addWorkoutMinutes(w.date, w.dur);
    draft = null;
    toast(old ? 'Изменения сохранены' : 'Тренировка добавлена в историю');
    location.hash = '#history/day/' + w.date;
  }
  function removeWorkout(id) {
    var w = H.workouts.filter(function (x) { return x.id === id; })[0]; if (!w) return;
    if (!confirm('Удалить тренировку «' + w.title + '» (' + fmtDayShort(w.date) + ')?')) return;
    H.workouts = H.workouts.filter(function (x) { return x.id !== id; }); save();
    if (A().addWorkoutMinutes) A().addWorkoutMinutes(w.date, -w.dur);
    toast('Тренировка удалена'); render(cur);
  }

  /* ---------------- rest timer ---------------- */
  var rest = null, tick = null;
  function startRest(sec) { if (!(sec > 0)) return; rest = { end: Date.now() + sec * 1000, total: sec }; ensureTick(); paintRest(); }
  function stopRest() { rest = null; var b = document.getElementById('hsRest'); if (b) b.hidden = true; }
  function ensureTick() {
    if (tick) return;
    tick = setInterval(function () {
      var root = document.getElementById('historyRoot');
      if (!root || root.closest('.view').hidden || cur[0] !== 'live' || !H.live) { if (!rest) { clearInterval(tick); tick = null; } }
      var t = document.getElementById('hsTimer'); if (t && H.live) t.textContent = fmtClock((Date.now() - H.live.start) / 1000);
      paintRest();
    }, 1000);
  }
  function paintRest() {
    var b = document.getElementById('hsRest'); if (!b) return;
    if (!rest) { b.hidden = true; return; }
    var left = (rest.end - Date.now()) / 1000;
    if (left <= 0) { rest = null; b.hidden = true; try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ } toast('Отдых закончился — следующий подход'); return; }
    b.hidden = false; b.querySelector('b').textContent = fmtClock(left);
  }

  /* ---------------- rendering ---------------- */
  var cur = [], filter = 'all', shown = 30, pickerFor = null, pickerQ = '';
  function backBtn(href) { return '<a class="icon-btn" href="' + href + '" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>'; }
  function head(title, sub, back, extra) {
    return '<header class="top top-back">' + backBtn(back) + '<div class="grow"><h1 class="title">' + esc(title) + '</h1>' + (sub ? '<div class="subtitle">' + sub + '</div>' : '') + '</div>' + (extra || '') + '</header>';
  }
  function render(parts) {
    cur = parts || [];
    var root = document.getElementById('historyRoot'); if (!root) return;
    var v = cur[0] || '';
    if (v === 'live') root.innerHTML = renderLive();
    else if (v === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(cur[1] || '')) root.innerHTML = renderDay(cur[1]);
    else if (v === 'ex' && cur[1]) root.innerHTML = renderEx(decodeURIComponent(cur[1]));
    else if (v === 'add' || v === 'edit') {
      if (v === 'edit') { var w = H.workouts.filter(function (x) { return x.id === cur[1]; })[0]; if (!w) { location.hash = '#history'; return; } if (!draft || draft.id !== w.id) draft = draftFrom(w); }
      else if (!draft || draft.id) draft = newDraft();
      root.innerHTML = renderForm();
    } else root.innerHTML = renderList();
    if (pickerFor) root.insertAdjacentHTML('beforeend', pickerHtml());
    if (v === 'live' && H.live) { ensureTick(); paintRest(); }
  }
  function liveBanner() {
    if (!H.live) return '';
    return '<a class="hs-live-banner" href="#history/live"><span class="hs-dot"></span><span class="grow"><b>Идёт тренировка</b><small>' + esc(H.live.title) + ' · начата в ' + fmtTime(H.live.start) + '</small></span><span class="btn small primary">Продолжить</span></a>';
  }

  // ---- list
  function dayItems(k, jaw, skin, metricMin) {
    var out = [];
    if (filter === 'all' || filter === 'wk') {
      var ws = H.workouts.filter(function (w) { return w.date === k; });
      ws.forEach(function (w) {
        var t = tonnage(w), sc = setCount(w);
        out.push('<li class="hs-item"><span class="hs-ic">🏋️</span><span class="grow"><b>' + esc(w.title) + '</b><small>' + (w.start && w.src !== 'manual' ? fmtTime(w.start) + ' · ' : '') + w.dur + ' мин · ' +
          w.ex.length + ' ' + plural(w.ex.length, 'упражнение', 'упражнения', 'упражнений') + ' · ' + sc + ' ' + plural(sc, 'подход', 'подхода', 'подходов') + (t ? ' · ' + num(Math.round(t), 0) + ' кг' : '') + '</small></span></li>');
      });
      var logged = metricMin && metricMin[k], sumW = ws.reduce(function (n, w) { return n + w.dur; }, 0);
      if (logged && logged > sumW) out.push('<li class="hs-item"><span class="hs-ic">⏱</span><span class="grow"><b>Активность ' + num(logged - sumW, 0) + ' мин</b><small>отмечено вручную на экране «Сегодня»</small></span></li>');
    }
    if (filter === 'all' || filter === 'jaw') (jaw[k] || []).forEach(function (j) {
      out.push('<li class="hs-item"><span class="hs-ic">💪</span><span class="grow"><b>Челюсть · день ' + j.day + '</b><small>' + (j.at ? fmtTime(j.at) + ' · ' : '') + '≈ ' + j.minutes + ' мин · ' + j.items.length + ' ' + plural(j.items.length, 'упражнение', 'упражнения', 'упражнений') + '</small></span></li>');
    });
    if ((filter === 'all' || filter === 'skin') && skin[k]) {
      var s = skin[k];
      out.push('<li class="hs-item"><span class="hs-ic">🧴</span><span class="grow"><b>Уход за кожей' + (s.full ? ' ✓' : '') + '</b><small>' + s.steps.length + ' ' + plural(s.steps.length, 'шаг', 'шага', 'шагов') + (s.full ? ' · весь уход выполнен' : '') + '</small></span></li>');
    }
    return out;
  }
  function indexes() {
    var jaw = {}, skin = {};
    jawList().forEach(function (j) { (jaw[j.date] = jaw[j.date] || []).push(j); });
    skinList().forEach(function (s) { skin[s.date] = s; });
    var mm = (A() && A().data && A().data().workout) || {};
    return { jaw: jaw, skin: skin, mm: mm };
  }
  function weekStart(k) { var d = pkey(k), wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dkey(d); }
  function renderList() {
    var ix = indexes(), days = {};
    H.workouts.forEach(function (w) { days[w.date] = 1; });
    Object.keys(ix.jaw).forEach(function (k) { days[k] = 1; }); Object.keys(ix.skin).forEach(function (k) { days[k] = 1; });
    Object.keys(ix.mm).forEach(function (k) { days[k] = 1; });
    var keys = Object.keys(days).filter(function (k) { return k <= dkey(); }).sort().reverse();
    var groups = [];
    keys.forEach(function (k) { var it = dayItems(k, ix.jaw, ix.skin, ix.mm); if (it.length) groups.push({ k: k, items: it }); });
    var ws = weekStart(dkey()), wk = workoutsBetween(ws, dkey()), prevWk = workoutsBetween(addD(ws, -7), addD(ws, -1));
    var sumMin = function (l) { return l.reduce(function (n, w) { return n + w.dur; }, 0); }, sumT = function (l) { return l.reduce(function (n, w) { return n + tonnage(w); }, 0); };
    var html = head('История', 'Всё, что ты сделал: тренировки, челюсть, уход', '#workouts') + liveBanner() +
      '<div class="hs-actions"><button type="button" class="btn primary" data-hs="free">▶ Начать тренировку</button><button type="button" class="btn" data-hs="add">＋ Прошедшая тренировка</button></div>' +
      '<section class="card hs-week"><div class="card-head"><h2>Эта неделя</h2><span class="muted small">с ' + fmtDayShort(ws) + '</span></div><div class="stats">' +
      '<div class="stat"><div class="stat-val">' + wk.length + '</div><div class="stat-lbl">' + plural(wk.length, 'тренировка', 'тренировки', 'тренировок') + '</div><div class="stat-hint">прошлая: ' + prevWk.length + '</div></div>' +
      '<div class="stat"><div class="stat-val">' + sumMin(wk) + '</div><div class="stat-lbl">минут</div><div class="stat-hint">прошлая: ' + sumMin(prevWk) + '</div></div>' +
      '<div class="stat"><div class="stat-val">' + num(Math.round(sumT(wk)), 0) + '</div><div class="stat-lbl">кг тоннаж</div><div class="stat-hint">прошлая: ' + num(Math.round(sumT(prevWk)), 0) + '</div></div></div></section>' +
      '<div class="seg seg-full hs-filter" role="group">' + [['all', 'Все'], ['wk', 'Тренировки'], ['jaw', 'Челюсть'], ['skin', 'Уход']].map(function (o) { return '<button type="button" class="seg-btn' + (filter === o[0] ? ' active' : '') + '" data-hs-filter="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (!groups.length) html += '<section class="card hs-empty"><p><b>Пока пусто.</b></p><p class="muted small">Нажми «▶ Начать» в карточке дня программы (вкладка «Тренировки») или «Начать тренировку» выше и отмечай каждый подход. Прошедшую тренировку можно добавить вручную с датой. Сессии «Челюсть 30 дней» и отметки ухода за кожей появятся здесь автоматически.</p></section>';
    groups.slice(0, shown).forEach(function (g) {
      html += '<a class="card hs-day" href="#history/day/' + g.k + '"><div class="hs-day-head"><h3>' + fmtDay(g.k) + '</h3><span class="jw-chev">›</span></div><ul class="hs-items">' + g.items.join('') + '</ul></a>';
    });
    if (groups.length > shown) html += '<button type="button" class="btn wide" data-hs="more">Показать ещё (' + (groups.length - shown) + ')</button>';
    var exs = doneExercises();
    if (exs.length) {
      html += '<section class="card"><div class="card-head"><h2>Мои упражнения</h2><span class="muted small">' + exs.length + '</span></div><ul class="hs-exlist">' +
        exs.slice(0, 40).map(function (e) { var b = bestOf(exSessions(e.id)); return '<li><a href="#history/ex/' + encodeURIComponent(e.id) + '">' + exImg(e.id, 'ex-thumb') + '<span class="grow"><b>' + esc(e.name) + '</b><small>' + e.n + ' ' + plural(e.n, 'раз', 'раза', 'раз') + ' · последний ' + fmtDayShort(e.last) + (b ? ' · лучший: ' + setStr(b.s, b.k) : '') + '</small></span><span class="jw-chev">›</span></a></li>'; }).join('') + '</ul></section>';
    }
    return html;
  }

  // ---- day details
  function renderDay(k) {
    var ix = indexes(), ws = H.workouts.filter(function (w) { return w.date === k; }), html = head(fmtDay(k), '', '#history');
    ws.forEach(function (w) {
      var t = tonnage(w);
      html += '<section class="card hs-wcard"><div class="card-head"><h2>🏋️ ' + esc(w.title) + '</h2><span class="muted small">' + ({ plan: 'по программе', free: 'свободная', manual: 'добавлена вручную' }[w.src]) + '</span></div>' +
        '<p class="hs-meta">' + (w.start && w.src !== 'manual' ? fmtTime(w.start) + '–' + fmtTime(w.end) + ' · ' : (w.start ? '≈ ' + fmtTime(w.start) + ' · ' : '')) + '<b>' + w.dur + ' мин</b> · ' + setCount(w) + ' ' + plural(setCount(w), 'подход', 'подхода', 'подходов') + (t ? ' · тоннаж <b>' + num(Math.round(t), 0) + ' кг</b>' : '') + '</p>' +
        (w.ex.length ? '<ul class="hs-exdone">' + w.ex.map(function (e) {
          return '<li><a href="#history/ex/' + encodeURIComponent(e.id) + '">' + exImg(e.id, 'ex-thumb') + '<span class="grow"><b>' + esc(exName(e)) + '</b><small>' + e.sets.map(function (s, i) { return '<span class="hs-chip">' + (i + 1) + ': ' + setStr(s, e.k) + '</span>'; }).join(' ') + '</small></span></a></li>';
        }).join('') + '</ul>' : '<p class="muted small">Упражнения не записаны.</p>') +
        (w.note ? '<p class="muted small">📝 ' + esc(w.note) + '</p>' : '') +
        '<div class="hs-row-btns"><a class="btn small" href="#history/edit/' + esc(w.id) + '">Изменить</a><button type="button" class="btn small danger" data-hs-del="' + esc(w.id) + '">Удалить</button></div></section>';
    });
    (ix.jaw[k] || []).forEach(function (j) {
      html += '<section class="card"><div class="card-head"><h2>💪 Челюсть · день ' + j.day + '</h2><a class="pill-link" href="#jaw">Открыть</a></div><p class="hs-meta">' + (j.at ? fmtTime(j.at) + ' · ' : '') + '≈ ' + j.minutes + ' мин</p>' +
        '<ul class="hs-plain">' + j.items.map(function (it) { return '<li>' + esc(it.name) + ' — <span class="muted">' + esc(it.dose) + '</span></li>'; }).join('') + '</ul></section>';
    });
    var s = ix.skin[k];
    if (s) html += '<section class="card"><div class="card-head"><h2>🧴 Уход за кожей' + (s.full ? ' ✓' : '') + '</h2><a class="pill-link" href="#skin">Открыть</a></div>' + (s.at ? '<p class="hs-meta">последняя отметка ' + fmtTime(s.at) + '</p>' : '') +
      '<ul class="hs-plain">' + s.steps.map(function (st) { return '<li>' + st.ic + ' ' + esc(st.t) + ' <span class="muted small">' + (st.pm ? 'вечер' : 'утро') + '</span></li>'; }).join('') + '</ul></section>';
    var d = A() && A().data ? A().data() : {}, rows = [];
    [['workout', 'Тренировка (метрика)', ' мин'], ['steps', 'Шаги', ''], ['sleep', 'Сон', ' ч'], ['water', 'Вода', ' мл'], ['weight', 'Вес', ' кг']].forEach(function (m) {
      if (d[m[0]] && d[m[0]][k] !== undefined) rows.push('<li>' + m[1] + ': <b>' + num(d[m[0]][k]) + m[2] + '</b></li>');
    });
    if (rows.length) html += '<section class="card"><div class="card-head"><h2>Отметки дня</h2></div><ul class="hs-plain">' + rows.join('') + '</ul></section>';
    if (!ws.length && !(ix.jaw[k] || []).length && !s && !rows.length) html += '<section class="card"><p class="muted">В этот день ничего не записано.</p></section>';
    html += '<button type="button" class="btn wide" data-hs="add" data-date="' + k + '">＋ Добавить тренировку за этот день</button>';
    return html;
  }

  // ---- exercise history
  function chartSvg(points, unit) {
    if (points.length < 2) return '<p class="muted small">Для графика нужно хотя бы две тренировки с этим упражнением.</p>';
    var W = 320, Hh = 150, pl = 34, pr = 10, pt = 12, pb = 24;
    var vs = points.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.12; lo = Math.max(0, lo - pad); hi += pad;
    var x = function (i) { return pl + (W - pl - pr) * (points.length === 1 ? 0.5 : i / (points.length - 1)); };
    var y = function (v) { return pt + (Hh - pt - pb) * (1 - (v - lo) / (hi - lo)); };
    var path = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    return '<svg class="hs-chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="График прогресса">' +
      '<line x1="' + pl + '" y1="' + y(hi) + '" x2="' + (W - pr) + '" y2="' + y(hi) + '" class="hs-grid"/><line x1="' + pl + '" y1="' + y(lo) + '" x2="' + (W - pr) + '" y2="' + y(lo) + '" class="hs-grid"/>' +
      '<text x="' + (pl - 4) + '" y="' + (y(hi) + 4) + '" text-anchor="end">' + num(hi, 0) + '</text><text x="' + (pl - 4) + '" y="' + (y(lo) + 4) + '" text-anchor="end">' + num(lo, 0) + '</text>' +
      '<path d="' + path + '" class="hs-line"/>' + points.map(function (p, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="3.5" class="hs-pt"><title>' + fmtDayShort(p.k) + ': ' + num(p.v) + ' ' + unit + '</title></circle>'; }).join('') +
      '<text x="' + pl + '" y="' + (Hh - 6) + '">' + fmtDayShort(points[0].k) + '</text><text x="' + (W - pr) + '" y="' + (Hh - 6) + '" text-anchor="end">' + fmtDayShort(points[points.length - 1].k) + '</text></svg>';
  }
  function renderEx(id) {
    var x = exById(id), ss = exSessions(id), name = (x && x.ru) || (ss[0] && ss[0].e.name) || id;
    var html = head(name, ss.length + ' ' + plural(ss.length, 'тренировка', 'тренировки', 'тренировок') + ' с этим упражнением', '#history');
    if (!ss.length) return html + '<section class="card"><p class="muted">Это упражнение ещё не записано в истории.</p></section>';
    var k = ss[ss.length - 1].e.k, last = ss[ss.length - 1], best = bestOf(ss);
    var weighted = ss.some(function (s) { return s.e.sets.some(function (st) { return st.w; }); });
    html += '<section class="card hs-exhead">' + exImg(id, 'hs-exbig') + '<div class="stats">' +
      '<div class="stat"><div class="stat-val">' + esc(setStr(last.e.sets[0], last.e.k).replace(' повт.', '')) + '</div><div class="stat-lbl">последний раз</div><div class="stat-hint">' + fmtDayShort(last.w.date) + '</div></div>' +
      '<div class="stat"><div class="stat-val">' + esc(setStr(best.s, best.k).replace(' повт.', '')) + '</div><div class="stat-lbl">лучший подход</div><div class="stat-hint">' + fmtDayShort(best.date) + '</div></div>' +
      (weighted && e1rm(best.s) ? '<div class="stat"><div class="stat-val">' + num(e1rm(best.s), 0) + '</div><div class="stat-lbl">≈ 1ПМ, кг</div><div class="stat-hint">по формуле Эпли</div></div>' : '') + '</div>' +
      '<p class="hs-meta">Последняя тренировка (' + fmtDay(last.w.date) + '): <b>' + esc(setsStr(last.e)) + '</b></p></section>';
    // chart (Pro)
    var unit = k === 'm' ? 'мин' : k === 's' ? 'с' : weighted ? 'кг (≈1ПМ)' : 'повт.';
    var pts = ss.map(function (s) {
      var v = 0;
      s.e.sets.forEach(function (st) { var sc = k === 'm' ? st.m || 0 : k === 's' ? st.s || 0 : weighted ? e1rm(st) : st.r || 0; if (sc > v) v = sc; });
      return { k: s.w.date, v: Math.round(v * 10) / 10 };
    }).slice(-20);
    if (isPro()) html += '<section class="card"><div class="card-head"><h2>Прогресс</h2><span class="muted small">' + (weighted ? 'лучший ≈1ПМ за тренировку' : k === 's' ? 'лучшее время' : k === 'm' ? 'минуты' : 'макс. повторов') + '</span></div>' + chartSvg(pts, unit) + '</section>';
    else html += (window.HTPro ? window.HTPro.lockCard('График прогресса', 'Линия роста по каждому упражнению: вес, повторы и расчётный максимум за все тренировки.', 'history') : '');
    var rows = ss.slice().reverse().slice(0, isPro() ? 30 : 5);
    html += '<section class="card"><div class="card-head"><h2>Тренировки</h2>' + (!isPro() && ss.length > 5 ? '<span class="muted small">последние 5 · все в Про</span>' : '') + '</div><ul class="hs-plain hs-exrows">' +
      rows.map(function (s) { return '<li><a href="#history/day/' + s.w.date + '"><b>' + fmtDayShort(s.w.date) + '</b> · ' + esc(setsStr(s.e)) + '</a></li>'; }).join('') + '</ul></section>';
    return html;
  }

  // ---- set editor (live + manual form)
  function setRow(e, s, i, live) {
    var k = e.k, f = function (name, val, ph, unit, mode) { return '<label class="hs-in"><input type="text" inputmode="' + (mode || 'decimal') + '" data-f="' + name + '" value="' + (val ? esc(String(val).replace('.', ',')) : '') + '" placeholder="' + ph + '" maxlength="6"><small>' + unit + '</small></label>'; };
    var inputs = k === 'm' ? f('m', s.m, '20', 'мин') : k === 's' ? f('s', s.s, '30', 'сек', 'numeric') + f('w', s.w, '—', '+кг') : f('w', s.w, k === 'r' ? '—' : '0', k === 'r' ? '+кг' : 'кг') + f('r', s.r, '10', 'повт', 'numeric');
    return '<div class="hs-set' + (s.done ? ' done' : '') + '" data-si="' + i + '"><span class="hs-n">' + (i + 1) + '</span>' + inputs +
      (live ? '<button type="button" class="hs-done" data-hs="done" aria-pressed="' + !!s.done + '" aria-label="Сделал подход">✓</button>' : '') + '</div>';
  }
  function exEditor(e, xi, live) {
    var prev = live ? lastSetsFor(e.id) : null;
    return '<section class="card hs-excard" data-xi="' + xi + '"><div class="hs-exhead2">' + exImg(e.id, 'ex-thumb') + '<div class="grow"><b>' + esc(exName(e)) + '</b>' +
      (e.target ? '<small>План: ' + esc(e.target) + '</small>' : '') + (prev ? '<small>Прошлый раз: ' + esc(setsStr({ k: e.k, sets: prev })) + '</small>' : '') + '</div>' +
      '<button type="button" class="icon-btn hs-x" data-hs="rmex" aria-label="Убрать упражнение">✕</button></div>' +
      e.sets.map(function (s, i) { return setRow(e, s, i, live); }).join('') +
      '<div class="hs-row-btns"><button type="button" class="btn small" data-hs="addset">＋ подход</button>' + (e.sets.length > 1 ? '<button type="button" class="btn small ghost" data-hs="rmset">− подход</button>' : '') + '</div></section>';
  }
  function renderLive() {
    var L = H.live;
    if (!L) return head('Тренировка', '', '#history') + '<section class="card"><p class="muted">Сейчас тренировка не идёт.</p><div class="hs-actions"><button type="button" class="btn primary" data-hs="free">▶ Начать свободную тренировку</button><a class="btn" href="#workouts">К программе</a></div></section>';
    var done = L.ex.reduce(function (n, e) { return n + e.sets.filter(function (s) { return s.done; }).length; }, 0), all = L.ex.reduce(function (n, e) { return n + e.sets.length; }, 0);
    return head(L.title, 'начата в ' + fmtTime(L.start) + ' · <b id="hsTimer">' + fmtClock((Date.now() - L.start) / 1000) + '</b>', '#workouts') +
      '<section class="card hs-progress"><div class="hs-bar"><i style="width:' + (all ? Math.round(done / all * 100) : 0) + '%"></i></div><small class="muted">Сделано ' + done + ' из ' + all + ' ' + plural(all, 'подхода', 'подходов', 'подходов') + '. Меняй вес и повторы, затем жми «✓».</small></section>' +
      L.ex.map(function (e, i) { return exEditor(e, i, true); }).join('') +
      '<button type="button" class="btn wide" data-hs="pick">＋ Добавить упражнение</button>' +
      '<div class="hs-finish"><button type="button" class="btn primary big" data-hs="finish">Завершить и сохранить</button><button type="button" class="link-btn small" data-hs="cancel">Отменить тренировку</button></div>' +
      '<div class="hs-rest" id="hsRest" hidden>⏱ Отдых <b>0:00</b><button type="button" class="btn small" data-hs="skiprest">Пропустить</button></div>';
  }
  function renderForm() {
    var D = draft;
    return head(D.id ? 'Изменить тренировку' : 'Прошедшая тренировка', 'Запиши, что и когда ты делал', D.id ? '#history/day/' + D.date : '#history') +
      '<section class="card hs-form"><div class="hs-grid2">' +
      '<label class="fc-field"><span>Дата</span><input type="date" id="hsDate" max="' + dkey() + '" value="' + esc(D.date) + '"></label>' +
      '<label class="fc-field"><span>Начало</span><input type="time" id="hsTime" value="' + esc(D.time) + '"></label>' +
      '<label class="fc-field"><span>Длительность, мин</span><input type="text" inputmode="numeric" id="hsDur" maxlength="3" value="' + esc(D.dur) + '"></label>' +
      '<label class="fc-field"><span>Название</span><input type="text" id="hsTitle" maxlength="60" value="' + esc(D.title) + '"></label></div>' +
      '<label class="fc-field"><span>Заметка</span><input type="text" id="hsNote" maxlength="200" placeholder="необязательно" value="' + esc(D.note) + '"></label></section>' +
      D.ex.map(function (e, i) { return exEditor(e, i, false); }).join('') +
      '<button type="button" class="btn wide" data-hs="pick">＋ Добавить упражнение</button>' +
      '<div class="hs-finish"><button type="button" class="btn primary big" data-hs="savedraft">Сохранить</button></div>';
  }
  function pickerHtml() {
    var ex = (A() && A().exercises ? A().exercises() : []), q = pickerQ.toLowerCase().replace(/ё/g, 'е').trim();
    var res = ex.filter(function (x) { return !q || (x.ru + ' ' + x.en).toLowerCase().replace(/ё/g, 'е').indexOf(q) >= 0; }).slice(0, 60);
    return '<div class="pro-modal hs-picker" id="hsPicker"><div class="pro-modal-card card" role="dialog" aria-modal="true" aria-label="Выбор упражнения"><div class="card-head"><h2>Упражнение</h2><button type="button" class="pill-link" data-hs="closepick">Закрыть</button></div>' +
      '<input type="search" id="hsPickQ" class="hs-search" placeholder="Поиск: жим, присед, планка…" value="' + esc(pickerQ) + '" autocomplete="off">' +
      '<ul class="hs-picklist">' + res.map(function (x) { return '<li><button type="button" data-hs-pick="' + esc(x.id) + '">' + exImg(x.id, 'ex-thumb') + '<span>' + esc(x.ru) + '</span></button></li>'; }).join('') + (res.length ? '' : '<li class="muted small">Ничего не найдено</li>') + '</ul></div></div>';
  }

  /* ---------------- events ---------------- */
  function target() { return cur[0] === 'live' ? H.live : draft; }
  function readForm() {
    if (!draft) return;
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    if (document.getElementById('hsDate')) { draft.date = g('hsDate'); draft.time = g('hsTime'); draft.dur = g('hsDur'); draft.title = g('hsTitle'); draft.note = g('hsNote'); }
  }
  function rerender() { var y = window.scrollY; render(cur); window.scrollTo(0, y); }
  document.addEventListener('input', function (e) {
    var root = document.getElementById('historyRoot'); if (!root || !root.contains(e.target)) return;
    if (e.target.id === 'hsPickQ') {
      pickerQ = e.target.value;
      var p = document.getElementById('hsPicker'), pos = e.target.selectionStart;
      if (p) { p.outerHTML = pickerHtml(); var i = document.getElementById('hsPickQ'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) { /* ignore */ } } }
      return;
    }
    var f = e.target.getAttribute('data-f'); if (!f) { if (draft && cur[0] !== 'live') readForm(); return; }
    var T = target(), card = e.target.closest('[data-xi]'), row = e.target.closest('[data-si]'); if (!T || !card || !row) return;
    var ex = T.ex[+card.getAttribute('data-xi')], st = ex && ex.sets[+row.getAttribute('data-si')]; if (!st) return;
    var v = parseNum(e.target.value);
    if (v === null || v <= 0) delete st[f]; else st[f] = f === 'r' || f === 's' ? Math.round(v) : Math.round(v * 100) / 100;
    if (cur[0] === 'live') saveSoon();
  });
  document.addEventListener('click', function (e) {
    var root = document.getElementById('historyRoot'); if (!root || !root.contains(e.target)) return;
    var fl = e.target.closest('[data-hs-filter]'); if (fl) { filter = fl.getAttribute('data-hs-filter'); rerender(); return; }
    var del = e.target.closest('[data-hs-del]'); if (del) { removeWorkout(del.getAttribute('data-hs-del')); return; }
    var pk = e.target.closest('[data-hs-pick]');
    if (pk) {
      var T0 = target(); if (!T0) return;
      readForm();
      var it = liveEx(pk.getAttribute('data-hs-pick'), null);
      if (cur[0] !== 'live') it.sets.forEach(function (s) { delete s.done; });
      T0.ex.push(it); pickerFor = null; pickerQ = '';
      if (cur[0] === 'live') save();
      rerender(); return;
    }
    if (e.target.id === 'hsPicker') { pickerFor = null; rerender(); return; }
    var b = e.target.closest('[data-hs]'); if (!b) return;
    var act = b.getAttribute('data-hs'), T = target(), card = b.closest('[data-xi]'), xi = card ? +card.getAttribute('data-xi') : -1;
    if (act === 'free') startFree();
    else if (act === 'add') { draft = newDraft(); if (b.getAttribute('data-date')) draft.date = b.getAttribute('data-date'); location.hash = '#history/add'; if (cur[0] === 'add') render(cur); }
    else if (act === 'more') { shown += 30; rerender(); }
    else if (act === 'pick') { readForm(); pickerFor = cur[0]; pickerQ = ''; rerender(); var q = document.getElementById('hsPickQ'); if (q) q.focus(); }
    else if (act === 'closepick') { pickerFor = null; rerender(); }
    else if (act === 'finish') finishLive();
    else if (act === 'cancel') { if (confirm('Отменить тренировку? Отмеченные подходы не сохранятся.')) { H.live = null; save(); stopRest(); location.hash = '#workouts'; } }
    else if (act === 'skiprest') stopRest();
    else if (act === 'savedraft') { readForm(); saveDraft(); }
    else if (T && xi >= 0 && T.ex[xi]) {
      var ex = T.ex[xi];
      readForm();
      if (act === 'done') {
        var row = b.closest('[data-si]'), st = ex.sets[+row.getAttribute('data-si')];
        st.done = !st.done; if (st.done) { st.at = Date.now(); startRest(ex.rest || 60); }
        save(); rerender();
      } else if (act === 'addset') { var last = ex.sets[ex.sets.length - 1] || {}; var ns = JSON.parse(JSON.stringify(last)); delete ns.done; delete ns.at; ex.sets.push(ns); if (cur[0] === 'live') save(); rerender(); }
      else if (act === 'rmset') { if (ex.sets.length > 1) ex.sets.pop(); if (cur[0] === 'live') save(); rerender(); }
      else if (act === 'rmex') { if (!ex.sets.some(function (s) { return s.done; }) || confirm('Убрать «' + exName(ex) + '» вместе с отмеченными подходами?')) { T.ex.splice(xi, 1); if (cur[0] === 'live') save(); rerender(); } }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pickerFor) { pickerFor = null; rerender(); }
  });

  /* ---------------- export / import / demo ---------------- */
  function exportData() { return { v: 1, workouts: H.workouts }; }
  function importData(obj) {
    var inc = sanitize(obj), have = {}, n = 0;
    H.workouts.forEach(function (w) { have[w.id] = 1; });
    inc.workouts.forEach(function (w) { if (!have[w.id]) { H.workouts.push(w); n++; } });
    sortW(H.workouts); save();
    return n;
  }
  function count() { return H.workouts.length; }
  function demo(planDays) {
    if (H.workouts.length) return 0;
    var mk = function (back, hh, dur, title, ex) {
      var d = new Date(); d.setDate(d.getDate() - back); d.setHours(hh, 10, 0, 0);
      return sanitizeWorkout({ id: uidW() + back, date: dkey(d), start: d.getTime(), end: d.getTime() + dur * 60000, dur: dur, title: title, src: 'plan', ex: ex });
    };
    var S3 = function (w, a, b, c) { return [{ w: w, r: a }, { w: w, r: b }, { w: w, r: c }]; };
    var list = [
      mk(13, 19, 52, 'Всё тело A', [{ id: 'bench_press', k: 'w', sets: S3(50, 10, 9, 8) }, { id: 'goblet_squat', k: 'w', sets: S3(16, 12, 12, 10) }, { id: 'db_row', k: 'w', sets: S3(18, 12, 11, 10) }, { id: 'plank', k: 's', sets: [{ s: 40 }, { s: 35 }] }]),
      mk(11, 19, 48, 'Всё тело B', [{ id: 'rdl', k: 'w', sets: S3(40, 10, 10, 10) }, { id: 'db_ohp', k: 'w', sets: S3(12, 10, 9, 8) }, { id: 'lat_pulldown', k: 'w', sets: S3(40, 12, 10, 10) }]),
      mk(9, 18, 55, 'Всё тело C', [{ id: 'bench_press', k: 'w', sets: S3(52.5, 10, 8, 8) }, { id: 'reverse_lunge', k: 'r', sets: S3(0, 12, 12, 10) }, { id: 'db_row', k: 'w', sets: S3(20, 10, 10, 9) }]),
      mk(6, 19, 50, 'Всё тело A', [{ id: 'bench_press', k: 'w', sets: S3(55, 8, 8, 7) }, { id: 'goblet_squat', k: 'w', sets: S3(18, 12, 10, 10) }, { id: 'db_row', k: 'w', sets: S3(20, 12, 11, 10) }, { id: 'plank', k: 's', sets: [{ s: 45 }, { s: 40 }] }]),
      mk(4, 8, 45, 'Всё тело B', [{ id: 'rdl', k: 'w', sets: S3(45, 10, 9, 9) }, { id: 'db_ohp', k: 'w', sets: S3(12, 11, 10, 9) }, { id: 'lat_pulldown', k: 'w', sets: S3(45, 10, 10, 9) }]),
      mk(2, 19, 58, 'Всё тело C', [{ id: 'bench_press', k: 'w', sets: S3(55, 10, 9, 8) }, { id: 'reverse_lunge', k: 'r', sets: S3(0, 14, 12, 12) }, { id: 'db_row', k: 'w', sets: S3(22, 10, 10, 8) }])
    ].filter(Boolean).map(function (w) { w.ex = w.ex.filter(function (e) { return exById(e.id); }); return w; });
    list.forEach(function (w) { H.workouts.push(w); }); sortW(H.workouts); save();
    return list.length;
  }

  window.HistoryModule = {
    render: render, liveBanner: liveBanner, startPlanDay: startPlanDay, startFree: startFree,
    list: list, workoutsBetween: workoutsBetween, exSessions: exSessions, bestOf: bestOf, doneExercises: doneExercises,
    jaw: jawList, skin: skinList, forAI: forAI, setsStr: setsStr, setStr: setStr, tonnage: tonnage, setCount: setCount, exName: exName, fmtDay: fmtDay, fmtTime: fmtTime,
    exportData: exportData, importData: importData, count: count, demo: demo, isLive: function () { return !!H.live; },
    reload: function () { H = load(); }
  };
})();
