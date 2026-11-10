const TABS = [['sales', 'Sales'], ['products', 'Products'], ['stock', 'Stock'], ['profit', 'Profit'], ['staff', 'Cashiers & shifts'], ['branches', 'Branches']];
const S = { sales: [], products: [], cost: new Map(), shift: null, shifts: [] };
let tab = 'sales', ctx = null, view = null, stockOnly = false;
const longDate = d => new Date(d).toLocaleDateString('en-KE', { dateStyle: 'medium' });
const sev = p => ({ out: 0, low: 1, ok: 2 }[lvl(p)]);
const panel = (title, sub, body, cls = '') => `<section class="card iv-panel ${cls}"><h2>${title}${sub ? ` <small>${sub}</small>` : ''}</h2>${body}</section>`;
const dateText = d => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

boot('reports').then(async () => {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-t="${k}">${l}</button>`).join('');
  const today = new Date(); $('#from').value = dkey(addDays(today, -29)); $('#to').value = dkey(today);
  try {
    const [sales, products, shift, shifts] = await Promise.all([API.sales(), API.products(), API.currentShift().catch(() => null), API.shifts ? API.shifts().catch(() => []) : []]);
    Object.assign(S, { sales, products, shift, shifts, cost: costMap(products) });
  } catch (e) { toast(e.message, true); }
  const ids = [...new Set([CONFIG.BRANCH_ID, ...S.sales.map(branchOf)])];
  $('#branch').innerHTML = '<option value="">All branches</option>' + ids.map(id => `<option value="${esc(id)}">${esc(branchName(id))}</option>`).join('');
  $('#from').onchange = $('#to').onchange = $('#mode').onchange = $('#branch').onchange = draw;
  $('#presets').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; const now = new Date(), p = b.dataset.p; let from = now, mode = 'day';
    if (p === '7') from = addDays(now, -6); else if (p === '30') from = addDays(now, -29); else if (p === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (p === 'year') { from = new Date(now.getFullYear(), 0, 1); mode = 'month'; }
    $('#from').value = dkey(from); $('#to').value = dkey(now); $('#mode').value = mode; draw(); };
  $('#tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; drawView(); } };
  $('#view').onclick = e => { const b = e.target.closest('[data-stock]'); if (b) { stockOnly = b.dataset.stock === 'alert'; drawView(); } };
  $('#csv').onclick = () => view && downloadCsv('report-' + view.csv.name, view.csv.rows);
  $('#print').onclick = () => window.print();
  draw();
});

function draw() {
  const f = $('#from').value, t = $('#to').value; if (!f || !t) return;
  const from = dayStart(new Date(f + 'T00:00:00')), to = dayEnd(new Date(t + 'T00:00:00'));
  if (from > to) return toast('The start date is after the end date.', true);
  const br = $('#branch').value, mine = S.sales.filter(s => !br || branchOf(s) === br);
  ctx = { from, to, br, mode: $('#mode').value, all: mine, rs: inRange(mine, from, to), everyBranch: inRange(S.sales, from, to) };
  ctx.t = totals(ctx.rs, S.cost); ctx.rows = series(ctx.rs, S.cost, from, to, ctx.mode);
  const t1 = ctx.t;
  $('#stats').innerHTML = [
    statCard('blue', 'dollar', 'Gross sales', fmt(t1.gross), t1.n + (t1.n === 1 ? ' sale' : ' sales')),
    statCard('red', 'refund', 'Refunds', fmt(t1.refunds), 'Discounts ' + fmt(t1.disc)),
    statCard('green', 'trend', 'Net sales', fmt(t1.rev), 'VAT ' + fmt(t1.tax) + ' included'),
    statCard('amber', 'dollar', 'Gross profit', fmt(t1.profit), t1.margin + '% margin (excl. VAT)'),
    statCard('blue', 'receipt', 'Transactions', t1.n, t1.units + ' items sold'),
    statCard('green', 'users', 'Average sale', t1.n ? fmt(t1.avg) : '—', 'per transaction'),
  ].join('');
  drawView();
}

function drawView() {
  if (!ctx) return;
  $$('#tabs button').forEach(b => { const on = b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  view = VIEWS[tab](); $('#view').innerHTML = view.html;
  $('#printmeta').textContent = `Universal POS · ${TABS.find(x => x[0] === tab)[1]} report · ${dateText(ctx.from)} to ${dateText(ctx.to)} · ${ctx.br ? branchName(ctx.br) : 'All branches'} · printed ${when(new Date())}`;
}

/* ===================== SALES: daily / weekly / monthly / annual ===================== */
function vSales() {
  const { rows, t, mode } = ctx, shown = rows.filter(x => x.n).reverse();
  const head = [MODES[mode] + ' period', 'Orders', 'Gross sales', 'Discounts', 'Refunds', 'Net sales', 'Gross profit'];
  const pm = payMix(ctx.rs), pt = pm.reduce((a, x) => a + x.value, 0);
  return { csv: { name: 'sales-' + mode, rows: [head, ...shown.map(x => [x.long, x.n, money(x.gross), money(x.disc), money(x.refunds), money(x.rev), money(x.profit)]), ['Total', t.n, money(t.gross), money(t.disc), money(t.refunds), money(t.rev), money(t.profit)]] },
    html: `<div class="iv-grid">${panel('Net sales and profit', MODES[mode].toLowerCase(), comboChart(rows), 'span2')}${panel('Payment methods', 'received', donut(pm, { big: 'KES ' + kes(pt), small: 'received' }))}</div>`
      + panel(MODES[mode] + ' sales report', ctx.rs.length + ' sales', `<table>${dataTable(head, shown.map(x => [esc(x.long), x.n, fmt(x.gross), fmt(x.disc), fmt(x.refunds), fmt(x.rev), fmt(x.profit)]), ['Total', t.n, fmt(t.gross), fmt(t.disc), fmt(t.refunds), fmt(t.rev), fmt(t.profit)])}</table>`) };
}

/* ===================== PRODUCTS: best sellers and slow movers ===================== */
function vProducts() {
  const st = productStats(ctx.rs, S.cost), allSt = productStats(ctx.all, S.cost), list = [...st.values()].sort((a, b) => b.rev - a.rev), best = list.slice(0, 10), sum = list.reduce((t, p) => t + p.rev, 0);
  const slow = S.products.filter(p => p.trackStock !== false && p.stock > 0).map(p => ({ p, qty: st.get(p.id)?.qty || 0, last: allSt.get(p.id)?.last || 0 }))
    .sort((a, b) => a.qty - b.qty || a.last - b.last).slice(0, 10);
  const bh = ['Product', 'Units sold', 'Revenue', 'Gross profit', 'Share of sales'], sh = ['Product', 'Units sold', 'On hand', 'Stock value (cost)', 'Last sold'];
  const shareItems = [...best.slice(0, 5).map(p => ({ label: p.name, value: p.rev })), ...(sum - best.slice(0, 5).reduce((t, p) => t + p.rev, 0) > 0 ? [{ label: 'Other products', value: sum - best.slice(0, 5).reduce((t, p) => t + p.rev, 0) }] : [])];
  const lastTxt = x => x.last ? longDate(x.last) : '<span class="iv-pill out">Never sold</span>';
  return { csv: { name: 'products', rows: [['Best-selling products'], bh, ...best.map(p => [p.name, p.qty, money(p.rev), money(p.profit), pct(p.rev, sum) + '%']), [], ['Slow-moving products (in stock, fewest units sold)'], sh,
      ...slow.map(x => [x.p.name, x.qty, x.p.stock, money(x.p.stock * (x.p.cost || 0)), x.last ? longDate(x.last) : 'Never sold'])] },
    html: `<div class="iv-grid">${panel('Best-selling products', 'by revenue', hbars(best.slice(0, 8).map(p => ({ label: p.name, value: p.rev })), i => fmt(i.value)), 'span2')}${panel('Share of sales', '', donut(shareItems, { big: String(list.length), small: 'products sold' }))}</div>`
      + panel('Best sellers', 'top 10', `<table>${dataTable(bh, best.map(p => [esc(p.name), p.qty, fmt(p.rev), fmt(p.profit), pct(p.rev, sum) + '%']))}</table>`)
      + panel('Slow-moving products', 'in stock but selling the fewest units in this period', `<table>${dataTable(sh, slow.map(x => [esc(x.p.name), x.qty || '<span class="iv-pill low">No sales</span>', x.p.stock, fmt(x.p.stock * (x.p.cost || 0)), lastTxt(x)]))}</table>`) };
}

/* ===================== STOCK: valuation and low stock ===================== */
function vStock() {
  const tr = S.products.filter(p => p.trackStock !== false), c = { ok: 0, low: 0, out: 0 }; tr.forEach(p => c[lvl(p)]++);
  const atCost = tr.reduce((t, p) => t + p.stock * (p.cost || 0), 0), atPrice = tr.reduce((t, p) => t + p.stock * p.price, 0);
  const list = tr.filter(p => !stockOnly || lvl(p) !== 'ok').sort((a, b) => sev(a) - sev(b) || a.name.localeCompare(b.name));
  const head = ['Product', 'On hand', 'Reorder at', 'Unit cost', 'Value at cost', 'Value at price', 'Status'], PILL = { ok: 'In stock', low: 'Low stock', out: 'Out of stock' };
  const topVal = [...tr].sort((a, b) => b.stock * (b.cost || 0) - a.stock * (a.cost || 0)).slice(0, 8).map(p => ({ label: p.name, value: p.stock * (p.cost || 0) }));
  return { csv: { name: 'stock', rows: [['Product', 'SKU', 'On hand', 'Reorder at', 'Unit cost (KES)', 'Value at cost (KES)', 'Value at price (KES)', 'Status'],
      ...list.map(p => [p.name, p.sku, p.stock, p.reorder, money(p.cost || 0), money(p.stock * (p.cost || 0)), money(p.stock * p.price), PILL[lvl(p)]])] },
    html: `<p class="rp-note">Stock figures are as of now. The date range above does not apply to this tab.</p>
      <div class="iv-stats rp-kpis">${statCard('blue', 'box', 'Stock value at cost', fmt(atCost), tr.length + ' products')}${statCard('green', 'dollar', 'Value at selling price', fmt(atPrice), 'potential revenue (VAT incl.)')}
        ${statCard('amber', 'alert', 'Low stock', c.low, 'at or below reorder level')}${statCard('red', 'alert', 'Out of stock', c.out, 'need restocking')}</div>
      <div class="iv-grid">${panel('Where your stock value sits', 'top 8 at cost', hbars(topVal, i => fmt(i.value)), 'span2')}${panel('Stock status', '', donut([{ label: 'In stock', value: c.ok }, { label: 'Low stock', value: c.low }, { label: 'Out of stock', value: c.out }].filter(x => x.value), { big: String(tr.length), small: 'products' }, v => v))}</div>
      ${panel('Stock valuation', list.length + ' products', `<div class="iv-chips rp-noprint" style="margin-bottom:12px"><button type="button" data-stock="all" class="${stockOnly ? '' : 'on'}">All products <small>${tr.length}</small></button><button type="button" data-stock="alert" class="${stockOnly ? 'on' : ''}">Low and out <small>${c.low + c.out}</small></button></div>
        <table>${dataTable(head, list.map(p => [esc(p.name), p.stock, p.reorder, fmt(p.cost || 0), fmt(p.stock * (p.cost || 0)), fmt(p.stock * p.price), `<span class="iv-pill ${lvl(p)}">${PILL[lvl(p)]}</span>`]), stockOnly ? null : ['Total', tr.reduce((t, p) => t + p.stock, 0), '', '', fmt(atCost), fmt(atPrice), ''])}</table>`)}` };
}

/* ===================== PROFIT ===================== */
function vProfit() {
  const t = ctx.t, list = [...productStats(ctx.rs, S.cost).values()].sort((a, b) => b.profit - a.profit);
  const head = ['Product', 'Units', 'Revenue', 'VAT', 'Cost of goods', 'Gross profit', 'Margin'];
  return { csv: { name: 'profit', rows: [head, ...list.map(p => [p.name, p.qty, money(p.rev), money(p.tax), money(p.cost), money(p.profit), pct(p.profit, p.rev - p.tax) + '%']), ['Total', t.units, money(t.rev), money(t.tax), money(t.cogs), money(t.profit), t.margin + '%']] },
    html: `<div class="iv-stats rp-kpis">${statCard('blue', 'dollar', 'Net sales', fmt(t.rev), 'after discounts and refunds')}${statCard('amber', 'receipt', 'VAT', fmt(t.tax), 'collected for the tax office')}
        ${statCard('red', 'box', 'Cost of goods sold', fmt(t.cogs), 'at recorded cost prices')}${statCard('green', 'trend', 'Gross profit', fmt(t.profit), t.margin + '% margin')}</div>
      <div class="iv-grid">${panel('Gross profit by period', MODES[ctx.mode].toLowerCase(), comboChart(ctx.rows, { bar: 'profit' }), 'span2')}
        ${panel('How profit is estimated', '', `<dl class="rp-dl"><div><dt>Net sales</dt><dd>${fmt(t.rev)}</dd></div><div><dt>− VAT</dt><dd>${fmt(t.tax)}</dd></div><div><dt>− Cost of goods</dt><dd>${fmt(t.cogs)}</dd></div><div><dt><b>Gross profit</b></dt><dd>${fmt(t.profit)}</dd></div></dl><p class="rp-note" style="margin-top:12px">An estimate from the cost price saved on each sale. Rent, wages and other expenses are not deducted.</p>`)}</div>
      ${panel('Profit by product', list.length + ' products', `<table>${dataTable(head, list.map(p => [esc(p.name), p.qty, fmt(p.rev), fmt(p.tax), fmt(p.cost), fmt(p.profit), pct(p.profit, p.rev - p.tax) + '%']), ['Total', t.units, fmt(t.rev), fmt(t.tax), fmt(t.cogs), fmt(t.profit), t.margin + '%'])}</table>`)}` };
}

/* ===================== CASHIERS AND SHIFTS ===================== */
function vStaff() {
  const m = new Map();
  ctx.rs.forEach(s => { const k = s.cashier || 'Unknown', r = m.get(k) || { name: k, n: 0, rev: 0, units: 0, disc: 0, rn: 0, ref: 0, profit: 0 }, f = figures(s, S.cost);
    r.n++; r.rev += f.rev; r.units += f.units; r.disc += s.discountTotal || 0; r.profit += f.profit; if (s.refundTotal) { r.rn++; r.ref += s.refundTotal; } m.set(k, r); });
  const list = [...m.values()].sort((a, b) => b.rev - a.rev), head = ['Cashier', 'Sales', 'Net sales', 'Average sale', 'Items sold', 'Discounts', 'Refunds', 'Gross profit'];
  const sh = S.shift, mine = sh ? S.sales.filter(s => s.createdAt >= sh.openedAt) : [], cash = mine.reduce((t, s) => t + cashIn(s), 0);
  const hist = [...S.shifts].filter(x => x.closedAt && new Date(x.openedAt) >= ctx.from && new Date(x.openedAt) <= ctx.to).sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .map(x => { const ss = S.sales.filter(s => s.createdAt >= x.openedAt && s.createdAt <= x.closedAt); return { x, n: ss.length, rev: ss.reduce((t, s) => t + net(s), 0) }; });
  const diff = d => d === 0 ? '<span class="iv-pill ok">Balanced</span>' : d > 0 ? `<span class="iv-pill low">Over ${fmt(d)}</span>` : `<span class="iv-pill out">Short ${fmt(-d)}</span>`;
  const hh = ['Cashier', 'Opened', 'Closed', 'Sales', 'Net sales', 'Opening cash', 'Expected', 'Counted', 'Result'];
  return { csv: { name: 'cashiers', rows: [head, ...list.map(r => [r.name, r.n, money(r.rev), money(r.n ? Math.round(r.rev / r.n) : 0), r.units, money(r.disc), r.rn + ' refunds / ' + money(r.ref), money(r.profit)]),
      [], ['Closed shifts'], hh, ...hist.map(h => [h.x.cashier, when(h.x.openedAt), when(h.x.closedAt), h.n, money(h.rev), money(h.x.openingCash), money(h.x.expected), money(h.x.counted), money(h.x.difference)])] },
    html: `<div class="iv-grid">${panel('Cashier performance', 'net sales', hbars(list.map(r => ({ label: r.name, value: r.rev })), i => fmt(i.value)), 'span2')}
      ${panel('Current shift', '', sh ? `<dl class="rp-dl"><div><dt>Cashier</dt><dd>${esc(sh.cashier)}</dd></div><div><dt>Opened</dt><dd>${when(sh.openedAt)}</dd></div><div><dt>Opening cash</dt><dd>${fmt(sh.openingCash)}</dd></div>
        <div><dt>Sales so far (${mine.length})</dt><dd>${fmt(mine.reduce((t, s) => t + net(s), 0))}</dd></div><div><dt>Expected in drawer</dt><dd>${fmt(sh.openingCash + cash)}</dd></div></dl>` : '<p class="empty">No shift is open.</p>')}</div>`
      + panel('Cashier summary', list.length + ' cashiers', `<table>${dataTable(head, list.map(r => [esc(r.name), r.n, fmt(r.rev), fmt(r.n ? Math.round(r.rev / r.n) : 0), r.units, fmt(r.disc), r.rn ? r.rn + ' · ' + fmt(r.ref) : '—', fmt(r.profit)]))}</table>`)
      + panel('Closed shifts', 'opening and closing balances', `<table>${dataTable(hh, hist.map(h => [esc(h.x.cashier), when(h.x.openedAt), when(h.x.closedAt), h.n, fmt(h.rev), fmt(h.x.openingCash), fmt(h.x.expected), fmt(h.x.counted), diff(h.x.difference)]))}</table>`) };
}

/* ===================== BRANCHES ===================== */
function vBranches() {
  const m = new Map([[CONFIG.BRANCH_ID, []]]); ctx.everyBranch.forEach(s => { const k = branchOf(s); (m.get(k) || m.set(k, []).get(k)).push(s); });
  const rows = [...m.entries()].map(([id, ss]) => ({ id, ...totals(ss, S.cost) })).sort((a, b) => b.rev - a.rev), all = rows.reduce((t, r) => t + r.rev, 0);
  const head = ['Branch', 'Sales', 'Net sales', 'Average sale', 'Gross profit', 'Margin', 'Share of sales'];
  return { csv: { name: 'branches', rows: [head, ...rows.map(r => [branchName(r.id), r.n, money(r.rev), money(r.avg), money(r.profit), r.margin + '%', pct(r.rev, all) + '%'])] },
    html: `<p class="rp-note">Compares every branch for the selected dates. The branch filter above does not apply here.${rows.length < 2 ? ' Only one branch has recorded sales so far; other branches will appear here side by side.' : ''}</p>
      <div class="iv-grid">${panel('Net sales by branch', '', hbars(rows.map(r => ({ label: branchName(r.id), value: r.rev })), i => fmt(i.value)), 'span2')}${panel('Share of sales', '', donut(rows.map(r => ({ label: branchName(r.id), value: r.rev })).filter(x => x.value), { big: String(rows.length), small: rows.length === 1 ? 'branch' : 'branches' }))}</div>
      ${panel('Branch comparison', '', `<table>${dataTable(head, rows.map(r => [esc(branchName(r.id)), r.n, fmt(r.rev), r.n ? fmt(r.avg) : '—', fmt(r.profit), r.margin + '%', pct(r.rev, all) + '%']))}</table>`)}` };
}

const VIEWS = { sales: vSales, products: vProducts, stock: vStock, profit: vProfit, staff: vStaff, branches: vBranches };