let canCredit = false, customer = null, products = [], cart = [], saleKey = crypto.randomUUID(), shift = null, tab = 'all', cat = '';
const subtotal = () => cart.reduce((t, l) => t + l.p.price * l.qty, 0);   //  the server recalculates everything
const discount = () => { const v = parseFloat($('#disc').value) || 0, s = subtotal(); return Math.min(Math.max($('#dtype').value === 'pct' ? Math.round(s * v / 100) : toCents(v), 0), s); };
const total = () => subtotal() - discount();
const inCart = p => cart.find(l => l.p.id === p.id)?.qty || 0;

/* ---------- small icon set (stroke icons, no external files) ---------- */
const IC = {
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  drawer: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
// Buttons from the proposal design that need new backend features. They are shown disabled; delete a line to hide it.
const SOON = [['bag', 'Layaway'], ['drawer', 'Cash drawer'], ['dollar', 'Payout'], ['gift', 'Loyalty']];

boot('pos').then(async user => {
  canCredit = can(user, 'credit.sell');
  shift = await API.currentShift(); await search('');
  $('#banner').innerHTML = shift ? '' : '<div class="banner"><span>No shift is open. <a href="dashboard.html" style="color:#fff">Open a shift on the dashboard</a> before charging.</span></div>';
  const sb = $('#shiftb'); sb.textContent = shift ? 'Shift open' : 'No shift open'; sb.className = 'shiftb' + (shift ? '' : ' off');
  drawActions(user);
  $('#q').oninput = e => search(e.target.value);
  $('#q').onkeydown = e => { if (e.key !== 'Enter') return; const v = e.target.value.trim().toLowerCase();
    const hit = products.find(p => p.barcode === v || p.sku.toLowerCase() === v) || (products.length === 1 && products[0]);
    if (hit) { add(hit); e.target.value = ''; search(''); } else toast('No product matches that code.', true); };
  $('#clear').onclick = () => { if (cart.length && !confirm('Cancel this sale and clear the cart?')) return; cart = []; customer = null; chip(); $('#disc').value = ''; render(); };
  $('#disc').oninput = $('#dtype').onchange = totals;
  $('#pay').onclick = pay;
  $('#ct').onclick = () => { const o = $('#cart').classList.toggle('open'); $('#ct').setAttribute('aria-expanded', o); };
  const look = async () => { const v = $('#cust').value.trim(); if (!v) return; try { customer = await API.findCustomer(v); $('#cust').value = ''; chip(); } catch (e) { toast(e.message, true); } };
  $('#cl').onclick = look; $('#cust').onkeydown = e => { if (e.key === 'Enter') look(); };
  document.addEventListener('keydown', e => { if (e.key === 'F9') { e.preventDefault(); pay(); } if (e.key === 'F2') { e.preventDefault(); $('#q').focus(); } });
});

/* ---------- quick-action grid ---------- */
function drawActions(user) {
  const html = [['disc', 'tag', 'Discount'], ['cust', 'user', 'Client'], ['find', 'search', 'Search']]
    .map(([k, i, l]) => `<button class="act" type="button" data-act="${k}">${ico(i)}<span>${l}</span></button>`);
  if (can(user, 'sales.view')) html.push(`<a class="act" href="sales.html">${ico('clock')}<span>History / Refund</span></a>`);
  SOON.forEach(([i, l]) => html.push(`<button class="act" type="button" disabled title="Coming soon">${ico(i)}<span>${l}</span></button>`));
  $('#acts').innerHTML = html.join('');
  $('#acts').onclick = e => { const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'find') { $('#q').focus(); $('#q').scrollIntoView({ block: 'center' }); return; }
    $('#cart').classList.add('open'); $('#ct').setAttribute('aria-expanded', 'true');   // phones: open the sheet first
    $(b.dataset.act === 'disc' ? '#disc' : '#cust').focus(); };
}

