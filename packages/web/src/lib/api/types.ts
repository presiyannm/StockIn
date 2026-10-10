// Response shapes of the StockIn HTTP API (see the API table in the root README.md).
// Field names are snake_case to match the JSON on the wire.

export type DeliveryStatus = "draft" | "scanning" | "reconciled" | "closed";

export type IssueType = "short" | "expired" | "damaged" | "wrong_item" | "other";

export type FindingType = "short" | "missing" | "extra" | "mismatch";

export type Resolution = "credit" | "replacement";

export interface Product {
  id: number;
  name: string;
  barcode: string | null;
  unit: string;
  aliases: string[];
}

export interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface StockRow {
  id: number;
  name: string;
  barcode: string | null;
  unit: string;
  in_stock: number;
  last_received: string | null;
}

export interface DeliverySummary {
  id: number;
  status: DeliveryStatus;
  invoice_number: string | null;
  invoice_date: string | null;
  created_at: string;
  supplier_name: string | null;
}

export interface Delivery extends DeliverySummary {
  supplier_id: number | null;
  supplier_email: string | null;
  requested_resolution: Resolution | null;
  resolution_note: string | null;
  closed_at: string | null;
}

export interface InvoiceFile {
  id: number;
  page_no: number;
  url: string;
}

export interface InvoiceLine {
  id: number;
  delivery_id: number;
  product_id: number | null;
  product_name: string | null;
  unit: string | null;
  raw_text: string;
  /** Expected quantity from the reviewed invoice. */
  qty: number;
  unit_price: number | null;
  confidence: number | null;
  received_qty: number;
}

export interface ScanTotal {
  product_id: number;
  product_name: string;
  qty: number;
}

export interface Finding {
  id: number;
  invoice_line_id: number | null;
  product_id: number | null;
  type: FindingType;
  expected_qty: number;
  received_qty: number;
  detail: string | null;
}

export interface IssuePhoto {
  id: number;
  url: string;
}

export interface Issue {
  id: number;
  product_id: number;
  product_name: string;
  type: IssueType;
  qty: number;
  expiry_date: string | null;
  note: string | null;
  photos: IssuePhoto[];
  created_at: string;
}

/** One delivery item as finish writes it to stock and the report. */
export interface ItemRow {
  name: string;
  unit: string;
  expected: number;
  received: number;
  in_stock: number;
  not_counted: number;
  note?: string;
  unmatched?: boolean;
}

export interface Report {
  id: number;
  body: string;
  requested_resolution: string | null;
  created_at: string;
}

export interface DeliveryDetail {
  delivery: Delivery;
  files: InvoiceFile[];
  lines: InvoiceLine[];
  scans: ScanTotal[];
  findings: Finding[];
  issues: Issue[];
  excess_accepted: number[];
  items: ItemRow[];
  report: Report | null;
}

export interface IdentifyResult {
  product: Product | null;
  confidence: number;
  reason: string;
}

/** Body of the 409 that finish returns when defect reports exceed what was received. */
export interface OverReported {
  product_id: number;
  name?: string;
  reported: number;
  received: number;
}
