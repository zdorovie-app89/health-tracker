/* «Челюсть 30 дней» — UI module for the Health PWA (view #jaw).
 * Routes: #jaw (обзор) · #jaw/plan · #jaw/tips · #jaw/progress · #jaw/workout/<day>
 * Storage: localStorage 'health.jaw.v1' -> { completed: {day: "YYYY-MM-DD"}, habits: {"YYYY-MM-DD": {id: true}},
 *          photos: {1|7|30: true}, sound: bool, tick: bool }
 * app.js calls JawModule.render() when the #jaw view is shown and JawModule.leave() when another view opens. */
(function () {
  'use strict';
  var D = window.JAW_DATA;
  if (!D) return;
  var EX = D.EX, PLAN = D.PLAN, LIGHT = D.LIGHT, TIPS = D.TIPS, HABITS = D.HABITS, TOTAL = D.TOTAL, fig = D.fig;
  var KEY = 'health.jaw.v1';
  var REST = 10;

  /* ---------------- storage ---------------- */
  function defaults() { return { completed: {}, habits: {}, photos: {}, sound: true, tick: true }; }
  function load() {
    var d = defaults();
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        ['completed', 'habits', 'photos'].forEach(function (k) { if (s[k] && typeof s[k] === 'object') d[k] = s[k]; });
        if (typeof s.sound === 'boolean') d.sound = s.sound;
        if (typeof s.tick === 'boolean') d.tick = s.tick;
      }
    } catch (e) { /* ignore */ }
    return d;
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  /* ---------------- helpers ---------------- */
  function $(s) { return document.querySelector(s); }
  function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtDate(k) { var p = String(k || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] : ''; }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
  function doneCount() { var n = 0; for (var i = 1; i <= TOTAL; i++) if (S.completed[i]) n++; return n; }
  function curDay() { for (var i = 1; i <= TOTAL; i++) if (!S.completed[i]) return i; return TOTAL + 1; }
  function doneToday() { var t = dkey(); for (var i = 1; i <= TOTAL; i++) if (S.completed[i] === t) return true; return false; }
  function streakOf(set) {
    var d = new Date(); d.setHours(12, 0, 0, 0);
    if (!set[dkey(d)]) { d.setDate(d.getDate() - 1); if (!set[dkey(d)]) return 0; }
    var n = 0; while (set[dkey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function streak() { var set = {}; for (var i = 1; i <= TOTAL; i++) if (S.completed[i]) set[S.completed[i]] = 1; return streakOf(set); }
  function habitCount(k) { var h = S.habits[k] || {}; return HABITS.filter(function (x) { return h[x.id]; }).length; }
  function habitStreak() { var set = {}; Object.keys(S.habits).forEach(function (k) { if (habitCount(k) >= 5) set[k] = 1; }); return streakOf(set); }
  function weekOf(day) { for (var i = 0; i < D.WEEKS.length; i++) if (day >= D.WEEKS[i].from && day <= D.WEEKS[i].to) return D.WEEKS[i]; return D.WEEKS[D.WEEKS.length - 1]; }
  /* v7: week 1 (days 1–7) is free, days 8–30 need Pro */
  var FREE_DAYS = 7;
  function pro() { return !window.HTPro || window.HTPro.isPro(); }
  function dayLocked(d) { return d > FREE_DAYS && !pro(); }
  function proBadge() { return window.HTPro ? window.HTPro.badge() : ''; }
  function lockBox(d) {
    return '<div class="jw-lockbox"><div><b>Дни 8–30 — в Про ' + proBadge() + '</b><small>Неделя 1 бесплатна. Дальше нагрузка растёт: недели 2–4 и финал открываются с Про.</small></div>' +
      '<a class="btn primary wide" href="#buy/jaw">Открыть всю программу</a></div>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function dose(id, day) {
    var e = EX[id], lv = D.level(day);
    if (e.type === 'info') return { type: 'info', sets: 1 };
    if (e.type === 'time') return { type: 'time', sec: Math.max(15, Math.round(e.base * lv / 5) * 5), sets: 2, rest: e.sides ? 5 : REST };
    return { type: 'reps', reps: Math.max(5, Math.round(e.base * lv)), sets: 2, tempo: e.tempo, rest: REST };
  }
  function doseText(id, d) {
    if (d.type === 'info') return 'совет · ~1 мин';
    if (d.type === 'time') return EX[id].sides ? d.sec + ' с на каждую сторону' : d.sets + ' × ' + d.sec + ' с';
    return d.sets + ' × ' + d.reps + ' повт.';
  }
  function dayItems(day) { return PLAN[day - 1].map(function (id) { return { id: id, d: dose(id, day) }; }); }
  function dayMinutes(day) {
    var t = 0;
    dayItems(day).forEach(function (it) {
      var d = it.d;
      if (d.type === 'info') t += 45;
      else if (d.type === 'time') t += d.sec * d.sets + d.rest * (d.sets - 1) + 10;
      else t += d.reps * d.tempo * d.sets + d.rest * (d.sets - 1) + 10;
    });
    return Math.max(1, Math.round(t / 60));
  }

  /* ---------------- audio (WebAudio, optional) ---------------- */
  var actx = null;
  function ensureAudio() {
    if (!actx) { try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) { /* ignore */ } }
  }
  function tone(freq, dur, vol, delay) {
    if (!S.sound || !actx) return;
    try {
      var t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { /* ignore */ }
  }
  function beepSet() { tone(660, 0.35, 0.18); }
  function beepGo() { tone(880, 0.2, 0.15); }
  function beepDone() { tone(660, 0.25, 0.18); tone(880, 0.25, 0.18, 0.22); tone(1046, 0.45, 0.18, 0.44); }
  function tickSnd() { if (S.tick) tone(1200, 0.06, 0.05); }

  /* ---------------- routing inside the view ---------------- */
  function sub() {
    var p = (location.hash || '').replace(/^#/, '').split('/');
    if (p[0] !== 'jaw') return { name: 'home' };
    if (p[1] === 'workout') { var d = parseInt(p[2], 10); if (!(d >= 1 && d <= TOTAL)) d = Math.min(curDay(), TOTAL); return { name: 'workout', day: d }; }
    return { name: ['plan', 'tips', 'progress'].indexOf(p[1]) >= 0 ? p[1] : 'home' };
  }
  function nav(h) { if (location.hash === '#' + h) render(); else location.hash = '#' + h; }
  var lastSub = '', openDay = 0;

  function faceSwitch() {
    return '<div class="seg fc-seg" role="tablist"><a class="seg-btn active" href="#jaw">💪 Челюсть 30 дней</a><a class="seg-btn" href="#skin">🧴 Уход за кожей</a></div>';
  }
  function jawTabs(active) {
    var t = [['home', 'Обзор', '#jaw'], ['plan', 'План', '#jaw/plan'], ['tips', 'Советы', '#jaw/tips'], ['progress', 'Прогресс', '#jaw/progress']];
    return '<div class="seg seg-full jw-tabs">' + t.map(function (x) { return '<a class="seg-btn' + (x[0] === active ? ' active' : '') + '" href="' + x[2] + '">' + x[1] + '</a>'; }).join('') + '</div>';
  }
  function header(active) {
    return '<header class="top"><div><h1 class="title">Челюсть 30 дней</h1><div class="subtitle">Осанка, шея, лицо и привычки · 10–15 минут в день</div></div></header>' +
      faceSwitch() + jawTabs(active);
  }

  function exRows(day) {
    return '<ul class="jw-exlist">' + dayItems(day).map(function (it, i) {
      var e = EX[it.id];
      return '<li class="jw-exrow"><div class="jw-thumb">' + fig(e.fig, e.name) + '</div><div class="grow"><div class="jw-nm">' + e.name +
        '</div><div class="jw-ds">' + doseText(it.id, it.d) + '</div></div><span class="jw-num">' + (i + 1) + '</span></li>';
    }).join('') + '</ul>';
  }
  function bar(pct) { return '<div class="bar jw-bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>'; }

  /* ---------------- Overview ---------------- */
  function habitsCard() {
    var k = dkey(), h = S.habits[k] || {}, n = habitCount(k), hs = habitStreak(), cd = Math.min(curDay(), TOTAL);
    return '<section class="card jw-habits"><div class="card-head"><h2>' + (cd <= 7 ? '⚡ Быстрые победы недели 1' : 'Привычки дня') + '</h2><span class="jw-pill">' + n + '/' + HABITS.length + '</span></div>' +
      '<p class="muted small">Самое быстрое, что честно видно в зеркале: меньше отёков и голова над плечами. День засчитывается от 5 из 7. Серия: 🔥 ' + hs + ' ' + plural(hs, 'день', 'дня', 'дней') + '.</p>' +
      HABITS.map(function (x) {
        return '<label class="jw-check' + (h[x.id] ? ' on' : '') + '"><input type="checkbox" data-habit="' + x.id + '"' + (h[x.id] ? ' checked' : '') + '>' +
          '<span class="jw-ci">' + x.ic + '</span><span class="grow"><b>' + x.t + '</b><small>' + x.s + '</small></span><span class="jw-tick" aria-hidden="true"></span></label>';
      }).join('') + '</section>';
  }
  function photoBanner(day) {
    if (D.PHOTO_DAYS.indexOf(day) < 0 || S.photos[day]) return '';
    return '<div class="jw-photo-banner">📸 <div class="grow"><b>Сегодня фото-чекпоинт (день ' + day + ')</b><small>Фото в профиль: тот же свет, ракурс и расстояние, лицо расслаблено, утром.</small></div>' +
      '<button class="btn small" data-photo="' + day + '">Сделал ✓</button></div>';
  }
  function renderHome(root) {
    var cd = curDay(), dc = doneCount(), st = streak(), fin = cd > TOTAL, d = Math.min(cd, TOTAL), wk = weekOf(d);
    var tip = TIPS[d - 1];
    var today;
    if (fin) {
      today = '<section class="card"><div class="card-head"><h2>Программа завершена 🎉</h2></div><p class="muted small">Все 30 дней выполнены. Сравни фото дней 1, 7 и 30 при одинаковом свете. ' +
        'Чтобы эффект сохранился — оставь привычки и 2–3 короткие тренировки в неделю. Для более заметной линии челюсти главное — постепенно снижать процент жира.</p>' +
        '<a class="btn primary big" href="#jaw/workout/30">Повторить день 30</a></section>';
    } else if (dayLocked(d)) {
      today = '<section class="card"><div class="card-head"><h2>Сегодня: день ' + d + '</h2>' + proBadge() + '</div>' +
        '<div class="jw-note">✓ Неделя 1 пройдена — отличный старт! Можно повторять дни 1–7 бесплатно или открыть всю программу.</div>' + lockBox(d) +
        '<a class="btn wide" href="#jaw/workout/' + FREE_DAYS + '">↻ Повторить день ' + FREE_DAYS + '</a></section>';
    } else {
      today = '<section class="card"><div class="card-head"><h2>Сегодня: день ' + d + '</h2><span class="jw-pill' + (LIGHT[d] ? ' light' : '') + '">' + (LIGHT[d] || '≈ ' + dayMinutes(d) + ' мин') + '</span></div>' +
        (doneToday() ? '<div class="jw-note">✓ Сегодня тренировка уже сделана. Мышцам нужен отдых — следующий день лучше начать завтра (но можно и сейчас).</div>' : '') +
        exRows(d) + '<a class="btn primary big" href="#jaw/workout/' + d + '">▶ Начать тренировку</a></section>';
    }
    root.innerHTML = header('home') +
      '<section class="card jw-hero"><div class="jw-hero-fig">' + fig('chintuck', '') + '</div>' +
      '<div class="jw-week">Неделя ' + wk.n + ' из 4 · <b>' + wk.title + '</b></div><p class="muted small jw-hero-sub">' + wk.sub + '</p>' +
      '<div class="jw-stats"><div class="stat"><div class="stat-val">' + (fin ? TOTAL : d) + '<small>/ ' + TOTAL + '</small></div><div class="stat-lbl">текущий день</div></div>' +
      '<div class="stat"><div class="stat-val">🔥 ' + st + '</div><div class="stat-lbl">' + plural(st, 'день', 'дня', 'дней') + ' подряд</div></div>' +
      '<div class="stat"><div class="stat-val">' + dc + '<small>✓</small></div><div class="stat-lbl">выполнено</div></div></div>' +
      '<div class="progress-row jw-prow"><span>Прогресс программы</span><span>' + Math.round(dc / TOTAL * 100) + '%</span></div>' + bar(dc / TOTAL * 100) + '</section>' +
      '<div class="jw-disc"><b>⚠ Честно о результате.</b> За первую неделю заметнее всего уменьшаются <b>отёки</b> и выравнивается <b>осанка</b> — в профиль это уже видно. ' +
      'Настоящая чёткость линии челюсти требует больше времени и в основном зависит от процента жира в теле и генетики. ' +
      'Если упражнение вызывает боль или щелчки в челюсти (ВНЧС) — прекрати его и обратись к врачу.</div>' +
      photoBanner(fin ? 30 : d) + today + habitsCard() +
      '<section class="card jw-tipcard"><div class="card-head"><h2>Совет дня</h2><a class="pill-link" href="#jaw/tips">Все советы</a></div>' +
      '<div class="jw-tiprow"><span class="jw-tipic">' + tip.ic + '</span><div><b>' + tip.t + '</b><p class="muted small">' + tip.p + '</p></div></div></section>';
  }

  /* ---------------- Plan ---------------- */
  function exCard(id) {
    var e = EX[id];
    return '<section class="card jw-excard" id="jw-ex-' + id + '"><div class="jw-figwrap ex-illu"><img src="img/jaw/' + id + '.svg?v=7" alt="' + esc(e.name) + '" loading="lazy" decoding="async" width="240" height="180"></div>' +
      '<h3>' + e.name + '</h3><p class="muted small">' + e.desc + '</p>' +
      '<div class="jw-lbl">Как делать</div><ol>' + e.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '<div class="jw-lbl err">Частые ошибки</div><ul>' + e.mistakes.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>' +
      (e.warn ? '<div class="jw-warn">⚠ ' + e.warn + '</div>' : '') + '</section>';
  }
  function renderPlan(root) {
    var cd = curDay(), html = '';
    D.WEEKS.forEach(function (w) {
      html += '<div class="jw-weekhead"><b>Неделя ' + w.n + ' · ' + w.title + (w.from > FREE_DAYS && !pro() ? ' ' + proBadge() : '') + '</b><span class="muted small">дни ' + w.from + '–' + w.to + ' · ' + w.sub + '</span></div><div class="jw-days">';
      for (var d = w.from; d <= w.to; d++) {
        var done = !!S.completed[d], open = openDay ? openDay === d : d === Math.min(cd, dayLocked(cd) ? FREE_DAYS : TOTAL);
        var photo = D.PHOTO_DAYS.indexOf(d) >= 0;
        html += '<details class="jw-day' + (done ? ' is-done' : '') + (d === cd ? ' is-cur' : '') + '"' + (open ? ' open' : '') + ' id="jw-day-' + d + '">' +
          '<summary><span class="jw-dnum">' + (done ? '✓' : d) + '</span><span class="grow"><b>День ' + d + '</b>' + (photo ? ' 📸' : '') +
          '<small>' + PLAN[d - 1].length + ' ' + plural(PLAN[d - 1].length, 'пункт', 'пункта', 'пунктов') + ' · ≈ ' + dayMinutes(d) + ' мин' +
          (LIGHT[d] ? ' · ' + LIGHT[d] : '') + (done ? ' · выполнен ' + fmtDate(S.completed[d]) : '') + '</small></span>' + (dayLocked(d) ? proBadge() : '') + '<span class="jw-chev">›</span></summary>' +
          '<div class="jw-daybody">' + (dayLocked(d) ? lockBox(d) : exRows(d) + '<a class="btn ' + (done ? '' : 'primary') + ' wide" href="#jaw/workout/' + d + '">' + (done ? '↻ Повторить день ' + d : '▶ Начать день ' + d) + '</a>') + '</div></details>';
      }
      html += '</div>';
    });
    root.innerHTML = header('plan') +
      '<p class="muted small jw-intro">Нагрузка растёт постепенно (+4% в день). Дни 7, 14, 21 и 28 — лёгкие, 📸 — фото-чекпоинты (дни 1, 7, 30).</p>' + html +
      '<div class="jw-weekhead" style="margin-top:22px"><b>Все упражнения</b><span class="muted small">Техника и частые ошибки</span></div>' +
      '<div class="jw-exgrid">' + Object.keys(EX).map(exCard).join('') + '</div>';
    if (openDay) { var el = document.getElementById('jw-day-' + openDay); openDay = 0; if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80); }
  }

  /* ---------------- Tips ---------------- */
  function renderTips(root) {
    var cd = Math.min(curDay(), TOTAL), t = TIPS[cd - 1];
    root.innerHTML = header('tips') +
      '<section class="card jw-tipcard today"><div class="card-head"><h2>Совет на сегодня · день ' + cd + '</h2></div>' +
      '<div class="jw-tiprow"><span class="jw-tipic big">' + t.ic + '</span><div><b>' + t.t + '</b><p class="muted small">' + t.p + '</p></div></div></section>' +
      '<div class="jw-tips">' + TIPS.map(function (x, i) {
        return '<div class="jw-tip' + (i === cd - 1 ? ' today' : '') + '"><span class="jw-tipic">' + x.ic + '</span><div><small>День ' + (i + 1) + '</small><b>' + x.t + '</b><p class="muted small">' + x.p + '</p></div></div>';
      }).join('') + '</div>';
  }

  /* ---------------- Progress ---------------- */
  function renderProgress(root) {
    var cd = curDay(), dc = doneCount(), st = streak(), cells = '';
    for (var d = 1; d <= TOTAL; d++) {
      var done = S.completed[d];
      cells += '<button type="button" class="jw-cell' + (done ? ' done' : '') + (d === cd ? ' cur' : '') + (LIGHT[d] ? ' light' : '') + (dayLocked(d) ? ' locked' : '') + '" data-day="' + d + '" title="День ' + d + (dayLocked(d) ? ' · Про' : '') + '">' +
        (D.PHOTO_DAYS.indexOf(d) >= 0 ? '<span class="jw-cam">📸</span>' : '') + '<b>' + (done ? '✓' : d) + '</b><small>' + (done ? fmtDate(done) : (d === cd ? 'сегодня' : '')) + '</small></button>';
    }
    var last7 = '', dd = new Date(); dd.setHours(12, 0, 0, 0); dd.setDate(dd.getDate() - 6);
    for (var i = 0; i < 7; i++) {
      var k = dkey(dd), n = habitCount(k);
      last7 += '<div class="jw-h7"><i style="height:' + Math.round(n / HABITS.length * 100) + '%"></i><small>' + ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][dd.getDay()] + '</small></div>';
      dd.setDate(dd.getDate() + 1);
    }
    root.innerHTML = header('progress') +
      '<section class="card"><div class="card-head"><h2>Календарь</h2><span class="jw-pill">' + dc + ' из ' + TOTAL + '</span></div>' +
      '<div class="jw-cal">' + cells + '</div>' +
      '<div class="jw-legend"><span><i class="l-done"></i>выполнен</span><span><i class="l-cur"></i>текущий</span><span><i class="l-light"></i>лёгкий день</span><span>📸 фото</span></div>' +
      '<div class="progress-row jw-prow"><span>🔥 Серия: ' + st + ' ' + plural(st, 'день', 'дня', 'дней') + '</span><span>' + Math.round(dc / TOTAL * 100) + '%</span></div>' + bar(dc / TOTAL * 100) + '</section>' +
      '<section class="card"><div class="card-head"><h2>📸 Фото-чекпоинты</h2></div>' +
      '<p class="muted small">Фото в профиль при одинаковом свете, ракурсе и расстоянии, с расслабленным лицом, утром. Камера приложению не нужна — просто отметь.</p>' +
      [[1, 'Фото дня 1 — старт'], [7, 'Фото дня 7 — меньше отёков, ровнее осанка?'], [30, 'Фото дня 30 — итог']].map(function (p) {
        return '<label class="jw-check' + (S.photos[p[0]] ? ' on' : '') + '"><input type="checkbox" data-photo-chk="' + p[0] + '"' + (S.photos[p[0]] ? ' checked' : '') + '><span class="jw-ci">📸</span><span class="grow"><b>' + p[1] + '</b></span><span class="jw-tick" aria-hidden="true"></span></label>';
      }).join('') + '</section>' +
      '<section class="card"><div class="card-head"><h2>Привычки · 7 дней</h2><span class="jw-pill">🔥 ' + habitStreak() + '</span></div><div class="jw-h7row">' + last7 + '</div></section>' +
      '<section class="card"><div class="card-head"><h2>Настройки</h2></div>' +
      '<label class="jw-check' + (S.sound ? ' on' : '') + '"><input type="checkbox" id="jwSnd"' + (S.sound ? ' checked' : '') + '><span class="jw-ci">🔔</span><span class="grow"><b>Звуковой сигнал в конце таймера</b></span><span class="jw-tick"></span></label>' +
      '<label class="jw-check' + (S.tick ? ' on' : '') + '"><input type="checkbox" id="jwTick"' + (S.tick ? ' checked' : '') + '><span class="jw-ci">🎵</span><span class="grow"><b>Тихий «тик» на каждый повтор</b></span><span class="jw-tick"></span></label>' +
      '<button type="button" class="btn danger wide" id="jwReset" style="margin-top:10px">Сбросить прогресс «Челюсть 30 дней»</button></section>';
  }

  /* ---------------- Workout ---------------- */
  var W = null, loop = null, wakeLock = null;
  function stopWorkout() {
    if (loop) { clearInterval(loop); loop = null; }
    if (W) W.running = false;
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
    wakeLock = null;
  }
  function requestWake() { try { if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {}); } catch (e) { /* ignore */ } }
  function cur() { return W.items[W.idx]; }
  function startWorkout(root, day) {
    if (!W || W.day !== day || !W.root || !document.body.contains(W.root.firstChild)) {
      stopWorkout();
      W = { day: day, items: dayItems(day), idx: 0, phase: 'ready', set: 1, el: 0, count: 0, running: false, last: 0, lastLeft: -1, finished: {} };
    }
    W.root = root;
    renderWorkout();
  }
  function renderWorkout() {
    var root = W.root, it = cur(), e = EX[it.id], n = W.items.length, last = W.idx === n - 1;
    var dots = W.items.map(function (x, i) { return '<i class="' + (W.finished[i] ? 'ok' : (i === W.idx ? 'on' : '')) + '"></i>'; }).join('');
    var dline = doseText(it.id, it.d) + (it.d.type === 'reps' ? ' · темп ≈ ' + it.d.tempo + ' с на повтор' : '') + (it.d.sets > 1 ? ' · отдых ' + it.d.rest + ' с' : '');
    var counter = it.d.type === 'info'
      ? '<div class="jw-info">' + e.desc + '</div>'
      : '<div class="jw-counter"><div class="jw-ring"><svg viewBox="0 0 120 120"><defs><linearGradient id="jwRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#60a5fa"/></linearGradient></defs><circle class="trk" cx="60" cy="60" r="52"/><circle class="prg" id="jwRing" cx="60" cy="60" r="52" stroke-dasharray="326.73" stroke-dashoffset="326.73"/></svg>' +
        '<div class="jw-val"><b id="jwNum">0</b><small id="jwUnit"></small></div></div>' +
        '<div class="grow"><div class="jw-phase" id="jwPhase"></div><div class="muted small" id="jwSet"></div><div class="jw-cue" id="jwCue"></div></div></div>';
    root.innerHTML =
      '<div class="jw-wtop"><a class="icon-btn" href="#jaw" id="jwExit" aria-label="Выйти"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></a>' +
      '<div class="grow jw-wtitle">День ' + W.day + ' · ' + (W.idx + 1) + ' из ' + n + '</div>' +
      '<label class="jw-snd"><input type="checkbox" id="jwWkSnd"' + (S.sound ? ' checked' : '') + '> 🔔</label></div>' +
      '<div class="jw-dots">' + dots + '</div>' +
      '<div class="jw-wgrid"><section class="card jw-anim">' + fig(e.fig, e.name) + '</section>' +
      '<section class="card jw-winfo"><h2 class="jw-wname">' + e.name + '</h2><div class="muted small jw-dose">' + dline + '</div>' + counter +
      '<div class="jw-controls"><button type="button" class="btn" id="jwPrev"' + (W.idx === 0 ? ' disabled' : '') + '>‹ Назад</button>' +
      (it.d.type === 'info' ? '<button type="button" class="btn" disabled>—</button>' : '<button type="button" class="btn primary" id="jwPlay">▶ Старт</button>') +
      '<button type="button" class="btn ' + (last ? 'primary jw-finish' : '') + '" id="jwNext">' + (last ? '✓ Готово' : 'Далее ›') + '</button></div>' +
      (e.warn ? '<div class="jw-warn">⚠ ' + e.warn + '</div>' : '') +
      '<details class="jw-howto"' + (it.d.type === 'info' ? '' : ' open') + '><summary>Как делать</summary><ol>' + e.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol></details>' +
      '<details class="jw-howto"><summary>Частые ошибки</summary><ul>' + e.mistakes.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul></details></section></div>';
    updateCounter();
  }
  function gotoEx(i) {
    if (loop) { clearInterval(loop); loop = null; }
    W.idx = i; W.phase = 'ready'; W.set = 1; W.el = 0; W.count = 0; W.running = false; W.lastLeft = -1;
    renderWorkout(); window.scrollTo(0, 0);
  }
  function togglePlay() {
    ensureAudio();
    if (W.phase === 'done') { W.phase = 'ready'; W.set = 1; W.el = 0; W.count = 0; }
    if (W.phase === 'ready') { W.phase = 'work'; beepGo(); }
    W.running = !W.running;
    if (W.running) { W.last = performance.now(); if (!loop) loop = setInterval(tick, 100); requestWake(); }
    updateCounter();
  }
  function restMs() { return cur().d.rest * 1000; }
  function tick() {
    if (!W) return;
    var now = performance.now(), dt = now - W.last; W.last = now;
    if (!W.running) return;
    W.el += dt;
    var d = cur().d;
    if (W.phase === 'work') {
      if (d.type === 'reps') {
        var c = Math.floor(W.el / (d.tempo * 1000));
        if (c > W.count) { W.count = c; if (c < d.reps) tickSnd(); }
        if (W.count >= d.reps) endSet();
      } else {
        var leftMs = d.sec * 1000 - W.el;
        if (leftMs <= 0) endSet();
        else { var left = Math.ceil(leftMs / 1000); if (left <= 3 && left !== W.lastLeft) { W.lastLeft = left; tickSnd(); } }
      }
    } else if (W.phase === 'rest') {
      if (W.el >= restMs()) { W.phase = 'work'; W.set++; W.el = 0; W.count = 0; W.lastLeft = -1; beepGo(); }
    }
    updateCounter();
  }
  function endSet() {
    var d = cur().d;
    if (W.set < d.sets) { W.phase = 'rest'; W.el = 0; beepSet(); return; }
    W.phase = 'done'; W.running = false; W.finished[W.idx] = true; beepDone();
    if (loop) { clearInterval(loop); loop = null; }
    var dots = document.querySelectorAll('.jw-dots i'); if (dots[W.idx]) dots[W.idx].className = 'ok';
    var nx = document.getElementById('jwNext'); if (nx && W.idx < W.items.length - 1) nx.className = 'btn primary';
  }
  function updateCounter() {
    if (!W) return;
    var it = cur(), d = it.d, e = EX[it.id];
    var play = document.getElementById('jwPlay');
    if (play) play.textContent = W.phase === 'done' ? '↻ Ещё раз' : (W.running ? '❚❚ Пауза' : (W.phase === 'ready' ? '▶ Старт' : '▶ Дальше'));
    if (d.type === 'info') return;
    var num = document.getElementById('jwNum'); if (!num) return;
    var unit = document.getElementById('jwUnit'), ph = document.getElementById('jwPhase'), setEl = document.getElementById('jwSet'),
      cue = document.getElementById('jwCue'), ring = document.getElementById('jwRing');
    var frac = 0, C = 326.73, sides = ['Наклон влево', 'Наклон вправо'];
    var setLbl = e.sides ? sides[W.set - 1] + ' · ' + W.set + ' из 2' : 'Подход ' + W.set + ' из ' + d.sets;
    if (W.phase === 'rest') {
      num.textContent = Math.max(0, Math.ceil((restMs() - W.el) / 1000)); unit.textContent = e.sides ? 'смена' : 'отдых';
      ph.className = 'jw-phase rest'; ph.textContent = e.sides ? 'Смени сторону' : 'Отдых';
      setEl.textContent = 'Далее: ' + (e.sides ? sides[W.set] : 'подход ' + (W.set + 1) + ' из ' + d.sets);
      cue.textContent = 'Расслабься, дыши'; frac = 1 - W.el / restMs();
    } else if (W.phase === 'done') {
      num.textContent = '✓'; unit.textContent = 'готово';
      ph.className = 'jw-phase done'; ph.textContent = 'Отлично! Упражнение выполнено';
      setEl.textContent = W.idx < W.items.length - 1 ? 'Жми «Далее»' : 'Жми «Готово», чтобы отметить день';
      cue.textContent = '🎉'; frac = 1;
    } else {
      if (d.type === 'reps') {
        var per = d.tempo * 1000, within = (W.el % per) / per, cues = e.cues || ['Выполняй'];
        num.textContent = Math.min(W.count, d.reps); unit.textContent = 'из ' + d.reps;
        frac = Math.min(1, W.el / (per * d.reps));
        var ci = cues.length === 1 ? 0 : (cues.length === 2 ? (within < 0.5 ? 0 : 1) : (within < 0.35 ? 0 : (within < 0.75 ? 1 : 2)));
        cue.textContent = W.phase === 'ready' ? 'Темп: ' + d.tempo + ' с на повтор' : cues[ci];
      } else {
        num.textContent = Math.max(0, Math.ceil((d.sec * 1000 - W.el) / 1000)); unit.textContent = 'секунд';
        frac = Math.min(1, W.el / (d.sec * 1000));
        cue.textContent = (e.cues || ['Держи'])[0];
      }
      ph.className = 'jw-phase ' + (W.phase === 'ready' ? 'ready' : 'work');
      ph.textContent = W.phase === 'ready' ? 'Нажми «Старт»' : (W.running ? 'Работаем' : 'Пауза');
      setEl.textContent = setLbl;
    }
    ring.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1));
  }
  function completeDay() {
    var day = W.day;
    if (!S.completed[day]) S.completed[day] = dkey();
    save(); stopWorkout(); ensureAudio(); beepDone();
    var dc = doneCount(), st = streak(), all = dc === TOTAL;
    var photoNext = D.PHOTO_DAYS.indexOf(day) >= 0 && !S.photos[day];
    showModal('<div class="jw-big">' + (all ? '🏆' : '🎉') + '</div><h2>' + (all ? 'Все 30 дней пройдены!' : 'День ' + day + ' выполнен!') + '</h2>' +
      '<p class="muted small">' + (all ? 'Сделай итоговое фото и сравни с днями 1 и 7. Сохрани привычки — они работают дольше любой программы.'
        : 'Выполнено ' + dc + ' из ' + TOTAL + ' · серия 🔥 ' + st + ' ' + plural(st, 'день', 'дня', 'дней') + '. Отличная работа — до завтра!') + '</p>' +
      (photoNext ? '<div class="jw-photo-banner">📸 <div class="grow"><b>Фото-чекпоинт дня ' + day + '</b><small>Профиль, тот же свет и ракурс.</small></div><button class="btn small" data-photo="' + day + '">Сделал ✓</button></div>' : '') +
      '<div class="jw-mrow"><a class="btn primary" href="#jaw" data-close-modal>К обзору</a><a class="btn" href="#jaw/progress" data-close-modal>Прогресс</a></div>');
    confetti();
  }

  /* ---------------- modal / confetti ---------------- */
  function showModal(html) {
    var m = document.getElementById('jwModal');
    if (!m) { m = document.createElement('div'); m.id = 'jwModal'; m.className = 'jw-modal'; document.body.appendChild(m); }
    m.innerHTML = '<div class="card jw-mcard">' + html + '</div>';
    m.hidden = false;
    m.onclick = function (ev) {
      if (ev.target === m || ev.target.closest('[data-close-modal]')) { m.hidden = true; }
      var p = ev.target.closest('[data-photo]');
      if (p) { S.photos[p.getAttribute('data-photo')] = true; save(); p.textContent = '✓'; p.disabled = true; }
    };
  }
  function confetti() {
    var box = document.createElement('div'); box.className = 'jw-confetti';
    var cols = ['#8b5cf6', '#a78bfa', '#3b82f6', '#60a5fa', '#c4b5fd', '#f0abfc'];
    for (var i = 0; i < 50; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100) + 'vw'; p.style.background = cols[i % cols.length];
      p.style.animationDelay = (Math.random() * 0.7) + 's'; p.style.animationDuration = (2 + Math.random() * 1.4) + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 4000);
  }

  /* ---------------- render / events ---------------- */
  function render() {
    var root = document.getElementById('jawRoot'); if (!root) return;
    var s = sub(), key = s.name + (s.day || '');
    document.body.classList.toggle('jw-in-workout', s.name === 'workout');
    if (s.name !== 'workout') { stopWorkout(); W = null; }
    if (s.name === 'workout' && dayLocked(s.day)) {
      document.body.classList.remove('jw-in-workout');
      root.innerHTML = header('plan') + (window.HTPro ? window.HTPro.lockCard('День ' + s.day + ' — в Про', 'Неделя 1 (дни 1–7) бесплатна. Дни 8–30 с растущей нагрузкой, лёгкими днями и финалом открываются в Про.', 'jaw') : '');
    }
    else if (s.name === 'workout') startWorkout(root, s.day);
    else if (s.name === 'plan') renderPlan(root);
    else if (s.name === 'tips') renderTips(root);
    else if (s.name === 'progress') renderProgress(root);
    else renderHome(root);
    if (key !== lastSub) { window.scrollTo(0, 0); lastSub = key; }
  }
  function leave() {
    stopWorkout(); W = null; lastSub = '';
    document.body.classList.remove('jw-in-workout');
    var m = document.getElementById('jwModal'); if (m) m.hidden = true;
  }

  document.addEventListener('click', function (e) {
    var root = document.getElementById('jawRoot');
    if (!root || !root.contains(e.target)) return;
    var t = e.target;
    if (t.closest('#jwPlay')) { togglePlay(); return; }
    if (t.closest('#jwPrev')) { if (W && W.idx > 0) gotoEx(W.idx - 1); return; }
    if (t.closest('#jwNext')) {
      if (!W) return;
      if (W.idx < W.items.length - 1) { if (cur().d.type === 'info') W.finished[W.idx] = true; gotoEx(W.idx + 1); } else completeDay();
      return;
    }
    if (t.closest('#jwExit')) {
      if (W && W.running && !confirm('Прервать тренировку? День не будет отмечен.')) { e.preventDefault(); }
      return;
    }
    if (t.closest('#jwReset')) {
      if (confirm('Сбросить прогресс «Челюсть 30 дней»? Отметки дней, привычек и фото будут удалены.')) {
        var snd = S.sound, tk = S.tick; S = defaults(); S.sound = snd; S.tick = tk; save(); render();
      }
      return;
    }
    var p = t.closest('[data-photo]');
    if (p) { S.photos[p.getAttribute('data-photo')] = true; save(); render(); return; }
    var c = t.closest('.jw-cell');
    if (c) { openDay = parseInt(c.getAttribute('data-day'), 10); nav('jaw/plan'); }
  });
  document.addEventListener('change', function (e) {
    var root = document.getElementById('jawRoot');
    if (!root || !root.contains(e.target)) return;
    var t = e.target;
    if (t.hasAttribute('data-habit')) {
      var k = dkey(); S.habits[k] = S.habits[k] || {};
      if (t.checked) S.habits[k][t.getAttribute('data-habit')] = true; else delete S.habits[k][t.getAttribute('data-habit')];
      save(); var y = window.scrollY; render(); window.scrollTo(0, y); return;
    }
    if (t.hasAttribute('data-photo-chk')) { if (t.checked) S.photos[t.getAttribute('data-photo-chk')] = true; else delete S.photos[t.getAttribute('data-photo-chk')]; save(); t.closest('.jw-check').classList.toggle('on', t.checked); return; }
    if (t.id === 'jwSnd' || t.id === 'jwWkSnd') { S.sound = t.checked; save(); if (t.closest('.jw-check')) t.closest('.jw-check').classList.toggle('on', t.checked); if (S.sound) { ensureAudio(); beepGo(); } return; }
    if (t.id === 'jwTick') { S.tick = t.checked; save(); t.closest('.jw-check').classList.toggle('on', t.checked); }
  });
  document.addEventListener('keydown', function (e) {
    if (!W || !document.body.classList.contains('jw-in-workout')) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); if (cur().d.type !== 'info') togglePlay(); }
    else if (e.key === 'ArrowRight') { var n = document.getElementById('jwNext'); if (n) n.click(); }
    else if (e.key === 'ArrowLeft' && W.idx > 0) gotoEx(W.idx - 1);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && W && W.running) requestWake(); });

  /* small summary for the Today promo card */
  function summary() {
    var cd = curDay();
    if (cd > TOTAL) return 'Программа пройдена 🎉';
    if (dayLocked(cd)) return 'Неделя 1 пройдена ✓ · дни 8–30 в Про';
    return 'День ' + cd + ' из ' + TOTAL + (doneToday() ? ' · сегодня ✓' : ' · ≈ ' + dayMinutes(cd) + ' мин');
  }

  /* v7: numbers for the AI assistant */
  function stats() {
    var cd = curDay(), k = dkey(), set = {}, missed = 0;
    for (var i = 1; i <= TOTAL; i++) if (S.completed[i]) set[S.completed[i]] = 1;
    var first = null; Object.keys(set).forEach(function (x) { if (!first || x < first) first = x; });
    var dd = new Date(); dd.setHours(12, 0, 0, 0);
    for (var j = 0; j < 7; j++) { var kk = dkey(dd); if (first && kk >= first && !set[kk] && j > 0) missed++; dd.setDate(dd.getDate() - 1); }
    return {
      done: doneCount(), total: TOTAL, cur: cd, streak: streak(), doneToday: doneToday(), minutes: dayMinutes(Math.min(cd, TOTAL)),
      habitsToday: habitCount(k), habitsTotal: HABITS.length, habitStreak: habitStreak(), missedLast7: missed,
      locked: dayLocked(Math.min(cd, TOTAL))
    };
  }

  window.JawModule = { render: render, leave: leave, summary: summary, stats: stats };
})();
