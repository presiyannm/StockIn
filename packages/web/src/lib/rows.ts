import type { DeliveryDetail, Finding, Issue } from "./api/types";

/** One product (or one unmatched invoice line) as the receiving screens show it. */
export interface ProductRow {
  key: string;
  product_id: number | null;
  /** Set only for an invoice line the AI could not match to the catalogue. */
  unmatched_line_id: number | null;
  name: string;
  unit: string;
  expected: number;
  received: number;
  /** From the last reconcile; null means it matched (or reconcile has not run). */
  finding: Finding | null;
  issues: Issue[];
  excess_accepted: boolean;
}

/**
 * Invoice products first (in invoice order), then products that were scanned but not
 * invoiced, then invoice lines with no product. Only groups saved data; every comparison
 * comes from the api's findings.
 */
export function productRows(d: DeliveryDetail): ProductRow[] {
  const rows = new Map<number, ProductRow>();
  const unmatched: ProductRow[] = [];
  const base = (product_id: number, name: string, unit: string): ProductRow => ({
    key: `p${product_id}`,
    product_id,
    unmatched_line_id: null,
    name,
    unit,
    expected: 0,
    received: 0,
    finding: d.findings.find((f) => f.product_id === product_id) ?? null,
    issues: d.issues.filter((i) => i.product_id === product_id),
    excess_accepted: d.excess_accepted.includes(product_id),
  });

  for (const l of d.lines) {
    if (l.product_id == null) {
      unmatched.push({
        key: `l${l.id}`,
        product_id: null,
        unmatched_line_id: l.id,
        name: l.raw_text,
        unit: "",
        expected: l.qty,
        received: 0,
        finding: d.findings.find((f) => f.invoice_line_id === l.id) ?? null,
        issues: [],
        excess_accepted: false,
      });
      continue;
    }
    const row = rows.get(l.product_id) ?? base(l.product_id, l.product_name ?? `Product ${l.product_id}`, l.unit ?? "");
    row.expected += l.qty;
    rows.set(l.product_id, row);
  }
  for (const s of d.scans) {
    const row = rows.get(s.product_id) ?? base(s.product_id, s.product_name, "");
    row.received = s.qty;
    rows.set(s.product_id, row);
  }
  return [...rows.values(), ...unmatched];
}
