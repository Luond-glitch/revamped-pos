const TABS = [['overview', 'Overview'], ['tx', 'Transactions'], ['recon', 'Reconciliation'], ['exp', 'Expenses'], ['cash', 'Cash movements'], ['bal', 'Balances'], ['tax', 'VAT']];
const CATS = ['Rent', 'Utilities', 'Transport', 'Salaries & wages', 'Supplies', 'Repairs', 'Marketing', 'Other'];
const METHODS = { CASH: 'Cash', MPESA: 'M-Pesa', CARD: 'Card', BANK: 'Bank transfer' };
const S = { sales: [], pos: [], fin: { expenses: [], moves: [], recon: {}, supplierPayments: [] } }, stmt = {};
let tab = 'overview', ctx = null, view = null, cashOnly = false;

const ml = m => METHODS[m] || m, opts = o => Object.entries(o).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0), pill = (c, t) => `<span class="iv-pill ${c}">${t}</span>`;
const panel = (t, s, b, c = '') => `<section class="card iv-panel ${c}"><h2>${t}${s ? ` <small>${s}</small>` : ''}</h2>${b}</section>`;
const pmTbl = (h, rows, tot, msg = 'Nothing to show for these filters.') => rows.length ? `<table>${dataTable(h, rows, tot)}</table>` : `<p class="empty">${msg}</p>`;
const dl = rows => `<dl class="rp-dl">${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;

/* ---------- data shaping ---------- */
const payRows = () => S.sales.flatMap(s => (s.payments || [{ method: s.method, amount: s.grandTotal }]).map((p, i) => {
  const key = s.id + ':' + i;
  return { key, date: s.createdAt, receipt: s.receiptNumber, method: p.method, amount: p.amount, ref: p.reference || '', cashier: s.cashier, sale: s.status, rec: S.fin.recon[key] };
}));
const ledgerRows = () => {
  const L = [];
  payRows().forEach(p => L.push({ at: p.date, type: 'Sale', label: p.receipt, method: p.method, ref: p.ref, inn: p.amount, out: 0 }));
  S.sales.forEach(s => (s.refunds || []).forEach(r => L.push({ at: r.at, type: 'Refund', label: s.receiptNumber + ' · ' + r.reason, method: 'CASH', ref: '', inn: 0, out: r.amount }))); // refunds are assumed paid from the drawer
  S.fin.expenses.filter(e => e.status === 'APPROVED').forEach(e => L.push({ at: e.date, type: 'Expense', label: e.category + ' · ' + e.description, method: e.method, ref: e.reference || '', inn: 0, out: e.amount }));
  S.fin.supplierPayments.forEach(p => L.push({ at: p.at, type: 'Supplier', label: p.number + ' · ' + p.supplier, method: p.method, ref: p.reference || '', inn: 0, out: p.amount }));
  const T = { CASH_IN: 'Cash in', CASH_OUT: 'Cash out', BANK_DEPOSIT: 'Bank deposit' };
  S.fin.moves.forEach(m => L.push({ at: m.at, type: T[m.type], label: m.note, method: 'CASH', ref: '', inn: m.type === 'CASH_IN' ? m.amount : 0, out: m.type === 'CASH_IN' ? 0 : m.amount }));
  return L.sort((a, b) => b.at.localeCompare(a.at));
};
const payables = () => S.pos.map(o => { const recv = sum(o.items, l => l.received * l.unitCost), paid = sum(S.fin.supplierPayments.filter(p => p.poId === o.id), p => p.amount); return { o, recv, paid, due: recv - paid }; }).filter(x => x.recv || x.paid);

/* ---------- boot ---------- */
boot('payments').then(async () => {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-t="${k}">${l}</button>`).join('');
  $('#method').innerHTML = '<option value="">All methods</option>' + opts(METHODS);
  const n = new Date(); $('#from').value = dkey(addDays(n, -29)); $('#to').value = dkey(n);
  await reload(false);
  $('#from').onchange = $('#to').onchange = $('#method').onchange = draw;
  $('#presets').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; const now = new Date(), p = b.dataset.p; let from = now;
    if (p === '7') from = addDays(now, -6); else if (p === '30') from = addDays(now, -29); else if (p === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1); else if (p === 'year') from = new Date(now.getFullYear(), 0, 1);
    $('#from').value = dkey(from); $('#to').value = dkey(now); draw(); };
  $('#tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; drawView(); } };
  $('#csv').onclick = () => view && downloadCsv('payments-' + view.csv.name, view.csv.rows);
  $('#journal').onclick = () => downloadCsv('accounting-journal', [['Date', 'Type', 'Description', 'Method', 'Reference', 'Money in (KES)', 'Money out (KES)'],
    ...ctx.L.map(x => [x.at.slice(0, 10), x.type, x.label, ml(x.method), x.ref, money(x.inn), money(x.out)])]);
  $('#print').onclick = () => window.print();
  $('#view').onclick = onAction;
  $('#view').oninput = e => { const i = e.target.closest('[data-stmt]'); if (!i) return; const m = i.dataset.stmt;
    stmt[m] = i.value === '' ? undefined : toCents(i.value); $(`[data-var="${m}"]`).innerHTML = varTxt(m); };
  draw();
});
async function reload(redraw = true) {
  try { const [sales, fin, pos] = await Promise.all([API.sales(), API.finance(), API.purchaseOrders()]); Object.assign(S, { sales, fin, pos }); } catch (e) { toast(e.message, true); }
  if (redraw) draw();
}

