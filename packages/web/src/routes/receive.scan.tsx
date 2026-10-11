import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCheck, ScanBarcode, Pause, Play, Camera, Sparkles, ChevronDown, ListChecks } from "lucide-react";
import { AppShell, PageHeader, PageMessage, deliveryLabel } from "@/components/app-shell";
import { ActionBar, Card, PrimaryButton, QtyStepper, QuickAdds, Sheet } from "@/components/ui-bits";
import { ProductPicker } from "@/components/product-picker";
import { ApiError, identifyProduct, scanBarcode, scanProduct, setProductBarcode, setReceivedQty } from "@/lib/api/client";
import { useDelivery, useDeliveryAction, useProducts } from "@/lib/api/queries";
import type { IdentifyResult, Product } from "@/lib/api/types";
import { productRows, type ProductRow } from "@/lib/rows";
import { useCamera } from "@/lib/camera";
import { toast } from "sonner";

export const Route = createFileRoute("/receive/scan")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: Number(s["delivery"]) || 0 }),
  head: () => ({
    meta: [
      { title: "Step 2 — Scan Items | StockIn" },
      { name: "description", content: "Photograph each product and let the AI identify it, or scan its barcode." },
      { property: "og:title", content: "Step 2 — Scan Items | StockIn" },
      { property: "og:description", content: "Photograph each product and let the AI identify it, or scan its barcode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    /* no audio */
  }
  try {
    navigator.vibrate?.(60);
  } catch {
    /* no vibration */
  }
}

function ScanPage() {
  const { delivery } = Route.useSearch();
  const navigate = useNavigate();
  const { data, isPending } = useDelivery(delivery);
  const { run } = useDeliveryAction(delivery);
  const { data: products = [] } = useProducts();
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [manualCode, setManualCode] = useState("");
  const [paused, setPaused] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ProductRow | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [suggestion, setSuggestion] = useState<IdentifyResult | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  // Photos are the main way to count; the live barcode scanner is opt-in.
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  const open = !!data && data.delivery.status !== "closed";
  const cam = useCamera(videoRef, open && barcodeOpen);
  const pausedRef = useRef(false);
  pausedRef.current = unknown !== null || editRow !== null || suggestion !== null || pickOpen || paused;
  const lastRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  async function handleBarcode(code: string, fromCamera = false) {
    if (fromCamera) {
      if (pausedRef.current) return;
      const t = Date.now();
      if (lastRef.current.code === code && t - lastRef.current.t < 2000) return;
      lastRef.current = { code, t };
    }
    let unknownCode = false;
    const ok = await run(async () => {
      try {
        await scanBarcode(delivery, code);
      } catch (e) {
        // An unknown barcode is not an error: the user matches or creates the product.
        if (e instanceof ApiError && e.status === 404 && e.body["barcode"]) {
          unknownCode = true;
          return;
        }
        throw e;
      }
    });
    if (unknownCode) {
      setUnknown(code);
    } else if (ok) {
      beep();
      setLastScan(products.find((p) => p.barcode === code)?.name ?? code);
    }
  }
  const handlerRef = useRef(handleBarcode);
  handlerRef.current = handleBarcode;

  // Continuous detection once the camera is live
  useEffect(() => {
    if (!cam.ready || !videoRef.current) return;
    const video = videoRef.current;
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let controls: { stop: () => void } | undefined;
    (async () => {
      type BD = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
      let detector: BD | null = null;
      const W = window as unknown as {
        BarcodeDetector?: (new (o: object) => BD) & { getSupportedFormats?: () => Promise<string[]> };
      };
      if (W.BarcodeDetector) {
        try {
          const supported = (await W.BarcodeDetector.getSupportedFormats?.()) ?? [];
          const wanted = ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code"].filter((f) => supported.includes(f));
          if (wanted.length) detector = new W.BarcodeDetector({ formats: wanted });
        } catch {
          detector = null;
        }
      }
      if (stopped) return;
      if (detector) {
        const det = detector;
        interval = setInterval(async () => {
          if (stopped || video.readyState < 2) return;
          try {
            const codes = await det.detect(video);
            const first = codes[0];
            if (first) handlerRef.current(first.rawValue, true);
          } catch {
            /* frame not ready */
          }
        }, 300);
      } else {
        try {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const c = await reader.decodeFromVideoElement(video, (result) => {
            if (result && !stopped) handlerRef.current(result.getText(), true);
          });
          if (stopped) c.stop();
          else controls = c;
        } catch {
          /* decoder failed */
        }
      }
    })();
    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      controls?.stop();
    };
  }, [cam.ready]);

  if (isPending) return <PageMessage title="Count items" text="Loading…" />;
  if (!data) return <PageMessage title="Count items" text="Delivery not found." onBack={() => navigate({ to: "/" })} />;
  const d = data.delivery;
  const rows = productRows(data);
  const expectedTotal = rows.reduce((a, r) => a + r.expected, 0);
  const receivedTotal = rows.reduce((a, r) => a + r.received, 0);
  const scanned = rows.filter((r) => r.received > 0);
  const waiting = rows.filter((r) => r.received === 0 && r.product_id != null);

  async function countProduct(p: Product, method: "manual" | "vision" | "barcode") {
    if (await run(() => scanProduct(delivery, p.id, 1, method))) {
      beep();
      setLastScan(p.name);
    }
  }

  async function identify(file: File | undefined) {
    if (!file) return;
    setIdentifying(true);
    try {
      setSuggestion(await identifyProduct(delivery, file));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIdentifying(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        onBack={() => navigate({ to: "/receive/invoice", search: { delivery: d.id } })}
        title="Count items"
        subtitle={`${deliveryLabel(d)} · Step 2 of 5`}
        right={
          <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-bold text-primary">
            {receivedTotal}/{expectedTotal}
          </span>
        }
      />

      <div className="space-y-4 p-4 pb-40">
        {!open && <Card className="text-sm font-bold">This delivery is closed; quantities can no longer change.</Card>}

        {open && (
          <>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                identify(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              disabled={identifying}
              className="press flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-10 text-primary-foreground shadow-lg disabled:opacity-70"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground/15">
                {identifying ? <Sparkles className="h-8 w-8 animate-pulse-soft" /> : <Camera className="h-8 w-8" />}
              </span>
              <span className="text-lg font-bold">{identifying ? "Identifying…" : "Take a photo of the product"}</span>
              <span className="text-xs opacity-80">
                {identifying ? "The AI is matching it to your catalogue" : "The AI recognises it, you confirm, it's counted"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPickOpen(true)}
              className="press flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-xs font-bold"
            >
              <ListChecks className="h-4 w-4" /> Pick from catalogue
            </button>
          </>
        )}

        {lastScan && (
          <Card className="border-success/40 bg-success/10 p-3">
            <p className="text-sm font-bold text-success">✓ Counted: {lastScan}</p>
          </Card>
        )}

        {open && (
          <Card className="p-0">
            <button
              type="button"
              onClick={() => setBarcodeOpen((o) => !o)}
              aria-expanded={barcodeOpen}
              className="press flex w-full items-center gap-3 p-3 text-left"
            >
              <ScanBarcode className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-sm font-bold">Scan a barcode instead</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${barcodeOpen ? "rotate-180" : ""}`} />
            </button>
            {barcodeOpen && (
              <div className="space-y-3 border-t border-border p-3">
                <div className="relative overflow-hidden rounded-xl bg-navy">
                  <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline autoPlay />
                  {cam.ready ? (
                    <div className="scanner-frame pointer-events-none absolute inset-x-10 inset-y-10">
                      {!paused && <div className="animate-scan-sweep absolute inset-x-0 h-0.5 bg-primary" />}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-navy-foreground">
                      <ScanBarcode className="h-10 w-10 opacity-70" />
                      <p className="text-sm font-bold">{cam.error ?? "Opening scanner…"}</p>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-navy/70 px-3 py-1 text-xs font-bold text-navy-foreground">
                    {paused ? "Paused" : "Point at a barcode"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    className="press absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-navy/70 text-navy-foreground"
                    aria-label={paused ? "Resume scanning" : "Pause scanning"}
                  >
                    {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </button>
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (manualCode.trim()) {
                      handleBarcode(manualCode.trim());
                      setManualCode("");
                    }
                  }}
                >
                  <input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    inputMode="numeric"
                    placeholder="Or type the barcode"
                    className="h-12 flex-1 rounded-xl border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button type="submit" className="press h-12 rounded-xl bg-secondary px-6 text-sm font-bold">
                    Add
                  </button>
                </form>
              </div>
            )}
          </Card>
        )}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Received so far</p>
          <div className="space-y-2">
            {scanned.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nothing counted yet. Take a photo of the first product.
              </p>
            )}
            {scanned.map((r) => (
              <Card key={r.key} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {r.received} received / {r.expected} invoiced {r.unit}
                  </p>
                </div>
                <div className="h-2 w-16 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={r.received} aria-valuemax={r.expected}>
                  <div
                    className={`h-full ${r.received > r.expected ? "bg-info" : r.received === r.expected ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, (r.received / Math.max(1, r.expected)) * 100)}%` }}
                  />
                </div>
                {open && (
                  <button
                    type="button"
                    onClick={() => setEditRow(r)}
                    className="press rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground"
                  >
                    Edit
                  </button>
                )}
              </Card>
            ))}
            {waiting.length > 0 && (
              <p className="pt-2 text-[11px] text-muted-foreground">
                Still waiting for: {waiting.map((r) => `${r.name} (${r.expected})`).join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>

      <ActionBar>
        <PrimaryButton
          onClick={() => navigate({ to: "/receive/reconcile", search: { delivery: d.id } })}
          disabled={rows.length === 0}
        >
          <CheckCheck className="h-4 w-4" /> Compare with invoice
        </PrimaryButton>
      </ActionBar>

      {/* Unknown barcode: match to an existing product or create one, then count it. */}
      <Sheet open={unknown !== null} onClose={() => setUnknown(null)} title="Unknown barcode">
        {unknown && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Barcode <span className="font-mono font-bold text-foreground">{unknown}</span> isn't in the catalogue. Pick the
              product it belongs to, or create a new product with this barcode.
            </p>
            <ProductPicker
              barcode={unknown}
              onPick={async (p) => {
                const code = unknown;
                setUnknown(null);
                // A product without a barcode (e.g. added from the invoice) gets this one,
                // so the next scan finds it directly.
                if (p.barcode == null) {
                  try {
                    await setProductBarcode(p.id, code);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }
                await countProduct(p, "manual");
              }}
            />
          </div>
        )}
      </Sheet>

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Count a product">
        <ProductPicker
          onPick={async (p) => {
            setPickOpen(false);
            await countProduct(p, "manual");
          }}
        />
      </Sheet>

      {/* AI suggestion from a photo: a human confirms before anything is counted. */}
      <Sheet open={suggestion !== null} onClose={() => setSuggestion(null)} title="Is this the product?">
        {suggestion && (
          <div className="space-y-3">
            {suggestion.product ? (
              <Card className="p-3">
                <p className="text-lg font-bold">{suggestion.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  AI confidence {Math.round(suggestion.confidence * 100)}% · {suggestion.reason}
                </p>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">The AI could not match this photo: {suggestion.reason}</p>
            )}
            {suggestion.product && (
              <PrimaryButton
                onClick={async () => {
                  const p = suggestion.product!;
                  setSuggestion(null);
                  await countProduct(p, "vision");
                }}
              >
                Yes, count 1
              </PrimaryButton>
            )}
            <p className="pt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Or choose it yourself</p>
            <ProductPicker
              onPick={async (p) => {
                setSuggestion(null);
                await countProduct(p, "manual");
              }}
            />
          </div>
        )}
      </Sheet>

      {/* Exact received quantity */}
      <Sheet open={editRow !== null} onClose={() => setEditRow(null)} title={editRow?.name ?? ""}>
        {editRow?.product_id != null && (
          <EditQty
            key={editRow.key}
            initial={editRow.received}
            onSave={async (qty) => {
              if (await run(() => setReceivedQty(delivery, editRow.product_id!, qty))) setEditRow(null);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}

function EditQty({ initial, onSave }: { initial: number; onSave: (qty: number) => void }) {
  const [qty, setQty] = useState(initial);
  return (
    <div className="space-y-4">
      <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">Received quantity</p>
      <div className="flex justify-center">
        <QtyStepper value={qty} onChange={setQty} />
      </div>
      <QuickAdds onAdd={(n) => setQty((q) => q + n)} />
      <PrimaryButton onClick={() => onSave(qty)} disabled={qty === initial}>
        Save quantity
      </PrimaryButton>
    </div>
  );
}
