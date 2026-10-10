// StockIn API client with mock/live toggle.
// Mock mode (default) keeps everything in localStorage so the app is fully
// testable in the browser. Live mode points at the StockIn backend base URL.

import { useSyncExternalStore } from "react";
import type {
  Delivery,
  InvoiceLine,
  Issue,
  Product,
  Scan,
  StockLevel,
  ReconcileRow,
  MatchStatus,
  StockAdjustment,
} from "./types";

const LS_KEY = "stockin-state-v1";
const LS_MODE = "stockin-api-mode";
const LS_BASE = "stockin-api-base";

export interface AppState {
  products: Product[];
  deliveries: Delivery[];
  invoiceLines: InvoiceLine[];
  scans: Scan[];
  issues: Issue[];
  adjustments?: StockAdjustment[] | undefined;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const now = () => new Date().toISOString();
const SEED_TIME = "2026-10-07T08:00:00.000Z";

function seedState(): AppState {
  const p1: Product = { id: "p1", barcode: "3800204000011", name: "Whole Milk 1L", unit: "pcs", supplier: "Balkan Foods", createdAt: SEED_TIME };
  const p2: Product = { id: "p2", barcode: "3800204000028", name: "Greek Yogurt 400g", unit: "pcs", supplier: "Balkan Foods", createdAt: SEED_TIME };
  const p3: Product = { id: "p3", barcode: "3800204000035", name: "Feta Cheese 250g", unit: "pcs", supplier: "Balkan Foods", createdAt: SEED_TIME };
  const p4: Product = { id: "p4", barcode: "3800204000042", name: "Orange Juice 1L", unit: "pcs", supplier: "FreshDrink Ltd", createdAt: SEED_TIME };

  const d1: Delivery = {
    id: "d1",
    reference: "DEL-2026-0142",
    supplierName: "Balkan Foods",
    supplierEmail: "claims@balkanfoods.example",
    status: "closed",
    invoicePages: [],
    createdAt: SEED_TIME,
    closedAt: "2026-10-07T09:00:00.000Z",
    reportSentAt: "2026-10-07T09:05:00.000Z",
  };

  return {
    products: [p1, p2, p3, p4],
    deliveries: [d1],
    invoiceLines: [
      { id: "l1", deliveryId: "d1", productId: "p1", rawText: "MILK 1L x24", name: "Whole Milk 1L", expectedQty: 24, unit: "pcs", confidence: 0.98 },
      { id: "l2", deliveryId: "d1", productId: "p2", rawText: "YOGURT GR 400 x12", name: "Greek Yogurt 400g", expectedQty: 12, unit: "pcs", confidence: 0.91 },
    ],
    scans: [
      { id: "s1", deliveryId: "d1", productId: "p1", qty: 24, scannedAt: SEED_TIME },
      { id: "s2", deliveryId: "d1", productId: "p2", qty: 10, scannedAt: SEED_TIME },
    ],
    issues: [
      {
        id: "i1",
        deliveryId: "d1",
        lineId: "l2",
        productId: "p2",
        productName: "Greek Yogurt 400g",
        type: "short",
        qty: 2,
        note: "Two tubs missing from crate 3",
        photos: [],
        createdAt: SEED_TIME,
      },
    ],
  };
}

function loadState(): AppState | undefined {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* ignore */
  }
  return undefined;
}

let state: AppState = seedState();
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* storage full — photos can be large */
    }
  }
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    const stored = loadState();
    if (stored) {
      state = stored;
      queueMicrotask(() => listeners.forEach((l) => l()));
    }
  }
  return () => {
    listeners.delete(fn);
  };
}

export function getState() {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---- Mode / base URL config ----

export function getApiMode(): "mock" | "live" {
  if (typeof window === "undefined") return "mock";
  return (window.localStorage.getItem(LS_MODE) as "mock" | "live") || "mock";
}

export function setApiMode(mode: "mock" | "live") {
  window.localStorage.setItem(LS_MODE, mode);
  emit();
}

export function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:3001";
  return window.localStorage.getItem(LS_BASE) || "http://localhost:3001";
}

export function setApiBase(base: string) {
  window.localStorage.setItem(LS_BASE, base);
  emit();
}

