let sales = [], user;
boot('sales').then(u => { user = u; load(); $('#q').oninput = draw; });
async function load() { sales = await API.sales(); draw(); }
const tag = s => ({ COMPLETED: ['', 'Completed'], PARTIALLY_REFUNDED: ['low', 'Part refunded'], REFUNDED: ['out', 'Refunded'] }[s]);
function draw() {
  const q = $('#q').value.trim().toLowerCase(), list = sales.filter(s => !q || s.receiptNumber.toLowerCase().includes(q));
  $('#rows').innerHTML = list.map(s => { const [c, l] = tag(s.status);
    return `<tr><td>${esc(s.receiptNumber)}</td><td>${when(s.createdAt)}</td><td>${esc(s.cashier)}</td><td><span class="tag ${c}">${l}</span></td><td class="n">${fmt(s.grandTotal)}</td><td class="n">${s.refundTotal ? fmt(s.refundTotal) : '—'}</td>
    <td class="row"><button data-v="${s.id}">Receipt</button>${s.status !== 'REFUNDED' ? `<button class="danger" data-r="${s.id}">Refund</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">No sales match.</td></tr>';
  $$('[data-v]').forEach(b => b.onclick = () => showReceipt(sales.find(s => s.id === b.dataset.v)));
  $$('[data-r]').forEach(b => b.onclick = () => refund(sales.find(s => s.id === b.dataset.r)));
}
function refund(s) {
  const d = modal(`<h2>Refund ${esc(s.receiptNumber)}</h2><p class="sub">Refunded items go back into stock.</p>
    ${s.items.map((l, i) => { const left = l.quantity - (l.refundedQty || 0);
      return `<div class="line" style="grid-template-columns:1fr 90px"><div>${esc(l.name)}<br><small>${left} of ${l.quantity} refundable · ${fmt(l.unitPrice)} each</small></div><input type="number" min="0" max="${left}" value="0" data-i="${i}" ${left ? '' : 'disabled'} aria-label="Quantity to refund"></div>`; }).join('')}
    <label style="margin-top:12px">Reason (required)<input id="why"></label><p><b id="amt">Refund total: ${fmt(0)}</b></p>
    <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Refund items</button></div>`);
  const qs = () => $$('[data-i]', d).map(i => ({ productId: s.items[i.dataset.i].productId, quantity: parseInt(i.value, 10) || 0, l: s.items[i.dataset.i] }));
  $$('[data-i]', d).forEach(i => i.oninput = () => $('#amt', d).textContent = 'Refund total: ' + fmt(qs().reduce((t, x) => t + Math.round(x.l.lineTotal * x.quantity / x.l.quantity), 0)));
  $('#ok', d).onclick = async () => { try { await API.refund(s.id, { reason: $('#why', d).value.trim(), items: qs().map(({ productId, quantity }) => ({ productId, quantity })) });
    d.close(); toast('Refund recorded'); load(); } catch (e) { toast(e.message, true); } };
}
/* DEMO ONLY. 
   Safe to */
   (() => {
    const KEY = 'pos_db', d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d) return alert('Open the app once first so the demo database exists.');
    const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a, pick = a => a[rnd(0, a.length - 1)];
    const cashiers = ['Otieno (Cashier)', 'Wanjiku (Manager)'], methods = ['CASH', 'MPESA', 'MPESA', 'CARD'], now = new Date();
    d.sales = d.sales.filter(s => !s.demo); d.shifts = (d.shifts || []).filter(s => !s.demo);
    for (let i = 89; i >= 0; i--) {
      const day = new Date(); day.setDate(day.getDate() - i);
      const n = rnd(4, 12) + (i < 30 ? 3 : 0);
      for (let k = 0; k < n; k++) {
        const t = new Date(day); t.setHours(rnd(8, 19), rnd(0, 59), rnd(0, 59), 0); if (t > now) continue;
        const items = [...Array(rnd(1, 4))].map(() => { const p = pick(d.products), q = rnd(1, 4), lt = p.price * q;
          return { productId: p.id, name: p.name, quantity: q, unitPrice: p.price, unitCost: p.cost, taxAmount: Math.round(lt * p.taxRate / (100 + p.taxRate)), lineTotal: lt }; });
        const total = items.reduce((a, l) => a + l.lineTotal, 0), tax = items.reduce((a, l) => a + l.taxAmount, 0), m = pick(methods);
        const sale = { id: crypto.randomUUID(), receiptNumber: 'R-' + (++d.seq), items, subtotal: total - tax, discountTotal: 0, taxTotal: tax, grandTotal: total, tendered: total, change: 0,
          customerId: null, customerName: '', payments: [m === 'CASH' ? { method: m, amount: total } : { method: m, amount: total, reference: 'DEMO' + rnd(1000, 9999) }], method: m,
          cashier: pick(cashiers), status: 'COMPLETED', createdAt: t.toISOString(), branchId: Math.random() < .7 ? 'branch-1' : 'branch-2', demo: true };
        if (Math.random() < .04) { const l = items[0]; l.refundedQty = 1; sale.refundTotal = Math.round(l.lineTotal / l.quantity); sale.status = items.length === 1 && l.quantity === 1 ? 'REFUNDED' : 'PARTIALLY_REFUNDED'; }
        d.sales.push(sale);
      }
    }
    d.sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (let i = 14; i >= 1; i--) {
      const o = new Date(); o.setDate(o.getDate() - i); o.setHours(8, 0, 0, 0); const c = new Date(o); c.setHours(20, 0, 0, 0);
      const cash = d.sales.filter(s => s.createdAt >= o.toISOString() && s.createdAt <= c.toISOString()).reduce((a, s) => a + s.payments.filter(p => p.method === 'CASH').reduce((t, p) => t + p.amount, 0), 0);
      const expected = 500000 + cash, diff = pick([0, 0, 0, -5000, 2000]);
      d.shifts.push({ id: crypto.randomUUID(), cashier: pick(cashiers), openingCash: 500000, openedAt: o.toISOString(), closedAt: c.toISOString(), expected, counted: expected + diff, difference: diff, demo: true });
    }
    localStorage.setItem(KEY, JSON.stringify(d)); alert('Demo data added: ' + d.sales.filter(s => s.demo).length + ' sales. The page will reload.'); location.reload();
  })();