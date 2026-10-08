/* Payment mode (v9.6).
 *   mode: 'telegram'  (default) — «Оплатить» opens Telegram (@FoZIKS7) with a ready order; payment is a private SBP / card
 *                     transfer; the seller sends a key link. No requisites are stored in the app.
 *   mode: 'yookassa'  — the app calls the payment server at `endpoint` (https only): POST /api/pay/create → payment page,
 *                     then polls GET /api/pay/status?order=… and activates the returned key by itself.
 * Switching later = change this file and redeploy (the file is covered by the signed integrity manifest). */
window.HT_PAY_CFG = { mode: 'telegram', endpoint: '' };
