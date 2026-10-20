const router = require('express').Router();
const { z } = require('zod');
const { query, withTx } = require('../../db');
const { AppError, wrap, validate, isUuid } = require('../../errors');
const { requirePerm } = require('../../middleware/auth');
const audit = require('../../audit');

router.use(requirePerm('shifts.manage'));
const mine = (user, regId) => query(`SELECT s.id, (s.opening_cash*100)::bigint AS "openingCash", u.name AS cashier, s.opened_at AS "openedAt" FROM cashier_shifts s JOIN users u ON u.id = s.cashier_id
  WHERE s.cashier_id = $1 AND s.register_id = $2 AND s.closed_at IS NULL`, [user.id, regId]).then(r => r.rows[0] || null);
async function register(req) { // the till must belong to this user's branch
  if (!isUuid(req.params.id)) throw new AppError(404, 'Till not found.');
  const r = await query("SELECT r.id FROM registers r JOIN branches b ON b.id = r.branch_id WHERE r.id = $1 AND b.organisation_id = $2 AND r.branch_id = $3 AND r.status = 'active'", [req.params.id, req.user.orgId, req.user.branchId]);
  if (!r.rowCount) throw new AppError(404, 'Till not found.'); return r.rows[0].id;
}
router.get('/:id/shifts/current', wrap(async (req, res) => res.json(await mine(req.user, await register(req)))));

router.post('/:id/shifts/open', wrap(async (req, res) => {
  const { openingCash } = validate(z.object({ openingCash: z.number().int().min(0).max(1e10) }), req.body), reg = await register(req);
  await withTx(async c => {
    try {
      const id = (await c.query('INSERT INTO cashier_shifts (register_id, cashier_id, opening_cash) VALUES ($1,$2,$3::numeric/100) RETURNING id', [reg, req.user.id, openingCash])).rows[0].id;
      await audit(c, req, 'shift.open', 'shift', id, { openingCash });
    } catch (e) { throw e.code === '23505' ? new AppError(409, /register/.test(e.constraint) ? 'Someone already has a shift open on this till.' : 'You already have a shift open.') : e; }
  });
  res.status(201).json(await mine(req.user, reg));
}));

router.post('/:id/shifts/close', wrap(async (req, res) => {
  const { closingCash } = validate(z.object({ closingCash: z.number().int().min(0).max(1e10) }), req.body), reg = await register(req);
  const out = await withTx(async c => {
    const sh = (await c.query('SELECT id, (opening_cash*100)::bigint AS opening FROM cashier_shifts WHERE cashier_id = $1 AND register_id = $2 AND closed_at IS NULL FOR UPDATE', [req.user.id, reg])).rows[0];
    if (!sh) throw new AppError(400, 'No open shift.');
    // Expected drawer cash = opening + cash taken in sales (already net of change) - cash refunds paid out during this shift.
    const cash = (await c.query("SELECT COALESCE((SUM(p.amount)*100)::bigint, 0) AS v FROM payments p JOIN sales s ON s.id = p.sale_id WHERE s.shift_id = $1 AND p.method = 'CASH'", [sh.id])).rows[0].v;
    const refunds = (await c.query("SELECT COALESCE((SUM(total_amount)*100)::bigint, 0) AS v FROM refunds WHERE shift_id = $1 AND method = 'CASH'", [sh.id])).rows[0].v;
    const expected = sh.opening + cash - refunds;
    await c.query('UPDATE cashier_shifts SET closed_at = now(), closing_cash = $2::numeric/100, expected_cash = $3::numeric/100 WHERE id = $1', [sh.id, closingCash, expected]);
    await audit(c, req, 'shift.close', 'shift', sh.id, { expected, counted: closingCash, difference: closingCash - expected });
    return { expected, counted: closingCash, difference: closingCash - expected };
  });
  res.json(out);
}));
module.exports = router;
