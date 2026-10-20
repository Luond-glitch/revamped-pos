boot('users').then(user => { me = user; $('#add').onclick = add; load(); });
let me;
async function load() {
  const us = await API.users();
  $('#rows').innerHTML = us.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="tag">${u.role}</span></td><td><span class="tag ${u.status === 'inactive' ? 'out' : ''}">${u.status === 'inactive' ? 'Switched off' : 'Active'}</span></td>
    <td>${u.id === me.id ? '<small class="sub">You</small>' : `<button data-id="${u.id}" data-s="${u.status === 'inactive' ? 'active' : 'inactive'}">${u.status === 'inactive' ? 'Switch on' : 'Switch off'}</button>`}</td></tr>`).join('');
  $$('#rows button').forEach(b => b.onclick = async () => { try { await API.setUserStatus(b.dataset.id, b.dataset.s); load(); } catch (e) { toast(e.message, true); } });
}
function add() {
  const d = modal(`<h2>Add staff member</h2><label>Name<input id="n" autofocus></label><label>Email<input id="e" type="email"></label>
    <label>Role<select id="r"><option value="cashier">Cashier (checkout only)</option><option value="manager">Manager (everything)</option></select></label>
    <label>Starting password (8+ characters)<input id="p" type="password"></label><div class="actions"><button data-close>Cancel</button><button class="primary" id="ok">Add staff member</button></div>`);
  $('#ok', d).onclick = async () => { try { await API.saveUser({ name: $('#n', d).value.trim(), email: $('#e', d).value.trim(), role: $('#r', d).value, password: $('#p', d).value }); d.close(); toast('Staff member added'); load(); } catch (e) { toast(e.message, true); } };
}
