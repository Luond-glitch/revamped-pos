const crypto = require('crypto');
const router = require('express').Router();
const { z } = require('zod');
const { withTx } = require('../../db');
const { AppError, wrap, validate, isUuid } = require('../../errors');
const { requirePerm } = require('../../middleware/auth');
const audit = require('../../audit');
const { priceLines, settle, DISCOUNT_LIMIT_PCT } = require('./pricing');
const { getSale } = require('./queries');

const saleSchema = z.object({
  idempotencyKey: z.string().min(8).max(100), customerId: z.string().uuid().nullable().optional(), discount: z.number().int().min(0).default(0),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10000) })).min(1, 'Cart is empty.').max(200),
  payments: z.array(z.object({ method: z.enum(['CASH', 'MPESA', 'CARD']), amount: z.number().int().min(1).max(1e9), reference: z.string().trim().max(60).default('') })).min(1, 'Enter a payment.').max(5),
});

async function createSale(c, user, b) {
  const { orgId, branchId } = user; if (!branchId) throw new AppError(400, 'No branch is set up.');
  // 1. Idempotency: the same key + same request returns the original sale instead of making a second one.
  const hash = crypto.createHash('sha256').update(JSON.stringify({ i: [...b.items].sort((x, y) => x.productId.localeCompare(y.productId)), p: b.payments, d: b.discount, c: b.customerId || null })).digest('hex');
  if (!(await c.query('INSERT INTO idempotency_keys (organisation_id, key, request_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key', [orgId, b.idempotencyKey, hash])).rowCount) {
    const ex = (await c.query('SELECT request_hash, response_reference FROM idempotency_keys WHERE organisation_id = $1 AND key = $2', [orgId, b.idempotencyKey])).rows[0];
    if (ex.request_hash !== hash) throw new AppError(422, 'This request id was already used for a different sale.');
    if (ex.response_reference) return { saleId: ex.response_reference, replay: true };
    throw new AppError(409, 'This sale is still being processed. Try again.');
  }
  // 2. A shift must be open.
  const shift = (await c.query('SELECT id, register_id FROM cashier_shifts WHERE cashier_id = $1 AND closed_at IS NULL', [user.id])).rows[0];
  if (!shift) throw new AppError(400, 'Open a shift before selling.');
  // 3. Prices come from the database, never from the browser.
  const qty = new Map(); b.items.forEach(i => qty.set(i.productId, (qty.get(i.productId) || 0) + i.quantity));
  const order = [...qty.keys()], sorted = [...order].sort();
  const prods = (await c.query(`SELECT id, name, (selling_price*100)::bigint AS price, (cost_price*100)::bigint AS cost, tax_rate::float8 AS rate, track_stock FROM products
    WHERE organisation_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`, [orgId, order])).rows;
  if (prods.length !== order.length) throw new AppError(400, 'One of the products is no longer available.');
  const byId = new Map(prods.map(p => [p.id, p]));
  // 4. Lock the stock rows (always in the same order, so two sales cannot deadlock) and check there is enough.
  const onHand = new Map((await c.query('SELECT product_id, quantity_on_hand FROM stock_balances WHERE branch_id = $1 AND product_id = ANY($2::uuid[]) ORDER BY product_id FOR UPDATE', [branchId, sorted])).rows.map(r => [r.product_id, r.quantity_on_hand]));
  for (const id of order) { const p = byId.get(id), have = onHand.get(id) || 0; if (p.track_stock && have < qty.get(id)) throw new AppError(409, `Not enough stock: ${p.name} (${have} left).`); }
  // 5. Totals, discount rule, payments.
  const priced = priceLines(order.map(id => ({ lt: byId.get(id).price * qty.get(id), rate: byId.get(id).rate })), b.discount);
  if (b.discount * 100 > priced.sub * DISCOUNT_LIMIT_PCT && !user.permissions.includes('sales.discount_large')) throw new AppError(403, `Discounts above ${DISCOUNT_LIMIT_PCT}% need a manager.`);
  const pay = settle(priced.total, b.payments);
  if (b.customerId && !(await c.query('SELECT 1 FROM customers WHERE id = $1 AND organisation_id = $2', [b.customerId, orgId])).rowCount) throw new AppError(400, 'Client not found.');
  const cur = (await c.query('SELECT currency_code FROM organisations WHERE id = $1', [orgId])).rows[0].currency_code;
  const n = (await c.query('INSERT INTO receipt_counters (branch_id, last_number) VALUES ($1, 1) ON CONFLICT (branch_id) DO UPDATE SET last_number = receipt_counters.last_number + 1 RETURNING last_number', [branchId])).rows[0].last_number;
  // 6. Write everything. Any failure above or below rolls the whole sale back.
  const sale = (await c.query(`INSERT INTO sales (organisation_id, branch_id, register_id, shift_id, cashier_id, customer_id, receipt_number, currency_code, subtotal, discount_total, tax_total, grand_total, tendered, change_given)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric/100,$10::numeric/100,$11::numeric/100,$12::numeric/100,$13::numeric/100,$14::numeric/100) RETURNING id`,
    [orgId, branchId, shift.register_id, shift.id, user.id, b.customerId || null, 'R-' + String(n).padStart(6, '0'), cur, priced.total - priced.tax, b.discount, priced.tax, priced.total, pay.paid, pay.change])).rows[0].id;
  for (const [i, id] of order.entries()) {
    const p = byId.get(id), q = qty.get(id), l = priced.lines[i];
    await c.query(`INSERT INTO sale_items (sale_id, product_id, name, quantity, unit_price, unit_cost, discount_amount, tax_amount, line_total)
      VALUES ($1,$2,$3,$4,$5::numeric/100,$6::numeric/100,$7::numeric/100,$8::numeric/100,$9::numeric/100)`, [sale, id, p.name, q, p.price, p.cost, l.discount, l.tax, l.lineTotal]);
    if (p.track_stock) {
      await c.query('UPDATE stock_balances SET quantity_on_hand = quantity_on_hand - $3 WHERE branch_id = $1 AND product_id = $2', [branchId, id, q]);
      await c.query("INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_delta, reference_type, reference_id, reason, created_by) VALUES ($1,$2,'SALE',$3,'sale',$4,'Sale',$5)", [branchId, id, -q, sale, user.id]);
    }
  }
  try { for (const p of pay.recorded) await c.query('INSERT INTO payments (sale_id, method, amount, currency_code, provider_reference) VALUES ($1,$2,$3::numeric/100,$4,$5)', [sale, p.method, p.amount, cur, p.reference ? p.reference.toUpperCase() : null]); }
  catch (e) { throw e.code === '23505' ? new AppError(409, 'That M-Pesa code was already used on another sale.') : e; }
  await c.query("UPDATE idempotency_keys SET response_reference = $3, status = 'completed' WHERE organisation_id = $1 AND key = $2", [orgId, b.idempotencyKey, sale]);
  await audit(c, { user }, 'sale.create', 'sale', sale, { total: priced.total, discount: b.discount, methods: pay.recorded.map(p => p.method) });
  return { saleId: sale, replay: false };
}

