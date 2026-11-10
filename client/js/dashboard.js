const RANGES = { day: ['7 days', 'last 7 days'], week: ['8 weeks', 'last 8 weeks'], month: ['12 months', 'last 12 months'] };
let mode = 'day', D = null, mgr = false;

boot('dashboard').then(user => {
  mgr = user.role === 'manager';
  $('#today').textContent = new Date().toLocaleDateString('en-KE', { dateStyle: 'full' }) + ' · Welcome, ' + user.name;
  if (mgr) $('#go').innerHTML = '<a class="btn gold" href="reports.html">Full reports</a><a class="btn" href="inventory.html">Inventory</a>';
  else $('#profitbox').remove();                                   // cost and profit figures are for managers only
  $('#seg').innerHTML = Object.entries(RANGES).map(([k, [l]]) => `<button type="button" data-m="${k}" class="${k === mode ? 'on' : ''}" aria-pressed="${k === mode}">${l}</button>`).join('');
  $('#seg').onclick = e => { const b = e.target.closest('[data-m]'); if (!b || !D) return; mode = b.dataset.m;
    $$('#seg button').forEach(x => { const on = x.dataset.m === mode; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); drawTrend(); };
  $('#sales').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) showReceipt(D.sales.find(s => s.id === b.dataset.id)); };
  load().catch(e => toast(e.message, true));
});

async function load() {
  const [sales, products, shift] = await Promise.all([API.sales(), API.products(), API.currentShift()]);
  D = { sales, products, shift, cost: costMap(products) };
  drawShift(); drawStats(); drawTrend(); drawMonth(); drawStock(); drawRecent();
}

/* ---------- shift ---------- */
function drawShift() {
  const { sales, shift } = D;
  if (!shift) $('#shift').innerHTML = '<div class="banner"><span>No shift is open. Open one to start selling.</span><button id="open" class="primary">Open shift</button></div>';
  else { const mine = sales.filter(s => s.createdAt >= shift.openedAt), cash = mine.reduce((t, s) => t + cashIn(s), 0), tot = mine.reduce((t, s) => t + net(s), 0);
    $('#shift').innerHTML = `<div class="card rp-shift"><div class="grow"><b>Shift open</b><small>since ${when(shift.openedAt)} · ${esc(shift.cashier)}</small></div>
      <div><small>Opening cash</small><b>${fmt(shift.openingCash)}</b></div><div><small>Sales this shift (${mine.length})</small><b>${fmt(tot)}</b></div>
      <div><small>Expected in drawer</small><b>${fmt(shift.openingCash + cash)}</b></div><button id="close">Close shift</button></div>`; }
  if ($('#open')) $('#open').onclick = () => cashDialog('Open shift', 'Opening cash in drawer (KES)', async v => { await API.openShift(v); toast('Shift opened'); load(); });
  if ($('#close')) $('#close').onclick = () => cashDialog('Close shift', 'Cash counted in drawer (KES)', async v => {
    const r = await API.closeShift(v); toast(`Expected ${fmt(r.expected)}, counted ${fmt(r.counted)}, difference ${fmt(r.difference)}`); load(); });
}
function cashDialog(title, label, onOk) {
  const d = modal(`<h2>${title}</h2><label>${label}<input id="amt" type="number" min="0" step="0.01" value="0" autofocus></label><div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">${title}</button></div>`);
  $('#ok', d).onclick = async () => { try { await onOk(toCents($('#amt', d).value)); d.close(); } catch (e) { toast(e.message, true); } };
}

/* ---------- KPI cards ---------- */
function drawStats() {
  const { sales, products, cost } = D, t0 = dayStart(new Date()), y0 = addDays(t0, -1);
  const T = totals(inRange(sales, t0, dayEnd(t0)), cost), Y = totals(inRange(sales, y0, dayEnd(y0)), cost);
  const tracked = products.filter(p => p.trackStock !== false), low = tracked.filter(p => p.stock <= p.reorder), out = tracked.filter(p => p.stock <= 0);
  $('#stats').innerHTML = [
    statCard('blue', 'dollar', 'Sales today', fmt(T.rev), delta(T.rev, Y.rev, 'yesterday')),
    statCard('green', 'receipt', 'Transactions', T.n, T.units + (T.units === 1 ? ' item sold' : ' items sold')),
    statCard('amber', 'trend', 'Average sale', T.n ? fmt(T.avg) : '—', 'per transaction'),
    statCard('red', 'alert', 'Items to reorder', low.length, out.length ? out.length + ' out of stock' : 'all above minimum'),
  ].join('');
}

