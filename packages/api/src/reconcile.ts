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

export type ItemRow = {
  name: string;
  unit: string;
  expected: number;
  received: number;
  in_stock: number;
  not_counted: number;
  note?: string;
};

/**
 * One row per delivery item for the supplier report, including items that
 * matched perfectly. Invoice lines the AI could not match are listed too, so
 * nothing on the invoice is silently left out.
 */
export function buildItemRows(
  lines: LineIn[],
  scans: ScanIn[],
  split: { product_id: number; sellable: number }[],
  products: Map<number, { name: string; unit: string }>,
): ItemRow[] {
  const expected = new Map<number, number>();
  const rows: ItemRow[] = [];
  const order: number[] = [];
  const seen = (id: number) => {
    if (!order.includes(id)) order.push(id);
  };
  for (const l of lines) {
    if (l.product_id == null) {
      rows.push({
        name: l.raw_text,
        unit: "",
        expected: l.qty,
        received: 0,
        in_stock: 0,
        not_counted: 0,
        note: "not matched to a catalogue product",
      });
      continue;
    }
    seen(l.product_id);
    expected.set(l.product_id, (expected.get(l.product_id) ?? 0) + l.qty);
  }
  const received = new Map<number, number>();
  for (const s of scans) {
    seen(s.product_id);
    received.set(s.product_id, (received.get(s.product_id) ?? 0) + s.qty);
  }
  const stock = new Map(split.map((s) => [s.product_id, s.sellable]));
  const matched = order.map((id): ItemRow => {
    const got = received.get(id) ?? 0;
    const inStock = stock.get(id) ?? 0;
    const p = products.get(id);
    return {
      name: p?.name ?? `product ${id}`,
      unit: p?.unit ?? "",
      expected: expected.get(id) ?? 0,
      received: got,
      in_stock: inStock,
      not_counted: got - inStock,
    };
  });
  return [...matched, ...rows];
}

export function formatItemRows(rows: ItemRow[]): string {
  return rows
    .map((r, n) => {
      const unit = r.unit ? ` ${r.unit}` : "";
      const tail = r.note
        ? `, ${r.note}`
        : `, received ${r.received}, added to stock ${r.in_stock}, not counted ${r.not_counted}`;
      return `${n + 1}. ${r.name}: expected ${r.expected}${unit}${tail}`;
    })
    .join("\n");
}

/** The requested resolution as printed on the report; null when the user chose none. */
export function resolutionText(choice: string | null, note: string | null): string | null {
  if (choice !== "credit" && choice !== "replacement") return null;
  const label = choice === "credit" ? "Credit note requested." : "Replacement requested.";
  return note ? `${label} ${note}` : label;
}
