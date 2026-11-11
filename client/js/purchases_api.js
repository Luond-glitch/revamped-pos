/* Purchasing API extension (Module 4). Load it right AFTER api.js and BEFORE app.js.
   It adds to the existing API object, so api.js itself is not edited:
     · saveSupplier         – now also edits, and keeps contact person, address, KRA PIN and payment terms
     · createPurchaseOrder  – now also keeps expected delivery date, supplier reference and notes
     · receivePurchaseOrder – now also writes a goods-received note (GRN) with the supplier invoice details
     · cancelPurchaseOrder  – new: cancels an order that has nothing received yet
     · goodsReceived        – new: lists the goods-received notes
   Mock mode keeps everything in the same browser database. Real mode uses the REST routes in REAL below,
   which your server needs to provide (same routes as before, plus the three new fields and two new routes). */
   (() => {
    const REAL = {
      saveSupplier: s => s.id ? RealAPI.req('PATCH', '/suppliers/' + s.id, s) : RealAPI.req('POST', '/suppliers', s),
      createPurchaseOrder: o => RealAPI.req('POST', '/purchase-orders', o),                       // body may now include expectedDate, reference, notes
      receivePurchaseOrder: (id, r) => RealAPI.req('POST', '/purchase-orders/' + id + '/receipts', r), // body may now include invoiceNo, invoiceDate, invoiceAmount, note
      cancelPurchaseOrder: (id, reason) => RealAPI.req('POST', '/purchase-orders/' + id + '/cancel', { reason }),
      goodsReceived: () => RealAPI.req('GET', '/goods-received'),
    };
  
    const KEY = 'pos_db', uid = () => crypto.randomUUID();
    const wait = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 60));
    const fail = m => new Promise((_, j) => setTimeout(() => j(new Error(m)), 60));
    const me = () => JSON.parse(sessionStorage.getItem('pos_user') || 'null');
    const read = async () => { await MockAPI.products(); return JSON.parse(localStorage.getItem(KEY)); };   // products() makes sure the database exists and is up to date
    const write = d => localStorage.setItem(KEY, JSON.stringify(d));
    const actor = d => { const s = me(); return s && d.users.find(u => u.id === s.id && u.status !== 'inactive'); };
    const can = (d, p) => { const a = actor(d); return !!a && (d.roles[a.role] || []).includes(p); };
    const log = (d, action, detail) => { const a = actor(d); (d.audit ||= []).unshift({ id: uid(), at: new Date().toISOString(), userId: a?.id || null, user: a?.name || 'Unknown', action, detail }); };
    const deny = w => fail('You do not have permission to ' + w + '.');
  
    const origCreate = API.createPurchaseOrder.bind(API), origReceive = API.receivePurchaseOrder.bind(API);
  
    const MOCK = {
      async saveSupplier(s) {
        const d = await read(); if (!can(d, 'purchases.manage')) return deny('manage suppliers');
        d.suppliers ||= []; const name = (s.name || '').trim(), email = (s.email || '').trim().toLowerCase();
        if (!name) return fail('Supplier name is required.');
        if (email && !/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email address.');
        if (d.suppliers.some(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== s.id)) return fail('A supplier with that name already exists.');
        const terms = Number.isFinite(+s.terms) && s.terms !== '' && s.terms != null ? Math.max(0, Math.round(+s.terms)) : 30;
        const rec = { name, phone: (s.phone || '').replace(/\s/g, ''), email, contact: (s.contact || '').trim(), address: (s.address || '').trim(), pin: (s.pin || '').trim().toUpperCase(), terms, notes: (s.notes || '').trim() };
        if (s.id) {
          const x = d.suppliers.find(y => y.id === s.id); if (!x) return fail('Supplier not found.');
          Object.assign(x, rec); (d.pos || []).forEach(o => { if (o.supplierId === x.id) o.supplierName = name; }); log(d, 'SUPPLIER_EDIT', name);
        } else { d.suppliers.push({ id: uid(), ...rec, createdAt: new Date().toISOString() }); log(d, 'SUPPLIER_ADD', name); }
        write(d); return wait(rec);
      },
      async createPurchaseOrder(o) {
        const po = await origCreate(o), d = await read(), x = (d.pos || []).find(p => p.id === po.id);
        if (x) { x.expectedDate = o.expectedDate || ''; x.reference = (o.reference || '').trim(); x.notes = (o.notes || '').trim(); log(d, 'PO_CREATE', x.number + ' · ' + x.supplierName); write(d); }
        return po;
      },
      async receivePurchaseOrder(id, r) {
        const po = await origReceive(id, r), d = await read(), o = (d.pos || []).find(x => x.id === id);   // origReceive throws when it fails, so no note is written then
        const lines = (r.items || []).filter(i => i.quantity > 0).map(i => { const l = o.items.find(x => x.productId === i.productId); return { productId: i.productId, name: l.name, quantity: i.quantity, unitCost: l.unitCost }; });
        d.grns ||= []; d.grnSeq ||= 0;
        const g = { id: uid(), number: 'GRN-' + String(++d.grnSeq).padStart(4, '0'), poId: id, poNumber: o.number, supplierId: o.supplierId, supplierName: o.supplierName, items: lines,
          value: lines.reduce((t, l) => t + l.quantity * l.unitCost, 0), invoiceNo: (r.invoiceNo || '').trim(), invoiceDate: r.invoiceDate || '', invoiceAmount: r.invoiceAmount > 0 ? Math.round(r.invoiceAmount) : 0,
          note: (r.note || '').trim(), at: new Date().toISOString(), by: actor(d)?.name || '' };
        d.grns.unshift(g); log(d, 'GOODS_RECEIVED', g.number + ' · ' + o.number + ' · ' + lines.reduce((t, l) => t + l.quantity, 0) + ' units'); write(d); return po;
      },
      async cancelPurchaseOrder(id, reason) {
        const d = await read(); if (!can(d, 'purchases.manage')) return deny('cancel purchase orders');
        const o = (d.pos || []).find(x => x.id === id); if (!o) return fail('Purchase order not found.');
        if (o.status !== 'ORDERED' || o.items.some(l => l.received > 0)) return fail('Only an order with nothing received can be cancelled.');
        if (!(reason || '').trim()) return fail('Give a reason for cancelling.');
        Object.assign(o, { status: 'CANCELLED', cancelReason: reason.trim(), cancelledBy: actor(d).name, cancelledAt: new Date().toISOString() }); log(d, 'PO_CANCEL', o.number + ' · ' + reason.trim()); write(d); return wait(o);
      },
      async goodsReceived() { const d = await read(); if (!can(d, 'purchases.manage')) return deny('see goods received'); return wait(d.grns || []); },
    };
  
    Object.assign(API, CONFIG.USE_MOCK ? MOCK : REAL);
  })();