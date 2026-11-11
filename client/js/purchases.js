/* Purchasing and supplier management (Module 4).
   Needs: api.js, purchases-api.js, app.js and analytics.js (for the cards, bars and donut). */
   const PI = {
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    clip: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
    truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    brief: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    card: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  };
  const pi = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${PI[n]}</svg>`;
  const D = d => d ? new Date(String(d).length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
  const mkey = d => dkey(new Date(d)).slice(0, 7);
  const TERMS = [[0, 'Cash on delivery'], [7, '7 days'], [14, '14 days'], [30, '30 days'], [60, '60 days']];
  const OST = { ORDERED: ['low', 'Ordered'], PARTIAL: ['low', 'Part received'], RECEIVED: ['ok', 'Received'], CANCELLED: ['', 'Cancelled'] };
  const TITLES = { overview: 'Purchasing overview', orders: 'Purchase orders', receiving: 'Goods received', suppliers: 'Suppliers', payables: 'Supplier payments' };
  
  let user, suppliers = [], orders = [], grns = [], payments = [], products = [], tab = 'overview', seePay = false, doPay = false, curRows = [];
  const flt = { q: '', status: 'all', sup: '', from: '', to: '' };
  let gQ = '', gSup = '', sQ = '';
  
  const TABS = () => [['overview', 'Overview', 'grid'], ['orders', 'Purchase orders', 'clip'], ['receiving', 'Goods received', 'truck'], ['suppliers', 'Suppliers', 'brief'], ...(seePay ? [['payables', 'Payables', 'card']] : [])];
  
  boot('purchases').then(async u => {
    user = u; seePay = can(u, 'payments.view'); doPay = can(u, 'payments.manage');
    const h = location.hash.slice(1); if (TABS().some(t => t[0] === h)) tab = h;
    document.addEventListener('click', onClick);
    await load().catch(e => toast(e.message, true));
  });
  
  async function load() {
    [suppliers, orders, products, grns] = await Promise.all([API.suppliers(), API.purchaseOrders(), API.products(), API.goodsReceived()]);
    payments = seePay ? ((await API.finance().catch(() => null))?.supplierPayments || []) : [];
    render();
  }
  
  /* ---------- derived numbers for every order ---------- */
  function enrich() {
    const sup = new Map(suppliers.map(s => [s.id, s])), paid = new Map(), first = new Map();
    payments.forEach(p => paid.set(p.poId, (paid.get(p.poId) || 0) + p.amount));
    grns.slice().reverse().forEach(g => { if (!first.has(g.poId)) first.set(g.poId, g.at); });          // first delivery of each order
    orders.forEach(o => {
      o.units = sum(o.items, l => l.quantity); o.delivered = sum(o.items, l => l.received); o.recv = sum(o.items, l => l.received * l.unitCost);
      o.paid = paid.get(o.id) || 0; o.bal = o.status === 'CANCELLED' ? 0 : o.recv - o.paid;
      const terms = sup.get(o.supplierId)?.terms ?? 30; o.due = addDays(new Date(first.get(o.id) || o.createdAt), terms);
      o.overdue = o.bal > 0 ? Math.floor((Date.now() - o.due) / 864e5) : 0;
      o.late = (o.status === 'ORDERED' || o.status === 'PARTIAL') && o.expectedDate && new Date(o.expectedDate + 'T23:59:59') < new Date();
    });
  }
  
  function render() {
    enrich(); const T = TABS(); if (!T.some(t => t[0] === tab)) tab = 'overview';
    $('#tabs').innerHTML = T.map(([k, l, ic]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-act="tab" data-id="${k}">${pi(ic)}<span>${l}</span></button>`).join('');
    $('#title').textContent = TITLES[tab];
    $('#tools').innerHTML = (tab !== 'overview' ? '<button type="button" data-act="csv">Export CSV</button>' : '') + '<button type="button" data-act="addsup">Add supplier</button><button type="button" class="pu-gold" data-act="newpo">New purchase order</button>';
    ({ overview: vOverview, orders: vOrders, receiving: vReceiving, suppliers: vSuppliers, payables: vPayables })[tab]();
  }
  function setTab(t) { tab = t; history.replaceState(null, '', '#' + t); render(); window.scrollTo({ top: 0 }); }
  
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id, o = () => orders.find(x => x.id === id), s = () => suppliers.find(x => x.id === id);
    const A = { tab: () => setTab(id), newpo: () => newOrder(b.dataset.sup), addsup: () => editSupplier({}), editsup: () => editSupplier(s()), receive: () => receive(o()), pay: () => payOrder(o()),
      cancel: () => cancelOrder(o()), view: () => viewOrder(o()), stmt: () => statement(s()), csv: exportCsv };
    b.closest('dialog')?.close(); A[b.dataset.act]?.();
  }
  
  const pill = (t, l) => `<span class="iv-pill ${t}">${esc(l)}</span>`;
  const prog = o => { const p = o.units ? Math.round(o.delivered / o.units * 100) : 0; return `<div class="pu-prog" role="img" aria-label="${p}% delivered"><i class="${p >= 100 ? 'full' : ''}" style="width:${p}%"></i></div><small>${o.delivered} of ${o.units} units</small>`; };
  const dueCell = o => o.bal <= 0 ? '—' : o.overdue > 0 ? pill('out', o.overdue + (o.overdue === 1 ? ' day overdue' : ' days overdue')) : `${D(o.due)}${o.overdue > -8 ? ' ' + pill('low', 'due soon') : ''}`;
  const openOrders = () => orders.filter(o => o.status === 'ORDERED' || o.status === 'PARTIAL');
  
  /* =====================================================================  OVERVIEW  */
  function vOverview() {
    const open = openOrders(), awaiting = sum(open, o => o.units - o.delivered), owing = orders.filter(o => o.bal > 0), owed = sum(owing, o => o.bal), overdue = owing.filter(o => o.overdue > 0);
    const now = new Date(), m0 = mkey(now), m1 = mkey(new Date(now.getFullYear(), now.getMonth() - 1, 1)), rec = m => sum(grns.filter(g => mkey(g.at) === m), g => g.value);
    const active = new Set(orders.filter(o => o.status !== 'CANCELLED' && Date.now() - new Date(o.createdAt) < 90 * 864e5).map(o => o.supplierId)).size;
    const cards = [statCard('blue', 'box', 'Open orders', open.length, `${awaiting} units awaiting delivery`),
      seePay ? statCard('red', 'alert', 'Owed to suppliers', fmt(owed), `${overdue.length} overdue`) : statCard('amber', 'receipt', 'Ordered this month', fmt(sum(orders.filter(o => o.status !== 'CANCELLED' && mkey(o.createdAt) === m0), o => o.total)), 'order value'),
      statCard('green', 'receipt', 'Received this month', fmt(rec(m0)), delta(rec(m0), rec(m1), 'last month')),
      statCard('amber', 'users', 'Active suppliers', active, `${suppliers.length} registered`)];
  
    // purchases by month: ordered vs received, last 6 months
    const months = [...Array(6)].map((_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    const rows = months.map(m => { const k = mkey(m); return { label: m.toLocaleDateString('en-KE', { month: 'short' }), long: m.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }),
      a: sum(orders.filter(o => o.status !== 'CANCELLED' && mkey(o.createdAt) === k), o => o.total), b: rec(k) }; });
    const max = Math.max(1, ...rows.map(r => Math.max(r.a, r.b))) * 1.1;
    const chart = rows.some(r => r.a || r.b) ? `<div class="pu-chart" role="img" aria-label="Ordered and received value for the last 6 months"><div class="pu-plot"><div class="pu-y"><span>${kes(max)}</span><span>${kes(max / 2)}</span></div>
      <div class="pu-cols">${rows.map(r => `<div class="pu-col" title="${esc(r.long)}: ordered ${esc(fmt(r.a))}, received ${esc(fmt(r.b))}"><i class="a" style="height:${(r.a / max * 100).toFixed(1)}%"></i><i class="b" style="height:${(r.b / max * 100).toFixed(1)}%"></i></div>`).join('')}</div></div>
      <div class="pu-x">${rows.map(r => `<span>${esc(r.label)}</span>`).join('')}</div></div>
      <div class="iv-legend"><span><i style="background:var(--pu-a)"></i>Ordered <b>${fmt(sum(rows, r => r.a))}</b></span><span><i style="background:var(--pu-b)"></i>Received <b>${fmt(sum(rows, r => r.b))}</b></span></div>` : '<p class="empty">No purchases yet. Create your first purchase order.</p>';
  
    // spend by supplier (goods received)
    const by = new Map(); orders.forEach(o => o.recv && by.set(o.supplierName, (by.get(o.supplierName) || 0) + o.recv));
    const top = [...by].sort((a, b) => b[1] - a[1]), items = top.slice(0, 4).map(([label, value]) => ({ label, value })); if (top.length > 4) items.push({ label: 'Other suppliers', value: sum(top.slice(4), x => x[1]) });
  
    // ordered vs delivered
    const list = open.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 6);
    const dlv = list.length ? `<ul class="iv-list">${list.map(o => `<li><div class="nm"><b>${esc(o.number)} · ${esc(o.supplierName)}</b><small>${o.delivered} of ${o.units} units delivered${o.expectedDate ? ' · expected ' + D(o.expectedDate) : ''} ${o.late ? pill('out', 'Late') : ''}</small>
      <div class="pu-prog"><i style="width:${o.units ? Math.round(o.delivered / o.units * 100) : 0}%"></i></div></div><button type="button" data-act="receive" data-id="${o.id}">Receive</button></li>`).join('')}</ul>${open.length > 6 ? `<button type="button" class="iv-link" data-act="tab" data-id="orders">See all ${open.length} open orders</button>` : ''}`
      : '<p class="empty">Nothing is waiting for delivery.</p>';
  
    // payables ageing
    const bucket = [['Not yet due', o => o.overdue <= 0, 'ok'], ['1–30 days overdue', o => o.overdue >= 1 && o.overdue <= 30, 'low'], ['31–60 days overdue', o => o.overdue > 30 && o.overdue <= 60, 'low'], ['Over 60 days', o => o.overdue > 60, 'out']]
      .map(([label, f, tone]) => ({ label, tone, value: sum(owing.filter(f), o => o.bal) }));
    const recent = grns.slice(0, 5);
  
    $('#view').innerHTML = `<div class="rp-kpis" style="--cols:4">${cards.join('')}</div>
    <div class="iv-grid">
      <section class="card iv-panel span2" aria-labelledby="h1"><h2 id="h1">Purchases by month <small>ordered vs received</small></h2>${chart}</section>
      <section class="card iv-panel" aria-labelledby="h2"><h2 id="h2">Spend by supplier <small>goods received</small></h2>${donut(items, { big: kes(sum(items, i => i.value)), small: 'received' })}</section>
      <section class="card iv-panel span2" aria-labelledby="h3"><h2 id="h3">Ordered vs delivered <small>open orders, oldest first</small></h2>${dlv}</section>
      ${seePay ? `<section class="card iv-panel" aria-labelledby="h4"><h2 id="h4">Payables ageing <small>unpaid supplier balances</small></h2>${owed ? hbars(bucket, i => fmt(i.value)) : '<p class="empty">No unpaid balances.</p>'}<button type="button" class="iv-link" data-act="tab" data-id="payables">Open payables</button></section>` : ''}
      <section class="card iv-panel span3" aria-labelledby="h5"><h2 id="h5">Recently received <small>goods-received notes</small></h2>${recent.length ? `<ul class="iv-list">${recent.map(g => `<li><div class="nm"><b>${esc(g.number)} · ${esc(g.supplierName)}</b><small>${D(g.at)} · ${esc(g.poNumber)} · ${sum(g.items, l => l.quantity)} units${g.invoiceNo ? ' · invoice ' + esc(g.invoiceNo) : ''}</small></div><b>${fmt(g.value)}</b></li>`).join('')}</ul>` : '<p class="empty">No goods received yet.</p>'}</section>
    </div>`;
  }
  
  /* =====================================================================  PURCHASE ORDERS  */
  function vOrders() {
    $('#view').innerHTML = `<div class="card iv-panel"><div class="pu-filters">
      <label>Search<input id="fq" type="search" placeholder="Order number, supplier or reference" value="${esc(flt.q)}" autocomplete="off"></label>
      <label>Supplier<select id="fs"><option value="">All suppliers</option>${suppliers.map(s => `<option value="${s.id}" ${flt.sup === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>From<input id="ff" type="date" value="${flt.from}"></label><label>To<input id="ft" type="date" value="${flt.to}"></label></div>
      <div class="iv-chips pu-chips" id="fc" role="group" aria-label="Filter by status"></div>
      <table><thead><tr><th>Order</th><th>Supplier</th><th>Ordered</th><th>Expected</th><th>Delivered</th><th class="n">Value</th>${seePay ? '<th class="n">Balance due</th>' : ''}<th>Status</th><th></th></tr></thead><tbody id="obody"></tbody></table>
      <p class="rp-note" id="ocount" style="margin:10px 0 0"></p></div>`;
    $('#fq').oninput = e => { flt.q = e.target.value; drawOrders(); }; $('#fs').onchange = e => { flt.sup = e.target.value; drawOrders(); };
    $('#ff').onchange = e => { flt.from = e.target.value; drawOrders(); }; $('#ft').onchange = e => { flt.to = e.target.value; drawOrders(); };
    $('#fc').onclick = e => { const b = e.target.closest('[data-s]'); if (b) { flt.status = b.dataset.s; drawOrders(); } };
    drawOrders();
  }
  const orderMatch = (o, status) => status === 'all' || (status === 'unpaid' ? o.bal > 0 : o.status === status);
  function drawOrders() {
    const q = flt.q.trim().toLowerCase(), f = flt.from ? new Date(flt.from + 'T00:00:00') : null, t = flt.to ? new Date(flt.to + 'T23:59:59.999') : null;
    const base = orders.filter(o => (!flt.sup || o.supplierId === flt.sup) && (!q || [o.number, o.supplierName, o.reference].some(x => (x || '').toLowerCase().includes(q))) && (!f || new Date(o.createdAt) >= f) && (!t || new Date(o.createdAt) <= t));
    const list = curRows = base.filter(o => orderMatch(o, flt.status));
    const chips = [['all', 'All'], ['ORDERED', 'Awaiting delivery'], ['PARTIAL', 'Part received'], ['RECEIVED', 'Received'], ...(seePay ? [['unpaid', 'Unpaid']] : []), ['CANCELLED', 'Cancelled']];
    $('#fc').innerHTML = chips.map(([k, l]) => `<button type="button" data-s="${k}" class="${flt.status === k ? 'on' : ''}" aria-pressed="${flt.status === k}">${l} <small>${base.filter(o => orderMatch(o, k)).length}</small></button>`).join('');
    $('#obody').innerHTML = list.map(o => { const [tn, l] = OST[o.status] || ['', o.status], openO = o.status === 'ORDERED' || o.status === 'PARTIAL';
      return `<tr><td><b>${esc(o.number)}</b>${o.reference ? `<br><small>${esc(o.reference)}</small>` : ''}</td><td>${esc(o.supplierName)}</td><td>${D(o.createdAt)}</td><td>${o.expectedDate ? D(o.expectedDate) + (o.late ? ' ' + pill('out', 'Late') : '') : '—'}</td>
      <td>${o.status === 'CANCELLED' ? '—' : prog(o)}</td><td class="n">${fmt(o.total)}</td>${seePay ? `<td class="n ${o.bal > 0 ? 'pu-due' : ''}">${o.bal > 0 ? fmt(o.bal) : '—'}</td>` : ''}<td>${pill(tn, l)}</td>
      <td class="row"><button data-act="view" data-id="${o.id}">View</button>${openO ? `<button class="primary" data-act="receive" data-id="${o.id}">Receive</button>` : ''}${doPay && o.bal > 0 ? `<button data-act="pay" data-id="${o.id}">Pay</button>` : ''}${o.status === 'ORDERED' && !o.delivered ? `<button class="danger" data-act="cancel" data-id="${o.id}">Cancel</button>` : ''}</td></tr>`; }).join('')
      || `<tr><td colspan="${seePay ? 9 : 8}" class="empty">${orders.length ? 'No orders match.' : 'No purchase orders yet. Create the first one.'}</td></tr>`;
    $('#ocount').textContent = `${list.length} of ${orders.length} orders · total value ${fmt(sum(list.filter(o => o.status !== 'CANCELLED'), o => o.total))}`;
  }
  
  /* =====================================================================  GOODS RECEIVED  */
  function vReceiving() {
    const open = openOrders();
    $('#view').innerHTML = `<section class="card iv-panel"><h2>Awaiting delivery <small>${open.length} open order${open.length === 1 ? '' : 's'}</small></h2>${open.length ? `<ul class="iv-list">${open.map(o => `<li><div class="nm"><b>${esc(o.number)} · ${esc(o.supplierName)}</b><small>${o.delivered} of ${o.units} units · ${o.expectedDate ? 'expected ' + D(o.expectedDate) : 'no date set'} ${o.late ? pill('out', 'Late') : ''}</small></div><button type="button" class="primary" data-act="receive" data-id="${o.id}">Receive goods</button></li>`).join('')}</ul>` : '<p class="empty">Nothing is waiting for delivery.</p>'}</section>
    <div class="card iv-panel"><h2>Goods-received notes</h2><div class="pu-filters two"><label>Search<input id="gq" type="search" placeholder="GRN, order, invoice number or supplier" value="${esc(gQ)}" autocomplete="off"></label>
      <label>Supplier<select id="gs"><option value="">All suppliers</option>${suppliers.map(s => `<option value="${s.id}" ${gSup === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
      <table><thead><tr><th>Note</th><th>Received</th><th>Order</th><th>Supplier</th><th class="n">Units</th><th class="n">Value</th><th>Supplier invoice</th><th>Invoice check</th><th>By</th></tr></thead><tbody id="gbody"></tbody></table></div>`;
    $('#gq').oninput = e => { gQ = e.target.value; drawGrns(); }; $('#gs').onchange = e => { gSup = e.target.value; drawGrns(); }; drawGrns();
  }
  function drawGrns() {
    const q = gQ.trim().toLowerCase(), list = curRows = grns.filter(g => (!gSup || g.supplierId === gSup) && (!q || [g.number, g.poNumber, g.invoiceNo, g.supplierName].some(x => (x || '').toLowerCase().includes(q))));
    $('#gbody').innerHTML = list.map(g => { const diff = g.invoiceAmount - g.value;
      return `<tr><td><b>${esc(g.number)}</b></td><td>${when(g.at)}</td><td>${esc(g.poNumber)}</td><td>${esc(g.supplierName)}</td><td class="n">${sum(g.items, l => l.quantity)}</td><td class="n">${fmt(g.value)}</td>
      <td>${g.invoiceNo ? `${esc(g.invoiceNo)}<br><small>${D(g.invoiceDate)}${g.invoiceAmount ? ' · ' + fmt(g.invoiceAmount) : ''}</small>` : '<small>not recorded</small>'}</td>
      <td>${!g.invoiceAmount ? '<small>—</small>' : diff === 0 ? pill('ok', 'Matches') : pill('out', (diff > 0 ? 'Invoice +' : 'Invoice −') + fmt(Math.abs(diff)))}</td><td>${esc(g.by)}</td></tr>`; }).join('')
      || `<tr><td colspan="9" class="empty">${grns.length ? 'No notes match.' : 'No goods received yet. Receive goods from an open order.'}</td></tr>`;
  }
  
  /* =====================================================================  SUPPLIERS  */
  function vSuppliers() {
    $('#view').innerHTML = `<div class="card iv-panel"><div class="pu-filters two"><label>Search<input id="sq" type="search" placeholder="Name, contact person, phone or email" value="${esc(sQ)}" autocomplete="off"></label></div>
      <table><thead><tr><th>Supplier</th><th>Contact</th><th>Terms</th><th class="n">Orders</th><th class="n">Received</th>${seePay ? '<th class="n">Owed</th>' : ''}<th>Last order</th><th></th></tr></thead><tbody id="sbody"></tbody></table></div>`;
    $('#sq').oninput = e => { sQ = e.target.value; drawSuppliers(); }; drawSuppliers();
  }
  const termLabel = t => (TERMS.find(x => x[0] === (t ?? 30)) || [0, (t ?? 30) + ' days'])[1];
  function drawSuppliers() {
    const q = sQ.trim().toLowerCase(), list = curRows = suppliers.filter(s => !q || [s.name, s.contact, s.phone, s.email].some(x => (x || '').toLowerCase().includes(q)));
    $('#sbody').innerHTML = list.map(s => { const os = orders.filter(o => o.supplierId === s.id && o.status !== 'CANCELLED'), last = os[0], owed = sum(os, o => o.bal);
      return `<tr><td><b>${esc(s.name)}</b>${s.contact ? `<br><small>${esc(s.contact)}</small>` : ''}</td><td>${s.phone ? esc(s.phone) : '—'}${s.email ? `<br><small>${esc(s.email)}</small>` : ''}</td><td>${esc(termLabel(s.terms))}</td>
      <td class="n">${os.length}</td><td class="n">${fmt(sum(os, o => o.recv))}</td>${seePay ? `<td class="n ${owed > 0 ? 'pu-due' : ''}">${owed > 0 ? fmt(owed) : '—'}</td>` : ''}<td>${last ? D(last.createdAt) : '—'}</td>
      <td class="row"><button data-act="newpo" data-sup="${s.id}">New order</button><button data-act="stmt" data-id="${s.id}">Statement</button><button data-act="editsup" data-id="${s.id}">Edit</button></td></tr>`; }).join('')
      || `<tr><td colspan="${seePay ? 8 : 7}" class="empty">${suppliers.length ? 'No suppliers match.' : 'Add your first supplier.'}</td></tr>`;
  }
  
  /* =====================================================================  PAYABLES  */
  function vPayables() {
    const owing = orders.filter(o => o.bal > 0).sort((a, b) => a.due - b.due), owed = sum(owing, o => o.bal), od = owing.filter(o => o.overdue > 0), soon = owing.filter(o => o.overdue <= 0 && o.overdue > -8);
    const m = mkey(new Date()), paidM = sum(payments.filter(p => mkey(p.at) === m), p => p.amount);
    curRows = owing;
    $('#view').innerHTML = `<div class="rp-kpis" style="--cols:4">${statCard('red', 'alert', 'Total owed', fmt(owed), `${owing.length} unpaid order${owing.length === 1 ? '' : 's'}`)}${statCard('red', 'alert', 'Overdue', fmt(sum(od, o => o.bal)), `${od.length} order${od.length === 1 ? '' : 's'}`)}
      ${statCard('amber', 'receipt', 'Due within 7 days', fmt(sum(soon, o => o.bal)), `${soon.length} order${soon.length === 1 ? '' : 's'}`)}${statCard('green', 'dollar', 'Paid this month', fmt(paidM), `${payments.filter(p => mkey(p.at) === m).length} payments`)}</div>
    <div class="card iv-panel"><h2>Outstanding balances <small>money owed for goods already received</small></h2><table><thead><tr><th>Order</th><th>Supplier</th><th class="n">Received value</th><th class="n">Paid</th><th class="n">Balance</th><th>Due</th><th></th></tr></thead><tbody>
      ${owing.map(o => `<tr><td><b>${esc(o.number)}</b></td><td>${esc(o.supplierName)}</td><td class="n">${fmt(o.recv)}</td><td class="n">${o.paid ? fmt(o.paid) : '—'}</td><td class="n pu-due">${fmt(o.bal)}</td><td>${dueCell(o)}</td>
      <td class="row"><button data-act="view" data-id="${o.id}">View</button>${doPay ? `<button class="primary" data-act="pay" data-id="${o.id}">Pay</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No unpaid balances. All received goods are paid for.</td></tr>'}</tbody></table></div>
    <div class="card iv-panel"><h2>Payment history</h2><table><thead><tr><th>Date</th><th>Order</th><th>Supplier</th><th>Method</th><th>Reference</th><th class="n">Amount</th><th>By</th></tr></thead><tbody>
      ${payments.map(p => `<tr><td>${when(p.at)}</td><td>${esc(p.number)}</td><td>${esc(p.supplier)}</td><td>${esc(METHOD_LABEL[p.method] || p.method)}</td><td>${esc(p.reference || '—')}</td><td class="n">${fmt(p.amount)}</td><td>${esc(p.by)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No payments recorded yet.</td></tr>'}</tbody></table></div>`;
  }
  
  /* =====================================================================  EXPORTS  */
  function exportCsv() {
    const k = c => money(c);
    if (tab === 'orders') downloadCsv('purchase-orders', [['Order', 'Supplier', 'Reference', 'Ordered', 'Expected', 'Status', 'Units ordered', 'Units delivered', 'Order value (KES)', 'Received value (KES)', 'Paid (KES)', 'Balance (KES)'],
      ...curRows.map(o => [o.number, o.supplierName, o.reference || '', dkey(new Date(o.createdAt)), o.expectedDate || '', (OST[o.status] || ['', o.status])[1], o.units, o.delivered, k(o.total), k(o.recv), seePay ? k(o.paid) : '', seePay ? k(o.bal) : ''])]);
    else if (tab === 'receiving') downloadCsv('goods-received', [['Note', 'Received', 'Order', 'Supplier', 'Units', 'Value (KES)', 'Invoice no.', 'Invoice date', 'Invoice amount (KES)', 'Received by', 'Note'],
      ...curRows.map(g => [g.number, new Date(g.at).toISOString(), g.poNumber, g.supplierName, sum(g.items, l => l.quantity), k(g.value), g.invoiceNo, g.invoiceDate, g.invoiceAmount ? k(g.invoiceAmount) : '', g.by, g.note || ''])]);
    else if (tab === 'suppliers') downloadCsv('suppliers', [['Supplier', 'Contact person', 'Phone', 'Email', 'Address', 'KRA PIN', 'Payment terms', 'Orders', 'Received value (KES)', 'Owed (KES)'],
      ...curRows.map(s => { const os = orders.filter(o => o.supplierId === s.id && o.status !== 'CANCELLED'); return [s.name, s.contact || '', s.phone, s.email, s.address || '', s.pin || '', termLabel(s.terms), os.length, k(sum(os, o => o.recv)), seePay ? k(sum(os, o => o.bal)) : '']; })]);
    else if (tab === 'payables') downloadCsv('supplier-payables', [['Order', 'Supplier', 'Received value (KES)', 'Paid (KES)', 'Balance (KES)', 'Due date', 'Days overdue'], ...curRows.map(o => [o.number, o.supplierName, k(o.recv), k(o.paid), k(o.bal), dkey(o.due), Math.max(0, o.overdue)])]);
  }
  
  /* =====================================================================  DIALOGS  */
  const optionsOf = arr => arr.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  
  function editSupplier(s) {
    const d = modal(`<h2>${s.id ? 'Edit supplier' : 'Add supplier'}</h2><div class="pu-form">
      <label class="w2">Supplier name<input id="n" value="${esc(s.name)}" autofocus></label><label>Contact person<input id="c" value="${esc(s.contact)}"></label><label>Phone<input id="p" type="tel" value="${esc(s.phone)}"></label>
      <label>Email<input id="e" type="email" value="${esc(s.email)}"></label><label>KRA PIN<input id="k" value="${esc(s.pin)}" autocomplete="off"></label>
      <label class="w2">Address<input id="a" value="${esc(s.address)}"></label><label>Payment terms<select id="t">${optionsOf(TERMS)}</select></label><label>Notes<input id="o" value="${esc(s.notes)}"></label></div>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save supplier</button></div>`);
    $('#t', d).value = String(s.terms ?? 30);
    $('#ok', d).onclick = async () => { try { await API.saveSupplier({ ...s, name: $('#n', d).value, contact: $('#c', d).value, phone: $('#p', d).value, email: $('#e', d).value, pin: $('#k', d).value, address: $('#a', d).value, terms: $('#t', d).value, notes: $('#o', d).value });
      d.close(); toast('Supplier saved'); load(); } catch (e) { toast(e.message, true); } };
  }
  
  function newOrder(supId) {
    if (!suppliers.length) { toast('Add a supplier first.', true); return editSupplier({}); }
    const opts = products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    const line = `<div class="row ln" style="flex-wrap:nowrap;margin-bottom:8px"><select class="p" style="flex:2" aria-label="Product">${opts}</select><input class="q" type="number" min="1" value="1" placeholder="Qty" style="flex:1" aria-label="Quantity"><input class="c" type="number" min="0" step="0.01" placeholder="Unit cost (KES)" style="flex:1" aria-label="Unit cost KES"><button class="x" aria-label="Remove line">×</button></div>`;
    const d = modal(`<h2>New purchase order</h2><div class="pu-form"><label>Supplier<select id="sup">${suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label>Expected delivery<input id="exp" type="date" value="${dkey(addDays(new Date(), 7))}"></label><label>Supplier reference / quote no.<input id="ref" autocomplete="off"></label><label>Notes<input id="nt"></label></div>
      <div class="row sub" style="flex-wrap:nowrap;margin:0 0 6px"><span style="flex:2">Product</span><span style="flex:1">Qty</span><span style="flex:1">Unit cost (KES)</span><span style="width:34px"></span></div>
      <div id="lns"></div><div class="row"><button id="al" type="button">Add line</button><button id="low" type="button">Add low-stock items</button></div><p><b id="tot"></b></p>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Place order</button></div>`);
    d.style.width = 'min(680px,94vw)'; if (supId) $('#sup', d).value = supId;
    const cost = ln => { ln.querySelector('.c').value = (products.find(p => p.id === ln.querySelector('.p').value).cost / 100).toFixed(2); };
    const total = () => { $('#tot', d).textContent = 'Order total: ' + fmt(sum($$('.ln', d), l => (parseInt($('.q', l).value, 10) || 0) * toCents($('.c', l).value))); };
    const addLine = (pid, qty) => { $('#lns', d).insertAdjacentHTML('beforeend', line); const l = $('#lns', d).lastElementChild; if (pid) $('.p', l).value = pid; if (qty) $('.q', l).value = qty; cost(l); total(); };
    d.addEventListener('input', total);
    d.addEventListener('change', e => { if (e.target.matches('.p')) { cost(e.target.closest('.ln')); total(); } });
    d.addEventListener('click', e => { if (e.target.matches('.x')) { e.target.closest('.ln').remove(); total(); } });
    $('#al', d).onclick = () => addLine();
    $('#low', d).onclick = () => { const need = products.filter(p => p.trackStock !== false && p.stock <= p.reorder); if (!need.length) return toast('No product is at or below its reorder level.');
      const have = new Set($$('.ln .p', d).map(s => s.value)); need.filter(p => !have.has(p.id)).forEach(p => addLine(p.id, Math.max(1, p.reorder * 2 - p.stock))); };
    addLine();
    $('#ok', d).onclick = async () => { try { await API.createPurchaseOrder({ supplierId: $('#sup', d).value, expectedDate: $('#exp', d).value, reference: $('#ref', d).value, notes: $('#nt', d).value,
        items: $$('.ln', d).map(l => ({ productId: $('.p', l).value, quantity: parseInt($('.q', l).value, 10), unitCost: toCents($('.c', l).value) })) });
      d.close(); toast('Purchase order placed'); load(); } catch (e) { toast(e.message, true); } };
  }
  
  function receive(o) {
    if (!o.items.some(l => l.quantity > l.received)) return toast('Everything on this order has been received.', true);
    const d = modal(`<h2>Receive goods: ${esc(o.number)}</h2><p class="sub">${esc(o.supplierName)}. Received stock is added to inventory and the product cost is updated.</p>
      ${o.items.map((l, i) => { const left = l.quantity - l.received; return `<div class="line" style="grid-template-columns:1fr 90px"><div>${esc(l.name)}<br><small>${l.received} of ${l.quantity} delivered · ${left} still expected · ${fmt(l.unitCost)} each</small></div>
        <input type="number" min="0" max="${left}" value="${left}" data-i="${i}" ${left ? '' : 'disabled'} aria-label="Quantity received for ${esc(l.name)}"></div>`; }).join('')}
      <div class="pu-form" style="margin-top:12px"><label>Supplier invoice no.<input id="inv" autocomplete="off"></label><label>Invoice date<input id="invd" type="date" value="${dkey(new Date())}"></label>
        <label>Invoice amount (KES)<input id="inva" type="number" min="0" step="0.01"></label><label>Note<input id="note" placeholder="e.g. 2 cartons damaged"></label></div>
      <p><b id="rv"></b><br><small id="rw"></small></p><div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Receive stock</button></div>`);
    const qty = () => $$('[data-i]', d).map(i => ({ productId: o.items[i.dataset.i].productId, quantity: parseInt(i.value, 10) || 0, cost: o.items[i.dataset.i].unitCost }));
    const check = () => { const v = sum(qty(), x => x.quantity * x.cost), inv = toCents($('#inva', d).value); $('#rv', d).textContent = 'Value of this delivery: ' + fmt(v);
      $('#rw', d).textContent = inv && inv !== v ? `The invoice is ${fmt(Math.abs(inv - v))} ${inv > v ? 'higher' : 'lower'} than the order cost. Check it with the supplier.` : ''; };
    d.addEventListener('input', check); check();
    $('#ok', d).onclick = async () => { try { await API.receivePurchaseOrder(o.id, { items: qty().map(({ productId, quantity }) => ({ productId, quantity })), invoiceNo: $('#inv', d).value, invoiceDate: $('#invd', d).value, invoiceAmount: toCents($('#inva', d).value), note: $('#note', d).value });
      d.close(); toast('Stock received'); load(); } catch (e) { toast(e.message, true); } };
  }
  
  function payOrder(o) {
    const d = modal(`<h2>Pay supplier</h2><p class="sub">${esc(o.supplierName)} · ${esc(o.number)} · balance ${fmt(o.bal)}</p>
      <label>Amount (KES)<input id="am" type="number" min="0" step="0.01" value="${(o.bal / 100).toFixed(2)}" autofocus></label><label>Paid by<select id="by">${optionsOf(PAY_METHODS.map(m => [m, METHOD_LABEL[m] || m]))}</select></label>
      <label id="rf" hidden>Reference (M-Pesa code, bank or card reference)<input id="rv" autocomplete="off"></label><div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Record payment</button></div>`);
    const sync = () => $('#rf', d).hidden = $('#by', d).value === 'CASH'; $('#by', d).onchange = sync; sync();
    $('#ok', d).onclick = async () => { try { await API.paySupplier({ poId: o.id, amount: toCents($('#am', d).value), method: $('#by', d).value, reference: $('#rv', d).value }); d.close(); toast('Payment recorded'); load(); } catch (e) { toast(e.message, true); } };
  }
  
  function cancelOrder(o) {
    const d = modal(`<h2>Cancel ${esc(o.number)}?</h2><p class="sub">${esc(o.supplierName)} · ${fmt(o.total)}. Only orders with nothing received can be cancelled.</p><label>Reason (required)<input id="why" autofocus></label>
      <div class="actions"><button data-close>Keep order</button><button class="primary" id="ok">Cancel order</button></div>`);
    $('#ok', d).onclick = async () => { try { await API.cancelPurchaseOrder(o.id, $('#why', d).value); d.close(); toast('Order cancelled'); load(); } catch (e) { toast(e.message, true); } };
  }
  
  function viewOrder(o) {
    const [tn, l] = OST[o.status] || ['', o.status], notes = grns.filter(g => g.poId === o.id), pays = payments.filter(p => p.poId === o.id), openO = o.status === 'ORDERED' || o.status === 'PARTIAL';
    const d = modal(`<h2>${esc(o.number)} ${pill(tn, l)}</h2><p class="sub">${esc(o.supplierName)} · ordered ${D(o.createdAt)} by ${esc(o.by || '')}${o.expectedDate ? ' · expected ' + D(o.expectedDate) : ''}${o.reference ? ' · ref ' + esc(o.reference) : ''}</p>
      ${o.notes ? `<p>${esc(o.notes)}</p>` : ''}${o.status === 'CANCELLED' ? `<p class="rp-note">Cancelled by ${esc(o.cancelledBy || '')}: ${esc(o.cancelReason || '')}</p>` : ''}
      <table><thead><tr><th>Product</th><th class="n">Ordered</th><th class="n">Delivered</th><th class="n">Still due</th><th class="n">Unit cost</th><th class="n">Line value</th></tr></thead><tbody>
      ${o.items.map(i => `<tr><td>${esc(i.name)}</td><td class="n">${i.quantity}</td><td class="n">${i.received}</td><td class="n ${i.quantity > i.received && o.status !== 'CANCELLED' ? 'pu-due' : ''}">${o.status === 'CANCELLED' ? '—' : i.quantity - i.received}</td><td class="n">${fmt(i.unitCost)}</td><td class="n">${fmt(i.quantity * i.unitCost)}</td></tr>`).join('')}</tbody></table>
      <dl class="rp-dl" style="margin-top:12px"><div><dt>Order value</dt><dd>${fmt(o.total)}</dd></div><div><dt>Received value</dt><dd>${fmt(o.recv)}</dd></div>${seePay ? `<div><dt>Paid</dt><dd>${fmt(o.paid)}</dd></div><div><dt>Balance due</dt><dd>${fmt(o.bal)}</dd></div>` : ''}</dl>
      ${notes.length ? `<h3 style="margin:14px 0 6px;font-size:.95rem">Goods received</h3><ul class="iv-list">${notes.map(g => `<li><div class="nm"><b>${esc(g.number)} · ${D(g.at)}</b><small>${sum(g.items, x => x.quantity)} units${g.invoiceNo ? ' · invoice ' + esc(g.invoiceNo) : ''}${g.note ? ' · ' + esc(g.note) : ''}</small></div><b>${fmt(g.value)}</b></li>`).join('')}</ul>` : ''}
      ${pays.length ? `<h3 style="margin:14px 0 6px;font-size:.95rem">Payments</h3><ul class="iv-list">${pays.map(p => `<li><div class="nm"><b>${esc(METHOD_LABEL[p.method] || p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}</b><small>${when(p.at)} · ${esc(p.by)}</small></div><b>${fmt(p.amount)}</b></li>`).join('')}</ul>` : ''}
      <div class="actions"><button data-close>Close</button>${doPay && o.bal > 0 ? `<button data-act="pay" data-id="${o.id}">Record payment</button>` : ''}${openO ? `<button class="primary" data-act="receive" data-id="${o.id}">Receive goods</button>` : ''}</div>`);
    d.style.width = 'min(680px,94vw)';
  }
  
  function statement(s) {
    const os = orders.filter(o => o.supplierId === s.id && o.status !== 'CANCELLED');
    const d = modal(`<h2>${esc(s.name)}</h2><p class="sub">${[s.contact, s.phone, s.email].filter(Boolean).map(esc).join(' · ') || 'No contact details yet'}${s.address ? '<br>' + esc(s.address) : ''}${s.pin ? '<br>KRA PIN ' + esc(s.pin) : ''}<br>Payment terms: ${esc(termLabel(s.terms))}</p>
      <dl class="rp-dl"><div><dt>Orders</dt><dd>${os.length}</dd></div><div><dt>Goods received</dt><dd>${fmt(sum(os, o => o.recv))}</dd></div>${seePay ? `<div><dt>Paid</dt><dd>${fmt(sum(os, o => o.paid))}</dd></div><div><dt>Balance owed</dt><dd>${fmt(sum(os, o => o.bal))}</dd></div>` : ''}</dl>
      ${os.length ? `<table style="margin-top:12px"><thead><tr><th>Order</th><th>Date</th><th class="n">Received</th>${seePay ? '<th class="n">Balance</th>' : ''}<th>Status</th></tr></thead><tbody>${os.map(o => `<tr><td>${esc(o.number)}</td><td>${D(o.createdAt)}</td><td class="n">${fmt(o.recv)}</td>${seePay ? `<td class="n">${o.bal > 0 ? fmt(o.bal) : '—'}</td>` : ''}<td>${pill(...(OST[o.status] || ['', o.status]))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${s.notes ? `<p class="rp-note" style="margin-top:10px">${esc(s.notes)}</p>` : ''}<div class="actions"><button data-close>Close</button><button class="primary" data-act="newpo" data-sup="${s.id}">New order</button></div>`);
    d.style.width = 'min(640px,94vw)';
  }