let suppliers = [], pos = [], products = [];
boot('purchases').then(() => { $('#addsup').onclick = addSupplier; $('#addpo').onclick = newOrder; load(); });
async function load() {
  [suppliers, pos, products] = await Promise.all([API.suppliers(), API.purchaseOrders(), API.products()]);
  const st = { ORDERED: ['', 'Ordered'], PARTIAL: ['low', 'Part received'], RECEIVED: ['', 'Received'] };
  $('#pos').innerHTML = pos.map(o => `<tr><td>${esc(o.number)}</td><td>${esc(o.supplierName)}</td><td>${when(o.createdAt)}</td><td><span class="tag ${st[o.status][0]}">${st[o.status][1]}</span></td><td class="n">${fmt(o.total)}</td>
    <td>${o.status !== 'RECEIVED' ? `<button data-id="${o.id}">Receive goods</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No purchase orders yet.</td></tr>';
  $$('#pos button').forEach(b => b.onclick = () => receive(pos.find(o => o.id === b.dataset.id)));
  $('#sups').innerHTML = suppliers.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.phone)}</td><td>${esc(s.email)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Add your first supplier.</td></tr>';
}
function addSupplier() {
  const d = modal(`<h2>Add supplier</h2><label>Name<input id="n" autofocus></label><label>Phone<input id="p" type="tel"></label><label>Email<input id="e" type="email"></label>
    <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save supplier</button></div>`);
  $('#ok', d).onclick = async () => { try { await API.saveSupplier({ name: $('#n', d).value.trim(), phone: $('#p', d).value.trim(), email: $('#e', d).value.trim() }); d.close(); toast('Supplier saved'); load(); } catch (e) { toast(e.message, true); } };
}
function newOrder() {
  if (!suppliers.length) return toast('Add a supplier first.', true);
  const opts = products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const line = `<div class="row ln" style="flex-wrap:nowrap;margin-bottom:8px"><select class="p" style="flex:2" aria-label="Product">${opts}</select><input class="q" type="number" min="1" value="1" placeholder="Qty" style="flex:1" aria-label="Quantity"><input class="c" type="number" min="0" step="0.01" placeholder="Unit cost (KES)" style="flex:1" aria-label="Unit cost KES"><button class="x" aria-label="Remove line">×</button></div>`;
  const d = modal(`<h2>New purchase order</h2><label>Supplier<select id="sup">${suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
    <div class="row sub" style="flex-wrap:nowrap;margin:0 0 6px"><span style="flex:2">Product</span><span style="flex:1">Qty</span><span style="flex:1">Unit cost (KES)</span><span style="width:34px"></span></div>
    <div id="lns"></div><button id="al">Add line</button><p><b id="tot"></b></p><div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Place order</button></div>`);
  d.style.width = 'min(640px,94vw)';
  const cost = ln => { ln.querySelector('.c').value = (products.find(p => p.id === ln.querySelector('.p').value).cost / 100).toFixed(2); };
  const sum = () => { $('#tot', d).textContent = 'Order total: ' + fmt($$('.ln', d).reduce((t, l) => t + (parseInt($('.q', l).value, 10) || 0) * toCents($('.c', l).value), 0)); };
  const addLine = () => { $('#lns', d).insertAdjacentHTML('beforeend', line); cost($('#lns', d).lastElementChild); sum(); };
  d.addEventListener('input', sum);
  d.addEventListener('change', e => { if (e.target.matches('.p')) { cost(e.target.closest('.ln')); sum(); } });
  d.addEventListener('click', e => { if (e.target.matches('.x')) { e.target.closest('.ln').remove(); sum(); } });
  $('#al', d).onclick = addLine; addLine();
  $('#ok', d).onclick = async () => { try { await API.createPurchaseOrder({ supplierId: $('#sup', d).value,
      items: $$('.ln', d).map(l => ({ productId: $('.p', l).value, quantity: parseInt($('.q', l).value, 10), unitCost: toCents($('.c', l).value) })) });
    d.close(); toast('Purchase order placed'); load(); } catch (e) { toast(e.message, true); } };
}
function receive(o) {
  const d = modal(`<h2>Receive goods: ${esc(o.number)}</h2><p class="sub">${esc(o.supplierName)}. Received stock is added to inventory and the product cost is updated.</p>
    ${o.items.map((l, i) => { const left = l.quantity - l.received; return `<div class="line" style="grid-template-columns:1fr 90px"><div>${esc(l.name)}<br><small>${left} still expected of ${l.quantity} · ${fmt(l.unitCost)} each</small></div>
      <input type="number" min="0" max="${left}" value="${left}" data-i="${i}" ${left ? '' : 'disabled'} aria-label="Quantity received"></div>`; }).join('')}
    <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Receive stock</button></div>`);
  $('#ok', d).onclick = async () => { try { await API.receivePurchaseOrder(o.id, { items: $$('[data-i]', d).map(i => ({ productId: o.items[i.dataset.i].productId, quantity: parseInt(i.value, 10) || 0 })) });
    d.close(); toast('Stock received'); load(); } catch (e) { toast(e.message, true); } };
}
