/* Здоровье v8.1 — «ИИ-ассистент» (Pro). View #ai.
 * Two engines:
 *  1) Built-in Russian analyst (always available, offline): reads the user's own data via window.HTApp,
 *     JawModule.stats(), SkinModule.stats(); answers nutrition questions from the local food database
 *     (window.HEALTH_FOODS: «сколько калорий в мраморной говядине», «белок в 200 г курицы», «гречка или рис»),
 *     common health questions (норма калорий/белка/воды/сна, похудение, набор массы…), keeps context for
 *     follow-ups («ответь на вопрос», «а в курице?») and never repeats the same fallback twice.
 *  2) Chat LLM via OpenRouter (or any OpenAI-compatible endpoint) when an API key is configured — the user's own
 *     key pasted in «Настройки ИИ» (stored only on this device) or an optional build-time key (ai-config.js).
 *     Then EVERY message goes to the model with a Russian system prompt containing a compact summary of the
 *     user's data (30 days), the built-in analyst's exact numbers for this question, matching food-database rows
 *     and the last 10 chat turns; the reply is streamed. Any error → the built-in analyst answers.
 *  Plus food photo recognition (vision model, needs a key): photo → JSON list of items → matched against the
 *  database → editable card → «Добавить в дневник». Also available on the «Питание» screen.
 * Storage: localStorage 'health.ai.v1' -> { msgs: [{ r: 'u'|'a', h: html, src?, at, photo? }], key, model, vmodel,
 *          base, cloudOff, ctx: { lastQ, lastKind, lastFood, focus, fb } } */
