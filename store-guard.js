/* Здоровье v9.4 — защита записей в localStorage.
 * Every localStorage.setItem in the app goes through this wrapper. When the browser storage is full
 * (QuotaExceededError) it frees space in this order and retries: 1) AI chat history and photo previews,
 * 2) cached Open Food Facts products (the user's own manual products are kept). The user gets one calm warning.
 * Core records (health.v2, food diary, workouts) are therefore saved whenever any space can be freed.
 * While «Удалить все данные» reloads the page, writes of the wiped stores are ignored (no stale state comes back). */
(function () {
  'use strict';
  var proto = window.Storage && window.Storage.prototype;
  if (!proto || proto.__htGuard) return;
  var orig = proto.setItem;
  var WIPED = /^health\.(history|sleeptimes|jaw|skin|foodfav|barcode|measure|food|plan)\.v1$/;
  var warned = 0;
  function isQuota(e) { return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014); }
  function warn(msg) {
    if (Date.now() - warned < 60000) return; warned = Date.now();
    setTimeout(function () { if (window.HTApp && window.HTApp.toast) window.HTApp.toast(msg); }, 0);
  }
  // returns true if something was freed
  function trim(store, step, skipKey) {
    try {
      if (step === 0) {
        if (window.AIModule && window.AIModule.trim) { window.AIModule.trim(8); return true; }
        var a = JSON.parse(store.getItem('health.ai.v1') || 'null'); if (!a || !a.msgs || skipKey === 'health.ai.v1') return false;
        a.msgs = a.msgs.slice(-8).filter(function (m) { return !m.photo; }); a.photos = {};
        orig.call(store, 'health.ai.v1', JSON.stringify(a)); return true;
      }
      if (step === 1) {
        if (skipKey === 'health.barcode.v1') return false;
        var b = JSON.parse(store.getItem('health.barcode.v1') || 'null'); if (!b) return false;
        var keep = {}, n = 0; Object.keys(b).forEach(function (k) { if (b[k] && b[k].src === 'me') keep[k] = b[k]; else n++; });
        if (!n) return false; orig.call(store, 'health.barcode.v1', JSON.stringify(keep)); return true;
      }
      if (step === 2) {   // last resort: drop the whole AI chat history (settings stay)
        var c = JSON.parse(store.getItem('health.ai.v1') || 'null'); if (!c || skipKey === 'health.ai.v1' || !(c.msgs && c.msgs.length)) return false;
        c.msgs = []; c.photos = {}; orig.call(store, 'health.ai.v1', JSON.stringify(c));
        if (window.AIModule && window.AIModule.trim) window.AIModule.trim(0);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  proto.setItem = function (key, value) {
    if (window.__htClearing && WIPED.test(String(key))) return;
    try { return orig.call(this, key, value); } catch (e) {
      if (!isQuota(e)) throw e;
      for (var step = 0; step < 3; step++) {
        if (!trim(this, step, key)) continue;
        try { orig.call(this, key, value); warn('Память браузера почти заполнена: я сократил историю ИИ-чата, чтобы сохранить записи. Скачай копию данных в «Профиле».'); return; } catch (e2) { if (!isQuota(e2)) throw e2; }
      }
      warn('Не удалось сохранить: память браузера заполнена. Скачай копию данных и удали старые фото или историю чата.');
      throw e;
    }
  };
  proto.__htGuard = true;
  window.HTStoreGuard = { isQuota: isQuota };
})();
