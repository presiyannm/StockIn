import test from "node:test";
import assert from "node:assert/strict";
import { reconcile, stockSplit } from "./reconcile.js";

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

test("short, missing, extra and unlisted are classified", () => {
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
  assert.equal(byProduct[4], "extra");
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

test("expired goods go to quarantine; short complaints do not move stock", () => {
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
    quarantine: 3,
  });
  assert.deepEqual(split.find((s) => s.product_id === 2), {
    product_id: 2,
    sellable: 8,
    quarantine: 0,
  });
});

test("quarantine cannot exceed what was received", () => {
  const split = stockSplit(
    [{ product_id: 1, qty: 2 }],
    [{ product_id: 1, type: "damaged", qty: 5 }],
  );
  assert.deepEqual(split[0], { product_id: 1, sellable: 0, quarantine: 2 });
});
