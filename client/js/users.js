/* Module 6: Staff & Access ("Privilege Access Management" layout from the proposal).
   Uses helpers from app.js (esc, fmt, when, toast, modal, can) and analytics.js (statCard, dataTable, downloadCsv, dkey, money). */
   const U = { user: null, users: [], roles: [], perms: [], shift: null, shifts: [], audit: [], sys: null, tab: 'overview', draft: null,
    f: { q: '', role: '', status: '' }, a: { q: '', user: '', from: '', to: '' }, sh: '', pay: { from: '', to: '' }, payRows: [] };
  const isSup = () => U.user && U.user.role === 'super_admin';
  // [id, label, icon, allowed?]
  const STABS = [['overview', 'Dashboard', 'grid', () => can(U.user, 'users.view')], ['staff', 'Users', 'users', () => can(U.user, 'users.view')], ['roles', 'Roles', 'shield', () => can(U.user, 'users.view')],
    ['perms', 'Permissions', 'key', () => can(U.user, 'users.view')], ['shifts', 'Shifts', 'clock', () => can(U.user, 'shifts.view')], ['activity', 'Audit log', 'list', () => can(U.user, 'audit.view')],
    ['payroll', 'Payroll', 'wallet', () => can(U.user, 'payroll.export')], ['system', 'System', 'cog', () => isSup()]];
  const STI = { grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2"/><path d="M17 6l3 3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    check: '<polyline points="20 6 9 17 4 12"/>', x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' };
  const stIco = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${STI[n]}</svg>`;
  const ACTION = { LOGIN: ['Signed in', 'ok'], LOGOUT: ['Signed out', ''], LOGIN_BLOCKED: ['Blocked sign-in', 'out'], STAFF_ADD: ['Account created', 'ok'], STAFF_EDIT: ['Account edited', ''],
    STAFF_OFF: ['Account switched off', 'out'], STAFF_ON: ['Account switched on', 'ok'], PERMISSIONS: ['Permissions changed', 'low'], SHIFT_OPEN: ['Shift opened', 'ok'], SHIFT_CLOSE: ['Shift closed', ''],
    REFUND: ['Refund', 'low'], DISCOUNT: ['Discount', 'low'], STOCK_ADJUST: ['Stock adjusted', ''], PRODUCT_ADD: ['Product added', ''], PRODUCT_EDIT: ['Product edited', ''], PO_CREATE: ['Purchase order', ''], PO_CANCEL: ['Order cancelled', 'out'], PO_CLOSE: ['Order closed short', 'low'], SUPPLIER_ADD: ['Supplier added', 'ok'], SUPPLIER_EDIT: ['Supplier edited', ''], GRN_ADD: ['Goods recorded', ''], GRN_OK: ['Goods authorised', 'ok'], GRN_NO: ['Goods rejected', 'out'], INVOICE_ADD: ['Supplier invoice', ''],
    CREDIT_SALE: ['Sale on credit', 'low'], EXPENSE_ADD: ['Expense recorded', ''], EXPENSE_OK: ['Expense approved', 'ok'], EXPENSE_NO: ['Expense rejected', 'out'], CASH_MOVE: ['Cash movement', ''], SUPPLIER_PAY: ['Supplier paid', ''], CLIENT_PAY: ['Client payment', 'ok'], RECONCILE: ['Reconciled', ''],
    SYSTEM: ['System setting', 'low'], SESSIONS_REVOKED: ['Signed out remotely', 'low'], BACKUP: ['Backup downloaded', ''] };
  const stDiff = n => n === 0 ? '<span class="iv-pill ok">Balanced</span>' : `<span class="iv-pill ${n > 0 ? 'low' : 'out'}">${n > 0 ? 'Over ' : 'Short '}${fmt(Math.abs(n))}</span>`;
  const stAvatar = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `<span class="st-av" style="background:hsl(${h} 42% 38%)" aria-hidden="true">${esc(n.replace(/\(.*\)/, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</span>`; };
  const stRole = r => ({ super_admin: 'Super administrator', administrator: 'Administrator', manager: 'Manager', cashier: 'Cashier', stock_controller: 'Stock controller' }[r] || r);
  const stOpt = (list, sel, all) => (all ? `<option value="">${all}</option>` : '') + list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const stFail = e => toast(e.message, true);
  const visibleTabs = () => STABS.filter(t => t[3]());
  
  boot('users').then(async user => {
    U.user = user; $('#add').hidden = !can(user, 'users.manage'); $('#add').onclick = () => editor();
    $('#mode').hidden = !isSup(); const t = visibleTabs().map(x => x[0]); U.tab = t.includes(location.hash.slice(1)) ? location.hash.slice(1) : t[0];
    const d = new Date(); U.pay = { from: dkey(new Date(d.getFullYear(), d.getMonth(), 1)), to: dkey(d) };
    $('#tabs').addEventListener('click', onClick); $('#view').addEventListener('click', onClick); $('#view').addEventListener('input', onInput); $('#view').addEventListener('change', onInput);
    window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (visibleTabs().some(x => x[0] === h) && h !== U.tab) { U.tab = h; draw(); } });
    await refresh();
  });
  
  async function refresh() {
    try {
      const [users, rl, shift] = await Promise.all([API.users(), API.roles(), API.currentShift().catch(() => null)]);
      Object.assign(U, { users, roles: rl.roles, perms: rl.permissions, shift });
      if (can(U.user, 'shifts.view')) U.shifts = await API.shifts().catch(() => []);
      if (can(U.user, 'audit.view')) U.audit = await API.audit({ limit: 500 }).catch(() => []);
      if (isSup()) U.sys = await API.system().catch(() => null);
      U.draft = null; draw();
    } catch (e) { $('#view').innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
  }
  
  function draw() {
    if (!visibleTabs().some(t => t[0] === U.tab)) U.tab = visibleTabs()[0][0];
    $('#tabs').innerHTML = visibleTabs().map(([k, l, i]) => `<button type="button" role="tab" aria-selected="${k === U.tab}" class="${k === U.tab ? 'on' : ''}" data-t="${k}">${stIco(i)}<span>${l}</span></button>`).join('');
    $('#view').innerHTML = { overview: overviewView, staff: staffView, roles: rolesView, perms: permsView, shifts: shiftsView, activity: activityView, payroll: payrollView, system: systemView }[U.tab]();
    if (U.tab === 'payroll') loadPayroll(); if (U.tab === 'perms') roleBar();
  }
  
  const stDownload = (name, text, type) => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  
  function onClick(e) {
    const tick = e.target.closest('.st-tick');
    if (tick) { if (tick.tagName !== 'BUTTON') return; const set = (U.draft ||= Object.fromEntries(U.roles.map(r => [r.id, new Set(r.permissions)])))[tick.dataset.r], on = !set.has(tick.dataset.p);
      on ? set.add(tick.dataset.p) : set.delete(tick.dataset.p); tick.classList.toggle('yes', on); tick.classList.toggle('no', !on); tick.setAttribute('aria-pressed', on); tick.innerHTML = stIco(on ? 'check' : 'x') + `<b>${on ? 'Allowed' : 'Blocked'}</b>`; return roleBar(); }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) return editor(U.users.find(u => u.id === b.dataset.edit));
    if (b.dataset.s) return toggle(b.dataset.id, b.dataset.s);
    if (b.dataset.rev) return revoke(b.dataset.rev);
    if (b.dataset.go) { U.tab = b.dataset.go; history.replaceState(null, '', '#' + U.tab); return draw(); }
    if (b.id === 'saveRoles') return saveRoles();
    if (b.id === 'discardRoles') { U.draft = null; return draw(); }
    if (b.id === 'maint') return setMaint(!U.sys.maintenance);
    if (b.id === 'revAll') return revoke('all');
    if (b.id === 'backup') return backup();
    if (b.id === 'csvLog') return downloadCsv('activity-log', [['Time', 'User', 'Action', 'Detail'], ...auditRows().map(x => [x.at, x.user, (ACTION[x.action] || [x.action])[0], x.detail])]);
    if (b.id === 'csvShifts') return downloadCsv('cashier-shifts', [['Cashier', 'Opened', 'Closed', 'Sales', 'Sales total', 'Opening cash', 'Expected', 'Counted', 'Difference'],
      ...shiftRows().map(x => [x.cashier, x.openedAt, x.closedAt, x.salesCount || 0, money(x.salesTotal || 0), money(x.openingCash), money(x.expected), money(x.counted), money(x.difference)])]);
    if (b.id === 'csvPay') return downloadCsv('payroll-data', [['Employee no', 'Name', 'Email', 'Phone', 'Job title', 'Role', 'Status', 'Monthly pay (KES)', 'Shifts', 'Hours', 'Sales count', 'Sales total (KES)', 'Cash short/over (KES)'],
      ...U.payRows.map(x => [x.employeeId, x.name, x.email, x.phone, x.jobTitle, x.role, x.status === 'inactive' ? 'Switched off' : 'Active', money(x.monthlyPay), x.shifts, x.hours, x.salesCount, money(x.salesTotal), money(x.cashShortOver)])]);
    if (b.dataset.t) { U.tab = b.dataset.t; history.replaceState(null, '', '#' + U.tab); draw(); $('#tabs').querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }
  }
  function onInput(e) {
    const t = e.target, id = t.id;
    const map = { q: ['f', 'q'], frole: ['f', 'role'], fstatus: ['f', 'status'], aq: ['a', 'q'], auser: ['a', 'user'], afrom: ['a', 'from'], ato: ['a', 'to'] };
    if (map[id]) { U[map[id][0]][map[id][1]] = t.value; const l = $('#list'); if (l) l.innerHTML = U.tab === 'staff' ? staffTable() : activityTable(); }
    else if (id === 'shc') { U.sh = t.value; $('#list').innerHTML = shiftTable(); }
    else if (id === 'pfrom' || id === 'pto') { U.pay[id === 'pfrom' ? 'from' : 'to'] = t.value; loadPayroll(); }
  }
  
  /* ---------- Dashboard (overview) ---------- */
  function overviewView() {
    const on = U.users.filter(u => u.status !== 'inactive').length, today = dkey(new Date()), signins = U.audit.filter(e => e.action === 'LOGIN' && dkey(new Date(e.at)) === today).length;
    const stats = statCard('blue', 'users', 'Active accounts', on, U.users.length + ' in total') + statCard('red', 'alert', 'Switched off', U.users.length - on, 'No access')
      + statCard('green', 'dollar', 'Till', U.shift ? 'Open' : 'Closed', U.shift ? esc(U.shift.cashier) + ' · since ' + esc(when(U.shift.openedAt)) : 'No shift running')
      + (can(U.user, 'audit.view') ? statCard('amber', 'receipt', 'Sign-ins today', signins, U.audit.length + ' events logged') : statCard('amber', 'receipt', 'Roles', U.roles.length, 'Permission sets'));
    const attn = [...U.users.filter(u => u.status === 'inactive').map(u => [u.name, 'Switched off', 'out']), ...U.users.filter(u => u.status !== 'inactive' && !u.lastLogin).map(u => [u.name, 'Never signed in', 'low'])];
    const recent = U.audit.slice(0, 6);
    return `<div class="iv-stats rp-kpis" style="--cols:4">${stats}</div>
      <div class="iv-grid st-ov"><section class="card iv-panel span2"><h2>Who can do what <small>active people per role</small><button type="button" data-go="perms" class="st-link">Open permissions</button></h2>
        <div class="st-roles">${U.roles.map(r => `<div class="st-role"><span class="iv-pill st-role-${esc(r.id)}">${esc(r.name)}</span><b>${r.members}</b><small>${r.members === 1 ? 'person' : 'people'} · ${r.permissions.length}/${U.perms.length} permissions</small></div>`).join('')}</div></section>
      <section class="card iv-panel"><h2>Needs attention</h2>${attn.length ? `<ul class="iv-list">${attn.slice(0, 6).map(a => `<li><span class="nm"><b>${esc(a[0])}</b></span><span class="iv-pill ${a[2]}">${a[1]}</span></li>`).join('')}</ul>` : '<p class="empty">Everything looks fine.</p>'}</section>
      ${can(U.user, 'audit.view') ? `<section class="card iv-panel span2"><h2>Latest activity<button type="button" data-go="activity" class="st-link">See all</button></h2><ul class="iv-list">${recent.map(e => { const a = ACTION[e.action] || [e.action, '']; return `<li><span class="nm"><b>${esc(e.user)}</b><small>${esc(e.detail)} · ${esc(when(e.at))}</small></span><span class="iv-pill ${a[1]}">${esc(a[0])}</span></li>`; }).join('') || '<li class="empty">No activity yet.</li>'}</ul></section>` : ''}</div>`;
  }
  
  /* ---------- Staff ---------- */
  function staffView() {
    return `<section class="card rp-filters st-filters" aria-label="Filter staff"><label>Search<input id="q" type="search" placeholder="Name, email or job title" value="${esc(U.f.q)}"></label>
      <label>Role<select id="frole">${stOpt(U.roles.map(r => [r.id, r.name]), U.f.role, 'All roles')}</select></label>
      <label>Status<select id="fstatus">${stOpt([['active', 'Active'], ['inactive', 'Switched off']], U.f.status, 'All')}</select></label></section>
      <section class="card iv-panel"><div id="list">${staffTable()}</div></section>`;
  }
  function staffTable() {
    const q = U.f.q.trim().toLowerCase(), manage = can(U.user, 'users.manage'), admin = U.user.role === 'administrator' || U.user.role === 'super_admin', sup = U.user.role === 'super_admin';
    const list = U.users.filter(u => (!q || [u.name, u.email, u.jobTitle, u.employeeId].some(x => (x || '').toLowerCase().includes(q))) && (!U.f.role || u.role === U.f.role)
      && (!U.f.status || (u.status === 'inactive' ? 'inactive' : 'active') === U.f.status));
    return `<table><thead><tr><th>Person</th><th>Role</th><th>Job title</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody>${list.map(u => {
      const off = u.status === 'inactive', self = u.id === U.user.id, locked = (u.role === 'administrator' && !admin) || (u.role === 'super_admin' && !sup);
      return `<tr class="${off ? 'st-off' : ''}"><td><div class="st-who">${stAvatar(u.name)}<span><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span></div></td>
        <td><span class="iv-pill st-role-${esc(u.role)}">${esc(stRole(u.role))}</span></td><td>${esc(u.jobTitle || '—')}</td><td>${u.lastLogin ? esc(when(u.lastLogin)) : '<small>Never</small>'}</td>
        <td><span class="iv-pill ${off ? 'out' : 'ok'}">${off ? 'Switched off' : 'Active'}</span></td>
        <td class="st-act">${self ? '<small>You</small>' : ''}${manage && !locked ? `<button type="button" data-edit="${u.id}">Edit</button>` : ''}${sup && !self ? `<button type="button" data-rev="${u.id}" title="Sign out of every device">Sign out</button>` : ''}${manage && !self && !locked ? `<button type="button" class="${off ? '' : 'danger'}" data-id="${u.id}" data-s="${off ? 'active' : 'inactive'}">${off ? 'Switch on' : 'Switch off'}</button>` : ''}</td></tr>`; }).join('')
      || '<tr><td colspan="6" class="empty">No staff match.</td></tr>'}</tbody></table>`;
  }
  async function toggle(id, status) {
    const u = U.users.find(x => x.id === id); if (status === 'inactive' && !confirm('Switch off ' + u.name + '? They will be signed out and cannot sign in until you switch them on again.')) return;
    try { await API.setUserStatus(id, status); toast(u.name + (status === 'inactive' ? ' switched off.' : ' switched on.')); refresh(); } catch (e) { stFail(e); }
  }
  function editor(u) {
    const self = u && u.id === U.user.id, admin = U.user.role === 'administrator' || U.user.role === 'super_admin', sup = U.user.role === 'super_admin', roles = U.roles.filter(r => (admin || r.id !== 'administrator') && (sup || r.id !== 'super_admin'));
    const d = modal(`<h2>${u ? 'Edit staff member' : 'Add staff member'}</h2><form id="sf" class="st-form" autocomplete="off">
      <label class="w2">Full name<input id="sn" required value="${esc(u?.name)}"></label><label class="w2">Email<input id="se" type="email" required value="${esc(u?.email)}"></label>
      <label>Role<select id="sr" ${self ? 'disabled' : ''}>${stOpt(roles.map(r => [r.id, r.name]), u?.role || 'cashier')}</select></label>
      <label>Job title<input id="sj" value="${esc(u?.jobTitle)}" placeholder="e.g. Cashier"></label>
      <p class="rp-note w2" id="sd"></p>
      <label>Phone<input id="sp" type="tel" value="${esc(u?.phone)}"></label><label>Employee number<input id="sm" value="${esc(u?.employeeId)}" placeholder="HR / payroll no."></label>
      <label>Date hired<input id="sh" type="date" value="${esc(u?.hiredOn)}"></label><label>Monthly pay (KES)<input id="sy" type="number" min="0" step="0.01" value="${u ? (u.monthlyPay / 100).toFixed(2) : ''}" placeholder="For payroll export"></label>
      <label class="w2">${u ? 'New password (leave empty to keep the current one)' : 'Password (at least 8 characters)'}<input id="sw" type="password" minlength="8" ${u ? '' : 'required'} autocomplete="new-password"></label>
      <div class="actions w2"><button type="button" data-close>Cancel</button><button class="primary" id="ssave">${u ? 'Save changes' : 'Create account'}</button></div></form>`);
    const hint = () => { $('#sd', d).textContent = U.roles.find(r => r.id === $('#sr', d).value)?.desc + (self ? ' You cannot change your own role.' : ''); }; $('#sr', d).onchange = hint; hint();
    $('#sf', d).onsubmit = async ev => { ev.preventDefault(); const b = $('#ssave', d); b.disabled = true;
      try { await API.saveUser({ id: u?.id, name: $('#sn', d).value, email: $('#se', d).value, role: self ? u.role : $('#sr', d).value, jobTitle: $('#sj', d).value, phone: $('#sp', d).value, employeeId: $('#sm', d).value,
        hiredOn: $('#sh', d).value, monthlyPay: toCents($('#sy', d).value), password: $('#sw', d).value });
        d.close(); toast(u ? 'Changes saved.' : 'Account created.'); refresh(); } catch (e) { stFail(e); b.disabled = false; } };
  }
  
  
  /* ---------- Roles (cards) ---------- */
  function rolesView() {
    const names = id => U.users.filter(u => u.role === id && u.status !== 'inactive');
    return `<div class="st-rolecards">${U.roles.map(r => `<article class="card st-rc st-rc-${esc(r.id)}"><header><span class="st-rcic">${stIco(r.id === 'super_admin' ? 'cog' : r.id === 'administrator' ? 'shield' : r.id === 'manager' ? 'users' : r.id === 'cashier' ? 'wallet' : 'list')}</span><div><b>${esc(r.name)}</b><small>${r.permissions.length} of ${U.perms.length} permissions</small></div></header>
      <p>${esc(r.desc)}</p><div class="st-ppl">${names(r.id).map(u => `<span class="st-chip">${stAvatar(u.name)}<span>${esc(u.name.replace(/\s*\(.*\)/, ''))}</span></span>`).join('') || '<small>Nobody yet</small>'}</div>
      <button type="button" data-go="perms">View permissions</button></article>`).join('')}</div>`;
  }
  
  /* ---------- Permissions: tick / cross grid, as in the proposal ---------- */
  function permsView() {
    const edit = can(U.user, 'permissions.manage'), groups = [...new Set(U.perms.map(p => p.group))], n = U.roles.length;
    const cell = (r, p) => { const on = (U.draft ? U.draft[r.id] : new Set(r.permissions)).has(p.id), locked = !edit || r.id === 'administrator' || r.id === 'super_admin', tag = locked ? 'span' : 'button';
      return `<${tag} class="st-cell st-tick ${on ? 'yes' : 'no'}${locked ? ' lock' : ''}" ${locked ? `title="${r.id === 'administrator' || r.id === 'super_admin' ? 'Always allowed' : 'View only'}"` : `type="button" data-r="${r.id}" data-p="${p.id}" aria-pressed="${on}"`} aria-label="${esc(r.name)}: ${esc(p.label)}: ${on ? 'allowed' : 'blocked'}">${stIco(on ? 'check' : 'x')}<b>${on ? 'Allowed' : 'Blocked'}</b></${tag}>`; };
    const rows = groups.map(g => `<div class="st-grow">${esc(g)}</div>` + U.perms.filter(p => p.group === g).map(p => `<div class="st-cell st-lab">${esc(p.label)}</div>${U.roles.map(r => cell(r, p)).join('')}`).join('')).join('');
    return `<section class="card iv-panel"><h2>Permissions <small>${edit ? 'tap a tick or cross to change it, then save' : 'view only'}</small></h2>
      <div class="st-scroll" tabindex="0" role="region" aria-label="Permission grid"><div class="st-grid" style="--n:${n}"><div class="st-hd st-hd0"></div>${U.roles.map(r => `<div class="st-hd">${esc(r.name)}</div>`).join('')}${rows}</div></div>
      ${edit ? '<div class="st-savebar" id="rbar"></div>' : ''}<p class="rp-note">Administrators and super administrators always keep every permission. A change applies the next time that person opens a page.</p></section>`;
  }
  function dirty() { if (!U.draft) return 0; return U.roles.reduce((n, r) => { const a = new Set(r.permissions), b = U.draft[r.id]; return n + [...b].filter(x => !a.has(x)).length + [...a].filter(x => !b.has(x)).length; }, 0); }
  function roleBar() { const n = dirty(), el = $('#rbar'); if (!el) return;
    el.innerHTML = n ? `<span>${n} unsaved ${n === 1 ? 'change' : 'changes'}</span><button type="button" id="discardRoles">Discard</button><button type="button" class="primary" id="saveRoles">Save permissions</button>` : ''; }
  async function saveRoles() {
    const b = $('#saveRoles'); b.disabled = true;
    try { for (const r of U.roles) { if (!U.draft[r.id]) continue; const a = [...r.permissions].sort().join(), c = [...U.draft[r.id]].sort().join(); if (a !== c) await API.savePermissions(r.id, [...U.draft[r.id]]); }
      toast('Permissions saved.'); refresh(); } catch (e) { stFail(e); b.disabled = false; }
  }
  
  /* ---------- System (super administrator only) ---------- */
  function systemView() {
    const s = U.sys; if (!s) return '<p class="empty">System details are not available.</p>';
    return `<div class="iv-grid st-ov"><section class="card iv-panel span2"><h2>System status <small>${esc(s.version)}</small></h2>
        <dl class="rp-dl"><div><dt>Accounts</dt><dd>${s.active} active of ${s.accounts}</dd></div><div><dt>Super administrators / administrators</dt><dd>${s.supers} / ${s.admins}</dd></div>
        <div><dt>Products · clients · sales</dt><dd>${s.products} · ${s.clients} · ${s.sales}</dd></div><div><dt>Cashier shifts recorded</dt><dd>${s.shifts}</dd></div>
        <div><dt>Activity log entries</dt><dd>${s.events}</dd></div><div><dt>Data size</dt><dd>${s.storageKb} KB</dd></div>
        <div><dt>Last backup</dt><dd>${s.lastBackup ? esc(when(s.lastBackup)) : 'Never'}</dd></div></dl></section>
      <section class="card iv-panel"><h2>Maintenance mode</h2><p class="rp-note">While it is on, only super administrators can sign in. Use it for updates.</p>
        <p><span class="iv-pill ${s.maintenance ? 'out' : 'ok'}">${s.maintenance ? 'On: staff are locked out' : 'Off: everyone can sign in'}</span></p>
        <button type="button" id="maint" class="${s.maintenance ? 'primary' : 'danger'}">${s.maintenance ? 'Switch maintenance off' : 'Switch maintenance on'}</button></section>
      <section class="card iv-panel"><h2>Sessions</h2><p class="rp-note">Sign people out of every device straight away. Use it after a lost phone or a suspected leak. Single people can be signed out from the Users page.</p>
        <button type="button" id="revAll" class="danger">Sign everyone else out</button></section>
      <section class="card iv-panel"><h2>Backup</h2><p class="rp-note">Downloads a copy of the shop data (without passwords) as a JSON file.</p><button type="button" id="backup" class="primary">Download backup</button></section>
      <section class="card iv-panel"><h2>Safeguards</h2><ul class="st-notes"><li>Only super administrators can see or change super administrator accounts and this page.</li><li>The activity log cannot be edited or cleared by anyone, including super administrators.</li><li>At least one active super administrator must always remain.</li></ul></section></div>`;
  }
  async function setMaint(on) { if (on && !confirm('Lock all staff out until you switch maintenance off? People who are signed in keep working, but nobody new can sign in.')) return;
    try { await API.setMaintenance(on); toast(on ? 'Maintenance mode is on.' : 'Maintenance mode is off.'); refresh(); } catch (e) { stFail(e); } }
  async function revoke(id) { const u = U.users.find(x => x.id === id); if (!confirm(id === 'all' ? 'Sign everyone else out of every device?' : 'Sign ' + u.name + ' out of every device?')) return;
    try { await API.revokeSessions(id); toast('Signed out.'); refresh(); } catch (e) { stFail(e); } }
  async function backup() { try { const d = await API.backup(); stDownload('pos-backup-' + dkey(new Date()) + '.json', JSON.stringify(d, null, 2), 'application/json'); toast('Backup downloaded.'); refresh(); } catch (e) { stFail(e); } }
  
  /* ---------- Shifts ---------- */
  const shiftRows = () => U.shifts.filter(x => x.closedAt && (!U.sh || (x.userId || x.cashier) === U.sh)).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  function shiftsView() {
    const people = [...new Map(U.shifts.map(x => [x.userId || x.cashier, x.cashier])).entries()];
    const open = U.shift ? `<section class="card rp-shift"><div><small>Open now</small><b>${esc(U.shift.cashier)}</b></div><div><small>Since</small><b>${esc(when(U.shift.openedAt))}</b></div><div><small>Opening cash</small><b>${fmt(U.shift.openingCash)}</b></div></section>` : '';
    return `${open}<section class="card rp-filters st-filters"><label>Cashier<select id="shc">${stOpt(people, U.sh, 'All cashiers')}</select></label><div class="st-end"><button type="button" id="csvShifts">Download CSV</button></div></section>
      <section class="card iv-panel"><h2>Closed shifts <small>opening and closing balances</small></h2><div id="list">${shiftTable()}</div>
      <p class="rp-note">Cashiers open and close their shift from the Dashboard. The difference is the cash counted minus the cash expected in the drawer.</p></section>`;
  }
  function shiftTable() {
    return `<table>${dataTable(['Cashier', 'Opened', 'Closed', 'Sales', 'Opening cash', 'Expected', 'Counted', 'Difference'], shiftRows().map(x => [esc(x.cashier), esc(when(x.openedAt)), esc(when(x.closedAt)), x.salesCount ?? '—', fmt(x.openingCash), fmt(x.expected), fmt(x.counted), stDiff(x.difference)]))}</table>`;
  }
  
  /* ---------- Activity log ---------- */
  const auditRows = () => { const q = U.a.q.trim().toLowerCase(), f = U.a.from && new Date(U.a.from + 'T00:00:00'), t = U.a.to && new Date(U.a.to + 'T23:59:59.999');
    return U.audit.filter(e => (!U.a.user || e.userId === U.a.user) && (!f || new Date(e.at) >= f) && (!t || new Date(e.at) <= t) && (!q || [e.user, (ACTION[e.action] || [e.action])[0], e.detail].some(x => (x || '').toLowerCase().includes(q)))); };
  function activityView() {
    return `<section class="card rp-filters st-filters"><label>Search<input id="aq" type="search" placeholder="Name, action or detail" value="${esc(U.a.q)}"></label>
      <label>User<select id="auser">${stOpt(U.users.map(u => [u.id, u.name]), U.a.user, 'Everyone')}</select></label>
      <label>From<input type="date" id="afrom" value="${U.a.from}"></label><label>To<input type="date" id="ato" value="${U.a.to}"></label></section>
      <section class="card iv-panel"><h2>Activity log <span><button type="button" id="csvLog">Download CSV</button></span></h2><div id="list">${activityTable()}</div></section>`;
  }
  function activityTable() {
    const all = auditRows(), rows = all.slice(0, 200);
    return `<table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>${rows.map(e => { const a = ACTION[e.action] || [e.action, ''];
      return `<tr><td class="rp-amt">${esc(when(e.at))}</td><td>${esc(e.user)}</td><td><span class="iv-pill ${a[1]}">${esc(a[0])}</span></td><td>${esc(e.detail)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">No activity found.</td></tr>'}</tbody></table>`
      + (all.length > rows.length ? `<p class="rp-note">Showing the latest ${rows.length} of ${all.length}. Download the CSV for the full list.</p>` : '');
  }
  
  /* ---------- Payroll export ---------- */
  function payrollView() {
    return `<section class="card rp-filters st-filters"><label>From<input type="date" id="pfrom" value="${U.pay.from}"></label><label>To<input type="date" id="pto" value="${U.pay.to}"></label>
      <div class="st-end"><button type="button" class="primary" id="csvPay">Download payroll CSV</button></div></section>
      <section class="card iv-panel"><h2>Hours, shifts and sales <small>per person for the period</small></h2><div id="list"><p class="empty">Loading…</p></div>
      <p class="rp-note">This file feeds your HR or payroll system. It lists hours worked, shifts and sales per person; the pay amounts are the monthly figures saved on each account, and tax or deductions are not calculated here.</p></section>`;
  }
  async function loadPayroll() {
    try { U.payRows = await API.payroll(U.pay.from, U.pay.to); } catch (e) { return stFail(e); } if (U.tab !== 'payroll' || !$('#list')) return;
    $('#list').innerHTML = `<table>${dataTable(['Emp. no.', 'Name', 'Role', 'Shifts', 'Hours', 'Sales', 'Sales total', 'Cash short/over', 'Monthly pay'],
      U.payRows.map(x => [esc(x.employeeId || '—'), esc(x.name), esc(x.role), x.shifts, x.hours.toFixed(1), x.salesCount, fmt(x.salesTotal), stDiff(x.cashShortOver), fmt(x.monthlyPay)]))}</table>`;
  }