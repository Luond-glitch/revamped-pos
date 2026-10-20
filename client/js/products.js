let all = [];
boot('products').then(() => { load(); $('#add').onclick = () => edit({ taxRate: 0, reorder: 10, category: 'General' }); $('#q').oninput = e => load(e.target.value); });
async function load(q = '') {
  all = await API.products(q);
  $('#rows').innerHTML = all.map(p => `<tr><td><div class="row" style="flex-wrap:nowrap;gap:10px">${pic(p, 'thumb')}${esc(p.name)}</div></td><td>${esc(p.sku)}</td><td>${esc(p.barcode)}</td><td class="n">${fmt(p.cost)}</td><td class="n">${fmt(p.price)}</td><td class="n">${p.taxRate}%</td><td><button data-id="${p.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No products yet. Add your first product.</td></tr>';
  $$('#rows button').forEach(b => b.onclick = () => edit(all.find(p => p.id === b.dataset.id)));
}
function edit(p) {
  let imgData = p.image || '';
  const d = modal(`<h2>${p.id ? 'Edit product' : 'Add product'}</h2>
    <label>Name<input id="name" value="${esc(p.name)}" required></label>
    <label>Product image<input id="img" type="file" accept="image/*"></label><div id="prev" style="margin:-4px 0 12px"></div>
    <div class="row"><label class="grow">SKU<input id="sku" value="${esc(p.sku)}"></label><label class="grow">Barcode<input id="barcode" value="${esc(p.barcode)}"></label></div>
    <div class="row"><label class="grow">Cost (KES)<input id="cost" type="number" min="0" step="0.01" value="${((p.cost || 0) / 100).toFixed(2)}"></label>
    <label class="grow">Selling price (KES)<input id="price" type="number" min="0" step="0.01" value="${((p.price || 0) / 100).toFixed(2)}"></label></div>
    <div class="row"><label class="grow">VAT included in price<select id="tax"><option value="0">0% (exempt)</option><option value="16">16%</option></select></label>
    <label class="grow">Reorder at<input id="reorder" type="number" min="0" value="${p.reorder}"></label></div>
    <div class="actions"><button data-close>Cancel</button><button class="primary" id="save">Save product</button></div>`);
  $('#tax', d).value = String(p.taxRate);
  const prev = () => { $('#prev', d).innerHTML = imgData ? `<div class="row" style="flex-wrap:nowrap"><img class="thumb" style="width:72px;height:72px" src="${esc(imgData)}" alt="Image preview"><button type="button" id="rm">Remove image</button></div>` : '<small class="sub">No image yet. A coloured placeholder is shown instead.</small>';
    if ($('#rm', d)) $('#rm', d).onclick = () => { imgData = ''; $('#img', d).value = ''; prev(); }; };
  $('#img', d).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { imgData = await shrink(f); prev(); } catch { toast('Could not read that image.', true); } };
  prev();
  $('#save', d).onclick = async () => { try {
    await API.saveProduct({ ...p, name: $('#name', d).value.trim(), sku: $('#sku', d).value.trim(), barcode: $('#barcode', d).value.trim(), category: p.category, image: imgData,
      cost: toCents($('#cost', d).value), price: toCents($('#price', d).value), taxRate: +$('#tax', d).value, reorder: +$('#reorder', d).value });
    d.close(); toast('Product saved'); load($('#q').value); } catch (e) { toast(e.message, true); } };
}
