/* Client area: a left menu (Shop, My basket, My purchases), the client's name and icon top right, and the light/dark switch. */
let me = null, items = [], basket = {};
const CI = { shop: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  buy: '<path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-2-2-3 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>' };
const ci = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${CI[n]}</svg>`;
const TABS = [['shop', 'Shop', 'shop'], ['cart', 'My basket', 'cart'], ['buy', 'My purchases', 'buy']];
(async () => { try { me = await API.clientMe(); } catch {} me ? home() : auth(); })();

// The top bar is the same for every client: brand on the left, light/dark switch and the client's icon and name on the right
function topbar() {
  return `<header class="cs-top"><a class="cs-brand" href="index.html" aria-label="Universal POS home">Universal<b>POS</b></a><span class="grow"></span>${themeButton()}
    ${me ? `<div class="cs-user"><button type="button" class="cs-chip" id="chip" aria-haspopup="true" aria-expanded="false"><span class="cs-ava">${ci('user')}</span><span class="cs-name">${esc(me.name)}</span></button>
      <div class="cs-menu" id="menu" hidden><div class="cs-who"><b>${esc(me.name)}</b><small>${esc(me.email || me.phone || '')}</small></div><button type="button" id="out">${ci('out')} Sign out</button></div></div>` : ''}</header>`;
}
function wireTop() {
  paintThemeButtons();
  if (!me) return;
  const chip = $('#chip'), menu = $('#menu'), set = open => { menu.hidden = !open; chip.setAttribute('aria-expanded', open); };
  chip.onclick = e => { e.stopPropagation(); set(menu.hidden); }; document.addEventListener('click', e => { if (!e.target.closest('.cs-user')) set(false); }); document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  $('#out').onclick = signOut;
}
async function signOut() { await API.clientLogout(); me = null; auth(); }

function auth(mode = 'in') {
  const up = mode === 'up';
  $('#app').innerHTML = topbar() + `<div class="cs-auth"><div class="authwrap"><div class="card"><h1>${up ? 'Create your account' : 'Welcome back'}</h1><p class="sub">${up ? 'Browse the shop and keep your receipts in one place.' : 'Sign in to browse and see your purchases.'}</p>
    <form id="f">${up ? '<label>Full name<input id="name" required autofocus></label><label>Phone<input id="phone" type="tel" required></label>' : ''}
    <label>Email<input id="email" type="email" required ${up ? '' : 'autofocus'}></label><label>Password${up ? ' (8+ characters)' : ''}<input id="pw" type="password" required minlength="${up ? 8 : 1}"></label>
    <p id="err" role="alert" style="color:var(--danger);min-height:1.2em;margin:0 0 8px"></p><button class="primary" style="width:100%">${up ? 'Create account' : 'Sign in'}</button></form>
    ${up ? '' : `<div style="margin:14px 0 0;padding:10px 12px;border:1px dashed #c9d1dc;border-radius:10px;font-size:.82rem;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div><small>Demo client</small><br><code>client@shop.co.ke / client123</code></div>
      <button type="button" id="demoUse">Use</button></div>`}
    <p class="sub" style="margin:12px 0 0">${up ? 'Already have an account?' : 'New here?'} <a href="#" id="sw">${up ? 'Sign in' : 'Create an account'}</a> · <a href="index.html">Back</a></p></div></div></div>`;
  wireTop();
  $('#sw').onclick = e => { e.preventDefault(); auth(up ? 'in' : 'up'); };
  // DEMO ONLY: remove this block (and the demo markup above) before going live
  if ($('#demoUse')) $('#demoUse').onclick = () => {
    $('#email').value = 'client@shop.co.ke'; $('#pw').value = 'client123';
    $('#err').textContent = ''; $('#f').requestSubmit();   // remove requestSubmit() to only fill the fields
  };
  $('#f').onsubmit = async e => { e.preventDefault(); try {
    me = up ? await API.clientSignup({ name: $('#name').value.trim(), phone: $('#phone').value.trim(), email: $('#email').value.trim(), password: $('#pw').value }) : await API.clientLogin($('#email').value, $('#pw').value);
    home(); } catch (x) { $('#err').textContent = x.message; } };
}
async function home(tab = 'shop') {
  loadBasket();
  $('#app').innerHTML = topbar() + `<div class="cs-frame"><aside class="cs-side"><nav id="tabs" aria-label="Client menu">${TABS.map(([k, l, i]) => `<button type="button" data-t="${k}" class="${k === tab ? 'on' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${ci(i)}<span>${l}</span>${k === 'cart' ? `<em class="cs-badge" id="cartCount" ${count() ? '' : 'hidden'}>${count()}</em>` : ''}</button>`).join('')}</nav>
    <button type="button" class="cs-signout" id="out2">${ci('out')}<span>Sign out</span></button></aside><section class="cs-main"><div id="body"></div></section></div>`;
  wireTop(); $('#out2').onclick = signOut;
  $$('#tabs [data-t]').forEach(b => b.onclick = () => home(b.dataset.t));
  try { tab === 'shop' ? await shop() : tab === 'cart' ? await cart() : await buys(); } catch (e) { toast(e.message, true); }
}
const bKey = () => 'pos_basket_' + me.id, count = () => Object.values(basket).reduce((a, b) => a + b, 0);
const loadBasket = () => { try { basket = JSON.parse(localStorage.getItem(bKey()) || '{}'); } catch { basket = {}; } };
function setQty(id, q) { if (q <= 0) delete basket[id]; else basket[id] = Math.min(q, 99);
  try { localStorage.setItem(bKey(), JSON.stringify(basket)); } catch {}
  const t = $('#cartCount'); if (t) { t.textContent = count(); t.hidden = !count(); } }
async function shop() {
  items = await API.clientProducts();
  $('#body').innerHTML = `<div class="cs-hero"><h1>Hello, ${esc(me.name.split(' ')[0])}</h1><p class="sub">Browse what we stock and see your receipts.</p>
    <label class="cs-search">${ci('search')}<input id="q" type="search" placeholder="Search products" aria-label="Search products" autocomplete="off"></label><p class="sub cs-hint">Tap a product to select it, then use + to add more.</p></div><div id="bar"></div><div class="shopgrid" id="g"></div>`;
  const bar = () => { const rows = items.filter(p => basket[p.id]), total = rows.reduce((t, p) => t + p.price * basket[p.id], 0);
    $('#bar').innerHTML = rows.length ? `<div class="bar"><span><b>${count()} item${count() > 1 ? 's' : ''}</b> in your basket · ${fmt(total)}</span><button class="primary" id="vb">View basket</button></div>` : '';
    if ($('#vb')) $('#vb').onclick = () => home('cart'); };
  const draw = () => { const q = $('#q').value.toLowerCase();
    $('#g').innerHTML = items.filter(p => p.name.toLowerCase().includes(q)).map(p => { const n = basket[p.id] || 0;
      return `<div class="card pcard ${n ? 'sel' : ''} ${p.inStock ? '' : 'out'}" data-id="${p.id}" tabindex="0" role="button" aria-pressed="${n > 0}">${pic(p, 'pic')}<b>${esc(p.name)}</b><span class="price">${fmt(p.price)}</span>
      ${!p.inStock ? '<span class="tag out" style="justify-self:start">Out of stock</span>' : n ? `<div class="stepper"><button data-a="-1" aria-label="Remove one ${esc(p.name)}">−</button><b aria-label="${n} selected">${n}</b><button data-a="1" aria-label="Add one more ${esc(p.name)}">+</button></div>` : '<span class="tag" style="justify-self:start">Tap to select</span>'}</div>`; }).join('') || '<p class="empty">No products match.</p>'; bar(); };
  const act = e => { const card = e.target.closest('.pcard'); if (!card) return; const id = card.dataset.id, p = items.find(x => x.id === id);
    if (!p.inStock) return toast(p.name + ' is out of stock.', true);
    const a = e.target.closest('[data-a]'); if (a) setQty(id, (basket[id] || 0) + +a.dataset.a); else if (!basket[id]) setQty(id, 1); else return; draw(); };
  $('#g').onclick = act; $('#g').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pcard')) { e.preventDefault(); act(e); } };
  $('#q').oninput = draw; draw();
}
async function cart() {
  items = await API.clientProducts(); Object.keys(basket).forEach(id => { if (!items.some(p => p.id === id)) delete basket[id]; }); setQty('', 0);
  const rows = items.filter(p => basket[p.id]), total = rows.reduce((t, p) => t + p.price * basket[p.id], 0);
  $('#body').innerHTML = `<div class="cs-title"><h1>My basket</h1><p class="sub">Your selection, ready to show at the till.</p></div>` + (rows.length ? `<div class="card">${rows.map(p => `<div class="line bl">${pic(p, 'thumb')}<div>${esc(p.name)}<br><small>${fmt(p.price)} each</small></div>
      <div class="qty"><button data-id="${p.id}" data-a="-1" aria-label="Remove one">−</button>${basket[p.id]}<button data-id="${p.id}" data-a="1" aria-label="Add one more">+</button></div><b>${fmt(p.price * basket[p.id])}</b><button data-rm="${p.id}" class="danger" aria-label="Remove ${esc(p.name)}">×</button></div>`).join('')}
    <div class="total"><span>Estimated total</span><span>${fmt(total)}</span></div>
    <p class="sub">Show this list at the till. Give your phone number or email so the purchase is saved to your account. Final prices are confirmed at checkout.</p>
    <div class="row"><button id="clr">Clear basket</button><button class="primary" id="more">Add more products</button></div></div>`
    : '<div class="card empty">Your basket is empty.<br><br><button class="primary" id="more">Browse products</button></div>');
  $$('#body [data-a]').forEach(b => b.onclick = () => { setQty(b.dataset.id, (basket[b.dataset.id] || 0) + +b.dataset.a); cart(); });
  $$('#body [data-rm]').forEach(b => b.onclick = () => { setQty(b.dataset.rm, 0); cart(); });
  if ($('#clr')) $('#clr').onclick = () => { Object.keys(basket).forEach(id => setQty(id, 0)); cart(); };
  $('#more').onclick = () => home('shop');
}
async function buys() {
  const list = await API.clientPurchases(), owed = list.reduce((t, s) => t + (s.balance || 0), 0);
  $('#body').innerHTML = `<div class="cs-title"><h1>My purchases</h1><p class="sub">${list.length ? list.length + (list.length === 1 ? ' receipt' : ' receipts') + (owed ? ' · you still owe ' + fmt(owed) : '') : 'Your receipts will appear here.'}</p></div>
    <div class="card"><table><thead><tr><th>Receipt</th><th>Date</th><th class="n">Total</th><th></th></tr></thead><tbody>${list.map(s => `<tr><td>${esc(s.receiptNumber)}</td><td>${when(s.createdAt)}</td><td class="n">${fmt(net(s))}</td><td><button data-id="${s.id}">View receipt</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No purchases yet. Give your phone number or email at the till so your purchases appear here.</td></tr>'}</tbody></table></div>`;
  $$('#body [data-id]').forEach(b => b.onclick = () => showReceipt(list.find(s => s.id === b.dataset.id)));
}