const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = c => 'KES ' + (c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toCents = v => Math.round(parseFloat(v || 0) * 100);
const net = s => s.grandTotal - (s.refundTotal || 0);
const when = iso => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

/* ---------- Light / dark colours: one choice, remembered, used by every page ---------- */
const THEME_KEY = 'pos_theme';
const getTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } };   // 'light', 'dark' or nothing (follow the device)
const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function paintThemeButtons() { const dark = isDark(); $$('[data-themebtn]').forEach(b => { b.innerHTML = dark ? SUN : MOON; const l = dark ? 'Switch to light mode' : 'Switch to dark mode'; b.title = l; b.setAttribute('aria-label', l); b.setAttribute('aria-pressed', dark); });
  const m = document.querySelector('meta[name=theme-color]'); if (m && !document.querySelector('.pos')) m.content = dark ? '#0a0f1a' : '#14213d'; }
function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; paintThemeButtons(); }
const themeButton = () => '<button type="button" class="themebtn" data-themebtn></button>';
applyTheme(getTheme());
document.addEventListener('click', e => { if (!e.target.closest('[data-themebtn]')) return; const t = isDark() ? 'light' : 'dark'; try { localStorage.setItem(THEME_KEY, t); } catch {} applyTheme(t); });
addEventListener('storage', e => { if (e.key === THEME_KEY) applyTheme(e.newValue); });   // another tab changed it
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!getTheme()) paintThemeButtons(); });
// Pages with no menu bar of their own (home, staff sign-in) get a small floating button
const floatTheme = () => { if (!document.getElementById('nav') && !document.body.classList.contains('cs-page') && !document.querySelector('[data-themebtn]')) document.body.insertAdjacentHTML('beforeend', '<div class="theme-float">' + themeButton() + '</div>'); paintThemeButtons(); };
document.readyState === 'loading' ? addEventListener('DOMContentLoaded', floatTheme) : floatTheme();

// [page, label, permission needed to see it]. The server checks permissions again on every request: hiding a link is only a convenience.
const NAV = [
  ['dashboard', 'Dashboard', 'dashboard.view'], ['pos', 'Checkout', 'pos.use'], ['sales', 'Sales', 'sales.view'], ['products', 'Products', 'products.manage'],
  ['inventory', 'Inventory', 'inventory.manage'], ['purchases', 'Purchases', 'purchases.manage'], ['reports', 'Reports', 'reports.view'], ['payments', 'Payments', 'payments.view'],
  ['customers', 'Clients', 'customers.manage'], ['users', 'Staff', 'users.view'],
];
const can = (u, p) => !!u && (u.permissions || []).includes(p);
const ROLE_LABEL = { super_admin: 'Super administrator', administrator: 'Administrator', manager: 'Manager', cashier: 'Cashier', stock_controller: 'Stock controller' };

function toast(msg, err) {
  let box = $('#toasts') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toasts' }));
  const t = Object.assign(document.createElement('div'), { className: 'toast' + (err ? ' err' : ''), textContent: msg });
  box.append(t); setTimeout(() => t.remove(), 3500);
}

function modal(html) {
  const d = document.createElement('dialog'); d.innerHTML = html; document.body.append(d);
  d.addEventListener('close', () => d.remove()); d.addEventListener('click', e => { if (e.target.closest('[data-close]')) d.close(); });
  d.showModal(); return d;
}

