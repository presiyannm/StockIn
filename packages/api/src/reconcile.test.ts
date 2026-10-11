import test from "node:test";
import assert from "node:assert/strict";
import { buildItemRows, formatItemRows, overReportedProducts, reconcile, resolutionText, stockSplit } from "./reconcile.js";

const names = new Map([
  [1, "Milk 1L"],
  [2, "Yogurt 400g"],
  [3, "Cheese 500g"],
  [4, "Butter 250g"],
]);

test("perfect delivery yields no findings", () => {
  const f = reconcile(
    [{ id: 1, product_id: 1, raw_text: "Milk", qty: 12 }],
    [{ product_id: 1, qty: 12 }],
    names,
  );
  assert.deepEqual(f, []);
});

test("short, missing, extra and not-on-invoice (no match) are classified", () => {
  const f = reconcile(
    [
      { id: 1, product_id: 2, raw_text: "Yogurt", qty: 10 },
      { id: 2, product_id: 3, raw_text: "Cheese", qty: 6 },
      { id: 3, product_id: 1, raw_text: "Milk", qty: 12 },
    ],
    [
      { product_id: 2, qty: 8 },
      { product_id: 1, qty: 14 },
      { product_id: 4, qty: 4 },
    ],
    names,
  );
  const byProduct = Object.fromEntries(f.map((x) => [x.product_id, x.type]));
  assert.equal(byProduct[2], "short");
  assert.equal(byProduct[3], "missing");
  assert.equal(byProduct[1], "extra");
  assert.equal(byProduct[4], "mismatch");
  assert.equal(f.find((x) => x.product_id === 4)!.expected_qty, 0);
});

test("unmatched invoice line becomes a mismatch, not silently dropped", () => {
  const f = reconcile(
    [{ id: 9, product_id: null, raw_text: "Мляко ?", qty: 5 }],
    [],
    names,
  );
  assert.equal(f.length, 1);
  assert.equal(f[0].type, "mismatch");
});

test("dog invoiced but cat delivered: dog is missing, cat is a no match", () => {
  const animals = new Map([
    [10, "Dog food"],
    [11, "Cat food"],
  ]);
  const f = reconcile([{ id: 1, product_id: 10, raw_text: "Dog food", qty: 5 }], [{ product_id: 11, qty: 5 }], animals);
  assert.deepEqual(
    f.map((x) => [x.product_id, x.type]),
    [
      [10, "missing"],
      [11, "mismatch"],
    ],
  );
  assert.match(f[1].detail, /not on the invoice \(no match\)/);
});

test("duplicate invoice lines for one product are summed", () => {
  const f = reconcile(
    [
      { id: 1, product_id: 1, raw_text: "Milk", qty: 6 },
      { id: 2, product_id: 1, raw_text: "Milk", qty: 6 },
    ],
    [{ product_id: 1, qty: 12 }],
    names,
  );
  assert.deepEqual(f, []);
});

test("expired goods stay out of stock; short complaints do not move stock", () => {
  const split = stockSplit(
    [
      { product_id: 1, qty: 12 },
      { product_id: 2, qty: 8 },
    ],
    [
      { product_id: 1, type: "expired", qty: 3 },
      { product_id: 2, type: "short", qty: 2 },
    ],
  );
  assert.deepEqual(split.find((s) => s.product_id === 1), {
    product_id: 1,
    sellable: 9,
    excluded: 3,
    unconfirmed_excess: 0,
  });
  assert.deepEqual(split.find((s) => s.product_id === 2), {
    product_id: 2,
    sellable: 8,
    excluded: 0,
    unconfirmed_excess: 0,
  });
});

test("an other issue is informational and does not remove goods from stock", () => {
  const split = stockSplit(
    [{ product_id: 1, qty: 10 }],
    [{ product_id: 1, type: "other", qty: 2 }],
  );
  assert.deepEqual(split[0], { product_id: 1, sellable: 10, excluded: 0, unconfirmed_excess: 0 });
});

test("excluded cannot exceed what was received", () => {
  const split = stockSplit(
    [{ product_id: 1, qty: 2 }],
    [{ product_id: 1, type: "damaged", qty: 5 }],
  );
  assert.deepEqual(split[0], { product_id: 1, sellable: 0, excluded: 2, unconfirmed_excess: 0 });
});

test("report items include a perfectly matched line and unmatched invoice lines", () => {
  const products = new Map([
    [1, { name: "Milk 1L", unit: "pcs" }],
    [2, { name: "Yogurt 400g", unit: "pcs" }],
  ]);
  const rows = buildItemRows(
    [
      { id: 1, product_id: 1, raw_text: "Milk", qty: 12 },
      { id: 2, product_id: 2, raw_text: "Yogurt", qty: 6 },
      { id: 3, product_id: null, raw_text: "Mystery item", qty: 4 },
    ],
    [
      { product_id: 1, qty: 12 },
      { product_id: 2, qty: 5 },
    ],
    [
      { product_id: 1, sellable: 9, excluded: 3, unconfirmed_excess: 0 },
      { product_id: 2, sellable: 5, excluded: 0, unconfirmed_excess: 0 },
    ],
    products,
  );
  assert.deepEqual(rows[0], {
    product_id: 1,
    name: "Milk 1L",
    unit: "pcs",
    expected: 12,
    received: 12,
    in_stock: 9,
    not_counted: 3,
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[2].product_id, null);
  assert.match(formatItemRows(rows), /Mystery item: expected 4, not matched/);
});

test("requested resolution is only the user's optional text", () => {
  assert.equal(resolutionText(null), null);
  assert.equal(resolutionText("   "), null);
  assert.equal(resolutionText(" Credit for the 3 expired units "), "Credit for the 3 expired units");
});

test("extra units stay out of stock until the user confirms them", () => {
  const scans = [{ product_id: 1, qty: 14 }];
  const expected = new Map([[1, 12]]);
  const waiting = stockSplit(scans, [], { expected, accepted: new Set() });
  assert.deepEqual(waiting[0], { product_id: 1, sellable: 12, excluded: 0, unconfirmed_excess: 2 });
  const confirmed = stockSplit(scans, [], { expected, accepted: new Set([1]) });
  assert.deepEqual(confirmed[0], { product_id: 1, sellable: 14, excluded: 0, unconfirmed_excess: 0 });
});

test("excluded goods count first, so expired units are not also treated as excess", () => {
  const split = stockSplit(
    [{ product_id: 1, qty: 14 }],
    [{ product_id: 1, type: "expired", qty: 2 }],
    { expected: new Map([[1, 12]]), accepted: new Set() },
  );
  assert.deepEqual(split[0], { product_id: 1, sellable: 12, excluded: 2, unconfirmed_excess: 0 });
});

test("a product that is not on the invoice is all excess until confirmed", () => {
  const split = stockSplit([{ product_id: 9, qty: 3 }], [], { expected: new Map(), accepted: new Set() });
  assert.deepEqual(split[0], { product_id: 9, sellable: 0, excluded: 0, unconfirmed_excess: 3 });
});

test("defect reports above the received quantity are flagged, not clamped", () => {
  const scans = [{ product_id: 1, qty: 5 }];
  assert.deepEqual(overReportedProducts(scans, [{ product_id: 1, type: "expired", qty: 3 }]), []);
  assert.deepEqual(
    overReportedProducts(scans, [
      { product_id: 1, type: "expired", qty: 3 },
      { product_id: 1, type: "damaged", qty: 3 },
    ]),
    [{ product_id: 1, reported: 6, received: 5 }],
  );
  assert.deepEqual(overReportedProducts(scans, [{ product_id: 1, type: "short", qty: 9 }]), []);
});
