export type LineIn = {
  id: number;
  product_id: number | null;
  raw_text: string;
  qty: number;
};
export type ScanIn = { product_id: number; qty: number };

export type FindingOut = {
  invoice_line_id: number | null;
  product_id: number | null;
  type: "short" | "missing" | "extra" | "mismatch";
  expected_qty: number;
  received_qty: number;
  detail: string;
};

/**
 * Deterministic diff of what the invoice says vs what was scanned.
 * Lines the AI could not match to the catalogue become "mismatch" so a human
 * resolves them; nothing is silently assumed.
 */
export function reconcile(
  lines: LineIn[],
  scans: ScanIn[],
  names: Map<number, string>,
): FindingOut[] {
  const received = new Map<number, number>();
  for (const s of scans) {
    received.set(s.product_id, (received.get(s.product_id) ?? 0) + s.qty);
  }

  const expected = new Map<number, { qty: number; lineId: number }>();
  const out: FindingOut[] = [];

  for (const l of lines) {
    if (l.product_id == null) {
      out.push({
        invoice_line_id: l.id,
        product_id: null,
        type: "mismatch",
        expected_qty: l.qty,
        received_qty: 0,
        detail: `Invoice line "${l.raw_text}" could not be matched to a catalogue product`,
      });
      continue;
    }
    const prev = expected.get(l.product_id);
    expected.set(l.product_id, {
      qty: (prev?.qty ?? 0) + l.qty,
      lineId: prev?.lineId ?? l.id,
    });
  }

  for (const [productId, { qty, lineId }] of expected) {
    const got = received.get(productId) ?? 0;
    const name = names.get(productId) ?? `product ${productId}`;
    if (got === qty) continue;
    if (got === 0) {
      out.push({
        invoice_line_id: lineId,
        product_id: productId,
        type: "missing",
        expected_qty: qty,
        received_qty: 0,
        detail: `${name}: invoiced ${qty}, none received`,
      });
    } else if (got < qty) {
      out.push({
        invoice_line_id: lineId,
        product_id: productId,
        type: "short",
        expected_qty: qty,
        received_qty: got,
        detail: `${name}: invoiced ${qty}, received ${got} (${qty - got} short)`,
      });
    } else {
      out.push({
        invoice_line_id: lineId,
        product_id: productId,
        type: "extra",
        expected_qty: qty,
        received_qty: got,
        detail: `${name}: invoiced ${qty}, received ${got} (${got - qty} extra)`,
      });
    }
  }

  for (const [productId, got] of received) {
    if (expected.has(productId)) continue;
    const name = names.get(productId) ?? `product ${productId}`;
    out.push({
      invoice_line_id: null,
      product_id: productId,
      type: "extra",
      expected_qty: 0,
      received_qty: got,
      detail: `${name}: not on the invoice, ${got} received`,
    });
  }

  return out;
}

export type IssueIn = { product_id: number; type: string; qty: number };

/** Issue types whose goods are not counted into stock; they live only in the
 * report. "short" is a missing-quantity complaint and "other" is informational,
 * so neither removes goods that were received. */
const EXCLUDED_TYPES = new Set(["expired", "damaged", "wrong_item"]);

/** Splits received goods into what enters stock (sellable) and what is left
 * out of stock (excluded), per product. */
export function stockSplit(
  scans: ScanIn[],
  issues: IssueIn[],
): { product_id: number; sellable: number; excluded: number }[] {
  const received = new Map<number, number>();
  for (const s of scans) {
    received.set(s.product_id, (received.get(s.product_id) ?? 0) + s.qty);
  }
  const bad = new Map<number, number>();
  for (const i of issues) {
    if (!EXCLUDED_TYPES.has(i.type)) continue;
    bad.set(i.product_id, (bad.get(i.product_id) ?? 0) + i.qty);
  }
  return [...received].map(([product_id, got]) => {
    const excluded = Math.min(got, bad.get(product_id) ?? 0);
    return { product_id, sellable: got - excluded, excluded };
  });
}
