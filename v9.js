/* Здоровье v9 — «Сегодня = одно следующее действие», свои цели, итоги недели, резервная копия, установка на экран «Домой».
 * Loaded before app.js; talks to the app only through window.HTApp at call time.
 * Storage: localStorage 'health.v9' -> {
 *   v: 1, first: ms, goalsOn: { sleep, water, steps, workout, weight, mood: false when switched off },
 *   seen: { ai, workouts, food, jaw, skin: 1 }  (promo cards on «Сегодня» disappear after the first visit), promosOff,
 *   backup: { last: ms of the last JSON export, snooze: ms }, install: { snooze: ms }, weekly: { seen: 'YYYY-MM-DD' (monday) }
 * } — everything optional; old data in health.v2 is never rewritten. */
(function () {
  'use strict';
  var PKEY = 'health.v9';
  var DAY = 86400000;
  var METRIC_IDS = ['sleep', 'water', 'steps', 'workout', 'weight', 'mood'];
  var NAMES = { sleep: 'Сон', water: 'Вода', steps: 'Шаги', workout: 'Тренировка', weight: 'Вес', mood: 'Настроение' };
  function A() { return window.HTApp; }
  function readP() {
    var s = null; try { s = JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    s.v = 1;
    if (!(s.first > 0)) s.first = Date.now();
    ['goalsOn', 'seen', 'backup', 'install', 'weekly'].forEach(function (k) { if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {}; });
    return s;
  }
  var P = readP();
  window.addEventListener('storage', function (e) { if (e.key === PKEY) P = readP(); });   // another tab changed the prefs
  function save() { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch (e) { /* storage full */ } }
  save();
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v, d) { return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d === undefined ? 1 : d }); }
  function signed(v, d) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v), d); }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pkey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addD(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function today0() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function mondayOf(d) { return addD(d, -((d.getDay() + 6) % 7)); }
  function fmtD(k, o) { return pkey(k).toLocaleDateString('ru-RU', o || { day: 'numeric', month: 'long' }); }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function isPro() { return !window.HTPro || window.HTPro.isPro(); }

  /* ---------------- own goals ---------------- */
  function goalOn(id) { return P.goalsOn[id] !== false; }
  function setGoalOn(id, on) { if (METRIC_IDS.indexOf(id) < 0) return; if (on) delete P.goalsOn[id]; else P.goalsOn[id] = false; save(); }
  function enabledMetrics() { return METRIC_IDS.filter(goalOn); }

  /* ---------------- data helpers ---------------- */
  function val(id, k) { var d = A().data()[id]; return d && Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }
  function recordsCount() {
    var a = A(), d = a.data(), n = 0;
    METRIC_IDS.forEach(function (id) { n += Object.keys(d[id] || {}).length; });
    var f = a.food(); Object.keys(f).forEach(function (k) { n += f[k].length; });
    if (window.HistoryModule) n += window.HistoryModule.count();
    return n;
  }
  function plannedToday() {
    var ps = A().plan(), wd = (new Date().getDay() + 6) % 7;
    if (!ps || !ps.plan || !ps.plan.days) return null;
    for (var i = 0; i < ps.plan.days.length; i++) { var d = ps.plan.days[i]; if (d.wd === wd && d.tpl !== 'rec') return { i: i, day: d, title: A().dayTitle(d), min: A().dayMinutes ? A().dayMinutes(d) : null }; }
    return null;
  }
  function workoutDoneToday() {
    var tk = A().todayKey();
    if (window.HistoryModule && window.HistoryModule.workoutsBetween(tk, tk).length) return true;
    var g = A().settings().goals.workout, v = val('workout', tk);
    return v !== null && v >= (g || 1);
  }
  function plannedPerWeek() { var ps = A().plan(); return ps && ps.plan && ps.plan.days ? ps.plan.days.filter(function (d) { return d.tpl !== 'rec'; }).length : 0; }

  /* ---------------- «Сегодня»: one next action ---------------- */
  function card(cls, icon, title, sub, body) {
    return '<section class="card v9-next ' + cls + '"><div class="v9-next-head"><span class="v9-next-ic" aria-hidden="true">' + icon + '</span><div class="grow"><h2>' + title + '</h2>' +
      (sub ? '<p class="muted small">' + sub + '</p>' : '') + '</div></div>' + (body || '') + '</section>';
  }
  var TASKS = {
    sleep: function () {
      if (!goalOn('sleep') || val('sleep', key(addD(today0(), -1))) !== null) return null;
      var v9s = window.V9Sleep;
      return card('v9-t-sleep', '🌙', 'Сколько спал?', 'Прошлая ночь ещё не записана',
        (v9s ? v9s.quickHtml() : '') +
        '<div class="v9-chips">' + [6, 7, 7.5, 8, 9].map(function (h) { return '<button type="button" class="chip" data-v9="sleep" data-v="' + h + '">' + num(h) + ' ч</button>'; }).join('') + '</div>');
    },
    workout: function () {
      if (!goalOn('workout')) return null;
      var p = plannedToday(), hr = new Date().getHours();
      if (!p || workoutDoneToday() || hr >= 22 || hr < 5) return null;
      if (window.HistoryModule && window.HistoryModule.isLive()) return null;   // the live banner is shown instead
      return card('v9-t-wk', '🏋️', 'Сегодня по плану: ' + esc(p.title), (p.min ? '≈ ' + p.min + ' мин · ' : '') + p.day.items.filter(function (it) { return it.k !== 'w'; }).length + ' упражнений',
        '<button type="button" class="btn primary wide" data-v9="startwk" data-i="' + p.i + '">▶ Начать тренировку</button>');
    },
    water: function () {
      if (!goalOn('water')) return null;
      var g = A().settings().goals.water, v = val('water', A().todayKey()) || 0;
      if (!g || v >= g) return null;
      return card('v9-t-water', '💧', 'Вода: осталось ' + num(g - v, 0) + ' мл', 'Выпито ' + num(v, 0) + ' из ' + num(g, 0) + ' мл',
        '<div class="v9-bar"><i style="width:' + Math.round(Math.min(1, v / g) * 100) + '%"></i></div>' +
        '<div class="mcard-actions v9-water-btns"><button type="button" class="mini-btn" data-v9="water" data-v="250">+250</button><button type="button" class="mini-btn" data-v9="water" data-v="500">+500</button></div>');
    },
    jaw: function () {
      var J = window.JawModule; if (!J) return null;
      var s = J.stats(); if (!s.done || s.doneToday || s.cur > s.total || s.locked) return null;
      return card('v9-t-jaw', '💪', 'Челюсть: день ' + s.cur, '≈ ' + s.minutes + ' мин · серия ' + s.streak + ' ' + plural(s.streak, 'день', 'дня', 'дней'),
        '<a class="btn primary wide" href="#jaw">Начать день ' + s.cur + '</a>');
    },
    skin: function () {
      var Sk = window.SkinModule; if (!Sk) return null;
      var s = Sk.stats(); if (!s.anyChecks || s.doneToday >= s.reqToday) return null;
      return card('v9-t-skin', '🧴', 'Вечерний уход', 'Сегодня отмечено ' + s.doneToday + ' из ' + s.reqToday + ' шагов',
        '<a class="btn primary wide" href="#skin">Открыть уход</a>');
    },
    mood: function () {
      if (!goalOn('mood') || val('mood', A().todayKey()) !== null) return null;
      var em = ['😫', '😕', '😐', '🙂', '😄'];
      return card('v9-t-mood', '🙂', 'Как настроение?', 'Одно нажатие — и день отмечен',
        '<div class="mood-row v9-mood">' + em.map(function (e, i) { return '<button type="button" data-v9="mood" data-v="' + (i + 1) + '">' + e + '</button>'; }).join('') + '</div>');
    }
  };
  function nextTask() {
    var hr = new Date().getHours(), order;
    if (hr >= 4 && hr < 12) order = ['sleep', 'workout', 'water', 'mood'];
    else if (hr >= 12 && hr < 18) order = ['workout', 'water', 'sleep', 'mood'];
    else order = ['workout', 'jaw', 'skin', 'water', 'mood', 'sleep'];
    for (var i = 0; i < order.length; i++) { var h = TASKS[order[i]](); if (h) return { id: order[i], html: h }; }
    return { id: 'done', html: card('v9-t-done', '✨', 'На сегодня всё отмечено', 'Отличная работа. Загляни в «Тренды» или «Итоги недели».', '<a class="btn wide" href="#week">📊 Итоги недели</a>') };
  }

  /* ---------------- quiet suggestion cards (one at a time) ---------------- */
  function canPrompt() { var b = document.getElementById('installBtn'); return !!(b && !b.hidden); }   // app.js keeps the beforeinstallprompt event
  function standalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function backupDue() {
    var n = recordsCount(), now = Date.now();
    if (n < 20) return false;
    if ((P.backup.snooze || 0) > now) return false;
    return !(P.backup.last && now - P.backup.last < 7 * DAY);
  }
  function installDue() { return !standalone() && !((P.install.snooze || 0) > Date.now()) && (recordsCount() >= 3 || Date.now() - P.first > DAY); }
  function weeklyDue() {
    var d = new Date(), wd = d.getDay(), mon = key(mondayOf(today0()));
    if (!(wd === 0 && d.getHours() >= 12) && wd !== 1) return false;
    var wk = wd === 1 ? key(addD(mondayOf(today0()), -7)) : mon;
    return P.weekly.seen !== wk && recordsCount() >= 5;
  }
  function installText() {
    if (isIOS()) return 'В Safari нажми <b>Поделиться</b> <span aria-hidden="true">⎙</span> → <b>На экран «Домой»</b>. Важно: если сайт не открывать 7 дней, Safari может сам удалить его данные. Приложение с экрана «Домой» так не делает.';
    return 'Приложение с экрана «Домой» открывается без адресной строки и работает офлайн. Браузер реже чистит данные установленных приложений.';
  }
  function suggestion() {
    if (backupDue()) {
      return '<section class="card v9-sug v9-backup"><button type="button" class="v9-x" data-v9="snooze-backup" aria-label="Позже">✕</button><div class="v9-next-head"><span class="v9-next-ic" aria-hidden="true">💾</span><div class="grow"><h2>Скачать копию данных</h2>' +
        '<p class="muted small">Записи хранятся только в этом браузере, синхронизации нет. Файл копии можно загрузить обратно через «Профиль → Импорт».</p></div></div>' +
        '<button type="button" class="btn primary wide" data-action="download">Скачать копию</button></section>';
    }
    if (installDue() && (isIOS() || canPrompt())) {
      return '<section class="card v9-sug v9-install"><button type="button" class="v9-x" data-v9="snooze-install" aria-label="Позже">✕</button><div class="v9-next-head"><span class="v9-next-ic" aria-hidden="true">📲</span><div class="grow"><h2>Установи на экран «Домой»</h2>' +
        '<p class="muted small">' + installText() + '</p></div></div>' + (canPrompt() ? '<button type="button" class="btn primary wide" data-v9="install">Установить</button>' : '') + '</section>';
    }
    if (weeklyDue()) {
      return '<section class="card v9-sug v9-weekly-sug"><button type="button" class="v9-x" data-v9="snooze-week" aria-label="Скрыть">✕</button><div class="v9-next-head"><span class="v9-next-ic" aria-hidden="true">📊</span><div class="grow"><h2>Итоги недели готовы</h2>' +
        '<p class="muted small">Сон, вес, тренировки, питание и настроение за неделю — на одном экране.</p></div></div><a class="btn primary wide" href="#week">Посмотреть</a></section>';
    }
    return '';
  }
  function renderTodayTop() {
    var box = document.getElementById('v9Top'); if (!box || !A()) return;
    box.innerHTML = nextTask().html + suggestion();
    // promo cards disappear after the section was visited once
    document.querySelectorAll('#view-today [data-promo]').forEach(function (a) { a.hidden = !!(P.promosOff || P.seen[a.getAttribute('data-promo')]); });
    var any = Array.prototype.some.call(document.querySelectorAll('#view-today [data-promo]'), function (a) { return !a.hidden; });
    var off = document.getElementById('v9PromosOff'); if (off) off.hidden = !any;
  }
  function markSeen(view) {
    var map = { ai: 'ai', workouts: 'workouts', food: 'food', jaw: 'jaw', skin: 'skin', history: 'workouts' };
    if (map[view] && !P.seen[map[view]]) { P.seen[map[view]] = 1; save(); }
    if (view === 'week') { var d = new Date(), mon = mondayOf(today0()); P.weekly.seen = key(d.getDay() === 0 ? mon : addD(mon, -7)); save(); }
  }

  /* ---------------- «Итоги недели» (free, computed on the device) ---------------- */
  var weekOff = null;   // monday key being shown
  function defaultWeek() { var d = new Date(), mon = mondayOf(today0()); return key(d.getDay() === 0 ? mon : addD(mon, -7)); }
  function weekStats(monK) {
    var a = A(), mon = pkey(monK), ks = [], s = a.settings();
    for (var i = 0; i < 7; i++) ks.push(key(addD(mon, i)));
    var pick = function (id) { return ks.map(function (k) { return val(id, k); }).filter(function (v) { return v !== null; }); };
    var sleep = pick('sleep'), water = pick('water'), steps = pick('steps'), mood = pick('mood');
    var wks = window.HistoryModule ? window.HistoryModule.workoutsBetween(ks[0], ks[6]) : [];
    // a training day = a finished workout in the history OR minutes logged in «Тренировка»
    var wkDays = ks.filter(function (k) { return (val('workout', k) || 0) > 0 || wks.some(function (w) { return w.date === k; }); }).length;
    var kg = a.kcalGoal ? a.kcalGoal() : null;
    var wkMin = ks.reduce(function (n, k) { return n + (val('workout', k) || 0); }, 0);
    var kc = [], prot = [];
    ks.forEach(function (k) { var f = a.food()[k]; if (f && f.length) { var t = a.foodTotals(k); kc.push(t.kcal); prot.push(t.p); } });
    // weight: last value in the week vs the last value before it (or the first in the week)
    var wAll = Object.keys(a.data().weight || {}).sort(), wIn = wAll.filter(function (k) { return k >= ks[0] && k <= ks[6]; }), wBefore = wAll.filter(function (k) { return k < ks[0]; });
    var wEnd = wIn.length ? a.data().weight[wIn[wIn.length - 1]] : null;
    var wStart = wBefore.length ? a.data().weight[wBefore[wBefore.length - 1]] : (wIn.length > 1 ? a.data().weight[wIn[0]] : null);
    var moodBest = null; ks.forEach(function (k) { var m = val('mood', k); if (m !== null && (!moodBest || m > moodBest.v)) moodBest = { k: k, v: m }; });
    return {
      mon: ks[0], sun: ks[6], days: ks,
      sleep: { avg: avg(sleep), n: sleep.length, goal: s.goals.sleep, met: sleep.filter(function (v) { return v >= s.goals.sleep; }).length },
      water: { avg: avg(water), n: water.length, goal: s.goals.water, met: water.filter(function (v) { return v >= s.goals.water; }).length },
      steps: { avg: avg(steps), n: steps.length, goal: s.goals.steps, met: steps.filter(function (v) { return v >= s.goals.steps; }).length },
      workouts: { done: wkDays, sessions: wks.length, min: wkMin, plan: plannedPerWeek() },
      kcal: { avg: avg(kc), n: kc.length, goal: kg ? kg.v : null, protein: avg(prot), pGoal: kg ? a.macroTargets(kg).p : null },
      weight: { end: wEnd, start: wStart, change: wEnd !== null && wStart !== null ? Math.round((wEnd - wStart) * 10) / 10 : null, n: wIn.length },
      mood: { avg: avg(mood), n: mood.length, best: moodBest }
    };
  }
  function cmp(cur, prev, d, unitTxt, goodUp) {
    if (cur === null || prev === null) return '';
    var diff = cur - prev; if (Math.abs(diff) < Math.pow(10, -(d || 0)) / 2) return '<small class="v9-cmp">как на прошлой неделе</small>';
    var good = goodUp === undefined ? null : (diff > 0) === goodUp;
    return '<small class="v9-cmp' + (good === null ? '' : good ? ' up' : ' down') + '">' + signed(diff, d) + (unitTxt || '') + ' к прошлой неделе</small>';
  }
  function tile(icon, label, value, sub) { return '<div class="v9-tile"><span class="v9-tile-l">' + icon + ' ' + label + '</span><b>' + value + '</b>' + (sub || '') + '</div>'; }
  function renderWeekView() {
    var root = document.getElementById('weekRoot'); if (!root || !A()) return;
    var monK = weekOff || defaultWeek(), w = weekStats(monK), pw = weekStats(key(addD(pkey(monK), -7)));
    var thisMon = key(mondayOf(today0())), em = ['😫', '😕', '😐', '🙂', '😄'];
    var range = fmtD(w.mon, { day: 'numeric', month: 'short' }) + ' – ' + fmtD(w.sun, { day: 'numeric', month: 'short' });
    var tiles = [];
    if (goalOn('sleep')) tiles.push(tile('🌙', 'Сон', w.sleep.avg === null ? '—' : num(w.sleep.avg) + ' ч', '<small>' + (w.sleep.n ? 'в среднем за ' + w.sleep.n + ' ' + plural(w.sleep.n, 'ночь', 'ночи', 'ночей') + ' · цель ' + num(w.sleep.goal) + ' ч — ' + w.sleep.met + ' из ' + w.sleep.n : 'нет записей') + '</small>' + (window.V9Sleep ? '<small>' + window.V9Sleep.regText(window.V9Sleep.regularity(7, w.sun)).replace('Регулярность: ', '') + '</small>' : '') + cmp(w.sleep.avg, pw.sleep.avg, 1, ' ч', true)));
    if (goalOn('weight')) tiles.push(tile('⚖️', 'Вес', w.weight.change === null ? (w.weight.end !== null ? num(w.weight.end) + ' кг' : '—') : signed(w.weight.change) + ' кг', '<small>' + (w.weight.end !== null ? 'последний замер ' + num(w.weight.end) + ' кг' : 'нет замеров за неделю') + '</small>'));
    if (goalOn('workout')) tiles.push(tile('🏋️', 'Тренировки', w.workouts.done + (w.workouts.plan ? ' из ' + w.workouts.plan : ''), '<small>' + (w.workouts.plan ? 'по плану ' + w.workouts.plan + ' в неделю' : 'плана нет') + (w.workouts.min ? ' · ' + num(w.workouts.min, 0) + ' мин' : '') + '</small>' + cmp(w.workouts.done, pw.workouts.done, 0, '', true)));
    tiles.push(tile('🍽', 'Питание', w.kcal.avg === null ? '—' : num(w.kcal.avg, 0) + ' ккал', '<small>' + (w.kcal.n ? 'в среднем за ' + w.kcal.n + ' ' + plural(w.kcal.n, 'день', 'дня', 'дней') + ' с записями' + (w.kcal.goal ? ' · цель ' + num(w.kcal.goal, 0) : '') + (w.kcal.protein !== null ? ' · белок ' + num(w.kcal.protein, 0) + (w.kcal.pGoal ? '/' + num(w.kcal.pGoal, 0) : '') + ' г' : '') : 'дневник пуст') + '</small>' + cmp(w.kcal.avg, pw.kcal.avg, 0, ' ккал')));
    if (goalOn('mood')) tiles.push(tile('🙂', 'Настроение', w.mood.avg === null ? '—' : em[Math.max(0, Math.min(4, Math.round(w.mood.avg) - 1))] + ' ' + num(w.mood.avg), '<small>' + (w.mood.n ? w.mood.n + ' ' + plural(w.mood.n, 'отметка', 'отметки', 'отметок') + (w.mood.best ? ' · лучший день — ' + fmtD(w.mood.best.k, { weekday: 'long' }) : '') : 'нет отметок') + '</small>' + cmp(w.mood.avg, pw.mood.avg, 1, '', true)));
    if (goalOn('water')) tiles.push(tile('💧', 'Вода', w.water.avg === null ? '—' : num(w.water.avg, 0) + ' мл', '<small>' + (w.water.n ? 'цель выполнена ' + w.water.met + ' из ' + w.water.n : 'нет записей') + '</small>'));
    if (goalOn('steps')) tiles.push(tile('👟', 'Шаги', w.steps.avg === null ? '—' : num(w.steps.avg, 0), '<small>' + (w.steps.n ? 'в среднем · цель выполнена ' + w.steps.met + ' из ' + w.steps.n : 'нет записей') + '</small>'));
    var extra = window.V9Insights ? window.V9Insights.weekHtml(w) : '';
    root.innerHTML = '<header class="top top-back"><a class="icon-btn" href="#today" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>' +
      '<div class="grow"><h1 class="title">Итоги недели</h1><div class="subtitle">' + range + (w.mon === thisMon ? ' · эта неделя' : '') + '</div></div></header>' +
      '<div class="v9-weeknav"><button type="button" class="btn small" data-v9="week" data-d="-7">← Раньше</button>' +
      (w.mon < thisMon ? '<button type="button" class="btn small" data-v9="week" data-d="7">Позже →</button>' : '') + '</div>' +
      '<section class="card"><div class="v9-tiles">' + tiles.join('') + '</div><p class="muted small">Посчитано на этом устройстве по твоим записям. Без оценок «хорошо/плохо» — просто цифры.</p></section>' + extra +
      '<section class="card v9-ai-week"><div class="card-head"><h2>Комментарий ИИ</h2>' + (isPro() ? '' : '<span class="pro-tag">Pro</span>') + '</div>' +
      '<p class="muted small">ИИ-ассистент посмотрит на эти цифры и подскажет, на что обратить внимание. Экран итогов от этого не меняется.</p>' +
      (isPro() ? '<button type="button" class="btn wide" data-v9="ai-week">💬 Обсудить итоги с ИИ</button>' : '<a class="btn primary wide" href="#buy/ai">Открыть Про</a>') + '</section>';
  }
  function weekText(w) {
    var em = function (v) { return v === null ? 'нет данных' : num(v); };
    return 'Итоги недели ' + fmtD(w.mon) + ' – ' + fmtD(w.sun) + ': сон в среднем ' + em(w.sleep.avg) + ' ч (' + w.sleep.n + ' ночей, цель ' + num(w.sleep.goal) + '); ' +
      'вес ' + (w.weight.change === null ? 'без изменений/нет данных' : signed(w.weight.change) + ' кг') + '; тренировок ' + w.workouts.done + (w.workouts.plan ? ' из ' + w.workouts.plan + ' по плану' : '') + '; ' +
      'калории в среднем ' + (w.kcal.avg === null ? 'нет данных' : num(w.kcal.avg, 0)) + (w.kcal.goal ? ' при цели ' + num(w.kcal.goal, 0) : '') + '; настроение ' + em(w.mood.avg) + ' из 5.' +
      (window.V9Insights ? ' ' + window.V9Insights.text().replace(/\n/g, ' ') : '');
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-v9]'); if (!b || !A()) return;
    var act = b.getAttribute('data-v9'), v = Number(b.getAttribute('data-v'));
    if (act === 'sleep') { A().setMetric('sleep', key(addD(today0(), -1)), v); A().toast('🌙 Сон: ' + num(v) + ' ч'); A().rerender(); }
    else if (act === 'water') { var k = A().todayKey(), nv = Math.min(10000, (val('water', k) || 0) + v); A().setMetric('water', k, nv); A().toast('💧 ' + num(nv, 0) + ' мл'); A().rerender(); }
    else if (act === 'mood') { A().setMetric('mood', A().todayKey(), v); A().rerender(); }
    else if (act === 'startwk') { if (window.HistoryModule) window.HistoryModule.startPlanDay(Number(b.getAttribute('data-i'))); }
    else if (act === 'snooze-backup') { P.backup.snooze = Date.now() + 7 * DAY; save(); renderTodayTop(); }
    else if (act === 'snooze-install') { P.install.snooze = Date.now() + 14 * DAY; save(); renderTodayTop(); }
    else if (act === 'snooze-week') { P.weekly.seen = defaultWeek(); save(); renderTodayTop(); }
    else if (act === 'install') { var ib = document.getElementById('installBtn'); if (ib && !ib.hidden) { ib.click(); P.install.snooze = Date.now() + 14 * DAY; save(); setTimeout(renderTodayTop, 500); } }
    else if (act === 'promos-off') { P.promosOff = true; save(); renderTodayTop(); }
    else if (act === 'week') { weekOff = key(addD(pkey(weekOff || defaultWeek()), Number(b.getAttribute('data-d')))); if (weekOff > key(mondayOf(today0()))) weekOff = key(mondayOf(today0())); renderWeekView(); }
    else if (act === 'ai-week') { var w = weekStats(weekOff || defaultWeek()); location.hash = '#ai'; setTimeout(function () { if (window.AIModule) window.AIModule.ask('Прокомментируй мои итоги недели и подскажи 2–3 конкретных шага. ' + weekText(w)); }, 300); }
    else if (act === 'goal-on') { setGoalOn(b.getAttribute('data-id'), b.getAttribute('aria-checked') !== 'true'); A().rerender(); }
  });

  /* ---------------- backup registry: each v9 part adds its own data to the JSON copy ---------------- */
  var EXP = {};
  function register(name, o) { EXP[name] = o; }   // o: { exp(opts) -> value|Promise, imp(value), count(value) -> n }
  register('prefs', { exp: function () { var o = JSON.parse(JSON.stringify(P)); delete o.install; return o; }, count: function () { return 0; },
    imp: function (o) {
      if (!o || typeof o !== 'object') return;
      if (o.goalsOn && typeof o.goalsOn === 'object') METRIC_IDS.forEach(function (id) { if (o.goalsOn[id] === false) P.goalsOn[id] = false; });
      if (o.seen && typeof o.seen === 'object') Object.keys(o.seen).forEach(function (k) { if (/^(ai|workouts|food|jaw|skin)$/.test(k)) P.seen[k] = 1; });
      if (o.remind && typeof o.remind === 'object' && !P.remind) P.remind = o.remind;
      save();
    } });
  function exportAll(opts) {
    var out = {}, names = Object.keys(EXP);
    return Promise.all(names.map(function (k) { try { return Promise.resolve(EXP[k].exp(opts || {})).catch(function () { return undefined; }); } catch (e) { return undefined; } }))
      .then(function (vals) { names.forEach(function (k, i) { if (vals[i] !== undefined && vals[i] !== null) out[k] = vals[i]; }); return out; });
  }
  function countAll(o) { var n = 0; if (!o || typeof o !== 'object') return 0; Object.keys(EXP).forEach(function (k) { if (o[k] !== undefined) { try { n += EXP[k].count(o[k]) || 0; } catch (e) { /* bad part */ } } }); return n; }
  function importAll(o) { if (!o || typeof o !== 'object') return; Object.keys(EXP).forEach(function (k) { if (o[k] !== undefined) { try { EXP[k].imp(o[k]); } catch (e) { /* bad part */ } } }); }
  function backupNote() {
    var n = recordsCount();
    if (P.backup.last) return 'Последняя копия: ' + new Date(P.backup.last).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + '. Записей сейчас: ' + n + '.';
    return n ? 'Копию ещё не скачивали. Записей: ' + n + '.' : '';
  }

  window.V9 = {
    P: function () { return P; }, save: save,
    goalOn: goalOn, setGoalOn: setGoalOn, enabledMetrics: enabledMetrics, NAMES: NAMES,
    renderTodayTop: renderTodayTop, nextTask: nextTask, markSeen: markSeen, recordsCount: recordsCount,
    backupDone: function () { P.backup.last = Date.now(); P.backup.snooze = 0; save(); },
    renderWeek: renderWeekView, weekStats: weekStats, weekText: weekText, defaultWeek: defaultWeek, plannedToday: plannedToday,
    standalone: standalone, isIOS: isIOS, installText: installText,
    register: register, exportAll: exportAll, countAll: countAll, importAll: importAll, backupNote: backupNote,
    util: { key: key, pkey: pkey, addD: addD, today0: today0, mondayOf: mondayOf, num: num, signed: signed, plural: plural, esc: esc, avg: avg, fmtD: fmtD, val: val, isPro: isPro }
  };
})();