async function live<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ---- Actions (mock implementations; live mode calls the StockIn API) ----

export async function createDelivery(input: {
  supplierName: string;
  supplierEmail: string;
}): Promise<Delivery> {
  if (getApiMode() === "live") {
    return live<Delivery>("/api/deliveries", { method: "POST", body: JSON.stringify(input) });
  }
  const d: Delivery = {
    id: uid(),
    reference: `DEL-2026-${String(state.deliveries.length + 143).padStart(4, "0")}`,
    supplierName: input.supplierName,
    supplierEmail: input.supplierEmail,
    status: "invoice",
    invoicePages: [],
    createdAt: now(),
  };
  state = { ...state, deliveries: [d, ...state.deliveries] };
  emit();
  return d;
}

export async function addInvoicePage(deliveryId: string, dataUrl: string) {
  state = {
    ...state,
    deliveries: state.deliveries.map((d) =>
      d.id === deliveryId ? { ...d, invoicePages: [...d.invoicePages, dataUrl] } : d,
    ),
  };
  emit();
}

export async function removeInvoicePage(deliveryId: string, index: number) {
  state = {
    ...state,
    deliveries: state.deliveries.map((d) =>
      d.id === deliveryId
        ? { ...d, invoicePages: d.invoicePages.filter((_, i) => i !== index) }
        : d,
    ),
  };
  emit();
}

// Simulated AI extraction — generates plausible lines from the catalogue.
export async function extractInvoiceLines(deliveryId: string): Promise<InvoiceLine[]> {
  const products = state.products;
  const lines: InvoiceLine[] = products.slice(0, 4).map((p, i) => ({
    id: uid(),
    deliveryId,
    productId: p.id,
    rawText: `${p.name.toUpperCase()} x${(i + 2) * 6}`,
    name: p.name,
    expectedQty: (i + 2) * 6,
    unit: p.unit,
    confidence: i === 2 ? 0.62 : 0.9 + Math.random() * 0.09,
  }));
  state = {
    ...state,
    invoiceLines: [...state.invoiceLines.filter((l) => l.deliveryId !== deliveryId), ...lines],
    deliveries: state.deliveries.map((d) =>
      d.id === deliveryId ? { ...d, status: "scanning" } : d,
    ),
  };
  emit();
  return lines;
}

export async function updateInvoiceLine(lineId: string, patch: Partial<InvoiceLine>) {
  state = {
    ...state,
    invoiceLines: state.invoiceLines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
  };
  emit();
}

export async function recordScan(deliveryId: string, productId: string, qty: number): Promise<unknown> {
  if (getApiMode() === "live") {
    return live(`/api/deliveries/${deliveryId}/scans`, {
      method: "POST",
      body: JSON.stringify({ productId, qty }),
    });
  }
  const existing = state.scans.find(
    (s) => s.deliveryId === deliveryId && s.productId === productId,
  );
  state = {
    ...state,
    scans: existing
      ? state.scans.map((s) => (s.id === existing.id ? { ...s, qty: s.qty + qty } : s))
      : [...state.scans, { id: uid(), deliveryId, productId, qty, scannedAt: now() }],
  };
  emit();
  return undefined;
}

export async function setScanQty(deliveryId: string, productId: string, qty: number) {
  state = {
    ...state,
    scans: state.scans.map((s) =>
      s.deliveryId === deliveryId && s.productId === productId ? { ...s, qty } : s,
    ),
  };
  emit();
}

export async function createProduct(input: {
  barcode: string;
  name: string;
  unit: string;
  photo?: string;
  supplier?: string | undefined;
}): Promise<Product> {
  if (getApiMode() === "live") {
    return live<Product>("/api/products", { method: "POST", body: JSON.stringify(input) });
  }
  const p: Product = { id: uid(), createdAt: now(), ...input, supplier: input.supplier || undefined };
  state = { ...state, products: [...state.products, p] };
  emit();
  return p;
}

