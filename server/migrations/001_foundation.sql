-- Foundation: organisations, access control, catalogue, stock, audit, sessions. Needs PostgreSQL 13+.
CREATE TABLE organisations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, currency_code char(3) NOT NULL DEFAULT 'KES',
  timezone text NOT NULL DEFAULT 'Africa/Nairobi', status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL, address text, UNIQUE (organisation_id, name));
CREATE TABLE registers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), name text NOT NULL, status text NOT NULL DEFAULT 'active', UNIQUE (branch_id, name));
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL, email text NOT NULL,
  password_hash text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')), created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE TABLE roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL, UNIQUE (organisation_id, name));
CREATE TABLE permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, description text NOT NULL);
CREATE TABLE role_permissions (role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE, PRIMARY KEY (role_id, permission_id));
CREATE TABLE user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_id uuid NOT NULL REFERENCES roles(id), branch_id uuid REFERENCES branches(id));
CREATE UNIQUE INDEX user_roles_uq ON user_roles (user_id, role_id, (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)));
CREATE TABLE business_settings (organisation_id uuid NOT NULL REFERENCES organisations(id), setting_key text NOT NULL, setting_value text NOT NULL, PRIMARY KEY (organisation_id, setting_key));
CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL, UNIQUE (organisation_id, name));
CREATE TABLE units (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL, abbreviation text NOT NULL, UNIQUE (organisation_id, name));
-- Money is NUMERIC (KES with 2 decimals). The API exchanges whole cents with the browser. VAT rate is stored on the product for now.
CREATE TABLE products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), category_id uuid REFERENCES categories(id), unit_id uuid REFERENCES units(id),
  sku text NOT NULL, name text NOT NULL, barcode text, cost_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0), selling_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100), reorder_level integer NOT NULL DEFAULT 0 CHECK (reorder_level >= 0), track_stock boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')), image_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_org_sku_key UNIQUE (organisation_id, sku));
CREATE UNIQUE INDEX products_org_barcode_idx ON products (organisation_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX products_name_idx ON products (organisation_id, lower(name));
-- The CHECK on quantity_on_hand is the last line of defence against overselling.
CREATE TABLE stock_balances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), product_id uuid NOT NULL REFERENCES products(id),
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0), quantity_reserved integer NOT NULL DEFAULT 0, UNIQUE (branch_id, product_id));
CREATE TABLE stock_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), product_id uuid NOT NULL REFERENCES products(id),
  movement_type text NOT NULL CHECK (movement_type IN ('RECEIVE','ADJUSTMENT','SALE','REFUND','TRANSFER_IN','TRANSFER_OUT')), quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  reference_type text, reference_id uuid, reason text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX stock_movements_branch_idx ON stock_movements (branch_id, created_at DESC);
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), user_id uuid REFERENCES users(id), action text NOT NULL,
  entity_type text, entity_id uuid, details jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_logs_org_idx ON audit_logs (organisation_id, created_at DESC);
CREATE TABLE idempotency_keys (organisation_id uuid NOT NULL REFERENCES organisations(id), key text NOT NULL, request_hash text, response_reference uuid, status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (organisation_id, key));
CREATE TABLE session (sid varchar NOT NULL PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX idx_session_expire ON session (expire);
