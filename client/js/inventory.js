let products = [], moves = [], orders = [], filter = 'all', term = '', allMoves = false;

/* ---------- helpers ---------- */
const IC = {
  box: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  x: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const lvl = p => p.stock <= 0 ? 'out' : p.stock <= p.reorder ? 'low' : 'ok';           // out / low / ok
const PILL = { ok: 'In stock', low: 'Low stock', out: 'Out of stock' };
const ORD = { ORDERED: ['low', 'Ordered'], PARTIAL: ['low', 'Part received'], RECEIVED: ['ok', 'Received'] };
const MOVE_PILL = { RECEIVE: 'ok', REFUND: 'ok', ADJUSTMENT: 'low', SALE: '' };
const counts = () => { const c = { ok: 0, low: 0, out: 0 }; products.forEach(p => c[lvl(p)]++); return c; };
const day = d => new Date(d).toLocaleDateString('en-CA');                               // YYYY-MM-DD in local time

/* ---------- start ---------- */
boot('inventory').then(() => {
  $('#q').oninput = e => { term = e.target.value.trim().toLowerCase(); drawTable(); };
  $('#exp').onclick = exportCsv;
  $('#stats').onclick = e => { const b = e.target.closest('[data-f]'); if (b) setFilter(b.dataset.f, true); };
  $('#chips').onclick = e => { const b = e.target.closest('[data-f]'); if (b) setFilter(b.dataset.f); };
  $('#alerts').onclick = e => {
    const r = e.target.closest('[data-rec]'); if (r) return move(products.find(p => p.id === r.dataset.rec), 'RECEIVE');
    if (e.target.closest('[data-all]')) setFilter('alert', true); };
  $('#rows').onclick = e => { const b = e.target.closest('button[data-id]'); if (!b) return; const p = products.find(x => x.id === b.dataset.id);
    b.dataset.t === 'MIN' ? setMin(p) : move(p, b.dataset.t); };
  $('#more').onclick = () => { allMoves = !allMoves; drawMoves(); };
  load();
});

async function load() {
  const [ps, mv, po] = await Promise.all([API.products(), API.movements(), API.purchaseOrders().catch(() => [])]);
  products = ps.filter(p => p.trackStock !== false);   // services have no stock
  moves = mv; orders = po; drawAll();
}
function drawAll() { drawStats(); drawLevels(); drawAlerts(); drawOrders(); drawTrend(); drawDonut(); drawChips(); drawTable(); drawMoves(); }
function setFilter(f, scroll) { filter = f; drawStats(); drawChips(); drawTable(); if (scroll) $('#stock').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

/* ---------- overview cards ---------- */
function drawStats() {
  const c = counts(), units = products.reduce((t, p) => t + p.stock, 0), value = products.reduce((t, p) => t + p.stock * (p.cost || 0), 0);
  const cards = [
    ['all', 'blue', 'box', 'Total products', products.length, units.toLocaleString('en-KE') + ' units · ' + fmt(value)],
    ['ok', 'green', 'check', 'In stock', c.ok, 'above reorder level'],
    ['low', 'amber', 'alert', 'Low stock', c.low, 'at or below reorder level'],
    ['out', 'red', 'x', 'Out of stock', c.out, 'need restocking'],
  ];
  $('#stats').innerHTML = cards.map(([f, tone, i, label, n, sub]) =>
    `<button type="button" class="iv-stat t-${tone}" data-f="${f}" aria-pressed="${filter === f}"><span class="ic">${ico(i)}</span><span><small>${label}</small><b>${n}</b><small>${sub}</small></span></button>`).join('');
}

/* ---------- stock levels bar chart ---------- */
function drawLevels() {
  const list = [...products].sort((a, b) => a.stock / Math.max(a.reorder, 1) - b.stock / Math.max(b.reorder, 1)).slice(0, 8);
  if (!list.length) { $('#levels').innerHTML = '<p class="empty">No products yet.</p>'; return; }
  const max = Math.max(1, ...list.map(p => Math.max(p.stock, p.reorder))) * 1.1;
  $('#levels').innerHTML = `<div class="iv-bars" role="img" aria-label="Stock levels: ${esc(list.map(p => p.name + ' ' + p.stock).join(', '))}">` +
    list.map(p => `<div class="iv-col" title="${esc(p.name)}: ${p.stock} on hand, reorder at ${p.reorder}"><span class="iv-val">${p.stock}</span>
      <div class="iv-track"><i class="iv-fill ${lvl(p)}" style="height:${(p.stock / max * 100).toFixed(1)}%"></i><u class="iv-min" style="bottom:${(p.reorder / max * 100).toFixed(1)}%"></u></div>
      <span class="iv-lab">${esc(p.name)}</span></div>`).join('') + '</div>';
}

/* ---------- alerts ---------- */
function drawAlerts() {
  const al = products.filter(p => lvl(p) !== 'ok').sort((a, b) => (lvl(a) === 'out' ? 0 : 1) - (lvl(b) === 'out' ? 0 : 1) || a.stock - b.stock);
  $('#alertN').innerHTML = al.length ? `<span class="iv-pill ${al.some(p => lvl(p) === 'out') ? 'out' : 'low'}">${al.length}</span>` : '';
  $('#alerts').innerHTML = al.length ? `<ul class="iv-list">${al.slice(0, 5).map(p => `<li><div class="nm"><b>${esc(p.name)}</b><small>${p.stock} left · reorder at ${p.reorder}</small></div>
      <span class="iv-pill ${lvl(p)}">${lvl(p) === 'out' ? 'Out' : 'Low'}</span><button type="button" data-rec="${p.id}" aria-label="Receive stock for ${esc(p.name)}">Receive</button></li>`).join('')}</ul>
      ${al.length > 5 ? `<button type="button" class="iv-link" data-all>See all ${al.length} alerts</button>` : ''}`
    : '<p class="empty">Nothing needs restocking right now.</p>';
}

/* ---------- recent purchase orders ---------- */
function drawOrders() {
  $('#orders').innerHTML = orders.length ? `<ul class="iv-list">${orders.slice(0, 5).map(o => { const [t, l] = ORD[o.status] || ['', o.status], q = o.items.reduce((s, i) => s + i.quantity, 0);
    return `<li><div class="nm"><b>${esc(o.number)}</b><small>${esc(o.supplierName)} · ${new Date(o.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} · ${q} units</small></div><span class="iv-pill ${t}">${l}</span></li>`; }).join('')}</ul>`
    : '<p class="empty">No purchase orders yet.</p>';
}

/* ---------- 7-day movement line chart ---------- */
function drawTrend() {
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
  const keys = days.map(day), inn = keys.map(() => 0), out = keys.map(() => 0);
  moves.forEach(m => { const i = keys.indexOf(day(m.at)); if (i >= 0) m.delta > 0 ? inn[i] += m.delta : out[i] -= m.delta; });
  const tin = inn.reduce((a, b) => a + b, 0), tout = out.reduce((a, b) => a + b, 0), max = Math.max(1, ...inn, ...out);
  const pts = a => a.map((v, i) => `${(i * 50).toFixed(0)},${(100 - v / max * 86).toFixed(1)}`).join(' ');
  $('#trend').innerHTML = !tin && !tout ? '<p class="empty">No stock movements in the last 7 days.</p>' :
    `<svg class="iv-svg" viewBox="0 0 300 110" preserveAspectRatio="none" role="img" aria-label="Units in: ${tin}, units out: ${tout} over 7 days">
      <g class="gl"><line x1="0" x2="300" y1="100" y2="100"/><line x1="0" x2="300" y1="57" y2="57"/><line x1="0" x2="300" y1="14" y2="14"/></g>
      <polyline class="in" points="${pts(inn)}"/><polyline class="out" points="${pts(out)}"/></svg>
    <div class="iv-days">${days.map(d => `<span>${d.toLocaleDateString('en-KE', { weekday: 'short' })}</span>`).join('')}</div>
    <div class="iv-legend"><span><i style="background:var(--pos-green)"></i>In <b>${tin}</b></span><span><i style="background:var(--pos-red)"></i>Out <b>${tout}</b></span></div>`;
}

/* ---------- status donut ---------- */
function drawDonut() {
  const c = counts(), n = products.length;
  if (!n) { $('#donut').innerHTML = '<p class="empty">No products yet.</p>'; return; }
  const a = c.ok / n * 100, b = a + c.low / n * 100;
  $('#donut').innerHTML = `<div class="iv-donut" style="--a:${a.toFixed(2)};--b:${b.toFixed(2)}" role="img" aria-label="${c.ok} in stock, ${c.low} low, ${c.out} out of stock"><div><b>${n}</b><small>products</small></div></div>
    <ul class="iv-legend col">${[['ok', 'In stock', 'var(--pos-green)'], ['low', 'Low stock', 'var(--gold)'], ['out', 'Out of stock', 'var(--pos-red)']]
      .map(([k, l, col]) => `<li><span><i style="background:${col}"></i>${l}</span><b>${c[k]} <small>(${Math.round(c[k] / n * 100)}%)</small></b></li>`).join('')}</ul>`;
}

/* ---------- table ---------- */
function drawChips() {
  const c = counts();
  $('#chips').innerHTML = [['all', 'All', products.length], ['ok', 'In stock', c.ok], ['low', 'Low', c.low], ['out', 'Out', c.out], ['alert', 'Alerts', c.low + c.out]]
    .map(([f, l, n]) => `<button type="button" data-f="${f}" class="${filter === f ? 'on' : ''}" aria-pressed="${filter === f}">${l} <small>${n}</small></button>`).join('');
}
const matches = p => (filter === 'all' || (filter === 'alert' ? lvl(p) !== 'ok' : lvl(p) === filter)) && (!term || [p.name, p.sku, p.barcode].some(x => String(x || '').toLowerCase().includes(term)));
function drawTable() {
  const list = products.filter(matches);
  $('#count').textContent = list.length === products.length ? '' : `· showing ${list.length} of ${products.length}`;
  $('#rows').innerHTML = list.map(p => { const l = lvl(p), pct = Math.min(100, p.stock / Math.max(p.reorder * 2, 1) * 100);
    return `<tr><td><div class="iv-prod">${pic(p, 'thumb')}<div><b>${esc(p.name)}</b><small>${esc(p.sku)}</small></div></div></td>
    <td class="n">${p.stock}</td><td class="n">${p.reorder}</td>
    <td><div class="iv-meter" aria-hidden="true"><i class="${l}" style="width:${pct.toFixed(0)}%"></i></div></td>
    <td><span class="iv-pill ${l}">${PILL[l]}</span></td>
    <td class="row"><button data-id="${p.id}" data-t="RECEIVE">Receive</button><button data-id="${p.id}" data-t="ADJUSTMENT">Adjust</button><button data-id="${p.id}" data-t="MIN">Min level</button></td></tr>`; }).join('')
    || '<tr><td colspan="6" class="empty">No products match.</td></tr>';
}
function drawMoves() {
  const list = allMoves ? moves : moves.slice(0, 12);
  $('#moves').innerHTML = list.map(m => `<tr><td>${when(m.at)}</td><td>${esc(m.name)}</td><td><span class="iv-pill ${MOVE_PILL[m.type] ?? ''}">${esc(m.type)}</span></td>
    <td class="n ${m.delta > 0 ? 'iv-up' : 'iv-down'}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td>${esc(m.reason)}</td><td>${esc(m.by)}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">No stock movements yet.</td></tr>';
  $('#more').style.display = moves.length > 12 ? '' : 'none'; $('#more').textContent = allMoves ? 'Show fewer' : 'Show all ' + moves.length;
}

/*  actions  */
function move(p, type) {
  const rec = type === 'RECEIVE';
  const d = modal(`<h2>${rec ? 'Receive stock' : 'Adjust stock'}: ${esc(p.name)}</h2><p class="sub">On hand: ${p.stock}</p>
    <label>${rec ? 'Quantity received' : 'Change (use − to remove)'}<input id="qty" type="number" step="1" ${rec ? 'min="1"' : ''} autofocus></label>
    <label>${rec ? 'Note (supplier, invoice)' : 'Reason (required)'}<input id="why" ${rec ? '' : 'required'}></label>
    <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">${rec ? 'Receive stock' : 'Save adjustment'}</button></div>`);
  $('#ok', d).onclick = async () => { const why = $('#why', d).value.trim(); if (!rec && !why) return toast('Give a reason for the adjustment.', true);
    try { await API.adjustStock({ productId: p.id, delta: parseInt($('#qty', d).value, 10), type, reason: why || 'Stock received' }); d.close(); toast('Stock updated'); load(); }
    catch (e) { toast(e.message, true); } };
}
function setMin(p) {
  const d = modal(`<h2>Minimum level: ${esc(p.name)}</h2><p class="sub">You are alerted when stock falls to this number or lower. On hand: ${p.stock}</p>
    <label>Reorder at<input id="min" type="number" min="0" step="1" value="${p.reorder}" autofocus></label>
    <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save level</button></div>`);
  $('#ok', d).onclick = async () => { const n = parseInt($('#min', d).value, 10); if (!(n >= 0)) return toast('Enter 0 or more.', true);
    try { await API.saveProduct({ ...p, reorder: n }); d.close(); toast('Minimum level saved'); load(); } catch (e) { toast(e.message, true); } };
}
function exportCsv() {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['Product', 'SKU', 'Barcode', 'On hand', 'Reorder at', 'Status', 'Unit cost (KES)', 'Stock value (KES)'],
    ...products.map(p => [p.name, p.sku, p.barcode, p.stock, p.reorder, PILL[lvl(p)], ((p.cost || 0) / 100).toFixed(2), (p.stock * (p.cost || 0) / 100).toFixed(2)])];
  const a = Object.assign(document.createElement('a'), { download: 'stock-' + day(new Date()) + '.csv',
    href: URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' })) });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}