function draw() {
  const f = $('#from').value, t = $('#to').value; if (!f || !t) return;
  const from = dayStart(new Date(f + 'T00:00:00')), to = dayEnd(new Date(t + 'T00:00:00')); if (from > to) return toast('The start date is after the end date.', true);
  const m = $('#method').value, within = iso => { const d = new Date(iso); return d >= from && d <= to; };
  const P = payRows().filter(p => within(p.date) && (!m || p.method === m)), L = ledgerRows().filter(x => within(x.at) && (!m || x.method === m));
  const E = S.fin.expenses.filter(e => within(e.date) && (!m || e.method === m));
  ctx = { from, to, m, P, L, E };
  const unrec = P.filter(p => !p.rec), due = sum(payables(), x => x.due), pend = E.filter(e => e.status === 'PENDING').length;
  $('#stats').innerHTML = [
    statCard('green', 'dollar', 'Money received', fmt(sum(P, p => p.amount)), P.length + (P.length === 1 ? ' payment' : ' payments')),
    statCard('red', 'refund', 'Refunds paid', fmt(sum(L.filter(x => x.type === 'Refund'), x => x.out)), 'taken from the drawer'),
    statCard('amber', 'receipt', 'Approved expenses', fmt(sum(E.filter(e => e.status === 'APPROVED'), e => e.amount)), pend + ' awaiting approval'),
    statCard('blue', 'trend', 'Net money movement', fmt(sum(L, x => x.inn - x.out)), 'money in minus money out'),
    statCard('amber', 'alert', 'Not reconciled', fmt(sum(unrec, p => p.amount)), unrec.length + ' payments'),
    statCard('red', 'box', 'Owed to suppliers', fmt(due), 'for goods already received'),
  ].join('');
  drawView();
}
function drawView() {
  if (!ctx) return;
  $$('#tabs button').forEach(b => { const on = b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  view = VIEWS[tab](); $('#view').innerHTML = view.html;
}

/* ---------- actions ---------- */
async function onAction(e) {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id;
  try {
    if (a === 'exp') return addExpense(); if (a === 'move') return addMove(); if (a === 'sup') return paySupplier(id);
    if (a === 'cashonly') { cashOnly = b.dataset.v === '1'; return drawView(); }
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
    <div class="row"><label class="grow">Paid by<select id="mt">${opts(METHODS)}</select></label><label class="grow">Date<input id="dt" type="date" value="${dkey(new Date())}"></label></div>
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

/* ---------- views ---------- */
const ledgerTable = (list, tot) => pmTbl(['Date', 'Type', 'Description', 'Method', 'Reference', 'Money in', 'Money out'],
  list.map(x => [when(x.at), x.type, esc(x.label), ml(x.method), esc(x.ref) || '—', x.inn ? `<span class="pm-in">${fmt(x.inn)}</span>` : '—', x.out ? `<span class="pm-out">${fmt(x.out)}</span>` : '—']),
  tot ? ['Total', '', '', '', '', fmt(sum(list, x => x.inn)), fmt(sum(list, x => x.out))] : null, 'No money moved in these dates.');
const ledgerCsv = list => [['Date', 'Type', 'Description', 'Method', 'Reference', 'Money in (KES)', 'Money out (KES)'], ...list.map(x => [x.at.slice(0, 10), x.type, x.label, ml(x.method), x.ref, money(x.inn), money(x.out)])];

function vOverview() {
  const by = {}; ctx.P.forEach(p => by[p.method] = (by[p.method] || 0) + p.amount);
  const mix = Object.entries(by).map(([m, v]) => ({ label: ml(m), value: v })), tot = sum(ctx.P, p => p.amount), flow = {};
  ctx.L.forEach(x => flow[x.type] = (flow[x.type] || 0) + x.inn + x.out);
  const items = Object.entries(flow).map(([k, v]) => ({ label: k, value: v }));
  return { csv: { name: 'overview', rows: [['Method', 'Received (KES)'], ...mix.map(m => [m.label, money(m.value)]), ['Total', money(tot)]] },
    html: `<div class="iv-grid">${panel('Money in and out', 'by type', items.length ? hbars(items, i => fmt(i.value)) : '<p class="empty">Nothing recorded for these dates.</p>', 'span2')}
      ${panel('Payment methods', 'received', mix.length ? donut(mix, { big: 'KES ' + kes(tot), small: 'received' }) : '<p class="empty">No payments yet.</p>')}</div>
      ${panel('Latest movements', 'newest 8', ledgerTable(ctx.L.slice(0, 8)))}` };
}
function vTx() {
  const st = { COMPLETED: ['ok', 'Confirmed'], PARTIALLY_REFUNDED: ['low', 'Part refunded'], REFUNDED: ['out', 'Refunded'] }, list = ctx.P.slice(0, 300);
  return { csv: { name: 'transactions', rows: [['Date', 'Receipt', 'Method', 'Reference', 'Cashier', 'Amount (KES)', 'Status', 'Reconciled'], ...ctx.P.map(p => [p.date.slice(0, 10), p.receipt, ml(p.method), p.ref, p.cashier, money(p.amount), st[p.sale][1], p.rec ? 'Yes' : 'No'])] },
    html: panel('Payment transactions', ctx.P.length + ' payments' + (ctx.P.length > list.length ? ', newest 300 shown (CSV has all)' : ''),
      pmTbl(['Date', 'Receipt', 'Method', 'Reference', 'Cashier', 'Amount', 'Status', 'Reconciled'],
        list.map(p => [when(p.date), esc(p.receipt), ml(p.method), esc(p.ref) || '—', esc(p.cashier), fmt(p.amount), pill(...st[p.sale]), p.rec ? pill('ok', 'Yes') : pill('low', 'No')]),
        ['Total', '', '', '', '', fmt(sum(ctx.P, p => p.amount)), '', ''], 'No payments in these dates.')) };
}
const varTxt = m => { const r = sum(ctx.P.filter(p => p.method === m), p => p.amount), s = stmt[m]; if (s == null) return '—'; const d = s - r;
  return d === 0 ? pill('ok', 'Matched') : pill(d > 0 ? 'low' : 'out', (d > 0 ? 'Over ' : 'Short ') + fmt(Math.abs(d))); };
function vRecon() {
  const ms = Object.keys(METHODS).filter(m => !ctx.m || m === ctx.m), un = ctx.P.filter(p => !p.rec), shown = un.slice(0, 100);
  const rows = ms.map(m => { const p = ctx.P.filter(x => x.method === m), r = sum(p, x => x.amount), ok = sum(p.filter(x => x.rec), x => x.amount);
    return [ml(m), fmt(r), fmt(ok), fmt(r - ok), `<input class="stmt" type="number" min="0" step="0.01" data-stmt="${m}" value="${stmt[m] != null ? stmt[m] / 100 : ''}" aria-label="${ml(m)} statement total" placeholder="${m === 'CASH' ? 'Cash counted' : 'Statement total'}">`, `<span data-var="${m}">${varTxt(m)}</span>`]; });
  return { csv: { name: 'reconciliation', rows: [['Method', 'Recorded (KES)', 'Reconciled (KES)', 'Not reconciled (KES)'], ...ms.map(m => { const p = ctx.P.filter(x => x.method === m); return [ml(m), money(sum(p, x => x.amount)), money(sum(p.filter(x => x.rec), x => x.amount)), money(sum(p.filter(x => !x.rec), x => x.amount))]; })] },
    html: panel('Sales vs money actually received', 'type the total from the M-Pesa, card or bank statement, or the cash you counted', pmTbl(['Method', 'Recorded sales', 'Reconciled', 'Not reconciled', 'Statement / counted', 'Difference'], rows))
      + panel('Payments waiting to be reconciled', un.length + ' payments', `<div class="pm-bar rp-noprint"><button type="button" class="primary" data-a="recsel">Reconcile selected</button><button type="button" data-a="recall">Reconcile all ${un.length}</button></div>`
        + pmTbl(['', 'Date', 'Receipt', 'Method', 'Reference', 'Amount'], shown.map(p => [`<input type="checkbox" data-k="${p.key}" aria-label="Select ${esc(p.receipt)}">`, when(p.date), esc(p.receipt), ml(p.method), esc(p.ref) || '—', fmt(p.amount)]), null, 'Everything in these dates is reconciled.')) };
}
function vExp() {
  const st = { PENDING: ['low', 'Pending'], APPROVED: ['ok', 'Approved'], REJECTED: ['out', 'Rejected'] }, ok = ctx.E.filter(e => e.status === 'APPROVED');
  return { csv: { name: 'expenses', rows: [['Date', 'Category', 'Description', 'Method', 'Reference', 'Amount (KES)', 'VAT (KES)', 'Status', 'Recorded by', 'Decided by'], ...ctx.E.map(e => [e.date.slice(0, 10), e.category, e.description, ml(e.method), e.reference, money(e.amount), money(e.vat), st[e.status][1], e.by, e.decidedBy || ''])] },
    html: panel('Expenses', ctx.E.length + ' in these dates', `<div class="pm-bar rp-noprint"><span class="grow sub" style="margin:0">Only approved expenses count as money out.</span><button type="button" class="primary" data-a="exp">Add expense</button></div>`
      + pmTbl(['Date', 'Category', 'Description', 'Paid by', 'Amount', 'VAT', 'Status', ''], ctx.E.map(e => [when(e.date), esc(e.category), esc(e.description), ml(e.method) + (e.reference ? ' · ' + esc(e.reference) : ''), fmt(e.amount), fmt(e.vat), pill(...st[e.status]),
        e.status === 'PENDING' ? `<button data-a="ok" data-id="${e.id}">Approve</button> <button class="danger" data-a="no" data-id="${e.id}">Reject</button>` : '']),
        ['Approved total', '', '', '', fmt(sum(ok, e => e.amount)), fmt(sum(ok, e => e.vat)), '', ''], 'No expenses recorded in these dates.')) };
}
function vCash() {
  const list = cashOnly ? ctx.L.filter(x => x.method === 'CASH') : ctx.L, i = sum(list, x => x.inn), o = sum(list, x => x.out);
  return { csv: { name: 'cash-movements', rows: ledgerCsv(list) },
    html: panel('Cash movements', 'every sale, refund, expense, supplier payment and drawer movement', `<div class="pm-bar rp-noprint"><div class="iv-chips grow"><button type="button" data-a="cashonly" data-v="0" class="${cashOnly ? '' : 'on'}">All methods</button><button type="button" data-a="cashonly" data-v="1" class="${cashOnly ? 'on' : ''}">Cash only</button></div><button type="button" class="primary" data-a="move">Record movement</button></div>
      <div class="pm-sum"><div><small>Money in</small><b class="pm-in">${fmt(i)}</b></div><div><small>Money out</small><b class="pm-out">${fmt(o)}</b></div><div><small>Net</small><b>${fmt(i - o)}</b></div></div>` + ledgerTable(list.slice(0, 300), true)) };
}
function vBal() {
  const list = payables(), due = sum(list, x => x.due), by = new Map(); list.forEach(x => by.set(x.o.supplierName, (by.get(x.o.supplierName) || 0) + x.due));
  const items = [...by].filter(([, v]) => v > 0).map(([label, value]) => ({ label, value })), pays = S.fin.supplierPayments.slice(0, 15);
  return { csv: { name: 'supplier-balances', rows: [['Order', 'Supplier', 'Received value (KES)', 'Paid (KES)', 'Balance due (KES)'], ...list.map(x => [x.o.number, x.o.supplierName, money(x.recv), money(x.paid), money(x.due)])] },
    html: `<p class="rp-note">Balances cover goods already received. Sales are always paid in full at checkout, so there are no customer balances to track yet. Dates do not filter this tab.</p>
      <div class="iv-grid">${panel('Owed by supplier', fmt(due) + ' in total', items.length ? hbars(items, i => fmt(i.value)) : '<p class="empty">No supplier balances. Receive goods on the Purchases page first.</p>', 'span2')}
      ${panel('Latest payments', 'to suppliers', pays.length ? `<ul class="iv-list">${pays.slice(0, 5).map(p => `<li><div class="nm"><b>${esc(p.supplier)}</b><small>${esc(p.number)} · ${ml(p.method)} · ${when(p.at)}</small></div><b class="rp-amt">${fmt(p.amount)}</b></li>`).join('')}</ul>` : '<p class="empty">No payments yet.</p>')}</div>`
      + panel('Supplier balances', list.length + ' orders', pmTbl(['Order', 'Supplier', 'Received value', 'Paid', 'Balance due', ''],
        list.map(x => [esc(x.o.number), esc(x.o.supplierName), fmt(x.recv), fmt(x.paid), x.due > 0 ? `<b>${fmt(x.due)}</b>` : pill('ok', 'Settled'), x.due > 0 ? `<button data-a="sup" data-id="${x.o.id}">Record payment</button>` : '']),
        ['Total', '', fmt(sum(list, x => x.recv)), fmt(sum(list, x => x.paid)), fmt(due), ''], 'No supplier balances yet.')) };
}
function vTax() {
  const rows = new Map();
  inRange(S.sales, ctx.from, ctx.to).forEach(s => s.items.forEach(l => { const k = (l.quantity - (l.refundedQty || 0)) / l.quantity; if (k <= 0) return;
    const g = Math.round(l.lineTotal * k), x = Math.round((l.taxAmount || 0) * k), n = g - x, r = x > 0 && n > 0 ? Math.round(x * 100 / n) : 0, o = rows.get(r) || { r, g: 0, n: 0, x: 0 };
    o.g += g; o.n += n; o.x += x; rows.set(r, o); }));
  const list = [...rows.values()].sort((a, b) => b.r - a.r), outV = sum(list, x => x.x), inV = sum(ctx.E.filter(e => e.status === 'APPROVED'), e => e.vat);
  const lab = r => r ? r + '% VAT' : 'Exempt / zero-rated', head = ['VAT rate', 'Gross sales', 'Sales excl. VAT', 'VAT collected'];
  return { csv: { name: 'vat', rows: [head.map(h => h), ...list.map(x => [lab(x.r), money(x.g), money(x.n), money(x.x)]), [], ['Output VAT (sales)', money(outV)], ['Input VAT (approved expenses)', money(inV)], ['Net VAT payable', money(outV - inV)]] },
    html: `<p class="rp-note">Sales are net of refunds. Method and branch filters do not apply. This is a summary to help with your return, not the return itself.</p><div class="iv-grid">${panel('VAT position', '', dl([['Output VAT on sales', fmt(outV)], ['− Input VAT on expenses', fmt(inV)], ['<b>Net VAT payable</b>', `<b>${fmt(outV - inV)}</b>`]]))}
      ${panel('Sales by VAT rate', '', pmTbl(head, list.map(x => [lab(x.r), fmt(x.g), fmt(x.n), fmt(x.x)]), ['Total', fmt(sum(list, x => x.g)), fmt(sum(list, x => x.n)), fmt(outV)], 'No sales in these dates.'), 'span2')}</div>` };
}
const VIEWS = { overview: vOverview, tx: vTx, recon: vRecon, exp: vExp, cash: vCash, bal: vBal, tax: vTax };