router.post('/', requirePerm('sales.create'), wrap(async (req, res) => {
  const { saleId, replay } = await withTx(c => createSale(c, req.user, validate(saleSchema, req.body)));
  res.status(replay ? 200 : 201).json(await getSale(req.user, saleId));
}));
router.get('/:id', requirePerm('sales.read'), wrap(async (req, res) => res.json(await getSale(req.user, req.params.id))));

const refundSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason for the refund.').max(300),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(0).max(10000) })).min(1).max(200) });
router.post('/:id/refunds', requirePerm('sales.refund'), wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw new AppError(404, 'Sale not found.');
  const b = validate(refundSchema, req.body), want = new Map(); b.items.forEach(i => i.quantity > 0 && want.set(i.productId, (want.get(i.productId) || 0) + i.quantity));
  if (!want.size) throw new AppError(400, 'Choose at least one item to refund.');
  await withTx(async c => {
    const s = (await c.query('SELECT id, branch_id FROM sales WHERE id = $1 AND organisation_id = $2 FOR UPDATE', [req.params.id, req.user.orgId])).rows[0];
    if (!s) throw new AppError(404, 'Sale not found.');
    const lines = (await c.query('SELECT id, product_id, name, quantity, refunded_qty, (line_total*100)::bigint AS total FROM sale_items WHERE sale_id = $1 ORDER BY id FOR UPDATE', [s.id])).rows;
    const done = new Map((await c.query('SELECT ri.sale_item_id AS id, (SUM(ri.amount)*100)::bigint AS amt FROM refund_items ri JOIN sale_items si ON si.id = ri.sale_item_id WHERE si.sale_id = $1 GROUP BY ri.sale_item_id', [s.id])).rows.map(r => [r.id, r.amt]));
    const track = new Map((await c.query('SELECT id, track_stock FROM products WHERE id = ANY($1::uuid[])', [lines.map(l => l.product_id)])).rows.map(r => [r.id, r.track_stock]));
    let total = 0; const picks = [];
    for (const [pid, q] of want) {
      const l = lines.find(x => x.product_id === pid); if (!l) throw new AppError(400, 'That item is not on this sale.');
      const left = l.quantity - l.refunded_qty; if (q > left) throw new AppError(400, `Only ${left} of ${l.name} can still be refunded.`);
      const amt = q === left ? l.total - (done.get(l.id) || 0) : Math.round(l.total * q / l.quantity); // final refund takes the exact remainder, so rounding never over-refunds
      picks.push({ l, q, amt }); total += amt;
    }
    const shift = (await c.query('SELECT id FROM cashier_shifts WHERE cashier_id = $1 AND closed_at IS NULL', [req.user.id])).rows[0];
    const refund = (await c.query('INSERT INTO refunds (sale_id, approved_by, shift_id, reason, total_amount) VALUES ($1,$2,$3,$4,$5::numeric/100) RETURNING id', [s.id, req.user.id, shift ? shift.id : null, b.reason, total])).rows[0].id;
    for (const { l, q, amt } of picks) {
      await c.query('INSERT INTO refund_items (refund_id, sale_item_id, quantity, amount) VALUES ($1,$2,$3,$4::numeric/100)', [refund, l.id, q, amt]);
      await c.query('UPDATE sale_items SET refunded_qty = refunded_qty + $2 WHERE id = $1', [l.id, q]);
      if (track.get(l.product_id)) {
        await c.query('INSERT INTO stock_balances (branch_id, product_id, quantity_on_hand) VALUES ($1,$2,$3) ON CONFLICT (branch_id, product_id) DO UPDATE SET quantity_on_hand = stock_balances.quantity_on_hand + EXCLUDED.quantity_on_hand', [s.branch_id, l.product_id, q]);
        await c.query("INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_delta, reference_type, reference_id, reason, created_by) VALUES ($1,$2,'REFUND',$3,'refund',$4,$5,$6)", [s.branch_id, l.product_id, q, refund, 'Refund: ' + b.reason, req.user.id]);
      }
    }
    const picked = new Map(picks.map(p => [p.l.id, p.q]));
    await c.query('UPDATE sales SET status = $2 WHERE id = $1', [s.id, lines.every(l => l.refunded_qty + (picked.get(l.id) || 0) >= l.quantity) ? 'REFUNDED' : 'PARTIALLY_REFUNDED']);
    await audit(c, req, 'sale.refund', 'sale', s.id, { total, reason: b.reason });
  });
  res.json(await getSale(req.user, req.params.id));
}));
module.exports = router;
