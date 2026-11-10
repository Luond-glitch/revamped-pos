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
  saveUser: u => u.id ? RealAPI.req('PATCH', '/users/' + u.id, u) : RealAPI.req('POST', '/users', u),
  roles: () => RealAPI.req('GET', '/roles'),
  savePermissions: (role, permissions) => RealAPI.req('PUT', '/roles/' + role + '/permissions', { permissions }),
  audit: (f = {}) => RealAPI.req('GET', '/audit-logs?' + new URLSearchParams(f)),
  shifts: () => RealAPI.req('GET', '/shifts'),
  system: () => RealAPI.req('GET', '/system'),
  setMaintenance: on => RealAPI.req('PATCH', '/system', { maintenance: on }),
  revokeSessions: id => RealAPI.req('POST', '/system/sessions/revoke', { userId: id }),
  backup: () => RealAPI.req('GET', '/system/backup'),
  payroll: (from, to) => RealAPI.req('GET', '/payroll?' + new URLSearchParams({ from, to })),
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

/* ---------- Roles and permissions (shared by the mock and, later, the real server) ---------- */
const ROLES = [
  ['super_admin', 'Super administrator', 'The developers who build and maintain this system. Full control, including administrator accounts. Hidden from the shop\'s own staff list.'],
  ['administrator', 'Administrator', 'Full control of the system, including who can do what.'],
  ['manager', 'Manager', 'Runs the shop: sales, stock, purchases, reports and staff.'],
  ['cashier', 'Cashier', 'Serves customers at the checkout and handles the till.'],
  ['stock_controller', 'Stock controller', 'Looks after products, stock levels and supplier orders.'],
];
const PERMISSIONS = [ // [id, label, group]
  ['dashboard.view', 'See the dashboard', 'Sales'], ['pos.use', 'Use the checkout and take payments', 'Sales'], ['sales.view', 'See sales history', 'Sales'],
  ['refunds.approve', 'Approve refunds', 'Sales'], ['discount.large', 'Give discounts above 5%', 'Sales'], ['customers.manage', 'Manage clients', 'Sales'],
  ['products.manage', 'Add and edit products', 'Stock'], ['inventory.manage', 'Adjust stock levels', 'Stock'], ['purchases.manage', 'Create and receive purchase orders', 'Stock'],
  ['reports.view', 'See reports and profit', 'Reports'],
  ['users.view', 'See staff accounts', 'People'], ['users.manage', 'Create, edit and switch off accounts', 'People'], ['shifts.view', 'See cashier shifts', 'People'],
  ['audit.view', 'See the activity log', 'People'], ['payroll.export', 'Download payroll data', 'People'], ['permissions.manage', 'Change what each role can do', 'People'],
];
const DEFAULT_ROLES = {
  super_admin: PERMISSIONS.map(p => p[0]),
  administrator: PERMISSIONS.map(p => p[0]),
  manager: PERMISSIONS.map(p => p[0]).filter(p => p !== 'permissions.manage'),
  cashier: ['dashboard.view', 'pos.use'],
  stock_controller: ['dashboard.view', 'products.manage', 'inventory.manage', 'purchases.manage'],
};
const isSuper = r => r === 'super_admin', isTop = r => r === 'super_admin' || r === 'administrator'; // who may manage administrator accounts
const roleName = r => (ROLES.find(x => x[0] === r) || [r, r])[1];

