require('./config'); const bcrypt = require('bcryptjs'); const { pool, withTx } = require('./db');
const PERMS = [['products.read', 'View products'], ['products.write', 'Add and edit products'], ['inventory.read', 'View stock history'], ['inventory.adjust', 'Receive and adjust stock'],
  ['sales.create', 'Make sales'], ['sales.read', 'View sales'], ['sales.refund', 'Approve refunds'], ['shifts.manage', 'Open and close shifts'], ['reports.read', 'View reports'],
  ['purchases.manage', 'Manage suppliers and purchase orders'], ['customers.read', 'Look up clients'], ['customers.manage', 'Manage clients'], ['users.manage', 'Manage staff'], ['sales.discount_large', 'Give discounts above the cashier limit']];
const CASHIER = ['products.read', 'sales.create', 'sales.read', 'shifts.manage', 'customers.read'];
const PRODUCTS = [['Maize flour 2kg','MF2','6001',21000,19000,0,40],['Sugar 1kg','SG1','6002',18500,16500,0,35],['Cooking oil 1L','OIL1','6003',32000,28500,16,24],['Fresh milk 500ml','ML5','6004',6500,5500,0,60],
  ['Bread 400g','BR4','6005',6500,5300,0,30],['Eggs tray (30)','EG30','6006',51000,46000,0,12],['Rice 1kg','RC1','6007',20000,17500,0,28],['Tea leaves 250g','TL25','6008',12000,10000,16,22],
  ['Bar soap','SP1','6009',9500,7500,16,45],['Tissue 4-pack','TS4','6010',17000,14000,16,18],['Soda 500ml','SD5','6011',5500,4000,16,70],['Drinking water 1L','WT1','6012',10000,7000,0,50]];
(async () => {
  await withTx(async c => {
    for (const [code, d] of PERMS) await c.query('INSERT INTO permissions (code, description) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING', [code, d]);
    if ((await c.query("SELECT 1 FROM organisations WHERE name = 'Demo Shop'")).rowCount) return console.log('Demo data already present; nothing to do.');
    const org = (await c.query("INSERT INTO organisations (name) VALUES ('Demo Shop') RETURNING id")).rows[0].id;
    const branch = (await c.query("INSERT INTO branches (organisation_id, name) VALUES ($1,'Main Branch') RETURNING id", [org])).rows[0].id;
    await c.query("INSERT INTO registers (branch_id, name) VALUES ($1,'Till 1')", [branch]);
    const roles = {}; for (const n of ['manager', 'cashier']) roles[n] = (await c.query('INSERT INTO roles (organisation_id, name) VALUES ($1,$2) RETURNING id', [org, n])).rows[0].id;
    await c.query('INSERT INTO role_permissions SELECT $1::uuid, id FROM permissions', [roles.manager]);
    await c.query('INSERT INTO role_permissions SELECT $1::uuid, id FROM permissions WHERE code = ANY($2::text[])', [roles.cashier, CASHIER]);
    const ids = {};
    for (const [n, name, email, pw] of [['manager', 'Wanjiku (Manager)', 'manager@shop.co.ke', 'manager123'], ['cashier', 'Otieno (Cashier)', 'cashier@shop.co.ke', 'cashier123']]) {
      ids[n] = (await c.query('INSERT INTO users (organisation_id, name, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id', [org, name, email, await bcrypt.hash(pw, 12)])).rows[0].id;
      await c.query('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1,$2,$3)', [ids[n], roles[n], branch]);
    }
    const cat = (await c.query("INSERT INTO categories (organisation_id, name) VALUES ($1,'General') RETURNING id", [org])).rows[0].id;
    for (const [name, sku, barcode, price, cost, tax, qty] of PRODUCTS) {
      const p = (await c.query(`INSERT INTO products (organisation_id, category_id, sku, name, barcode, cost_price, selling_price, tax_rate, reorder_level) VALUES ($1,$2,$3,$4,$5,$6::numeric/100,$7::numeric/100,$8,10) RETURNING id`,
        [org, cat, sku, name, barcode, cost, price, tax])).rows[0].id;
      await c.query('INSERT INTO stock_balances (branch_id, product_id, quantity_on_hand) VALUES ($1,$2,$3)', [branch, p, qty]);
      await c.query("INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_delta, reason, created_by) VALUES ($1,$2,'RECEIVE',$3,'Opening stock',$4)", [branch, p, qty, ids.manager]);
    }
    console.log('Seeded Demo Shop. Logins: manager@shop.co.ke / manager123 and cashier@shop.co.ke / cashier123. Change these before real use.');
  });
  await pool.end();
})().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
