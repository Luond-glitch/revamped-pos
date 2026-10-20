boot('customers').then(() => { $('#add').onclick = add; load(); });
async function load() {
  const cs = await API.customers();
  $('#rows').innerHTML = cs.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td><span class="tag">${c.hasAccount ? 'Has account' : 'Walk-in'}</span></td><td class="n">${c.purchases}</td><td class="n">${fmt(c.spent)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No clients yet.</td></tr>';
}
function add() {
  const d = modal(`<h2>Add walk-in client</h2><label>Name<input id="n" autofocus></label><label>Phone<input id="p" type="tel"></label><label>Email (optional)<input id="e" type="email"></label>
    <div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Save client</button></div>`);
  $('#ok', d).onclick = async () => { try { await API.saveCustomer({ name: $('#n', d).value.trim(), phone: $('#p', d).value.trim(), email: $('#e', d).value.trim() }); d.close(); toast('Client saved'); load(); } catch (e) { toast(e.message, true); } };
}