const MockAPI = (() => {
  const KEY = 'pos_db', uid = () => crypto.randomUUID();
  // DEMO ONLY: demo client for presentations. 
  const DEMO_CLIENT = { id: 'c-demo', name: 'Amina (Demo Client)', phone: '0712345678', email: 'client@shop.co.ke', password: 'client123' };
  const seed = () => ({
    users: [
      { id: 'u-dev', name: 'Dev Team (Super administrator)', email: 'dev@universalpos.co.ke', password: 'dev12345', role: 'super_admin', status: 'active', jobTitle: 'System developers' },
      { id: 'u0', name: 'Kamau (Administrator)', email: 'admin@shop.co.ke', password: 'admin123', role: 'administrator', status: 'active', employeeId: 'EMP-001', jobTitle: 'Owner', phone: '0700000001', monthlyPay: 0 },
      { id: 'u1', name: 'Wanjiku (Manager)', email: 'manager@shop.co.ke', password: 'manager123', role: 'manager', status: 'active', employeeId: 'EMP-002', jobTitle: 'Shop manager', phone: '0700000002', monthlyPay: 6500000 },
      { id: 'u2', name: 'Otieno (Cashier)', email: 'cashier@shop.co.ke', password: 'cashier123', role: 'cashier', status: 'active', employeeId: 'EMP-003', jobTitle: 'Cashier', phone: '0700000003', monthlyPay: 3000000 },
      { id: 'u3', name: 'Achieng (Stock controller)', email: 'stock@shop.co.ke', password: 'stock123', role: 'stock_controller', status: 'active', employeeId: 'EMP-004', jobTitle: 'Stock controller', phone: '0700000004', monthlyPay: 3800000 }],
    roles: structuredClone(DEFAULT_ROLES), audit: [], shifts: [],
    products: [
      ['Maize flour 2kg','MF2','6001',21000,19000,0,40],['Sugar 1kg','SG1','6002',18500,16500,0,35],['Cooking oil 1L','OIL1','6003',32000,28500,16,24],
      ['Fresh milk 500ml','ML5','6004',6500,5500,0,60],['Bread 400g','BR4','6005',6500,5300,0,30],['Eggs tray (30)','EG30','6006',51000,46000,0,12],
      ['Rice 1kg','RC1','6007',20000,17500,0,28],['Tea leaves 250g','TL25','6008',12000,10000,16,22],['Bar soap','SP1','6009',9500,7500,16,45],
      ['Tissue 4-pack','TS4','6010',17000,14000,16,18],['Soda 500ml','SD5','6011',5500,4000,16,70],['Drinking water 1L','WT1','6012',10000,7000,0,50]
    ].map(([name, sku, barcode, price, cost, taxRate, stock]) => ({ id: uid(), name, sku, barcode, category: 'General', price, cost, taxRate, stock, reorder: 10, trackStock: true })),
    movements: [], sales: [], shift: null, idem: {}, seq: 1000
  });
  const save = d => (localStorage.setItem(KEY, JSON.stringify(d)), d);
  // Loads the database, and makes sure the demo client exists (also for browsers that already have saved data)
  const load = () => {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null') || save(seed());
    d.customers ||= [];
    // Older saved data: add the new people, roles, audit log and shift history without losing anything
    let changed = false;
    if (!d.roles) { d.roles = structuredClone(DEFAULT_ROLES); changed = true; }
    if (!d.roles.super_admin) { d.roles.super_admin = PERMISSIONS.map(p => p[0]); changed = true; }
    if (!d.audit) { d.audit = []; changed = true; }
    if (!d.shifts) { d.shifts = []; changed = true; }
    seed().users.forEach(su => { if (!d.users.some(u => u.email === su.email)) { d.users.push(su); changed = true; } });
    d.users.forEach(u => { if (!u.status) { u.status = 'active'; changed = true; } });
    if (changed) save(d);
    if (!d.customers.some(c => c.email === DEMO_CLIENT.email)) {
      d.customers.push({ ...DEMO_CLIENT, createdAt: new Date().toISOString() });
      save(d);
    }
    return d;
  };
  const fmtKes = c => 'KES ' + (c / 100).toFixed(2);
  const wait = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 80));
  const fail = m => new Promise((_, j) => setTimeout(() => j(new Error(m)), 80));
  const me = () => JSON.parse(sessionStorage.getItem('pos_user') || 'null');
  // The signed-in person, read fresh from the database so a switched-off account or a changed role takes effect straight away
  const actor = d => { const s = me(); const u = s && d.users.find(u => u.id === s.id && u.status !== 'inactive'); return u && !(u.sessionsRevokedAt && (s.iat || 0) < Date.parse(u.sessionsRevokedAt)) ? u : null; };
  const can = (d, p) => { const a = actor(d); return !!a && (d.roles[a.role] || []).includes(p); };
  const safeUser = (d, u) => { const { password, ...rest } = u; return { ...rest, permissions: d.roles[u.role] || [] }; };
  const log = (d, action, detail, who = me()) => { d.audit.unshift({ id: uid(), at: new Date().toISOString(), userId: who?.id || null, user: who?.name || 'Unknown', action, detail });
    if (d.audit.length > 2000) d.audit.length = 2000; };
  const deny = what => fail('You do not have permission to ' + what + '.');
  const supers = d => d.users.filter(u => u.role === 'super_admin' && u.status !== 'inactive');
  const admins = d => d.users.filter(u => u.role === 'administrator' && u.status !== 'inactive');
  return {
    async login(email, password) {
      const d = load(), u = d.users.find(u => u.email === email.trim().toLowerCase() && u.password === password);
      if (!u || u.status === 'inactive') { if (u) log(d, 'LOGIN_BLOCKED', 'Switched-off account tried to sign in', u), save(d); return fail(u ? 'This account is switched off. Ask your manager.' : 'Email or password is incorrect.'); }
      if (d.system?.maintenance && !isSuper(u.role)) { log(d, 'LOGIN_BLOCKED', 'Tried to sign in during maintenance', u); save(d); return fail('The system is being maintained. Please try again shortly.'); }
      u.lastLogin = new Date().toISOString(); const safe = safeUser(d, u); sessionStorage.setItem('pos_user', JSON.stringify({ id: u.id, name: u.name, role: u.role, iat: Date.now() }));
      log(d, 'LOGIN', 'Signed in', u); save(d); return wait(safe);
    },
    async logout() { const d = load(), a = actor(d); if (a) { log(d, 'LOGOUT', 'Signed out', a); save(d); } sessionStorage.removeItem('pos_user'); return wait({}); },
    async me() { const d = load(), a = actor(d); if (!a) { sessionStorage.removeItem('pos_user'); return fail('Not signed in'); } return wait(safeUser(d, a)); },
    async products(q = '') { q = q.toLowerCase(); return wait(load().products.filter(p => !q || [p.name, p.sku, p.barcode].some(x => x.toLowerCase().includes(q)))); },
    async saveProduct(p) {
      const d = load(); if (!can(d, 'products.manage')) return deny('change products'); if (!p.name || p.price < 0) return fail('Name and a valid price are required.');
      if (d.products.some(x => x.sku === p.sku && x.id !== p.id)) return fail('SKU already exists.');
      if (p.id) Object.assign(d.products.find(x => x.id === p.id), p); else d.products.push({ ...p, id: uid(), stock: 0, trackStock: true });
      log(d, p.id ? 'PRODUCT_EDIT' : 'PRODUCT_ADD', p.name); save(d); return wait(p);
    },
    async adjustStock({ productId, delta, type, reason }) { 
      const d = load(), p = d.products.find(x => x.id === productId); if (!can(d, 'inventory.manage')) return deny('adjust stock');
      if (!p || !delta) return fail('Choose a product and a quantity.'); if (p.stock + delta < 0) return fail('Stock cannot go below zero.');
      p.stock += delta; d.movements.unshift({ id: uid(), productId, name: p.name, type, delta, reason, by: me().name, at: new Date().toISOString() });
      log(d, 'STOCK_ADJUST', p.name + ' ' + (delta > 0 ? '+' : '') + delta + (reason ? ' (' + reason + ')' : '')); save(d); return wait(p);
    },
    async movements() { return wait(load().movements.slice(0, 100)); },
    async createSale({ items, payments, discount = 0, customerId = null, idempotencyKey }) {
      const d = load(); if (!can(d, 'pos.use')) return deny('make sales'); if (d.idem[idempotencyKey]) return wait(d.sales.find(s => s.id === d.idem[idempotencyKey]));
      if (!d.shift) return fail('Open a shift before selling.'); if (!items.length) return fail('Cart is empty.');
      const rows = []; let sub = 0;
      for (const it of items) { 
        const p = d.products.find(x => x.id === it.productId); if (!p) return fail('Product not found.');
        if (p.trackStock && p.stock < it.quantity) return fail('Not enough stock: ' + p.name + ' (' + p.stock + ' left).');
        rows.push({ p, q: it.quantity, lt: p.price * it.quantity }); sub += p.price * it.quantity;
      }
      if (discount < 0 || discount > sub) return fail('Discount is more than the sale total.');
      if (!can(d, 'discount.large') && discount > sub * 0.05) return fail('Discounts above 5% need a manager.');
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
        branchId: CONFIG.BRANCH_ID, customerId, customerName: (d.customers || []).find(c => c.id === customerId)?.name || '', payments: rec, method: rec.length > 1 ? 'SPLIT' : rec[0].method, cashier: me().name, cashierId: me().id, status: 'COMPLETED', createdAt: new Date().toISOString() };
      if (discount) log(d, 'DISCOUNT', sale.receiptNumber + ' · ' + fmtKes(discount)); d.sales.unshift(sale); d.idem[idempotencyKey] = sale.id; save(d); return wait(sale);
    },
    /* ---------- Staff accounts, roles, audit log ---------- */
    async users() { const d = load(); if (!can(d, 'users.view')) return deny('see staff accounts');
      return wait(d.users.filter(u => !isSuper(u.role) || isSuper(actor(d).role)).map(u => ({ ...safeUser(d, u), roleName: roleName(u.role) }))); },
    async saveUser(u) {
      const d = load(), a = actor(d); if (!can(d, 'users.manage')) return deny('manage staff accounts');
      const editing = u.id ? d.users.find(x => x.id === u.id) : null; if (u.id && !editing) return fail('Account not found.');
      const email = (u.email || '').trim().toLowerCase(), name = (u.name || '').trim();
      if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a name and a valid email.');
      if (!ROLES.some(r => r[0] === u.role)) return fail('Choose a role.');
      if ((isSuper(u.role) || isSuper(editing?.role)) && !isSuper(a.role)) return fail('Only a super administrator can create or change super administrator accounts.');
      if ((u.role === 'administrator' || editing?.role === 'administrator') && !isTop(a.role)) return fail('Only an administrator can create or change administrator accounts.');
      if (d.users.some(x => x.email === email && x.id !== u.id)) return fail('That email is already used.');
      if ((!editing || u.password) && (u.password || '').length < 8) return fail('Password must be at least 8 characters.');
      const extra = { phone: (u.phone || '').replace(/\s/g, ''), employeeId: (u.employeeId || '').trim(), jobTitle: (u.jobTitle || '').trim(), hiredOn: u.hiredOn || '', monthlyPay: Math.max(0, Math.round(+u.monthlyPay || 0)) };
      if (extra.employeeId && d.users.some(x => x.employeeId === extra.employeeId && x.id !== u.id)) return fail('That employee number is already used.');
      if (editing) {
        if (editing.id === a.id && u.role !== editing.role) return fail('You cannot change your own role.');
        if (isSuper(editing.role) && !isSuper(u.role) && editing.status !== 'inactive' && supers(d).length < 2) return fail('Keep at least one active super administrator.');
        if (editing.role === 'administrator' && u.role !== 'administrator' && editing.status !== 'inactive' && admins(d).length < 2) return fail('Keep at least one active administrator.');
        const notes = []; if (editing.role !== u.role) notes.push('role ' + roleName(editing.role) + ' → ' + roleName(u.role));
        if (editing.name !== name) notes.push('name'); if (editing.email !== email) notes.push('email'); if (u.password) notes.push('password reset');
        if (editing.monthlyPay !== extra.monthlyPay) notes.push('pay'); if (editing.jobTitle !== extra.jobTitle || editing.employeeId !== extra.employeeId || editing.phone !== extra.phone) notes.push('details');
        Object.assign(editing, { name, email, role: u.role, ...extra }); if (u.password) editing.password = u.password;
        if (editing.id === a.id) sessionStorage.setItem('pos_user', JSON.stringify({ ...me(), name, role: u.role }));
        log(d, 'STAFF_EDIT', name + (notes.length ? ' · ' + notes.join(', ') : ' · no changes'));
      } else {
        d.users.push({ id: uid(), name, email, password: u.password, role: u.role, status: 'active', ...extra, createdAt: new Date().toISOString() });
        log(d, 'STAFF_ADD', name + ' · ' + roleName(u.role));
      }
      save(d); return wait({});
    },
    async setUserStatus(id, status) {
      const d = load(), a = actor(d); if (!can(d, 'users.manage')) return deny('change staff accounts');
      const t = d.users.find(x => x.id === id); if (!t) return fail('Account not found.'); if (!['active', 'inactive'].includes(status)) return fail('Unknown status.');
      if (id === a.id) return fail('You cannot switch off your own account.');
      if (isSuper(t.role) && !isSuper(a.role)) return fail('Only a super administrator can change super administrator accounts.');
      if (t.role === 'administrator' && !isTop(a.role)) return fail('Only an administrator can change administrator accounts.');
      if (status === 'inactive' && isSuper(t.role) && t.status !== 'inactive' && supers(d).length < 2) return fail('Keep at least one active super administrator.');
      if (status === 'inactive' && t.role === 'administrator' && t.status !== 'inactive' && admins(d).length < 2) return fail('Keep at least one active administrator.');
      if (status === 'inactive' && d.shift?.userId === id) return fail(t.name + ' has a shift open. Close the shift first.');
      t.status = status; log(d, status === 'inactive' ? 'STAFF_OFF' : 'STAFF_ON', t.name); save(d); return wait({});
    },
    async roles() { const d = load(); if (!can(d, 'users.view')) return deny('see roles');
      return wait({ roles: ROLES.filter(r => !isSuper(r[0]) || isSuper(actor(d).role)).map(([id, name, desc]) => ({ id, name, desc, permissions: d.roles[id] || [], members: d.users.filter(u => u.role === id && u.status !== 'inactive').length })),
        permissions: PERMISSIONS.map(([id, label, group]) => ({ id, label, group })) }); },
    async savePermissions(role, perms) {
      const d = load(), a = actor(d); if (!can(d, 'permissions.manage')) return deny('change permissions');
      if (!ROLES.some(r => r[0] === role)) return fail('Unknown role.'); if (isSuper(role) && !isSuper(a.role)) return fail('Unknown role.'); if (isTop(role)) return fail('Administrators and super administrators always keep every permission.');
      const known = PERMISSIONS.map(p => p[0]), next = known.filter(p => perms.includes(p)), prev = d.roles[role] || [];
      if (role === a.role && !next.includes('permissions.manage')) return fail('You cannot remove your own access to permissions.');
      const add = next.filter(p => !prev.includes(p)), del = prev.filter(p => !next.includes(p)); if (!add.length && !del.length) return wait({});
      d.roles[role] = next; log(d, 'PERMISSIONS', roleName(role) + (add.length ? ' · added ' + add.join(', ') : '') + (del.length ? ' · removed ' + del.join(', ') : '')); save(d); return wait({});
    },
    async audit({ q = '', userId = '', from = '', to = '', limit = 500 } = {}) {
      const d = load(); if (!can(d, 'audit.view')) return deny('see the activity log'); q = q.trim().toLowerCase();
      const f = from ? new Date(from + 'T00:00:00') : null, t = to ? new Date(to + 'T23:59:59.999') : null;
      return wait(d.audit.filter(e => (!userId || e.userId === userId) && (!f || new Date(e.at) >= f) && (!t || new Date(e.at) <= t)
        && (!q || [e.user, e.action, e.detail].some(x => (x || '').toLowerCase().includes(q)))).slice(0, limit)); },
    async payroll(from, to) { // hours, shifts and sales per person for a pay period (amounts in cents). Pay itself is never calculated here: payroll software does that.
      const d = load(); if (!can(d, 'payroll.export')) return deny('download payroll data');
      const f = new Date(from + 'T00:00:00'), t = new Date(to + 'T23:59:59.999');
      return wait(d.users.filter(u => !isSuper(u.role)).map(u => { const sh = d.shifts.filter(x => x.userId === u.id && x.closedAt && new Date(x.openedAt) >= f && new Date(x.openedAt) <= t);
        const sales = d.sales.filter(s => (s.cashierId ? s.cashierId === u.id : s.cashier === u.name) && new Date(s.createdAt) >= f && new Date(s.createdAt) <= t);
        return { employeeId: u.employeeId || '', name: u.name, email: u.email, phone: u.phone || '', jobTitle: u.jobTitle || '', role: roleName(u.role), status: u.status, monthlyPay: u.monthlyPay || 0,
          shifts: sh.length, hours: +(sh.reduce((h, x) => h + (new Date(x.closedAt) - new Date(x.openedAt)) / 36e5, 0)).toFixed(2), salesCount: sales.length, salesTotal: sales.reduce((a, s) => a + net(s), 0),
          cashShortOver: sh.reduce((a, x) => a + (x.difference || 0), 0) }; })); },
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
      if (!can(d, 'purchases.manage')) return deny('create purchase orders'); if (!sup) return fail('Choose a supplier.');
      if (!items.length || items.some(i => !(i.quantity >= 1) || i.unitCost < 0)) return fail('Every line needs a quantity of at least 1 and a valid cost.');
      const lines = items.map(i => ({ productId: i.productId, name: d.products.find(p => p.id === i.productId).name, quantity: i.quantity, unitCost: i.unitCost, received: 0 }));
      const po = { id: uid(), number: 'PO-' + (++d.poSeq), supplierId, supplierName: sup.name, items: lines, total: lines.reduce((t, l) => t + l.quantity * l.unitCost, 0), status: 'ORDERED', createdAt: new Date().toISOString(), by: me().name };
      d.pos.unshift(po); log(d, 'PO_CREATE', po.number + ' · ' + sup.name); save(d); return wait(po);
    },
    async receivePurchaseOrder(id, { items }) { // stock, cost, movements and PO status change together (one DB transaction later)
      const d = load(), po = (d.pos || []).find(x => x.id === id); if (!can(d, 'purchases.manage')) return deny('receive stock'); if (!po) return fail('Purchase order not found.');
      const todo = items.filter(i => i.quantity > 0); if (!todo.length) return fail('Enter a quantity received.');
      for (const i of todo) { const l = po.items.find(x => x.productId === i.productId); if (i.quantity > l.quantity - l.received) return fail('Only ' + (l.quantity - l.received) + ' of ' + l.name + ' are still expected.'); }
      todo.forEach(i => { const l = po.items.find(x => x.productId === i.productId), p = d.products.find(x => x.id === i.productId);
        l.received += i.quantity; p.stock += i.quantity; p.cost = l.unitCost;
        d.movements.unshift({ id: uid(), productId: p.id, name: p.name, type: 'RECEIVE', delta: i.quantity, reason: 'Received ' + po.number, by: me().name, at: new Date().toISOString() }); });
      po.status = po.items.every(l => l.received >= l.quantity) ? 'RECEIVED' : 'PARTIAL'; save(d); return wait(po);
    },
    async refund(saleId, { items, reason }) { // manager approval + restock + movement + sale update in one step (one DB transaction later)
      const d = load(), s = d.sales.find(x => x.id === saleId);
      if (!can(d, 'refunds.approve')) return fail('Only a manager can approve refunds.');
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
      log(d, 'REFUND', s.receiptNumber + ' · ' + fmtKes(amount) + ' · ' + reason); save(d); return wait(s);
    },
    async sales() { return wait(load().sales); },
    async currentShift() { return wait(load().shift); },
    async openShift(openingCash) { const d = load(); if (!can(d, 'pos.use')) return deny('open a shift'); if (d.shift) return fail('A shift is already open.');
      if (!(openingCash >= 0)) return fail('Enter the opening cash.');
      d.shift = { id: uid(), openingCash, cashier: me().name, userId: me().id, branchId: CONFIG.BRANCH_ID, openedAt: new Date().toISOString() };
      log(d, 'SHIFT_OPEN', 'Opening cash ' + fmtKes(openingCash)); save(d); return wait(d.shift); },
    async closeShift(closingCash) { const d = load(); if (!d.shift) return fail('No open shift.'); if (!can(d, 'pos.use')) return deny('close a shift');
      if (!(closingCash >= 0)) return fail('Enter the cash counted.');
      if (d.shift.userId && d.shift.userId !== me().id && !can(d, 'shifts.view')) return fail('Only ' + d.shift.cashier + ' or a manager can close this shift.');
      const mine = d.sales.filter(s => s.createdAt >= d.shift.openedAt);
      const cash = mine.reduce((a, s) => a + (s.payments || [{ method: s.method, amount: s.grandTotal }]).filter(x => x.method === 'CASH').reduce((t, x) => t + x.amount, 0), 0);
      const res = { expected: d.shift.openingCash + cash, counted: closingCash, difference: closingCash - (d.shift.openingCash + cash) };
      d.shifts.unshift({ ...d.shift, ...res, closedAt: new Date().toISOString(), closedBy: me().name, salesCount: mine.length, salesTotal: mine.reduce((a, s) => a + net(s), 0) });
      log(d, 'SHIFT_CLOSE', d.shift.cashier + ' · counted ' + fmtKes(closingCash) + ' · ' + (res.difference === 0 ? 'balanced' : (res.difference > 0 ? 'over ' : 'short ') + fmtKes(Math.abs(res.difference))));
      d.shift = null; save(d); return wait(res); },
    /* ---------- Super administrator tools (developers only) ---------- */
    async system() { const d = load(), a = actor(d); if (!isSuper(a?.role)) return deny('open system tools');
      return wait({ maintenance: !!d.system?.maintenance, accounts: d.users.length, active: d.users.filter(u => u.status !== 'inactive').length, supers: supers(d).length, admins: admins(d).length,
        sales: d.sales.length, products: d.products.length, clients: (d.customers || []).length, events: d.audit.length, shifts: d.shifts.length, storageKb: Math.round(JSON.stringify(d).length / 1024),
        lastBackup: d.system?.lastBackup || null, version: 'Mock data (browser)' }); },
    async setMaintenance(on) { const d = load(), a = actor(d); if (!isSuper(a?.role)) return deny('change maintenance mode');
      (d.system ||= {}).maintenance = !!on; log(d, 'SYSTEM', on ? 'Maintenance mode switched on' : 'Maintenance mode switched off'); save(d); return wait({}); },
    async revokeSessions(id) { const d = load(), a = actor(d); if (!isSuper(a?.role)) return deny('sign people out');
      const now = new Date().toISOString(), list = id === 'all' ? d.users.filter(u => u.id !== a.id) : d.users.filter(u => u.id === id);
      if (!list.length) return fail('Account not found.'); if (id === a.id) return fail('Use Sign out for your own session.');
      list.forEach(u => u.sessionsRevokedAt = now); log(d, 'SESSIONS_REVOKED', id === 'all' ? 'Everyone signed out (' + list.length + ' accounts)' : list[0].name + ' signed out everywhere'); save(d); return wait({}); },
    async backup() { const d = load(), a = actor(d); if (!isSuper(a?.role)) return deny('download a backup');
      (d.system ||= {}).lastBackup = new Date().toISOString(); log(d, 'BACKUP', 'Data backup downloaded'); save(d);
      const copy = structuredClone(d); copy.users.forEach(u => delete u.password); (copy.customers || []).forEach(c => delete c.password); return wait(copy); },
    async shifts() { const d = load(); if (!can(d, 'reports.view') && !can(d, 'shifts.view')) return deny('see shifts'); return wait(d.shifts); },
  };
})();

const API = CONFIG.USE_MOCK ? MockAPI : RealAPI;