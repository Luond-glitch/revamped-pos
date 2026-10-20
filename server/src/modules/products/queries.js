const { query } = require('../../db');
const { AppError, isUuid } = require('../../errors');
// Prices leave the database as whole cents (what the browser uses); $2 is the branch whose stock to show.
const SELECT = `SELECT p.id, p.sku, p.name, COALESCE(p.barcode,'') AS barcode, COALESCE(c.name,'General') AS category,
  (p.selling_price*100)::bigint AS price, (p.cost_price*100)::bigint AS cost, p.tax_rate::float8 AS "taxRate", p.reorder_level AS reorder,
  p.track_stock AS "trackStock", COALESCE(p.image_url,'') AS image, COALESCE(sb.quantity_on_hand,0) AS stock
  FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN stock_balances sb ON sb.product_id = p.id AND sb.branch_id = $2`;
async function getProduct(user, id) {
  if (!isUuid(id)) throw new AppError(404, 'Product not found.');
  const { rows } = await query(`${SELECT} WHERE p.organisation_id = $1 AND p.id = $3`, [user.orgId, user.branchId, id]);
  if (!rows[0]) throw new AppError(404, 'Product not found.'); return rows[0];
}
module.exports = { SELECT, getProduct };
