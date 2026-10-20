let products = [];
boot('inventory').then(load);
async function load() {
  const [ps, mv] = await Promise.all([API.products(), API.movements()]); products = ps;
  $('#rows').innerHTML = ps.map(p => { const s = p.stock <= 0 ? ['out', 'Out of stock'] : p.stock <= p.reorder ? ['low', 'Low'] : ['', 'OK'];
    return `<tr><td>${esc(p.name)}</td><td class="n">${p.stock}</td><td class="n">${p.reorder}</td><td><span class="tag ${s[0]}">${s[1]}</span></td>
    <td class="row"><button data-id="${p.id}" data-t="RECEIVE">Receive</button><button data-id="${p.id}" data-t="ADJUSTMENT">Adjust</button></td></tr>`; }).join('');
  $$('#rows button').forEach(b => b.onclick = () => move(products.find(p => p.id === b.dataset.id), b.dataset.t));
  $('#moves').innerHTML = mv.map(m => `<tr><td>${when(m.at)}</td><td>${esc(m.name)}</td><td>${m.type}</td><td class="n">${m.delta > 0 ? '+' : ''}${m.delta}</td><td>${esc(m.reason)}</td><td>${esc(m.by)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No stock movements yet.</td></tr>';
}
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
