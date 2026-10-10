// Contracts between `api` and `ai-service`. Types only: no runtime code.

export type Language = "bg" | "en" | "other";

/** A catalogue entry the AI can match invoice lines and photos against. */
export type Product = {
  id: number;
  name: string;
  barcode: string | null;
  aliases: string[];
};

export type ExtractedInvoiceLine = {
  raw_text: string;
  qty: number;
  unit_price: number | null;
  /** Catalogue product id, or null when the model is not sure. */
  product_id: number | null;
  /** 0 to 1 */
  confidence: number;
};

/** POST /extract-invoice response */
export type ExtractedInvoice = {
  supplier_name: string | null;
  invoice_number: string | null;
  /** YYYY-MM-DD */
  invoice_date: string | null;
  language: Language;
  lines: ExtractedInvoiceLine[];
};

/** POST /identify-product response */
export type IdentifyResult = {
  product_id: number | null;
  confidence: number;
  reason: string;
};

/** POST /draft-message request */
export type DraftMessageRequest = {
  supplier: string;
  invoiceNumber: string | null;
  items: string[];
};

/** POST /draft-message response */
export type DraftMessageResponse = {
  message: string;
  requested_resolution: string;
};

/** Header both services use to authenticate each other. */
export const SERVICE_TOKEN_HEADER = "x-service-token";
