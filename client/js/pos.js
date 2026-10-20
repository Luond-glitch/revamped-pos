let customer = null, products = [], cart = [], saleKey = crypto.randomUUID(), shift = null;
const subtotal = () => cart.reduce((t, l) => t + l.p.price * l.qty, 0);   // previews only; the server recalculates everything
const discount = () => { const v = parseFloat($('#disc').value) || 0, s = subtotal(); return Math.min(Math.max($('#dtype').value === 'pct' ? Math.round(s * v / 100) : toCents(v), 0), s); };
const total = () => subtotal() - discount();
const inCart = p => cart.find(l => l.p.id === p.id)?.qty || 0;

boot('pos').then(async () => {
  shift = await API.currentShift(); await search('');
  $('#banner').innerHTML = shift ? '' : '<div class="banner"><span>No shift is open. <a href="dashboard.html" style="color:#fff">Open a shift on the dashboard</a> before charging.</span></div>';
  $('#q').oninput = e => search(e.target.value);
  $('#q').onkeydown = e => { if (e.key !== 'Enter') return; const v = e.target.value.trim().toLowerCase();
    const hit = products.find(p => p.barcode === v || p.sku.toLowerCase() === v) || (products.length === 1 && products[0]);
    if (hit) { add(hit); e.target.value = ''; search(''); } else toast('No product matches that code.', true); };
  $('#clear').onclick = () => { cart = []; customer = null; chip(); $('#disc').value = ''; render(); };
  $('#disc').oninput = $('#dtype').onchange = totals;
  $('#pay').onclick = pay;
  $('#ct').onclick = () => { const o = $('#cart').classList.toggle('open'); $('#ct').setAttribute('aria-expanded', o); };
  const look = async () => { const v = $('#cust').value.trim(); if (!v) return; try { customer = await API.findCustomer(v); $('#cust').value = ''; chip(); } catch (e) { toast(e.message, true); } };
  $('#cl').onclick = look; $('#cust').onkeydown = e => { if (e.key === 'Enter') look(); };
  document.addEventListener('keydown', e => { if (e.key === 'F9') { e.preventDefault(); pay(); } if (e.key === 'F2') { e.preventDefault(); $('#q').focus(); } });
});

async function search(q) { products = await API.products(q); render(); }
function drawGrid() {
  $('#grid').innerHTML = products.map(p => `<button class="tile" data-id="${p.id}" ${p.trackStock && p.stock - inCart(p) <= 0 ? 'disabled' : ''}>${pic(p, 'pic')}<b>${esc(p.name)}</b><span>${fmt(p.price)}</span><small>${p.stock} in stock</small></button>`).join('') || '<p class="empty">No products found.</p>';
  $$('#grid .tile').forEach(b => b.onclick = () => add(products.find(p => p.id === b.dataset.id)));
}
function add(p) { if (p.trackStock && inCart(p) >= p.stock) return toast('No more ' + p.name + ' in stock.', true);
  const l = cart.find(l => l.p.id === p.id); l ? l.qty++ : cart.push({ p, qty: 1 }); render(); }
function totals() { saleKey = crypto.randomUUID(); { const n = cart.reduce((t, l) => t + l.qty, 0); $('#ctl').textContent = 'Current sale · ' + n + (n === 1 ? ' item' : ' items'); } $('#sub').textContent = fmt(subtotal()); $('#total').textContent = fmt(total()); $('#pay').disabled = !cart.length || !shift; }
function render() {
  $('#lines').innerHTML = cart.map((l, i) => `<div class="line"><div>${esc(l.p.name)}<br><small>${fmt(l.p.price)} each</small></div>
    <div class="qty"><button data-i="${i}" data-d="-1" aria-label="Less">−</button>${l.qty}<button data-i="${i}" data-d="1" aria-label="More">+</button></div><b>${fmt(l.p.price * l.qty)}</b></div>`).join('') || '<p class="empty">Scan or tap a product to start.</p>';
  $$('#lines .qty button').forEach(b => b.onclick = () => { const l = cart[b.dataset.i]; const n = l.qty + +b.dataset.d;
    if (n > l.p.stock && l.p.trackStock) return toast('Only ' + l.p.stock + ' in stock.', true); l.qty = n; cart = cart.filter(x => x.qty > 0); render(); });
  totals(); drawGrid();
}
const METHODS = [['CASH', 'Cash'], ['MPESA', 'M-Pesa'], ['CARD', 'Card']];
function pay() {
  if (!cart.length || !shift) return; const due = total(), disc = discount();
  const d = modal(`<h2>Payment</h2><div class="total"><span>Due</span><span>${fmt(due)}</span></div>
    ${METHODS.map(([m, l]) => `<div class="row" style="margin-bottom:8px;align-items:flex-end"><label style="margin:0;flex:1">${l} (KES)<input data-m="${m}" type="number" min="0" step="0.01" value="${m === 'CASH' ? (due / 100).toFixed(2) : ''}"></label>
      ${m === 'CASH' ? '<div style="flex:1"></div>' : `<label style="margin:0;flex:1">${m === 'MPESA' ? 'M-Pesa code' : 'Card approval ref'}<input data-ref="${m}" autocomplete="off"></label>`}</div>`).join('')}
    <p id="chg" style="font-size:1.1rem;font-weight:600;min-height:1.5em"></p><div class="actions"><button data-close>Back</button><button class="primary" id="go">Complete sale</button></div>`);
  const amt = m => toCents($(`[data-m=${m}]`, d).value), ref = m => ($(`[data-ref=${m}]`, d)?.value || '').trim();
  const upd = () => { const paid = amt('CASH') + amt('MPESA') + amt('CARD'), other = amt('MPESA') + amt('CARD'), c = paid - due;
    const noRef = (amt('MPESA') > 0 && !ref('MPESA')) || (amt('CARD') > 0 && !ref('CARD'));
    $('#chg', d).textContent = c < 0 ? 'Short by ' + fmt(-c) : other > due ? 'Card and M-Pesa are more than the amount due' : noRef ? 'Enter the M-Pesa code or card reference' : c ? 'Change: ' + fmt(c) : 'Paid in full';
    $('#go', d).disabled = c < 0 || other > due || noRef; };
  $$('input', d).forEach(i => i.oninput = upd); upd(); $('[data-m=CASH]', d).select();
  $('#go', d).onclick = async e => { e.target.disabled = true;   // idempotency key protects against double-clicks and retries
    try { const payments = METHODS.map(([m]) => ({ method: m, amount: amt(m), reference: ref(m) })).filter(p => p.amount > 0);
      const sale = await API.createSale({ branchId: CONFIG.BRANCH_ID, registerId: CONFIG.REGISTER_ID, idempotencyKey: saleKey, discount: disc, customerId: customer?.id || null, payments,
        items: cart.map(l => ({ productId: l.p.id, quantity: l.qty })) });
      d.close(); cart = []; customer = null; chip(); $('#disc').value = ''; await search(''); showReceipt(sale); }
    catch (err) { toast(err.message, true); e.target.disabled = false; } };
}
function chip() { $('#chip').innerHTML = customer ? `<span class="chip">Client: <b>${esc(customer.name)}</b><button id="nc" aria-label="Remove client">×</button></span>` : ''; if ($('#nc')) $('#nc').onclick = () => { customer = null; chip(); }; }
