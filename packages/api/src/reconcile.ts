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
 * Lines the AI could not match to the catalogue, and scanned goods that are not
 * on the invoice at all (invoice says "dog", "cat" arrived), become "mismatch"
 * ("no match") so a human resolves them; nothing is silently assumed.
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
      type: "mismatch",
      expected_qty: 0,
      received_qty: got,
      detail: `${name}: not on the invoice (no match), ${got} received`,
    });
  }

  return out;
}

export type IssueIn = { product_id: number; type: string; qty: number };

/** Issue types whose goods are not counted into stock; they live only in the
 * report. "short" is a missing-quantity complaint and "other" is informational,
 * so neither removes goods that were received. */
const EXCLUDED_TYPES = new Set(["expired", "damaged", "wrong_item"]);

export type ExcessRule = {
  /** Invoiced quantity per product (0 when the product is not on the invoice). */
  expected: Map<number, number>;
  /** Products whose extra units the user confirmed. */
  accepted: Set<number>;
};

export type StockSplit = {
  product_id: number;
  sellable: number;
  /** Units reported expired/damaged/wrong item: left out of stock. */
  excluded: number;
  /** Units above the invoice the user has not confirmed: left out of stock. */
  unconfirmed_excess: number;
};

/** Splits received goods into what enters stock (sellable) and what is left
 * out of stock, per product. Units above the invoiced quantity only enter
 * stock once the user confirms them (`excess`); without it no cap is applied. */
export function stockSplit(
  scans: ScanIn[],
  issues: IssueIn[],
  excess?: ExcessRule,
): StockSplit[] {
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
    const good = got - excluded;
    const extra = excess ? Math.max(0, good - (excess.expected.get(product_id) ?? 0)) : 0;
    const unconfirmed_excess = excess?.accepted.has(product_id) ? 0 : extra;
    return { product_id, sellable: good - unconfirmed_excess, excluded, unconfirmed_excess };
  });
}

export type ItemRow = {
  /** Null for an invoice line not linked to a catalogue product. */
  product_id: number | null;
  name: string;
  unit: string;
  expected: number;
  received: number;
  in_stock: number;
  not_counted: number;
  note?: string;
  unmatched?: boolean;
};

/**
 * One row per delivery item for the supplier report, including items that
 * matched perfectly. Invoice lines the AI could not match are listed too, so
 * nothing on the invoice is silently left out.
 */
export function buildItemRows(
  lines: LineIn[],
  scans: ScanIn[],
  split: StockSplit[],
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
        product_id: null,
        name: l.raw_text,
        unit: "",
        expected: l.qty,
        received: 0,
        in_stock: 0,
        not_counted: 0,
        unmatched: true,
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
  const unconfirmed = new Map(split.map((s) => [s.product_id, s.unconfirmed_excess]));
  const matched = order.map((id): ItemRow => {
    const got = received.get(id) ?? 0;
    const inStock = stock.get(id) ?? 0;
    const p = products.get(id);
    return {
      product_id: id,
      name: p?.name ?? `product ${id}`,
      unit: p?.unit ?? "",
      expected: expected.get(id) ?? 0,
      received: got,
      in_stock: inStock,
      not_counted: got - inStock,
      ...(unconfirmed.get(id)
        ? { note: `${unconfirmed.get(id)} extra not added to stock until confirmed` }
        : {}),
    };
  });
  return [...matched, ...rows];
}

export function formatItemRows(rows: ItemRow[]): string {
  return rows
    .map((r, n) => {
      const unit = r.unit ? ` ${r.unit}` : "";
      const tail = r.unmatched
        ? `, ${r.note}`
        : `, received ${r.received}, added to stock ${r.in_stock}, not counted ${r.not_counted}` +
          (r.note ? ` (${r.note})` : "");
      return `${n + 1}. ${r.name}: expected ${r.expected}${unit}${tail}`;
    })
    .join("\n");
}

/** The requested resolution as printed on the report: the user's own optional
 * text, or null when they left it empty. */
export function resolutionText(note: string | null): string | null {
  return note?.trim() || null;
}

/**
 * Products where expired/damaged/wrong-item quantities add up to more than
 * was received. Issues carry no per-unit identity, so the same physical unit
 * reported under two types would be counted twice; instead of silently
 * clamping, finish asks a human to fix the numbers.
 */
export function overReportedProducts(
  scans: ScanIn[],
  issues: IssueIn[],
): { product_id: number; reported: number; received: number }[] {
  const received = new Map<number, number>();
  for (const s of scans) {
    received.set(s.product_id, (received.get(s.product_id) ?? 0) + s.qty);
  }
  const reported = new Map<number, number>();
  for (const i of issues) {
    if (!EXCLUDED_TYPES.has(i.type)) continue;
    reported.set(i.product_id, (reported.get(i.product_id) ?? 0) + i.qty);
  }
  return [...reported]
    .filter(([id, qty]) => qty > (received.get(id) ?? 0))
    .map(([product_id, qty]) => ({ product_id, reported: qty, received: received.get(product_id) ?? 0 }));
}
