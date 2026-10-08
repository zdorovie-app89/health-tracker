/* «Уход за кожей» — skincare module for the Health PWA (view #skin).
 * Skin-type quiz -> morning/evening routine (generic ingredients, no brands), daily checklist with streak,
 * animated face-washing how-to. Storage: localStorage 'health.skin.v1' ->
 *   { result: { type, acne, source: 'quiz'|'manual'|'preset', note, at }, presetApplied: string|null,
 *     checks: { "YYYY-MM-DD": { stepId: true } } }
 *
 * ▶ PERSONAL PRESET: set SKIN_PRESET to preselect the result (e.g. after reviewing a face photo):
 *     var SKIN_PRESET = { type: 'combo', acne: true, note: 'Подобрано по фото' };
 *   type: 'oily' | 'dry' | 'combo' | 'normal' | 'sensitive'; acne: true/false.
 *   A new/changed preset is applied once (overrides an older quiz result); the user can still retake the quiz.
 */
var SKIN_PRESET = null;

(function () {
  'use strict';
  var KEY = 'health.skin.v1';

  var TYPES = {
    oily: { name: 'Жирная', ic: '💧', desc: 'Блеск по всему лицу к середине дня, заметные поры, склонность к чёрным точкам.' },
    dry: { name: 'Сухая', ic: '🍂', desc: 'Стянутость после умывания, шелушения, кожа быстро «просит» крем.' },
    combo: { name: 'Комбинированная', ic: '🌗', desc: 'Т-зона (лоб, нос, подбородок) жирнее, щёки нормальные или суховатые.' },
    normal: { name: 'Нормальная', ic: '🙂', desc: 'Комфортно большую часть дня, высыпания редкие, шелушений почти нет.' },
    sensitive: { name: 'Чувствительная', ic: '🌸', desc: 'Легко краснеет, жжёт или зудит от средств, бритья, холода и ветра.' }
  };
  var QUIZ = [
    { q: 'Через 1–2 часа после умывания (без крема) кожа…', a: [['Стянута, может шелушиться', { dry: 2 }], ['Блестит по всему лицу', { oily: 2 }], ['Блестят только лоб и нос', { combo: 2 }], ['Ощущается комфортно', { normal: 2 }]] },
    { q: 'К середине дня лицо…', a: [['Блестит везде', { oily: 2 }], ['Блестит Т-зона, щёки нормальные', { combo: 2 }], ['Сухое, хочется нанести крем', { dry: 2 }], ['Почти не меняется', { normal: 2 }]] },
    { q: 'Поры…', a: [['Заметны по всему лицу', { oily: 1 }], ['Заметны на носу и лбу', { combo: 1 }], ['Мелкие, почти не видны', { dry: 1, normal: 1 }]] },
    { q: 'Шелушения и сухие участки…', a: [['Часто', { dry: 2 }], ['Иногда, на щеках', { combo: 1 }], ['Редко или никогда', { oily: 1, normal: 1 }]] },
    { q: 'Как кожа реагирует на новые средства, бритьё, холод?', a: [['Часто краснеет, жжёт или зудит', { sens: 3 }], ['Иногда', { sens: 1 }], ['Почти никогда', {}]] },
    { q: 'Высыпания (воспаления, прыщи, чёрные точки)…', a: [['Часто или постоянно', { acne: 2 }], ['Иногда — от стресса или недосыпа', { acne: 1 }], ['Редко', {}]] }
  ];
  var WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  /* ---------------- routine builder ---------------- */
  function acidPlan(type, acne) {
    if (type === 'sensitive') return { name: 'PHA (глюконолактон) или молочная кислота 5%', days: [6], what: 'очень мягкое отшелушивание, 1 раз в неделю и только после теста на небольшом участке' };
    if (type === 'oily' || acne) return { name: 'Салициловая кислота (BHA) 1–2%', days: [1, 3, 5], what: 'очищает поры и уменьшает чёрные точки' };
    if (type === 'combo') return { name: 'Салициловая кислота (BHA) 1–2% на Т-зону', days: [2, 5], what: 'очищает поры в жирных зонах' };
    if (type === 'dry') return { name: 'Молочная или миндальная кислота (AHA) 5–10%', days: [3, 6], what: 'мягко убирает шелушения, кожа глаже' };
    return { name: 'Молочная или миндальная кислота (AHA) 5–10%', days: [2, 5], what: 'мягкое обновление и гладкость' };
  }
  function buildRoutine(type, acne) {
    var acid = acidPlan(type, acne);
    var cleanse = {
      oily: 'Гель или пенка с мягкими ПАВ, pH около 5–5,5. Вечером можно с салициловой кислотой 0,5–2%, если не сушит.',
      dry: 'Утром достаточно прохладной воды или кремового умывания без сульфатов.',
      combo: 'Мягкий гель для умывания без сульфатов.',
      normal: 'Мягкий гель или пенка без сульфатов.',
      sensitive: 'Очень мягкое кремовое средство без отдушек и спирта.'
    }[type];
    var toner = {
      oily: 'Тоник без спирта с ниацинамидом или цинком.', dry: 'Увлажняющий тоник без спирта (глицерин, пантенол) на влажную кожу.',
      combo: 'Тоник без спирта (глицерин, ниацинамид).', normal: 'Увлажняющий тоник без спирта.', sensitive: 'Успокаивающий тоник без отдушек (пантенол, центелла азиатская).'
    }[type];
    var serumAm = acne || type === 'oily' || type === 'combo'
      ? 'Ниацинамид 4–5% — уменьшает жирный блеск и покраснения.'
      : (type === 'dry' ? 'Гиалуроновая кислота или глицерин на слегка влажную кожу.' : (type === 'sensitive' ? 'Пантенол или центелла азиатская — успокаивают кожу.' : 'Витамин C 10–15% (антиоксидант) — по желанию.'));
    var cream = {
      oily: 'Лёгкий гель-крем с пометкой «некомедогенно». Да, жирной коже увлажнение тоже нужно.',
      dry: 'Плотный крем с церамидами, скваланом или маслом ши.',
      combo: 'Лёгкий крем; на сухие участки можно чуть больше.',
      normal: 'Лёгкий крем или эмульсия.',
      sensitive: 'Крем без отдушек с церамидами и пантенолом.'
    }[type];
    var spf = 'SPF 30–50, широкий спектр (UVA/UVB), каждое утро, даже зимой и в облачную погоду. ' +
      (type === 'oily' || acne ? 'Текстура флюид или гель.' : (type === 'sensitive' ? 'Минеральные фильтры (оксид цинка, диоксид титана) обычно переносятся лучше.' : 'Около ½ чайной ложки на лицо и шею.'));
    var am = [
      { id: 'am_clean', ic: '🫧', t: 'Умывание', how: cleanse },
      { id: 'am_toner', ic: '💦', t: 'Тоник', how: toner + ' Необязательный шаг.', opt: true },
      { id: 'am_serum', ic: '🧪', t: 'Сыворотка', how: serumAm + ' Необязательный шаг.', opt: true },
      { id: 'am_cream', ic: '🧴', t: 'Увлажнение', how: cream },
      { id: 'am_spf', ic: '☀️', t: 'SPF', how: spf },
      { id: 'am_shave', ic: '🪒', t: 'Если бреешься', how: 'Острое лезвие, бритьё по росту волос, затем бальзам без спирта (пантенол, аллантоин). Спиртовой лосьон сушит и раздражает.', opt: true }
    ];
    var pm = [
      { id: 'pm_remove', ic: '🌊', t: 'Снять SPF', how: 'Если был SPF или макияж: гидрофильное масло или мицеллярная вода, затем умывание. Если нет — пропусти.', opt: true },
      { id: 'pm_clean', ic: '🫧', t: 'Умывание', how: cleanse.replace('Утром достаточно прохладной воды или кремового умывания без сульфатов.', 'Мягкое кремовое средство без сульфатов.') },
      { id: 'pm_acid', ic: '✨', t: 'Кислота', how: acid.name + ' — ' + acid.what + '. Тонкий слой на сухую кожу, в этот вечер без других активов.', days: acid.days },
      { id: 'pm_active', ic: '🎯', t: acne ? 'Против высыпаний' : 'Сыворотка', opt: !acne, skipDays: acid.days,
        how: acne ? 'Азелаиновая кислота 10–15% или ниацинамид — в дни без кислоты. Точечно на воспаления — бензоилпероксид 2,5–5% (может обесцвечивать ткань). Ретиноиды (адапален) — лучше после консультации дерматолога.'
          : 'Увлажняющая или успокаивающая сыворотка (гиалуроновая кислота, пантенол) — по желанию.' },
      { id: 'pm_cream', ic: '🌙', t: 'Крем', how: cream }
    ];
    return { am: am, pm: pm, acid: acid };
  }
  /* v7: Free version — one basic universal routine; the quiz/type-based routine (acids, actives) is Pro */
  function pro() { return !window.HTPro || window.HTPro.isPro(); }
  function basicRoutine() {
    var am = [
      { id: 'am_clean', ic: '🫧', t: 'Умывание', how: 'Мягкий гель или пенка без сульфатов, тёплая вода, 30–60 секунд.' },
      { id: 'am_cream', ic: '🧴', t: 'Увлажнение', how: 'Лёгкий крем или эмульсия на слегка влажную кожу.' },
      { id: 'am_spf', ic: '☀️', t: 'SPF', how: 'SPF 30–50 широкого спектра каждое утро, даже зимой. Около ½ чайной ложки на лицо и шею.' }
    ];
    var pm = [
      { id: 'pm_remove', ic: '🌊', t: 'Снять SPF', how: 'Если был SPF или макияж: мицеллярная вода или гидрофильное масло. Если нет — пропусти.', opt: true },
      { id: 'pm_clean', ic: '🫧', t: 'Умывание', how: 'Мягкое средство без сульфатов.' },
      { id: 'pm_cream', ic: '🌙', t: 'Крем', how: 'Крем без отдушек — восстанавливает кожу за ночь.' }
    ];
    return { am: am, pm: pm, acid: { name: '', days: [] }, basic: true };
  }
  function routineFor(r) { return pro() && r ? buildRoutine(r.type, r.acne) : basicRoutine(); }
  function stepToday(s, wd) {
    if (s.days && s.days.indexOf(wd) < 0) return false;
    if (s.skipDays && s.skipDays.indexOf(wd) >= 0) return false;
    return true;
  }

  /* ---------------- storage ---------------- */
  function load() {
    var d = { result: null, presetApplied: null, checks: {} };
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        if (s.result && TYPES[s.result.type]) d.result = s.result;
        if (typeof s.presetApplied === 'string') d.presetApplied = s.presetApplied;
        if (s.checks && typeof s.checks === 'object') d.checks = s.checks;
      }
    } catch (e) { /* ignore */ }
    return d;
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  function applyPreset() {
    var p = (typeof SKIN_PRESET !== 'undefined') ? SKIN_PRESET : null;
    if (!p || !TYPES[p.type]) return;
    var k = JSON.stringify(p);
    if (S.presetApplied === k) return;
    S.result = { type: p.type, acne: !!p.acne, source: 'preset', note: p.note || 'Подобрано персонально', at: Date.now() };
    S.presetApplied = k; save();
  }
  applyPreset();

  /* ---------------- helpers ---------------- */
  function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
  function required(date) {
    if (!S.result && pro()) return [];
    var r = routineFor(S.result), wd = date.getDay();
    return r.am.concat(r.pm).filter(function (s) { return !s.opt && stepToday(s, wd); });
  }
  function dayDone(date) { var req = required(date), c = S.checks[dkey(date)] || {}; return req.length > 0 && req.every(function (s) { return c[s.id]; }); }
  function streak() {
    var d = new Date(); d.setHours(12, 0, 0, 0);
    if (!dayDone(d)) { d.setDate(d.getDate() - 1); if (!dayDone(d)) return 0; }
    var n = 0; while (dayDone(d) && n < 3660) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------------- animated how-to: washing the face ---------------- */
  function washFig() {
    var face = '<ellipse class="skin" cx="63" cy="84" rx="7" ry="12"/><ellipse class="skin" cx="137" cy="84" rx="7" ry="12"/>' +
      '<ellipse class="skin" cx="100" cy="82" rx="36" ry="45"/>' +
      '<path class="ln thin" d="M80 66 q7 -4 14 0 M106 66 q7 -4 14 0"/>' +
      '<path class="ln" d="M82 77 q5 3 10 0 M108 77 q5 3 10 0"/>' +
      '<path class="ln thin" d="M100 80 L96 95 L103 95"/><path class="ln thin" d="M91 108 Q100 112 109 108"/>';
    var caps = ['1. Вымой руки, смочи лицо тёплой водой', '2. Вспень средство, массируй 30–60 с', '3. Смой тёплой, не горячей водой', '4. Промокни полотенцем — не три', '5. Сразу крем, утром — SPF'];
    var ph = [
      '<path class="sdrop" d="M80 10 q4 7 0 10 q-4 -3 0 -10Z"/><path class="sdrop s2" d="M100 4 q4 7 0 10 q-4 -3 0 -10Z"/><path class="sdrop s3" d="M120 10 q4 7 0 10 q-4 -3 0 -10Z"/>',
      '<g class="foam"><circle cx="74" cy="96" r="6"/><circle cx="82" cy="104" r="4"/><circle cx="70" cy="106" r="3.5"/><circle cx="126" cy="96" r="6"/><circle cx="118" cy="104" r="4"/><circle cx="130" cy="106" r="3.5"/><circle cx="96" cy="50" r="4"/><circle cx="105" cy="46" r="3"/></g>' +
        '<g class="hand hl"><ellipse cx="78" cy="100" rx="9" ry="14"/></g><g class="hand hr"><ellipse cx="122" cy="100" rx="9" ry="14"/></g>',
      '<path class="stream" d="M78 2 V40 M90 0 V36 M110 0 V36 M122 2 V40"/>',
      '<g class="towel"><rect x="104" y="80" width="46" height="40" rx="10"/><path d="M110 92 H144 M110 100 H144 M110 108 H144"/></g>',
      '<g class="cream"><circle cx="100" cy="52" r="3.5"/><circle cx="80" cy="96" r="3.5"/><circle cx="120" cy="96" r="3.5"/><circle cx="100" cy="117" r="3.5"/><circle cx="100" cy="88" r="3"/></g>' +
        '<g class="sun"><circle cx="164" cy="34" r="9"/><path d="M164 16 v6 M164 46 v6 M146 34 h6 M176 34 h6 M151 21 l4 4 M173 43 l4 4 M151 47 l4 -4 M173 25 l4 -4"/></g>'
    ];
    var s = '<svg class="sf" viewBox="0 0 200 234" role="img" aria-label="Как правильно умываться">' +
      '<circle class="bgc" cx="100" cy="100" r="97"/>' + '<path class="skin" d="M26 200 C30 172 62 160 84 156 L116 156 C138 160 170 172 174 200 Z"/>' +
      '<path class="skin" d="M88 116 L87 162 L113 162 L112 116 Z"/>' + face;
    for (var i = 0; i < 5; i++) {
      s += '<g class="ph ph' + i + '">' + ph[i] + '<text class="cap" x="100" y="224">' + caps[i] + '</text></g>';
    }
    s += '<g class="pdots">';
    for (var j = 0; j < 5; j++) s += '<circle class="pd ph' + j + '" cx="' + (80 + j * 10) + '" cy="210" r="3"/>';
    return s + '</g></svg>';
  }

  /* ---------------- rendering ---------------- */
  var quiz = null; // { i, answers: [] } while the quiz is open
  var editType = false;
  function faceSwitch() {
    return '<div class="seg fc-seg" role="tablist"><a class="seg-btn" href="#jaw">💪 Челюсть 30 дней</a><a class="seg-btn active" href="#skin">🧴 Уход за кожей</a></div>';
  }
  function srcLabel(r) { return r.source === 'preset' ? '✨ ' + (r.note || 'Подобрано персонально') : (r.source === 'manual' ? 'выбрано вручную' : 'по результатам теста'); }

  function quizCard() {
    if (!quiz) {
      return '<section class="card sk-quiz"><div class="card-head"><h2>Какой у тебя тип кожи?</h2></div>' +
        '<p class="muted small">6 коротких вопросов — и приложение соберёт утренний и вечерний уход с понятными ингредиентами (без брендов).</p>' +
        '<button type="button" class="btn primary big" data-sk="quiz-start">Пройти тест · 1 минута</button>' +
        '<div class="sk-or muted small">или выбери тип сам:</div>' + typePicker(null, false) + '</section>';
    }
    var q = QUIZ[quiz.i];
    return '<section class="card sk-quiz"><div class="card-head"><h2>Вопрос ' + (quiz.i + 1) + ' из ' + QUIZ.length + '</h2>' +
      '<button type="button" class="pill-link" data-sk="quiz-cancel">Отмена</button></div>' +
      '<div class="bar"><div class="bar-fill" style="width:' + Math.round(quiz.i / QUIZ.length * 100) + '%"></div></div>' +
      '<p class="sk-q">' + q.q + '</p><div class="sk-answers">' +
      q.a.map(function (a, k) { return '<button type="button" class="btn sk-ans" data-ans="' + k + '">' + a[0] + '</button>'; }).join('') + '</div>' +
      (quiz.i > 0 ? '<button type="button" class="link-btn" data-sk="quiz-back">‹ Предыдущий вопрос</button>' : '') + '</section>';
  }
  function typePicker(r, withAcne) {
    return '<div class="sk-types">' + Object.keys(TYPES).map(function (k) {
      return '<button type="button" class="chip' + (r && r.type === k ? ' on' : '') + '" data-type="' + k + '">' + TYPES[k].ic + ' ' + TYPES[k].name + '</button>';
    }).join('') + '</div>' +
      (withAcne ? '<label class="jw-check' + (r && r.acne ? ' on' : '') + '"><input type="checkbox" id="skAcne"' + (r && r.acne ? ' checked' : '') + '><span class="jw-ci">🎯</span><span class="grow"><b>Склонность к акне</b><small>частые воспаления, чёрные точки</small></span><span class="jw-tick"></span></label>' : '');
  }
  function finishQuiz() {
    var sc = { oily: 0, dry: 0, combo: 0, normal: 0, sens: 0, acne: 0 };
    quiz.answers.forEach(function (k, i) { var w = QUIZ[i].a[k][1]; for (var x in w) sc[x] += w[x]; });
    var type;
    if (sc.sens >= 3) type = 'sensitive';
    else {
      type = 'normal'; var best = -1;
      ['combo', 'oily', 'dry', 'normal'].forEach(function (t) { if (sc[t] > best) { best = sc[t]; type = t; } });
    }
    S.result = { type: type, acne: sc.acne >= 2, source: 'quiz', at: Date.now() };
    save(); quiz = null;
  }

  function checklist(r) {
    var routine = routineFor(r), now = new Date(), wd = now.getDay(), k = dkey(now), c = S.checks[k] || {};
    var req = required(now), done = req.filter(function (s) { return c[s.id]; }).length, st = streak();
    function rows(list) {
      return list.filter(function (s) { return stepToday(s, wd); }).map(function (s) {
        return '<label class="jw-check sk-step' + (c[s.id] ? ' on' : '') + '"><input type="checkbox" data-step="' + s.id + '"' + (c[s.id] ? ' checked' : '') + '>' +
          '<span class="jw-ci">' + s.ic + '</span><span class="grow"><b>' + s.t + (s.opt ? ' <em class="sk-opt">по желанию</em>' : '') + '</b><small>' + s.how + '</small></span><span class="jw-tick"></span></label>';
      }).join('');
    }
    var last7 = '', d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 6);
    for (var i = 0; i < 7; i++) { last7 += '<span class="sk-d7' + (dayDone(d) ? ' on' : '') + '"><i></i><small>' + WD[d.getDay()] + '</small></span>'; d.setDate(d.getDate() + 1); }
    var acidToday = routine.acid.days.indexOf(wd) >= 0;
    return '<section class="card"><div class="card-head"><h2>' + (routine.basic ? 'Базовый уход · ' : 'Сегодня · ') + WD[wd] + '</h2><span class="jw-pill">' + done + '/' + req.length + '</span></div>' +
      '<div class="bar"><div class="bar-fill" style="width:' + (req.length ? Math.round(done / req.length * 100) : 0) + '%"></div></div>' +
      '<div class="sk-streak"><span>🔥 Серия: <b>' + st + '</b> ' + plural(st, 'день', 'дня', 'дней') + '</span><span class="sk-d7row">' + last7 + '</span></div>' +
      '<h3 class="sk-h">☀️ Утро</h3>' + rows(routine.am) +
      '<h3 class="sk-h">🌙 Вечер ' + (acidToday ? '<span class="jw-pill light">день кислоты</span>' : '') + '</h3>' + rows(routine.pm) +
      '<p class="muted small sk-foot">День засчитывается, когда отмечены все обязательные шаги. Шаги «по желанию» не обязательны.</p></section>';
  }
  function resultCard(r) {
    var t = TYPES[r.type], acid = acidPlan(r.type, r.acne);
    return '<section class="card sk-result"><div class="sk-res-head"><span class="sk-res-ic">' + t.ic + '</span><div class="grow"><small class="muted">Твой тип кожи · ' + srcLabel(r) + '</small>' +
      '<h2>' + t.name + (r.acne ? ' <span class="jw-pill warn">склонна к акне</span>' : '') + '</h2></div></div>' +
      '<p class="muted small">' + t.desc + '</p>' +
      '<div class="sk-acid">✨ <b>Кислота:</b> ' + acid.name + ' — ' + acid.days.map(function (x) { return WD[x]; }).join(', ') + ' вечером (' + acid.days.length + ' ' + plural(acid.days.length, 'раз', 'раза', 'раз') + ' в неделю). ' +
      'Начни с 1 раза в неделю, через 2 недели — по плану.</div>' +
      (editType ? '<div class="sk-edit">' + typePicker(r, true) + '</div>' : '') +
      '<div class="sk-btns"><button type="button" class="btn" data-sk="edit">' + (editType ? 'Готово' : 'Изменить тип') + '</button><button type="button" class="btn" data-sk="quiz-start">Пройти тест заново</button></div></section>';
  }
  function washCard() {
    return '<section class="card sk-wash"><div class="card-head"><h2>Как правильно умываться</h2></div><div class="sk-wash-fig">' + washFig() + '</div>' +
      '<ul class="sk-list"><li>Вода тёплая, не горячая: горячая сушит и усиливает покраснение.</li><li>Массируй 30–60 секунд подушечками пальцев, без скрабов и щёток каждый день.</li>' +
      '<li>Отдельное чистое полотенце для лица, меняй его каждые 2–3 дня.</li><li>Крем — в течение 1–2 минут, пока кожа слегка влажная.</li></ul></section>';
  }
  function honestCard() {
    return '<div class="jw-disc"><b>⚠ Честно и безопасно.</b> Уход делает кожу спокойнее и ровнее, но результат виден через 4–8 недель. ' +
      'Новые средства вводи по одному раз в 1–2 недели и сначала проверяй на небольшом участке (24–48 ч). ' +
      '<b>К дерматологу</b>, если: болезненные узлы и кисты, следы и рубцы, акне не проходит за 2–3 месяца правильного ухода, сильное жжение, зуд, мокнутие, пятна, меняющиеся родинки. Не выдавливай воспаления и не прижигай спиртом.</div>';
  }
  function render() {
    var root = document.getElementById('skinRoot'); if (!root) return;
    applyPreset();
    var r = S.result, html = '<header class="top"><div><h1 class="title">Уход за кожей</h1><div class="subtitle">Тип кожи · утро и вечер · чек-лист</div></div></header>' + faceSwitch();
    if (!pro()) {
      quiz = null; editType = false;
      html += (r ? '<div class="jw-note">Тип кожи сохранён: <b>' + TYPES[r.type].name + '</b>' + (r.acne ? ', склонна к акне' : '') + '. Персональный уход под него вернётся с Про.</div>' : '') +
        checklist(r) + (window.HTPro ? window.HTPro.lockCard('Персональный уход', 'Тест на тип кожи, кислоты по дням недели, сыворотки и шаги против высыпаний — под твою кожу.', 'skin') : '') +
        washCard() + honestCard();
    }
    else if (!r || quiz) html += quizCard() + (r ? '' : honestCard() + washCard());
    else html += resultCard(r) + checklist(r) + washCard() + honestCard();
    root.innerHTML = html;
  }

  document.addEventListener('click', function (e) {
    var root = document.getElementById('skinRoot');
    if (!root || !root.contains(e.target)) return;
    var b = e.target.closest('[data-sk],[data-ans],[data-type]');
    if (!b) return;
    var a = b.getAttribute('data-sk');
    if (a === 'quiz-start') { quiz = { i: 0, answers: [] }; editType = false; render(); root.scrollIntoView({ block: 'start' }); return; }
    if (a === 'quiz-cancel') { quiz = null; render(); return; }
    if (a === 'quiz-back') { if (quiz && quiz.i > 0) { quiz.i--; quiz.answers.pop(); render(); } return; }
    if (a === 'edit') { editType = !editType; render(); return; }
    if (b.hasAttribute('data-ans') && quiz) {
      quiz.answers[quiz.i] = parseInt(b.getAttribute('data-ans'), 10);
      if (quiz.i < QUIZ.length - 1) quiz.i++; else finishQuiz();
      render(); window.scrollTo(0, 0); return;
    }
    if (b.hasAttribute('data-type')) {
      var acne = S.result ? !!S.result.acne : false;
      S.result = { type: b.getAttribute('data-type'), acne: acne, source: 'manual', at: Date.now() };
      save(); quiz = null; render();
    }
  });
  document.addEventListener('change', function (e) {
    var root = document.getElementById('skinRoot');
    if (!root || !root.contains(e.target)) return;
    var t = e.target;
    if (t.id === 'skAcne' && S.result) { S.result.acne = t.checked; S.result.source = 'manual'; save(); render(); return; }
    if (t.hasAttribute('data-step')) {
      var k = dkey(); S.checks[k] = S.checks[k] || {};
      if (t.checked) S.checks[k][t.getAttribute('data-step')] = true; else delete S.checks[k][t.getAttribute('data-step')];
      if (t.checked) { S.at = S.at || {}; S.at[k] = Date.now(); }
      save(); var y = window.scrollY; render(); window.scrollTo(0, y);
    }
  });

  function summary() {
    if (!pro()) {
      var n0 = new Date(), rq = required(n0), cc = S.checks[dkey(n0)] || {};
      return 'Базовый уход · сегодня ' + rq.filter(function (s) { return cc[s.id]; }).length + '/' + rq.length + ' · 🔥 ' + streak();
    }
    if (!S.result) return 'Тест на тип кожи · уход утром и вечером';
    var now = new Date(), req = required(now), c = S.checks[dkey(now)] || {};
    var n = req.filter(function (s) { return c[s.id]; }).length;
    return TYPES[S.result.type].name + ' · сегодня ' + n + '/' + req.length + ' · 🔥 ' + streak();
  }
  /* v7: numbers for the AI assistant */
  function stats() {
    var now = new Date(), req = required(now), c = S.checks[dkey(now)] || {}, last7 = 0, d = new Date();
    d.setHours(12, 0, 0, 0);
    for (var i = 0; i < 7; i++) { if (dayDone(d)) last7++; d.setDate(d.getDate() - 1); }
    var r = S.result;
    return {
      type: r ? r.type : null, typeName: r ? TYPES[r.type].name : '', acne: !!(r && r.acne),
      doneToday: req.filter(function (s) { return c[s.id]; }).length, reqToday: req.length, streak: streak(), last7: last7,
      anyChecks: Object.keys(S.checks).some(function (k) { return Object.keys(S.checks[k] || {}).length > 0; }), basic: !pro() || !r
    };
  }
  // v8: days with ticked skincare steps for the activity history (history.js) and the AI assistant
  function history() {
    var names = {}, add = function (r) { r.am.forEach(function (s) { names[s.id] = { t: s.t, ic: s.ic, pm: false }; }); r.pm.forEach(function (s) { names[s.id] = { t: s.t, ic: s.ic, pm: true }; }); };
    add(basicRoutine()); if (S.result && TYPES[S.result.type]) add(buildRoutine(S.result.type, S.result.acne));
    return Object.keys(S.checks).sort().map(function (k) {
      var ids = Object.keys(S.checks[k] || {}).filter(function (id) { return S.checks[k][id]; });
      if (!ids.length) return null;
      var p = k.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2], 12);
      return { date: k, at: (S.at && S.at[k]) || null, full: dayDone(d),
        steps: ids.map(function (id) { var n = names[id]; return { id: id, t: n ? n.t : id, ic: n ? n.ic : '•', pm: n ? n.pm : /^pm/.test(id) }; }) };
    }).filter(Boolean);
  }
  window.SkinModule = { render: render, summary: summary, stats: stats, history: history, TYPES: TYPES, buildRoutine: buildRoutine };
})();
