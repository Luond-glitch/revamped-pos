/* API layer. Pages only call API.*  — flip USE_MOCK to false when the Express backend exists.
   Money is integer cents in the UI/mock; map to/from NUMERIC strings in the real branch below. */
const CONFIG = { USE_MOCK: true, BASE: '/api/v1', BRANCH_ID: 'branch-1', REGISTER_ID: 'register-1' };

const RealAPI = {
  async req(method, path, body) {
    const r = await fetch(CONFIG.BASE + path, { method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || 'Request failed (' + r.status + ')');
    return data;
  },
  login: (email, password) => RealAPI.req('POST', '/auth/login', { email, password }),
  logout: () => RealAPI.req('POST', '/auth/logout'),
  me: () => RealAPI.req('GET', '/auth/me'),
  products: (q = '') => RealAPI.req('GET', '/products?q=' + encodeURIComponent(q)),
  saveProduct: p => p.id ? RealAPI.req('PATCH', '/products/' + p.id, p) : RealAPI.req('POST', '/products', p),
  adjustStock: a => RealAPI.req('POST', '/inventory/adjustments', a),
  movements: () => RealAPI.req('GET', '/inventory/movements'),
  users: () => RealAPI.req('GET', '/users'),
  saveUser: u => RealAPI.req('POST', '/users', u),
  setUserStatus: (id, status) => RealAPI.req('PATCH', '/users/' + id, { status }),
  customers: () => RealAPI.req('GET', '/customers'),
  saveCustomer: c => RealAPI.req('POST', '/customers', c),
  findCustomer: q => RealAPI.req('GET', '/customers/lookup?q=' + encodeURIComponent(q)),
  clientSignup: c => RealAPI.req('POST', '/client/auth/signup', c),
  clientLogin: (email, password) => RealAPI.req('POST', '/client/auth/login', { email, password }),
  clientLogout: () => RealAPI.req('POST', '/client/auth/logout'),
  clientMe: () => RealAPI.req('GET', '/client/auth/me'),
  clientProducts: () => RealAPI.req('GET', '/public/products'),
  clientPurchases: () => RealAPI.req('GET', '/client/purchases'),
  suppliers: () => RealAPI.req('GET', '/suppliers'),
  saveSupplier: s => RealAPI.req('POST', '/suppliers', s),
  purchaseOrders: () => RealAPI.req('GET', '/purchase-orders'),
  createPurchaseOrder: o => RealAPI.req('POST', '/purchase-orders', o),
  receivePurchaseOrder: (id, r) => RealAPI.req('POST', '/purchase-orders/' + id + '/receipts', r),
  refund: (id, r) => RealAPI.req('POST', '/sales/' + id + '/refunds', r),
  createSale: s => RealAPI.req('POST', '/sales', s),
  sales: () => RealAPI.req('GET', '/reports/sales'),
  currentShift: () => RealAPI.req('GET', '/registers/' + CONFIG.REGISTER_ID + '/shifts/current'),
  openShift: openingCash => RealAPI.req('POST', '/registers/' + CONFIG.REGISTER_ID + '/shifts/open', { openingCash }),
  closeShift: closingCash => RealAPI.req('POST', '/registers/' + CONFIG.REGISTER_ID + '/shifts/close', { closingCash }),
};

const MockAPI = (() => {
  const KEY = 'pos_db', uid = () => crypto.randomUUID();
  const seed = () => ({
    users: [
      { id: 'u1', name: 'Wanjiku (Manager)', email: 'manager@shop.co.ke', password: 'manager123', role: 'manager' },
      { id: 'u2', name: 'Otieno (Cashier)', email: 'cashier@shop.co.ke', password: 'cashier123', role: 'cashier' }],
    products: [
      ['Maize flour 2kg','MF2','6001',21000,19000,0,40],['Sugar 1kg','SG1','6002',18500,16500,0,35],['Cooking oil 1L','OIL1','6003',32000,28500,16,24],
      ['Fresh milk 500ml','ML5','6004',6500,5500,0,60],['Bread 400g','BR4','6005',6500,5300,0,30],['Eggs tray (30)','EG30','6006',51000,46000,0,12],
      ['Rice 1kg','RC1','6007',20000,17500,0,28],['Tea leaves 250g','TL25','6008',12000,10000,16,22],['Bar soap','SP1','6009',9500,7500,16,45],
      ['Tissue 4-pack','TS4','6010',17000,14000,16,18],['Soda 500ml','SD5','6011',5500,4000,16,70],['Drinking water 1L','WT1','6012',10000,7000,0,50]
    ].map(([name, sku, barcode, price, cost, taxRate, stock]) => ({ id: uid(), name, sku, barcode, category: 'General', price, cost, taxRate, stock, reorder: 10, trackStock: true })),
    movements: [], sales: [], shift: null, idem: {}, seq: 1000
  });
  const save = d => (localStorage.setItem(KEY, JSON.stringify(d)), d);
  const load = () => JSON.parse(localStorage.getItem(KEY) || 'null') || (save(seed()), load());
  const wait = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 80));
  const fail = m => new Promise((_, j) => setTimeout(() => j(new Error(m)), 80));
  const me = () => JSON.parse(sessionStorage.getItem('pos_user') || 'null');
  return {
    async login(email, password) {
      const u = load().users.find(u => u.email === email.trim().toLowerCase() && u.password === password);
      if (!u || u.status === 'inactive') return fail(u ? 'This account is switched off. Ask your manager.' : 'Email or password is incorrect.');
      const { password: _, ...safe } = u; sessionStorage.setItem('pos_user', JSON.stringify(safe)); return wait(safe);
    },
    async logout() { sessionStorage.removeItem('pos_user'); return wait({}); },
    async me() { return me() ? wait(me()) : fail('Not signed in'); },
    async products(q = '') { q = q.toLowerCase(); return wait(load().products.filter(p => !q || [p.name, p.sku, p.barcode].some(x => x.toLowerCase().includes(q)))); },
    async saveProduct(p) {
      const d = load(); if (!p.name || p.price < 0) return fail('Name and a valid price are required.');
      if (d.products.some(x => x.sku === p.sku && x.id !== p.id)) return fail('SKU already exists.');
      if (p.id) Object.assign(d.products.find(x => x.id === p.id), p); else d.products.push({ ...p, id: uid(), stock: 0, trackStock: true });
      save(d); return wait(p);
    },
    async adjustStock({ productId, delta, type, reason }) { // balance + movement change together, like the future DB transaction
      const d = load(), p = d.products.find(x => x.id === productId);
      if (!p || !delta) return fail('Choose a product and a quantity.'); if (p.stock + delta < 0) return fail('Stock cannot go below zero.');
      p.stock += delta; d.movements.unshift({ id: uid(), productId, name: p.name, type, delta, reason, by: me().name, at: new Date().toISOString() });
      save(d); return wait(p);
    },
    async movements() { return wait(load().movements.slice(0, 100)); },
    async createSale({ items, payments, discount = 0, customerId = null, idempotencyKey }) {
      const d = load(); if (d.idem[idempotencyKey]) return wait(d.sales.find(s => s.id === d.idem[idempotencyKey]));
      if (!d.shift) return fail('Open a shift before selling.'); if (!items.length) return fail('Cart is empty.');
      const rows = []; let sub = 0;
      for (const it of items) { // server-side price lookup: never trust browser prices
        const p = d.products.find(x => x.id === it.productId); if (!p) return fail('Product not found.');
        if (p.trackStock && p.stock < it.quantity) return fail('Not enough stock: ' + p.name + ' (' + p.stock + ' left).');
        rows.push({ p, q: it.quantity, lt: p.price * it.quantity }); sub += p.price * it.quantity;
      }
      if (discount < 0 || discount > sub) return fail('Discount is more than the sale total.');
      if (me().role !== 'manager' && discount > sub * 0.05) return fail('Discounts above 5% need a manager.');
      let left = discount, total = 0, tax = 0; const lines = [];
      rows.forEach((r, i) => { const share = i === rows.length - 1 ? left : Math.round(r.lt * discount / sub); left -= share;
        const lt = r.lt - share, lx = Math.round(lt * r.p.taxRate / (100 + r.p.taxRate)); // tax follows the discounted price
        lines.push({ productId: r.p.id, name: r.p.name, quantity: r.q, unitPrice: r.p.price, unitCost: r.p.cost, taxAmount: lx, lineTotal: lt }); total += lt; tax += lx; });
      const paid = payments.reduce((a, x) => a + x.amount, 0), cash = payments.filter(x => x.method === 'CASH').reduce((a, x) => a + x.amount, 0);
      if (paid < total) return fail('Payment is less than the amount due.');
      if (paid - cash > total) return fail('Card and M-Pesa payments cannot be more than the amount due.');
      if (payments.some(x => x.method !== 'CASH' && !x.reference)) return fail('Enter the M-Pesa code or card reference.');
      const change = paid - total, rec = payments.map(x => x.method === 'CASH' ? { ...x, amount: x.amount - change } : x).filter(x => x.amount > 0);
      lines.forEach(l => { const p = d.products.find(x => x.id === l.productId); p.stock -= l.quantity;
        d.movements.unshift({ id: uid(), productId: p.id, name: p.name, type: 'SALE', delta: -l.quantity, reason: 'Sale', by: me().name, at: new Date().toISOString() }); });
      const sale = { id: uid(), receiptNumber: 'R-' + (++d.seq), items: lines, subtotal: total - tax, discountTotal: discount, taxTotal: tax, grandTotal: total, tendered: paid, change,
        customerId, customerName: (d.customers || []).find(c => c.id === customerId)?.name || '', payments: rec, method: rec.length > 1 ? 'SPLIT' : rec[0].method, cashier: me().name, status: 'COMPLETED', createdAt: new Date().toISOString() };
      d.sales.unshift(sale); d.idem[idempotencyKey] = sale.id; save(d); return wait(sale);
    },
    async users() { return wait(load().users.map(({ password, ...u }) => ({ status: 'active', ...u }))); },
    async saveUser(u) { const d = load(); if (me().role !== 'manager') return fail('Only a manager can add staff.');
      if (!u.name || !/^\S+@\S+\.\S+$/.test(u.email || '')) return fail('Enter a name and a valid email.');
      if ((u.password || '').length < 8) return fail('Password must be at least 8 characters.'); if (!['cashier', 'manager'].includes(u.role)) return fail('Choose a role.');
      if (d.users.some(x => x.email === u.email.toLowerCase())) return fail('That email is already used.');
      d.users.push({ id: uid(), name: u.name, email: u.email.toLowerCase(), password: u.password, role: u.role, status: 'active' }); save(d); return wait({}); },
    async setUserStatus(id, status) { const d = load(); if (me().role !== 'manager') return fail('Only a manager can change staff.');
      if (id === me().id) return fail('You cannot switch off your own account.'); d.users.find(x => x.id === id).status = status; save(d); return wait({}); },
    async customers() { const d = load(); return wait((d.customers || []).map(({ password, ...c }) => { const mine = d.sales.filter(s => s.customerId === c.id);
      return { ...c, hasAccount: !!password, purchases: mine.length, spent: mine.reduce((t, s) => t + s.grandTotal - (s.refundTotal || 0), 0) }; })); },
    async saveCustomer(c) { const d = load(); d.customers ||= []; if (!c.name || !c.phone) return fail('Name and phone are required.');
      d.customers.push({ id: uid(), name: c.name, phone: c.phone.replace(/\s/g, ''), email: (c.email || '').toLowerCase(), createdAt: new Date().toISOString() }); save(d); return wait({}); },
    async findCustomer(q) { q = q.trim().toLowerCase().replace(/\s/g, ''); const c = (load().customers || []).find(x => x.phone === q || (x.email && x.email === q));
      return c ? wait({ id: c.id, name: c.name }) : fail('No client found with that phone or email.'); },
    async clientSignup(c) { const d = load(); d.customers ||= []; const email = (c.email || '').toLowerCase(), phone = (c.phone || '').replace(/\s/g, '');
      if (!c.name || !phone) return fail('Enter your name and phone number.'); if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email.');
      if ((c.password || '').length < 8) return fail('Password must be at least 8 characters.');
      const ex = d.customers.find(x => x.email === email || x.phone === phone); if (ex && ex.password) return fail('An account with that email or phone already exists. Please sign in.');
      const n = ex ? Object.assign(ex, { name: c.name, email, password: c.password }) : { id: uid(), name: c.name, phone, email, password: c.password, createdAt: new Date().toISOString() }; // walk-in clients can claim their record
      if (!ex) d.customers.push(n); save(d); const { password, ...safe } = n; sessionStorage.setItem('pos_client', JSON.stringify(safe)); return wait(safe); },
    async clientLogin(email, pw) { const c = (load().customers || []).find(x => x.email === email.trim().toLowerCase() && x.password === pw);
      if (!c) return fail('Email or password is incorrect.'); const { password, ...safe } = c; sessionStorage.setItem('pos_client', JSON.stringify(safe)); return wait(safe); },
    async clientLogout() { sessionStorage.removeItem('pos_client'); return wait({}); },
    async clientMe() { const m = sessionStorage.getItem('pos_client'); return m ? wait(JSON.parse(m)) : fail('Not signed in'); },
    async clientProducts() { return wait(load().products.map(p => ({ id: p.id, name: p.name, price: p.price, image: p.image || '', inStock: !p.trackStock || p.stock > 0 }))); }, // public: no cost or stock counts
    async clientPurchases() { const m = JSON.parse(sessionStorage.getItem('pos_client') || 'null'); if (!m) return fail('Not signed in'); return wait(load().sales.filter(s => s.customerId === m.id)); },
    async suppliers() { const d = load(); return wait(d.suppliers || []); },
    async saveSupplier(s) { const d = load(); d.suppliers ||= []; if (!s.name) return fail('Supplier name is required.');
      d.suppliers.push({ id: uid(), name: s.name, phone: s.phone || '', email: s.email || '' }); save(d); return wait(s); },
    async purchaseOrders() { return wait(load().pos || []); },
    async createPurchaseOrder({ supplierId, items }) {
      const d = load(); d.pos ||= []; d.poSeq ||= 500; const sup = (d.suppliers || []).find(x => x.id === supplierId);
      if (me().role !== 'manager') return fail('Only a manager can create purchase orders.'); if (!sup) return fail('Choose a supplier.');
      if (!items.length || items.some(i => !(i.quantity >= 1) || i.unitCost < 0)) return fail('Every line needs a quantity of at least 1 and a valid cost.');
      const lines = items.map(i => ({ productId: i.productId, name: d.products.find(p => p.id === i.productId).name, quantity: i.quantity, unitCost: i.unitCost, received: 0 }));
      const po = { id: uid(), number: 'PO-' + (++d.poSeq), supplierId, supplierName: sup.name, items: lines, total: lines.reduce((t, l) => t + l.quantity * l.unitCost, 0), status: 'ORDERED', createdAt: new Date().toISOString(), by: me().name };
      d.pos.unshift(po); save(d); return wait(po);
    },
    async receivePurchaseOrder(id, { items }) { // stock, cost, movements and PO status change together (one DB transaction later)
      const d = load(), po = (d.pos || []).find(x => x.id === id); if (!po) return fail('Purchase order not found.');
      const todo = items.filter(i => i.quantity > 0); if (!todo.length) return fail('Enter a quantity received.');
      for (const i of todo) { const l = po.items.find(x => x.productId === i.productId); if (i.quantity > l.quantity - l.received) return fail('Only ' + (l.quantity - l.received) + ' of ' + l.name + ' are still expected.'); }
      todo.forEach(i => { const l = po.items.find(x => x.productId === i.productId), p = d.products.find(x => x.id === i.productId);
        l.received += i.quantity; p.stock += i.quantity; p.cost = l.unitCost;
        d.movements.unshift({ id: uid(), productId: p.id, name: p.name, type: 'RECEIVE', delta: i.quantity, reason: 'Received ' + po.number, by: me().name, at: new Date().toISOString() }); });
      po.status = po.items.every(l => l.received >= l.quantity) ? 'RECEIVED' : 'PARTIAL'; save(d); return wait(po);
    },
    async refund(saleId, { items, reason }) { // manager approval + restock + movement + sale update in one step (one DB transaction later)
      const d = load(), s = d.sales.find(x => x.id === saleId);
      if (me().role !== 'manager') return fail('Only a manager can approve refunds.');
      if (!s) return fail('Sale not found.'); if (!reason) return fail('Give a reason for the refund.');
      let amount = 0; const done = [];
      for (const it of items.filter(i => i.quantity > 0)) {
        const l = s.items.find(x => x.productId === it.productId), left = l.quantity - (l.refundedQty || 0);
        if (it.quantity > left) return fail('Only ' + left + ' of ' + l.name + ' can still be refunded.');
        amount += Math.round(l.lineTotal * it.quantity / l.quantity); done.push([l, it.quantity]);
      }
      if (!done.length) return fail('Choose at least one item to refund.');
      done.forEach(([l, q]) => { l.refundedQty = (l.refundedQty || 0) + q; const p = d.products.find(x => x.id === l.productId); if (p) p.stock += q;
        d.movements.unshift({ id: uid(), productId: l.productId, name: l.name, type: 'REFUND', delta: q, reason: 'Refund ' + s.receiptNumber, by: me().name, at: new Date().toISOString() }); });
      s.refunds = [...(s.refunds || []), { id: uid(), amount, reason, by: me().name, at: new Date().toISOString() }]; s.refundTotal = (s.refundTotal || 0) + amount;
      s.status = s.items.every(l => (l.refundedQty || 0) >= l.quantity) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      save(d); return wait(s);
    },
    async sales() { return wait(load().sales); },
    async currentShift() { return wait(load().shift); },
    async openShift(openingCash) { const d = load(); if (d.shift) return fail('A shift is already open.');
      d.shift = { id: uid(), openingCash, cashier: me().name, openedAt: new Date().toISOString() }; save(d); return wait(d.shift); },
    async closeShift(closingCash) { const d = load(); if (!d.shift) return fail('No open shift.');
      const cash = d.sales.filter(s => s.createdAt >= d.shift.openedAt).reduce((a, s) => a + (s.payments || [{ method: s.method, amount: s.grandTotal }]).filter(x => x.method === 'CASH').reduce((t, x) => t + x.amount, 0), 0);
      const res = { expected: d.shift.openingCash + cash, counted: closingCash, difference: closingCash - (d.shift.openingCash + cash) };
      d.shift = null; save(d); return wait(res); },
  };
})();

const API = CONFIG.USE_MOCK ? MockAPI : RealAPI;
