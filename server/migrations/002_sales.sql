-- Sales, payments, shifts, refunds and clients. Needs 001.
INSERT INTO permissions (code, description) VALUES ('sales.discount_large', 'Give discounts above the cashier limit') ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'manager' AND p.code = 'sales.discount_large' ON CONFLICT DO NOTHING;

CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL, phone text NOT NULL,
  email text, password_hash text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organisation_id, phone));
CREATE UNIQUE INDEX customers_email_uq ON customers (organisation_id, lower(email)) WHERE email IS NOT NULL;

CREATE TABLE cashier_shifts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), register_id uuid NOT NULL REFERENCES registers(id), cashier_id uuid NOT NULL REFERENCES users(id),
  opening_cash numeric(14,2) NOT NULL CHECK (opening_cash >= 0), closing_cash numeric(14,2), expected_cash numeric(14,2), opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz);
CREATE UNIQUE INDEX one_open_shift_per_register ON cashier_shifts (register_id) WHERE closed_at IS NULL;
CREATE UNIQUE INDEX one_open_shift_per_cashier ON cashier_shifts (cashier_id) WHERE closed_at IS NULL;
CREATE TABLE cash_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shift_id uuid NOT NULL REFERENCES cashier_shifts(id), movement_type text NOT NULL CHECK (movement_type IN ('PAID_IN','PAID_OUT')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0), reason text NOT NULL, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());

-- Receipt numbers: one counter row per branch, locked briefly inside the sale transaction.
CREATE TABLE receipt_counters (branch_id uuid PRIMARY KEY REFERENCES branches(id), last_number integer NOT NULL DEFAULT 0);
CREATE TABLE sales (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), branch_id uuid NOT NULL REFERENCES branches(id),
  register_id uuid NOT NULL REFERENCES registers(id), shift_id uuid NOT NULL REFERENCES cashier_shifts(id), cashier_id uuid NOT NULL REFERENCES users(id), customer_id uuid REFERENCES customers(id),
  receipt_number text NOT NULL, status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED')), currency_code char(3) NOT NULL,
  subtotal numeric(14,2) NOT NULL, discount_total numeric(14,2) NOT NULL DEFAULT 0, tax_total numeric(14,2) NOT NULL DEFAULT 0, grand_total numeric(14,2) NOT NULL,
  tendered numeric(14,2) NOT NULL, change_given numeric(14,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (branch_id, receipt_number));
CREATE INDEX sales_org_created_idx ON sales (organisation_id, created_at DESC);
CREATE INDEX sales_shift_idx ON sales (shift_id);
-- name and unit_cost are copied at sale time so old receipts and margins stay correct when products change.
CREATE TABLE sale_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES sales(id), product_id uuid NOT NULL REFERENCES products(id), name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0), unit_price numeric(14,2) NOT NULL, unit_cost numeric(14,2) NOT NULL DEFAULT 0, discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0, line_total numeric(14,2) NOT NULL, refunded_qty integer NOT NULL DEFAULT 0, CHECK (refunded_qty BETWEEN 0 AND quantity));
CREATE INDEX sale_items_sale_idx ON sale_items (sale_id);
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES sales(id), method text NOT NULL CHECK (method IN ('CASH','MPESA','CARD')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0), currency_code char(3) NOT NULL, status text NOT NULL DEFAULT 'COMPLETED', provider_reference text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX payments_sale_idx ON payments (sale_id);
CREATE UNIQUE INDEX payments_mpesa_ref_uq ON payments (upper(provider_reference)) WHERE method = 'MPESA'; -- an M-Pesa code can only be used once
CREATE TABLE refunds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES sales(id), approved_by uuid NOT NULL REFERENCES users(id), shift_id uuid REFERENCES cashier_shifts(id),
  reason text NOT NULL, status text NOT NULL DEFAULT 'COMPLETED', method text NOT NULL DEFAULT 'CASH', total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX refunds_sale_idx ON refunds (sale_id);
CREATE TABLE refund_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_id uuid NOT NULL REFERENCES refunds(id), sale_item_id uuid NOT NULL REFERENCES sale_items(id),
  quantity integer NOT NULL CHECK (quantity > 0), amount numeric(14,2) NOT NULL);
