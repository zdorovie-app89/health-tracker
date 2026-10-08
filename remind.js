/* Здоровье v9.3 — три локальных напоминания (каждое включается отдельно):
 *   утром — записать сон (если не записан), днём — вода (только если отстаёшь от темпа), вечером — тренировка (если по плану).
 * Сервера push нет, поэтому честно: проверка идёт, когда приложение открыто / возвращается на экран / работает в фоне
 * (страница или установленное приложение). Если вкладка скрыта и уведомления разрешены — системное уведомление через
 * service worker (на iPhone — только для приложения на экране «Домой», iOS 16.4+); иначе напоминание внутри приложения.
 * Где браузер умеет Notification Triggers (экспериментально) — утреннее напоминание ставится заранее на 9:00.
 * Settings: health.v9 → remind: { sleep, water, workout: bool, last: { id: 'YYYY-MM-DD' } } */
(function () {
  'use strict';
  function A() { return window.HTApp; }
  function V() { return window.V9; }
  var R = { sleep: { ic: '🌙', t: 'Утром — записать сон', s: 'с 8:00 до 12:00, если прошлая ночь не записана' },
    water: { ic: '💧', t: 'Днём — вода', s: 'только если отстаёшь от темпа к цели' },
    workout: { ic: '🏋️', t: 'Вечером — тренировка', s: 'с 17:00, если сегодня по плану и ещё не сделана' } };
  var IDS = ['sleep', 'water', 'workout'];
  function cfg() { var P = V().P(); if (!P.remind || typeof P.remind !== 'object') P.remind = {}; if (!P.remind.last) P.remind.last = {}; return P.remind; }
  function supported() { return 'Notification' in window; }
  function perm() { return supported() ? Notification.permission : 'unsupported'; }
  function val(id, k) { return V().util.val(id, k); }

  function due(now) {
    now = now || new Date();
    var c = cfg(), u = V().util, tk = A().todayKey(), h = now.getHours() + now.getMinutes() / 60, out = [];
    if (c.sleep && V().goalOn('sleep') && h >= 8 && h < 12 && val('sleep', u.key(u.addD(u.today0(), -1))) === null)
      out.push({ id: 'sleep', title: '🌙 Сколько ты спал?', body: 'Запиши прошлую ночь — это одно касание.' });
    if (c.water && V().goalOn('water') && h >= 11 && h < 20) {
      var g = A().settings().goals.water, v = val('water', tk) || 0, frac = Math.max(0, Math.min(1, (h - 8) / 13)), pace = g * frac;
      if (g && v < g && v < pace - 300) out.push({ id: 'water', title: '💧 Вода: ' + Math.round(v) + ' из ' + g + ' мл', body: 'К этому времени обычно уже около ' + (Math.round(pace / 50) * 50) + ' мл. Выпей стакан?' });
    }
    if (c.workout && V().goalOn('workout') && h >= 17 && h < 21) {
      var p = V().plannedToday(), live = window.HistoryModule && window.HistoryModule.isLive();
      var doneW = window.HistoryModule && window.HistoryModule.workoutsBetween(tk, tk).length || (val('workout', tk) || 0) > 0;
      if (p && !doneW && !live) out.push({ id: 'workout', title: '🏋️ Сегодня по плану: ' + p.title, body: (p.min ? '≈ ' + p.min + ' мин. ' : '') + 'Начать тренировку?' });
    }
    return out.filter(function (r) { return c.last[r.id] !== tk; });
  }
  // delivery (replaceable in tests)
  function notifySystem(r) {
    var opts = { body: r.body, tag: 'ht-' + r.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#today' } };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) return navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(r.title, opts); }).then(function () { return true; });
    try { new Notification(r.title, opts); return Promise.resolve(true); } catch (e) { return Promise.resolve(false); }
  }
  var api = { notifySystem: notifySystem, inApp: function (r) { A().toast('⏰ ' + r.title); } };
  function check(now) {
    if (!A() || !V()) return [];
    var list = due(now), c = cfg(), tk = A().todayKey(), fired = [];
    list.forEach(function (r) {
      if (document.visibilityState === 'visible') { api.inApp(r); c.last[r.id] = tk; fired.push(r.id + ':app'); }
      else if (perm() === 'granted') { c.last[r.id] = tk; fired.push(r.id + ':sys'); api.notifySystem(r).catch(function () { delete c.last[r.id]; V().save(); }); }
      // hidden + no permission → stays due and shows in the app on the next open
    });
    if (fired.length) V().save();
    trigger();
    return fired;
  }
  // experimental Notification Triggers: pre-schedule tomorrow's 9:00 sleep reminder; cancel today's once sleep is logged
  function trigger() {
    try {
      if (!(window.TimestampTrigger && 'showTrigger' in Notification.prototype) || perm() !== 'granted' || !navigator.serviceWorker) return;
      navigator.serviceWorker.ready.then(function (reg) {
        var c = cfg(), u = V().util;
        reg.getNotifications({ tag: 'ht-sleep-trig', includeTriggered: true }).then(function (ns) {
          ns.forEach(function (n) { n.close(); });
          if (!c.sleep) return;
          var t = new Date(); t.setDate(t.getDate() + (val('sleep', u.key(u.addD(u.today0(), -1))) === null && t.getHours() < 9 ? 0 : 1)); t.setHours(9, 0, 0, 0);
          reg.showNotification('🌙 Сколько ты спал?', { tag: 'ht-sleep-trig', body: 'Запиши прошлую ночь, если ещё не записал.', icon: 'icons/icon-192.png', data: { url: './#today' }, showTrigger: new window.TimestampTrigger(t.getTime()) });
        });
      }).catch(function () {});
    } catch (e) { /* not available */ }
  }

  function permLine() {
    var p = perm(), ios = V().isIOS(), sa = V().standalone();
    if (p === 'unsupported') return ios && !sa ? 'Safari показывает уведомления только приложению на экране «Домой» (iOS 16.4+). Пока — напомню внутри приложения.' : 'Этот браузер не умеет уведомления — напомню внутри приложения.';
    if (p === 'denied') return 'Уведомления запрещены в настройках браузера — напомню внутри приложения при открытии.';
    if (p === 'granted') return 'Уведомления разрешены ✓';
    return 'При включении спрошу разрешение на уведомления.';
  }
  function renderSettings() {
    var box = document.getElementById('v9RemindCard'); if (!box || !V()) return;
    var c = cfg();
    box.innerHTML = '<div class="card-head"><h2>⏰ Напоминания</h2></div>' + IDS.map(function (id) {
      var on = !!c[id];
      return '<div class="goal-row v9-goal-row' + (on ? '' : ' off') + '"><button type="button" class="v9-switch" role="switch" aria-checked="' + on + '" data-v9rem="' + id + '" aria-label="' + R[id].t + '"><i></i></button>' +
        '<span class="row-lbl">' + R[id].ic + ' ' + R[id].t + '<small class="muted v9-rem-s">' + R[id].s + '</small></span></div>';
    }).join('') +
      '<p class="muted small v9-rem-perm">' + permLine() + '</p>' +
      '<p class="muted small">Честно: сервера для push-уведомлений нет. Напоминание приходит, когда приложение или браузер может работать — открыто, свёрнуто недавно или установлено на экран «Домой». Если телефон его «усыпил», напомню, как только откроешь приложение.</p>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-v9rem]'); if (!b || !V()) return;
    var id = b.getAttribute('data-v9rem'), c = cfg(), on = !c[id];
    c[id] = on; V().save(); renderSettings();
    if (on && perm() === 'default') Notification.requestPermission().then(function () { renderSettings(); trigger(); }).catch(function () {});
    if (on) A().toast(R[id].ic + ' Напоминание включено'); else trigger();
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(check, 1200); });
  window.addEventListener('load', function () { setTimeout(check, 2500); });
  setInterval(function () { check(); }, 5 * 60 * 1000);

  window.V9Remind = { due: due, check: check, renderSettings: renderSettings, api: api, cfg: cfg, perm: perm };
})();