/* ---------- products: tabs, categories, grid ---------- */
// Tabs are built from the data: "Categories" appears only if products carry a category,
// "Services" only if some products don't track stock (services).
const catOf = p => (p.category && (p.category.name || p.category)) || p.categoryName || '';
const isService = p => p.trackStock === false;
const shown = () => products.filter(p => tab === 'svc' ? isService(p) : tab === 'cat' && cat ? catOf(p) === cat : true);

async function search(q) { products = await API.products(q); drawTabs(); render(); }
function drawTabs() {
  const cats = [...new Set(products.map(catOf).filter(Boolean))];
  const T = [['all', 'All products']]; if (cats.length) T.push(['cat', 'Categories']); if (products.some(isService)) T.push(['svc', 'Services']);
  if (!T.some(t => t[0] === tab)) tab = 'all';
  if (tab === 'cat' && !cats.includes(cat)) cat = cats[0] || '';
  $('#tabs').style.display = T.length > 1 ? '' : 'none';
  $('#tabs').innerHTML = T.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
  $('#cats').innerHTML = tab === 'cat' ? cats.map(c => `<button type="button" class="${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('') : '';
  $$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; drawTabs(); drawGrid(); });
  $$('#cats button').forEach(b => b.onclick = () => { cat = b.dataset.c; drawTabs(); drawGrid(); });
}
function drawGrid() {
  $('#grid').innerHTML = shown().map(p => { const out = p.trackStock && p.stock - inCart(p) <= 0;
    return `<button class="ptile" data-id="${p.id}" ${out ? 'disabled' : ''}>${pic(p, 'pic')}<b>${esc(p.name)}</b><span>${fmt(p.price)}</span><small>${p.trackStock ? (out ? 'Out of stock' : p.stock + ' in stock') : 'Service'}</small></button>`; }).join('') || '<p class="empty">No products found.</p>';
  $$('#grid .ptile').forEach(b => b.onclick = () => add(products.find(p => p.id === b.dataset.id)));
}

/* ---------- cart ---------- */
function add(p) { if (p.trackStock && inCart(p) >= p.stock) return toast('No more ' + p.name + ' in stock.', true);
  const l = cart.find(l => l.p.id === p.id); l ? l.qty++ : cart.push({ p, qty: 1 }); render(); }
function totals() { saleKey = crypto.randomUUID();
  const n = cart.reduce((t, l) => t + l.qty, 0), label = 'Current sale · ' + n + (n === 1 ? ' item' : ' items');
  $('#ctl').textContent = label; $('#ctl2').textContent = label;
  $('#sub').textContent = fmt(subtotal()); $('#dsum').textContent = (discount() ? '−' : '') + fmt(discount()); $('#total').textContent = fmt(total());
  $('#pay').disabled = !cart.length || !shift; $('#clear').disabled = !cart.length; }
function render() {
  $('#lines').innerHTML = cart.map((l, i) => `<div class="cl"><span class="no">${i + 1}</span>
    <div class="qty"><button type="button" data-i="${i}" data-d="-1" aria-label="Less">−</button><span>${l.qty}</span><button type="button" data-i="${i}" data-d="1" aria-label="More">+</button></div>
    <div class="nm">${esc(l.p.name)}<small>${fmt(l.p.price)} each</small></div>
    <span class="pr n">${fmt(l.p.price)}</span><b class="tt n">${fmt(l.p.price * l.qty)}</b>
    <button type="button" class="rm" data-rm="${i}" aria-label="Remove ${esc(l.p.name)}">${ico('trash')}</button></div>`).join('') || '<p class="empty">Scan or tap a product to start.</p>';
  $$('#lines .qty button').forEach(b => b.onclick = () => { const l = cart[b.dataset.i]; const n = l.qty + +b.dataset.d;
    if (n > l.p.stock && l.p.trackStock) return toast('Only ' + l.p.stock + ' in stock.', true); l.qty = n; cart = cart.filter(x => x.qty > 0); render(); });
  $$('#lines .rm').forEach(b => b.onclick = () => { cart = cart.filter((_, j) => j !== +b.dataset.rm); render(); });
  totals(); drawGrid();
}

/* ---------- payment (unchanged logic) ---------- */
const METHODS = [['CASH', 'Cash'], ['MPESA', 'M-Pesa'], ['CARD', 'Card']];
const CREDIT = ['CREDIT', 'Pay later'];   // only for people allowed to sell on credit, and only when a client is on the sale
function pay() {
  if (!cart.length || !shift) return; const due = total(), disc = discount(), ms = canCredit && customer ? [...METHODS, CREDIT] : METHODS;
  const d = modal(`<h2>Payment</h2><div class="total"><span>Due</span><span>${fmt(due)}</span></div>
    ${ms.map(([m, l]) => `<div class="row" style="margin-bottom:8px;align-items:flex-end"><label style="margin:0;flex:1">${l} (KES)<input data-m="${m}" type="number" min="0" step="0.01" value="${m === 'CASH' ? (due / 100).toFixed(2) : ''}"></label>
      ${m === 'CASH' || m === 'CREDIT' ? `<div style="flex:1">${m === 'CREDIT' ? `<small>${esc(customer.name)} pays later</small>` : ''}</div>` : `<label style="margin:0;flex:1">${m === 'MPESA' ? 'M-Pesa code' : 'Card approval ref'}<input data-ref="${m}" autocomplete="off"></label>`}</div>`).join('')}
    <p id="chg" style="font-size:1.1rem;font-weight:600;min-height:1.5em"></p><div class="actions"><button data-close>Back</button><button class="primary" id="go">Complete sale</button></div>`);
  const amt = m => toCents($(`[data-m=${m}]`, d).value), ref = m => ($(`[data-ref=${m}]`, d)?.value || '').trim();
  const upd = () => { const paid = amt('CASH') + amt('MPESA') + amt('CARD') + (ms.length > METHODS.length ? amt('CREDIT') : 0), other = amt('MPESA') + amt('CARD') + (ms.length > METHODS.length ? amt('CREDIT') : 0), c = paid - due;
    const noRef = (amt('MPESA') > 0 && !ref('MPESA')) || (amt('CARD') > 0 && !ref('CARD'));
    $('#chg', d).textContent = c < 0 ? 'Short by ' + fmt(-c) : other > due ? 'Card and M-Pesa are more than the amount due' : noRef ? 'Enter the M-Pesa code or card reference' : c ? 'Change: ' + fmt(c) : ms.length > METHODS.length && amt('CREDIT') ? 'Balance owed by client: ' + fmt(amt('CREDIT')) : 'Paid in full';
    $('#go', d).disabled = c < 0 || other > due || noRef; };
  $$('input', d).forEach(i => i.oninput = upd); upd(); $('[data-m=CASH]', d).select();
  $('#go', d).onclick = async e => { e.target.disabled = true;   // idempotency key protects against double-clicks and retries
    try { const payments = ms.map(([m]) => ({ method: m, amount: amt(m), reference: ref(m) })).filter(p => p.amount > 0);
      const sale = await API.createSale({ branchId: CONFIG.BRANCH_ID, registerId: CONFIG.REGISTER_ID, idempotencyKey: saleKey, discount: disc, customerId: customer?.id || null, payments,
        items: cart.map(l => ({ productId: l.p.id, quantity: l.qty })) });
      d.close(); cart = []; customer = null; chip(); $('#disc').value = ''; await search(''); showReceipt(sale); }
    catch (err) { toast(err.message, true); e.target.disabled = false; } };
}
function chip() { $('#chip').innerHTML = customer ? `<span class="chip">Client: <b>${esc(customer.name)}</b><button id="nc" aria-label="Remove client">×</button></span>` : ''; if ($('#nc')) $('#nc').onclick = () => { customer = null; chip(); }; }