export async function createIssue(input: Omit<Issue, "id" | "createdAt">): Promise<Issue> {
  if (getApiMode() === "live") {
    return live<Issue>(`/api/deliveries/${input.deliveryId}/issues`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  const issue: Issue = { id: uid(), createdAt: now(), ...input };
  state = { ...state, issues: [...state.issues, issue] };
  emit();
  return issue;
}

export async function setDeliveryStatus(deliveryId: string, status: Delivery["status"]) {
  state = {
    ...state,
    deliveries: state.deliveries.map((d) =>
      d.id === deliveryId
        ? { ...d, status, closedAt: status === "closed" ? now() : d.closedAt }
        : d,
    ),
  };
  emit();
}

export async function markReportSent(deliveryId: string) {
  state = {
    ...state,
    deliveries: state.deliveries.map((d) =>
      d.id === deliveryId ? { ...d, reportSentAt: now(), status: "closed" } : d,
    ),
  };
  emit();
}

export async function updateDelivery(deliveryId: string, patch: Partial<Delivery>) {
  state = {
    ...state,
    deliveries: state.deliveries.map((d) => (d.id === deliveryId ? { ...d, ...patch } : d)),
  };
  emit();
}

export async function addInvoiceLine(input: {
  deliveryId: string;
  name: string;
  expectedQty: number;
  productId?: string | undefined;
}) {
  const product = input.productId ? state.products.find((p) => p.id === input.productId) : undefined;
  const line: InvoiceLine = {
    id: uid(),
    deliveryId: input.deliveryId,
    ...(input.productId ? { productId: input.productId } : {}),
    rawText: "Added manually",
    name: input.name,
    expectedQty: input.expectedQty,
    unit: product?.unit ?? "pcs",
    confidence: 1,
  };
  state = { ...state, invoiceLines: [...state.invoiceLines, line] };
  emit();
  return line;
}

export async function removeInvoiceLine(lineId: string) {
  state = { ...state, invoiceLines: state.invoiceLines.filter((l) => l.id !== lineId) };
  emit();
}

export async function updateIssue(issueId: string, patch: Partial<Issue>) {
  state = { ...state, issues: state.issues.map((i) => (i.id === issueId ? { ...i, ...patch } : i)) };
  emit();
}

export async function deleteIssue(issueId: string) {
  state = { ...state, issues: state.issues.filter((i) => i.id !== issueId) };
  emit();
}

export function getSuppliers(s: AppState): { name: string; email: string }[] {
  const map = new Map<string, { name: string; email: string }>();
  for (const d of s.deliveries) {
    const key = d.supplierName.trim().toLowerCase();
    if (!key || map.has(key)) continue;
    map.set(key, { name: d.supplierName, email: d.supplierEmail });
  }
  for (const p of s.products) {
    const key = p.supplier?.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, { name: p.supplier!, email: "" });
  }
  return [...map.values()];
}

// ---- Derived selectors ----

export function getReconciliation(deliveryId: string): ReconcileRow[] {
  const lines = state.invoiceLines.filter((l) => l.deliveryId === deliveryId);
  const scans = state.scans.filter((s) => s.deliveryId === deliveryId);
  const rows: ReconcileRow[] = lines.map((line) => {
    const scannedQty =
      scans.find((s) => s.productId === line.productId)?.qty ?? 0;
    let status: MatchStatus = "match";
    if (scannedQty === 0) status = "missing";
    else if (scannedQty < line.expectedQty) status = "short";
    else if (scannedQty > line.expectedQty) status = "extra";
    return {
      line,
      product: state.products.find((p) => p.id === line.productId),
      scannedQty,
      status,
    };
  });
  // Extra scanned products with no invoice line
  for (const s of scans) {
    if (!lines.some((l) => l.productId === s.productId)) {
      const product = state.products.find((p) => p.id === s.productId);
      rows.push({
        line: {
          id: `extra-${s.id}`,
          deliveryId,
          productId: s.productId,
          rawText: "",
          name: product?.name ?? "Unknown product",
          expectedQty: 0,
          unit: product?.unit ?? "pcs",
          confidence: 1,
        },
        product,
        scannedQty: s.qty,
        status: "extra",
      });
    }
  }
  return rows;
}

export function getStockLevels(): StockLevel[] {
  const levels = new Map<string, StockLevel>();
  for (const p of state.products) {
    levels.set(p.id, { productId: p.id, sellableQty: 0, quarantineQty: 0, lastReceived: "" });
  }
  const quarantined = new Map<string, number>();
  for (const issue of state.issues) {
    if (issue.productId && (issue.type === "expired" || issue.type === "damaged")) {
      quarantined.set(issue.productId, (quarantined.get(issue.productId) ?? 0) + issue.qty);
    }
  }
  for (const s of state.scans) {
    const d = state.deliveries.find((dd) => dd.id === s.deliveryId);
    if (!d || d.status === "draft") continue;
    const lvl = levels.get(s.productId);
    if (!lvl) continue;
    const q = quarantined.get(s.productId) ?? 0;
    lvl.sellableQty += Math.max(0, s.qty - q);
    lvl.quarantineQty += Math.min(q, s.qty);
    quarantined.set(s.productId, Math.max(0, q - s.qty));
    if (!lvl.lastReceived || d.createdAt > lvl.lastReceived) lvl.lastReceived = d.createdAt;
  }
  for (const a of state.adjustments ?? []) {
    const lvl = levels.get(a.productId);
    if (lvl) lvl.sellableQty = Math.max(0, lvl.sellableQty + a.delta);
  }
  return [...levels.values()];
}

export function buildReportMessage(deliveryId: string): string {
  const d = state.deliveries.find((dd) => dd.id === deliveryId);
  const issues = state.issues.filter((i) => i.deliveryId === deliveryId);
  const rows = getReconciliation(deliveryId).filter((r) => r.status !== "match");
  if (!d) return "";
  const lines = [
    `Delivery report — ${d.reference}`,
    `Supplier: ${d.supplierName}`,
    `Date: ${new Date(d.createdAt).toLocaleDateString()}`,
    "",
    issues.length === 0 && rows.length === 0
      ? "All items received as invoiced. No discrepancies."
      : "Discrepancies found:",
    ...issues.map(
      (i) =>
        `• ${i.productName}: ${i.type} (${i.qty} ${i.qty === 1 ? "unit" : "units"})${i.note ? ` — ${i.note}` : ""}${i.expiryDate ? ` [expiry ${i.expiryDate}]` : ""}`,
    ),
    ...rows
      .filter((r) => !issues.some((i) => i.lineId === r.line.id))
      .map((r) => `• ${r.line.name}: expected ${r.line.expectedQty}, received ${r.scannedQty} (${r.status})`),
    "",
    `${issues.reduce((a, i) => a + i.photos.length, 0) + (d.reportPhotos?.length ?? 0)} photo(s) of evidence attached in the app.`,
    "",
    "Please advise on credit note / replacement.",
  ];
  return lines.join("\n");
}

export async function updateProduct(productId: string, patch: Partial<Product>) {
  state = { ...state, products: state.products.map((p) => (p.id === productId ? { ...p, ...patch } : p)) };
  emit();
}

export async function adjustStock(input: {
  productId: string;
  newQty: number;
  reason: string;
  note?: string | undefined;
  photos: string[];
}) {
  const current = getStockLevels().find((l) => l.productId === input.productId)?.sellableQty ?? 0;
  const a: StockAdjustment = {
    id: uid(),
    productId: input.productId,
    previousQty: current,
    newQty: input.newQty,
    delta: input.newQty - current,
    reason: input.reason,
    note: input.note,
    photos: input.photos,
    createdAt: now(),
  };
  state = { ...state, adjustments: [a, ...(state.adjustments ?? [])] };
  emit();
  return a;
}

/** Suppliers a product is linked to: its own supplier field plus any delivery it appeared in. */
export function getProductSuppliers(s: AppState, productId: string): string[] {
  const names = new Set<string>();
  const p = s.products.find((x) => x.id === productId);
  if (p?.supplier) names.add(p.supplier.trim().toLowerCase());
  const ids = new Set([
    ...s.invoiceLines.filter((l) => l.productId === productId).map((l) => l.deliveryId),
    ...s.scans.filter((x) => x.productId === productId).map((x) => x.deliveryId),
  ]);
  for (const d of s.deliveries) if (ids.has(d.id)) names.add(d.supplierName.trim().toLowerCase());
  return [...names];
}
