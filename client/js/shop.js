let me = null, items = [];
(async () => { try { me = await API.clientMe(); } catch {} me ? home() : auth(); })();
function auth(mode = 'in') {
  const up = mode === 'up';
  $('#app').innerHTML = `<div class="authwrap"><div class="card"><h1>${up ? 'Create your account' : 'Welcome back'}</h1><p class="sub">${up ? 'Browse the shop and keep your receipts in one place.' : 'Sign in to browse and see your purchases.'}</p>
    <form id="f">${up ? '<label>Full name<input id="name" required autofocus></label><label>Phone<input id="phone" type="tel" required></label>' : ''}
    <label>Email<input id="email" type="email" required ${up ? '' : 'autofocus'}></label><label>Password${up ? ' (8+ characters)' : ''}<input id="pw" type="password" required minlength="${up ? 8 : 1}"></label>
    <p id="err" role="alert" style="color:var(--danger);min-height:1.2em;margin:0 0 8px"></p><button class="primary" style="width:100%">${up ? 'Create account' : 'Sign in'}</button></form>
    <p class="sub" style="margin:12px 0 0">${up ? 'Already have an account?' : 'New here?'} <a href="#" id="sw">${up ? 'Sign in' : 'Create an account'}</a> · <a href="index.html">Back</a></p></div></div>`;
  $('#sw').onclick = e => { e.preventDefault(); auth(up ? 'in' : 'up'); };
  $('#f').onsubmit = async e => { e.preventDefault(); try {
    me = up ? await API.clientSignup({ name: $('#name').value.trim(), phone: $('#phone').value.trim(), email: $('#email').value.trim(), password: $('#pw').value }) : await API.clientLogin($('#email').value, $('#pw').value);
    home(); } catch (x) { $('#err').textContent = x.message; } };
}
async function home(tab = 'shop') {
  loadBasket();
  $('#app').innerHTML = `<div class="row" style="margin-bottom:6px"><div class="grow shophead"><h1>Hello, ${esc(me.name.split(' ')[0])}</h1><p class="sub">Browse what we stock and see your receipts.</p></div>
    <button data-t="shop" class="${tab === 'shop' ? 'primary' : ''}">Shop</button><button data-t="cart" id="cartTab" class="${tab === 'cart' ? 'primary' : ''}">My basket${count() ? ' (' + count() + ')' : ''}</button><button data-t="buy" class="${tab === 'buy' ? 'primary' : ''}">My purchases</button><button id="out">Sign out</button></div><div id="body"></div>`;
  $$('[data-t]').forEach(b => b.onclick = () => home(b.dataset.t));
  $('#out').onclick = async () => { await API.clientLogout(); me = null; auth(); };
  try { tab === 'shop' ? await shop() : tab === 'cart' ? await cart() : await buys(); } catch (e) { toast(e.message, true); }
}
let basket = {};
const bKey = () => 'pos_basket_' + me.id, count = () => Object.values(basket).reduce((a, b) => a + b, 0);
const loadBasket = () => { try { basket = JSON.parse(localStorage.getItem(bKey()) || '{}'); } catch { basket = {}; } };
function setQty(id, q) { if (q <= 0) delete basket[id]; else basket[id] = Math.min(q, 99);
  try { localStorage.setItem(bKey(), JSON.stringify(basket)); } catch {}
  const t = $('#cartTab'); if (t) t.textContent = 'My basket' + (count() ? ' (' + count() + ')' : ''); }
async function shop() {
  items = await API.clientProducts();
  $('#body').innerHTML = '<div id="bar"></div><input id="q" placeholder="Search products" style="max-width:340px"><p class="sub" style="margin:8px 0 0">Tap a product to select it, then use + to add more.</p><div class="shopgrid" id="g"></div>';
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
  $('#body').innerHTML = rows.length ? `<div class="card">${rows.map(p => `<div class="line bl">${pic(p, 'thumb')}<div>${esc(p.name)}<br><small>${fmt(p.price)} each</small></div>
      <div class="qty"><button data-id="${p.id}" data-a="-1" aria-label="Remove one">−</button>${basket[p.id]}<button data-id="${p.id}" data-a="1" aria-label="Add one more">+</button></div><b>${fmt(p.price * basket[p.id])}</b><button data-rm="${p.id}" class="danger" aria-label="Remove ${esc(p.name)}">×</button></div>`).join('')}
    <div class="total"><span>Estimated total</span><span>${fmt(total)}</span></div>
    <p class="sub">Show this list at the till. Give your phone number or email so the purchase is saved to your account. Final prices are confirmed at checkout.</p>
    <div class="row"><button id="clr">Clear basket</button><button class="primary" id="more">Add more products</button></div></div>`
    : '<div class="card empty">Your basket is empty.<br><br><button class="primary" id="more">Browse products</button></div>';
  $$('[data-a]').forEach(b => b.onclick = () => { setQty(b.dataset.id, (basket[b.dataset.id] || 0) + +b.dataset.a); cart(); });
  $$('[data-rm]').forEach(b => b.onclick = () => { setQty(b.dataset.rm, 0); cart(); });
  if ($('#clr')) $('#clr').onclick = () => { Object.keys(basket).forEach(id => setQty(id, 0)); cart(); };
  $('#more').onclick = () => home('shop');
}
async function buys() {
  const list = await API.clientPurchases();
  $('#body').innerHTML = `<div class="card"><table><thead><tr><th>Receipt</th><th>Date</th><th class="n">Total</th><th></th></tr></thead><tbody>${list.map(s => `<tr><td>${esc(s.receiptNumber)}</td><td>${when(s.createdAt)}</td><td class="n">${fmt(net(s))}</td><td><button data-id="${s.id}">View receipt</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No purchases yet. Give your phone number or email at the till so your purchases appear here.</td></tr>'}</tbody></table></div>`;
  $$('[data-id]').forEach(b => b.onclick = () => showReceipt(list.find(s => s.id === b.dataset.id)));
}
