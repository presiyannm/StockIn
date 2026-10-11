// Thin client for the StockIn api. Paths are relative: in dev, Vite proxies /api to :3001.

import type {
  Delivery,
  DeliveryDetail,
  DeliverySummary,
  IdentifyResult,
  InvoiceLine,
  IssueType,
  Product,
  Report,
  StockRow,
  Supplier,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const msg = typeof body["error"] === "string" ? body["error"] : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

// ---- Catalogue ----

export const listProducts = () => request<Product[]>("/api/products");
export const listSuppliers = () => request<Supplier[]>("/api/suppliers");
export const listStock = () => request<StockRow[]>("/api/stock");

export const createProduct = (input: { name: string; barcode?: string | null; unit?: string }) =>
  request<Product>("/api/products", json("POST", input));

/** Gives a product without a barcode (e.g. one added from an invoice line) its barcode. */
export const setProductBarcode = (productId: number, barcode: string) =>
  request<Product>(`/api/products/${productId}`, json("PATCH", { barcode }));

// ---- Deliveries ----

export const listDeliveries = () => request<DeliverySummary[]>("/api/deliveries");
export const getDelivery = (id: number) => request<DeliveryDetail>(`/api/deliveries/${id}`);

export const createDelivery = (supplierId: number | null) =>
  request<Delivery>("/api/deliveries", json("POST", { supplier_id: supplierId }));

/** The requested resolution: optional free text for the whole delivery. */
export const setResolution = (id: number, note: string) =>
  request<Delivery>(`/api/deliveries/${id}`, json("PATCH", { resolution_note: note.trim() || null }));

export const setExcessAccepted = (id: number, productId: number, accept: boolean) =>
  request<{ ok: boolean }>(`/api/deliveries/${id}/excess/${productId}`, json("PUT", { accept }));

// ---- Invoice ----

/** Uploads pages and has the AI read the whole invoice; replaces the delivery's lines. */
export function uploadInvoice(id: number, pages: Blob[]) {
  const form = new FormData();
  pages.forEach((p, i) => form.append("photo", p, `page-${i + 1}.jpg`));
  return request<{ language: string; lines: number; new_products: number }>(`/api/deliveries/${id}/invoice`, {
    method: "POST",
    body: form,
  });
}

export const updateLine = (lineId: number, patch: { qty?: number; product_id?: number | null }) =>
  request<InvoiceLine>(`/api/invoice-lines/${lineId}`, json("PATCH", patch));

export const addLine = (id: number, productId: number, qty: number) =>
  request<InvoiceLine>(`/api/deliveries/${id}/invoice-lines`, json("POST", { product_id: productId, qty }));

export const deleteLine = (lineId: number) =>
  request<{ ok: boolean }>(`/api/invoice-lines/${lineId}`, { method: "DELETE" });

// ---- Receiving ----

export const scanBarcode = (id: number, barcode: string) =>
  request(`/api/deliveries/${id}/scans`, json("POST", { barcode }));

export const scanProduct = (
  id: number,
  productId: number,
  qty: number,
  method: "manual" | "vision" | "barcode" = "manual",
) => request(`/api/deliveries/${id}/scans`, json("POST", { product_id: productId, qty, method }));

export const clearScans = (id: number, productId: number) =>
  request<{ ok: boolean }>(`/api/deliveries/${id}/scans/${productId}`, { method: "DELETE" });

/** Sets the received quantity of a product to an exact number. */
export async function setReceivedQty(id: number, productId: number, qty: number) {
  await clearScans(id, productId);
  if (qty > 0) await scanProduct(id, productId, qty, "manual");
}

export function identifyProduct(id: number, photo: Blob) {
  const form = new FormData();
  form.append("photo", photo, "item.jpg");
  return request<IdentifyResult>(`/api/deliveries/${id}/identify`, { method: "POST", body: form });
}

export const reconcile = (id: number) =>
  request<unknown[]>(`/api/deliveries/${id}/reconcile`, { method: "POST" });

// ---- Issues ----

export function createIssue(
  id: number,
  input: { product_id: number; type: IssueType; qty: number; expiry_date?: string; note?: string; photos: Blob[] },
) {
  const form = new FormData();
  form.append("product_id", String(input.product_id));
  form.append("type", input.type);
  form.append("qty", String(input.qty));
  if (input.expiry_date) form.append("expiry_date", input.expiry_date);
  if (input.note) form.append("note", input.note);
  input.photos.forEach((p, i) => form.append("photo", p, `evidence-${i + 1}.jpg`));
  return request(`/api/deliveries/${id}/issues`, { method: "POST", body: form });
}

export const deleteIssue = (issueId: number) =>
  request<{ ok: boolean }>(`/api/issues/${issueId}`, { method: "DELETE" });

// ---- Finish ----

export const finishDelivery = (id: number) =>
  request<Report>(`/api/deliveries/${id}/finish`, { method: "POST" });

export const reportUrl = (id: number) => `/api/deliveries/${id}/report.html`;
