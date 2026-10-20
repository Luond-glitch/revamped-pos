const router = require('express').Router();
const { z } = require('zod');
const { query, withTx } = require('../../db');
const { AppError, wrap, validate } = require('../../errors');
const { requirePerm } = require('../../middleware/auth');
const audit = require('../../audit');
const { getProduct } = require('../products/queries');

router.get('/movements', requirePerm('inventory.read'), wrap(async (req, res) => {
  const { rows } = await query(`SELECT m.id, m.product_id AS "productId", p.name, m.movement_type AS type, m.quantity_delta AS delta, COALESCE(m.reason,'') AS reason, COALESCE(u.name,'') AS "by", m.created_at AS at
    FROM stock_movements m JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.created_by
    WHERE m.branch_id = $1 AND p.organisation_id = $2 ORDER BY m.created_at DESC LIMIT 100`, [req.user.branchId, req.user.orgId]);
  res.json(rows);
}));

const schema = z.object({ productId: z.string().uuid(), type: z.enum(['RECEIVE', 'ADJUSTMENT']), reason: z.string().trim().max(300).default(''),
  delta: z.number().int().refine(n => n !== 0, 'Enter a quantity.').refine(n => Math.abs(n) <= 1000000, 'Quantity is too large.') });

router.post('/adjustments', requirePerm('inventory.adjust'), wrap(async (req, res) => {
  const b = validate(schema, req.body), { orgId, branchId } = req.user;
  if (!branchId) throw new AppError(400, 'No branch is set up.');
  if (b.type === 'RECEIVE' && b.delta < 0) throw new AppError(400, 'Received quantity must be positive.');
  if (b.type === 'ADJUSTMENT' && !b.reason) throw new AppError(400, 'Give a reason for the adjustment.');
  await withTx(async c => { // balance + movement + audit change together or not at all
    if (!(await c.query('SELECT 1 FROM products WHERE id = $1 AND organisation_id = $2', [b.productId, orgId])).rowCount) throw new AppError(404, 'Product not found.');
    await c.query('INSERT INTO stock_balances (branch_id, product_id) VALUES ($1,$2) ON CONFLICT (branch_id, product_id) DO NOTHING', [branchId, b.productId]);
    const cur = await c.query('SELECT quantity_on_hand FROM stock_balances WHERE branch_id = $1 AND product_id = $2 FOR UPDATE', [branchId, b.productId]); // row lock: simultaneous changes queue up
    if (cur.rows[0].quantity_on_hand + b.delta < 0) throw new AppError(400, 'Stock cannot go below zero.');
    await c.query('UPDATE stock_balances SET quantity_on_hand = quantity_on_hand + $3 WHERE branch_id = $1 AND product_id = $2', [branchId, b.productId, b.delta]);
    await c.query('INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_delta, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [branchId, b.productId, b.type, b.delta, b.reason || (b.type === 'RECEIVE' ? 'Stock received' : null), req.user.id]);
    await audit(c, req, 'stock.' + b.type.toLowerCase(), 'product', b.productId, { delta: b.delta, reason: b.reason });
  });
  res.json(await getProduct(req.user, b.productId));
}));
module.exports = router;
