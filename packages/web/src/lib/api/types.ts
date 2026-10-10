// StockIn domain models — mirrors the StockIn API schema.

export type DeliveryStatus =
  | "draft"
  | "invoice"
  | "scanning"
  | "reconciled"
  | "closed";

export type IssueType = "short" | "expired" | "damaged" | "wrong_item" | "other";

export type MatchStatus = "match" | "short" | "missing" | "extra";

export interface Product {
  id: string;
  barcode: string;
  name: string;
  unit: string;
  supplier?: string | undefined;
  photo?: string | undefined;
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  deliveryId: string;
  productId?: string | undefined;
  rawText: string;
  name: string;
  expectedQty: number;
  unit: string;
  confidence: number; // 0..1
}

export interface Scan {
  id: string;
  deliveryId: string;
  productId: string;
  qty: number;
  scannedAt: string;
}

export interface Issue {
  id: string;
  deliveryId: string;
  lineId?: string | undefined;
  productId?: string | undefined;
  productName: string;
  type: IssueType;
  qty: number;
  expiryDate?: string | undefined;
  note?: string | undefined;
  voiceTranscript?: string | undefined;
  photos: string[];
  createdAt: string;
}

export interface Delivery {
  id: string;
  reference: string;
  supplierName: string;
  supplierEmail: string;
  status: DeliveryStatus;
  invoicePages: string[]; // data URLs / object URLs
  createdAt: string;
  closedAt?: string | undefined;
  reportSentAt?: string | undefined;
  reportPhotos?: string[] | undefined;
  reportMessage?: string | undefined;
}

export interface StockLevel {
  productId: string;
  sellableQty: number;
  quarantineQty: number;
  lastReceived: string;
}

export interface ReconcileRow {
  line: InvoiceLine;
  product?: Product | undefined;
  scannedQty: number;
  status: MatchStatus;
}

export interface StockAdjustment {
  id: string;
  productId: string;
  previousQty: number;
  newQty: number;
  delta: number;
  reason: string;
  note?: string | undefined;
  photos: string[];
  createdAt: string;
}