/* ---------- sales trend (day / week / month) ---------- */
function drawTrend() {
  const now = new Date(), t0 = dayStart(now), mon = addDays(t0, -((t0.getDay() + 6) % 7));
  const from = mode === 'day' ? addDays(t0, -6) : mode === 'week' ? addDays(mon, -49) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const rs = inRange(D.sales, from, now), t = totals(rs, D.cost);
  $('#trend').innerHTML = `<p class="rp-sum"><span class="rp-big">${fmt(t.rev)}</span> <small>net sales · ${t.n} transactions · ${RANGES[mode][1]}</small></p>` + comboChart(series(rs, D.cost, from, now, mode), { line: mgr });
}

/* ---------- this month: payments, top products, profit ---------- */
function drawMonth() {
  const { sales, products, cost } = D, now = new Date(), ms = inRange(sales, new Date(now.getFullYear(), now.getMonth(), 1), now), mt = totals(ms, cost);
  const mix = payMix(ms), paid = mix.reduce((t, x) => t + x.value, 0);
  $('#pay').innerHTML = donut(mix, { big: 'KES ' + kes(paid), small: 'received' });
  const top = [...productStats(ms, cost).values()].sort((a, b) => b.rev - a.rev).slice(0, 5);
  $('#top').innerHTML = top.length ? `<ul class="iv-list">${top.map((p, i) => `<li><span class="rp-rank">${i + 1}</span><div class="nm"><b>${esc(p.name)}</b><small>${p.qty} sold</small></div><b class="rp-amt">${fmt(p.rev)}</b></li>`).join('')}</ul>` : '<p class="empty">No sales this month yet.</p>';
  if (!mgr) return;
  const stockCost = products.reduce((t, p) => t + (p.trackStock !== false ? p.stock * (p.cost || 0) : 0), 0);
  $('#profit').innerHTML = `<div class="rp-big">${fmt(mt.profit)}</div><p class="rp-note">Estimated gross profit · ${mt.margin}% margin</p>
    <dl class="rp-dl"><div><dt>Net sales</dt><dd>${fmt(mt.rev)}</dd></div><div><dt>VAT included</dt><dd>${fmt(mt.tax)}</dd></div>
    <div><dt>Cost of goods sold</dt><dd>${fmt(mt.cogs)}</dd></div><div><dt>Stock value at cost</dt><dd>${fmt(stockCost)}</dd></div></dl>`;
}

/* ---------- stock levels + alerts ---------- */
function drawStock() {
  const tr = D.products.filter(p => p.trackStock !== false);
  const list = [...tr].sort((a, b) => a.stock / Math.max(a.reorder, 1) - b.stock / Math.max(b.reorder, 1)).slice(0, 6);
  $('#levels').innerHTML = hbars(list.map(p => ({ label: p.name, value: p.stock, tone: lvl(p) })), i => i.value + ' left');
  const al = tr.filter(p => lvl(p) !== 'ok').sort((a, b) => (lvl(a) === 'out' ? 0 : 1) - (lvl(b) === 'out' ? 0 : 1) || a.stock - b.stock);
  $('#alertN').innerHTML = al.length ? `<span class="iv-pill ${al.some(p => lvl(p) === 'out') ? 'out' : 'low'}">${al.length}</span>` : '';
  $('#alerts').innerHTML = al.length ? `<ul class="iv-list">${al.slice(0, 6).map(p => `<li><div class="nm"><b>${esc(p.name)}</b><small>${p.stock} left · reorder at ${p.reorder}</small></div><span class="iv-pill ${lvl(p)}">${lvl(p) === 'out' ? 'Out' : 'Low'}</span></li>`).join('')}</ul>`
    + (mgr && al.length > 6 ? `<a class="iv-link btn" style="display:block;text-align:center;margin-top:10px" href="inventory.html">See all ${al.length} alerts</a>` : '')
    : '<p class="empty">Nothing needs restocking right now.</p>';
}

/* ---------- recent sales ---------- */
function drawRecent() {
  $('#sales').innerHTML = D.sales.slice(0, 8).map(s => `<tr><td>${esc(s.receiptNumber)}</td><td>${when(s.createdAt)}</td><td>${esc(s.cashier)}</td><td class="n">${fmt(s.grandTotal)}</td><td><button data-id="${s.id}">View</button></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No sales yet. Open Checkout to make the first one.</td></tr>';
}