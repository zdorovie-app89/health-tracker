/* Здоровье v7 — «ИИ-ассистент» (Pro). View #ai.
 * Works fully offline: a built-in Russian rule-based analyst reads the user's own data from localStorage
 * (via window.HTApp, JawModule.stats(), SkinModule.stats()) and answers with real numbers, week-over-week
 * comparisons and tips. Optional: if the device owner pastes their own OpenRouter API key in «Настройки ИИ»
 * (stored only on this device, never shipped), a compact data summary + the question go to OpenRouter;
 * on any error the built-in analyst answers instead.
 * Storage: localStorage 'health.ai.v1' -> { msgs: [{ r: 'u'|'a', h: html, src?, at }], key, model, cloud } */
(function () {
  'use strict';
  var KEY = 'health.ai.v1';
  var DEFAULT_MODEL = 'openrouter/free';
  var MODELS = ['openrouter/free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free'];
  var CHIPS = ['Как я сплю?', 'Сколько я съел сегодня?', 'Сколько белка за неделю?', 'Что улучшить?', 'Как идёт челюсть?', 'Итоги недели', 'Как мой вес?', 'Сколько воды я пью?', 'Как с тренировками?', 'Уход за кожей'];

  function load() {
    var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.msgs)) s.msgs = [];
    if (typeof s.model !== 'string' || !s.model) s.model = DEFAULT_MODEL;
    return s;
  }
  var S = load();
  function save() { try { S.msgs = S.msgs.slice(-60); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  /* ---------------- helpers ---------------- */
  var A = function () { return window.HTApp; };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v, frac) { return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: frac === undefined ? 1 : frac }); }
  function plural(n, a, b, c) { n = Math.abs(Math.round(n)); var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function b(s) { return '<b>' + s + '</b>'; }
  function delta(cur, prev, frac, unit) {
    if (cur === null || prev === null) return '';
    var d = cur - prev, f = frac === undefined ? 1 : frac;
    if (Math.abs(d) < Math.pow(10, -f) / 2) return ' — столько же, сколько неделей раньше';
    return ' (' + (d > 0 ? '+' : '−') + num(Math.abs(d), f) + (unit ? ' ' + unit : '') + ' к прошлой неделе: ' + num(prev, f) + ')';
  }
  function dayLbl(k) { var a = A(); return a.parseKey(k).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }); }
  // last n day keys ending at `endOffset` days before today (0 = today), newest last
  function keysBack(n, endOffset) {
    var a = A(), t0 = a.today(), out = [];
    for (var i = n - 1; i >= 0; i--) out.push(a.toKey(a.addDays(t0, -(i + (endOffset || 0)))));
    return out;
  }
  function series(id, ks) {
    var d = A().data()[id] || {};
    return ks.filter(function (k) { return Object.prototype.hasOwnProperty.call(d, k); }).map(function (k) { return { k: k, v: d[k] }; });
  }
  function vals(s) { return s.map(function (x) { return x.v; }); }
  // night metric: count windows up to today if logged today, else up to yesterday
  function endOff(id) { var a = A(), d = a.data()[id] || {}; return Object.prototype.hasOwnProperty.call(d, a.todayKey()) ? 0 : 1; }
  function goal(id) { var g = A().settings().goals || {}; return g[id] || { sleep: 8, water: 2000, steps: 10000, workout: 30 }[id] || null; }

  /* ---------------- food helpers ---------------- */
  function foodDay(k) { return (A().food()[k] || []); }
  function foodTot(k) { return A().foodTotals(k); }
  function loggedFoodDays(ks) { return ks.filter(function (k) { return foodDay(k).length > 0; }); }
  function targets() { var a = A(), g = a.kcalGoal(); var m = a.macroTargets(g); return { kcal: g.v, p: m.p, f: m.f, c: m.c, auto: g.auto }; }

  /* ---------------- intent parsing ---------------- */
  function norm(q) { return String(q || '').toLowerCase().replace(/ё/g, 'е').replace(/[?!.,;:()«»"]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function scopeOf(q) {
    if (/позавчера/.test(q)) return { kind: 'day', off: 2, lbl: 'позавчера' };
    if (/вчера/.test(q)) return { kind: 'day', off: 1, lbl: 'вчера' };
    if (/сегодня|сейчас|за день/.test(q)) return { kind: 'day', off: 0, lbl: 'сегодня' };
    if (/месяц|30 дн/.test(q)) return { kind: 'range', n: 30, lbl: 'за 30 дней' };
    if (/прошл[а-я]* недел/.test(q)) return { kind: 'range', n: 7, off: 7, lbl: 'за прошлую неделю' };
    if (/недел|7 дн|семь дн/.test(q)) return { kind: 'range', n: 7, lbl: 'за 7 дней' };
    return null;
  }
  var NB = '(?![а-яa-z0-9])';   // JS \b does not work with Cyrillic letters
  function rx(src) { return new RegExp(src.replace(/\\b/g, NB)); }
  var INTENTS = [
    ['help', rx('^(привет|здравствуй|хай|hello|hi)\\b|что (ты )?умеешь|помощ|help|кто ты')],
    ['improve', rx('улучш|исправ|что (мне )?делать|совет|рекоменд|над чем|слаб|подтян|как стать|что не так')],
    ['summary', rx('итог|обзор|сводк|отчет|статистик|как (у меня )?дела|в целом|общ[а-я]* картин')],
    ['jaw', rx('челюст|подбород|скул|мьюинг|осанк|шея|шеи|лиц[оа]\\b')],
    ['skin', rx('кож|умыв|уход|акне|прыщ|spf|крем')],
    ['protein', rx('белк|белок|протеин')], ['fat', rx('жир(?!о)|жиров')], ['carbs', rx('углевод|сахар')],
    ['food', rx('(^|\\s)(съ|по)?ел[аи]?\\b|съесть|еда|ед[уы]\\b|калори|ккал|кбжу|питани|рацион|перекус|завтрак|обед|ужин')],
    ['water', rx('вод[аыу]\\b|воды|пью|(^|\\s)(вы)?пил[аи]?\\b|жидкост|гидрат')],
    ['steps', rx('шаг|ходьб|ходил|прош[её]л|прогулк')],
    ['workout', rx('трениров|занимал|спорт|(^|\\s)зал\\b|упражнен|нагрузк|кардио|программ')],
    ['weight', rx('(^|\\s)вес[ау]?\\b|вешу|похуд|набрал|набор вес|килограм|кг\\b|имт|худе')],
    ['mood', rx('настроен|самочувств|эмоци|стресс')],
    ['sleep', rx('сплю|спал|спать|(^|\\s)сон\\b|сна\\b|сну\\b|сном|высып|засыпа|ноч')]
  ];
  function intentOf(q) {
    for (var i = 0; i < INTENTS.length; i++) if (INTENTS[i][1].test(q)) return INTENTS[i][0];
    return null;
  }

  /* ---------------- answers ---------------- */
  function noData(what, how) { return 'Пока нет данных про ' + what + '. ' + how; }
  function ansSleep() {
    var off = endOff('sleep'), cur = series('sleep', keysBack(7, off)), prev = series('sleep', keysBack(7, off + 7)), g = goal('sleep');
    if (!cur.length) {
      if (!prev.length) return noData('сон', 'Записывай, сколько спал, через «+» → «Сон» — и я покажу средние, лучшие и худшие ночи и динамику.');
    }
    var a = avg(vals(cur)), p = avg(vals(prev));
    var out = [];
    if (cur.length) {
      var best = cur.slice().sort(function (x, y) { return y.v - x.v; })[0], worst = cur.slice().sort(function (x, y) { return x.v - y.v; })[0];
      var ok = cur.filter(function (x) { return x.v >= g; }).length, short = cur.filter(function (x) { return x.v < 6; }).length;
      var sd = Math.sqrt(avg(vals(cur).map(function (v) { return (v - a) * (v - a); })));
      out.push('За последние ' + cur.length + ' ' + plural(cur.length, 'ночь', 'ночи', 'ночей') + ' ты спал в среднем ' + b(num(a) + ' ч') + ' (цель ' + num(g) + ' ч)' + delta(a, p, 1, 'ч') + '.');
      out.push('<ul><li>Цель выполнена: ' + b(ok + ' из ' + cur.length) + '</li><li>Лучшая ночь: ' + dayLbl(best.k) + ' — ' + b(num(best.v) + ' ч') + '</li><li>Худшая: ' + dayLbl(worst.k) + ' — ' + b(num(worst.v) + ' ч') + '</li>' +
        (short ? '<li>Ночей короче 6 ч: ' + b(short) + '</li>' : '') + '<li>Разброс: ±' + num(sd) + ' ч' + (sd > 1 ? ' — режим «скачет»' : ' — режим довольно ровный') + '</li></ul>');
      var debt = Math.max(0, sum(cur.map(function (x) { return g - x.v; })));
      if (a < g - 0.25) out.push('Недосып за неделю ≈ ' + b(num(debt) + ' ч') + '. ' + (a < 7 ? 'Главный совет: ложись на 30–40 минут раньше 5 дней подряд — это даст больше, чем «отсыпание» в выходные.' : 'Почти у цели: добавь 20–30 минут сна, отложив телефон за час до сна.'));
      else out.push('Отлично, сон в норме. ' + (sd > 1 ? 'Попробуй вставать в одно и то же время — ровный режим улучшит самочувствие.' : 'Держи этот режим.'));
      var mood = moodSleepLink(); if (mood) out.push(mood);
    } else out.push('На этой неделе записей сна нет, а неделей раньше было в среднем ' + b(num(p) + ' ч') + '. Запиши последнюю ночь через «+».');
    return out.join(' ');
  }
  function moodSleepLink() {
    var a = A(), sl = a.data().sleep || {}, md = a.data().mood || {}, good = [], bad = [];
    keysBack(60, 0).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(md, k)) return;
      var prevK = a.toKey(a.addDays(a.parseKey(k), -1)), s = sl[prevK] !== undefined ? sl[prevK] : sl[k];
      if (s === undefined) return;
      (s >= 7 ? good : bad).push(md[k]);
    });
    if (good.length < 4 || bad.length < 4) return '';
    var g = avg(good), bd = avg(bad);
    if (g - bd < 0.25) return '';
    return 'Заметил связь: после ночей от 7 ч твоё настроение в среднем ' + b(num(g) + ' из 5') + ', а после коротких — ' + b(num(bd)) + '.';
  }
  function ansFood(q, scope, focus) {
    var tg = targets();
    scope = scope || (focus ? { kind: 'range', n: 7, lbl: 'за 7 дней' } : { kind: 'day', off: 0, lbl: 'сегодня' });
    var names = { p: 'белка', f: 'жиров', c: 'углеводов' }, units = 'г';
    if (scope.kind === 'day') {
      var k = keysBack(1, scope.off)[0], list = foodDay(k), t = foodTot(k);
      if (!list.length) return (scope.off === 0 ? 'Сегодня в дневнике питания пока пусто. ' : 'За ' + scope.lbl + ' записей еды нет. ') + 'Добавь еду во вкладке «Питание» — поиск понимает «гречка», «дошик», «биг спешел» и т. д.';
      var top = list.slice().sort(function (x, y) { return y.kcal - x.kcal; }).slice(0, 3).map(function (x) { return esc(A().entryName(x)) + ' — ' + num(x.kcal, 0) + ' ккал'; });
      var left = tg.kcal - t.kcal, out = [];
      if (focus) {
        out.push(cap(scope.lbl) + ' ' + names[focus] + ': ' + b(num(t[focus], 0) + ' ' + units) + ' из ' + num(tg[focus], 0) + ' ' + units + ' (' + Math.round(t[focus] / Math.max(1, tg[focus]) * 100) + '%).');
      } else {
        out.push(cap(scope.lbl) + ' ты съел ' + b(num(t.kcal, 0) + ' ккал') + ' из ' + num(tg.kcal, 0) + ' (' + Math.round(t.kcal / Math.max(1, tg.kcal) * 100) + '%). ' +
          (left >= 0 ? 'Осталось ≈ ' + b(num(left, 0) + ' ккал') + '.' : 'Перебор на ' + b(num(-left, 0) + ' ккал') + '.'));
      }
      out.push('<ul><li>Белки: ' + b(num(t.p, 0) + ' / ' + num(tg.p, 0) + ' г') + '</li><li>Жиры: ' + b(num(t.f, 0) + ' / ' + num(tg.f, 0) + ' г') + '</li><li>Углеводы: ' + b(num(t.c, 0) + ' / ' + num(tg.c, 0) + ' г') + '</li><li>Записей: ' + list.length + '</li></ul>');
      out.push('Самое калорийное: ' + top.join('; ') + '.');
      if (scope.off === 0) {
        var pLeft = tg.p - t.p;
        if (pLeft > 25) out.push('До нормы белка не хватает ' + b(num(pLeft, 0) + ' г') + ' — например, 200 г творога 5% (≈ 34 г белка) или 150 г куриной грудки (≈ 35 г).');
        else if (left < -150) out.push('Сегодня калорий больше цели — завтра просто вернись к обычному плану, «отрабатывать» голодом не нужно.');
        else out.push('Баланс выглядит нормально.');
      }
      return out.join(' ');
    }
    var ks = keysBack(scope.n, scope.off || 0), days = loggedFoodDays(ks);
    var prevKs = keysBack(scope.n, (scope.off || 0) + scope.n), prevDays = loggedFoodDays(prevKs);
    if (!days.length) return 'В дневнике питания нет записей ' + scope.lbl + '. Добавляй еду во вкладке «Питание», и я посчитаю средние КБЖУ и сравню недели.';
    var tots = days.map(foodTot), ptots = prevDays.map(foodTot);
    var avgOf = function (arr, f) { return arr.length ? avg(arr.map(function (x) { return x[f]; })) : null; };
    var res = [];
    if (focus) {
      var total = sum(tots.map(function (x) { return x[focus]; })), av = avgOf(tots, focus), pav = avgOf(ptots, focus);
      var hit = tots.filter(function (x) { return x[focus] >= tg[focus] * 0.9; }).length;
      res.push(cap(scope.lbl) + ' ты съел ' + b(num(total, 0) + ' г ' + names[focus]) + ' — в среднем ' + b(num(av, 0) + ' г в день') + ' при норме ' + num(tg[focus], 0) + ' г' + (scope.n === 7 && !scope.off ? delta(av, pav, 0, 'г') : '') + '.');
      res.push('Дней с записями: ' + days.length + ' из ' + scope.n + ', норма (≥90%) выполнена в ' + b(hit) + ' ' + plural(hit, 'день', 'дня', 'дней') + '.');
      var src = topSources(days, focus);
      if (src.length) res.push('Главные источники: ' + src.join(', ') + '.');
      if (focus === 'p' && av < tg.p * 0.85) res.push('Совет: добавь белок в каждый приём пищи — яйца или творог утром, мясо/рыба в обед, кефир или греческий йогурт вечером.');
      if (focus === 'c' && av > tg.c * 1.2) res.push('Углеводов заметно больше нормы — проверь сладкие напитки и выпечку.');
      return res.join(' ');
    }
    var ak = avgOf(tots, 'kcal'), pk = avgOf(ptots, 'kcal');
    res.push(cap(scope.lbl) + ': в среднем ' + b(num(ak, 0) + ' ккал') + ' в день (цель ' + num(tg.kcal, 0) + ')' + (scope.n === 7 && !scope.off ? delta(ak, pk, 0, 'ккал') : '') + '.');
    res.push('<ul><li>Белки: ' + b(num(avgOf(tots, 'p'), 0) + ' г/день') + ' (норма ' + num(tg.p, 0) + ')</li><li>Жиры: ' + b(num(avgOf(tots, 'f'), 0) + ' г/день') + ' (норма ' + num(tg.f, 0) + ')</li><li>Углеводы: ' + b(num(avgOf(tots, 'c'), 0) + ' г/день') + ' (норма ' + num(tg.c, 0) + ')</li><li>Дней с записями: ' + days.length + ' из ' + scope.n + '</li></ul>');
    var over = tots.filter(function (x) { return x.kcal > tg.kcal * 1.1; }).length;
    if (over) res.push('Дней с перебором калорий (>110%): ' + b(over) + '.');
    if (days.length < scope.n * 0.6) res.push('Записей мало — средние могут быть неточными. Старайся записывать всё хотя бы 5 дней в неделю.');
    return res.join(' ');
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function topSources(days, f) {
    var m = {};
    days.forEach(function (k) { foodDay(k).forEach(function (x) { var n = A().entryName(x); m[n] = (m[n] || 0) + x[f]; }); });
    return Object.keys(m).sort(function (a, c) { return m[c] - m[a]; }).slice(0, 3).filter(function (n) { return m[n] > 0; }).map(function (n) { return esc(n) + ' (' + num(m[n], 0) + ' г)'; });
  }
  function ansSimple(id, what, unit, frac, fmtv) {
    var off = endOff(id), cur = series(id, keysBack(7, off)), prev = series(id, keysBack(7, off + 7)), g = goal(id);
    fmtv = fmtv || function (v) { return num(v, frac); };
    if (!cur.length && !prev.length) return null;
    var a = avg(vals(cur)), p = avg(vals(prev)), out = [];
    if (!cur.length) return 'На этой неделе записей нет; неделей раньше в среднем было ' + b(fmtv(p) + ' ' + unit) + '.';
    var ok = cur.filter(function (x) { return x.v >= g; }).length;
    out.push(what + ' за 7 дней: в среднем ' + b(fmtv(a) + ' ' + unit) + ' (цель ' + fmtv(g) + ')' + delta(a, p, frac, unit) + '. Цель выполнена ' + b(ok + ' из ' + cur.length) + ' ' + plural(cur.length, 'дня', 'дней', 'дней') + '.');
    var best = cur.slice().sort(function (x, y) { return y.v - x.v; })[0];
    out.push('Лучший день: ' + dayLbl(best.k) + ' — ' + b(fmtv(best.v) + ' ' + unit) + '.');
    return { text: out.join(' '), a: a, g: g, ok: ok, n: cur.length };
  }
  function ansWater() {
    var r = ansSimple('water', 'Вода', 'мл', 0);
    if (!r) return noData('воду', 'Отмечай стаканы кнопками +250 / +500 на экране «Сегодня».');
    if (typeof r === 'string') return r;
    return r.text + ' ' + (r.a < r.g * 0.85 ? 'Совет: стакан воды сразу после пробуждения и перед каждым приёмом пищи закрывает ≈ 1 л без усилий.' : 'Хороший уровень — так держать.');
  }
  function ansSteps() {
    var r = ansSimple('steps', 'Шаги', 'шагов', 0);
    if (!r) return noData('шаги', 'Записывай шаги из телефона или часов через «+» → «Шаги».');
    if (typeof r === 'string') return r;
    return r.text + ' ' + (r.a < r.g * 0.8 ? 'Совет: одна 20-минутная прогулка добавляет ≈ 2 000–2 500 шагов.' : 'Активность на хорошем уровне.');
  }
  function ansWorkout() {
    var off = endOff('workout'), cur = series('workout', keysBack(7, off)), prev = series('workout', keysBack(7, off + 7));
    var a = A(), plan = a.plan && a.plan(), out = [];
    if (cur.length || prev.length) {
      var m = sum(vals(cur)), pm = sum(vals(prev));
      out.push('За 7 дней: ' + b(cur.length + ' ' + plural(cur.length, 'тренировка', 'тренировки', 'тренировок')) + ', всего ' + b(num(m, 0) + ' мин') + (prev.length || pm ? ' (неделей раньше — ' + prev.length + ', ' + num(pm, 0) + ' мин)' : '') + '.');
      if (cur.length < 3) out.push('ВОЗ советует 150+ минут умеренной активности в неделю и 2+ силовые тренировки. ' + (m < 150 ? 'До 150 минут не хватает ' + b(num(150 - m, 0) + ' мин') + '.' : ''));
      else out.push(m >= 150 ? 'Отлично: норма 150 минут в неделю выполнена.' : 'Хорошая регулярность — добавь немного длительности, чтобы выйти на 150 минут.');
    } else out.push('Записей тренировок пока нет — отмечай минуты через «+» → «Тренировка».');
    if (plan && plan.plan) out.push('Твоя программа: ' + plan.plan.days.length + ' ' + plural(plan.plan.days.length, 'день', 'дня', 'дней') + ' в неделю — открой «Тренировки», там упражнения с картинками.');
    else out.push('Составь программу во вкладке «Тренировки» — она подберёт упражнения под возраст, вес и инвентарь.');
    return out.join(' ');
  }
  function ansWeight() {
    var a = A(), d = a.data().weight || {}, ks = Object.keys(d).sort();
    if (!ks.length) return noData('вес', 'Взвешивайся утром натощак 2–3 раза в неделю и записывай через «+» → «Вес».');
    var last = ks[ks.length - 1], lv = d[last], out = [];
    function onOrBefore(days) { var lim = a.toKey(a.addDays(a.today(), -days)), c = ks.filter(function (k) { return k <= lim; }); return c.length ? d[c[c.length - 1]] : null; }
    var w7 = onOrBefore(7), w30 = onOrBefore(30), g = a.settings().goals.weight, h = a.settings().height;
    out.push('Последний вес: ' + b(num(lv) + ' кг') + ' (' + dayLbl(last) + ').');
    var li = [];
    if (w7 !== null && ks.length > 1) li.push('За 7 дней: ' + b((lv - w7 > 0 ? '+' : lv - w7 < 0 ? '−' : '±') + num(Math.abs(lv - w7)) + ' кг'));
    if (w30 !== null && ks.length > 1) li.push('За 30 дней: ' + b((lv - w30 > 0 ? '+' : lv - w30 < 0 ? '−' : '±') + num(Math.abs(lv - w30)) + ' кг'));
    if (h) { var bmi = lv / Math.pow(h / 100, 2); li.push('ИМТ: ' + b(num(bmi)) + (bmi < 18.5 ? ' — ниже нормы' : bmi < 25 ? ' — норма' : bmi < 30 ? ' — избыточный вес' : ' — ожирение')); }
    if (g) li.push('До цели ' + num(g) + ' кг: ' + b(num(Math.abs(lv - g)) + ' кг'));
    if (li.length) out.push('<ul><li>' + li.join('</li><li>') + '</li></ul>');
    if (w30 !== null && g && ks.length > 3) {
      var rate = (lv - w30) / 30 * 7, need = g - lv;
      if (rate !== 0 && Math.sign(rate) === Math.sign(need)) out.push('При текущем темпе (' + num(Math.abs(rate)) + ' кг/нед) до цели ≈ ' + b(Math.ceil(Math.abs(need / rate)) + ' нед') + '.');
      else if (Math.abs(need) > 0.5) out.push('Сейчас вес движется не к цели. Безопасный темп — 0,25–0,75 кг в неделю: дефицит 300–500 ккал и белок ' + num(targets().p, 0) + ' г в день.');
    }
    return out.join(' ');
  }
  function ansMood() {
    var off = endOff('mood'), cur = series('mood', keysBack(7, off)), prev = series('mood', keysBack(7, off + 7));
    if (!cur.length && !prev.length) return noData('настроение', 'Отмечай настроение смайликом на экране «Сегодня».');
    var a = avg(vals(cur)), p = avg(vals(prev)), out = [];
    if (cur.length) out.push('Среднее настроение за неделю: ' + b(num(a) + ' из 5') + delta(a, p, 1, '') + '.');
    var link = moodSleepLink(); if (link) out.push(link);
    if (a !== null && a < 3) out.push('Если плохое настроение держится больше двух недель — это повод поговорить со специалистом.');
    return out.join(' ');
  }
  function ansJaw() {
    var j = window.JawModule && window.JawModule.stats ? window.JawModule.stats() : null;
    if (!j) return 'Модуль «Челюсть 30 дней» недоступен.';
    var out = [];
    if (!j.done) out.push('Ты ещё не начал программу «Челюсть 30 дней». Первая тренировка занимает ≈ ' + j.minutes + ' мин — открой вкладку «Лицо».');
    else {
      out.push('Пройдено ' + b(j.done + ' из ' + j.total) + ' ' + plural(j.total, 'дня', 'дней', 'дней') + ' (' + Math.round(j.done / j.total * 100) + '%), серия ' + b(j.streak + ' ' + plural(j.streak, 'день', 'дня', 'дней')) + ' подряд.');
      out.push(j.cur > j.total ? 'Программа завершена 🎉 — сравни фото дней 1, 7 и 30.' : 'Следующий: ' + b('день ' + j.cur) + (j.doneToday ? ' (сегодня уже сделано ✓ — продолжай завтра)' : ', ≈ ' + j.minutes + ' мин') + '.');
    }
    out.push('Привычки сегодня: ' + b(j.habitsToday + ' из ' + j.habitsTotal) + ', серия привычек ' + j.habitStreak + ' ' + plural(j.habitStreak, 'день', 'дня', 'дней') + '.');
    if (j.missedLast7 > 2 && j.done) out.push('За последнюю неделю было ' + j.missedLast7 + ' ' + plural(j.missedLast7, 'день', 'дня', 'дней') + ' без тренировки — лучше 10 минут каждый день, чем 30 раз в неделю.');
    out.push('Честно: за первые недели заметнее всего уходят отёки и выравнивается осанка; чёткость линии челюсти больше зависит от процента жира.');
    return out.join(' ');
  }
  function ansSkin() {
    var s = window.SkinModule && window.SkinModule.stats ? window.SkinModule.stats() : null;
    if (!s) return 'Модуль ухода за кожей недоступен.';
    var out = [];
    out.push(s.type ? 'Твой тип кожи: ' + b(s.typeName) + (s.acne ? ' (склонна к акне)' : '') + '.' : 'Тип кожи ещё не определён — пройди тест из 6 вопросов во вкладке «Лицо» → «Уход за кожей».');
    out.push('Сегодня отмечено ' + b(s.doneToday + ' из ' + s.reqToday) + ' обязательных шагов, серия ' + b(s.streak + ' ' + plural(s.streak, 'день', 'дня', 'дней')) + ', за 7 дней полностью выполнено ' + b(s.last7 + ' из 7') + '.');
    if (s.last7 < 4) out.push('Главное в уходе — регулярность: умывание, крем и SPF утром важнее любых сывороток.');
    else out.push('Отличная регулярность — результат от ухода заметен через 4–8 недель.');
    return out.join(' ');
  }
  // collects problems with a priority score for «Что улучшить?»
  function issues() {
    var list = [], tg = targets();
    var sl = series('sleep', keysBack(7, endOff('sleep'))), gs = goal('sleep');
    if (sl.length >= 3) { var as = avg(vals(sl)); if (as < gs - 0.3) list.push({ s: (gs - as) * 30, t: 'Сон: в среднем ' + b(num(as) + ' ч') + ' при цели ' + num(gs) + ' ч. Ложись на 30 минут раньше и убери телефон за час до сна.' }); }
    else list.push({ s: 8, t: 'Записывай сон хотя бы 5 ночей в неделю — без этого сложно что-то советовать.' });
    var fd = loggedFoodDays(keysBack(7, 0));
    if (fd.length >= 2) {
      var tots = fd.map(foodTot), ap = avg(tots.map(function (x) { return x.p; })), ak = avg(tots.map(function (x) { return x.kcal; }));
      if (ap < tg.p * 0.85) list.push({ s: (1 - ap / tg.p) * 60, t: 'Белок: ' + b(num(ap, 0) + ' г/день') + ' при норме ' + num(tg.p, 0) + ' г. Добавь творог, яйца, курицу или рыбу в 2 приёма пищи.' });
      if (ak > tg.kcal * 1.12) list.push({ s: (ak / tg.kcal - 1) * 70, t: 'Калории: ' + b(num(ak, 0) + ' ккал/день') + ' при цели ' + num(tg.kcal, 0) + '. Проверь напитки, соусы и перекусы.' });
      if (ak < tg.kcal * 0.7) list.push({ s: 12, t: 'Калорий мало: ' + b(num(ak, 0) + ' ккал/день') + ' — возможно, записывается не всё, или дефицит слишком жёсткий.' });
    } else list.push({ s: 6, t: 'Веди дневник питания хотя бы несколько дней — я посчитаю КБЖУ и найду, где недобор белка.' });
    var w = series('water', keysBack(7, endOff('water'))), gw = goal('water');
    if (w.length >= 3) { var aw = avg(vals(w)); if (aw < gw * 0.85) list.push({ s: (1 - aw / gw) * 25, t: 'Вода: ' + b(num(aw, 0) + ' мл') + ' в день при цели ' + num(gw, 0) + ' мл. Стакан после пробуждения и перед едой.' }); }
    var st = series('steps', keysBack(7, endOff('steps'))), gst = goal('steps');
    if (st.length >= 3) { var ast = avg(vals(st)); if (ast < gst * 0.8) list.push({ s: (1 - ast / gst) * 25, t: 'Шаги: ' + b(num(ast, 0)) + ' в день при цели ' + num(gst, 0) + '. Прогулка 20 минут ≈ +2 000 шагов.' }); }
    var wo = series('workout', keysBack(7, endOff('workout')));
    var wm = sum(vals(wo));
    if (wo.length < 2 || wm < 90) list.push({ s: 14 + (90 - Math.min(90, wm)) / 10, t: 'Тренировки: ' + b(wo.length + ' за неделю, ' + num(wm, 0) + ' мин') + '. Цель — 3 тренировки и 150 минут активности.' });
    var j = window.JawModule && window.JawModule.stats ? window.JawModule.stats() : null;
    if (j && j.done && j.cur <= j.total && j.missedLast7 > 2) list.push({ s: 6, t: 'Челюсть: ' + j.missedLast7 + ' ' + plural(j.missedLast7, 'пропуск', 'пропуска', 'пропусков') + ' за неделю — 10 минут в день, без пропусков, дают больше.' });
    var sk = window.SkinModule && window.SkinModule.stats ? window.SkinModule.stats() : null;
    if (sk && sk.last7 < 3 && sk.anyChecks) list.push({ s: 4, t: 'Уход за кожей: полностью выполнено ' + sk.last7 + ' из 7 дней. Минимум — умывание, крем и SPF утром.' });
    return list.sort(function (a, c) { return c.s - a.s; });
  }
  function ansImprove() {
    var l = issues();
    if (!l.length) return 'По данным за неделю всё в норме 👏 Сон, питание и активность близки к целям. Продолжай и добавляй постепенно: +1 тренировка или +1 000 шагов в день.';
    return 'Вот что даст больше всего пользы (по твоим данным за 7 дней):<ol><li>' + l.slice(0, 3).map(function (x) { return x.t; }).join('</li><li>') + '</li></ol>' +
      (l.length > 3 ? '<span class="muted">Ещё: ' + l.slice(3, 5).map(function (x) { return x.t.replace(/<[^>]+>/g, '').split('.')[0]; }).join('; ') + '.</span>' : '');
  }
  function ansSummary() {
    var li = [];
    function row(id, label, unit, frac) {
      var off = endOff(id), c = series(id, keysBack(7, off)), p = series(id, keysBack(7, off + 7));
      if (!c.length) return;
      var a = avg(vals(c)), pa = avg(vals(p)), d = pa === null ? '' : ' <span class="muted">(' + (a - pa >= 0 ? '+' : '−') + num(Math.abs(a - pa), frac) + ')</span>';
      li.push(label + ': ' + b(num(a, frac) + ' ' + unit) + d);
    }
    row('sleep', '🌙 Сон', 'ч', 1); row('water', '💧 Вода', 'мл', 0); row('steps', '👟 Шаги', '', 0);
    var wo = series('workout', keysBack(7, endOff('workout'))); if (wo.length) li.push('🏋️ Тренировки: ' + b(wo.length + ' · ' + num(sum(vals(wo)), 0) + ' мин'));
    var fd = loggedFoodDays(keysBack(7, 0));
    if (fd.length) { var tots = fd.map(foodTot); li.push('🍽 Питание: ' + b(num(avg(tots.map(function (x) { return x.kcal; })), 0) + ' ккал') + ', белок ' + b(num(avg(tots.map(function (x) { return x.p; })), 0) + ' г') + ' в день (' + fd.length + ' дн.)'); }
    row('mood', '🙂 Настроение', 'из 5', 1);
    var a = A(), wd = a.data().weight || {}, wk = Object.keys(wd).sort(); if (wk.length) li.push('⚖️ Вес: ' + b(num(wd[wk[wk.length - 1]]) + ' кг'));
    var j = window.JawModule && window.JawModule.stats ? window.JawModule.stats() : null; if (j && j.done) li.push('💪 Челюсть: ' + b(j.done + '/' + j.total) + ', серия ' + j.streak);
    var sk = window.SkinModule && window.SkinModule.stats ? window.SkinModule.stats() : null; if (sk && sk.anyChecks) li.push('🧴 Уход: ' + b(sk.last7 + '/7') + ' дней, серия ' + sk.streak);
    if (!li.length) return 'Данных пока нет. Начни с записи сна, воды или еды — или загрузи демо-данные в Профиле, чтобы посмотреть, как я работаю.';
    var top = issues()[0];
    return 'Итоги последних 7 дней <span class="muted">(в скобках — разница с прошлой неделей)</span>:<ul><li>' + li.join('</li><li>') + '</li></ul>' + (top ? 'Главный фокус: ' + top.t : '');
  }
  function ansHelp() {
    return 'Я анализирую только твои данные на этом устройстве — сон, воду, шаги, тренировки, вес, питание (КБЖУ), программу для челюсти и уход за кожей. Спрашивай, например: «как я сплю», «сколько я съел вчера», «сколько белка за неделю», «как мой вес», «что улучшить». Нажми на подсказку ниже.';
  }
  function answer(text) {
    var q = norm(text);
    if (!q) return ansHelp();
    if (!A()) return 'Данные ещё загружаются, попробуй через секунду.';
    var it = intentOf(q), sc = scopeOf(q);
    switch (it) {
      case 'help': return ansHelp();
      case 'improve': return ansImprove();
      case 'summary': return ansSummary();
      case 'jaw': return ansJaw();
      case 'skin': return ansSkin();
      case 'protein': return ansFood(q, sc, 'p');
      case 'fat': return ansFood(q, sc, 'f');
      case 'carbs': return ansFood(q, sc, 'c');
      case 'food': return ansFood(q, sc, null);
      case 'water': return ansWater();
      case 'steps': return ansSteps();
      case 'workout': return ansWorkout();
      case 'weight': return ansWeight();
      case 'mood': return ansMood();
      case 'sleep': return ansSleep();
    }
    if (sc) return ansSummary();
    return 'Не совсем понял вопрос 🙂 Я умею отвечать про сон, еду и КБЖУ, воду, шаги, тренировки, вес, настроение, челюсть и уход за кожей. Попробуй: «как я сплю?», «сколько белка за неделю?» или «что улучшить?».';
  }

  /* ---------------- optional cloud model (OpenRouter, user's own key) ---------------- */
  function dataSummary() {
    var a = A(), st = a.settings(), tg = targets(), lines = [];
    lines.push('Профиль: возраст ' + (st.age || '?') + ', пол ' + (st.sex === 'm' ? 'м' : st.sex === 'f' ? 'ж' : '?') + ', рост ' + (st.height || '?') + ' см. Цели: сон ' + goal('sleep') + ' ч, вода ' + goal('water') + ' мл, шаги ' + goal('steps') + ', тренировка ' + goal('workout') + ' мин, вес ' + (st.goals.weight || '—') + ' кг. Норма КБЖУ: ' + tg.kcal + ' ккал, Б ' + tg.p + ', Ж ' + tg.f + ', У ' + tg.c + ' г.');
    lines.push('По дням (последние 14; дата: сон ч | вода мл | шаги | трен. мин | вес | настроение 1-5 | ккал Б/Ж/У):');
    var d = a.data();
    keysBack(14, 0).forEach(function (k) {
      var f = foodTot(k), hasF = foodDay(k).length;
      var g = function (id) { return d[id] && d[id][k] !== undefined ? d[id][k] : '-'; };
      lines.push(k + ': ' + [g('sleep'), g('water'), g('steps'), g('workout'), g('weight'), g('mood'), hasF ? Math.round(f.kcal) + ' ' + Math.round(f.p) + '/' + Math.round(f.f) + '/' + Math.round(f.c) : '-'].join(' | '));
    });
    var j = window.JawModule && window.JawModule.stats ? window.JawModule.stats() : null;
    if (j) lines.push('Программа «Челюсть 30 дней»: выполнено ' + j.done + '/' + j.total + ', серия ' + j.streak + ', привычки сегодня ' + j.habitsToday + '/' + j.habitsTotal + '.');
    var sk = window.SkinModule && window.SkinModule.stats ? window.SkinModule.stats() : null;
    if (sk) lines.push('Уход за кожей: тип ' + (sk.typeName || 'не определён') + ', серия ' + sk.streak + ', за 7 дней ' + sk.last7 + '/7.');
    var today = foodDay(a.todayKey()).map(function (x) { return a.entryName(x) + ' ' + Math.round(x.kcal) + 'ккал'; }).slice(0, 15);
    if (today.length) lines.push('Еда сегодня: ' + today.join('; '));
    return lines.join('\n');
  }
  function askCloud(question) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    var hist = S.msgs.slice(-6).map(function (m) { return { role: m.r === 'u' ? 'user' : 'assistant', content: m.h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 800) }; });
    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.key, 'X-Title': 'Zdorovie' },
      body: JSON.stringify({
        model: S.model || DEFAULT_MODEL, temperature: 0.4, max_tokens: 700,
        messages: [{ role: 'system', content: 'Ты — дружелюбный ассистент приложения «Здоровье». Отвечай по-русски, кратко (до 150 слов), на «ты», с конкретными числами из данных пользователя. Сравнивай с целями и прошлой неделей, давай 1–3 практичных совета. Ты не врач: при тревожных симптомах советуй обратиться к врачу. Не выдумывай данные, которых нет.\n\nДанные пользователя:\n' + dataSummary() }]
          .concat(hist).concat([{ role: 'user', content: question }])
      })
    }).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + r.status));
        var c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (!c || !String(c).trim()) throw new Error('пустой ответ');
        return { text: String(c).trim(), model: j.model || S.model };
      });
    }, function (e) { clearTimeout(timer); throw e; });
  }
  function mdToHtml(s) {
    s = esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*([^*\n]+)\*/g, '$1<i>$2</i>');
    var lines = s.split(/\n/), out = [], inList = false;
    lines.forEach(function (l) {
      var m = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(l);
      if (m) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + m[1] + '</li>'); }
      else { if (inList) { out.push('</ul>'); inList = false; } if (l.trim()) out.push(l.replace(/^#+\s*/, '') + '<br>'); }
    });
    if (inList) out.push('</ul>');
    return out.join('').replace(/(<br>)+$/, '');
  }

  /* ---------------- UI ---------------- */
  var busy = false, showSettings = false;
  function msgHtml(m) {
    return '<div class="ai-msg ' + (m.r === 'u' ? 'me' : 'bot') + '">' + (m.r === 'u' ? '' : '<span class="ai-av" aria-hidden="true">✦</span>') +
      '<div class="ai-bubble">' + m.h + (m.src ? '<small class="ai-src">' + esc(m.src) + '</small>' : '') + '</div></div>';
  }
  function render() {
    var root = document.getElementById('aiRoot'); if (!root) return;
    var pro = window.HTPro ? window.HTPro.isPro() : true;
    var head = '<header class="top top-back"><a class="icon-btn" href="#today" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>' +
      '<div class="grow"><h1 class="title">ИИ-ассистент</h1><div class="subtitle">Отвечает по твоим данным' + (S.key && S.cloud ? ' · облачный ИИ включён' : ' · работает офлайн') + '</div></div>' +
      (pro ? '<button type="button" class="icon-btn" data-ai="settings" aria-label="Настройки ИИ"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>' : '') + '</header>';
    if (!pro) {
      root.innerHTML = head + window.HTPro.lockCard('ИИ-ассистент', 'Задавай вопросы о своём сне, питании, тренировках и программе для лица — ассистент посчитает средние, сравнит недели и подскажет, что улучшить.', 'ai') +
        '<section class="card ai-teaser"><div class="ai-msg me"><div class="ai-bubble">Сколько белка я съел за неделю?</div></div>' +
        '<div class="ai-msg bot"><span class="ai-av">✦</span><div class="ai-bubble">За 7 дней ты съел <b>612 г белка</b> — в среднем <b>87 г в день</b> при норме 120 г. Главные источники: творог, курица, яйца…</div></div></section>';
      return;
    }
    var msgs = S.msgs.length ? S.msgs : [{ r: 'a', h: 'Привет! Я твой ассистент по здоровью ✦ ' + ansHelp() }];
    root.innerHTML = head + (showSettings ? settingsCard() : '') +
      '<section class="ai-log" id="aiLog" aria-live="polite">' + msgs.map(msgHtml).join('') + (busy ? '<div class="ai-msg bot"><span class="ai-av">✦</span><div class="ai-bubble ai-typing"><i></i><i></i><i></i></div></div>' : '') + '</section>' +
      '<div class="ai-chips">' + CHIPS.map(function (c) { return '<button type="button" class="qa-chip" data-ai-q="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<form class="ai-form" id="aiForm" autocomplete="off"><input id="aiInput" type="text" maxlength="300" placeholder="Спроси о своих данных…" enterkeyhint="send"' + (busy ? ' disabled' : '') + '>' +
      '<button type="submit" class="btn primary" aria-label="Отправить"' + (busy ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg></button></form>' +
      (S.msgs.length ? '<button type="button" class="link-btn small ai-clear" data-ai="clear">Очистить переписку</button>' : '') +
      '<p class="muted small ai-note">Ассистент не заменяет врача. Встроенный анализ работает без интернета; данные не покидают устройство' + (S.key && S.cloud ? ', кроме краткой сводки для облачного ИИ' : '') + '.</p>';
    var log = document.getElementById('aiLog'); if (log) log.scrollTop = log.scrollHeight;
  }
  function settingsCard() {
    return '<section class="card ai-settings"><div class="card-head"><h2>Настройки ИИ</h2><button type="button" class="pill-link" data-ai="settings">Готово</button></div>' +
      '<p class="muted small">По умолчанию отвечает встроенный анализатор — бесплатно и офлайн. Можно подключить облачную модель через OpenRouter своим ключом: ключ хранится <b>только на этом устройстве</b>, а в OpenRouter уходит краткая сводка твоих данных за 14 дней и вопрос.</p>' +
      '<label class="jw-check' + (S.cloud ? ' on' : '') + '"><input type="checkbox" id="aiCloud"' + (S.cloud ? ' checked' : '') + '><span class="jw-ci">☁️</span><span class="grow"><b>Облачный ИИ (OpenRouter)</b><small>при ошибке ответит встроенный анализатор</small></span><span class="jw-tick"></span></label>' +
      '<label class="fc-field"><span>API-ключ OpenRouter</span><input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-…" value="' + esc(S.key || '') + '"></label>' +
      '<label class="fc-field"><span>Модель</span><input id="aiModel" type="text" autocomplete="off" spellcheck="false" list="aiModels" value="' + esc(S.model || DEFAULT_MODEL) + '"></label>' +
      '<datalist id="aiModels">' + MODELS.map(function (m) { return '<option value="' + m + '">'; }).join('') + '</datalist>' +
      '<div class="btn-grid"><button type="button" class="btn primary" data-ai="save">Сохранить</button><button type="button" class="btn danger" data-ai="forget">Удалить ключ</button></div>' +
      '<p class="muted small">Бесплатный ключ: openrouter.ai → Keys. Модели с «:free» и «openrouter/free» бесплатны, но с лимитами.</p></section>';
  }
  function ask(text) {
    text = String(text || '').trim().slice(0, 300);
    if (!text || busy) return;
    S.msgs.push({ r: 'u', h: esc(text), at: Date.now() });
    var local = answer(text);
    if (S.cloud && S.key) {
      busy = true; save(); render();
      askCloud(text).then(function (r) {
        S.msgs.push({ r: 'a', h: mdToHtml(r.text), src: 'облачный ИИ · ' + r.model, at: Date.now() });
      }, function (e) {
        S.msgs.push({ r: 'a', h: local, src: 'облачный ИИ недоступен (' + String(e && e.name === 'AbortError' ? 'таймаут' : (e && e.message) || e).slice(0, 80) + ') — ответ встроенного анализатора', at: Date.now() });
      }).then(function () { busy = false; save(); render(); });
      return;
    }
    S.msgs.push({ r: 'a', h: local, src: 'встроенный анализ', at: Date.now() });
    save(); render();
  }
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'aiForm') { e.preventDefault(); var i = document.getElementById('aiInput'); var v = i.value; i.value = ''; ask(v); }
  });
  document.addEventListener('click', function (e) {
    var root = document.getElementById('aiRoot'); if (!root || !root.contains(e.target)) return;
    var q = e.target.closest('[data-ai-q]'); if (q) { ask(q.getAttribute('data-ai-q')); return; }
    var a = e.target.closest('[data-ai]'); if (!a) return;
    var act = a.getAttribute('data-ai');
    if (act === 'settings') { showSettings = !showSettings; render(); }
    else if (act === 'clear') { if (confirm('Очистить переписку с ассистентом?')) { S.msgs = []; save(); render(); } }
    else if (act === 'save') {
      var k = (document.getElementById('aiKey').value || '').trim(), m = (document.getElementById('aiModel').value || '').trim();
      S.key = k || null; S.model = m || DEFAULT_MODEL; S.cloud = !!(k && document.getElementById('aiCloud').checked);
      save(); showSettings = false; render(); if (window.HTPro) window.HTPro.toast(S.cloud ? 'Облачный ИИ включён' : 'Сохранено');
    } else if (act === 'forget') { S.key = null; S.cloud = false; save(); render(); if (window.HTPro) window.HTPro.toast('Ключ удалён с устройства'); }
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'aiCloud') e.target.closest('.jw-check').classList.toggle('on', e.target.checked);
  });

  window.AIModule = { render: render, answer: answer, ask: ask, _summary: dataSummary };
})();
