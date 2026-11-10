/* Module 3 data layer. Load AFTER api.js. Adds expenses, cash movements, reconciliation and
   supplier payments to API. Mock mode stores everything in the same localStorage 'pos_db'.
   Real mode expects these endpoints (all amounts in cents):
   GET  /finance                       -> { expenses, moves, recon, supplierPayments }
   POST /finance/expenses              PATCH /finance/expenses/:id {status}
   POST /finance/cash-movements        POST /finance/reconciliations {keys}
   POST /finance/supplier-payments                                                    */
   (() => {
    const R = (m, p, b) => RealAPI.req(m, p, b);
    const real = {
      finance: () => R('GET', '/finance'),
      saveExpense: e => R('POST', '/finance/expenses', e),
      setExpenseStatus: (id, status) => R('PATCH', '/finance/expenses/' + id, { status }),
      saveMove: m => R('POST', '/finance/cash-movements', m),
      reconcile: keys => R('POST', '/finance/reconciliations', { keys }),
      paySupplier: p => R('POST', '/finance/supplier-payments', p),
    };
  
    const KEY = 'pos_db', uid = () => crypto.randomUUID(), now = () => new Date().toISOString();
    const db = () => { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); d.expenses ||= []; d.moves ||= []; d.recon ||= {}; d.supPay ||= []; d.pos ||= []; return d; };
    const save = d => localStorage.setItem(KEY, JSON.stringify(d));
    const me = () => JSON.parse(sessionStorage.getItem('pos_user') || 'null');
    const wait = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 60));
    const fail = m => new Promise((_, j) => setTimeout(() => j(new Error(m)), 60));
    const boss = () => me()?.role === 'manager';
    const METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'];
  
    const mock = {
      async finance() { const d = db(); return wait({ expenses: d.expenses, moves: d.moves, recon: d.recon, supplierPayments: d.supPay }); },
  
      async saveExpense(e) {
        const d = db();
        if (!boss()) return fail('Only a manager can record expenses.');
        if (!e.description || !(e.amount > 0)) return fail('Enter a description and an amount above zero.');
        if (e.vat < 0 || e.vat > e.amount) return fail('VAT cannot be more than the amount.');
        if (!METHODS.includes(e.method)) return fail('Choose how it was paid.');
        if (e.method !== 'CASH' && !e.reference) return fail('Enter the payment reference.');
        d.expenses.unshift({ id: uid(), ...e, status: 'PENDING', by: me().name, createdAt: now() }); save(d); return wait({});
      },
      async setExpenseStatus(id, status) {
        const d = db(), x = d.expenses.find(e => e.id === id);
        if (!boss()) return fail('Only a manager can approve expenses.');
        if (!x) return fail('Expense not found.'); if (x.status !== 'PENDING') return fail('This expense was already ' + x.status.toLowerCase() + '.');
        x.status = status; x.decidedBy = me().name; x.decidedAt = now(); save(d); return wait(x);
      },
      async saveMove({ type, amount, note }) {
        const d = db();
        if (!boss()) return fail('Only a manager can record cash movements.');
        if (!['CASH_IN', 'CASH_OUT', 'BANK_DEPOSIT'].includes(type) || !(amount > 0)) return fail('Choose a type and enter an amount above zero.');
        if (!note) return fail('Give a reason so the movement can be audited.');
        d.moves.unshift({ id: uid(), type, amount, note, by: me().name, at: now() }); save(d); return wait({});
      },
      async reconcile(keys) {
        const d = db(); if (!boss()) return fail('Only a manager can reconcile payments.');
        keys.forEach(k => d.recon[k] = { by: me().name, at: now() }); save(d); return wait({});
      },
      async paySupplier({ poId, amount, method, reference }) {
        const d = db(), po = d.pos.find(o => o.id === poId);
        if (!boss()) return fail('Only a manager can pay suppliers.');
        if (!po) return fail('Purchase order not found.'); if (!(amount > 0)) return fail('Enter an amount above zero.');
        if (!METHODS.includes(method)) return fail('Choose a payment method.'); if (method !== 'CASH' && !reference) return fail('Enter the payment reference.');
        const due = po.items.reduce((t, l) => t + l.received * l.unitCost, 0) - d.supPay.filter(p => p.poId === poId).reduce((t, p) => t + p.amount, 0);
        if (amount > due) return fail('That is more than the balance due (' + (due / 100).toFixed(2) + ').');
        d.supPay.unshift({ id: uid(), poId, number: po.number, supplier: po.supplierName, amount, method, reference: reference || '', by: me().name, at: now() }); save(d); return wait({});
      },
    };
    Object.assign(API, CONFIG.USE_MOCK ? mock : real);
  })();