import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, FileText, Plus, Sparkles, Trash2, ImagePlus, Link2 } from "lucide-react";
import { AppShell, PageHeader, PageMessage, deliveryLabel } from "@/components/app-shell";
import { ActionBar, Card, PrimaryButton, QtyStepper, Sheet } from "@/components/ui-bits";
import { ProductPicker } from "@/components/product-picker";
import { addLine, deleteLine, updateLine, uploadInvoice } from "@/lib/api/client";
import { useDelivery, useDeliveryAction } from "@/lib/api/queries";
import type { InvoiceLine, Product } from "@/lib/api/types";
import { useCamera, captureFrame, readFiles, dataUrlToBlob } from "@/lib/camera";

export const Route = createFileRoute("/receive/invoice")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: Number(s["delivery"]) || 0 }),
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
  const navigate = useNavigate();
  const { data, isPending } = useDelivery(delivery);
  const { run, busy } = useDeliveryAction(delivery);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Pages captured on this device but not uploaded yet.
  const [pages, setPages] = useState<string[]>([]);
  const [addingPages, setAddingPages] = useState(false);
  const [flash, setFlash] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<Product | null>(null);
  const [newQty, setNewQty] = useState(1);
  const [matchFor, setMatchFor] = useState<InvoiceLine | null>(null);

  const lines = data?.lines ?? [];
  const uploaded = data?.files ?? [];
  const showCamera = !!data && !busy && data.delivery.status !== "closed" && (lines.length === 0 || addingPages);
  const cam = useCamera(videoRef, showCamera);

  if (isPending) return <PageMessage title="Invoice" text="Loading…" />;
  if (!data) return <PageMessage title="Invoice" text="Delivery not found." onBack={() => navigate({ to: "/" })} />;
  const d = data.delivery;
  const closed = d.status === "closed";

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const url = captureFrame(v);
    if (!url) return;
    setPages((p) => [...p, url]);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  }

  async function read() {
    if (lines.length > 0 && !window.confirm("Reading the invoice again replaces the current lines, including your corrections. Continue?")) {
      return;
    }
    const blobs = await Promise.all(pages.map(dataUrlToBlob));
    let added = 0;
    const ok = await run(async () => {
      added = (await uploadInvoice(d.id, blobs)).new_products;
    });
    if (ok) {
      if (added > 0) toast.success(`Added ${added} new product${added === 1 ? "" : "s"} from the invoice to the catalogue`);
      setPages([]);
      setAddingPages(false);
    }
  }

  async function saveNewLine() {
    if (!newProduct) return;
    const ok = await run(() => addLine(d.id, newProduct.id, newQty));
    if (ok) {
      setAddOpen(false);
      setNewProduct(null);
      setNewQty(1);
    }
  }

  const pageCount = uploaded.length + pages.length;

  return (
    <AppShell>
      <PageHeader title="Capture invoice" subtitle={`${deliveryLabel(d)} · Step 1 of 5`} onBack={() => navigate({ to: "/" })} />

      <div className="space-y-4 p-4 pb-44">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            readFiles(e.target.files, (u) => setPages((p) => [...p, u]));
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
                <p className="text-xs opacity-80">You can upload invoice photos with the gallery button.</p>
              </div>
            )}
            <span className="absolute left-3 top-3 rounded-full bg-navy/70 px-3 py-1 text-xs font-bold text-navy-foreground">
              {pages.length} new page{pages.length === 1 ? "" : "s"}
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

        {pageCount > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Pages ({pageCount})</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {uploaded.map((f) => (
                <a key={`f${f.id}`} href={f.url} target="_blank" rel="noreferrer" className="relative w-20 shrink-0 overflow-hidden rounded-xl border border-border">
                  <img src={f.url} alt={`Invoice page ${f.page_no}`} className="aspect-[3/4] w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded-md bg-navy/80 px-1.5 py-0.5 text-[10px] font-bold text-navy-foreground">
                    {f.page_no}
                  </span>
                </a>
              ))}
              {pages.map((src, i) => (
                <div key={`n${i}`} className="relative w-20 shrink-0 overflow-hidden rounded-xl border-2 border-primary">
                  <img src={src} alt={`New page ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPages((p) => p.filter((_, j) => j !== i))}
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

        {busy && pages.length > 0 && (
          <Card className="flex items-center gap-3 border-primary/30 bg-primary/5">
            <Sparkles className="h-5 w-5 animate-pulse-soft text-primary" />
            <div>
              <p className="text-sm font-bold">Reading invoice…</p>
              <p className="text-xs text-muted-foreground">AI is extracting line items and matching products</p>
            </div>
          </Card>
        )}

        {(d.invoice_number || d.invoice_date || d.supplier_name) && (
          <Card className="grid grid-cols-3 gap-2 p-3 text-xs">
            <div>
              <p className="font-bold text-muted-foreground">Supplier</p>
              <p className="truncate font-bold">{d.supplier_name ?? "—"}</p>
            </div>
            <div>
              <p className="font-bold text-muted-foreground">Invoice no.</p>
              <p className="truncate font-mono font-bold">{d.invoice_number ?? "—"}</p>
            </div>
            <div>
              <p className="font-bold text-muted-foreground">Date</p>
              <p className="font-mono font-bold">{d.invoice_date ?? "—"}</p>
            </div>
          </Card>
        )}

        {lines.length > 0 && !addingPages && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Invoice lines ({lines.length}) — check, correct, add or remove
            </p>
            <div className="space-y-2">
              {lines.map((l) => (
                <LineCard
                  key={l.id}
                  line={l}
                  disabled={closed}
                  onQty={(qty) => run(() => updateLine(l.id, { qty }))}
                  onRemove={() => run(() => deleteLine(l.id))}
                  onMatch={() => setMatchFor(l)}
                />
              ))}
              {!closed && (
                <>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="press flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 py-4 text-sm font-bold text-primary"
                  >
                    <Plus className="h-4 w-4" /> Add missing line
                  </button>
                  <button type="button" onClick={() => setAddingPages(true)} className="press w-full py-2 text-xs font-bold text-muted-foreground">
                    Add more invoice pages (re-reads the invoice)
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <ActionBar>
        {lines.length === 0 || addingPages ? (
          <div className="space-y-2">
            <PrimaryButton onClick={read} disabled={pages.length === 0 || busy}>
              <Sparkles className="h-4 w-4" />
              {busy ? "Reading…" : `Read ${pages.length} new page${pages.length === 1 ? "" : "s"} with AI`}
            </PrimaryButton>
            {addingPages ? (
              <button type="button" onClick={() => { setAddingPages(false); setPages([]); }} className="press w-full text-xs font-bold text-muted-foreground">
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate({ to: "/receive/scan", search: { delivery: d.id } })}
                className="press w-full text-xs font-bold text-muted-foreground"
              >
                No invoice? Skip to scanning
              </button>
            )}
          </div>
        ) : (
          <PrimaryButton onClick={() => navigate({ to: "/receive/scan", search: { delivery: d.id } })}>
            Lines look right — start scanning
          </PrimaryButton>
        )}
      </ActionBar>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add missing line">
        <div className="space-y-4">
          {newProduct ? (
            <>
              <Card className="flex items-center justify-between p-3">
                <span className="text-sm font-bold">{newProduct.name}</span>
                <button type="button" onClick={() => setNewProduct(null)} className="text-xs font-bold text-primary">
                  Change
                </button>
              </Card>
              <Card className="flex items-center justify-between">
                <span className="text-sm font-bold">Invoiced quantity</span>
                <QtyStepper value={newQty} onChange={setNewQty} min={1} />
              </Card>
              <PrimaryButton onClick={saveNewLine} disabled={busy}>
                Add line
              </PrimaryButton>
            </>
          ) : (
            <ProductPicker onPick={setNewProduct} />
          )}
        </div>
      </Sheet>

      <Sheet open={!!matchFor} onClose={() => setMatchFor(null)} title="Match invoice line">
        {matchFor && (
          <div className="space-y-3">
            <p className="font-mono text-xs text-muted-foreground">{matchFor.raw_text}</p>
            <ProductPicker
              selectedId={matchFor.product_id}
              initialName={matchFor.raw_text}
              onPick={async (p) => {
                if (await run(() => updateLine(matchFor.id, { product_id: p.id }))) setMatchFor(null);
              }}
            />
          </div>
        )}
      </Sheet>
    </AppShell>
  );
}

function LineCard({
  line,
  disabled,
  onQty,
  onRemove,
  onMatch,
}: {
  line: InvoiceLine;
  disabled: boolean;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onMatch: () => void;
}) {
  const [qty, setQty] = useState(String(line.qty));
  const lowConfidence = line.confidence != null && line.confidence < 0.75;
  const commit = () => {
    const n = Number(qty);
    if (n > 0 && n !== line.qty) onQty(n);
    else setQty(String(line.qty));
  };
  return (
    <Card className={`p-3 ${line.product_id == null ? "border-destructive/40" : ""}`}>
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{line.product_name ?? "Not matched to a product"}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{line.raw_text}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {lowConfidence && (
              <span className="rounded-full bg-warning/25 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">Review match</span>
            )}
            {!disabled && (
              <button type="button" onClick={onMatch} className="press flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold">
                <Link2 className="h-3 w-3" /> {line.product_id == null ? "Pick product" : "Change product"}
              </button>
            )}
          </div>
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={qty}
          disabled={disabled}
          onChange={(e) => setQty(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-12 w-16 rounded-xl border border-input bg-background text-center font-mono text-base font-bold outline-none focus:ring-2 focus:ring-ring"
          aria-label={`Invoiced quantity for ${line.product_name ?? line.raw_text}`}
        />
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            className="press flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
            aria-label={`Remove ${line.raw_text}`}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>
    </Card>
  );
}
