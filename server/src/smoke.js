// Run with the server up: npm run smoke. Checks login, permissions, products, stock and the oversell guard.
require('./config'); const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 4000}`; let fails = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); if (!ok) fails++; };
async function call(method, path, body, cookie) {
  const r = await fetch(BASE + '/api/v1' + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
  return { status: r.status, data: await r.json().catch(() => ({})), cookie: sc.map(c => c.split(';')[0]).join('; ') };
}
const login = async (email, pw) => (await call('POST', '/auth/login', { email, password: pw })).cookie;
(async () => {
  check('not signed in is refused', (await call('GET', '/products')).status === 401);
  check('wrong password is refused', (await call('POST', '/auth/login', { email: 'manager@shop.co.ke', password: 'wrong-password' })).status === 401);
  const cash = await login('cashier@shop.co.ke', 'cashier123'), mgr = await login('manager@shop.co.ke', 'manager123');
  const me = await call('GET', '/auth/me', null, mgr); check('manager /me has role and permissions', me.data.role === 'manager' && me.data.permissions.includes('products.write'));
  const list = await call('GET', '/products', null, cash); check('cashier can list products with stock', list.status === 200 && list.data.length >= 12 && typeof list.data[0].price === 'number', JSON.stringify(list.data).slice(0, 120));
  check('cashier cannot create products', (await call('POST', '/products', { name: 'X', cost: 1, price: 2 }, cash)).status === 403);
  check('cashier cannot adjust stock', (await call('POST', '/inventory/adjustments', { productId: list.data[0].id, type: 'RECEIVE', delta: 1 }, cash)).status === 403);
  const sku = 'SMK' + Date.now(), made = await call('POST', '/products', { name: 'Smoke test item', sku, barcode: '', cost: 5000, price: 7550, taxRate: 16, reorder: 3, category: 'Testing' }, mgr);
  check('manager creates a product (prices in cents)', made.status === 201 && made.data.price === 7550 && made.data.cost === 5000 && made.data.stock === 0, JSON.stringify(made.data));
  check('duplicate SKU is refused', (await call('POST', '/products', { name: 'Dup', sku, cost: 1, price: 2 }, mgr)).status === 409);
  const id = made.data.id; check('search finds it', (await call('GET', '/products?q=smoke%20test', null, mgr)).data.some(p => p.id === id));
  check('edit changes price', (await call('PATCH', '/products/' + id, { price: 9000 }, mgr)).data.price === 9000);
  check('receiving 10 units works', (await call('POST', '/inventory/adjustments', { productId: id, type: 'RECEIVE', delta: 10, reason: 'smoke' }, mgr)).data.stock === 10);
  check('stock cannot go below zero', (await call('POST', '/inventory/adjustments', { productId: id, type: 'ADJUSTMENT', delta: -20, reason: 'too much' }, mgr)).status === 400);
  check('adjustment needs a reason', (await call('POST', '/inventory/adjustments', { productId: id, type: 'ADJUSTMENT', delta: -1 }, mgr)).status === 400);
  const race = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/inventory/adjustments', { productId: id, type: 'ADJUSTMENT', delta: -3, reason: 'race' }, mgr)));
  const okCount = race.filter(r => r.status === 200).length, final = (await call('GET', '/products?q=smoke%20test', null, mgr)).data.find(p => p.id === id).stock;
  check('5 simultaneous removals of 3 from 10: exactly 3 succeed, 1 left', okCount === 3 && final === 1, `succeeded=${okCount} stock=${final}`);
  const mv = await call('GET', '/inventory/movements', null, mgr); check('movements are recorded', mv.status === 200 && mv.data.some(m => m.productId === id && m.type === 'RECEIVE'));
  check('cashier cannot view movements', (await call('GET', '/inventory/movements', null, cash)).status === 403);
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('Smoke test could not run. Is the server running?', e.message); process.exit(1); });
