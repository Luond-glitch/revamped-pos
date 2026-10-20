// With the server running and seed data loaded: npm run smoke:sales
require('./config'); const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 4000}`; let fails = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); if (!ok) fails++; };
const uid = () => require('crypto').randomUUID();
async function call(method, path, body, cookie) {
  const r = await fetch(BASE + '/api/v1' + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
  return { status: r.status, data: await r.json().catch(() => ({})), cookie: sc.map(c => c.split(';')[0]).join('; ') };
}
const login = async (e, p) => (await call('POST', '/auth/login', { email: e, password: p })).cookie;
(async () => {
  const cash = await login('cashier@shop.co.ke', 'cashier123'), mgr = await login('manager@shop.co.ke', 'manager123');
  const me = (await call('GET', '/auth/me', null, cash)).data; check('me includes the till', !!me.registerId, JSON.stringify(me));
  const mk = async (tag, stock) => { const p = (await call('POST', '/products', { name: 'Sales smoke ' + tag, sku: 'SS' + tag + Date.now(), cost: 6000, price: 10000, taxRate: 16 }, mgr)).data;
    if (stock) await call('POST', '/inventory/adjustments', { productId: p.id, type: 'RECEIVE', delta: stock, reason: 'smoke' }, mgr); return p; };
  const A = await mk('A', 10), B = await mk('B', 3);
  const sell = (items, payments, extra = {}, who = cash) => call('POST', '/sales', { idempotencyKey: uid(), items, payments, ...extra }, who);
  const stockOf = async p => (await call('GET', '/products?q=' + encodeURIComponent(p.sku), null, mgr)).data[0].stock;
  const open = await call('GET', `/registers/${me.registerId}/shifts/current`, null, cash);
  if (open.data && open.data.id) await call('POST', `/registers/${me.registerId}/shifts/close`, { closingCash: 0 }, cash); // start clean
  check('selling without a shift is refused', (await sell([{ productId: A.id, quantity: 1 }], [{ method: 'CASH', amount: 10000 }])).status === 400);
  const sh = await call('POST', `/registers/${me.registerId}/shifts/open`, { openingCash: 10000 }, cash);
  check('cashier opens a shift', sh.status === 201 && sh.data.openingCash === 10000, JSON.stringify(sh.data));
  check('a second shift is refused', (await call('POST', `/registers/${me.registerId}/shifts/open`, { openingCash: 0 }, cash)).status === 409);
  const key = uid(), body = { idempotencyKey: key, items: [{ productId: A.id, quantity: 2 }], payments: [{ method: 'CASH', amount: 50000 }] };
  const s1 = await call('POST', '/sales', body, cash);
  check('cash sale: total, VAT, change', s1.status === 201 && s1.data.grandTotal === 20000 && s1.data.taxTotal === 2759 && s1.data.change === 30000 && /^R-\d+/.test(s1.data.receiptNumber), JSON.stringify(s1.data));
  check('stock went down by 2', (await stockOf(A)) === 8);
  const again = await call('POST', '/sales', body, cash);
  check('same request again returns the same sale (no duplicate)', again.status === 200 && again.data.id === s1.data.id && (await stockOf(A)) === 8, again.status + ' ' + (await stockOf(A)));
  check('same key with a different cart is refused', (await call('POST', '/sales', { ...body, items: [{ productId: A.id, quantity: 3 }] }, cash)).status === 422);
  check('not enough stock is refused', (await sell([{ productId: A.id, quantity: 99 }], [{ method: 'CASH', amount: 990000 }])).status === 409);
  check('short payment is refused', (await sell([{ productId: A.id, quantity: 1 }], [{ method: 'CASH', amount: 5000 }])).status === 400);
  check('cashier discount over 5% is refused', (await sell([{ productId: A.id, quantity: 1 }], [{ method: 'CASH', amount: 10000 }], { discount: 2000 })).status === 403);
  const d = await sell([{ productId: A.id, quantity: 1 }], [{ method: 'CASH', amount: 10000 }], { discount: 400 });
  check('cashier 4% discount is accepted', d.status === 201 && d.data.grandTotal === 9600 && d.data.discountTotal === 400, JSON.stringify(d.data));
  const code = 'SMK' + Date.now().toString(36).toUpperCase(), sp = await sell([{ productId: A.id, quantity: 1 }], [{ method: 'MPESA', amount: 6000, reference: code }, { method: 'CASH', amount: 5000 }]);
  check('split M-Pesa + cash sale: payments add up to the total', sp.status === 201 && sp.data.method === 'SPLIT' && sp.data.payments.reduce((a, p) => a + p.amount, 0) === 10000 && sp.data.change === 1000, JSON.stringify(sp.data));
  check('the same M-Pesa code cannot be used twice', (await sell([{ productId: A.id, quantity: 1 }], [{ method: 'MPESA', amount: 10000, reference: code }])).status === 409);
  const race = await Promise.all(Array.from({ length: 6 }, () => sell([{ productId: B.id, quantity: 1 }], [{ method: 'CASH', amount: 10000 }])));
  check('6 simultaneous sales of 3 units: exactly 3 succeed, stock is 0', race.filter(r => r.status === 201).length === 3 && (await stockOf(B)) === 0, race.map(r => r.status).join());
  check('cashier cannot refund', (await call('POST', `/sales/${s1.data.id}/refunds`, { reason: 'test', items: [{ productId: A.id, quantity: 1 }] }, cash)).status === 403);
  const before = await stockOf(A);
  const r1 = await call('POST', `/sales/${s1.data.id}/refunds`, { reason: 'damaged', items: [{ productId: A.id, quantity: 1 }] }, mgr);
  const after = await stockOf(A);
  check('manager part-refunds 1 of 2: status, amount, and 1 unit back in stock', r1.status === 200 && r1.data.status === 'PARTIALLY_REFUNDED' && r1.data.refundTotal === 10000 && after === before + 1, `status=${r1.data.status} refundTotal=${r1.data.refundTotal} stock ${before}->${after}`);
  check('refunding more than was sold is refused', (await call('POST', `/sales/${s1.data.id}/refunds`, { reason: 'again', items: [{ productId: A.id, quantity: 2 }] }, mgr)).status === 400);
  const r2 = await call('POST', `/sales/${s1.data.id}/refunds`, { reason: 'rest', items: [{ productId: A.id, quantity: 1 }] }, mgr);
  check('refunding the rest completes the refund exactly', r2.data.status === 'REFUNDED' && r2.data.refundTotal === 20000, JSON.stringify(r2.data).slice(0, 200));
  const mine = await call('GET', '/reports/sales', null, cash), all = await call('GET', '/reports/sales', null, mgr);
  check('cashier sees only own sales; manager sees all', mine.status === 200 && mine.data.every(s => s.cashier === me.name) && all.data.length >= mine.data.length);
  const cashIn = mine.data.filter(s => s.createdAt >= sh.data.openedAt).flatMap(s => s.payments).filter(p => p.method === 'CASH').reduce((a, p) => a + p.amount, 0);
  const close = await call('POST', `/registers/${me.registerId}/shifts/close`, { closingCash: 10000 + cashIn }, cash);
  check('shift close: expected cash = opening + cash taken (refunds were paid by the manager, outside this drawer)', close.status === 200 && close.data.expected === 10000 + cashIn && close.data.difference === 0, JSON.stringify(close.data) + ' cashIn=' + cashIn);
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll sales checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('Could not run. Is the server running and seeded?', e.message); process.exit(1); });