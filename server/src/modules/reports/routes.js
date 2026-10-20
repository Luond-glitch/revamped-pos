const router = require('express').Router();
const { wrap, AppError } = require('../../errors');
const { requirePerm } = require('../../middleware/auth');
const { fetchSales } = require('../sales/queries');

// Newest sales first. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=. Cashiers only get their own sales.
router.get('/sales', requirePerm('sales.read'), wrap(async (req, res) => {
  const params = [], where = [], day = /^\d{4}-\d{2}-\d{2}$/;
  if (req.query.from) { if (!day.test(req.query.from)) throw new AppError(400, 'Bad from date.'); params.push(req.query.from); where.push(`s.created_at >= $${params.length + 1}::date`); }
  if (req.query.to) { if (!day.test(req.query.to)) throw new AppError(400, 'Bad to date.'); params.push(req.query.to); where.push(`s.created_at < ($${params.length + 1}::date + 1)`); }
  res.json(await fetchSales(req.user, { where: where.join(' AND '), params, limit: Math.min(parseInt(req.query.limit, 10) || 1000, 5000) }));
}));
module.exports = router;
