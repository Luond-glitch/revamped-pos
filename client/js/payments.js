/* Module 3: Payments and financial tracking. Supports tracking only; it is not a full accounting system.
   Uses helpers from app.js (esc, fmt, when, toast, modal, can, toCents, net) and analytics.js (statCard, dataTable, comboChart, hbars, donut, series, totals, payMix, costMap, downloadCsv, dkey, money, kes, pct ...). */
   const FNI = { grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', receipt: '<path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-2-2-3 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>', scale: '<line x1="12" y1="3" x2="12" y2="21"/><path d="M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0z"/><path d="M19 7l-3 7a3 3 0 0 0 6 0z"/>',
    percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>' };
  const fni = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${FNI[n]}</svg>`;
  const TABS = [['overview', 'Dashboard', 'grid'], ['sum', 'Sales summary', 'chart'], ['tx', 'Transactions', 'list'], ['recon', 'Reconciliation', 'check'], ['exp', 'Expenses', 'receipt'],
    ['cash', 'Cash movements', 'cash'], ['bal', 'Balances', 'scale'], ['tax', 'VAT and tax', 'percent']];
  const CATS = ['Rent', 'Utilities', 'Transport', 'Salaries & wages', 'Supplies', 'Repairs', 'Marketing', 'Other'];
  const METHODS = { CASH: 'Cash', MPESA: 'M-Pesa', CARD: 'Card', BANK: 'Bank transfer' };
  const S = { sales: [], pos: [], grns: [], products: [], fin: { expenses: [], moves: [], recon: {}, supplierPayments: [], clientPayments: [] } }, stmt = {};
  let U = null, tab = 'overview', ctx = null, view = null, cashOnly = false, sumMode = 'day', txf = 'all';
  PALETTE.splice(0, 6, '#14213d', '#c8941f', '#c62828', '#1f5fd0', '#1f9d55', '#7c3aed'); // navy, gold, red ... like the proposal (this page only)
  
  const ml = m => METHODS[m] || METHOD_LABEL[m] || m, opts = o => Object.entries(o).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const sum = (a, f) => a.reduce((t, x) => t + f(x), 0), pill = (c, t) => `<span class="iv-pill ${c}">${t}</span>`;
  const panel = (t, s, b, c = '') => `<section class="card iv-panel ${c}"><h2>${t}${s ? ` <small>${s}</small>` : ''}</h2>${b}</section>`;
  const pmTbl = (h, rows, tot, msg = 'Nothing to show for these filters.') => rows.length ? `<table>${dataTable(h, rows, tot)}</table>` : `<p class="empty">${msg}</p>`;
  const dl = rows => `<dl class="rp-dl">${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
  const isTopRole = () => U && (U.role === 'administrator' || U.role === 'super_admin'), may = p => can(U, p);
  
  /* ---------- data shaping ---------- */
  // Money actually received: every sale payment except "pay later", plus payments clients made later against what they owed
  const payRows = () => [
    ...S.sales.flatMap(s => (s.payments || [{ method: s.method, amount: s.grandTotal }]).map((p, i) => ({ p, i })).filter(x => x.p.method !== 'CREDIT').map(({ p, i }) => {
      const key = s.id + ':' + i; return { key, date: s.createdAt, receipt: s.receiptNumber, method: p.method, amount: p.amount, ref: p.reference || '', cashier: s.cashier, sale: s.status, rec: S.fin.recon[key] }; })),
    ...S.fin.clientPayments.map(c => ({ key: 'cp:' + c.id, date: c.at, receipt: c.receipt + ' · balance', method: c.method, amount: c.amount, ref: c.reference || '', cashier: c.by, sale: 'COMPLETED', rec: S.fin.recon['cp:' + c.id], later: true })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const ledgerRows = () => {
    const L = [];
    payRows().forEach(p => L.push({ at: p.date, type: p.later ? 'Client payment' : 'Sale', label: p.receipt, method: p.method, ref: p.ref, inn: p.amount, out: 0 }));
    S.sales.forEach(s => (s.refunds || []).forEach(r => { const cash = r.cashOut ?? r.amount; if (cash > 0) L.push({ at: r.at, type: 'Refund', label: s.receiptNumber + ' · ' + r.reason, method: 'CASH', ref: '', inn: 0, out: cash }); })); // refunds are assumed paid from the drawer
    S.fin.expenses.filter(e => e.status === 'APPROVED').forEach(e => L.push({ at: e.date, type: 'Expense', label: e.category + ' · ' + e.description, method: e.method, ref: e.reference || '', inn: 0, out: e.amount }));
    S.fin.supplierPayments.forEach(p => L.push({ at: p.at, type: 'Supplier', label: p.number + ' · ' + p.supplier, method: p.method, ref: p.reference || '', inn: 0, out: p.amount }));
    const T = { CASH_IN: 'Cash in', CASH_OUT: 'Cash out', BANK_DEPOSIT: 'Bank deposit' };
    S.fin.moves.forEach(m => L.push({ at: m.at, type: T[m.type], label: m.note, method: 'CASH', ref: '', inn: m.type === 'CASH_IN' ? m.amount : 0, out: m.type === 'CASH_IN' ? 0 : m.amount }));
    return L.sort((a, b) => b.at.localeCompare(a.at));
  };
  const payables = () => S.pos.map(o => { const recv = sum(o.items, l => l.received * l.unitCost), paid = sum(S.fin.supplierPayments.filter(p => p.poId === o.id), p => p.amount); return { o, recv, paid, due: recv - paid }; }).filter(x => x.recv || x.paid);
  const receivables = () => S.sales.filter(s => (s.balance || 0) > 0).map(s => ({ s, due: s.balance, days: Math.floor((Date.now() - new Date(s.createdAt)) / 864e5) }));
  const share = (map, big, small) => { const a = [...map].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([label, value]) => ({ label, value })), t = a.slice(0, 5), r = sum(a.slice(5), x => x.value);
    if (r) t.push({ label: 'Others', value: r }); return t.length ? donut(t, { big: 'KES ' + kes(sum(a, x => x.value)), small }) : '<p class="empty">Nothing is owed.</p>'; };
  
  /* ---------- boot ---------- */
  boot('payments').then(async user => {
    U = user;
    $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button type="button" role="tab" data-t="${k}">${fni(i)}<span>${l}</span></button>`).join('');
    $('#method').innerHTML = '<option value="">All methods</option>' + opts(METHODS);
    $('#journal').hidden = !may('payments.manage') && !may('payments.view');
    setRange('30'); await reload(false);
    $('#range').onchange = e => { setRange(e.target.value); draw(); };
    $('#from').onchange = $('#to').onchange = $('#method').onchange = draw;
    const h = location.hash.slice(1); if (TABS.some(t => t[0] === h)) tab = h;
    $('#tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; history.replaceState(null, '', '#' + tab); drawView(); } };
    $('#csv').onclick = () => view && downloadCsv('payments-' + view.csv.name, view.csv.rows);
    $('#journal').onclick = exportDialog;
    $('#print').onclick = () => window.print();
    $('#view').onclick = onAction;
    $('#view').oninput = e => { const i = e.target.closest('[data-stmt]'); if (!i) return; const m = i.dataset.stmt; stmt[m] = i.value === '' ? undefined : toCents(i.value); $(`[data-var="${m}"]`).innerHTML = varTxt(m); };
    draw();
  });
  function setRange(p) {
    const now = new Date(); let from = now;
    if (p === '7') from = addDays(now, -6); else if (p === '30') from = addDays(now, -29); else if (p === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1); else if (p === 'year') from = new Date(now.getFullYear(), 0, 1);
    $('#dates').hidden = p !== 'custom'; if (p !== 'custom') { $('#from').value = dkey(from); $('#to').value = dkey(now); }
  }
  async function reload(redraw = true) {
    try { const [sales, fin, pos, products, grns] = await Promise.all([API.sales(), API.finance(), API.purchaseOrders(), API.products(), API.receipts()]); Object.assign(S, { sales, fin, pos, products, grns }); } catch (e) { toast(e.message, true); }
    if (redraw) draw();
  }
  
  function draw() {
    const f = $('#from').value, t = $('#to').value; if (!f || !t) return;
    const from = dayStart(new Date(f + 'T00:00:00')), to = dayEnd(new Date(t + 'T00:00:00')); if (from > to) return toast('The start date is after the end date.', true);
    const m = $('#method').value, within = iso => { const d = new Date(iso); return d >= from && d <= to; };
    const P = payRows().filter(p => within(p.date) && (!m || p.method === m)), L = ledgerRows().filter(x => within(x.at) && (!m || x.method === m));
    const E = S.fin.expenses.filter(e => within(e.date) && (!m || e.method === m)), sales = inRange(S.sales, from, to);
    ctx = { from, to, m, P, L, E, sales, within };
    const owedIn = sum(receivables(), x => x.due), owedOut = sum(payables(), x => x.due), pend = E.filter(e => e.status === 'PENDING').length;
    $('#stats').innerHTML = [
      statCard('green', 'dollar', 'Money received', fmt(sum(P, p => p.amount)), P.length + (P.length === 1 ? ' payment' : ' payments')),
      statCard('amber', 'receipt', 'Approved expenses', fmt(sum(E.filter(e => e.status === 'APPROVED'), e => e.amount)), pend + ' awaiting approval'),
      statCard('red', 'users', 'Owed by clients', fmt(owedIn), receivables().length + ' sales on credit'),
      statCard('blue', 'box', 'Owed to suppliers', fmt(owedOut), 'for goods already received'),
    ].join('');
    $('#pmeta').textContent = f + ' to ' + t + (m ? ' · ' + ml(m) : '') + ' · printed ' + when(new Date().toISOString());
    drawView();
  }
  function drawView() {
    if (!ctx) return;
    $$('#tabs button').forEach(b => { const on = b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#ptitle').textContent = TABS.find(t => t[0] === tab)[1];
    view = VIEWS[tab](); $('#view').innerHTML = view.html;
  }
  
  /* ---------- actions ---------- */
  async function onAction(e) {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id;
    try {
      if (a === 'exp') return addExpense(); if (a === 'move') return addMove(); if (a === 'sup') return paySupplier(id); if (a === 'cli') return payClient(id);
      if (a === 'cashonly') { cashOnly = b.dataset.v === '1'; return drawView(); }
      if (a === 'mode') { sumMode = b.dataset.v; return drawView(); } if (a === 'txf') { txf = b.dataset.v; return drawView(); }
      if (a === 'ok' || a === 'no') { await API.setExpenseStatus(id, a === 'ok' ? 'APPROVED' : 'REJECTED'); toast('Expense ' + (a === 'ok' ? 'approved' : 'rejected')); return reload(); }
      if (a === 'recsel' || a === 'recall') {
        const keys = a === 'recall' ? ctx.P.filter(p => !p.rec).map(p => p.key) : $$('#view [data-k]:checked').map(c => c.dataset.k);
        if (!keys.length) return toast('Nothing to reconcile.', true);
        await API.reconcile(keys); toast(keys.length + ' payments reconciled'); return reload();
      }
    } catch (err) { toast(err.message, true); }
  }
  const field = (d, id) => $('#' + id, d).value.trim();
  function addExpense() {
    const d = modal(`<h2>Record expense</h2><label>Description<input id="ds" autofocus></label><label>Category<select id="ct">${CATS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <div class="row"><label class="grow">Amount (KES)<input id="am" type="number" min="0" step="0.01"></label><label class="grow">VAT included (KES)<input id="vt" type="number" min="0" step="0.01" value="0"></label></div>
      <div class="row"><label class="grow">Paid by<select id="mt">${opts(METHODS)}</select></label><label class="grow">Date<input id="dt" type="date" value="${dkey(new Date())}" max="${dkey(new Date())}"></label></div>
      <label>Reference (needed unless cash)<input id="rf" autocomplete="off"></label><p class="sub">New expenses wait for approval before they count as money out.</p>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save expense</button></div>`);
    $('#ok', d).onclick = async () => { try {
      await API.saveExpense({ description: field(d, 'ds'), category: field(d, 'ct'), amount: toCents($('#am', d).value), vat: toCents($('#vt', d).value), method: field(d, 'mt'), reference: field(d, 'rf'), date: new Date(field(d, 'dt') + 'T12:00:00').toISOString() });
      d.close(); toast('Expense saved'); reload(); } catch (e) { toast(e.message, true); } };
  }
  function addMove() {
    const d = modal(`<h2>Record cash movement</h2><label>Type<select id="ty"><option value="CASH_IN">Cash in (float or top-up)</option><option value="CASH_OUT">Cash out (payout or petty cash)</option><option value="BANK_DEPOSIT">Bank deposit (cash banked)</option></select></label>
      <label>Amount (KES)<input id="am" type="number" min="0" step="0.01" autofocus></label><label>Reason<input id="nt"></label>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save movement</button></div>`);
    $('#ok', d).onclick = async () => { try { await API.saveMove({ type: field(d, 'ty'), amount: toCents($('#am', d).value), note: field(d, 'nt') }); d.close(); toast('Movement saved'); reload(); } catch (e) { toast(e.message, true); } };
  }
  function paySupplier(id) {
    const x = payables().find(p => p.o.id === id); if (!x) return;
    const d = modal(`<h2>Pay ${esc(x.o.supplierName)}</h2><p class="sub">${esc(x.o.number)} · balance due ${fmt(x.due)}</p>
      <label>Amount (KES)<input id="am" type="number" min="0" step="0.01" value="${(x.due / 100).toFixed(2)}" autofocus></label>
      <label>Paid by<select id="mt">${opts(METHODS)}</select></label><label>Reference (needed unless cash)<input id="rf" autocomplete="off"></label>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Record payment</button></div>`);
    $('#ok', d).onclick = async () => { try { await API.paySupplier({ poId: id, amount: toCents($('#am', d).value), method: field(d, 'mt'), reference: field(d, 'rf') }); d.close(); toast('Payment recorded'); reload(); } catch (e) { toast(e.message, true); } };
  }
  function payClient(id) {
    const x = receivables().find(r => r.s.id === id); if (!x) return;
    const d = modal(`<h2>Payment from ${esc(x.s.customerName)}</h2><p class="sub">${esc(x.s.receiptNumber)} · balance owed ${fmt(x.due)}</p>
      <label>Amount (KES)<input id="am" type="number" min="0" step="0.01" value="${(x.due / 100).toFixed(2)}" autofocus></label>
      <label>Paid by<select id="mt">${opts(METHODS)}</select></label><label>Reference (needed unless cash)<input id="rf" autocomplete="off"></label>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Record payment</button></div>`);
    $('#ok', d).onclick = async () => { try { await API.recordClientPayment({ saleId: id, amount: toCents($('#am', d).value), method: field(d, 'mt'), reference: field(d, 'rf') }); d.close(); toast('Payment recorded'); reload(); } catch (e) { toast(e.message, true); } };
  }
  
  /* ---------- accounting export ---------- */
  function exportDialog() {
    if (!ctx) return;
    const d = modal(`<h2>Accounting export</h2><p class="sub">For ${esc($('#from').value)} to ${esc($('#to').value)}. Open the file in your accounting software or a spreadsheet. The payment method filter is ignored.</p>
      <label class="fn-radio"><input type="radio" name="fmt" value="journal" checked><span><b>Journal entries (debit and credit)</b><small>Sales, VAT, refunds, client payments, expenses, authorised goods received, supplier payments and cash movements as balanced entries, ready to import as a journal.</small></span></label>
      <label class="fn-radio"><input type="radio" name="fmt" value="ledger"><span><b>Money in and out (simple list)</b><small>One line per payment, refund, expense or cash movement.</small></span></label>
      <p class="rp-note">Goods received are booked at their cost when they were authorised. VAT on supplier invoices is not split out, so check it against your supplier invoices.</p>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Download CSV</button></div>`);
    $('#ok', d).onclick = () => {
      const f = d.querySelector('[name=fmt]:checked').value;
      if (f === 'ledger') downloadCsv('accounting-ledger', [['Date', 'Type', 'Description', 'Method', 'Reference', 'Money in (KES)', 'Money out (KES)'], ...ledgerRows().filter(x => ctx.within(x.at)).map(x => [x.at.slice(0, 10), x.type, x.label, ml(x.method), x.ref, money(x.inn), money(x.out)])]);
      else downloadCsv('accounting-journal', buildJournal(S, ctx.from, ctx.to));
      d.close(); };
  }
  
  /* ---------- views ---------- */
  const ledgerTable = (list, tot) => pmTbl(['Date', 'Type', 'Description', 'Method', 'Reference', 'Money in', 'Money out'],
    list.map(x => [when(x.at), x.type, esc(x.label), ml(x.method), esc(x.ref) || '—', x.inn ? `<span class="pm-in">${fmt(x.inn)}</span>` : '—', x.out ? `<span class="pm-out">${fmt(x.out)}</span>` : '—']),
    tot ? ['Total', '', '', '', '', fmt(sum(list, x => x.inn)), fmt(sum(list, x => x.out))] : null, 'No money moved in these dates.');
  const ledgerCsv = list => [['Date', 'Type', 'Description', 'Method', 'Reference', 'Money in (KES)', 'Money out (KES)'], ...list.map(x => [x.at.slice(0, 10), x.type, x.label, ml(x.method), x.ref, money(x.inn), money(x.out)])];
  const modeFor = () => { const n = (ctx.to - ctx.from) / 864e5; return n <= 14 ? 'day' : n <= 100 ? 'week' : 'month'; };
  
  function vOverview() {
    const cost = costMap(S.products), T = totals(ctx.sales, cost), by = {}; ctx.P.forEach(p => by[p.method] = (by[p.method] || 0) + p.amount);
    const tot = sum(ctx.P, p => p.amount), tones = ['', 'low', 'ok', 'out'], mix = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([m, v], i) => ({ label: ml(m), value: v, tone: tones[i % 4] }));
    const expNet = sum(ctx.E.filter(e => e.status === 'APPROVED'), e => e.amount - e.vat), profit = T.profit - expNet, mode = modeFor();
    const cl = new Map(); receivables().forEach(x => cl.set(x.s.customerName || 'Client', (cl.get(x.s.customerName || 'Client') || 0) + x.due));
    const su = new Map(); payables().forEach(x => su.set(x.o.supplierName, (su.get(x.o.supplierName) || 0) + x.due));
    return { csv: { name: 'overview', rows: [['Method', 'Received (KES)'], ...mix.map(m => [m.label, money(m.value)]), ['Total', money(tot)], [], ['Gross profit (KES)', money(T.profit)], ['Approved expenses excl. VAT (KES)', money(expNet)], ['Estimated profit (KES)', money(profit)]] },
      html: `<div class="iv-grid rp-dense">${panel('Sales trends', MODES[mode].toLowerCase() + ', net sales and gross profit', comboChart(series(ctx.sales, cost, ctx.from, ctx.to, mode)), 'span2')}
        ${panel('Money by method', 'received', mix.length ? hbars(mix, i => fmt(i.value) + ' · ' + pct(i.value, tot) + '%') : '<p class="empty">No payments in these dates.</p>')}
        ${panel('Outstanding payments', 'owed by clients', share(cl, '', 'owed'))}
        ${panel('Outstanding payments', 'owed to suppliers', share(su, '', 'to pay'))}
        ${panel('Profit summary', 'estimate for these dates', `<div class="fn-profit"><b>KES ${kes(profit)}</b>${pill(profit >= 0 ? 'ok' : 'out', profit >= 0 ? 'Profit' : 'Loss')}</div>` + dl([['Gross profit on sales', fmt(T.profit)], ['− Approved expenses (excl. VAT)', fmt(expNet)], ['Profit margin', T.margin + '%']]) + '<p class="rp-note" style="margin-top:8px">Based on recorded costs. Not a substitute for your accountant\'s figures.</p>')}
        ${panel('Latest movements', 'newest 8', ledgerTable(ctx.L.slice(0, 8)), 'span3')}</div>` };
  }
  function vSum() {
    const cost = costMap(S.products), b = series(ctx.sales, cost, ctx.from, ctx.to, sumMode), T = totals(ctx.sales, cost), rows = b.filter(x => x.n), mix = payMix(ctx.sales);
    const head = ['Period', 'Sales', 'Gross sales', 'Discounts', 'Refunds', 'Net sales', 'VAT', 'Gross profit'], cells = x => [esc(x.long), x.n, fmt(x.gross), fmt(x.disc), fmt(x.refunds), fmt(x.rev), fmt(x.tax), fmt(x.profit)];
    return { csv: { name: 'sales-summary-' + sumMode, rows: [head, ...rows.map(x => [x.long, x.n, money(x.gross), money(x.disc), money(x.refunds), money(x.rev), money(x.tax), money(x.profit)]), ['Total', T.n, money(T.gross), money(T.disc), money(T.refunds), money(T.rev), money(T.tax), money(T.profit)]] },
      html: `<div class="iv-grid rp-dense">${panel(`Sales summary <span class="rp-seg rp-noprint" role="group" aria-label="Group by">${Object.entries(MODES).map(([k, l]) => `<button type="button" data-a="mode" data-v="${k}" class="${k === sumMode ? 'on' : ''}">${l}</button>`).join('')}</span>`, '', comboChart(b), 'span2')}
        ${panel('Payment methods', 'as sold, incl. pay later', mix.length ? donut(mix, { big: 'KES ' + kes(sum(mix, x => x.value)), small: 'sold' }) : '<p class="empty">No sales in these dates.</p>')}
        ${panel('Figures by period', T.n + ' sales. Net sales are after refunds. The method filter does not apply here.', pmTbl(head, rows.map(cells), ['Total', T.n, fmt(T.gross), fmt(T.disc), fmt(T.refunds), fmt(T.rev), fmt(T.tax), fmt(T.profit)], 'No sales in these dates.'), 'span3')}</div>` };
  }
  function vTx() {
    const st = { COMPLETED: ['ok', 'Confirmed'], PARTIALLY_REFUNDED: ['low', 'Part refunded'], REFUNDED: ['out', 'Refunded'] };
    const F = { all: ['All', () => true], COMPLETED: ['Confirmed', p => p.sale === 'COMPLETED'], PARTIALLY_REFUNDED: ['Part refunded', p => p.sale === 'PARTIALLY_REFUNDED'], REFUNDED: ['Refunded', p => p.sale === 'REFUNDED'], unrec: ['Not reconciled', p => !p.rec] };
    const all = ctx.P.filter(F[txf][1]), list = all.slice(0, 300);
    return { csv: { name: 'transactions', rows: [['Date', 'Receipt', 'Method', 'Reference', 'Cashier', 'Amount (KES)', 'Status', 'Reconciled'], ...all.map(p => [p.date.slice(0, 10), p.receipt, ml(p.method), p.ref, p.cashier, money(p.amount), st[p.sale][1], p.rec ? 'Yes' : 'No'])] },
      html: panel('Payment transactions', all.length + ' payments' + (all.length > list.length ? ', newest 300 shown (CSV has all)' : ''),
        `<div class="iv-chips rp-noprint" style="margin-bottom:12px">${Object.entries(F).map(([k, [l, f]]) => `<button type="button" data-a="txf" data-v="${k}" class="${k === txf ? 'on' : ''}">${l} <small>${ctx.P.filter(f).length}</small></button>`).join('')}</div>`
        + pmTbl(['Date', 'Receipt', 'Method', 'Reference', 'Cashier', 'Amount', 'Status', 'Reconciled'],
          list.map(p => [when(p.date), esc(p.receipt), ml(p.method), esc(p.ref) || '—', esc(p.cashier), fmt(p.amount), pill(...st[p.sale]), p.rec ? pill('ok', 'Yes') : pill('low', 'No')]),
          ['Total', '', '', '', '', fmt(sum(all, p => p.amount)), '', ''], 'No payments match.')) };
  }
  const varTxt = m => { const r = sum(ctx.P.filter(p => p.method === m), p => p.amount), s = stmt[m]; if (s == null) return '—'; const d = s - r;
    return d === 0 ? pill('ok', 'Matched') : pill(d > 0 ? 'low' : 'out', (d > 0 ? 'Over ' : 'Short ') + fmt(Math.abs(d))); };
  function vRecon() {
    const ms = Object.keys(METHODS).filter(m => !ctx.m || m === ctx.m), un = ctx.P.filter(p => !p.rec), shown = un.slice(0, 100), mg = may('payments.manage');
    const rows = ms.map(m => { const p = ctx.P.filter(x => x.method === m), r = sum(p, x => x.amount), ok = sum(p.filter(x => x.rec), x => x.amount);
      return [ml(m), fmt(r), fmt(ok), fmt(r - ok), `<input class="stmt" type="number" min="0" step="0.01" data-stmt="${m}" value="${stmt[m] != null ? stmt[m] / 100 : ''}" aria-label="${ml(m)} statement total" placeholder="${m === 'CASH' ? 'Cash counted' : 'Statement total'}">`, `<span data-var="${m}">${varTxt(m)}</span>`]; });
    return { csv: { name: 'reconciliation', rows: [['Method', 'Recorded (KES)', 'Reconciled (KES)', 'Not reconciled (KES)'], ...ms.map(m => { const p = ctx.P.filter(x => x.method === m); return [ml(m), money(sum(p, x => x.amount)), money(sum(p.filter(x => x.rec), x => x.amount)), money(sum(p.filter(x => !x.rec), x => x.amount))]; })] },
      html: panel('Sales vs money actually received', 'type the total from the M-Pesa, card or bank statement, or the cash you counted', pmTbl(['Method', 'Recorded sales', 'Reconciled', 'Not reconciled', 'Statement / counted', 'Difference'], rows))
        + panel('Payments waiting to be reconciled', un.length + ' payments', (mg ? `<div class="pm-bar rp-noprint"><button type="button" class="primary" data-a="recsel">Reconcile selected</button><button type="button" data-a="recall">Reconcile all ${un.length}</button></div>` : '')
          + pmTbl(['', 'Date', 'Receipt', 'Method', 'Reference', 'Amount'], shown.map(p => [mg ? `<input type="checkbox" data-k="${p.key}" aria-label="Select ${esc(p.receipt)}">` : '', when(p.date), esc(p.receipt), ml(p.method), esc(p.ref) || '—', fmt(p.amount)]), null, 'Everything in these dates is reconciled.')) };
  }
  function vExp() {
    const st = { PENDING: ['low', 'Pending'], APPROVED: ['ok', 'Approved'], REJECTED: ['out', 'Rejected'] }, ok = ctx.E.filter(e => e.status === 'APPROVED'), rec = may('expenses.record'), app = may('expenses.approve');
    return { csv: { name: 'expenses', rows: [['Number', 'Date', 'Category', 'Description', 'Method', 'Reference', 'Amount (KES)', 'VAT (KES)', 'Status', 'Recorded by', 'Decided by'], ...ctx.E.map(e => [e.number || '', e.date.slice(0, 10), e.category, e.description, ml(e.method), e.reference, money(e.amount), money(e.vat), st[e.status][1], e.by, e.decidedBy || ''])] },
      html: panel('Expenses', ctx.E.length + ' in these dates', `<div class="pm-bar rp-noprint"><span class="grow sub" style="margin:0">Only approved expenses count as money out.</span>${rec ? '<button type="button" class="primary" data-a="exp">Add expense</button>' : ''}</div>`
        + pmTbl(['Date', 'Category', 'Description', 'Paid by', 'Amount', 'VAT', 'Status', ''], ctx.E.map(e => [when(e.date), esc(e.category), esc(e.description) + (e.by ? `<br><small>by ${esc(e.by)}</small>` : ''), ml(e.method) + (e.reference ? ' · ' + esc(e.reference) : ''), fmt(e.amount), fmt(e.vat), pill(...st[e.status]),
          e.status === 'PENDING' && app && (e.byId !== U.id || isTopRole()) ? `<button data-a="ok" data-id="${e.id}">Approve</button> <button class="danger" data-a="no" data-id="${e.id}">Reject</button>` : '']),
          ['Approved total', '', '', '', fmt(sum(ok, e => e.amount)), fmt(sum(ok, e => e.vat)), '', ''], 'No expenses recorded in these dates.')) };
  }
  function vCash() {
    const list = cashOnly ? ctx.L.filter(x => x.method === 'CASH') : ctx.L, i = sum(list, x => x.inn), o = sum(list, x => x.out);
    return { csv: { name: 'cash-movements', rows: ledgerCsv(list) },
      html: panel('Cash movements', 'every sale, refund, expense, supplier payment and drawer movement', `<div class="pm-bar rp-noprint"><div class="iv-chips grow"><button type="button" data-a="cashonly" data-v="0" class="${cashOnly ? '' : 'on'}">All methods</button><button type="button" data-a="cashonly" data-v="1" class="${cashOnly ? 'on' : ''}">Cash only</button></div>${may('payments.manage') ? '<button type="button" class="primary" data-a="move">Record movement</button>' : ''}</div>
        <div class="pm-sum"><div><small>Money in</small><b class="pm-in">${fmt(i)}</b></div><div><small>Money out</small><b class="pm-out">${fmt(o)}</b></div><div><small>Net</small><b>${fmt(i - o)}</b></div></div>` + ledgerTable(list.slice(0, 300), true)) };
  }
  function vBal() {
    const list = payables(), due = sum(list, x => x.due), rc = receivables(), owed = sum(rc, x => x.due), mg = may('payments.manage'), by = new Map(); list.forEach(x => by.set(x.o.supplierName, (by.get(x.o.supplierName) || 0) + x.due));
    const items = [...by].filter(([, v]) => v > 0).map(([label, value]) => ({ label, value })), pays = S.fin.supplierPayments.slice(0, 5);
    return { csv: { name: 'balances', rows: [['Owed by clients'], ['Receipt', 'Client', 'Date', 'Sale total (KES)', 'Balance owed (KES)', 'Days outstanding'], ...rc.map(x => [x.s.receiptNumber, x.s.customerName, x.s.createdAt.slice(0, 10), money(x.s.grandTotal), money(x.due), x.days]), [],
        ['Owed to suppliers'], ['Order', 'Supplier', 'Received value (KES)', 'Paid (KES)', 'Balance due (KES)'], ...list.map(x => [x.o.number, x.o.supplierName, money(x.recv), money(x.paid), money(x.due)])] },
      html: `<p class="rp-note">Balances are always up to date: the date filter does not change them. Clients owe money only when a manager sells on credit ("Pay later") at checkout.</p>
        ${panel('Owed by clients', fmt(owed) + ' in total', pmTbl(['Receipt', 'Client', 'Date', 'Sale total', 'Balance owed', 'Days', ''], rc.map(x => [esc(x.s.receiptNumber), esc(x.s.customerName), when(x.s.createdAt), fmt(x.s.grandTotal), `<b>${fmt(x.due)}</b>`,
          x.days > 30 ? pill('out', x.days + ' days') : x.days > 7 ? pill('low', x.days + ' days') : x.days + (x.days === 1 ? ' day' : ' days'), mg ? `<button data-a="cli" data-id="${x.s.id}">Record payment</button>` : '']), ['Total', '', '', '', fmt(owed), '', ''], 'No clients owe anything.'))}
        <div class="iv-grid">${panel('Owed by supplier', fmt(due) + ' in total', items.length ? hbars(items, i => fmt(i.value)) : '<p class="empty">No supplier balances. Receive goods on the Purchases page first.</p>', 'span2')}
        ${panel('Latest payments', 'to suppliers', pays.length ? `<ul class="iv-list">${pays.map(p => `<li><div class="nm"><b>${esc(p.supplier)}</b><small>${esc(p.number)} · ${ml(p.method)} · ${when(p.at)}</small></div><b class="rp-amt">${fmt(p.amount)}</b></li>`).join('')}</ul>` : '<p class="empty">No payments yet.</p>')}</div>
        ${panel('Supplier balances', list.length + ' orders', pmTbl(['Order', 'Supplier', 'Received value', 'Paid', 'Balance due', ''],
          list.map(x => [esc(x.o.number), esc(x.o.supplierName), fmt(x.recv), fmt(x.paid), x.due > 0 ? `<b>${fmt(x.due)}</b>` : pill('ok', 'Settled'), x.due > 0 && mg ? `<button data-a="sup" data-id="${x.o.id}">Record payment</button>` : '']),
          ['Total', '', fmt(sum(list, x => x.recv)), fmt(sum(list, x => x.paid)), fmt(due), ''], 'No supplier balances yet.'))}` };
  }
  function vTax() {
    const rows = new Map();
    ctx.sales.forEach(s => s.items.forEach(l => { const k = (l.quantity - (l.refundedQty || 0)) / l.quantity; if (k <= 0) return;
      const g = Math.round(l.lineTotal * k), x = Math.round((l.taxAmount || 0) * k), n = g - x, r = x > 0 && n > 0 ? Math.round(x * 100 / n) : 0, o = rows.get(r) || { r, g: 0, n: 0, x: 0 };
      o.g += g; o.n += n; o.x += x; rows.set(r, o); }));
    const list = [...rows.values()].sort((a, b) => b.r - a.r), outV = sum(list, x => x.x), inV = sum(ctx.E.filter(e => e.status === 'APPROVED'), e => e.vat);
    const lab = r => r ? r + '% VAT' : 'Exempt / zero-rated', head = ['VAT rate', 'Gross sales', 'Sales excl. VAT', 'VAT collected'];
    return { csv: { name: 'vat', rows: [head, ...list.map(x => [lab(x.r), money(x.g), money(x.n), money(x.x)]), [], ['Output VAT (sales)', money(outV)], ['Input VAT (approved expenses)', money(inV)], ['Net VAT payable', money(outV - inV)]] },
      html: `<p class="rp-note">Sales are net of refunds and include sales on credit. Method and branch filters do not apply. This is a summary to help with your return, not the return itself.</p><div class="iv-grid">${panel('VAT position', '', dl([['Output VAT on sales', fmt(outV)], ['− Input VAT on expenses', fmt(inV)], ['<b>Net VAT payable</b>', `<b>${fmt(outV - inV)}</b>`]]))}
        ${panel('Sales by VAT rate', '', pmTbl(head, list.map(x => [lab(x.r), fmt(x.g), fmt(x.n), fmt(x.x)]), ['Total', fmt(sum(list, x => x.g)), fmt(sum(list, x => x.n)), fmt(outV)], 'No sales in these dates.'), 'span2')}</div>` };
  }
  const VIEWS = { overview: vOverview, sum: vSum, tx: vTx, recon: vRecon, exp: vExp, cash: vCash, bal: vBal, tax: vTax };
  
  /*JOURNAL-START*/
  // Balanced debit and credit lines for accounting software. Amounts in KES. Every entry has equal debits and credits.
  function buildJournal(D, from, to) {
    const A = { CASH: 'Cash on hand', MPESA: 'M-Pesa clearing', CARD: 'Card clearing', BANK: 'Bank', CREDIT: 'Accounts receivable' }, R = [], at = iso => { const d = new Date(iso); return d >= from && d <= to; };
    const add = (iso, ref, text, lines) => lines.filter(l => l[1] > 0 || l[2] > 0).forEach(l => R.push({ t: iso, row: [iso.slice(0, 10), ref, text, l[0], l[1] ? money(l[1]) : '', l[2] ? money(l[2]) : ''] }));
    D.sales.forEach(s => {
      if (at(s.createdAt)) add(s.createdAt, s.receiptNumber, 'Sale', [...(s.payments || [{ method: s.method, amount: s.grandTotal }]).map(p => [A[p.method] || p.method, p.amount, 0]), ['Sales revenue', 0, s.grandTotal - (s.taxTotal || 0)], ['VAT output', 0, s.taxTotal || 0]]);
      (s.refunds || []).filter(r => at(r.at)).forEach(r => { const cash = r.cashOut ?? r.amount; add(r.at, s.receiptNumber, 'Refund: ' + r.reason, [['Sales returns', r.amount, 0], [A.CASH, 0, cash], [A.CREDIT, 0, r.amount - cash]]); });
    });
    D.fin.clientPayments.filter(c => at(c.at)).forEach(c => add(c.at, c.receipt, 'Client payment: ' + c.customerName, [[A[c.method], c.amount, 0], [A.CREDIT, 0, c.amount]]));
    D.fin.expenses.filter(e => e.status === 'APPROVED' && at(e.date)).forEach(e => add(e.date, e.number || 'Expense', e.description, [['Expense: ' + e.category, e.amount - e.vat, 0], ['VAT input', e.vat, 0], [A[e.method], 0, e.amount]]));
    (D.grns || []).filter(g => g.status === 'AUTHORISED' && at(g.decidedAt)).forEach(g => add(g.decidedAt, g.number, 'Goods received: ' + g.supplierName, [['Inventory purchases', g.value, 0], ['Accounts payable', 0, g.value]]));
    D.fin.supplierPayments.filter(p => at(p.at)).forEach(p => add(p.at, p.number, 'Supplier payment: ' + p.supplier, [['Accounts payable', p.amount, 0], [A[p.method], 0, p.amount]]));
    D.fin.moves.filter(m => at(m.at)).forEach(m => add(m.at, 'Cash', m.note, m.type === 'CASH_IN' ? [[A.CASH, m.amount, 0], ['Cash float / owner funding', 0, m.amount]] : m.type === 'CASH_OUT' ? [['Cash payouts', m.amount, 0], [A.CASH, 0, m.amount]] : [[A.BANK, m.amount, 0], [A.CASH, 0, m.amount]]));
    R.sort((a, b) => a.t.localeCompare(b.t));
    return [['Date', 'Reference', 'Description', 'Account', 'Debit (KES)', 'Credit (KES)'], ...R.map(x => x.row)];
  }
  /*JOURNAL-END*/