(function () {
  'use strict';
  var KEY = 'health.ai.v1';
  var OR_BASE = 'https://openrouter.ai/api/v1';
  // Free OpenRouter models checked 2026-10-08 against GET /api/v1/models (exact ids). Only real instruct/chat models —
  // no routers (openrouter/free once routed a question to a content-safety classifier) and no guard/moderation models.
  var CHAT_MODELS = ['google/gemma-4-31b-it:free', 'thinkingmachines/inkling:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'];
  var VISION_MODELS = ['google/gemma-4-31b-it:free', 'thinkingmachines/inkling:free', 'google/gemma-4-26b-a4b-it:free', 'thinkingmachines/inkling-small:free'];
  var MODEL_NAMES = { 'google/gemma-4-31b-it:free': 'Gemma 4 31B (Google)', 'thinkingmachines/inkling:free': 'Inkling (Thinking Machines)', 'google/gemma-4-26b-a4b-it:free': 'Gemma 4 26B (Google, быстрее)',
    'nvidia/nemotron-3-super-120b-a12b:free': 'Nemotron 3 Super (NVIDIA)', 'nvidia/nemotron-3-ultra-550b-a55b:free': 'Nemotron 3 Ultra (NVIDIA, медленнее)', 'thinkingmachines/inkling-small:free': 'Inkling Small (Thinking Machines)' };
  var DEFAULT_MODEL = CHAT_MODELS[0], DEFAULT_VMODEL = VISION_MODELS[0];
  // never use these: classifiers / guards / embeddings / rerankers, and OpenRouter meta-routers that may pick one
  var BLOCKED_RX = /safety|guard|moderat|shield|classif|reward|embed|rerank|content-safety/i;
  function blockedModel(m) { m = String(m || ''); return BLOCKED_RX.test(m) || /^openrouter\//i.test(m); }
  var CHIPS = ['Как я сплю?', 'Сколько я съел сегодня?', 'Калории в мраморной говядине', 'Сколько белка за неделю?', 'Что улучшить?', 'Гречка или рис?', 'Сколько белка мне нужно?', 'Как идёт челюсть?', 'Итоги недели', 'Как мой вес?', 'Как быстрее заснуть?', 'Уход за кожей'];

  function load() {
    var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.msgs)) s.msgs = [];
    // v7/v8 defaults included the 'openrouter/free' router (it once answered with a safety classifier) → reset any
    // router / guard / moderation model to the vetted default (v8.1)
    if (typeof s.model !== 'string' || !s.model.trim() || blockedModel(s.model)) { s.model = DEFAULT_MODEL; s.modelSet = false; }
    if (typeof s.vmodel !== 'string' || !s.vmodel.trim() || blockedModel(s.vmodel)) s.vmodel = DEFAULT_VMODEL;
    if (!s.ctx || typeof s.ctx !== 'object') s.ctx = {};
    if (!s.photos || typeof s.photos !== 'object') s.photos = {};
    // v7 → v8: `cloud` (opt-in flag) became `cloudOff` (explicit opt-out); a configured key now means «on»
    if (s.cloud !== undefined) { if (s.key && s.cloud === false) s.cloudOff = true; delete s.cloud; }
    return s;
  }
  var S = load();
  function save() {
    try {
      S.msgs = S.msgs.slice(-60);
      var keep = {}; S.msgs.forEach(function (m) { if (m.photo && S.photos[m.photo]) keep[m.photo] = S.photos[m.photo]; }); S.photos = keep;
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) { /* quota — ignore */ }
  }
  // optional build-time key (ai-config.js). It is only obfuscated: anyone can extract it from the site files.
  function buildKey() {
    var c = window.HT_AI_CFG; if (!c || !c.k) return null;
    try {
      var raw = atob(c.k), salt = 'zdorovie', out = '';
      for (var i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
      return out.split('').reverse().join('');
    } catch (e) { return null; }
  }
  function apiKey() { return S.key || buildKey(); }
  function keySource() { return S.key ? 'device' : buildKey() ? 'build' : null; }
  function cloudOn() { return !!apiKey() && !S.cloudOff; }
  function apiBase() { return (S.base || '').trim().replace(/\/+$/, '') || OR_BASE; }
  function isOR() { return apiBase() === OR_BASE; }

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
    ['weekrep', rx('итог[а-я]* (за |этой |прошлой )?недел|недельн[а-я]* (итог|отчет)|как прошла неделя')],
    ['insights', rx('связ[ьаи]|зависи|влия[ею]т|корреляц|наблюден|после (короткого|плохого|недо)')],
    ['forecast', rx('прогноз|когда (я )?(достигну|дойду|похудею|буду весить)|к какому числу')],
    ['measure', rx('талия|талии|талию|замер|процент[а-я]* жира|% жира|жиров[а-я]* (масс|ткан)|бедр[ао]')],
    ['regular', rx('регулярн|режим сна|во сколько (я )?(встаю|ложусь|просыпаюсь)|отбой|подъем')],
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
      var rg = sleepTimesLine(); if (rg) out.push(rg);
    } else out.push('На этой неделе записей сна нет, а неделей раньше было в среднем ' + b(num(p) + ' ч') + '. Запиши последнюю ночь через «+».');
    return out.join(' ');
  }
  // v9.1: bedtime / wake times + regularity (sleeptimes.js)
  function sleepTimesLine() {
    var V = window.V9Sleep; if (!V) return '';
    var r = V.regularity(14), all = V.all(), ks = Object.keys(all).sort().slice(-7);
    if (!ks.length) return '';
    var bed = ks.map(function (k) { var m = +all[k].b.split(':')[0] * 60 + +all[k].b.split(':')[1]; return m < 720 ? m + 1440 : m; }), bm = Math.round(avg(bed)) % 1440;
    var hhmm = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
    return 'По времени: ложишься в среднем около ' + b(hhmm(bm)) + (r.sd !== null ? ', встаёшь около ' + b(r.avgWake) + '; регулярность подъёма ±' + r.sd + ' мин — ' + V.regWord(r.sd) + '.' : '. Для оценки регулярности нужно 5+ ночей со временем отбоя и подъёма.');
  }
  function ansRegular() {
    var line = sleepTimesLine();
    return line || 'Записей со временем отбоя и подъёма пока нет. В «Сколько спал?» на «Сегодня» или в «+» → «Сон» укажи, во сколько лёг и встал — посчитаю длительность и регулярность.';
  }
  function ansWeekRep() {
    var V = window.V9; if (!V) return ansSummary();
    var w = V.weekStats(V.defaultWeek());
    return V.weekText(w).replace(/^Итоги недели/, 'Итоги недели') + ' Подробно — на экране «Итоги недели» (Сегодня → 📊).';
  }
  function ansInsights() {
    var I = window.V9Insights; if (!I) return 'Наблюдения появятся в следующей версии.';
    var o = I.observations(!window.HTPro || window.HTPro.isPro() ? 30 : 7);
    if (!o.enough) return 'Для наблюдений нужно хотя бы 14 дней с записями (сейчас ' + o.days + '). Записывай сон, настроение, еду и тренировки — и я покажу, что с чем связано.';
    return 'Наблюдения за ' + o.win + ' дн. (совпадение — ещё не причина):<ul>' + o.items.map(function (it) { return '<li><b>' + it.title + ':</b> ' + it.text + '</li>'; }).join('') + '</ul>';
  }
  function ansForecast() {
    var I = window.V9Insights, f = I && I.forecast();
    if (!f) return noData('вес', 'Для прогноза взвешивайся 2–3 раза в неделю — нужен хотя бы 4 замера за 2 недели.');
    if (f.few) return 'Для прогноза нужно хотя бы 4 замера веса за 2–4 недели (сейчас ' + f.n + ').';
    var line = I.forecastLine();
    return line + '. ' + (f.date ? '' : f.away ? 'Вес сейчас движется от цели, поэтому дату не называю. ' : f.noisy ? 'Замеры сильно скачут — дату не называю. ' : !f.goal ? 'Поставь цель по весу в Профиле — назову примерную дату. ' : '') + 'Это линейный тренд за 4 недели (R² ' + num(f.r2, 2) + '), ориентир, а не обещание.';
  }
  function ansMeasure() {
    var B = window.V9Body; if (!B) return 'Замеры появятся в следующей версии.';
    var t = B.text();
    return t ? t + ' Записать новые — Профиль → 📏 Замеры.' : 'Замеров пока нет. Раз в неделю запиши талию и шею (и бёдра) в Профиль → 📏 Замеры — покажу динамику и грубую оценку % жира.';
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
    var fl = window.V9Insights ? window.V9Insights.forecastLine() : '';
    if (fl && !/^Прогноз —/.test(fl)) { out.push(fl + ' <span class="muted">(линейный тренд за 4 недели)</span>.'); return out.join(' '); }
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

  /* ================= v8: food database lookup («сколько калорий в мраморной говядине») ================= */
  function fnorm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9%]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  var FIDX = null, VOCAB = null, MCACHE = {};
  function fidx() {
    if (FIDX) return FIDX;
    var foods = window.HEALTH_FOODS || [], voc = {};
    FIDX = foods.map(function (f, idx) {
      var ru = fnorm(f.ru).split(' '), all = fnorm(f.ru + ' ' + (f.en || '') + ' ' + (f.tags || '')).split(' ');
      all.forEach(function (w) { if (w.length > 1) voc[w] = 1; });
      return { f: f, idx: idx, ru: ru, all: all, rawish: /(^| )(сыр(ой|ая|ое|ые)|сух(ой|ая|ое|ие))( |$)/.test(fnorm(f.ru)) };
    });
    VOCAB = Object.keys(voc);
    return FIDX;
  }
  var STOP = {};
  ('сколько скока какой какая какое какие каков какова каково что чего чем че чо где как ли есть ест содержится содержит содержат содержание ' +
   'в во на из с со и или а но по для у о об обо от до это этот эта эти такое такой такая скажи подскажи расскажи покажи напиши посчитай посчитать ' +
   'узнать знать хочу хочешь можно мне я меня мой моя мое мои ты вы вас тебе пожалуйста плиз пж пжл ну вот тут там же бы был была было будет будут если ' +
   'калорий калории калория калорийность калорийности ккал кал кбжу бжу кбж белка белок белков белки протеина протеин жира жиров жиры жир углеводов углеводы углевода ' +
   'пищевая пищевой ценность ценности энергетическая состав полезно полезный полезная полезнее вредно вредный вреднее лучше хуже сравни сравнить сравнение ' +
   'отличие разница vs против грамм граммов грамма гр г кг мл л литр литра порция порции порцию штука штуки штук шт стакан стакана ложка ложки кусок куска ' +
   'кто ломтик сто примерно приблизительно среднем вообще данные нутриенты макросы много мало больше меньше всего самый самая самое еде продукте продукта продукт ' +
   'похудения похудении диете сушке массы').split(' ').forEach(function (w) { STOP[w] = 1; });
  var SYN = { 'яиц': 'яйц', 'яичк': 'яйц', 'яйца': 'яйц', 'кура': 'куриц', 'куре': 'куриц', 'гречу': 'греч', 'картоха': 'картош', 'шава': 'шаурм', 'шаверма': 'шаурм', 'шаверме': 'шаурм', 'макдак': 'макдональдс', 'бигмак': 'бигмак', 'стейке': 'стейк' };
  var ENDS = ['иями', 'ями', 'ами', 'иях', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ов', 'ев', 'ью', 'ия', 'ии', 'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й'];
  function stem(w) {
    if (SYN[w]) return SYN[w];
    if (w.length <= 3 || !/[а-я]/.test(w)) return w;
    for (var i = 0; i < ENDS.length; i++) { var e = ENDS[i]; if (w.length - e.length >= 3 && w.slice(-e.length) === e) return w.slice(0, -e.length); }
    return w;
  }
  function lev1(a, b) {   // edit distance ≤ 1 ?
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  function stemMatches(s) {
    if (MCACHE[s] !== undefined) return MCACHE[s];
    fidx();
    var pick = function (p) { var set = null; VOCAB.forEach(function (w) { if (w.indexOf(p) === 0) { set = set || {}; set[w] = 1; } }); return set; };
    var r = null, set = pick(s);
    if (set) r = { set: set, q: 0 };
    else if (s.length >= 5 && (set = pick(s.slice(0, -1)))) r = { set: set, q: 1 };
    else if (s.length >= 5) {
      set = null;
      VOCAB.forEach(function (w) { if (w.length >= s.length - 1 && lev1(s, w.slice(0, s.length)) ) { set = set || {}; set[w] = 1; } });
      if (set) r = { set: set, q: 2 };
    }
    MCACHE[s] = r;
    return r;
  }
  // words -> ranked foods. opts.loose: one matching word is enough
  function searchDB(words, opts) {
    fidx();
    var stems = words.map(stem).filter(function (s) { return s.length >= 2; });
    var ms = stems.map(stemMatches), known = [];
    ms.forEach(function (m, i) { if (m) known.push(i); });
    var info = { words: stems.length, known: known.length };
    if (!known.length) return { list: [], info: info };
    var n = known.length, need = opts && opts.loose ? 1 : (n <= 2 ? n : n - 1), wantsRaw = words.some(function (w) { return /^(сыр(ой|ая|ое|ом|ую|ого)|сух|крупа)/.test(w); });
    var res = [];
    FIDX.forEach(function (it) {
      var matched = 0, score = 0, first = false;
      known.forEach(function (i, j) {
        var m = ms[i], inRu = -1;
        for (var a = 0; a < it.ru.length; a++) if (m.set[it.ru[a]]) { inRu = a; break; }
        if (inRu >= 0) { matched++; score += m.q + (inRu === 0 ? 0 : 0.4); if (j === 0 && inRu === 0) first = true; }
        else { for (var c = 0; c < it.all.length; c++) if (m.set[it.all[c]]) { matched++; score += 2 + m.q; break; } }
      });
      if (matched >= need) res.push({ f: it.f, miss: n - matched, score: score + (first ? -0.6 : 0) + (it.rawish && !wantsRaw ? 0.3 : 0), idx: it.idx });
    });
    res.sort(function (a, c) { return a.miss - c.miss || a.score - c.score || a.idx - c.idx; });
    info.best = res[0] || null;
    return { list: res.map(function (x) { return x.f; }), info: info, top: res };
  }
  function parseFoodQ(q) {
    var o = { g: null, n: null, unitG: null, focus: null, nutri: false, words: [] };
    var m = /(\d+(?:[.,]\d+)?)\s*(кг|килограмм[а-я]*|г|гр|грамм[а-я]*|мл|миллилитр[а-я]*|л|литр[а-я]*)(?![а-я])/.exec(q);
    if (m) { var v = parseFloat(m[1].replace(',', '.')); o.g = /^(кг|кил|л$|литр)/.test(m[2]) ? v * 1000 : v; }
    var mn = /(\d+)\s*(шт|штук[а-я]*|порц[а-я]*|яиц|яйц[а-я]*|кус[а-я]*|ломтик[а-я]*|стакан[а-я]*|ложк[а-я]*|бутыл[а-я]*|банан[а-я]*)/.exec(q);
    if (!o.g && mn) o.n = +mn[1];
    else if (!o.g && /(^| )(одн[аоуи][а-я]* (порц|штук|шт|бутыл|банк)|в порции|порция|порцию|в одном|в одной|одна штука|1 (порц|шт))/.test(q)) o.n = 1;
    if (/стакан/.test(q)) o.unitG = 250; else if (/столов[а-я]* ложк|(^| )ст ?л( |$)/.test(q)) o.unitG = 15; else if (/чайн[а-я]* ложк|(^| )ч ?л( |$)/.test(q)) o.unitG = 5; else if (/ложк/.test(q)) o.unitG = 15;
    if (o.unitG && !o.n && !o.g) o.n = 1;
    o.focus = /белк|белок|протеин/.test(q) ? 'p' : /(^| )жир(а|ов|ы|у)?( |$)|жирност/.test(q) ? 'f' : /углевод/.test(q) ? 'c' : /калор|ккал|(^| )кал( |$)/.test(q) ? 'kcal' : null;
    o.nutri = /калор|ккал|кбжу|(^| )бжу|белк|белок|протеин|(^| )жир(а|ов|ы)?( |$)|углевод|пищев|энергетич|^сколько (в|во) /.test(q);
    o.words = q.replace(/\d+([.,]\d+)?/g, ' ').split(' ').filter(function (w) {
      return w && w.length > 1 && !STOP[w] && !/^(штук|порц|граммов|грамм|килограмм|литр|стакан|ложк|столов|чайн|миллилитр)/.test(w);
    });
    return o;
  }
  var PERSONAL = rx('(^|\\s)(я|мне|меня|мой|моя|мое|мои|моих|съел[аи]?|поел[аи]?|ел[аи]?|выпил[аи]?|сегодня|вчера|позавчера|недел[юиея]|месяц[аеу]?|норм[ауы]|нужно|надо|должен|должна)\\b');
  function unitOf(f) { return f.cat === 'drinks' || /(^| )(молоко|кефир|сок|ряженка|айран|квас|пиво|вино|напиток|коктейль|смузи)/.test(fnorm(f.ru)) ? 'мл' : 'г'; }
  function per(f, g) { var k = g / 100; return { kcal: f.kcal * k, p: f.p * k, f: f.f * k, c: f.c * k }; }
  function kbju(v) { return b(num(v.kcal, 0) + ' ккал') + ' · Б ' + num(v.p) + ' · Ж ' + num(v.f) + ' · У ' + num(v.c) + ' г'; }
  function addBtn(f, g) { return '<button type="button" class="qa-chip ai-add" data-ai-add="' + esc(f.id) + '" data-g="' + Math.round(g) + '">＋ В дневник: ' + num(Math.round(g), 0) + ' ' + unitOf(f) + '</button>'; }
  function chips(list) { return '<div class="ai-inchips">' + list.map(function (c) { return '<button type="button" class="qa-chip" data-ai-q="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>'; }
  var FOCUS_NAME = { p: 'белка', f: 'жиров', c: 'углеводов' };
  function foodRemark(f) {
    var n = fnorm(f.ru), out = [];
    if (f.kcal > 0 && f.p * 4 / f.kcal >= 0.3) out.push('Хороший источник белка: ' + num(f.p * 100 / f.kcal) + ' г белка на 100 ккал.');
    if (f.kcal >= 250 && f.f * 9 / f.kcal >= 0.6) out.push('Жирный и калорийный продукт — порцию лучше взвешивать.');
    if (/(^| )сыр(ой|ая|ое)( |$)/.test(n) && /meat|fish/.test(f.cat)) out.push('Значения для сырого продукта: при жарке вес уменьшается на 25–35%, поэтому на 100 г готового калорий больше.');
    if (/(^| )сух(ой|ая|ое)|крупа/.test(n)) out.push('Это сухой продукт: при варке крупа набирает воду и на 100 г готовой каши калорий в 2,5–3 раза меньше.');
    if (f.c >= 50 && f.p < 8 && f.cat === 'sweets') out.push('Много быстрых углеводов — лучше как десерт после основной еды.');
    return out.join(' ');
  }
  function ansFoodInfo(res, pq) {
    var f = res.list[0], u = unitOf(f), out = [];
    var g = pq.g || (pq.n ? pq.n * (pq.unitG || f.por || 100) : null);
    var focus = pq.focus && pq.focus !== 'kcal' ? pq.focus : null;
    if (focus) out.push('В 100 ' + u + ' «' + esc(f.ru) + '» — ' + b(num(f[focus]) + ' г ' + FOCUS_NAME[focus]) + (g && g !== 100 ? ', в ' + num(g, 0) + ' ' + u + ' — ' + b(num(f[focus] * g / 100) + ' г') : '') + '.');
    else out.push(b(esc(f.ru)));
    out.push('<br>На 100 ' + u + ': ' + kbju(per(f, 100)) + '.');
    if (g && g !== 100) out.push('<br>На ' + num(g, 0) + ' ' + u + (pq.n && !pq.g ? ' (' + pq.n + ' × ' + num(pq.unitG || f.por || 100, 0) + ' ' + u + ')' : '') + ': ' + kbju(per(f, g)) + '.');
    else if (!g && f.por && f.por !== 100) out.push('<br>Обычная порция ≈ ' + num(f.por, 0) + ' ' + u + ': ' + kbju(per(f, f.por)) + '.');
    var rm = foodRemark(f); if (rm) out.push('<br>' + rm);
    var alts = res.list.slice(1, 4);
    if (alts.length) out.push('<br><span class="muted">Ещё в базе: ' + alts.map(function (a) { return esc(a.ru) + ' — ' + num(a.kcal, 0) + ' ккал, Б ' + num(a.p); }).join('; ') + ' (на 100 г).</span>');
    out.push('<div class="ai-inchips">' + addBtn(f, g || f.por || 100) + '</div>');
    return out.join(' ');
  }
  function ansFoodMore(res, pq) {
    var f = res.list[0];
    var rows = res.list.slice(0, 6).map(function (a) { return '<li>' + esc(a.ru) + ': ' + kbju(per(a, 100)) + (a.por ? ' <span class="muted">· порция ' + a.por + ' ' + unitOf(a) + '</span>' : '') + '</li>'; });
    return 'Подробнее по «' + esc(f.ru) + '» и похожим продуктам (на 100 г):<ul>' + rows.join('') + '</ul>' +
      'Белок даёт 4 ккал/г, углеводы — 4, жиры — 9. ' + (foodRemark(f) || '') + chips(['А сколько в 200 г?', 'Сколько белка мне нужно?']);
  }
  function compareFoods(q) {
    var s = q.replace(/(^| )(сравни(ть)?|что|чем|полезнее|лучше|хуже|выбрать|для похудения|на сушке|для массы|отличается|разница между|между)( |$)/g, ' ').trim();
    var parts = s.split(/ (?:или|vs|против|либо) | и (?=[а-яa-z])/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length !== 2) return null;
    var fa = searchDB(parseFoodQ(parts[0]).words), fb = searchDB(parseFoodQ(parts[1]).words);
    if (!fa.list.length || !fb.list.length || fa.info.best.miss || fb.info.best.miss) return null;
    var A1 = fa.list[0], B1 = fb.list[0];
    if (A1.id === B1.id) return null;
    var row = function (lbl, k, fr, unit) { return '<li>' + lbl + ': ' + b(num(A1[k], fr)) + ' vs ' + b(num(B1[k], fr)) + unit + '</li>'; };
    var pA = A1.kcal ? A1.p * 100 / A1.kcal : 0, pB = B1.kcal ? B1.p * 100 / B1.kcal : 0;
    var out = b(esc(A1.ru)) + ' vs ' + b(esc(B1.ru)) + ' (на 100 г):<ul>' + row('Калории', 'kcal', 0, ' ккал') + row('Белки', 'p', 1, ' г') + row('Жиры', 'f', 1, ' г') + row('Углеводы', 'c', 1, ' г') + '</ul>';
    var lower = A1.kcal < B1.kcal ? A1 : B1, prot = pA > pB ? A1 : B1;
    out += 'Меньше калорий — ' + b(esc(lower.ru)) + (Math.abs(A1.kcal - B1.kcal) < 15 ? ' (разница небольшая)' : '') + '; больше белка на калорию — ' + b(esc(prot.ru)) + ' (' + num(Math.max(pA, pB)) + ' г на 100 ккал). ';
    out += 'Честно: «полезнее» зависит от цели и порции — для похудения важнее общий калораж и белок, для набора — достаточно калорий и белка.';
    return { h: out + '<div class="ai-inchips">' + addBtn(A1, A1.por || 100) + addBtn(B1, B1.por || 100) + '</div>', food: A1.id };
  }
  function topProteinFoods() {
    fidx();
    var ok = FIDX.map(function (x) { return x.f; }).filter(function (f) { return f.cat !== 'sport' && f.kcal > 0 && !/(^| )(сух|сыр(ой|ая|ое))/.test(fnorm(f.ru)) && /meat|fish|eggs|dairy|legumes/.test(f.cat); });
    var byP = ok.slice().sort(function (a, c) { return c.p - a.p; }).slice(0, 6);
    var byR = ok.filter(function (f) { return f.p >= 10; }).sort(function (a, c) { return c.p / c.kcal - a.p / a.kcal; }).slice(0, 6);
    return { byP: byP, byR: byR };
  }

  /* ================= v8: general knowledge (personalised where possible) ================= */
  function energy() { var a = A(); return a && a.energy ? a.energy() : null; }
  function weightNow() { var a = A(); return a && a.weight ? a.weight() : null; }
  function needProfile() { return ' Чтобы посчитать точно под тебя, заполни возраст, рост, пол и вес в «Профиле» или на экране «Тренировки».'; }
  var KB = [
    { id: 'kcal_norm', re: rx('(сколько|какая|какую|норм)[а-я]* .*(калори|ккал)[а-я]* .*(нужно|надо|норм|в день|в сутки|мне|должен|должна|съедать|потреблять)|суточн[а-я]* норм[а-я]* калор|норм[а-я]* калори|сколько (мне )?(нужно|надо) (есть|съедать) калори'), fn: function () {
      var e = energy(), tg = targets();
      if (!e) return 'Норма калорий = базовый обмен (BMR) × коэффициент активности. По формуле Миффлина — Сан Жеора для мужчины 30 лет, 75 кг, 178 см BMR ≈ 1 720 ккал, при лёгкой активности поддержание ≈ 2 360 ккал. Для похудения — минус 15–20%, для набора — плюс 10%.' + needProfile();
      return 'По твоим данным: базовый обмен ' + b(num(e.bmr, 0) + ' ккал') + ', с учётом активности (×' + num(e.factor, 3) + ') поддержание веса ≈ ' + b(num(e.tdee, 0) + ' ккал') + '. Цель в приложении — ' + b(num(tg.kcal, 0) + ' ккал') + (tg.auto ? ' (рассчитана автоматически под цель)' : ' (задана вручную)') + ': белки ' + num(tg.p, 0) + ' г, жиры ' + num(tg.f, 0) + ' г, углеводы ' + num(tg.c, 0) + ' г.' +
        ' Для похудения обычно берут −15–20% от поддержания, для набора массы +10%.';
    } },
    { id: 'protein_norm', re: rx('(сколько|норм)[а-я]* .*(белк|белок|протеин)[а-я]* .*(нужно|надо|в день|в сутки|норм|мне|съедать|есть|потреблять|на кг)|норм[а-я]* белк'), fn: function () {
      var e = energy(), w = weightNow(), tg = targets();
      var base = 'Для активных людей и тех, кто тренируется, — 1,6–2,2 г белка на кг веса в день; без тренировок минимум 0,8–1 г/кг.';
      if (e) return base + ' Тебе: ' + b(num(e.proteinLo, 0) + '–' + num(e.proteinHi, 0) + ' г') + ' в день, цель в приложении — ' + b(num(tg.p, 0) + ' г') + (e.adjusted ? ' (посчитано на «опорный» вес ' + e.refW + ' кг)' : '') + '. Удобно делить на 3–4 приёма по 25–40 г.';
      if (w) return base + ' При весе ' + num(w) + ' кг это ' + b(num(w * 1.6, 0) + '–' + num(w * 2.2, 0) + ' г') + ' в день.';
      return base + needProfile();
    } },
    { id: 'water_norm', re: rx('(сколько|норм)[а-я]* .*(вод[аыу]|жидкост|пить)[а-я]* .*(нужно|надо|в день|в сутки|норм|стоит|следует)|норм[а-я]* вод|сколько (нужно |надо )?пить'), fn: function () {
      var w = weightNow();
      return 'Ориентир — 30–35 мл на кг веса в день' + (w ? ' (тебе ≈ ' + b(num(Math.round(w * 30 / 50) * 50, 0) + '–' + num(Math.round(w * 35 / 50) * 50, 0) + ' мл') + ')' : '') + ', включая чай, суп и другие напитки. В жару и в дни тренировок +500–1000 мл. Простой признак — светлая моча и отсутствие жажды. Твоя цель в приложении — ' + b(num(goal('water'), 0) + ' мл') + '.';
    } },
    { id: 'sleep_norm', re: rx('сколько (нужно |надо |в норме |должен |должна )?(спать|сна)|норм[а-я]* сна|сколько часов сна'), fn: function () {
      return 'Взрослым нужно 7–9 часов сна, подросткам 8–10. Важна и регулярность: ложиться и вставать в одно время (±30 мин) даже в выходные. Твоя цель в приложении — ' + b(num(goal('sleep')) + ' ч') + '.' + chips(['Как я сплю?', 'Как быстрее заснуть?']);
    } },
    { id: 'sleep_tips', p: true, re: rx('(быстр|лучше|легче)[а-я]* (за|у)сн|не могу (за|у)снуть|не (за|у)сыпаю|трудно (за|у)сн|бессонниц|просыпаюсь (ночью|рано)|не высыпаюсь|как (на)?ладить (сон|режим)|улучшить сон|качеств[а-я]* сна|советы.*сн'), fn: function () {
      return 'Что реально помогает заснуть:<ol><li>Одно и то же время подъёма каждый день — это главный «якорь» режима.</li><li>Утром 10–15 минут дневного света, днём движение.</li><li>Кофеин — не позже 14:00, алкоголь ухудшает глубокий сон.</li><li>За час до сна — без яркого экрана и работы; прохладная (18–20 °C) тёмная спальня.</li><li>Не можешь уснуть 20 минут — встань, займись чем-то спокойным при тусклом свете и вернись, когда захочется спать.</li></ol>Если бессонница дольше 3 недель или храп с остановками дыхания — к врачу.' + chips(['Как я сплю?']);
    } },
    { id: 'fat_loss', p: true, re: rx('(как|быстро|быстрее|правильно)[а-я]* (по)?худ|сбросить|скинуть|убрать (живот|бока|жир)|сжечь жир|жиросжиган|избавиться от (живот|жир)|сушк[аиу]|похудеть'), fn: function () {
      var e = energy(), tg = targets();
      return 'Похудение = устойчивый дефицит калорий, остальное — детали:<ol><li>Дефицит 15–20% от поддержания' + (e ? ' — тебе ≈ ' + b(num(Math.round(e.tdee * 0.8 / 50) * 50, 0) + '–' + num(Math.round(e.tdee * 0.85 / 50) * 50, 0) + ' ккал') + ' в день' : '') + '. Безопасный темп — 0,5–1% веса в неделю.</li><li>Белок ' + (e ? b(num(tg.p, 0) + ' г') : '1,6–2,2 г/кг') + ' в день — сохраняет мышцы и снижает голод.</li><li>2–4 силовые тренировки в неделю + 8–10 тыс. шагов.</li><li>Сон 7+ часов: при недосыпе аппетит заметно растёт.</li><li>Взвешивайся 2–3 раза в неделю и смотри на среднее, а не на один день.</li></ol>Локально «убрать живот» упражнениями нельзя — жир уходит со всего тела.' + chips(['Как мой вес?', 'Сколько я съел сегодня?']);
    } },
    { id: 'muscle', p: true, re: rx('набрать (масс|мышц|вес)|набор (масс|мышц)|нарастить|накачать|рост мышц|(как|быстро)[а-я]* (по)?качаться|массу набрать'), fn: function () {
      var e = energy(), tg = targets();
      return 'Для набора мышц:<ol><li>Профицит 5–10% к поддержанию' + (e ? ' — ≈ ' + b(num(Math.round(e.tdee * 1.08 / 50) * 50, 0) + ' ккал') : '') + ', прибавка 0,25–0,5 кг в неделю.</li><li>Белок 1,6–2,2 г/кг' + (e ? ' (тебе ' + num(e.proteinLo, 0) + '–' + num(e.proteinHi, 0) + ' г)' : '') + '.</li><li>Силовые 3–4 раза в неделю, 10–20 рабочих подходов на группу мышц в неделю, 6–12 повторов, последние 1–3 повтора тяжёлые.</li><li>Прогрессия: добавляй вес или повтор каждую 1–2 недели — записывай подходы в «Истории».</li><li>Сон 7–9 часов.</li></ol>' + chips(['Как с тренировками?', 'Сколько белка за неделю?']);
    } },
    { id: 'protein_foods', re: rx('(где|в ч[её]м|в каких продуктах|какие продукты)[а-я ]* (много |больше всего )?белк|продукт[а-я]* (с |богат[а-я]* )?белк|богат[а-я]* белк|источник[а-я]* белк|высокобелков|больше всего белка'), fn: function () {
      var t = topProteinFoods();
      return 'Больше всего белка на 100 г (из базы приложения):<ul>' + t.byP.map(function (f) { return '<li>' + esc(f.ru) + ' — ' + b(num(f.p) + ' г') + ', ' + num(f.kcal, 0) + ' ккал</li>'; }).join('') + '</ul>' +
        'Больше белка на калорию (для похудения): ' + t.byR.map(function (f) { return esc(f.ru) + ' (' + num(f.p * 100 / f.kcal) + ' г/100 ккал)'; }).join(', ') + '.';
    } },
    { id: 'steps_norm', re: rx('сколько (нужно |надо )?(шагов|ходить)|норм[а-я]* шагов|10 ?000 шагов|10 тысяч шагов'), fn: function () {
      return 'Исследования показывают: польза для здоровья растёт примерно до 7–10 тыс. шагов в день (у людей старше 60 — до 6–8 тыс.). Для похудения 8–12 тыс. шагов — самый простой способ добавить 200–400 ккал расхода. Твоя цель — ' + b(num(goal('steps'), 0)) + '.' + chips(['Сколько я хожу?']);
    } },
    { id: 'pre_post', re: rx('(что|как|когда)[а-я ]*(есть|поесть|съесть|кушать|перекус)[а-я ]* (перед|до|после) трениров|(перед|до|после) трениров[а-я]* (есть|поесть|еда|питани|перекус)'), fn: function () {
      return 'До тренировки (за 1–2 ч): обычная еда с углеводами и белком — например, гречка с курицей или овсянка с йогуртом. Если за 30–40 мин — лёгкий перекус: банан, йогурт. После — в течение пары часов полноценный приём пищи с 25–40 г белка. «Белковое окно» 30 минут — миф: важнее общий белок за день.';
    } },
    { id: 'creatine', re: rx('креатин'), fn: function () {
      return 'Креатин моногидрат — самая изученная и эффективная спортивная добавка: 3–5 г в день, каждый день, без «загрузки», в любое время. Помогает силе и объёму мышц, безопасен для здоровых людей. Пей достаточно воды; при болезнях почек — только после консультации врача.';
    } },
    { id: 'fasting', re: rx('интервальн[а-я]* голодан|голодани[а-я]* 16|16 ?/ ?8|голодовк'), fn: function () {
      return 'Интервальное голодание (например, 16/8) работает не магией, а тем, что проще съесть меньше. По результатам исследований оно худеет так же, как обычный дефицит калорий с тем же калоражем. Подходит, если тебе удобно; не подходит при расстройствах пищевого поведения, диабете на инсулине, беременности.';
    } },
    { id: 'cardio_vs', re: rx('кардио или силов|силов[а-я]* или кардио|что лучше для похуд|бег или зал'), fn: function () {
      return 'Для похудения решает питание; из тренировок лучше всего сочетание: 2–4 силовые (сохраняют мышцы, тело выглядит подтянутым) + ходьба/кардио по желанию. Только кардио без силовых часто приводит к потере мышц вместе с жиром.';
    } },
    { id: 'freq', re: rx('сколько раз в неделю (нужно |надо )?(тренир|заниматься|качаться)|как часто (нужно |надо )?(тренир|заниматься)'), fn: function () {
      return 'Новичкам — 2–3 силовые тренировки на всё тело в неделю, продвинутым — 3–5. Каждую мышцу полезно нагружать 2 раза в неделю. Плюс ВОЗ рекомендует 150–300 минут умеренной активности в неделю.' + chips(['Как с тренировками?']);
    } },
    { id: 'bmi', re: rx('что такое имт|индекс массы|как (по)?считать имт'), fn: function () {
      return 'ИМТ = вес (кг) / рост² (м). 18,5–25 — норма, 25–30 — избыточный вес, 30+ — ожирение. Он не различает мышцы и жир, поэтому у тренированных людей может быть «завышен»; объём талии (до 94 см у мужчин и 80 см у женщин) — полезное дополнение.' + chips(['Как мой вес?']);
    } },
    { id: 'jaw_how', p: true, re: rx('мьюинг|mewing|как (сделать|подчеркнуть|улучшить|получить|выделить)[а-я]* (скул|челюст|лини|овал)|острые скулы|двойн[а-я]* подбород|как убрать (второй |двойной )?подбород'), fn: function () {
      var j = window.JawModule && window.JawModule.stats ? window.JawModule.stats() : null;
      return 'Честно о линии челюсти: сильнее всего на неё влияет процент жира — при снижении веса контур становится чётче. Помогают также осанка (голова не вынесена вперёд), язык у нёба (мьюинг — это поза покоя, а не «упражнение, перестраивающее кости»), меньше соли и алкоголя вечером (отёки) и достаточный сон. Упражнения для шеи и подбородка укрепляют мышцы и улучшают осанку за 2–4 недели.' +
        (j ? ' Твой прогресс в программе: ' + b(j.done + ' из ' + j.total) + ' дней.' : '') + chips(['Как идёт челюсть?']);
    } },
    { id: 'skin_how', p: true, re: rx('(как|чем)[а-я ]*(ухаживать|убрать|избавиться|лечить)[а-я ]*(кож|лиц|прыщ|акне|черн[а-я]* точк)|нужен ли spf|какой spf|зачем spf|от прыщей|черные точки|расширенные поры'), fn: function () {
      var s = window.SkinModule && window.SkinModule.stats ? window.SkinModule.stats() : null;
      return 'Базовый уход, который работает для всех: мягкое умывание утром и вечером, увлажняющий крем, SPF 30–50 каждое утро. При прыщах и чёрных точках — салициловая кислота (BHA 0,5–2%) или азелаиновая кислота, ретиноиды вечером (начинать 2–3 раза в неделю). Не выдавливай воспаления. Если акне болезненное, оставляет рубцы или не проходит за 2–3 месяца — к дерматологу.' +
        (s && s.type ? ' Твой тип кожи по тесту: ' + b(s.typeName) + '.' : ' Определи тип кожи тестом во вкладке «Лицо».') + chips(['Уход за кожей']);
    } },
    { id: 'alcohol', re: rx('алкогол|(^|\\s)пиво\\b|вредно ли (пить|вино)|сколько калорий в водке'), fn: function () {
      return 'Алкоголь — 7 ккал на грамм, плюс он ухудшает сон, восстановление и снижает контроль над едой. Безопасной дозы для здоровья нет; если пьёшь — реже и меньше, не на ночь перед тренировкой. Калории напитков: бокал сухого вина (150 мл) ≈ 110 ккал, пиво 0,5 л ≈ 210 ккал, 50 мл водки ≈ 115 ккал.';
    } },
    { id: 'sugar', re: rx('(сколько|норм)[а-я]* сахар|сахар (вреден|вредно)|вред сахара|можно ли сладкое'), fn: function () {
      return 'ВОЗ советует не более 10% калорий из добавленного сахара (≈ 50 г в день), лучше до 5% (≈ 25 г). Сахар в фруктах и молоке сюда не входит. Сладкое можно и на диете — главное, чтобы укладывалось в калории и не вытесняло белок и овощи.';
    } },
    { id: 'metabolism', re: rx('метаболизм|обмен веществ|разогнать обмен'), fn: function () {
      var e = energy();
      return 'Обмен веществ в основном определяется весом, мышечной массой, ростом, возрастом и активностью. «Разогнать» его заметно можно только движением (шаги, тренировки) и мышцами; чаи и «жиросжигатели» дают копейки.' + (e ? ' Твой базовый обмен по формуле ≈ ' + b(num(e.bmr, 0) + ' ккал') + ', с активностью ≈ ' + num(e.tdee, 0) + '.' : '');
    } }
  ];
  function kbAnswer(q) {
    var personal = rx('(^|\\s)(я|съел[аи]?|поел[аи]?|выпил[аи]?|ем|пью)\\b').test(q);
    for (var i = 0; i < KB.length; i++) { if (personal && !KB[i].p) continue; if (KB[i].re.test(q)) return { h: KB[i].fn(q), kb: KB[i].id }; }
    return null;
  }

  /* ================= v8: activity history questions («что я делал в среду», «сколько раз я жал на прошлой неделе») ================= */
  var HM = function () { return window.HistoryModule; };
  var WD = [[rx('воскресень[ея]'), 0], [rx('понедельник'), 1], [rx('вторник'), 2], [rx('сред[ау]\\b'), 3], [rx('четверг'), 4], [rx('пятниц[ау]'), 5], [rx('суббот[ау]'), 6]];
  var MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[яй]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  function dayRef(q) {
    var a = A(), t0 = a.today();
    if (/позавчера/.test(q)) return a.toKey(a.addDays(t0, -2));
    if (/вчера/.test(q)) return a.toKey(a.addDays(t0, -1));
    if (/сегодня/.test(q)) return a.todayKey();
    for (var i = 0; i < WD.length; i++) if (WD[i][0].test(q)) {
      var back = (t0.getDay() - WD[i][1] + 7) % 7;
      if (/прошл[а-я]* /.test(q) && back === 0) back = 7; else if (/прошл[а-я]* (недел|понедел|вторн|сред|четв|пятн|субб|воскр)/.test(q) && !/на прошлой неделе/.test(q)) back += back === 0 ? 7 : 0;
      if (/на прошлой неделе/.test(q)) { var wdT = (t0.getDay() + 6) % 7, wdX = (WD[i][1] + 6) % 7; back = wdT - wdX + 7; }
      return a.toKey(a.addDays(t0, -back));
    }
    var m = /(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/.exec(q), y = t0.getFullYear(), d, mo;
    if (m) { d = +m[1]; mo = +m[2] - 1; if (m[3]) y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
    else {
      for (var j = 0; j < 12; j++) { var mm = new RegExp('(\\d{1,2})\\s+' + MONTHS[j]).exec(q); if (mm) { d = +mm[1]; mo = j; break; } }
    }
    if (d && mo >= 0 && mo < 12 && d <= 31) {
      var dt = new Date(y, mo, d, 12); if (!m || !m[3]) { if (dt > t0) dt.setFullYear(y - 1); }
      return a.toKey(dt);
    }
    return null;
  }
  function rangeRef(q) {
    var a = A(), t0 = a.today(), tk = a.todayKey(), wd = (t0.getDay() + 6) % 7;
    var mon = a.addDays(t0, -wd);
    if (/прошл[а-я]* недел/.test(q)) return { k1: a.toKey(a.addDays(mon, -7)), k2: a.toKey(a.addDays(mon, -1)), lbl: 'на прошлой неделе' };
    if (/(эт[уо][йм]?|текущ[а-я]*) недел/.test(q)) return { k1: a.toKey(mon), k2: tk, lbl: 'на этой неделе' };
    if (/недел|7 дн/.test(q)) return { k1: a.toKey(a.addDays(t0, -6)), k2: tk, lbl: 'за 7 дней' };
    if (/прошл[а-я]* месяц/.test(q)) { var f = new Date(t0.getFullYear(), t0.getMonth() - 1, 1, 12), l = new Date(t0.getFullYear(), t0.getMonth(), 0, 12); return { k1: a.toKey(f), k2: a.toKey(l), lbl: 'в прошлом месяце' }; }
    if (/месяц|30 дн/.test(q)) return { k1: a.toKey(a.addDays(t0, -29)), k2: tk, lbl: 'за 30 дней' };
    if (/(за )?(вс[её] время|всю историю|всегда|когда-либо|рекорд)/.test(q)) return { k1: '0000-00-00', k2: tk, lbl: 'за всё время' };
    var d = dayRef(q); if (d) return { k1: d, k2: d, lbl: (HM() ? HM().fmtDay(d).toLowerCase() : d), day: true };
    return null;
  }
  var EX_VERBS = [[/(^| )(жал[аи]?|жму|жмешь|жать|выжал[аи]?)( |$)/, 'жим'], [/присед/, 'присед'], [/подтяг/, 'подтяг'], [/отжим/, 'отжим'], [/(^| )(тянул[аи]?|тяну)( |$)/, 'тяг'], [/(^| )бегал|(^| )бег( |$)|пробежал/, 'бег'], [/планк/, 'планк'], [/выпад/, 'выпад'], [/становую|становая|становой/, 'станов'], [/(^| )пресс( |$)|скручиван/, 'скручиван'], [/бицепс/, 'бицепс'], [/трицепс/, 'трицепс'], [/ягодичн|мостик/, 'ягодичн']];
  function matchExercises(q) {
    var a = A(); if (!a || !a.exercises) return [];
    var stems = q.split(' ').filter(function (w) { return w.length >= 3 && !STOP[w]; }).map(stem);
    EX_VERBS.forEach(function (v) { if (v[0].test(q)) stems.push(v[1]); });
    var done = HM() ? HM().doneExercises().map(function (e) { return e.id; }) : [];
    var pool = a.exercises().filter(function (x) { return done.indexOf(x.id) >= 0; });
    var hit = function (x) {
      var ws = fnorm(x.ru).split(' ');
      return stems.some(function (s) { return s.length >= 3 && ws.some(function (w) { return w.indexOf(s) === 0 && !/^(на|в|с|со|от|для|из)$/.test(w); }) && !/^(раз|подход|повтор|недел|прошл|сколько|сделал|делал|лучш|рекорд|максим|прогресс|какой|вес|весом|кг)/.test(s); });
    };
    return pool.filter(hit);
  }
  function ansHistoryDay(k) {
    var a = A(), h = HM(), out = [], lbl = h ? h.fmtDay(k) : k;
    if (!h) return 'История недоступна.';
    var ws = h.workoutsBetween(k, k), jw = h.jaw().filter(function (j) { return j.date === k; }), sk = h.skin().filter(function (s) { return s.date === k; })[0];
    ws.forEach(function (w) {
      out.push('🏋️ ' + b(esc(w.title)) + (w.start && w.src !== 'manual' ? ' в ' + h.fmtTime(w.start) : '') + ', ' + w.dur + ' мин:<ul>' + w.ex.map(function (e) { return '<li>' + esc(h.exName(e)) + ' — ' + esc(h.setsStr(e)) + '</li>'; }).join('') + '</ul>' +
        (h.tonnage(w) ? 'Тоннаж ' + b(num(Math.round(h.tonnage(w)), 0) + ' кг') + ', ' : '') + h.setCount(w) + ' ' + plural(h.setCount(w), 'подход', 'подхода', 'подходов') + '.');
    });
    jw.forEach(function (j) { out.push('💪 Челюсть: ' + b('день ' + j.day) + (j.at ? ' в ' + h.fmtTime(j.at) : '') + ', ≈ ' + j.minutes + ' мин.'); });
    if (sk) out.push('🧴 Уход за кожей: ' + sk.steps.map(function (s) { return esc(s.t); }).join(', ') + (sk.full ? ' — весь уход выполнен ✓' : '') + '.');
    var d = a.data(), extra = [];
    if (!ws.length && d.workout && d.workout[k]) extra.push('тренировка ' + b(num(d.workout[k], 0) + ' мин') + ' (отмечено без подходов)');
    if (d.steps && d.steps[k] !== undefined) extra.push('шаги ' + b(num(d.steps[k], 0)));
    if (d.sleep && d.sleep[k] !== undefined) extra.push('сон ' + b(num(d.sleep[k]) + ' ч'));
    var ft = foodDay(k).length ? foodTot(k) : null; if (ft) extra.push('еда ' + b(num(ft.kcal, 0) + ' ккал') + ', белок ' + num(ft.p, 0) + ' г');
    var noAct = !out.length;
    if (extra.length) out.push((noAct ? 'Тренировок, челюсти и ухода в истории за этот день нет. Отмечено: ' : 'Ещё в этот день: ') + extra.join(', ') + '.');
    if (!out.length) return lbl + ': записей нет — ни тренировок, ни челюсти, ни ухода. ' + (k < a.todayKey() ? 'Прошедшую тренировку можно добавить в «Истории» → «＋ Прошедшая тренировка».' : '') + chips(['Что я делал вчера?', 'Тренировки на этой неделе']);
    return b(lbl) + ':<br>' + out.join('<br>') + '<div class="ai-inchips"><a class="qa-chip" href="#history/day/' + k + '">Открыть день в истории</a></div>';
  }
  function ansHistoryRange(r) {
    var h = HM(); if (!h) return 'История недоступна.';
    var ws = h.workoutsBetween(r.k1, r.k2), jw = h.jaw().filter(function (j) { return j.date >= r.k1 && j.date <= r.k2; });
    if (!ws.length && !jw.length) return cap(r.lbl) + ' в истории нет тренировок. Начинай тренировку кнопкой «▶ Начать» в программе — подходы и веса сохранятся автоматически.' + chips(['Итоги недели']);
    var mins = ws.reduce(function (n, w) { return n + w.dur; }, 0), ton = ws.reduce(function (n, w) { return n + h.tonnage(w); }, 0);
    var out = cap(r.lbl) + ': ' + b(ws.length + ' ' + plural(ws.length, 'тренировка', 'тренировки', 'тренировок')) + ', ' + b(mins + ' мин') + (ton ? ', тоннаж ' + b(num(Math.round(ton), 0) + ' кг') : '') + '.';
    if (ws.length) out += '<ul>' + ws.map(function (w) { return '<li>' + h.fmtDay(w.date) + (w.start && w.src !== 'manual' ? ', ' + h.fmtTime(w.start) : '') + ' — ' + esc(w.title) + ' (' + w.dur + ' мин): ' + w.ex.map(function (e) { return esc(h.exName(e)); }).join(', ') + '</li>'; }).join('') + '</ul>';
    if (jw.length) out += 'Челюсть: ' + jw.length + ' ' + plural(jw.length, 'сессия', 'сессии', 'сессий') + ' (' + jw.map(function (j) { return 'день ' + j.day; }).join(', ') + ').';
    return out;
  }
  function ansExerciseStats(list, r, q) {
    var h = HM(), out = [], any = false;
    var wantBest = /рекорд|максим|лучш|прогресс|сколько (максимум|кг)|какой (вес|максимум)|с каким весом/.test(q);
    list.slice(0, 4).forEach(function (x) {
      var ss = h.exSessions(x.id).filter(function (s) { return s.w.date >= r.k1 && s.w.date <= r.k2; }), all = h.exSessions(x.id);
      if (!ss.length && !wantBest) { out.push(esc(x.ru) + ': ' + r.lbl + ' не было.' + (all.length ? ' Последний раз — ' + h.fmtDay(all[all.length - 1].w.date).toLowerCase() + ': ' + esc(h.setsStr(all[all.length - 1].e)) + '.' : '')); return; }
      any = true;
      var src = ss.length ? ss : all, sets = 0, reps = 0, ton = 0;
      src.forEach(function (s) { s.e.sets.forEach(function (st) { sets++; reps += st.r || 0; ton += (st.w || 0) * (st.r || 0); }); });
      var best = h.bestOf(src), bestAll = h.bestOf(all);
      out.push(b(esc(x.ru)) + ' ' + (ss.length ? r.lbl : 'за всё время') + ': ' + b(src.length + ' ' + plural(src.length, 'раз', 'раза', 'раз')) + ' (' + src.map(function (s) { var dd = A().parseKey(s.w.date); return WDN[dd.getDay()] + ' ' + dd.getDate() + '.' + String(dd.getMonth() + 1).padStart(2, '0'); }).join(', ') + '), ' +
        sets + ' ' + plural(sets, 'подход', 'подхода', 'подходов') + (reps ? ', ' + reps + ' повт.' : '') + (ton ? ', тоннаж ' + num(Math.round(ton), 0) + ' кг' : '') + '. ' +
        'Лучший подход: ' + b(h.setStr(best.s, best.k)) + (bestAll && bestAll.sc > best.sc ? ' (рекорд за всё время — ' + h.setStr(bestAll.s, bestAll.k) + ', ' + h.fmtDay(bestAll.date).toLowerCase() + ')' : '') + '.' +
        ' Последний раз: ' + esc(h.setsStr(src[src.length - 1].e)) + '.');
    });
    var links = list.slice(0, 3).map(function (x) { return '<a class="qa-chip" href="#history/ex/' + encodeURIComponent(x.id) + '">' + esc(x.ru) + ' — история</a>'; }).join('');
    return out.join('<br>').replace(/\.\./g, '.').replace(/\.(<\/b>)\./g, '.$1') + (links ? '<div class="ai-inchips">' + links + '</div>' : '') + (any ? '' : '');
  }
  function historyAnswer(q) {
    if (!HM()) return null;
    var exQ = /сколько (раз|подход|повтор)|рекорд|максимум|лучш[а-я]* (подход|результат|вес)|прогресс|с каким весом|какой (вес|максимум)|сколько (кг|килограмм)/.test(q);
    var actQ = /(что|чем)[а-я ]* (делал|занимал|тренировал|было)|какая (была )?тренировк|как прошла тренировк|истори[яию]|(^| )тренировал(ся|ась)|когда (я )?(последний раз|в последний раз)|делал[аи]? ли|(^| )был[аи]? ли тренировк/.test(q);
    var exs = matchExercises(q);
    if (exs.length && (exQ || actQ || EX_VERBS.some(function (v) { return v[0].test(q); }))) {
      var r = rangeRef(q) || (/(когда|последний раз)/.test(q) ? { k1: '0000-00-00', k2: A().todayKey(), lbl: 'за всё время' } : { k1: A().toKey(A().addDays(A().today(), -29)), k2: A().todayKey(), lbl: 'за 30 дней' });
      return { h: ansExerciseStats(exs, r, q), kind: 'history' };
    }
    if (actQ || (exQ && /трениров/.test(q)) || /(^| )тренировки (на|за) (эт|прошл)/.test(q)) {
      var d = dayRef(q);
      if (d && !/недел|месяц/.test(q.replace(/на прошлой неделе/, ''))) return { h: ansHistoryDay(d), kind: 'history' };
      var rr = rangeRef(q) || { k1: A().toKey(A().addDays(A().today(), -6)), k2: A().todayKey(), lbl: 'за 7 дней' };
      return { h: rr.day ? ansHistoryDay(rr.k1) : ansHistoryRange(rr), kind: 'history' };
    }
    if (exQ && exs.length === 0 && /(жим|присед|подтяг|станов|тяг|отжим)/.test(q)) return { h: 'В истории пока нет записей этого упражнения. Отмечай подходы во время тренировки («▶ Начать» в программе) или добавь прошедшую тренировку вручную в «Истории».', kind: 'history' };
    return null;
  }

  /* ================= router with context, follow-ups and non-repeating fallback ================= */
  function ansHelp() {
    return 'Я анализирую твои данные на этом устройстве — сон (и время отбоя/подъёма), воду, шаги, тренировки и их историю (подходы и веса), вес и его прогноз, замеры, питание (КБЖУ), программу для челюсти и уход за кожей — и знаю калорийность 800+ продуктов. Спрашивай: «как я сплю», «итоги недели», «есть связь сна и настроения?», «когда я дойду до цели по весу», «что я делал в среду», «калории в мраморной говядине», «что улучшить».';
  }
  var FOLLOW = rx('^(ответь( же)?( на (мой |этот )?вопрос)?|ну( и| так| же)?|и|а|так|и что|и\\?|ну и\\?|подробнее|а подробнее|поподробнее|расскажи подробнее|объясни подробнее|еще|ещё|а еще|дальше|продолжай|продолжи|поясни|объясни|не понял[а]?|непонятно|в смысле|что|чего|ок и|почему|а почему|зачем|а точнее|точнее)$');
  function fallback(q) {
    var c = S.ctx;
    c.fb = (c.fb || 0) + 1;
    var it = intentOf(q), guess = [];
    if (/ед|ел|кал|бел|жир|угл|продукт|блюд/.test(q)) guess = ['Калории в гречке', 'Сколько я съел сегодня?', 'Сколько белка мне нужно?'];
    else if (/трен|зал|упраж|спорт/.test(q)) guess = ['Что я делал вчера?', 'Тренировки на этой неделе', 'Как с тренировками?'];
    else if (/сон|сп/.test(q)) guess = ['Как я сплю?', 'Как быстрее заснуть?'];
    else guess = ['Итоги недели', 'Что улучшить?', 'Калории в мраморной говядине'];
    if (c.fb % 2 === 1) return 'Не нашёл ответа на «' + esc(q.slice(0, 60)) + '» в своих данных и базе продуктов 🙂 Если это продукт — напиши название проще (например, «говядина», «стейк», «шаурма»). Если про твои данные — назови тему: сон, еда, вес, тренировки, история, челюсть, кожа.' + (it ? '' : '') + chips(guess);
    return 'Похоже, вопрос вне того, что я умею без интернета. Встроенный анализатор отвечает про: <ul><li>твои данные — «как я сплю», «итоги недели», «что я делал в среду»;</li><li>продукты — «сколько белка в 200 г курицы», «КБЖУ банана», «гречка или рис»;</li><li>нормы и советы — «сколько воды пить», «как похудеть», «как набрать массу».</li></ul>' +
      (cloudOn() ? '' : 'Для свободного разговора на любые темы подключи облачный ИИ в ⚙️ настройках (нужен ключ OpenRouter).') + chips(guess.slice(0, 2).concat(['Что ты умеешь?']));
  }
  // returns { h: html, kind }
  function route(q, raw) {
    var c = S.ctx, r;
    if (!q) return { h: ansHelp(), kind: 'help' };
    // context follow-ups: «ответь на вопрос», «подробнее», «а в курице?»
    if (FOLLOW.test(q) || /^ответь/.test(q)) {
      if (!c.lastQ) return { h: 'Конечно! Задай вопрос — например, «сколько калорий в гречке?» или «как я сплю?».' + chips(['Калории в гречке', 'Как я сплю?', 'Что улучшить?']), kind: 'help', keep: true };
      if (c.lastKind === 'food' && c.lastFood) {
        var pq0 = parseFoodQ(c.lastQ), rs0 = searchDB(pq0.words);
        if (rs0.list.length) return { h: ansFoodMore(rs0, pq0), kind: 'food', keep: true };
      }
      if (c.lastKind === 'fallback') {
        var pqL = parseFoodQ(c.lastQ), rsL = searchDB(pqL.words, { loose: true });
        if (rsL.list.length) return { h: 'Попробую ответить точнее на «' + esc(c.lastQ.slice(0, 60)) + '». Ближайшее в базе продуктов:<br>' + ansFoodInfo(rsL, pqL), kind: 'food', food: rsL.list[0].id, keep: true };
        return { h: fallback(c.lastQ), kind: 'fallback', keep: true };
      }
      var prev = route(c.lastQ, c.lastQ);
      return { h: prev.h + (MORE[prev.kind] ? '<br>' + MORE[prev.kind] : ''), kind: prev.kind, food: prev.food, keep: true };
    }
    var fm = /^(а|и|ну а|а если|а вот|а для|а у|а теперь|теперь)\s+(.+)$/.exec(q);
    if (fm && c.lastKind === 'food') {
      var rest = fm[2], pqF = parseFoodQ(rest);
      if (!pqF.focus && c.focus) pqF.focus = c.focus;
      if (!pqF.g && !pqF.n && c.lastG) pqF.g = c.lastG;
      if (pqF.words.length) { var rsF = searchDB(pqF.words); if (rsF.list.length && !rsF.info.best.miss) return { h: ansFoodInfo(rsF, pqF), kind: 'food', food: rsF.list[0].id, focus: pqF.focus, g: pqF.g }; }
      else if (pqF.g || pqF.n) { var pqP = parseFoodQ(c.lastQ); pqP.g = pqF.g; pqP.n = pqF.n; pqP.unitG = pqF.unitG; if (pqF.focus) pqP.focus = pqF.focus; var rsP = searchDB(pqP.words); if (rsP.list.length) return { h: ansFoodInfo(rsP, pqP), kind: 'food', food: rsP.list[0].id, g: pqP.g, keepQ: true }; }
    }
    if (/(^| )(или|vs|против|либо)( |$)|^сравни/.test(q)) { var cmp = compareFoods(q); if (cmp) return { h: cmp.h, kind: 'food', food: cmp.food }; }
    var hist = historyAnswer(q); if (hist) return hist;
    var kb = kbAnswer(q); if (kb) return { h: kb.h, kind: 'kb:' + kb.kb };
    var pq = parseFoodQ(q), personal = PERSONAL.test(q);
    if (pq.words.length && !personal) {
      var rs = searchDB(pq.words);
      var allKnown = rs.info.known === rs.info.words;
      if (rs.list.length && !rs.info.best.miss && (pq.nutri || (allKnown && pq.words.length <= 4 && !intentOf(q)))) return { h: ansFoodInfo(rs, pq), kind: 'food', food: rs.list[0].id, focus: pq.focus, g: pq.g };
    }
    var it = intentOf(q), sc = scopeOf(q);
    switch (it) {
      case 'help': return { h: ansHelp(), kind: 'help' };
      case 'improve': return { h: ansImprove(), kind: 'improve' };
      case 'weekrep': return { h: ansWeekRep(), kind: 'summary' };
      case 'insights': return { h: ansInsights(), kind: 'summary' };
      case 'forecast': return { h: ansForecast(), kind: 'weight' };
      case 'measure': return { h: ansMeasure(), kind: 'weight' };
      case 'regular': return { h: ansRegular(), kind: 'sleep' };
      case 'summary': return { h: ansSummary(), kind: 'summary' };
      case 'jaw': return { h: ansJaw(), kind: 'jaw' };
      case 'skin': return { h: ansSkin(), kind: 'skin' };
      case 'protein': return { h: ansFood(q, sc, 'p'), kind: 'myfood' };
      case 'fat': return { h: ansFood(q, sc, 'f'), kind: 'myfood' };
      case 'carbs': return { h: ansFood(q, sc, 'c'), kind: 'myfood' };
      case 'food': return { h: ansFood(q, sc, null), kind: 'myfood' };
      case 'water': return { h: ansWater(), kind: 'water' };
      case 'steps': return { h: ansSteps(), kind: 'steps' };
      case 'workout': return { h: ansWorkout() + (HM() && HM().count() ? chips(['Тренировки на этой неделе', 'Что я делал вчера?']) : ''), kind: 'workout' };
      case 'weight': return { h: ansWeight(), kind: 'weight' };
      case 'mood': return { h: ansMood(), kind: 'mood' };
      case 'sleep': return { h: ansSleep(), kind: 'sleep' };
    }
    if (sc) return { h: ansSummary(), kind: 'summary' };
    // last resort: any food that matches (loose)
    if (pq.words.length && (pq.nutri || pq.words.length <= 2)) {
      var rl = searchDB(pq.words, { loose: true });
      if (rl.list.length && rl.top[0].miss < pq.words.length) return { h: 'Точного совпадения нет, ближайшее в базе продуктов:<br>' + ansFoodInfo(rl, pq), kind: 'food', food: rl.list[0].id, focus: pq.focus };
    }
    return { h: fallback(q), kind: 'fallback' };
  }
  var MORE = {
    sleep: 'Ещё: дневной сон — не дольше 20–30 минут и до 15:00; кофеин держится в крови 5–7 часов.',
    myfood: 'Ещё: проще всего добрать норму, если в каждом приёме пищи есть белковый продукт и овощи.',
    weight: 'Ещё: вес колеблется на 0,5–1,5 кг за день из-за воды и соли — смотри на средние за неделю.',
    workout: 'Ещё: прогрессия — главный двигатель результата. Записывай подходы и раз в 1–2 недели добавляй вес или повтор.',
    water: 'Ещё: кофе и чай тоже считаются в водный баланс.',
    steps: 'Ещё: короткие прогулки после еды по 10 минут помогают и шагам, и сахару крови.',
    improve: 'Начни с одного пункта и делай его 2 недели — так привычка закрепляется надёжнее.',
    summary: 'Спроси подробнее про любую строку — например, «как я сплю» или «сколько белка за неделю».',
    history: 'Подробности по каждому упражнению — в «Истории» → «Мои упражнения».'
  };
  function answerFull(text) {
    var q = norm(text);
    if (!A()) return { h: 'Данные ещё загружаются, попробуй через секунду.', kind: 'wait' };
    var r = route(q, text), c = S.ctx;
    if (r.kind !== 'fallback') c.fb = 0;
    if (!r.keep) { c.lastQ = q; c.lastKind = r.kind; c.lastFood = r.food || null; c.focus = r.focus || null; c.lastG = r.g || null; }
    else if (r.kind === 'food' && r.food) { c.lastKind = 'food'; c.lastFood = r.food; }
    if (r.keepQ) { c.lastKind = 'food'; }
    return r;
  }
  function answer(text) { return answerFull(text).h; }
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

  /* ================= cloud LLM (OpenRouter or any OpenAI-compatible API) ================= */
  var WDN = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  function dataSummary() {
    var a = A(), st = a.settings(), tg = targets(), e = energy(), pr = a.profile ? a.profile() : {}, lines = [];
    var goalName = { fat_loss: 'похудение', muscle: 'набор мышц', general: 'общая форма' }[pr.goal] || 'общая форма';
    lines.push('Профиль: возраст ' + (pr.age || '?') + ', пол ' + (st.sex === 'm' ? 'м' : st.sex === 'f' ? 'ж' : '?') + ', рост ' + (pr.height || '?') + ' см, текущий вес ' + (weightNow() || '?') + ' кг, цель тренировок: ' + goalName + '.');
    lines.push('Цели: сон ' + goal('sleep') + ' ч, вода ' + goal('water') + ' мл, шаги ' + goal('steps') + ', тренировка ' + goal('workout') + ' мин/день, вес ' + (st.goals.weight || '—') + ' кг. Норма питания: ' + tg.kcal + ' ккал, Б ' + tg.p + ' г, Ж ' + tg.f + ' г, У ' + tg.c + ' г' + (e ? ' (BMR ' + e.bmr + ', поддержание ' + e.tdee + ')' : '') + '.');
    lines.push('По дням за 30 дней (только дни с записями; дата день-недели: сон ч | вода мл | шаги | трен. мин | вес кг | настроение 1-5 | еда ккал Б/Ж/У):');
    var d = a.data(), n = 0;
    keysBack(30, 0).forEach(function (k) {
      var hasF = foodDay(k).length, f = hasF ? foodTot(k) : null;
      var g = function (id) { return d[id] && d[id][k] !== undefined ? d[id][k] : '-'; };
      var row = [g('sleep'), g('water'), g('steps'), g('workout'), g('weight'), g('mood'), f ? Math.round(f.kcal) + ' ' + Math.round(f.p) + '/' + Math.round(f.f) + '/' + Math.round(f.c) : '-'];
      if (row.every(function (x) { return x === '-'; })) return;
      n++; lines.push(k + ' ' + WDN[a.parseKey(k).getDay()] + ': ' + row.join(' | '));
    });
    if (!n) lines.push('(записей нет)');
    [0, 1].forEach(function (off) {
      var k = keysBack(1, off)[0], list = foodDay(k);
      if (list.length) lines.push('Еда ' + (off ? 'вчера' : 'сегодня') + ': ' + list.slice(0, 25).map(function (x) { return a.entryName(x) + (x.g ? ' ' + x.g + 'г' : '') + ' ' + Math.round(x.kcal) + 'ккал Б' + Math.round(x.p) + (x.fib !== undefined ? ' клетч' + x.fib : ''); }).join('; '));
    });
    var wd = d.weight || {}, wks = Object.keys(wd).sort();
    if (wks.length) lines.push('Вес: последний ' + wd[wks[wks.length - 1]] + ' кг (' + wks[wks.length - 1] + ')' + (wks.length > 1 ? ', первый в истории ' + wd[wks[0]] + ' кг (' + wks[0] + ')' : '') + '.');
    var h = HM() ? HM().forAI(30) : '';
    lines.push('История тренировок и активностей за 30 дней (подходы: вес кг × повторы):' + (h ? '\n' + h : ' нет записей.'));
    var ps = a.plan && a.plan();
    if (ps && ps.plan) lines.push('Программа тренировок: ' + ps.plan.days.length + ' дн/нед: ' + ps.plan.days.map(function (dd) { return (a.dayTitle ? a.dayTitle(dd) : dd.tpl) + ' (' + dd.items.filter(function (it) { return it.k !== 'w'; }).map(function (it) { var x = a.exById ? a.exById(it.id) : null; return x ? x.ru : it.id; }).join(', ') + ')'; }).join('; ') + '.');
    var j = window.JawModule && window.JawModule.stats ? window.JawModule.stats() : null;
    if (j) lines.push('Программа «Челюсть 30 дней»: выполнено ' + j.done + '/' + j.total + ', текущий день ' + Math.min(j.cur, j.total) + ', серия ' + j.streak + ', привычки сегодня ' + j.habitsToday + '/' + j.habitsTotal + '.');
    var sk = window.SkinModule && window.SkinModule.stats ? window.SkinModule.stats() : null;
    if (sk) lines.push('Уход за кожей: тип ' + (sk.typeName || 'не определён') + (sk.acne ? ', склонность к акне' : '') + ', сегодня ' + sk.doneToday + '/' + sk.reqToday + ' шагов, серия ' + sk.streak + ', за 7 дней полностью ' + sk.last7 + '/7.');
    // v9: own goals, sleep times, weekly summary, forecast, observations, measurements, next-weight hints
    try {
      var V = window.V9;
      if (V) {
        var off = ['sleep', 'water', 'steps', 'workout', 'weight', 'mood'].filter(function (id) { return !V.goalOn(id); });
        if (off.length) lines.push('Пользователь не отслеживает (выключил): ' + off.map(function (id) { return V.NAMES[id]; }).join(', ') + ' — не советуй про это, если не спросит.');
        lines.push(V.weekText(V.weekStats(V.defaultWeek())));
      }
      var SL = window.V9Sleep;
      if (SL) {
        var st2 = SL.all(), sk2 = Object.keys(st2).sort().slice(-14);
        if (sk2.length) lines.push('Время сна (ночь: отбой–подъём, качество 1–3): ' + sk2.map(function (k) { return k + ' ' + st2[k].b + '–' + st2[k].w + (st2[k].q ? ' q' + st2[k].q : ''); }).join('; ') + '. ' + (SL.regText(SL.regularity(14)) || ''));
      }
      if (window.V9Insights) { var it2 = window.V9Insights.text(); if (it2) lines.push('Посчитано приложением (без ИИ):\n' + it2); }
      if (window.V9Body) { var bt = window.V9Body.text(); if (bt) lines.push(bt); }
      if (HM() && HM().suggest && ps && ps.plan) {
        var sg = [];
        ps.plan.days.forEach(function (dd) { dd.items.forEach(function (it) { if (it.k === 'w' || sg.length >= 6) return; var x = HM().suggest(it.id, it); if (x && sg.indexOf(x.text) < 0) sg.push((a.exById && a.exById(it.id) ? a.exById(it.id).ru : it.id) + ': ' + x.text); }); });
        if (sg.length) lines.push('Подсказки следующего веса (двойная прогрессия): ' + sg.join('; ') + '.');
      }
    } catch (e) { /* the summary must never break the chat */ }
    return lines.join('\n');
  }
  function htmlToText(hh) {
    return String(hh || '').replace(/<br\s*\/?>/g, '\n').replace(/<li>/g, '\n- ').replace(/<\/(p|ul|ol|div)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  }
  function photoText(P) { return P ? '[Фото еды. Распознано: ' + P.items.map(function (it) { var v = itemVals(it); return it.name + ' ' + Math.round(it.g) + ' г ≈ ' + Math.round(v.kcal) + ' ккал'; }).join('; ') + (P.added ? ' — добавлено в дневник' : '') + ']' : '[фото]'; }
  function systemPrompt(local, foodRef) {
    var a = A(), now = new Date();
    var p = 'Ты — ИИ-ассистент приложения «Здоровье» (трекер сна, питания и КБЖУ, тренировок с историей подходов, веса, программы «Челюсть 30 дней» и ухода за кожей). Сегодня ' +
      now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + '.\n' +
      'Правила:\n- Отвечай по-русски, на «ты», дружелюбно, живо и по делу. Обычно 2–8 предложений или короткий список; подробно — если просят.\n' +
      '- Если вопрос о пользователе, опирайся на ЕГО данные ниже и называй конкретные числа и даты (например: «в среду, 8 октября, ты спал 6,5 ч, а жим был 55 кг × 8»). Не выдумывай данные, которых нет: если записей нет — скажи об этом и подскажи, где их внести в приложении.\n' +
      '- «Справка встроенного анализатора» — уже посчитанные точные цифры по текущему вопросу; используй их и не противоречь им. Калорийность продуктов бери из «Справки базы продуктов», если она есть.\n' +
      '- Можно свободно разговаривать на любые темы, не только о здоровье. Не давай опасных советов; ты не врач — при тревожных симптомах советуй обратиться к врачу.\n' +
      '- Формат: простой текст, **жирный** для ключевых чисел, списки строками «- ». Без таблиц и заголовков.\n\n' +
      'ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:\n' + dataSummary();
    if (foodRef) p += '\n\nСправка базы продуктов приложения (на 100 г): ' + foodRef;
    if (local) p += '\n\nСправка встроенного анализатора по текущему вопросу:\n' + local;
    return p;
  }
  function foodRefFor(q) {
    var pq = parseFoodQ(norm(q)); if (!pq.words.length) return '';
    var rs = searchDB(pq.words); if (!rs.list.length || rs.info.best.miss) return '';
    return rs.list.slice(0, 4).map(function (f) { return f.ru + ': ' + f.kcal + ' ккал, Б ' + f.p + ', Ж ' + f.f + ', У ' + f.c + (f.por ? ', типичная порция ' + f.por + ' ' + unitOf(f) : ''); }).join('; ');
  }
  function historyMsgs(n) {
    return S.msgs.slice(-n).map(function (m) {
      return { role: m.r === 'u' ? 'user' : 'assistant', content: (m.photo ? photoText(S.photos[m.photo]) : htmlToText(m.h)).slice(0, 1500) };
    }).filter(function (m) { return m.content; });
  }
  function CloudError(status, msg, code) { this.status = status; this.message = msg; this.code = code; }
  function errText(e) {
    if (!e) return 'неизвестная ошибка';
    if (e.code === 'bad') return 'облачные модели не дали нормального ответа (' + e.message + ')';
    if (e.name === 'AbortError') return 'сервер ИИ не ответил вовремя (таймаут)';
    var s = e.status;
    if (s === 401) return 'ключ не подошёл (401) — проверь его в ⚙️ настройках';
    if (s === 402) return 'на аккаунте OpenRouter закончились кредиты или отрицательный баланс (402)';
    if (s === 403) return 'доступ запрещён (403)' + (/region|country|geograph|блок|unavailable|not available/i.test(e.message || '') || isOR() ? ' — OpenRouter ограничивает доступ из некоторых регионов, включая Россию; может понадобиться VPN или другой адрес API в настройках' : '');
    if (s === 404) return 'модель сейчас недоступна (404) — выбери другую в настройках';
    if (s === 408 || s === 524 || s === 504) return 'модель не успела ответить (' + s + ')';
    if (s === 429) return 'лимит бесплатных запросов (429): до 20 в минуту и 50 в день без пополнения счёта — попробуй через минуту или завтра';
    if (s >= 500) return 'сервер ИИ временно недоступен (' + s + ')';
    if (e instanceof TypeError || /fetch|network|load failed/i.test(e.message || '')) return 'нет связи с сервером ИИ (нет интернета или сервис недоступен из твоей сети)';
    return String(e.message || e).slice(0, 120);
  }
  // ordered list of vetted models to try: the chosen one first, then the defaults (never routers / classifiers)
  function chainFor(primary, list) {
    if (!isOR()) return [primary || list[0]];   // another OpenAI-compatible provider: only the model the user named
    var out = [];
    [primary].concat(list).forEach(function (m) { if (m && !blockedModel(m) && out.indexOf(m) < 0) out.push(m); });
    return out.length ? out : list.slice();
  }
  function reqBody(models, extra) {
    var body = { model: models[0], temperature: 0.5, max_tokens: 1200 };
    if (isOR()) { body.models = models.slice(0, 3); body.reasoning = { exclude: true }; }
    Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    return body;
  }
  // a reply that is empty, tiny or looks like a moderation/classifier verdict is not an answer
  var CLS_LINE = /^(safe|unsafe|(user|response|prompt|assistant)\s+safety\b.*|safety\s+categor(y|ies)\b.*|categor(y|ies)\s*:.*|s\d{1,2}\s*[:,.-]?.*|(not\s+)?harmful\.?|(un)?safe\s*[.,;:]?)$/i;
  function badReply(t) {
    var s = String(t || '').replace(/<[^>]+>/g, ' ').replace(/[*_`#>]+/g, '').trim();
    if (s.length < 15) return 'пустой или слишком короткий ответ';
    if (/^\s*(user|response|prompt)\s+safety\s*:/im.test(s)) return 'ответила модель-классификатор';
    var lines = s.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length && lines.every(function (l) { return CLS_LINE.test(l); })) return 'ответила модель-классификатор';
    return null;
  }
  function badErr(why, model) { var e = new CloudError(0, why, 'bad'); e.model = model; return e; }
  function fatalErr(e) { return !!e && (e.status === 401 || e.status === 402 || e.status === 403 || e.status === 429); }
  function headers() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey(), 'X-Title': 'Zdorovie' }; }
  function readErr(r) {
    return r.text().then(function (t) {
      var j = null; try { j = JSON.parse(t); } catch (e) { /* not json */ }
      var msg = (j && j.error && (j.error.message || (j.error.metadata && j.error.metadata.raw))) || t.slice(0, 200) || ('HTTP ' + r.status);
      throw new CloudError(r.status, String(msg), j && j.error && j.error.code);
    });
  }
  // one request (OpenRouter may still switch between the ≤3 vetted `models` itself). Text is only shown once it
  // clearly is a real answer (≥ 60 chars, not a classifier verdict, model not blocked). Resolves { text, model }.
  function streamOnce(messages, models, onDelta) {
    var ctl = window.AbortController ? new AbortController() : null, timer = null;
    var arm = function (ms) { clearTimeout(timer); timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms); };
    arm(45000);
    return fetch(apiBase() + '/chat/completions', { method: 'POST', signal: ctl ? ctl.signal : undefined, headers: headers(), body: JSON.stringify(reqBody(models, { messages: messages, stream: true })) })
      .then(function (r) {
        if (!r.ok) return readErr(r);
        var ct = r.headers.get('content-type') || '';
        if (!r.body || !r.body.getReader || ct.indexOf('json') >= 0) {
          return r.json().then(function (j) {
            if (j.error) throw new CloudError(j.error.code || 500, j.error.message || 'ошибка');
            var md = j.model || models[0];
            if (blockedModel(md)) throw badErr('ответила служебная модель ' + md, md);
            var c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            if (Array.isArray(c)) c = c.map(function (x) { return x.text || ''; }).join('');
            var bad = badReply(c); if (bad) throw badErr(bad, md);
            onDelta(String(c)); return { text: String(c).trim(), model: md };
          });
        }
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', text = '', model = models[0], done = false, shown = false;
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) return;
            arm(30000);
            buf += dec.decode(res.value, { stream: true });
            var lines = buf.split('\n'); buf = lines.pop();
            for (var i = 0; i < lines.length; i++) {
              var l = lines[i].trim();
              if (!l || l.charAt(0) === ':' || l.indexOf('data:') !== 0) continue;
              var data = l.slice(5).trim();
              if (data === '[DONE]') { done = true; break; }
              var j; try { j = JSON.parse(data); } catch (e) { continue; }
              if (j.error) throw new CloudError(j.error.code || 500, j.error.message || 'ошибка');
              if (j.model) { model = j.model; if (blockedModel(model)) { try { reader.cancel(); } catch (e) { /* ignore */ } throw badErr('ответила служебная модель ' + model, model); } }
              var ch = j.choices && j.choices[0];
              if (ch && ch.finish_reason === 'error') throw new CloudError(500, 'ошибка во время ответа');
              var dt = ch && ch.delta && ch.delta.content;
              if (dt) {
                text += dt;
                if (!shown && text.trim().length >= 60 && !badReply(text)) shown = true;
                if (shown) onDelta(text);
              }
            }
            if (done) { try { reader.cancel(); } catch (e) { /* ignore */ } return; }
            return pump();
          });
        }
        return pump().then(function () {
          var bad = badReply(text); if (bad) throw badErr(bad, model);
          if (!shown) onDelta(text);
          return { text: text.trim(), model: model };
        });
      })
      .then(function (x) { clearTimeout(timer); return x; }, function (e) { clearTimeout(timer); throw e; });
  }
  // tries the vetted chain: a junk / classifier reply or a model error → next model; key/limit errors stop at once
  function withFallback(chain, run, onSkip) {
    var i = 0, n = 0, lastErr = null;
    function attempt() {
      if (i >= chain.length || n >= 4) return Promise.reject(lastErr || new CloudError(0, 'нет доступных моделей'));
      var models = chain.slice(i, i + 3); n++;
      return run(models).catch(function (e) {
        lastErr = e;
        if (fatalErr(e)) throw e;
        var j = e.model ? chain.indexOf(e.model) : -1;
        i = e.code === 'bad' ? (j >= i ? j + 1 : i + 1) : i + models.length;
        if (onSkip) onSkip(e);
        return attempt();
      });
    }
    return attempt();
  }
  function streamChat(messages, onDelta) {
    return withFallback(chainFor(S.model || DEFAULT_MODEL, CHAT_MODELS), function (models) { return streamOnce(messages, models, onDelta); }, function () { onDelta(''); });
  }
  function checkKey() {
    return fetch(apiBase() + '/key', { headers: { Authorization: 'Bearer ' + apiKey() } }).then(function (r) {
      if (!r.ok) return readErr(r);
      return r.json();
    });
  }

  /* ================= food photo recognition (vision model) ================= */
  var PHOTO_PROMPT = 'Ты нутрициолог. На фото еда. Определи каждое блюдо или продукт и оцени вес порции в граммах (для напитков — мл). ' +
    'Ответь ТОЛЬКО JSON без пояснений и без markdown, строго в формате: {"items":[{"name_ru":"гречка варёная","grams_estimate":200,"kcal":220,"protein":8.4,"fat":2.2,"carbs":42.6,"confidence":0.8}],"total":{"kcal":220,"protein":8.4,"fat":2.2,"carbs":42.6},"comment":"короткий комментарий"}. ' +
    'kcal/protein/fat/carbs — для указанного веса порции (не на 100 г). confidence от 0 до 1. Названия — простые русские, как в таблицах калорийности (например «куриная грудка жареная», «рис отварной», «салат из свежих овощей с маслом»). ' +
    'Соусы и масло указывай отдельными пунктами, если они заметны. Если на фото нет еды — {"items":[],"comment":"на фото не видно еды"}.';
  function downscale(file, max) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || 'image/')) { reject(new Error('Это не изображение')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var draw = function (lim, q) {
            var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, lim / Math.max(w, h));
            var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
            var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', q);
          };
          var full = draw(max || 768, 0.82), thumb = draw(200, 0.7);
          URL.revokeObjectURL(url); resolve({ full: full, thumb: thumb });
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото (формат не поддерживается браузером — попробуй JPEG/PNG)')); };
      img.src = url;
    });
  }
  function parsePhotoJSON(t) {
    var s = String(t || '').replace(/```(?:json)?/gi, '').trim(), i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j < i) throw new CloudError(0, 'модель ответила не в формате JSON');
    var o = JSON.parse(s.slice(i, j + 1));
    var items = (Array.isArray(o.items) ? o.items : []).slice(0, 12).map(function (it) {
      var g = Number(it.grams_estimate || it.grams || it.weight) || 0, n = String(it.name_ru || it.name || '').trim().slice(0, 80);
      if (!n) return null;
      return { name: n, g0: g > 0 ? g : 100, g: g > 0 ? Math.round(g) : 100, ai: { kcal: Math.max(0, Number(it.kcal) || 0), p: Math.max(0, Number(it.protein) || 0), f: Math.max(0, Number(it.fat) || 0), c: Math.max(0, Number(it.carbs) || 0) },
        conf: Math.max(0, Math.min(1, Number(it.confidence) || 0)) };
    }).filter(Boolean);
    return { items: items, comment: String(o.comment || '').slice(0, 300) };
  }
  function matchPhotoItems(items) {
    items.forEach(function (it) {
      var pq = parseFoodQ(norm(it.name)), rs = pq.words.length ? searchDB(pq.words) : { list: [] };
      if (!rs.list.length || rs.info.best.miss) { it.src = 'ai'; return; }
      var f = rs.list[0], aiPer100 = it.g0 ? it.ai.kcal / it.g0 * 100 : 0, ratio = aiPer100 > 0 ? f.kcal / aiPer100 : 1;
      it.fid = f.id; it.dbName = f.ru;
      it.src = ratio > 2.2 || ratio < 0.45 ? 'ai' : 'db';   // very different energy density → probably a wrong match
    });
    return items;
  }
  function itemVals(it) {
    var f = it.src === 'db' && it.fid && A() && A().foodById ? A().foodById(it.fid) : null;
    if (f) return per(f, it.g);
    var k = it.g0 ? it.g / it.g0 : 1;
    return { kcal: it.ai.kcal * k, p: it.ai.p * k, f: it.ai.f * k, c: it.ai.c * k };
  }
  function recognizeOnce(dataUrl, models) {
    var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 75000);
    return fetch(apiBase() + '/chat/completions', { method: 'POST', signal: ctl ? ctl.signal : undefined, headers: headers(),
      body: JSON.stringify(reqBody(models, { temperature: 0.2, max_tokens: 900, messages: [{ role: 'user', content: [{ type: 'text', text: PHOTO_PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }] })) })
      .then(function (r) {
        if (!r.ok) return readErr(r);
        return r.json().then(function (j) {
          if (j.error) throw new CloudError(j.error.code || 500, j.error.message || 'ошибка');
          var md = j.model || models[0];
          if (blockedModel(md)) throw badErr('ответила служебная модель ' + md, md);
          var c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (Array.isArray(c)) c = c.map(function (x) { return x.text || ''; }).join('');
          var P;
          try { P = parsePhotoJSON(c); } catch (e) { throw badErr('модель ответила не в формате JSON', md); }
          P.model = md;
          matchPhotoItems(P.items);
          return P;
        });
      })
      .then(function (x) { clearTimeout(timer); return x; }, function (e) { clearTimeout(timer); throw e; });
  }
  function recognize(dataUrl) {
    return withFallback(chainFor(S.vmodel || DEFAULT_VMODEL, VISION_MODELS), function (models) { return recognizeOnce(dataUrl, models); });
  }

  function photoCard(id, P) {
    if (!P) return '<div class="ai-photo-card muted small">Результат распознавания удалён.</div>';
    if (!P.items.length) return '<div class="ai-photo-card"><b>Еда не найдена на фото.</b><p class="muted small">' + esc(P.comment || 'Попробуй сфотографировать тарелку сверху при хорошем свете.') + '</p></div>';
    var tot = { kcal: 0, p: 0, f: 0, c: 0 };
    var rows = P.items.map(function (it, i) {
      var v = itemVals(it); tot.kcal += v.kcal; tot.p += v.p; tot.f += v.f; tot.c += v.c;
      return '<li class="ph-row" data-ph-i="' + i + '"><div class="ph-name"><b>' + esc(it.name) + '</b>' +
        (it.fid ? '<button type="button" class="ph-src" data-ph-src="' + i + '" title="Источник КБЖУ">' + (it.src === 'db' ? 'база: ' + esc(it.dbName) : 'оценка ИИ') + ' ⇄</button>' : '<small class="muted">оценка ИИ</small>') +
        (it.conf ? '<small class="muted"> · уверенность ' + Math.round(it.conf * 100) + '%</small>' : '') + '</div>' +
        '<label class="ph-g"><input type="text" inputmode="numeric" maxlength="4" data-ph-g="' + i + '" value="' + Math.round(it.g) + '"' + (P.added ? ' disabled' : '') + '><small>г</small></label>' +
        '<span class="ph-v" data-ph-v="' + i + '">' + num(v.kcal, 0) + ' ккал<small>Б ' + num(v.p, 0) + ' · Ж ' + num(v.f, 0) + ' · У ' + num(v.c, 0) + '</small></span></li>';
    }).join('');
    return '<div class="ai-photo-card" data-ph-id="' + esc(id) + '"><div class="ph-head">🍽 Распознано на фото' + (P.thumb ? '<img src="' + P.thumb + '" alt="" class="ph-thumb">' : '') + '</div><ul class="ph-list">' + rows + '</ul>' +
      '<div class="ph-total" data-ph-total>Итого: <b>' + num(tot.kcal, 0) + ' ккал</b> · Б ' + num(tot.p, 0) + ' · Ж ' + num(tot.f, 0) + ' · У ' + num(tot.c, 0) + ' г</div>' +
      (P.comment ? '<p class="muted small">' + esc(P.comment) + '</p>' : '') +
      '<p class="muted small">Вес на фото — приблизительная оценка: поправь граммы, если знаешь точнее.</p>' +
      (P.added ? '<button type="button" class="btn small" disabled>✓ Добавлено в дневник</button>' : '<button type="button" class="btn small primary" data-ph-add="' + esc(id) + '">Добавить в дневник</button>') +
      '<small class="ai-src">распознал: ' + esc(P.model || '') + '</small></div>';
  }
  function photoTotalsPaint(card, P) {
    var tot = { kcal: 0, p: 0, f: 0, c: 0 };
    P.items.forEach(function (it, i) {
      var v = itemVals(it); tot.kcal += v.kcal; tot.p += v.p; tot.f += v.f; tot.c += v.c;
      var el = card.querySelector('[data-ph-v="' + i + '"]');
      if (el) el.innerHTML = num(v.kcal, 0) + ' ккал<small>Б ' + num(v.p, 0) + ' · Ж ' + num(v.f, 0) + ' · У ' + num(v.c, 0) + '</small>';
    });
    var t = card.querySelector('[data-ph-total]');
    if (t) t.innerHTML = 'Итого: <b>' + num(tot.kcal, 0) + ' ккал</b> · Б ' + num(tot.p, 0) + ' · Ж ' + num(tot.f, 0) + ' · У ' + num(tot.c, 0) + ' г';
  }
  var foodPhotos = {};   // results shown on the «Питание» screen (not part of the chat)
  function photoState(id) { return S.photos[id] || foodPhotos[id] || null; }

  /* ================= UI ================= */
  var busy = false, showSettings = false, streamText = null, keyInfo = null;
  function gearSvg() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'; }
  function msgHtml(m) {
    var body = m.photo ? (m.r === 'u' ? '<img class="ai-photo-thumb" src="' + (S.photos[m.photo] && S.photos[m.photo].thumb || '') + '" alt="Фото еды">' + (m.h ? '<div>' + m.h + '</div>' : '') : photoCard(m.photo, S.photos[m.photo])) : m.h;
    return '<div class="ai-msg ' + (m.r === 'u' ? 'me' : 'bot') + '">' + (m.r === 'u' ? '' : '<span class="ai-av" aria-hidden="true">✦</span>') +
      '<div class="ai-bubble">' + body + (m.src ? '<small class="ai-src">' + esc(m.src) + '</small>' : '') + '</div></div>';
  }
  function modeLine() {
    if (!cloudOn()) return 'встроенный анализ · офлайн';
    return 'облачный ИИ · ' + (S.model || DEFAULT_MODEL).replace(/:free$/, '') + (keySource() === 'build' ? ' (ключ приложения)' : '');
  }
  function render() {
    var root = document.getElementById('aiRoot'); if (!root) return;
    var pro = window.HTPro ? window.HTPro.isPro() : true;
    var head = '<header class="top top-back"><a class="icon-btn" href="#today" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>' +
      '<div class="grow"><h1 class="title">ИИ-ассистент</h1><div class="subtitle">' + esc(modeLine()) + '</div></div>' +
      (pro ? '<button type="button" class="icon-btn" data-ai="settings" aria-label="Настройки ИИ">' + gearSvg() + '</button>' : '') + '</header>';
    if (!pro) {
      root.innerHTML = head + window.HTPro.lockCard('ИИ-ассистент', 'Спрашивай о своём сне, питании, тренировках и программе для лица — ассистент посчитает средние, сравнит недели, подскажет КБЖУ любого продукта и распознает еду по фото.', 'ai') +
        '<section class="card ai-teaser"><div class="ai-msg me"><div class="ai-bubble">Сколько белка я съел за неделю?</div></div>' +
        '<div class="ai-msg bot"><span class="ai-av">✦</span><div class="ai-bubble">За 7 дней ты съел <b>612 г белка</b> — в среднем <b>87 г в день</b> при норме 120 г. Главные источники: творог, курица, яйца…</div></div></section>';
      return;
    }
    var msgs = S.msgs.length ? S.msgs : [{ r: 'a', h: 'Привет! Я твой ассистент по здоровью ✦ ' + ansHelp() + (cloudOn() ? ' Облачный ИИ подключён — можно говорить свободно на любые темы.' : '') }];
    root.innerHTML = head + (showSettings ? settingsCard() : '') +
      '<section class="ai-log" id="aiLog" aria-live="polite">' + msgs.map(msgHtml).join('') +
      (busy ? '<div class="ai-msg bot" id="aiPending"><span class="ai-av">✦</span><div class="ai-bubble' + (streamText ? '' : ' ai-typing') + '" id="aiStream">' + (streamText ? mdToHtml(streamText) : '<i></i><i></i><i></i>') + '</div></div>' : '') + '</section>' +
      '<div class="ai-chips">' + CHIPS.map(function (c) { return '<button type="button" class="qa-chip" data-ai-q="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<form class="ai-form" id="aiForm" autocomplete="off"><button type="button" class="btn ai-photo-btn" data-ai="photo" aria-label="Фото еды" title="Распознать еду по фото"' + (busy ? ' disabled' : '') + '>📷</button>' +
      '<input id="aiInput" type="text" maxlength="1000" placeholder="' + (cloudOn() ? 'Спроси что угодно…' : 'Спроси о своих данных или продукте…') + '" enterkeyhint="send"' + (busy ? ' disabled' : '') + '>' +
      '<button type="submit" class="btn primary" aria-label="Отправить"' + (busy ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg></button>' +
      '<input type="file" id="aiPhotoInput" accept="image/*" hidden></form>' +
      (S.msgs.length ? '<button type="button" class="link-btn small ai-clear" data-ai="clear">Очистить переписку</button>' : '') +
      '<p class="muted small ai-note">Ассистент не заменяет врача. ' + (cloudOn() ? 'Облачный ИИ включён: вместе с каждым сообщением в ' + (isOR() ? 'OpenRouter' : 'выбранный сервис') + ' уходит сводка твоих данных за 30 дней. Без связи ответит встроенный анализатор.' : 'Встроенный анализ работает без интернета, данные не покидают устройство.') + '</p>';
    var log = document.getElementById('aiLog'); if (log) log.scrollTop = log.scrollHeight;
  }
  function settingsCard() {
    var bk = !!buildKey(), src = keySource();
    return '<section class="card ai-settings"><div class="card-head"><h2>Настройки ИИ</h2><button type="button" class="pill-link" data-ai="settings">Готово</button></div>' +
      '<p class="muted small">Без ключа отвечает <b>встроенный анализатор</b> — бесплатно, офлайн, данные не покидают устройство. Он знает твои записи, историю тренировок, базу продуктов и частые вопросы о здоровье.</p>' +
      '<p class="muted small">С ключом OpenRouter <b>каждое сообщение</b> отправляется облачной модели вместе со сводкой твоих данных за 30 дней (профиль, сон, еда и КБЖУ, тренировки и подходы, вес, шаги, вода, настроение, челюсть, уход) и последними 10 сообщениями — так ответы получаются как в ChatGPT, но с твоими цифрами. Фото еды тоже распознаёт облачная модель. Если не согласен отправлять данные — не включай.</p>' +
      (bk ? '<p class="small">🔑 В приложение встроен общий ключ' + (src === 'build' ? ' — он используется сейчас' : ' (сейчас используется твой)') + '. Встроенный ключ общий для всех пользователей, его лимиты быстро заканчиваются — свой ключ надёжнее.</p>' : '') +
      '<label class="jw-check' + (!S.cloudOff ? ' on' : '') + '"><input type="checkbox" id="aiCloud"' + (!S.cloudOff ? ' checked' : '') + '><span class="jw-ci">☁️</span><span class="grow"><b>Облачный ИИ</b><small>' + (apiKey() ? 'при ошибке ответит встроенный анализатор' : 'включится, когда будет ключ') + '</small></span><span class="jw-tick"></span></label>' +
      '<label class="fc-field"><span>Твой API-ключ OpenRouter</span><input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-v1-…" value="' + esc(S.key || '') + '"></label>' +
      modelSelect('aiModel', 'Модель для чата', CHAT_MODELS, S.model || DEFAULT_MODEL) +
      modelSelect('aiVModel', 'Модель для фото (понимает изображения)', VISION_MODELS, S.vmodel || DEFAULT_VMODEL) +
      '<p class="muted small">Только проверенные бесплатные модели. Если выбранная занята или ответит не по делу, ассистент сам попробует следующую из списка.</p>' +
      '<details class="ai-adv"><summary class="small">Другой провайдер (OpenAI-совместимый API)</summary><label class="fc-field"><span>Адрес API</span><input id="aiBase" type="url" autocomplete="off" spellcheck="false" placeholder="' + OR_BASE + '" value="' + esc(S.base || '') + '"></label><p class="muted small">Например, российский агрегатор с OpenAI-совместимым API. Сервис должен разрешать запросы из браузера (CORS). Ключ и модель укажи от этого сервиса.</p></details>' +
      '<div class="btn-grid"><button type="button" class="btn primary" data-ai="save">Сохранить</button><button type="button" class="btn" data-ai="check"' + (apiKey() ? '' : ' disabled') + '>Проверить ключ</button><button type="button" class="btn danger wide" data-ai="forget">Удалить мой ключ</button></div>' +
      (keyInfo ? '<p class="small ai-keyinfo">' + keyInfo + '</p>' : '') +
      '<p class="muted small">Ключ: openrouter.ai → Keys (бесплатно). Модели с «:free» бесплатны, но с лимитами: до 20 запросов в минуту и 50 в день (1000 в день, если на аккаунт когда-либо зачислено от $10). Важно: с лета 2026 OpenRouter ограничивает аккаунты и подключения из России — может понадобиться VPN или другой провайдер. Ключ хранится только на этом устройстве.</p></section>';
  }
  // dropdown of vetted models; for another provider (custom API address) a free-text model id is allowed
  function modelSelect(id, label, list, cur) {
    var custom = list.indexOf(cur) < 0;
    return '<label class="fc-field"><span>' + label + '</span><select id="' + id + '" class="ai-model-sel">' +
      list.map(function (m) { return '<option value="' + esc(m) + '"' + (m === cur ? ' selected' : '') + '>' + esc(MODEL_NAMES[m] || m) + '</option>'; }).join('') +
      '<option value="__custom"' + (custom ? ' selected' : '') + '>Другая (для другого провайдера)…</option></select></label>' +
      '<input id="' + id + 'Custom" class="ai-model-custom" type="text" autocomplete="off" spellcheck="false" placeholder="id модели"' + (custom ? ' value="' + esc(cur) + '"' : ' hidden') + '>';
  }
  function readModel(id, def) {
    var sel = document.getElementById(id); if (!sel) return def;
    if (sel.value !== '__custom') return sel.value;
    return (document.getElementById(id + 'Custom').value || '').trim() || def;
  }
  // a nutrition answer from the cloud must carry the database numbers; append them when the model left them out
  function dbLine(loc) {
    var f = loc && loc.food && A().foodById ? A().foodById(loc.food) : null; if (!f) return null;
    var u = unitOf(f), g = S.ctx.lastG, v = g ? per(f, g) : null;
    return { f: f, kcal: Math.round(f.kcal), gk: v ? Math.round(v.kcal) : null,
      h: '<p class="ai-dbline">📊 По базе приложения: <b>' + esc(f.ru) + '</b> — на 100 ' + u + ': ' + num(f.kcal, 0) + ' ккал · Б ' + num(f.p) + ' · Ж ' + num(f.f) + ' · У ' + num(f.c) + ' г' +
        (v ? '; на ' + num(Math.round(g), 0) + ' ' + u + ': ' + num(v.kcal, 0) + ' ккал · Б ' + num(v.p) + ' · Ж ' + num(v.f) + ' · У ' + num(v.c) + ' г' : '') + '.</p>' };
  }
  function hasNum(text, n) { if (n === null || n === undefined) return false; var t = String(text).replace(/[\s\u00a0\u202f]/g, ''); return new RegExp('(^|[^0-9])' + n + '([^0-9]|$)').test(t); }
  function scrollLog() { var log = document.getElementById('aiLog'); if (log) log.scrollTop = log.scrollHeight; }
  var paintT = 0;
  function paintStream() {
    var now = Date.now(); if (now - paintT < 60) return; paintT = now;
    var el = document.getElementById('aiStream');
    if (!el) return;
    el.classList.remove('ai-typing'); el.innerHTML = mdToHtml(streamText || '');
    scrollLog();
  }
  function ask(text) {
    text = String(text || '').trim().slice(0, 1000);
    if (!text || busy) return;
    var hist = cloudOn() ? historyMsgs(10) : null;
    S.msgs.push({ r: 'u', h: esc(text), at: Date.now() });
    var loc = answerFull(text), local = loc.h;
    if (!cloudOn()) { S.msgs.push({ r: 'a', h: local, src: 'встроенный анализ', at: Date.now() }); save(); render(); return; }
    var grounding = /^(fallback|help|wait)$/.test(loc.kind) ? '' : htmlToText(local).slice(0, 2500);
    var messages = [{ role: 'system', content: systemPrompt(grounding, foodRefFor(text)) }].concat(hist).concat([{ role: 'user', content: text }]);
    busy = true; streamText = null; save(); render();
    streamChat(messages, function (t) { streamText = t || null; paintStream(); }).then(function (r) {
      var extra = '';
      if (loc.kind === 'food') {
        var db = dbLine(loc);
        if (db) {
          if (!hasNum(r.text, db.kcal) && !hasNum(r.text, db.gk)) extra += db.h;
          // keep the built-in food «＋ В дневник» button under a cloud answer about a product
          extra += '<div class="ai-inchips">' + addBtn(db.f, (S.ctx.lastG || db.f.por || 100)) + '</div>';
        }
      }
      S.msgs.push({ r: 'a', h: mdToHtml(r.text) + extra, src: 'облачный ИИ · ' + String(r.model || '').replace(/:free$/, ''), at: Date.now() });
    }, function (e) {
      var partial = e.code !== 'bad' && streamText && streamText.trim().length > 40;
      S.msgs.push({ r: 'a', h: partial ? mdToHtml(streamText) + '<br><span class="muted">…ответ оборвался.</span>' : local, src: 'облачный ИИ: ' + errText(e) + (partial ? '' : ' — ответил встроенный анализатор'), at: Date.now() });
    }).then(function () { busy = false; streamText = null; save(); render(); });
  }
  // ---- photo flows
  function needKeyHtml() {
    return '📷 Распознавание еды по фото работает через облачную модель, которая понимает изображения. Для этого нужен API-ключ OpenRouter (бесплатный): нажми ⚙️ вверху → вставь ключ → «Сохранить». ' +
      'Встроенный анализатор фото не распознаёт, но можно написать, что ты съел, — например, «200 г гречки» — и добавить из ответа в дневник.';
  }
  function chatPhoto(file) {
    if (busy) return;
    busy = true; streamText = null; render();
    downscale(file, 768).then(function (img) {
      var id = 'p' + Date.now().toString(36);
      S.photos[id] = { items: [], thumb: img.thumb, pending: true };
      S.msgs.push({ r: 'u', h: '', photo: id, at: Date.now() }); render();
      return recognize(img.full).then(function (P) {
        P.thumb = img.thumb; S.photos[id] = P;
        S.msgs.push({ r: 'a', photo: id, h: '', at: Date.now() });
        S.ctx.lastKind = 'photo';
      });
    }).catch(function (e) {
      S.msgs.push({ r: 'a', h: 'Не получилось распознать фото: ' + esc(errText(e)) + '. Можно описать еду словами — например, «200 г гречки и куриная грудка».', src: 'распознавание фото', at: Date.now() });
    }).then(function () { busy = false; save(); render(); });
  }
  function foodPhoto(file) {
    var box = document.getElementById('foodPhotoBox'); if (!box) return;
    box.innerHTML = '<div class="ai-photo-card"><div class="ai-typing-row"><span class="ai-typing"><i></i><i></i><i></i></span> Распознаю еду на фото… это занимает 5–30 секунд</div></div>';
    downscale(file, 768).then(function (img) {
      return recognize(img.full).then(function (P) {
        var id = 'f' + Date.now().toString(36); P.thumb = img.thumb; foodPhotos[id] = P;
        box.innerHTML = photoCard(id, P) + '<button type="button" class="link-btn small" data-ph-close>Закрыть</button>';
      });
    }).catch(function (e) {
      box.innerHTML = '<div class="ai-photo-card"><b>Не получилось распознать фото.</b><p class="muted small">' + esc(errText(e)) + '</p><button type="button" class="link-btn small" data-ph-close>Закрыть</button></div>';
    });
  }
  function photoButton(where) {
    var pro = window.HTPro ? window.HTPro.isPro() : true;
    if (!pro) { if (window.HTPro) window.HTPro.toast('Распознавание еды по фото доступно в Про'); location.hash = '#buy/ai'; return; }
    if (!apiKey()) {
      if (where === 'food') { var box = document.getElementById('foodPhotoBox'); if (box) box.innerHTML = '<div class="ai-photo-card"><p class="small">' + needKeyHtml().replace('нажми ⚙️ вверху', 'открой «ИИ-ассистент» → ⚙️') + '</p><a class="btn small" href="#ai">Открыть настройки ИИ</a> <button type="button" class="link-btn small" data-ph-close>Закрыть</button></div>'; }
      else { S.msgs.push({ r: 'a', h: needKeyHtml(), src: 'фото еды', at: Date.now() }); showSettings = true; save(); render(); }
      return;
    }
    var inp = document.getElementById(where === 'food' ? 'foodPhotoInput' : 'aiPhotoInput');
    if (inp) { inp.value = ''; inp.click(); }
  }
  function addPhoto(id) {
    var P = photoState(id); if (!P || P.added) return;
    var n = 0, kcal = 0;
    P.items.forEach(function (it) {
      if (!(it.g >= 1)) return;
      var v = itemVals(it), e;
      if (it.src === 'db' && it.fid) e = A().addFood({ fid: it.fid, g: it.g });
      else e = A().addFood({ name: it.name + ' (по фото)', g: it.g, kcal: v.kcal, p: v.p, f: v.f, c: v.c });
      if (e) { n++; kcal += e.kcal; }
    });
    P.added = true; save();
    A().toast('Добавлено в дневник: ' + n + ' ' + plural(n, 'продукт', 'продукта', 'продуктов') + ', ' + num(kcal, 0) + ' ккал');
    document.querySelectorAll('[data-ph-id="' + id + '"]').forEach(function (card) {
      var holder = document.createElement('div'); holder.innerHTML = photoCard(id, P); card.replaceWith(holder.firstChild);
    });
  }

  /* ---------------- events ---------------- */
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'aiForm') { e.preventDefault(); var i = document.getElementById('aiInput'); var v = i.value; i.value = ''; ask(v); }
  });
  document.addEventListener('click', function (e) {
    // works in the chat and on the «Питание» screen
    var ad = e.target.closest('[data-ai-add]');
    if (ad) {
      var en = A().addFood({ fid: ad.getAttribute('data-ai-add'), g: Number(ad.getAttribute('data-g')) });
      if (en) { ad.disabled = true; ad.textContent = '✓ Добавлено: ' + en.g + ' г, ' + num(en.kcal, 0) + ' ккал'; A().toast('Добавлено в дневник: ' + en.name.slice(0, 40)); }
      return;
    }
    var pa = e.target.closest('[data-ph-add]'); if (pa) { addPhoto(pa.getAttribute('data-ph-add')); return; }
    var ps = e.target.closest('[data-ph-src]');
    if (ps) {
      var card = ps.closest('[data-ph-id]'), P = card && photoState(card.getAttribute('data-ph-id')), it = P && P.items[+ps.getAttribute('data-ph-src')];
      if (it && it.fid && !P.added) { it.src = it.src === 'db' ? 'ai' : 'db'; ps.textContent = (it.src === 'db' ? 'база: ' + it.dbName : 'оценка ИИ') + ' ⇄'; photoTotalsPaint(card, P); save(); }
      return;
    }
    if (e.target.closest('[data-ph-close]')) { var bx = document.getElementById('foodPhotoBox'); if (bx) bx.innerHTML = ''; return; }
    var fp = e.target.closest('[data-ai-photo]'); if (fp) { photoButton('food'); return; }
    var root = document.getElementById('aiRoot'); if (!root || !root.contains(e.target)) return;
    var q = e.target.closest('[data-ai-q]'); if (q) { ask(q.getAttribute('data-ai-q')); return; }
    var a = e.target.closest('[data-ai]'); if (!a) return;
    var act = a.getAttribute('data-ai');
    if (act === 'settings') { showSettings = !showSettings; keyInfo = null; render(); }
    else if (act === 'photo') photoButton('chat');
    else if (act === 'clear') { if (confirm('Очистить переписку с ассистентом?')) { S.msgs = []; S.ctx = {}; save(); render(); } }
    else if (act === 'save') {
      var k = (document.getElementById('aiKey').value || '').trim(), m = readModel('aiModel', DEFAULT_MODEL), vm = readModel('aiVModel', DEFAULT_VMODEL), base = (document.getElementById('aiBase').value || '').trim();
      if (base && !/^https:\/\/[^\s]+$/i.test(base)) { if (window.HTPro) window.HTPro.toast('Адрес API должен начинаться с https://'); return; }
      if (blockedModel(m) || blockedModel(vm)) { if (window.HTPro) window.HTPro.toast('Эта модель не подходит для чата (служебная модель или роутер) — выбери из списка'); return; }
      S.key = k || null; S.model = m; S.modelSet = m !== DEFAULT_MODEL; S.vmodel = vm || DEFAULT_VMODEL; S.base = base.replace(/\/+$/, '') || null;
      S.cloudOff = !document.getElementById('aiCloud').checked;
      save(); showSettings = false; render(); if (window.HTPro) window.HTPro.toast(cloudOn() ? 'Облачный ИИ включён' : 'Сохранено');
    } else if (act === 'check') {
      keyInfo = 'Проверяю…'; render();
      checkKey().then(function (j) {
        var d = j && j.data || {}, fr = d.free_model_daily_requests;
        keyInfo = '✅ Ключ работает' + (d.label ? ' («' + esc(d.label) + '»)' : '') + '.' + (fr ? ' Бесплатных запросов сегодня осталось: <b>' + fr.remaining + ' из ' + fr.limit + '</b>.' : '') + (d.limit_remaining !== null && d.limit_remaining !== undefined ? ' Остаток кредитов по ключу: ' + d.limit_remaining + '.' : '');
      }, function (e) { keyInfo = '❌ ' + esc(errText(e)); }).then(render);
    } else if (act === 'forget') { S.key = null; save(); keyInfo = null; render(); if (window.HTPro) window.HTPro.toast('Твой ключ удалён с устройства'); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t) return;
    if (t.id === 'aiCloud') t.closest('.jw-check').classList.toggle('on', t.checked);
    if (t.classList && t.classList.contains('ai-model-sel')) { var cu = document.getElementById(t.id + 'Custom'); if (cu) { cu.hidden = t.value !== '__custom'; if (!cu.hidden) cu.focus(); } }
    if (t.id === 'aiPhotoInput' && t.files && t.files[0]) chatPhoto(t.files[0]);
    if (t.id === 'foodPhotoInput' && t.files && t.files[0]) foodPhoto(t.files[0]);
  });
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t || !t.hasAttribute || !t.hasAttribute('data-ph-g')) return;
    var card = t.closest('[data-ph-id]'), P = card && photoState(card.getAttribute('data-ph-id')), it = P && P.items[+t.getAttribute('data-ph-g')];
    if (!it) return;
    var v = parseFloat(String(t.value).replace(',', '.')); it.g = isFinite(v) && v >= 0 && v <= 3000 ? v : 0;
    photoTotalsPaint(card, P); if (S.photos[card.getAttribute('data-ph-id')]) save();
  });

  window.AIModule = {
    render: render, answer: answer, answerFull: answerFull, ask: ask, _summary: dataSummary, _system: systemPrompt,
    _parsePhoto: parsePhotoJSON, _match: matchPhotoItems, _search: function (q) { var pq = parseFoodQ(norm(q)); return searchDB(pq.words).list.slice(0, 5).map(function (f) { return f.ru; }); },
    cloudOn: cloudOn, _badReply: badReply, _blocked: blockedModel, _chain: function () { return chainFor(S.model || DEFAULT_MODEL, CHAT_MODELS); }, reset: function () { S.ctx = {}; }
  };
})();
