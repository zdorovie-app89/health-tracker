/* Здоровье v9.1 — прогноз веса и наблюдения (связи между сном, настроением, едой и тренировками).
 * Всё считается на устройстве по записям, без ИИ. Окно 7 дней — бесплатно, 30 и 90 дней — в Про.
 * Ничего не хранит, кроме выбранного окна (health.v9 → insWin). */
(function () {
  'use strict';
  function A() { return window.HTApp; }
  function U() { return window.V9.util; }
  var MIN_DAYS = 14;

  /* ---------------- weight forecast: linear trend over the last 28 days ---------------- */
  function forecast() {
    var u = U(), a = A(), W = a.data().weight || {}, t0 = u.today0(), from = u.key(u.addD(t0, -27));
    var ks = Object.keys(W).filter(function (k) { return k >= from && k <= u.key(t0); }).sort();
    if (!ks.length) return null;
    var x0 = u.pkey(ks[0]).getTime(), xs = ks.map(function (k) { return Math.round((u.pkey(k).getTime() - x0) / 864e5); }), ys = ks.map(function (k) { return W[k]; });
    var span = xs[xs.length - 1];
    if (ks.length < 4 || span < 10) return { few: true, n: ks.length, span: span };
    var n = xs.length, mx = xs.reduce(function (s, v) { return s + v; }, 0) / n, my = ys.reduce(function (s, v) { return s + v; }, 0) / n;
    var sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
    var slope = sxx ? sxy / sxx : 0, r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
    var lastX = Math.round((t0.getTime() - x0) / 864e5), fitNow = my + slope * (lastX - mx);
    var res = { n: n, span: span, slope: slope, perWeek: slope * 7, r2: r2, now: fitNow, last: ys[n - 1], goal: a.settings().goals.weight || null };
    if (res.goal) {
      var need = res.goal - fitNow;
      if (Math.abs(res.goal - res.last) <= 0.2) res.reached = true;
      else if (r2 >= 0.4 && Math.abs(res.perWeek) >= 0.05 && need * slope > 0) {
        var days = need / slope;
        if (days <= 365) res.date = u.key(u.addD(t0, Math.round(days)));
        else res.tooFar = true;
      } else if (need * slope < 0 && Math.abs(res.perWeek) >= 0.05) res.away = true;
      else if (r2 < 0.4) res.noisy = true;
    }
    return res;
  }
  function rateText(f) {
    var u = U();
    return Math.abs(f.perWeek) < 0.05 ? 'вес держится ровно (±0 кг в неделю)' : 'так ты идёшь примерно на ' + u.signed(Math.round(f.perWeek * 10) / 10 || (f.perWeek > 0 ? 0.1 : -0.1)) + ' кг в неделю';
  }
  function forecastLine() {
    if (window.V9 && !window.V9.goalOn('weight')) return '';
    var f = forecast(), u = U(); if (!f) return '';
    if (f.few) return 'Прогноз — после 4 замеров за 2 недели';
    var s = rateText(f);
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (f.reached) return s + ' · цель достигнута';
    if (f.date) return s + ', ' + u.num(f.goal) + ' кг около ' + u.fmtD(f.date);
    return s;
  }
  function forecastHtml() {
    var f = forecast(), u = U(); if (!f) return '';
    var body;
    if (f.few) body = '<p class="muted small">Нужно хотя бы 4 замера веса за последние 2–4 недели (сейчас ' + f.n + '). Прогноз появится сам.</p>';
    else {
      var why = f.reached ? 'Цель ' + u.num(f.goal) + ' кг уже достигнута.' : f.date ? u.num(f.goal) + ' кг — около <b>' + u.fmtD(f.date, { day: 'numeric', month: 'long', year: 'numeric' }) + '</b>, если темп сохранится.' :
        f.away ? 'Сейчас вес движется от цели ' + u.num(f.goal) + ' кг — дату не называю.' : f.tooFar ? 'При таком темпе до цели больше года — дату не называю.' :
        f.noisy ? 'Замеры сильно скачут, тренд неустойчивый — дату не называю.' : f.goal ? '' : 'Поставь цель по весу в Профиле — покажу примерную дату.';
      body = '<p class="v9-fc-big">' + rateText(f).replace(/^так/, 'Так') + '</p><p class="muted small">' + why + ' По ' + f.n + ' замерам за ' + f.span + ' дн., линейный тренд (R² ' + u.num(f.r2, 2) + '). Это ориентир, а не обещание.</p>';
    }
    return '<section class="card v9-forecast"><div class="card-head"><h2>⚖️ Прогноз веса</h2></div>' + body + '</section>';
  }

  /* ---------------- observations ---------------- */
  function dataDays() {
    var a = A(), d = a.data(), set = {};
    Object.keys(d).forEach(function (id) { Object.keys(d[id] || {}).forEach(function (k) { set[k] = 1; }); });
    Object.keys(a.food()).forEach(function (k) { if (a.food()[k].length) set[k] = 1; });
    return Object.keys(set).length;
  }
  function winKeys(win) { var u = U(), t0 = u.today0(), ks = []; for (var i = win - 1; i >= 0; i--) ks.push(u.key(u.addD(t0, -i))); return ks; }
  function trainedOn(k) {
    var v = U().val('workout', k);
    if (v !== null && v > 0) return true;
    return !!(window.HistoryModule && window.HistoryModule.workoutsBetween(k, k).length);
  }
  function fmtAvg(v) { return U().num(v, 1); }
  function moodAfterSleep(win) {
    var u = U(), short = [], norm = [];
    winKeys(win + 1).slice(0, win).forEach(function (k) {   // night k → mood on k+1 (inside the window)
      var s = u.val('sleep', k), m = u.val('mood', u.key(u.addD(u.pkey(k), 1)));
      if (s === null || m === null) return;
      if (s < 6) short.push(m); else if (s >= 7 && s <= 9) norm.push(m);
    });
    var r = { id: 'mood', icon: '🙂', title: 'Сон и настроение на следующий день' };
    if (short.length < 2 || norm.length < 2) { r.st = 'few'; r.text = 'Мало пар «сон → настроение»: после сна меньше 6 ч — ' + short.length + ', после 7–9 ч — ' + norm.length + ' (нужно хотя бы по 2).'; return r; }
    var as = u.avg(short), an = u.avg(norm), d = an - as;
    r.vals = { short: as, norm: an, nShort: short.length, nNorm: norm.length };
    if (Math.abs(d) < 0.3) { r.st = 'none'; r.text = 'Заметной связи нет: после сна меньше 6 ч настроение ' + fmtAvg(as) + ', после 7–9 ч — ' + fmtAvg(an) + ' из 5.'; return r; }
    r.st = 'ok';
    r.text = 'После сна меньше 6 ч настроение на следующий день в среднем <b>' + fmtAvg(as) + '</b> из 5, после 7–9 ч — <b>' + fmtAvg(an) + '</b> (' + short.length + ' и ' + norm.length + ' ' + u.plural(norm.length, 'день', 'дня', 'дней') + ').' +
      (d > 0 ? ' Короткий сон совпадает с худшим настроением.' : ' Как ни странно, после короткого сна настроение было даже лучше.');
    return r;
  }
  function kcalMode() {
    var a = A(), g = a.settings().goals.weight, w = a.weight ? a.weight() : null, goal = a.plan() && a.plan().form ? a.plan().form.goal : 'general';
    if (g && w) return g < w - 0.5 ? 'lose' : g > w + 0.5 ? 'gain' : 'keep';
    return goal === 'fat_loss' ? 'lose' : goal === 'muscle' ? 'gain' : 'keep';
  }
  function hit(kcal, goal, mode) { return mode === 'lose' ? kcal <= goal * 1.05 : mode === 'gain' ? kcal >= goal * 0.95 : Math.abs(kcal - goal) <= goal * 0.1; }
  function weightKcal(win) {
    var u = U(), a = A(), kg = a.kcalGoal(), goal = kg.v, mode = kcalMode(), B = Math.min(14, win), blocks = [];
    var r = { id: 'kcal', icon: '🍽', title: 'Вес и цель по калориям' };
    var modeTxt = mode === 'lose' ? 'не больше ' + u.num(Math.round(goal * 1.05), 0) : mode === 'gain' ? 'не меньше ' + u.num(Math.round(goal * 0.95), 0) : u.num(Math.round(goal * 0.9), 0) + '–' + u.num(Math.round(goal * 1.1), 0);
    var ks = winKeys(win);
    for (var end = ks.length; end > 0; end -= B) {
      var bk = ks.slice(Math.max(0, end - B), end), logged = 0, ok = 0, wk = [];
      bk.forEach(function (k) {
        var f = a.food()[k]; if (f && f.length) { logged++; if (hit(a.foodTotals(k).kcal, goal, mode)) ok++; }
        var w = u.val('weight', k); if (w !== null) wk.push({ k: k, v: w });
      });
      var ch = null;
      if (wk.length >= 2) {
        var x0 = u.pkey(wk[0].k).getTime(), xs = wk.map(function (p) { return (u.pkey(p.k).getTime() - x0) / 864e5; }), mx = u.avg(xs), my = u.avg(wk.map(function (p) { return p.v; }));
        var sxy = 0, sxx = 0; xs.forEach(function (x, i) { sxy += (x - mx) * (wk[i].v - my); sxx += (x - mx) * (x - mx); });
        ch = sxx ? sxy / sxx * (bk.length - 1) : null;
      }
      blocks.unshift({ from: bk[0], to: bk[bk.length - 1], logged: logged, ok: ok, rate: logged ? ok / logged : null, ch: ch });
    }
    var good = blocks.filter(function (b) { return b.logged >= 3 && b.ch !== null; });
    r.blocks = blocks; r.mode = mode; r.goal = goal;
    if (!good.length) { r.st = 'few'; r.text = 'Нужны записи еды (хотя бы 3 дня) и 2+ замера веса за ' + (B === 14 ? '2 недели' : B + ' дн.') + '.'; return r; }
    if (good.length === 1 || win <= 14) {
      var b = good[good.length - 1];
      r.st = 'ok'; r.text = 'За ' + (b.to === ks[ks.length - 1] && B === win ? 'последние ' + B + ' дн.' : B + ' дн.') + ': цель по калориям (' + modeTxt + ' ккал) — <b>' + b.ok + ' из ' + b.logged + '</b> дней с записями, вес <b>' + u.signed(Math.round(b.ch * 10) / 10) + ' кг</b>.' +
        (win <= 14 ? '' : ' Для сравнения нужно больше двухнедельных периодов с данными.');
      return r;
    }
    var hi = good.reduce(function (m, b) { return b.rate > m.rate ? b : m; }), lo = good.reduce(function (m, b) { return b.rate < m.rate ? b : m; });
    if (hi.rate - lo.rate < 0.2) { r.st = 'none'; r.text = 'Доля дней в цели почти не менялась (' + Math.round(lo.rate * 100) + '–' + Math.round(hi.rate * 100) + '%) — сравнивать не с чем. Вес за эти периоды: ' + good.map(function (b) { return u.signed(Math.round(b.ch * 10) / 10); }).join(', ') + ' кг.'; return r; }
    var better = mode === 'gain' ? hi.ch > lo.ch : mode === 'lose' ? hi.ch < lo.ch : Math.abs(hi.ch) < Math.abs(lo.ch);
    r.st = Math.abs(hi.ch - lo.ch) < 0.2 ? 'none' : 'ok';
    r.text = 'В 2 недели, когда цель по калориям выполнялась чаще (' + Math.round(hi.rate * 100) + '% дней), вес изменился на <b>' + u.signed(Math.round(hi.ch * 10) / 10) + ' кг</b>; когда реже (' + Math.round(lo.rate * 100) + '%) — на <b>' + u.signed(Math.round(lo.ch * 10) / 10) + ' кг</b>.' +
      (r.st === 'none' ? ' Разница маленькая — заметной связи пока нет.' : better ? ' Дни в цели работают.' : ' Связь обратная ожиданию — возможно, мешают пропуски в дневнике.');
    return r;
  }
  function workoutsAfterShortSleep(win) {
    var u = U(), short = [], norm = [];
    winKeys(win).forEach(function (k) {
      var s = u.val('sleep', u.key(u.addD(u.pkey(k), -1))); if (s === null) return;
      if (s < 6) short.push(trainedOn(k)); else if (s >= 7) norm.push(trainedOn(k));
    });
    var r = { id: 'wk', icon: '🏋️', title: 'Тренировки после короткого сна' };
    if (short.length < 2 || norm.length < 2) { r.st = 'few'; r.text = 'Мало дней: после сна меньше 6 ч — ' + short.length + ', после 7+ ч — ' + norm.length + ' (нужно хотя бы по 2).'; return r; }
    var ns = short.filter(Boolean).length, nn = norm.filter(Boolean).length, rs = ns / short.length, rn = nn / norm.length;
    r.vals = { short: rs, norm: rn };
    var line = 'После сна меньше 6 ч ты тренировался в <b>' + ns + ' из ' + short.length + '</b> дней (' + Math.round(rs * 100) + '%), после 7+ ч — в <b>' + nn + ' из ' + norm.length + '</b> (' + Math.round(rn * 100) + '%).';
    if (Math.abs(rs - rn) < 0.15) { r.st = 'none'; r.text = line + ' Заметной связи нет.'; return r; }
    r.st = 'ok'; r.text = line + (rs < rn ? ' После недосыпа тренировки пропускаются чаще.' : ' Недосып тренировкам не мешает.');
    return r;
  }
  function observations(win) {
    var dd = dataDays();
    if (dd < MIN_DAYS) return { enough: false, days: dd };
    return { enough: true, days: dd, win: win, items: [moodAfterSleep(win), weightKcal(win), workoutsAfterShortSleep(win)] };
  }
  function obsHtml() {
    var V = window.V9, u = U(), P = V.P(), pro = u.isPro(), win = P.insWin && (pro || P.insWin === 7) ? P.insWin : 7;
    var o = observations(win);
    var seg = '<div class="seg v9-win" role="tablist">' + [7, 30, 90].map(function (w) {
      return '<button type="button" class="seg-btn' + (w === win ? ' active' : '') + '" data-v9ins-win="' + w + '">' + w + ' дн.' + (w > 7 && !pro ? ' 🔒' : '') + '</button>';
    }).join('') + '</div>';
    var body;
    if (!o.enough) body = '<p class="muted small">Наблюдения появятся, когда наберётся ' + MIN_DAYS + ' дней с записями (сейчас ' + o.days + ').</p>';
    else body = o.items.map(function (it) {
      return '<div class="v9-obs v9-obs-' + it.st + '"><div class="v9-obs-h">' + it.icon + ' ' + it.title + (it.st === 'none' ? ' <span class="v9-obs-tag">связи нет</span>' : it.st === 'few' ? ' <span class="v9-obs-tag">мало данных</span>' : '') + '</div><p>' + it.text + '</p></div>';
    }).join('') + '<p class="muted small">Совпадение — ещё не причина. Это просто сравнение твоих записей за ' + win + ' дн.</p>';
    return '<section class="card v9-ins"><div class="card-head"><h2>🔎 Наблюдения</h2>' + seg + '</div>' + body + '</section>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-v9ins-win]'); if (!b) return;
    var w = Number(b.getAttribute('data-v9ins-win'));
    if (w > 7 && !U().isPro()) { location.hash = '#buy/stats'; return; }
    window.V9.P().insWin = w; window.V9.save(); window.V9.renderWeek();
  });

  window.V9Insights = {
    forecast: forecast, forecastLine: forecastLine, observations: observations, dataDays: dataDays,
    weekHtml: function () { return forecastHtml() + obsHtml(); },
    // plain text for the AI assistant
    text: function () {
      var u = U(), out = [], f = forecast();
      if (f && !f.few) out.push('Прогноз веса (тренд за 4 недели, ' + f.n + ' замеров): ' + rateText(f) + (f.date ? ', цель ' + u.num(f.goal) + ' кг около ' + u.fmtD(f.date) : f.reached ? ', цель достигнута' : '') + '.');
      var o = observations(u.isPro() ? 30 : 7);
      if (o.enough) o.items.forEach(function (it) { out.push(it.title + ' (' + o.win + ' дн.): ' + it.text.replace(/<[^>]+>/g, '')); });
      return out.join('\n');
    }
  };
})();