async function boot(page) {
  let user;
  try { user = await API.me(); } catch { location.href = 'login.html'; return new Promise(() => {}); }
  const links = NAV.filter(n => can(user, n[2])).map(([id, label]) => `<a href="${id}.html" class="${id === page ? 'on' : ''}">${label}</a>`).join('');
  // .clock is only visible on the Checkout page (see main.css); the nav becomes a top bar there.
  $('#nav').innerHTML = `<div class="top"><span class="brand">Universal POS</span><span class="clock" id="clock" aria-hidden="true"></span>${themeButton()}<button id="menu" aria-expanded="false" aria-controls="navlinks" aria-label="Open menu">☰</button></div><div id="navlinks">${links}<div class="who"><span>${esc(user.name)}<small>${esc(ROLE_LABEL[user.role] || user.role)}</small></span><button id="logout">Sign out</button></div></div>`;
  const tick = () => { const n = new Date(); $('#clock').textContent = n.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + n.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false }); };
  tick(); setInterval(tick, 15000); paintThemeButtons();
  $('#logout').onclick = async () => { await API.logout(); location.href = 'login.html'; };
  const setMenu = open => { $('#nav').classList.toggle('open', open); const m = $('#menu'); m.setAttribute('aria-expanded', open); m.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); m.textContent = open ? '✕' : '☰'; };
  $('#menu').onclick = () => setMenu(!$('#nav').classList.contains('open')); document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  const here = NAV.find(n => n[0] === page);
  if (here && !can(user, here[2])) { // no access: go to the first page this person may use, or back to sign-in
    const first = NAV.find(n => can(user, n[2])); location.href = first && first[0] !== page ? first[0] + '.html' : 'login.html'; return new Promise(() => {}); }
  return user;
}

function receiptHTML(s) {
  return `<div class="receipt"><div style="text-align:center"><b>Universal POS</b><br>${esc(when(s.createdAt))}<br>${esc(s.receiptNumber)} · ${esc(s.cashier)}${s.customerName ? '<br>Client: ' + esc(s.customerName) : ''}</div><hr>
  ${s.items.map(i => `<div>${esc(i.name)}</div><div class="r"><span>${i.quantity} × ${fmt(i.unitPrice)}</span><span>${fmt(i.unitPrice * i.quantity)}</span></div>`).join('')}<hr>
  <div class="r"><span>VAT included</span><span>${fmt(s.taxTotal)}</span></div><div class="r"><b>Total</b><b>${fmt(s.grandTotal)}</b></div>
  ${s.discountTotal ? `<div class="r"><span>Discount</span><span>-${fmt(s.discountTotal)}</span></div>` : ''}${(s.payments || [{ method: s.method, amount: s.grandTotal }]).map(p => `<div class="r"><span>${esc(p.method)} ${esc(p.reference || '')}</span><span>${fmt(p.amount)}</span></div>`).join('')}<div class="r"><span>Change</span><span>${fmt(s.change)}</span></div>${s.balance ? `<div class="r"><b>Balance due</b><b>${fmt(s.balance)}</b></div>` : ''}</div>`;
}
function showReceipt(s) {
  const d = modal(receiptHTML(s) + '<div class="actions"><button data-close>Close</button><button class="primary" id="pr">Print receipt</button></div>');
  $('#pr', d).onclick = () => window.print();
}

function pic(p, cls) { // product image, or a coloured initials tile kama hakuna picha
  if (p.image) return `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p.name)}">`;
  let h = 0; for (const c of p.name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<div class="ph ${cls}" style="background:hsl(${h} 42% 38%)" aria-hidden="true">${esc(p.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>`;
}
const shrink = (file, max = 480) => new Promise((ok, no) => { // resize to max 480px JPEG so images stay small
  const r = new FileReader(); r.onerror = no; r.onload = () => { const im = new Image(); im.onerror = no; im.onload = () => {
    const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.8)); }; im.src = r.result; }; r.readAsDataURL(file); });

// Phones show table rows as cards, so every cell needs its column name. This labels cells whenever a page draws a table.
let labelTimer; function labelTables() { $$('table').forEach(t => { const h = [...t.querySelectorAll('thead th')].map(x => x.textContent.trim());
  t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { if (td.colSpan < 2 && td.dataset.label !== (h[i] || '')) td.dataset.label = h[i] || ''; })); }); }
new MutationObserver(() => { cancelAnimationFrame(labelTimer); labelTimer = requestAnimationFrame(labelTables); }).observe(document.body, { childList: true, subtree: true });