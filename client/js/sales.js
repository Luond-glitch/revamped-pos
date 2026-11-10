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
