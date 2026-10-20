boot('dashboard').then(async user => {
  $('#today').textContent = new Date().toLocaleDateString('en-KE', { dateStyle: 'full' });
  async function load() {
    const [sales, products, shift] = await Promise.all([API.sales(), API.products(), API.currentShift()]);
    const day = new Date().toDateString(), today = sales.filter(s => new Date(s.createdAt).toDateString() === day);
    const sum = a => a.reduce((t, s) => t + net(s), 0), low = products.filter(p => p.trackStock && p.stock <= p.reorder).length;
    $('#stats').innerHTML = [[fmt(sum(today)), 'Sales today'], [today.length, 'Transactions'], [today.length ? fmt(Math.round(sum(today) / today.length)) : '—', 'Average sale'], [low, 'Items to reorder']]
      .map(([v, l]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('');
    $('#shift').innerHTML = shift
      ? `<div class="card row" style="margin-bottom:14px"><div class="grow">Shift open since ${when(shift.openedAt)} · opening cash ${fmt(shift.openingCash)}</div><button id="close">Close shift</button></div>`
      : `<div class="banner">No shift is open. Open one to start selling.<button id="open" class="primary">Open shift</button></div>`;
    $('#sales').innerHTML = sales.slice(0, 15).map(s => `<tr><td>${esc(s.receiptNumber)}</td><td>${when(s.createdAt)}</td><td>${esc(s.cashier)}</td><td class="n">${fmt(s.grandTotal)}</td><td><button data-id="${s.id}">View</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No sales yet. Open Checkout to make the first one.</td></tr>';
    $$('#sales button').forEach(b => b.onclick = () => showReceipt(sales.find(s => s.id === b.dataset.id)));
    if ($('#open')) $('#open').onclick = () => cashDialog('Open shift', 'Opening cash in drawer (KES)', async v => { await API.openShift(v); toast('Shift opened'); load(); });
    if ($('#close')) $('#close').onclick = () => cashDialog('Close shift', 'Cash counted in drawer (KES)', async v => {
      const r = await API.closeShift(v); toast(`Expected ${fmt(r.expected)}, counted ${fmt(r.counted)}, difference ${fmt(r.difference)}`); load(); });
  }
  load().catch(e => toast(e.message, true));
});
function cashDialog(title, label, onOk) {
  const d = modal(`<h2>${title}</h2><label>${label}<input id="amt" type="number" min="0" step="0.01" value="0" autofocus></label><div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">${title}</button></div>`);
  $('#ok', d).onclick = async () => { try { await onOk(toCents($('#amt', d).value)); d.close(); } catch (e) { toast(e.message, true); } };
}
