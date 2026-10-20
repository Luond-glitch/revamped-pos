const { query } = require('../../db');
const { AppError, isUuid } = require('../../errors');
// Sales as the browser expects them (cents). Cashiers without reports.read only ever see their own sales.
async function fetchSales(user, { where = '', params = [], limit = 1000 } = {}) {
  const args = [user.orgId, ...params]; let w = 's.organisation_id = $1' + (where ? ' AND ' + where : '');
  if (!user.permissions.includes('reports.read')) { args.push(user.id); w += ` AND s.cashier_id = $${args.length}`; }
  args.push(limit);
  const { rows } = await query(`
    SELECT s.id, s.receipt_number AS "receiptNumber", (s.subtotal*100)::bigint AS subtotal, (s.discount_total*100)::bigint AS "discountTotal", (s.tax_total*100)::bigint AS "taxTotal",
      (s.grand_total*100)::bigint AS "grandTotal", (s.tendered*100)::bigint AS tendered, (s.change_given*100)::bigint AS change, s.status, s.created_at AS "createdAt",
      u.name AS cashier, s.customer_id AS "customerId", COALESCE(c.name,'') AS "customerName",
      COALESCE((SELECT (SUM(r.total_amount)*100)::bigint FROM refunds r WHERE r.sale_id = s.id), 0) AS "refundTotal",
      (SELECT COALESCE(json_agg(json_build_object('productId', i.product_id, 'name', i.name, 'quantity', i.quantity, 'unitPrice', (i.unit_price*100)::bigint, 'unitCost', (i.unit_cost*100)::bigint,
         'taxAmount', (i.tax_amount*100)::bigint, 'lineTotal', (i.line_total*100)::bigint, 'refundedQty', i.refunded_qty) ORDER BY i.id), '[]'::json) FROM sale_items i WHERE i.sale_id = s.id) AS items,
      (SELECT COALESCE(json_agg(json_build_object('method', p.method, 'amount', (p.amount*100)::bigint, 'reference', COALESCE(p.provider_reference,'')) ORDER BY p.created_at, p.id), '[]'::json) FROM payments p WHERE p.sale_id = s.id) AS payments
    FROM sales s JOIN users u ON u.id = s.cashier_id LEFT JOIN customers c ON c.id = s.customer_id
    WHERE ${w} ORDER BY s.created_at DESC LIMIT $${args.length}`, args);
  return rows.map(s => ({ ...s, method: s.payments.length > 1 ? 'SPLIT' : (s.payments[0] || {}).method }));
}
async function getSale(user, id) {
  if (!isUuid(id)) throw new AppError(404, 'Sale not found.');
  const [s] = await fetchSales(user, { where: 's.id = $2', params: [id], limit: 1 });
  if (!s) throw new AppError(404, 'Sale not found.'); return s;
}
module.exports = { fetchSales, getSale };
