CREATE TABLE suppliers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text
);

CREATE TABLE products (
  id serial PRIMARY KEY,
  barcode text UNIQUE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  aliases text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE deliveries (
  id serial PRIMARY KEY,
  supplier_id int REFERENCES suppliers(id),
  invoice_number text,
  invoice_date date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scanning', 'reconciled', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE invoice_files (
  id serial PRIMARY KEY,
  delivery_id int NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  r2_key text NOT NULL,
  page_no int NOT NULL DEFAULT 1
);

CREATE TABLE invoice_lines (
  id serial PRIMARY KEY,
  delivery_id int NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id int REFERENCES products(id),
  raw_text text NOT NULL,
  qty numeric NOT NULL,
  unit_price numeric,
  confidence numeric
);

CREATE TABLE scans (
  id serial PRIMARY KEY,
  delivery_id int NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id int NOT NULL REFERENCES products(id),
  qty numeric NOT NULL DEFAULT 1,
  method text NOT NULL CHECK (method IN ('barcode', 'vision', 'manual')),
  r2_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE findings (
  id serial PRIMARY KEY,
  delivery_id int NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  invoice_line_id int REFERENCES invoice_lines(id) ON DELETE CASCADE,
  product_id int REFERENCES products(id),
  type text NOT NULL CHECK (type IN ('short', 'missing', 'extra', 'mismatch')),
  expected_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  detail text
);

CREATE TABLE issues (
  id serial PRIMARY KEY,
  delivery_id int NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id int NOT NULL REFERENCES products(id),
  finding_id int REFERENCES findings(id) ON DELETE SET NULL,
  type text NOT NULL
    CHECK (type IN ('short', 'expired', 'damaged', 'wrong_item', 'other')),
  qty numeric NOT NULL DEFAULT 1,
  expiry_date date,
  note text,
  voice_transcript text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE issue_photos (
  id serial PRIMARY KEY,
  issue_id int NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  r2_key text NOT NULL
);

CREATE TABLE reports (
  id serial PRIMARY KEY,
  delivery_id int NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  body text NOT NULL,
  requested_resolution text,
  pdf_r2_key text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_movements (
  id serial PRIMARY KEY,
  delivery_id int NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id int NOT NULL REFERENCES products(id),
  qty numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON invoice_lines (delivery_id);
CREATE INDEX ON scans (delivery_id);
CREATE INDEX ON issues (delivery_id);
CREATE INDEX ON stock_movements (product_id);
