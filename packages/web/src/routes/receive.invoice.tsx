import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, FileText, Plus, Sparkles, Trash2, ImagePlus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ActionBar, Card, PrimaryButton, QtyStepper, Sheet } from "@/components/ui-bits";
import {
  useAppState,
  addInvoicePage,
  removeInvoicePage,
  extractInvoiceLines,
  updateInvoiceLine,
  addInvoiceLine,
  removeInvoiceLine,
  createProduct,
} from "@/lib/api/client";
import { useCamera, captureFrame, readFiles } from "@/lib/camera";

export const Route = createFileRoute("/receive/invoice")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: String(s["delivery"] ?? "") }),
  head: () => ({
    meta: [
      { title: "Step 1 — Capture Invoice | StockIn" },
      { name: "description", content: "Photograph each invoice page and let AI extract the line items." },
      { property: "og:title", content: "Step 1 — Capture Invoice | StockIn" },
      { property: "og:description", content: "Photograph each invoice page and let AI extract the line items." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoicePage,
});

function InvoicePage() {
  const { delivery } = Route.useSearch();
  const state = useAppState();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [addingPages, setAddingPages] = useState(false);
  const [flash, setFlash] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProductId, setNewProductId] = useState<string | undefined>(undefined);
  const [newQty, setNewQty] = useState(1);
  const [barcodeFor, setBarcodeFor] = useState<{ lineId: string; name: string } | null>(null);
  const [newBarcode, setNewBarcode] = useState("");
  const [barcodeErr, setBarcodeErr] = useState("");

  const d = state.deliveries.find((dd) => dd.id === delivery);
  const lines = state.invoiceLines.filter((l) => l.deliveryId === delivery);
  const showCamera = !!d && !extracting && (lines.length === 0 || addingPages);
  const cam = useCamera(videoRef, showCamera);

  if (!d) {
    return (
      <AppShell>
        <PageHeader title="Invoice" onBack={() => navigate({ to: "/" })} />
        <p className="p-4 text-sm text-muted-foreground">Delivery not found.</p>
      </AppShell>
    );
  }

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const url = captureFrame(v);
    if (!url) return;
    addInvoicePage(d!.id, url);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  }

  async function runExtraction() {
    setAddingPages(false);
    setExtracting(true);
    await new Promise((r) => setTimeout(r, 1800));
    if (lines.length === 0) await extractInvoiceLines(d!.id);
    setExtracting(false);
  }

  async function saveNewLine() {
    if (!newName.trim()) return;
    const line = await addInvoiceLine({ deliveryId: d!.id, name: newName.trim(), expectedQty: newQty, productId: newProductId });
    setAddOpen(false);
    if (!newProductId) {
      setNewBarcode("");
      setBarcodeErr("");
      setBarcodeFor({ lineId: line.id, name: line.name });
    }
    setNewName("");
    setNewProductId(undefined);
    setNewQty(1);
  }

  async function saveBarcode() {
    if (!barcodeFor || !newBarcode.trim()) return;
    const code = newBarcode.trim();
    const existing = state.products.find((p) => p.barcode === code);
    if (existing) {
      setBarcodeErr(`This barcode already belongs to "${existing.name}".`);
      return;
    }
    const p = await createProduct({ barcode: code, name: barcodeFor.name, unit: "pcs", supplier: d!.supplierName });
    await updateInvoiceLine(barcodeFor.lineId, { productId: p.id });
    setBarcodeFor(null);
  }

  return (
    <AppShell>
      <PageHeader title="Capture invoice" subtitle={`${d.reference} · Step 1 of 5`} onBack={() => navigate({ to: "/" })} />

      <div className="space-y-4 p-4 pb-44">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            readFiles(e.target.files, (u) => addInvoicePage(d.id, u));
            e.target.value = "";
          }}
        />

        {showCamera && (
          <div className="relative overflow-hidden rounded-2xl bg-navy">
            <video ref={videoRef} className="aspect-[3/4] w-full object-cover" muted playsInline autoPlay />
            {flash && <div className="absolute inset-0 bg-card/70" />}
            {!cam.ready && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-navy-foreground">
                <Camera className="h-10 w-10 opacity-70" />
                <p className="text-sm font-bold">{cam.error ?? "Opening camera…"}</p>
              </div>
            )}
            <span className="absolute left-3 top-3 rounded-full bg-navy/70 px-3 py-1 text-xs font-bold text-navy-foreground">
              {d.invoicePages.length} page{d.invoicePages.length === 1 ? "" : "s"}
            </span>
            <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="press flex h-12 w-12 items-center justify-center rounded-full bg-navy/70 text-navy-foreground"
                aria-label="Upload from gallery"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={snap}
                disabled={!cam.ready}
                className="press h-20 w-20 rounded-full border-4 border-card bg-primary disabled:opacity-40"
                aria-label="Snap page"
              />
              <span className="h-12 w-12" />
            </div>
          </div>
        )}

        {d.invoicePages.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Pages ({d.invoicePages.length})
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {d.invoicePages.map((src, i) => (
                <div key={i} className="relative w-20 shrink-0 overflow-hidden rounded-xl border border-border">
                  <img src={src} alt={`Invoice page ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded-md bg-navy/80 px-1.5 py-0.5 text-[10px] font-bold text-navy-foreground">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeInvoicePage(d.id, i)}
                    className="press absolute right-1 top-1 rounded-md bg-destructive p-1 text-destructive-foreground"
                    aria-label="Delete page"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {extracting && (
          <Card className="flex items-center gap-3 border-primary/30 bg-primary/5">
            <Sparkles className="h-5 w-5 animate-pulse-soft text-primary" />
            <div>
              <p className="text-sm font-bold">Reading invoice…</p>
              <p className="text-xs text-muted-foreground">AI is extracting line items and matching products</p>
            </div>
          </Card>
        )}

        {lines.length > 0 && !extracting && !addingPages && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Invoice lines ({lines.length}) — correct, add or remove
            </p>
            <div className="space-y-2">
              {lines.map((l) => (
                <Card key={l.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{l.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{l.rawText}</p>
                      {l.confidence < 0.75 && (
                        <span className="mt-1 inline-block rounded-full bg-warning/25 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
                          Review match
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={l.expectedQty}
                      onChange={(e) => updateInvoiceLine(l.id, { expectedQty: Number(e.target.value) || 0 })}
                      className="h-12 w-16 rounded-xl border border-input bg-background text-center font-mono text-base font-bold outline-none focus:ring-2 focus:ring-ring"
                      aria-label={`Expected quantity for ${l.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeInvoiceLine(l.id)}
                      className="press flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                      aria-label={`Remove ${l.name}`}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </Card>
              ))}
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="press flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 py-4 text-sm font-bold text-primary"
              >
                <Plus className="h-4 w-4" /> Add missing product
              </button>
              <button
                type="button"
                onClick={() => setAddingPages(true)}
                className="press w-full py-2 text-xs font-bold text-muted-foreground"
              >
                Add more invoice pages
              </button>
            </div>
          </div>
        )}
      </div>

      <ActionBar>
        {lines.length === 0 || addingPages ? (
          <PrimaryButton onClick={runExtraction} disabled={d.invoicePages.length === 0 || extracting}>
            <Sparkles className="h-4 w-4" />
            {extracting ? "Reading…" : `Done — read ${d.invoicePages.length} page${d.invoicePages.length === 1 ? "" : "s"}`}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => navigate({ to: "/receive/scan", search: { delivery: d.id } })}>
            Start scanning
          </PrimaryButton>
        )}
      </ActionBar>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add missing product">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">From catalogue</p>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {state.products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setNewName(p.name);
                    setNewProductId(p.id);
                  }}
                  className={`press flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold ${
                    newProductId === p.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
                  }`}
                >
                  {p.name}
                  <span className="font-mono text-[11px] font-normal text-muted-foreground">{p.barcode}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">Or type a product name</span>
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNewProductId(undefined);
              }}
              placeholder="Product name"
              className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <Card className="flex items-center justify-between">
            <span className="text-sm font-bold">Invoiced quantity</span>
            <QtyStepper value={newQty} onChange={setNewQty} min={1} />
          </Card>
          <PrimaryButton onClick={saveNewLine} disabled={!newName.trim()}>
            Add line
          </PrimaryButton>
        </div>
      </Sheet>

      <Sheet open={!!barcodeFor} onClose={() => setBarcodeFor(null)} title="New product — enter barcode">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{barcodeFor?.name}</span> isn't in the catalogue yet. Type the
            barcode from the package so it can be scanned.
          </p>
          <input
            value={newBarcode}
            onChange={(e) => {
              setNewBarcode(e.target.value.replace(/\s/g, ""));
              setBarcodeErr("");
            }}
            placeholder="Barcode"
            inputMode="numeric"
            className="h-14 w-full rounded-xl border border-input bg-background px-3 font-mono text-lg outline-none focus:ring-2 focus:ring-ring"
          />
          {barcodeErr && <p className="text-xs font-bold text-destructive">{barcodeErr}</p>}
          <PrimaryButton onClick={saveBarcode} disabled={!newBarcode.trim()}>
            Save product
          </PrimaryButton>
          <button
            type="button"
            onClick={() => setBarcodeFor(null)}
            className="press w-full py-2 text-xs font-bold text-muted-foreground"
          >
            Skip — I'll register it when scanning
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
