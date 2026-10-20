const router = require('express').Router();
const { z } = require('zod');
const { query, withTx } = require('../../db');
const { AppError, wrap, validate, isUuid } = require('../../errors');
const { requirePerm } = require('../../middleware/auth');
const audit = require('../../audit');
const { SELECT, getProduct } = require('./queries');

const imageOk = v => v === '' || /^data:image\/(jpeg|png|webp|gif);base64,/.test(v) || /^https:\/\//.test(v);
const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  sku: z.string().trim().max(60).default(''), barcode: z.string().trim().max(60).default(''), category: z.string().trim().min(1).max(80).default('General'),
  cost: z.number().int().min(0).max(100000000), price: z.number().int().min(0).max(100000000),
  taxRate: z.number().min(0).max(100).default(0), reorder: z.number().int().min(0).max(1000000).default(0),
  image: z.string().max(700000).refine(imageOk, 'Image must be an uploaded picture').default(''),
});
const dup = e => e.code === '23505' ? new AppError(409, /barcode/.test(e.constraint) ? 'Barcode already exists.' : /sku/.test(e.constraint) ? 'SKU already exists.' : 'That already exists.') : e;
const categoryId = async (c, org, name) => (await c.query('INSERT INTO categories (organisation_id, name) VALUES ($1,$2) ON CONFLICT (organisation_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [org, name])).rows[0].id;

router.get('/', requirePerm('products.read'), wrap(async (req, res) => {
  const q = String(req.query.q || '').slice(0, 80), like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  const { rows } = await query(`${SELECT} WHERE p.organisation_id = $1 AND p.status = 'active'
    AND ($3::text = '' OR p.name ILIKE $4 OR p.sku ILIKE $4 OR COALESCE(p.barcode,'') ILIKE $4) ORDER BY lower(p.name)`, [req.user.orgId, req.user.branchId, q, like]);
  res.json(rows);
}));

router.post('/', requirePerm('products.write'), wrap(async (req, res) => {
  const b = validate(productSchema, req.body);
  const id = await withTx(async c => {
    try {
      const { rows } = await c.query(`INSERT INTO products (organisation_id, category_id, sku, name, barcode, cost_price, selling_price, tax_rate, reorder_level, image_url)
        VALUES ($1,$2,$3,$4,$5,$6::numeric/100,$7::numeric/100,$8,$9,$10) RETURNING id`,
        [req.user.orgId, await categoryId(c, req.user.orgId, b.category), b.sku || 'SKU-' + Date.now().toString(36).toUpperCase(), b.name, b.barcode || null, b.cost, b.price, b.taxRate, b.reorder, b.image || null]);
      await audit(c, req, 'product.create', 'product', rows[0].id, { name: b.name, price: b.price }); return rows[0].id;
    } catch (e) { throw dup(e); }
  });
  res.status(201).json(await getProduct(req.user, id));
}));

router.patch('/:id', requirePerm('products.write'), wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw new AppError(404, 'Product not found.');
  const b = validate(productSchema.partial(), req.body), sets = [], vals = [req.params.id, req.user.orgId], add = (col, val, cents) => { vals.push(val); sets.push(`${col} = $${vals.length}${cents ? '::numeric/100' : ''}`); };
  if (b.name !== undefined) add('name', b.name); if (b.sku) add('sku', b.sku); if (b.barcode !== undefined) add('barcode', b.barcode || null);
  if (b.cost !== undefined) add('cost_price', b.cost, true); if (b.price !== undefined) add('selling_price', b.price, true);
  if (b.taxRate !== undefined) add('tax_rate', b.taxRate); if (b.reorder !== undefined) add('reorder_level', b.reorder); if (b.image !== undefined) add('image_url', b.image || null);
  await withTx(async c => {
    if (b.category !== undefined) add('category_id', await categoryId(c, req.user.orgId, b.category));
    if (!sets.length) throw new AppError(400, 'Nothing to update.');
    try {
      const r = await c.query(`UPDATE products SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND organisation_id = $2 RETURNING id`, vals);
      if (!r.rowCount) throw new AppError(404, 'Product not found.');
      await audit(c, req, 'product.update', 'product', req.params.id, { fields: Object.keys(b).filter(k => k !== 'image'), price: b.price, cost: b.cost });
    } catch (e) { throw dup(e); }
  });
  res.json(await getProduct(req.user, req.params.id));
}));
module.exports = router;
