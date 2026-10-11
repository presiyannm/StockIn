import { describe, expect, it } from "vitest";
import { productRows } from "@/lib/rows";
import type { DeliveryDetail, InvoiceLine } from "@/lib/api/types";

const line = (id: number, product_id: number | null, qty: number, name: string | null = null): InvoiceLine => ({
  id,
  delivery_id: 1,
  product_id,
  product_name: name,
  unit: "pcs",
  raw_text: `raw ${id}`,
  qty,
  unit_price: null,
  confidence: 0.9,
  received_qty: 0,
});

const detail = (patch: Partial<DeliveryDetail>): DeliveryDetail => ({
  delivery: {} as DeliveryDetail["delivery"],
  files: [],
  lines: [],
  scans: [],
  findings: [],
  issues: [],
  excess_accepted: [],
  items: [],
  report: null,
  ...patch,
});

describe("productRows", () => {
  it("sums invoice lines per product and keeps received separate", () => {
    const rows = productRows(
      detail({
        lines: [line(1, 7, 10, "Milk"), line(2, 7, 2, "Milk")],
        scans: [{ product_id: 7, product_name: "Milk", qty: 11 }],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ product_id: 7, expected: 12, received: 11 });
  });

  it("lists scanned products not on the invoice with expected 0, and unmatched lines last", () => {
    const rows = productRows(
      detail({
        lines: [line(1, null, 4), line(2, 7, 1, "Milk")],
        scans: [{ product_id: 9, product_name: "Water", qty: 3 }],
        excess_accepted: [9],
      }),
    );
    expect(rows.map((r) => r.key)).toEqual(["p7", "p9", "l1"]);
    expect(rows[1]).toMatchObject({ expected: 0, received: 3, excess_accepted: true });
    expect(rows[2]).toMatchObject({ product_id: null, unmatched_line_id: 1, expected: 4, name: "raw 1" });
  });

  it("attaches each product's findings and issues", () => {
    const rows = productRows(
      detail({
        lines: [line(1, 7, 12, "Milk")],
        scans: [{ product_id: 7, product_name: "Milk", qty: 12 }],
        findings: [
          { id: 1, invoice_line_id: 1, product_id: 7, type: "short", expected_qty: 12, received_qty: 10, detail: null },
        ],
        issues: [
          { id: 5, product_id: 7, product_name: "Milk", type: "expired", qty: 3, expiry_date: "2026-10-01", note: null, photos: [], created_at: "" },
        ],
      }),
    );
    expect(rows[0]?.finding?.type).toBe("short");
    expect(rows[0]?.issues.map((i) => i.id)).toEqual([5]);
  });
});
