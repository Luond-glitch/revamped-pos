const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const group = (list, key) => { const m = {}; list.forEach(s => { const k = key(s); (m[k] ||= { n: 0, t: 0 }); m[k].n++; m[k].t += net(s); }); return Object.entries(m); };
const tbl = (head, rows) => `<thead><tr>${head.map((h, i) => `<th class="${i ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="empty">Nothing in this period.</td></tr>`}</tbody>`;
let sales = [], products = [];
boot('reports').then(async () => {
  $('#from').value = $('#to').value = iso(new Date());
  [sales, products] = await Promise.all([API.sales(), API.products()]);
  $('#from').onchange = $('#to').onchange = draw; draw();
});
function draw() {
  const a = new Date($('#from').value + 'T00:00:00'), b = new Date($('#to').value + 'T23:59:59.999');
  const ss = sales.filter(s => { const t = new Date(s.createdAt); return t >= a && t <= b; });
  const cost = new Map(products.map(p => [p.id, p.cost])), gross = ss.reduce((t, s) => t + s.grandTotal, 0), ref = ss.reduce((t, s) => t + (s.refundTotal || 0), 0);
  const tax = ss.reduce((t, s) => t + Math.round(s.taxTotal * net(s) / (s.grandTotal || 1)), 0);
  const cogs = ss.reduce((t, s) => t + s.items.reduce((u, l) => u + (l.unitCost ?? cost.get(l.productId) ?? 0) * (l.quantity - (l.refundedQty || 0)), 0), 0);
  $('#stats').innerHTML = [['Gross sales', fmt(gross)], ['Discounts', fmt(ss.reduce((t, s) => t + (s.discountTotal || 0), 0))], ['Refunds', fmt(ref)], ['Net sales', fmt(gross - ref)], ['VAT in net sales', fmt(tax)], ['Gross margin', fmt(gross - ref - tax - cogs)]]
    .map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('');
  const pm = {}; ss.forEach(s => (s.payments || [{ method: s.method, amount: s.grandTotal }]).forEach(p => { (pm[p.method] ||= { n: 0, t: 0 }); pm[p.method].n++; pm[p.method].t += p.amount; }));
  $('#pay').innerHTML = tbl(['Method', 'Payments', 'Received'], Object.entries(pm).map(([k, v]) => [k, v.n, fmt(v.t)]));
  $('#cash').innerHTML = tbl(['Cashier', 'Sales', 'Net'], group(ss, s => s.cashier).map(([k, v]) => [esc(k), v.n, fmt(v.t)]));
  const m = {}; ss.forEach(s => s.items.forEach(l => { const q = l.quantity - (l.refundedQty || 0); (m[l.name] ||= { q: 0, r: 0 }); m[l.name].q += q; m[l.name].r += q * l.unitPrice; }));
  $('#prod').innerHTML = tbl(['Product', 'Qty', 'Revenue'], Object.entries(m).sort((x, y) => y[1].r - x[1].r).map(([k, v]) => [esc(k), v.q, fmt(v.r)]));
  $('#val').textContent = `Stock value at cost ${fmt(products.reduce((t, p) => t + p.stock * p.cost, 0))} · at selling price ${fmt(products.reduce((t, p) => t + p.stock * p.price, 0))}`;
  $('#low').innerHTML = tbl(['Low or out of stock', 'On hand', 'Reorder at'], products.filter(p => p.stock <= p.reorder).map(p => [esc(p.name), p.stock, p.reorder]));
}
