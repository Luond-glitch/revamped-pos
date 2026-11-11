/* Shared reporting helpers for the Dashboard and Reports pages. Money is in cents, like the rest of the app.
   Load after api.js and app.js. */

   const IC = {
    dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    receipt: '<path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-2-2-3 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/>',
    trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    box: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    refund: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  };
  const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
  
  /* ---------- small helpers ---------- */
  const kes = c => { const v = c / 100, a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K' : String(Math.round(v)); };
  const money = c => (c / 100).toFixed(2);                                    // plain number for CSV files
  const dkey = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);   // YYYY-MM-DD, local time
  const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dayEnd = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const inRange = (list, a, b) => list.filter(s => { const t = new Date(s.createdAt); return t >= a && t <= b; });
  const lvl = p => p.stock <= 0 ? 'out' : p.stock <= p.reorder ? 'low' : 'ok';
  const METHOD_LABEL = { CASH: 'Cash', MPESA: 'M-Pesa', CARD: 'Card', BANK: 'Bank transfer', CREDIT: 'Pay later', SPLIT: 'Split' };
  const BRANCHES = { 'branch-1': 'Main branch' };                              // add friendly names here, e.g. 'branch-2': 'Westlands'
  const branchOf = s => s.branchId || CONFIG.BRANCH_ID;
  const branchName = id => BRANCHES[id] || id;
  const costMap = products => new Map(products.map(p => [p.id, p.cost || 0]));
  const cashIn = s => (s.payments || [{ method: s.method, amount: s.grandTotal }]).filter(p => p.method === 'CASH').reduce((t, p) => t + p.amount, 0);
  
  /* ---------- money maths ---------- */
  // Revenue, VAT, cost of goods and profit of ONE sale, after refunds. Profit = net sales - VAT - cost of goods sold.
  function figures(s, cost) {
    let tax = 0, cogs = 0, units = 0;
    s.items.forEach(l => { const q = l.quantity - (l.refundedQty || 0); if (q <= 0) return;
      units += q; tax += Math.round((l.taxAmount || 0) * q / l.quantity); cogs += (l.unitCost ?? cost.get(l.productId) ?? 0) * q; });
    const rev = net(s); return { rev, tax, cogs, units, profit: rev - tax - cogs };
  }
  function totals(sales, cost) {
    const t = { n: sales.length, gross: 0, disc: 0, refunds: 0, rev: 0, tax: 0, cogs: 0, profit: 0, units: 0 };
    sales.forEach(s => { const f = figures(s, cost); t.gross += s.grandTotal; t.disc += s.discountTotal || 0; t.refunds += s.refundTotal || 0;
      t.rev += f.rev; t.tax += f.tax; t.cogs += f.cogs; t.profit += f.profit; t.units += f.units; });
    t.avg = t.n ? Math.round(t.rev / t.n) : 0; t.margin = pct(t.profit, t.rev - t.tax); return t;
  }
  // Per-product totals (units, revenue, VAT, cost, profit, last sold) over a list of sales
  function productStats(sales, cost) {
    const m = new Map();
    sales.forEach(s => s.items.forEach(l => { const q = l.quantity - (l.refundedQty || 0); if (q <= 0) return;
      const r = m.get(l.productId) || { id: l.productId, name: l.name, qty: 0, rev: 0, tax: 0, cost: 0, profit: 0, last: 0 };
      const rev = Math.round(l.lineTotal * q / l.quantity), tax = Math.round((l.taxAmount || 0) * q / l.quantity), c = (l.unitCost ?? cost.get(l.productId) ?? 0) * q;
      r.qty += q; r.rev += rev; r.tax += tax; r.cost += c; r.profit += rev - tax - c; r.last = Math.max(r.last, +new Date(s.createdAt)); m.set(l.productId, r); }));
    return m;
  }
  function payMix(sales) {
    const m = {}; sales.forEach(s => (s.payments || [{ method: s.method, amount: s.grandTotal }]).forEach(p => m[p.method] = (m[p.method] || 0) + p.amount));
    return Object.entries(m).map(([k, value]) => ({ label: METHOD_LABEL[k] || k, value })).sort((a, b) => b.value - a.value);
  }
  
  /* ---------- daily / weekly / monthly / annual buckets ---------- */
  const MODES = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Annual' };
  function buckets(from, to, mode) {
    const out = []; let c = dayStart(from);
    if (mode === 'week') c = addDays(c, -((c.getDay() + 6) % 7));              // weeks start on Monday
    if (mode === 'month') c = new Date(c.getFullYear(), c.getMonth(), 1);
    if (mode === 'year') c = new Date(c.getFullYear(), 0, 1);
    const f = (d, o) => d.toLocaleDateString('en-KE', o);
    while (c <= to && out.length < 400) {
      const n = mode === 'day' ? addDays(c, 1) : mode === 'week' ? addDays(c, 7) : mode === 'month' ? new Date(c.getFullYear(), c.getMonth() + 1, 1) : new Date(c.getFullYear() + 1, 0, 1);
      out.push({ from: c, to: new Date(+n - 1),
        label: mode === 'month' ? f(c, { month: 'short', year: '2-digit' }) : mode === 'year' ? String(c.getFullYear()) : f(c, { day: 'numeric', month: 'short' }),
        long: mode === 'day' ? f(c, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : mode === 'week' ? 'Week of ' + f(c, { day: 'numeric', month: 'short', year: 'numeric' })
          : mode === 'month' ? f(c, { month: 'long', year: 'numeric' }) : String(c.getFullYear()),
        n: 0, gross: 0, disc: 0, refunds: 0, rev: 0, tax: 0, profit: 0 });
      c = n;
    }
    return out;
  }
  function series(sales, cost, from, to, mode) {
    const b = buckets(from, to, mode);
    sales.forEach(s => { const t = new Date(s.createdAt), k = b.find(x => t >= x.from && t <= x.to); if (!k) return; const f = figures(s, cost);
      k.n++; k.gross += s.grandTotal; k.disc += s.discountTotal || 0; k.refunds += s.refundTotal || 0; k.rev += f.rev; k.tax += f.tax; k.profit += f.profit; });
    return b;
  }
  
  /* ---------- charts (plain HTML/SVG, no library) ---------- */
  // Bars = net sales (or profit), line = gross profit. Scrolls sideways when there are many periods.
  function comboChart(b, o = {}) {
    const key = o.bar || 'rev', line = o.line !== false && key === 'rev', n = b.length, label = key === 'rev' ? 'Net sales' : 'Gross profit';
    if (!b.some(x => x.n)) return '<p class="empty">No sales in this period.</p>';
    const max = Math.max(1, ...b.map(x => Math.max(x[key], line ? x.profit : 0))) * 1.1, w = n * (n > 31 ? 22 : n > 12 ? 36 : 40);
    const pts = b.map((x, i) => `${((i + .5) / n * 100).toFixed(2)},${(100 - Math.max(x.profit, 0) / max * 100).toFixed(2)}`).join(' ');
    return `<div class="rp-scroll"><div class="rp-chart ${key === 'rev' ? '' : 'green'}" style="min-width:${w}px" role="img" aria-label="${label} by period, total ${esc(fmt(b.reduce((t, x) => t + x[key], 0)))}">
      <div class="rp-plot"><div class="rp-y"><span>${kes(max)}</span><span>${kes(max / 2)}</span></div>
        <div class="rp-bars">${b.map(x => `<div class="rp-col" title="${esc(x.long)}: ${label.toLowerCase()} ${esc(fmt(x[key]))}${line ? ' · profit ' + esc(fmt(x.profit)) : ''}"><i style="height:${(Math.max(x[key], 0) / max * 100).toFixed(1)}%;min-height:${x[key] > 0 ? 3 : 0}px"></i></div>`).join('')}</div>
        ${line ? `<svg class="rp-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>` : ''}</div>
      <div class="rp-x" style="grid-template-columns:repeat(${n},1fr)">${b.map(x => `<span>${esc(x.label)}</span>`).join('')}</div></div></div>
    <div class="iv-legend"><span><i style="background:${key === 'rev' ? 'var(--pos-blue)' : 'var(--pos-green)'}"></i>${label}</span>${line ? '<span><i style="background:var(--gold)"></i>Gross profit</span>' : ''}<span>Amounts in KES</span></div>`;
  }
  // Horizontal bars: items = [{ label, value, tone? }]
  function hbars(items, valFmt) {
    if (!items.length) return '<p class="empty">Nothing to show yet.</p>';
    const max = Math.max(1, ...items.map(i => i.value));
    return `<ul class="rp-hb">${items.map(i => `<li><span class="l" title="${esc(i.label)}">${esc(i.label)}</span><span class="t"><i class="${i.tone || ''}" style="width:${Math.max(2, i.value / max * 100).toFixed(1)}%"></i></span><b>${valFmt(i)}</b></li>`).join('')}</ul>`;
  }
  const PALETTE = ['#0a2463', '#1f9d55', '#f0a91d', '#1f5fd0', '#c62828', '#7c3aed'];
  function donut(items, centre, valFmt = fmt) {
    const tot = items.reduce((t, i) => t + i.value, 0); if (!tot) return '<p class="empty">No data in this period.</p>';
    let acc = 0; const stops = items.map((i, k) => { const a = acc / tot * 100; acc += i.value; return `${PALETTE[k % 6]} ${a.toFixed(2)}% ${(acc / tot * 100).toFixed(2)}%`; }).join(',');
    return `<div class="rp-donut" style="background:conic-gradient(${stops})" role="img" aria-label="${esc(items.map(i => i.label + ' ' + pct(i.value, tot) + '%').join(', '))}"><div><b>${centre.big}</b><small>${centre.small}</small></div></div>
    <ul class="iv-legend col">${items.map((i, k) => `<li><span><i style="background:${PALETTE[k % 6]}"></i>${esc(i.label)}</span><b>${valFmt(i.value)} <small>(${pct(i.value, tot)}%)</small></b></li>`).join('')}</ul>`;
  }
  
  /* ---------- cards, tables, files ---------- */
  const delta = (cur, prev, word) => { if (!prev) return `<small>${cur ? 'No sales ' + word : 'Nothing yet'}</small>`;
    const p = Math.round((cur - prev) / prev * 100); return `<small class="rp-delta ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% vs ${word}</small>`; };
  const statCard = (tone, icon, label, value, sub) => `<div class="iv-stat t-${tone}"><span class="ic">${ico(icon)}</span><span><small>${label}</small><b>${value}</b>${String(sub).startsWith('<') ? sub : `<small>${sub}</small>`}</span></div>`;
  // First column left-aligned, the rest right-aligned. `total` is an optional last row.
  function dataTable(head, rows, total) {
    const cells = r => r.map((c, i) => `<td class="${i ? 'n' : ''}">${c}</td>`).join('');
    return `<thead><tr>${head.map((h, i) => `<th class="${i ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cells(r)}</tr>`).join('') || `<tr><td colspan="${head.length}" class="empty">Nothing in this period.</td></tr>`}${total && rows.length ? `<tr class="rp-total">${cells(total)}</tr>` : ''}</tbody>`;
  }
  function downloadCsv(name, rows) {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const a = Object.assign(document.createElement('a'), { download: name + '-' + dkey(new Date()) + '.csv',
      href: URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' })) });
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }