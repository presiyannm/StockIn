INSERT INTO suppliers (name, email, phone) VALUES
  ('Fresh Dairy Ltd', 'orders@freshdairy.example', '+359 2 000 0000');

INSERT INTO products (barcode, name, unit, aliases) VALUES
  ('3800000000011', 'Milk 1L', 'pcs', ARRAY['мляко 1л', 'прясно мляко 1л']),
  ('3800000000028', 'Yogurt 400g', 'pcs', ARRAY['кисело мляко 400г']),
  ('3800000000035', 'Cheese 500g', 'pcs', ARRAY['сирене 500г']),
  ('3800000000042', 'Butter 250g', 'pcs', ARRAY['масло 250г']),
  ('3800000000059', 'Eggs 10pk', 'pack', ARRAY['яйца 10бр']),
  ('3800000000066', 'Kashkaval 400g', 'pcs', ARRAY['кашкавал 400г']),
  ('3800000000073', 'Cream 200ml', 'pcs', ARRAY['сметана 200мл']),
  ('3800000000080', 'Ayran 500ml', 'pcs', ARRAY['айран 500мл']),
  ('3800000000097', 'Orange Juice 1L', 'pcs', ARRAY['портокалов сок 1л']),
  ('3800000000103', 'Water 1.5L', 'pcs', ARRAY['вода 1.5л']);
