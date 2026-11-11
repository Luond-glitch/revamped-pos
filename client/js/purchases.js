/* Module 4: Purchasing and supplier management.
   Uses helpers from app.js (esc, fmt, when, toast, modal, can, toCents) and analytics.js (statCard, dataTable, hbars, donut, downloadCsv, dkey, money, kes, pct, PALETTE). */
   const PI = { grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    compare: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    people: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' };
  const pi = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${PI[n]}</svg>`;
  const ALLTABS = [['overview', 'Dashboard', 'grid'], ['orders', 'Orders', 'cart'], ['recv', 'Goods received', 'truck'], ['cmp', 'Ordered vs delivered', 'compare'],
    ['inv', 'Invoices', 'file'], ['pay', 'Payments due', 'cash'], ['sup', 'Suppliers', 'people']];
  const METHODS = { CASH: 'Cash', MPESA: 'M-Pesa', CARD: 'Card', BANK: 'Bank transfer' };
  const OSTAT = { ORDERED: ['', 'Ordered'], PARTIAL: ['low', 'Part delivered'], RECEIVED: ['ok', 'Delivered'], CLOSED: ['low', 'Closed short'], CANCELLED: ['out', 'Cancelled'] };
  const GSTAT = { PENDING: ['low', 'Waiting'], AUTHORISED: ['ok', 'Authorised'], REJECTED: ['out', 'Rejected'] };
  const S = { sup: [], pos: [], grns: [], inv: [], fin: { supplierPayments: [] }, products: [] };
  PALETTE.splice(0, 6, '#0f6b66', '#27b5a3', '#f0a91d', '#1f5fd0', '#c62828', '#7c3aed'); // teal, like the proposal (this page only)
  let U = null, tab = 'overview', ctx = null, view = null, TABS = ALLTABS, gf = 'all', cf = 'open', canPay = false;
  
  const opts = o => Object.entries(o).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const sum = (a, f) => a.reduce((t, x) => t + f(x), 0), pill = (c, t) => `<span class="iv-pill ${c}">${t}</span>`, may = p => can(U, p), isTopRole = () => U && (U.role === 'administrator' || U.role === 'super_admin');
  const panel = (t, s, b, c = '') => `<section class="card iv-panel ${c}"><h2>${t}${s ? ` <small>${s}</small>` : ''}</h2>${b}</section>`;
  const tbl = (h, rows, tot, msg = 'Nothing to show for these filters.') => rows.length ? `<table>${dataTable(h, rows, tot)}</table>` : `<p class="empty">${msg}</p>`;
  const dl = rows => `<dl class="rp-dl">${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
  const day = iso => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const today = () => dkey(new Date()), field = (d, id) => $('#' + id, d).value.trim();
  
  /* ---------- data shaping ---------- */
  const supOf = id => S.sup.find(s => s.id === id) || { name: 'Unknown supplier', terms: 30 };
  const recvVal = o => sum(o.items, l => l.received * l.unitCost), paidOf = o => sum(S.fin.supplierPayments.filter(p => p.poId === o.id), p => p.amount);
  const invsOf = o => S.inv.filter(i => i.poId === o.id), pendOf = o => S.grns.filter(g => g.poId === o.id && g.status === 'PENDING');
  const waitQty = (o, pid) => sum(pendOf(o), g => (g.items.find(x => x.productId === pid) || {}).quantity || 0);
  const isOpen = o => o.status === 'ORDERED' || o.status === 'PARTIAL';
  const dueInfo = o => { const due = recvVal(o) - paidOf(o), ds = invsOf(o).map(i => i.dueDate).sort()[0]; return { due, ds, late: due > 0 && ds && ds < today(), invoiced: sum(invsOf(o), i => i.amount) }; };
  const lineState = (l, o) => { const w = waitQty(o, l.productId);
    if (o.status === 'CANCELLED') return ['', 'Cancelled']; if (l.received >= l.quantity) return ['ok', 'Complete'];
    if (o.status === 'CLOSED') return ['out', 'Short, closed']; if (l.received > 0) return ['low', 'Part delivered']; if (w > 0) return ['', 'Waiting for authorisation']; return ['', 'Not delivered yet']; };
  const matchPill = o => { const v = recvVal(o), inv = sum(invsOf(o), i => i.amount); if (!invsOf(o).length) return '<span class="sub">No invoice</span>'; if (!v) return pill('', 'Goods not authorised yet');
    const d = inv - v; return d === 0 ? pill('ok', 'Matches goods received') : d > 0 ? pill('out', 'Billed ' + fmt(d) + ' more') : pill('low', 'Billed ' + fmt(-d) + ' less'); };
  
  /* ---------- boot ---------- */
  boot('purchases').then(async user => {
    U = user; canPay = may('payments.view'); TABS = ALLTABS.filter(t => t[0] !== 'pay' || canPay);
    $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button type="button" role="tab" data-t="${k}">${pi(i)}<span>${l}</span></button>`).join('');
    $('#addpo').hidden = !may('purchases.manage'); setRange('all'); await reload(false);
    $('#range').onchange = e => { setRange(e.target.value); draw(); }; $('#from').onchange = $('#to').onchange = $('#supplier').onchange = draw;
    const h = location.hash.slice(1); if (TABS.some(t => t[0] === h)) tab = h;
    $('#tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; history.replaceState(null, '', '#' + tab); drawView(); } };
    addEventListener('hashchange', () => { const x = location.hash.slice(1); if (TABS.some(t => t[0] === x) && x !== tab) { tab = x; drawView(); } });
    $('#csv').onclick = () => view && downloadCsv('purchases-' + view.csv.name, view.csv.rows); $('#print').onclick = () => window.print(); $('#addpo').onclick = newOrder; $('#view').onclick = onAction;
    draw();
  });
  function setRange(p) {
    const now = new Date(); let from = new Date(2000, 0, 1);
    if (p === '30') from = new Date(now - 29 * 864e5); else if (p === '90') from = new Date(now - 89 * 864e5); else if (p === 'year') from = new Date(now.getFullYear(), 0, 1);
    $('#dates').hidden = p !== 'custom'; if (p !== 'custom') { $('#from').value = dkey(from); $('#to').value = dkey(now); }
  }
  async function reload(redraw = true) {
    try {
      const [sup, pos, grns, inv, products] = await Promise.all([API.suppliers(), API.purchaseOrders(), API.receipts(), API.invoices(), API.products()]); Object.assign(S, { sup, pos, grns, inv, products });
      if (canPay) S.fin = await API.finance();
    } catch (e) { toast(e.message, true); }
    const cur = $('#supplier').value; $('#supplier').innerHTML = '<option value="">All suppliers</option>' + S.sup.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join(''); $('#supplier').value = S.sup.some(s => s.id === cur) ? cur : '';
    if (redraw) draw();
  }
  function draw() {
    const f = $('#from').value, t = $('#to').value; if (!f || !t) return;
    const from = new Date(f + 'T00:00:00'), to = new Date(t + 'T23:59:59.999'); if (from > to) return toast('The start date is after the end date.', true);
    const sid = $('#supplier').value, within = iso => { const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d >= from && d <= to; }, mine = x => !sid || x.supplierId === sid;
    const O = S.pos.filter(o => mine(o) && within(o.createdAt)), G = S.grns.filter(g => mine(g) && within(g.at)), I = S.inv.filter(i => mine(i) && within(i.date));
    const allO = S.pos.filter(mine); ctx = { from, to, sid, within, mine, O, G, I, allO };
    const open = allO.filter(isOpen), openVal = sum(open, o => sum(o.items, l => (l.quantity - l.received) * l.unitCost)), wait = S.grns.filter(g => mine(g) && g.status === 'PENDING');
    const real = O.filter(o => o.status !== 'CANCELLED'), ordQ = sum(real, o => sum(o.items, l => l.quantity)), delQ = sum(real, o => sum(o.items, l => l.received)), owed = sum(allO.map(dueInfo), x => x.due), late = allO.map(dueInfo).filter(x => x.late);
    $('#stats').innerHTML = [
      statCard('blue', 'box', 'Open orders', String(open.length), fmt(openVal) + ' still to receive'),
      statCard('amber', 'alert', 'Waiting for authorisation', String(wait.length), fmt(sum(wait, g => g.value)) + ' of goods'),
      canPay ? statCard('red', 'dollar', 'Owed to suppliers', fmt(owed), late.length ? late.length + ' past the due date' : 'nothing overdue') : statCard('red', 'dollar', 'Invoiced', fmt(sum(I, i => i.amount)), I.length + ' invoices'),
      statCard('green', 'trend', 'Delivered vs ordered', pct(delQ, ordQ) + '%', delQ + ' of ' + ordQ + ' units'),
    ].join('');
    $('#pmeta').textContent = f + ' to ' + t + (sid ? ' · ' + supOf(sid).name : '') + ' · printed ' + when(new Date().toISOString()); drawView();
  }
  function drawView() {
    if (!ctx) return; $$('#tabs button').forEach(b => { const on = b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#ptitle').textContent = TABS.find(t => t[0] === tab)[1]; view = VIEWS[tab](); $('#view').innerHTML = view.html;
  }
  
  /* ---------- actions ---------- */
  async function onAction(e) {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id;
    try {
      if (a === 'po') return newOrder(); if (a === 'addsup') return editSupplier({}); if (a === 'editsup') return editSupplier(S.sup.find(s => s.id === id)); if (a === 'recv') return receive(S.pos.find(o => o.id === id));
      if (a === 'view') return showOrder(S.pos.find(o => o.id === id)); if (a === 'cancel') return reasonDialog('Cancel ' + S.pos.find(o => o.id === id).number, 'Why is it cancelled?', 'Cancel order', r => API.cancelPurchaseOrder(id, r), 'Order cancelled');
      if (a === 'close') return reasonDialog('Close ' + S.pos.find(o => o.id === id).number + ' short', 'The supplier will not deliver the rest. Why?', 'Close order', r => API.closePurchaseOrder(id, r), 'Order closed');
      if (a === 'inv') return recordInvoice(id); if (a === 'pay') return paySupplier(id); if (a === 'gf') { gf = b.dataset.v; return drawView(); } if (a === 'cf') { cf = b.dataset.v; return drawView(); }
      if (a === 'ok') { await API.authoriseReceipt(id, 'AUTHORISED'); toast('Goods authorised. Stock updated.'); return reload(); }
      if (a === 'no') return reasonDialog('Reject ' + S.grns.find(g => g.id === id).number, 'Why are the goods rejected (damaged, wrong items…)?', 'Reject goods', r => API.authoriseReceipt(id, 'REJECTED', r), 'Goods rejected');
    } catch (err) { toast(err.message, true); }
  }
  function reasonDialog(title, ask, btn, run, done) {
    const d = modal(`<h2>${esc(title)}</h2><label>${esc(ask)}<input id="rs" autofocus autocomplete="off"></label><div class="actions"><button data-close>Back</button><button class="danger" id="ok">${esc(btn)}</button></div>`);
    $('#ok', d).onclick = async () => { try { await run(field(d, 'rs')); d.close(); toast(done); reload(); } catch (e) { toast(e.message, true); } };
  }
  function editSupplier(s) {
    const d = modal(`<h2>${s.id ? 'Edit supplier' : 'Add supplier'}</h2><label>Business name<input id="n" value="${esc(s.name)}" autofocus></label><label>Contact person<input id="c" value="${esc(s.contact)}"></label>
      <div class="row"><label class="grow">Phone<input id="p" type="tel" value="${esc(s.phone)}"></label><label class="grow">Email<input id="e" type="email" value="${esc(s.email)}"></label></div>
      <label>Address<input id="a" value="${esc(s.address)}"></label><div class="row"><label class="grow">KRA PIN<input id="k" value="${esc(s.pin)}" autocomplete="off"></label><label class="grow">Payment terms (days)<input id="t" type="number" min="0" max="365" value="${s.terms ?? 30}"></label></div>
      ${s.id ? `<label class="fn-radio"><input type="checkbox" id="st" ${s.status === 'inactive' ? '' : 'checked'}><span><b>Active supplier</b><small>Switched-off suppliers cannot be ordered from. Their history stays.</small></span></label>` : ''}
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save supplier</button></div>`);
    $('#ok', d).onclick = async () => { try { await API.saveSupplier({ ...s, name: field(d, 'n'), contact: field(d, 'c'), phone: field(d, 'p'), email: field(d, 'e'), address: field(d, 'a'), pin: field(d, 'k'), terms: field(d, 't'), status: s.id && !$('#st', d).checked ? 'inactive' : 'active' }); d.close(); toast('Supplier saved'); reload(); } catch (e) { toast(e.message, true); } };
  }
  function newOrder() {
    const act = S.sup.filter(s => s.status !== 'inactive'); if (!act.length) return toast('Add a supplier first.', true);
    const opts2 = S.products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    const line = `<div class="pu-ln ln"><select class="p" aria-label="Product">${opts2}</select><input class="q" type="number" min="1" step="1" value="1" placeholder="Qty" aria-label="Quantity"><input class="c" type="number" min="0" step="0.01" placeholder="Unit cost (KES)" aria-label="Unit cost KES"><button type="button" class="x" aria-label="Remove line">×</button></div>`;
    const d = modal(`<h2>New purchase order</h2><div class="row"><label class="grow">Supplier<select id="sup">${act.map(s => `<option value="${s.id}"${s.id === ctx.sid ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="grow">Expected delivery<input id="ex" type="date" min="${today()}"></label></div>
      <div class="pu-ln pu-head sub"><span>Product</span><span>Qty</span><span>Unit cost (KES)</span><span></span></div><div id="lns"></div><button type="button" id="al">Add line</button>
      <label style="margin-top:12px">Note for the supplier (optional)<input id="nt" autocomplete="off"></label><p><b id="tot"></b></p><div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Place order</button></div>`);
    d.style.width = 'min(660px,94vw)';
    const cost = ln => { ln.querySelector('.c').value = (S.products.find(p => p.id === ln.querySelector('.p').value).cost / 100).toFixed(2); };
    const total = () => { $('#tot', d).textContent = 'Order total: ' + fmt($$('.ln', d).reduce((t, l) => t + (parseInt($('.q', l).value, 10) || 0) * toCents($('.c', l).value), 0)); };
    const add = () => { $('#lns', d).insertAdjacentHTML('beforeend', line); cost($('#lns', d).lastElementChild); total(); };
    d.addEventListener('input', total); d.addEventListener('change', e => { if (e.target.matches('.p')) { cost(e.target.closest('.ln')); total(); } });
    d.addEventListener('click', e => { if (e.target.matches('.x')) { if ($$('.ln', d).length > 1) e.target.closest('.ln').remove(); total(); } });
    $('#al', d).onclick = add; add();
    $('#ok', d).onclick = async () => { try { await API.createPurchaseOrder({ supplierId: $('#sup', d).value, expected: $('#ex', d).value, note: field(d, 'nt'),
        items: $$('.ln', d).map(l => ({ productId: $('.p', l).value, quantity: +$('.q', l).value, unitCost: toCents($('.c', l).value) })) }); d.close(); toast('Purchase order placed'); reload(); } catch (e) { toast(e.message, true); } };
  }
  function receive(o) {
    const d = modal(`<h2>Record goods received: ${esc(o.number)}</h2><p class="sub">${esc(o.supplierName)}. Count what actually arrived. Stock is added only after a manager authorises this record.</p>
      <div class="pu-rl pu-head sub"><span>Product</span><span>Still expected</span><span>Delivered now</span></div>
      ${o.items.map((l, i) => { const left = l.quantity - l.received - waitQty(o, l.productId); return `<div class="pu-rl"><span>${esc(l.name)}<small>ordered ${l.quantity} · ${fmt(l.unitCost)} each</small></span><span>${left}</span>
        <input type="number" min="0" max="${left}" step="1" value="${left}" data-i="${i}" ${left ? '' : 'disabled'} aria-label="Delivered now: ${esc(l.name)}"></div>`; }).join('')}
      <div class="row"><label class="grow">Supplier delivery note no.<input id="dn" autocomplete="off"></label><label class="grow">Note (damage, shortage…)<input id="nt" autocomplete="off"></label></div>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save goods received</button></div>`);
    d.style.width = 'min(620px,94vw)';
    $('#ok', d).onclick = async () => { try { await API.receivePurchaseOrder(o.id, { deliveryNote: field(d, 'dn'), note: field(d, 'nt'), items: $$('[data-i]', d).map(i => ({ productId: o.items[i.dataset.i].productId, quantity: parseInt(i.value, 10) || 0 })) });
      d.close(); toast(may('purchases.approve') ? 'Recorded. Authorise it under Goods received.' : 'Recorded. A manager must authorise it before stock changes.'); reload(); } catch (e) { toast(e.message, true); } };
  }
  function recordInvoice(poId) {
    const list = S.pos.filter(o => o.status !== 'CANCELLED' && (!ctx.sid || o.supplierId === ctx.sid)); if (!list.length) return toast('There are no orders to invoice yet.', true);
    const d = modal(`<h2>Record supplier invoice</h2><label>Purchase order<select id="po">${list.map(o => `<option value="${o.id}"${o.id === poId ? ' selected' : ''}>${esc(o.number)} · ${esc(o.supplierName)} · ${fmt(o.total)}</option>`).join('')}</select></label>
      <div class="row"><label class="grow">Supplier's invoice number<input id="no" autocomplete="off" autofocus></label><label class="grow">Invoice date<input id="dt" type="date" value="${today()}" max="${today()}"></label></div>
      <div class="row"><label class="grow">Invoice total (KES)<input id="am" type="number" min="0" step="0.01"></label><label class="grow">VAT included (KES)<input id="vt" type="number" min="0" step="0.01" value="0"></label></div>
      <label>Due date (blank = supplier's payment terms)<input id="du" type="date"></label><label>Note (optional)<input id="nt" autocomplete="off"></label><p class="sub" id="hint"></p>
      <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save invoice</button></div>`);
    const hint = () => { const o = S.pos.find(x => x.id === $('#po', d).value), v = recvVal(o), am = toCents($('#am', d).value), dif = am - v;
      $('#hint', d).textContent = 'Goods received and authorised on this order: ' + fmt(v) + (am ? (dif === 0 ? '. The invoice matches.' : dif > 0 ? '. The invoice is ' + fmt(dif) + ' more than the goods received.' : '. The invoice is ' + fmt(-dif) + ' less than the goods received.') : '.'); };
    d.addEventListener('input', hint); hint();
    $('#ok', d).onclick = async () => { try { await API.saveInvoice({ poId: $('#po', d).value, number: field(d, 'no'), date: $('#dt', d).value, dueDate: $('#du', d).value, amount: toCents($('#am', d).value), vat: toCents($('#vt', d).value), note: field(d, 'nt') }); d.close(); toast('Invoice recorded'); reload(); } catch (e) { toast(e.message, true); } };
  }
  function paySupplier(id) {
    const o = S.pos.find(x => x.id === id), due = recvVal(o) - paidOf(o); if (!o) return;
    const d = modal(`<h2>Pay ${esc(o.supplierName)}</h2><p class="sub">${esc(o.number)} · balance due ${fmt(due)}</p><label>Amount (KES)<input id="am" type="number" min="0" step="0.01" value="${(due / 100).toFixed(2)}" autofocus></label>
      <label>Paid by<select id="mt">${opts(METHODS)}</select></label><label>Reference (needed unless cash)<input id="rf" autocomplete="off"></label><div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Record payment</button></div>`);
    $('#ok', d).onclick = async () => { try { await API.paySupplier({ poId: id, amount: toCents($('#am', d).value), method: field(d, 'mt'), reference: field(d, 'rf') }); d.close(); toast('Payment recorded'); reload(); } catch (e) { toast(e.message, true); } };
  }
  function showOrder(o) {
    if (!o) return; const di = dueInfo(o), gs = S.grns.filter(g => g.poId === o.id), pays = S.fin.supplierPayments.filter(p => p.poId === o.id), st = OSTAT[o.status];
    const d = modal(`<h2>${esc(o.number)} <span class="iv-pill ${st[0]}">${st[1]}</span></h2><p class="sub">${esc(o.supplierName)} · ordered ${esc(when(o.createdAt))} by ${esc(o.by)}${o.expected ? ' · expected ' + esc(day(o.expected)) : ''}${o.note ? '<br>Note: ' + esc(o.note) : ''}${o.closedReason ? '<br>' + (o.status === 'CANCELLED' ? 'Cancelled' : 'Closed short') + ' by ' + esc(o.closedBy) + ': ' + esc(o.closedReason) : ''}</p>
      ${tbl(['Product', 'Ordered', 'Delivered', 'Waiting', 'Outstanding', 'Unit cost'], o.items.map(l => { const w = waitQty(o, l.productId); return [esc(l.name), l.quantity, l.received, w || '—', o.status === 'CLOSED' || o.status === 'CANCELLED' ? '—' : l.quantity - l.received - w, fmt(l.unitCost)]; }), ['Order total', '', '', '', '', fmt(o.total)])}
      <h3 class="pu-h3">Goods received</h3>${gs.length ? `<ul class="iv-list">${gs.map(g => `<li><div class="nm"><b>${esc(g.number)} · ${fmt(g.value)}</b><small>${esc(when(g.at))} by ${esc(g.by)}${g.deliveryNote ? ' · note ' + esc(g.deliveryNote) : ''}${g.decision ? ' · ' + esc(g.decision) : ''}</small></div>${pill(...GSTAT[g.status])}</li>`).join('')}</ul>` : '<p class="sub">Nothing recorded yet.</p>'}
      <h3 class="pu-h3">Money</h3>${dl([['Received value (authorised goods)', fmt(recvVal(o))], ['Invoiced by supplier', fmt(di.invoiced) + ' ' + (invsOf(o).length ? '' : '')], ['Invoice check', matchPill(o)], ...(canPay ? [['Paid so far', fmt(paidOf(o))], ['<b>Balance due</b>', `<b>${fmt(di.due)}</b>`]] : [])])}
      ${invsOf(o).length ? `<ul class="iv-list">${invsOf(o).map(i => `<li><div class="nm"><b>Invoice ${esc(i.number)} · ${fmt(i.amount)}</b><small>${esc(day(i.date))}, due ${esc(day(i.dueDate))}</small></div></li>`).join('')}</ul>` : ''}
      ${pays.length ? `<ul class="iv-list">${pays.map(p => `<li><div class="nm"><b>Paid ${fmt(p.amount)}</b><small>${esc(METHODS[p.method] || p.method)}${p.reference ? ' · ' + esc(p.reference) : ''} · ${esc(when(p.at))}</small></div></li>`).join('')}</ul>` : ''}
      <div class="actions"><button data-close>Close</button></div>`);
    d.style.width = 'min(680px,94vw)';
  }
  
  /* ---------- views ---------- */
  const spark = rows => { // columns for the last 6 months of authorised goods (teal bars)
    const now = new Date(), b = []; for (let k = 5; k >= 0; k--) { const m0 = new Date(now.getFullYear(), now.getMonth() - k, 1), m1 = new Date(now.getFullYear(), now.getMonth() - k + 1, 1);
      b.push({ label: m0.toLocaleDateString('en-KE', { month: 'short' }), long: m0.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }), v: sum(rows.filter(g => { const d = new Date(g.decidedAt); return d >= m0 && d < m1; }), g => g.value) }); }
    if (!b.some(x => x.v)) return '<p class="empty">No goods have been authorised in the last 6 months.</p>';
    const max = Math.max(1, ...b.map(x => x.v)) * 1.1;
    return `<div class="rp-scroll"><div class="rp-chart" style="min-width:${b.length * 46}px" role="img" aria-label="Purchases by month, total ${esc(fmt(sum(b, x => x.v)))}"><div class="rp-plot"><div class="rp-y"><span>${kes(max)}</span><span>${kes(max / 2)}</span></div>
      <div class="rp-bars">${b.map(x => `<div class="rp-col" title="${esc(x.long)}: ${esc(fmt(x.v))}"><i style="height:${(x.v / max * 100).toFixed(1)}%;min-height:${x.v > 0 ? 3 : 0}px"></i></div>`).join('')}</div></div>
      <div class="rp-x" style="grid-template-columns:repeat(${b.length},1fr)">${b.map(x => `<span>${esc(x.label)}</span>`).join('')}</div></div></div><div class="iv-legend"><span><i style="background:var(--pu)"></i>Authorised goods</span><span>Amounts in KES</span></div>`;
  };
  const orderActions = o => [`<button data-a="view" data-id="${o.id}">View</button>`, isOpen(o) && may('purchases.manage') ? `<button class="primary" data-a="recv" data-id="${o.id}">Receive</button>` : ''].join(' ');
  const ordRow = o => { const st = OSTAT[o.status], late = isOpen(o) && o.expected && o.expected < today(); return [`<b>${esc(o.number)}</b>`, esc(o.supplierName), day(o.createdAt), o.expected ? esc(day(o.expected)) + (late ? ' ' + pill('out', 'Late') : '') : '—', pill(...st), fmt(o.total), fmt(recvVal(o)), orderActions(o)]; };
  const ordHead = ['Order', 'Supplier', 'Ordered', 'Expected', 'Status', 'Order value', 'Received value', ''];
  
  function vOverview() {
    const real = ctx.O.filter(o => o.status !== 'CANCELLED'), auth = S.grns.filter(g => ctx.mine(g) && g.status === 'AUTHORISED'), inR = auth.filter(g => ctx.within(g.decidedAt));
    const by = new Map(); inR.forEach(g => by.set(g.supplierName, (by.get(g.supplierName) || 0) + g.value));
    const spend = [...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value], i) => ({ label, value, tone: ['', 'ok', 'low', ''][i % 4] }));
    const lines = real.flatMap(o => o.items.map(l => lineState(l, o)[1])), cnt = k => lines.filter(x => x === k).length;
    const dv = [['Complete', cnt('Complete')], ['Part delivered', cnt('Part delivered')], ['Waiting for authorisation', cnt('Waiting for authorisation')], ['Not delivered yet', cnt('Not delivered yet')], ['Short, closed', cnt('Short, closed')]].filter(x => x[1]).map(([label, value]) => ({ label, value }));
    const ow = new Map(); ctx.allO.forEach(o => { const x = dueInfo(o); if (x.due > 0) ow.set(o.supplierName, (ow.get(o.supplierName) || 0) + x.due); });
    const owItems = [...ow].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), wait = S.grns.filter(g => ctx.mine(g) && g.status === 'PENDING'), late = ctx.allO.filter(o => isOpen(o) && o.expected && o.expected < today());
    const canOk = g => may('purchases.approve') && (g.byId !== U.id || isTopRole());
    const attn = [...wait.map(g => `<li><div class="nm"><b>${esc(g.number)} · ${esc(g.supplierName)}</b><small>${fmt(g.value)} recorded ${esc(when(g.at))} by ${esc(g.by)}</small></div>${canOk(g) ? `<span class="pu-btns"><button class="primary" data-a="ok" data-id="${g.id}">Authorise</button></span>` : pill('low', 'Waiting')}</li>`),
      ...late.map(o => `<li><div class="nm"><b>${esc(o.number)} · ${esc(o.supplierName)}</b><small>Expected ${esc(day(o.expected))}, not fully delivered</small></div>${pill('out', 'Late')}</li>`)];
    return { csv: { name: 'overview', rows: [['Supplier', 'Authorised goods in period (KES)'], ...[...by].map(([n, v]) => [n, money(v)]), [], ['Open orders', ctx.allO.filter(isOpen).length], ['Waiting for authorisation', wait.length]] },
      html: `<div class="iv-grid rp-dense">${panel('Purchases by month', 'authorised goods, last 6 months', spark(auth), 'span2')}
        ${panel('Needs attention', attn.length + (attn.length === 1 ? ' item' : ' items'), attn.length ? `<ul class="iv-list">${attn.slice(0, 6).join('')}</ul>` : '<p class="empty">Nothing is waiting.</p>')}
        ${panel('Spend by supplier', 'authorised goods in these dates', spend.length ? hbars(spend, i => fmt(i.value)) : '<p class="empty">No goods authorised in these dates.</p>')}
        ${panel('Delivery performance', 'order lines in these dates', dv.length ? donut(dv, { big: String(lines.length), small: 'lines' }, v => String(v)) : '<p class="empty">No orders in these dates.</p>')}
        ${canPay ? panel('Outstanding payments', 'owed to suppliers', owItems.length ? donut(owItems.slice(0, 5), { big: 'KES ' + kes(sum(owItems, x => x.value)), small: 'to pay' }) : '<p class="empty">Nothing is owed.</p>') : panel('Latest invoices', '', ctx.I.length ? `<ul class="iv-list">${ctx.I.slice(0, 5).map(i => `<li><div class="nm"><b>${esc(i.supplierName)}</b><small>${esc(i.number)} · ${esc(day(i.date))}</small></div><b class="rp-amt">${fmt(i.amount)}</b></li>`).join('')}</ul>` : '<p class="empty">No invoices yet.</p>')}
        ${panel('Latest purchase orders', 'newest 6', tbl(ordHead, ctx.O.slice(0, 6).map(ordRow), null, 'No purchase orders in these dates.'), 'span3')}</div>` };
  }
  function vOrders() {
    const F = { open: ['Open', o => isOpen(o)], all: ['All', () => true], done: ['Delivered', o => o.status === 'RECEIVED'], end: ['Closed or cancelled', o => o.status === 'CLOSED' || o.status === 'CANCELLED'] }, list = ctx.O.filter(F[cf][1]);
    return { csv: { name: 'orders', rows: [['Order', 'Supplier', 'Ordered', 'Expected', 'Status', 'Order value (KES)', 'Received value (KES)', 'Raised by'], ...list.map(o => [o.number, o.supplierName, o.createdAt.slice(0, 10), o.expected || '', OSTAT[o.status][1], money(o.total), money(recvVal(o)), o.by])] },
      html: panel('Purchase orders', list.length + ' shown', `<div class="pm-bar rp-noprint"><div class="iv-chips grow">${Object.entries(F).map(([k, [l, f]]) => `<button type="button" data-a="cf" data-v="${k}" class="${k === cf ? 'on' : ''}">${l} <small>${ctx.O.filter(f).length}</small></button>`).join('')}</div></div>`
        + tbl(ordHead, list.map(o => { const r = ordRow(o); r[7] = r[7] + (may('purchases.manage') && o.status === 'ORDERED' ? ` <button class="danger" data-a="cancel" data-id="${o.id}">Cancel</button>` : '') + (may('purchases.approve') && o.status === 'PARTIAL' ? ` <button data-a="close" data-id="${o.id}">Close short</button>` : ''); return r; }),
          ['Total', '', '', '', '', fmt(sum(list, o => o.total)), fmt(sum(list, recvVal)), ''], 'No purchase orders match.')) };
  }
  function vRecv() {
    const F = { all: ['All', () => true], PENDING: ['Waiting', g => g.status === 'PENDING'], AUTHORISED: ['Authorised', g => g.status === 'AUTHORISED'], REJECTED: ['Rejected', g => g.status === 'REJECTED'] }, list = ctx.G.filter(F[gf][1]);
    const canOk = g => may('purchases.approve') && (g.byId !== U.id || isTopRole());
    return { csv: { name: 'goods-received', rows: [['Record', 'Order', 'Supplier', 'Delivery note', 'Recorded', 'Recorded by', 'Value (KES)', 'Status', 'Decided by', 'Decision note'], ...list.map(g => [g.number, g.poNumber, g.supplierName, g.deliveryNote, g.at.slice(0, 10), g.by, money(g.value), GSTAT[g.status][1], g.decidedBy || '', g.decision || ''])] },
      html: panel('Goods-received records', list.length + ' shown. Stock changes only when a record is authorised.', `<div class="iv-chips rp-noprint" style="margin-bottom:12px">${Object.entries(F).map(([k, [l, f]]) => `<button type="button" data-a="gf" data-v="${k}" class="${k === gf ? 'on' : ''}">${l} <small>${ctx.G.filter(f).length}</small></button>`).join('')}</div>`
        + tbl(['Record', 'Supplier', 'Recorded', 'Items', 'Value', 'Status', ''], list.map(g => [`<b>${esc(g.number)}</b><br><small>${esc(g.poNumber)}</small>`, esc(g.supplierName) + (g.deliveryNote ? `<br><small>Delivery note ${esc(g.deliveryNote)}</small>` : ''), esc(when(g.at)) + `<br><small>by ${esc(g.by)}</small>`,
          g.items.map(i => esc(i.name) + ' × ' + i.quantity).join('<br>') + (g.note ? `<br><small>${esc(g.note)}</small>` : ''), fmt(g.value), pill(...GSTAT[g.status]) + (g.status !== 'PENDING' ? `<br><small>${esc(g.decidedBy)}${g.decision ? ': ' + esc(g.decision) : ''}</small>` : ''),
          g.status === 'PENDING' ? (canOk(g) ? `<button class="primary" data-a="ok" data-id="${g.id}">Authorise</button> <button class="danger" data-a="no" data-id="${g.id}">Reject</button>` : '<small>Someone else must authorise</small>') : '']),
          ['Total', '', '', '', fmt(sum(list, g => g.value)), '', ''], 'No goods-received records yet. Use "Receive" on an order.')) };
  }
  function vCmp() {
    const rows = ctx.O.filter(o => o.status !== 'CANCELLED').flatMap(o => o.items.map(l => ({ o, l, w: waitQty(o, l.productId), st: lineState(l, o) }))), ord = sum(rows, r => r.l.quantity), del = sum(rows, r => r.l.received), sd = new Map();
    rows.forEach(r => { const x = sd.get(r.o.supplierName) || { n: new Set(), q: 0, d: 0 }; x.n.add(r.o.id); x.q += r.l.quantity; x.d += r.l.received; sd.set(r.o.supplierName, x); });
    const sup = [...sd].map(([n, x]) => ({ label: n, value: pct(x.d, x.q), tone: pct(x.d, x.q) >= 95 ? 'ok' : pct(x.d, x.q) >= 70 ? 'low' : 'out' })), short = rows.filter(r => r.l.received < r.l.quantity && (r.o.status === 'CLOSED'));
    return { csv: { name: 'ordered-vs-delivered', rows: [['Order', 'Supplier', 'Product', 'Ordered', 'Delivered', 'Waiting authorisation', 'Difference', 'Status'], ...rows.map(r => [r.o.number, r.o.supplierName, r.l.name, r.l.quantity, r.l.received, r.w, r.l.received - r.l.quantity, r.st[1]])] },
      html: `<div class="iv-grid rp-dense">${panel('Delivery rate by supplier', 'units delivered of units ordered', sup.length ? hbars(sup, i => i.value + '%') : '<p class="empty">No orders in these dates.</p>')}
        ${panel('Summary', 'orders in these dates', dl([['Units ordered', String(ord)], ['Units delivered (authorised)', String(del)], ['Still to arrive or waiting', String(ord - del - short.reduce((t, r) => t + r.l.quantity - r.l.received, 0))], ['Short on closed orders', String(short.reduce((t, r) => t + r.l.quantity - r.l.received, 0))], ['<b>Delivery rate</b>', `<b>${pct(del, ord)}%</b>`]]))}
        ${panel('Ordered quantity against delivered quantity', 'only authorised goods count as delivered', tbl(['Order', 'Supplier', 'Product', 'Ordered', 'Delivered', 'Waiting', 'Difference', 'Status'],
          rows.map(r => { const dif = r.l.received - r.l.quantity; return [`<b>${esc(r.o.number)}</b>`, esc(r.o.supplierName), esc(r.l.name), r.l.quantity, r.l.received, r.w || '—', dif === 0 ? '0' : `<span class="${dif < 0 ? 'pm-out' : 'pm-in'}">${dif}</span>`, pill(...r.st)]; }),
          ['Total', '', '', ord, del, '', del - ord, ''], 'No orders in these dates.'), 'span3')}</div>` };
  }
  function vInv() {
    const list = ctx.I, mg = may('purchases.manage');
    return { csv: { name: 'supplier-invoices', rows: [['Reference', 'Supplier invoice no.', 'Supplier', 'Order', 'Invoice date', 'Due date', 'Total (KES)', 'VAT (KES)', 'Received value (KES)', 'Check', 'Recorded by'], ...list.map(i => { const o = S.pos.find(x => x.id === i.poId); return [i.ref, i.number, i.supplierName, i.poNumber, i.date, i.dueDate, money(i.amount), money(i.vat), o ? money(recvVal(o)) : '', o ? (matchPill(o).replace(/<[^>]+>/g, '')) : '', i.by]; })] },
      html: panel('Supplier invoices', list.length + ' in these dates. Each is checked against the goods you authorised.', `<div class="pm-bar rp-noprint"><span class="grow sub" style="margin:0">Purchase cost comes from the order lines; invoices are what the supplier says you owe.</span>${mg ? '<button type="button" class="primary" data-a="inv">Record invoice</button>' : ''}</div>`
        + tbl(['Invoice', 'Supplier', 'Order', 'Date', 'Due', 'Total', 'VAT', 'Check'], list.map(i => { const o = S.pos.find(x => x.id === i.poId); return [`<b>${esc(i.number)}</b><br><small>${esc(i.ref)}</small>`, esc(i.supplierName), esc(i.poNumber), esc(day(i.date)), esc(day(i.dueDate)) + (o && dueInfo(o).late ? ' ' + pill('out', 'Overdue') : ''), fmt(i.amount), fmt(i.vat), o ? matchPill(o) : '']; }),
          ['Total', '', '', '', '', fmt(sum(list, i => i.amount)), fmt(sum(list, i => i.vat)), ''], 'No supplier invoices recorded in these dates.')) };
  }
  function vPay() {
    const rows = ctx.allO.map(o => ({ o, recv: recvVal(o), paid: paidOf(o), ...dueInfo(o) })).filter(x => x.recv || x.paid || x.invoiced), due = sum(rows, x => x.due), mg = may('payments.manage'), pays = S.fin.supplierPayments.filter(p => !ctx.sid || (S.pos.find(o => o.id === p.poId) || {}).supplierId === ctx.sid).slice(0, 6);
    const by = new Map(); rows.forEach(x => { if (x.due > 0) by.set(x.o.supplierName, (by.get(x.o.supplierName) || 0) + x.due); }); const items = [...by].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    return { csv: { name: 'supplier-balances', rows: [['Order', 'Supplier', 'Received value (KES)', 'Invoiced (KES)', 'Paid (KES)', 'Balance due (KES)', 'Due date', 'Status'], ...rows.map(x => [x.o.number, x.o.supplierName, money(x.recv), money(x.invoiced), money(x.paid), money(x.due), x.ds || '', x.due <= 0 ? 'Settled' : x.late ? 'Overdue' : 'Open'])] },
      html: `<p class="rp-note">Balances are always up to date: the date filter does not change them. Money owed is the value of goods you have authorised, less payments.</p>
        <div class="iv-grid">${panel('Owed by supplier', fmt(due) + ' in total', items.length ? hbars(items, i => fmt(i.value)) : '<p class="empty">No supplier balances.</p>', 'span2')}
        ${panel('Latest payments', 'to suppliers', pays.length ? `<ul class="iv-list">${pays.map(p => `<li><div class="nm"><b>${esc(p.supplier)}</b><small>${esc(p.number)} · ${esc(METHODS[p.method] || p.method)} · ${esc(when(p.at))}</small></div><b class="rp-amt">${fmt(p.amount)}</b></li>`).join('')}</ul>` : '<p class="empty">No payments yet.</p>')}</div>
        ${panel('Outstanding supplier payments', rows.length + ' orders', tbl(['Order', 'Supplier', 'Received value', 'Invoiced', 'Paid', 'Balance due', 'Due date', ''], rows.map(x => [`<b>${esc(x.o.number)}</b>`, esc(x.o.supplierName), fmt(x.recv), fmt(x.invoiced), fmt(x.paid),
          x.due > 0 ? `<b>${fmt(x.due)}</b>` : pill('ok', 'Settled'), x.ds ? esc(day(x.ds)) + (x.late ? ' ' + pill('out', 'Overdue') : '') : '—', x.due > 0 && mg ? `<button class="primary" data-a="pay" data-id="${x.o.id}">Pay</button>` : '']),
          ['Total', '', fmt(sum(rows, x => x.recv)), fmt(sum(rows, x => x.invoiced)), fmt(sum(rows, x => x.paid)), fmt(due), '', ''], 'No supplier balances yet. Authorise goods received first.'))}` };
  }
  function vSup() {
    const list = S.sup.filter(s => !ctx.sid || s.id === ctx.sid), mg = may('purchases.manage'), owes = s => sum(S.pos.filter(o => o.supplierId === s.id).map(dueInfo), x => x.due);
    return { csv: { name: 'suppliers', rows: [['Name', 'Contact person', 'Phone', 'Email', 'Address', 'KRA PIN', 'Payment terms (days)', 'Status', 'Open orders', 'Owed (KES)'], ...list.map(s => [s.name, s.contact || '', s.phone || '', s.email || '', s.address || '', s.pin || '', s.terms ?? 30, s.status === 'inactive' ? 'Switched off' : 'Active', S.pos.filter(o => o.supplierId === s.id && isOpen(o)).length, money(owes(s))])] },
      html: panel('Suppliers', list.length + ' registered', `<div class="pm-bar rp-noprint"><span class="grow sub" style="margin:0">Contact details, tax PIN and payment terms for each supplier.</span>${mg ? '<button type="button" class="primary" data-a="addsup">Add supplier</button>' : ''}</div>`
        + tbl(['Supplier', 'Contact', 'Phone', 'Email', 'Terms', 'Open orders', 'Owed', 'Status', ''], list.map(s => [`<b>${esc(s.name)}</b>${s.pin ? `<br><small>PIN ${esc(s.pin)}</small>` : ''}${s.address ? `<br><small>${esc(s.address)}</small>` : ''}`, esc(s.contact) || '—', s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : '—',
          s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '—', (s.terms ?? 30) + ' days', S.pos.filter(o => o.supplierId === s.id && isOpen(o)).length, canPay ? fmt(owes(s)) : '—', s.status === 'inactive' ? pill('out', 'Switched off') : pill('ok', 'Active'), mg ? `<button data-a="editsup" data-id="${s.id}">Edit</button>` : '']),
          null, 'No suppliers yet. Add your first supplier.')) };
  }
  const VIEWS = { overview: vOverview, orders: vOrders, recv: vRecv, cmp: vCmp, inv: vInv, pay: vPay, sup: vSup };