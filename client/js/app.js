const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = c => 'KES ' + (c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toCents = v => Math.round(parseFloat(v || 0) * 100);
const net = s => s.grandTotal - (s.refundTotal || 0);
const when = iso => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

const NAV = [
  ['dashboard', 'Dashboard', ['manager', 'cashier']], ['pos', 'Checkout', ['manager', 'cashier']],
  ['sales', 'Sales', ['manager']], ['products', 'Products', ['manager']], ['inventory', 'Inventory', ['manager']], ['purchases', 'Purchases', ['manager']], ['reports', 'Reports', ['manager']], ['customers', 'Clients', ['manager']], ['users', 'Staff', ['manager']],
];

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
  const links = NAV.filter(n => n[2].includes(user.role)).map(([id, label]) => `<a href="${id}.html" class="${id === page ? 'on' : ''}">${label}</a>`).join('');
  $('#nav').innerHTML = `<div class="top"><span class="brand">Universal POS</span><button id="menu" aria-expanded="false" aria-controls="navlinks" aria-label="Open menu">☰</button></div><div id="navlinks">${links}<div class="who">${esc(user.name)}<button id="logout">Sign out</button></div></div>`;
  $('#logout').onclick = async () => { await API.logout(); location.href = 'login.html'; };
  const setMenu = open => { $('#nav').classList.toggle('open', open); const m = $('#menu'); m.setAttribute('aria-expanded', open); m.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); m.textContent = open ? '✕' : '☰'; };
  $('#menu').onclick = () => setMenu(!$('#nav').classList.contains('open')); document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  if (!NAV.find(n => n[0] === page)?.[2].includes(user.role)) { location.href = 'dashboard.html'; return new Promise(() => {}); }
  return user;
}

function receiptHTML(s) {
  return `<div class="receipt"><div style="text-align:center"><b>Universal POS</b><br>${esc(when(s.createdAt))}<br>${esc(s.receiptNumber)} · ${esc(s.cashier)}${s.customerName ? '<br>Client: ' + esc(s.customerName) : ''}</div><hr>
  ${s.items.map(i => `<div>${esc(i.name)}</div><div class="r"><span>${i.quantity} × ${fmt(i.unitPrice)}</span><span>${fmt(i.unitPrice * i.quantity)}</span></div>`).join('')}<hr>
  <div class="r"><span>VAT included</span><span>${fmt(s.taxTotal)}</span></div><div class="r"><b>Total</b><b>${fmt(s.grandTotal)}</b></div>
  ${s.discountTotal ? `<div class="r"><span>Discount</span><span>-${fmt(s.discountTotal)}</span></div>` : ''}${(s.payments || [{ method: s.method, amount: s.grandTotal }]).map(p => `<div class="r"><span>${esc(p.method)} ${esc(p.reference || '')}</span><span>${fmt(p.amount)}</span></div>`).join('')}<div class="r"><span>Change</span><span>${fmt(s.change)}</span></div></div>`;
}
function showReceipt(s) {
  const d = modal(receiptHTML(s) + '<div class="actions"><button data-close>Close</button><button class="primary" id="pr">Print receipt</button></div>');
  $('#pr', d).onclick = () => window.print();
}

function pic(p, cls) { // product image, or a coloured initials tile when there is none
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
