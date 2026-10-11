import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCheck, ScanBarcode, Camera, Sparkles, ListChecks, ImagePlus, Check, X } from "lucide-react";
import { AppShell, PageHeader, PageMessage, deliveryLabel } from "@/components/app-shell";
import { ActionBar, Card, PrimaryButton, QtyStepper, QuickAdds, Sheet } from "@/components/ui-bits";
import { ProductPicker } from "@/components/product-picker";
import { ApiError, identifyProduct, scanBarcode, scanProduct, setProductBarcode, setReceivedQty } from "@/lib/api/client";
import { useDelivery, useDeliveryAction, useProducts } from "@/lib/api/queries";
import type { Product } from "@/lib/api/types";
import { productRows, type ProductRow } from "@/lib/rows";
import { useCamera, captureFrame, dataUrlToBlob, readFiles } from "@/lib/camera";
import { toast } from "sonner";

export const Route = createFileRoute("/receive/scan")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: Number(s["delivery"]) || 0 }),
  head: () => ({
    meta: [
      { title: "Step 2 — Count Items | StockIn" },
      { name: "description", content: "Photograph each product and let the AI identify it, or scan its barcode." },
      { property: "og:title", content: "Step 2 — Count Items | StockIn" },
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

/** One product photo: the AI identifies it in the background while the user keeps shooting. */
type Shot = {
  id: number;
  src: string;
  status: "identifying" | "done" | "error";
  product: Product | null;
  confidence: number;
  reason: string;
};

let nextShotId = 1;

function ScanPage() {
  const { delivery } = Route.useSearch();
  const navigate = useNavigate();
  const { data, isPending } = useDelivery(delivery);
  const { run } = useDeliveryAction(delivery);
  const { data: products = [] } = useProducts();
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [manualCode, setManualCode] = useState("");
  const [unknown, setUnknown] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ProductRow | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  // The photo whose product the user is choosing by hand.
  const [fixShot, setFixShot] = useState<Shot | null>(null);
  const [flash, setFlash] = useState(false);
  // Photos are the main way to count; barcode mode reuses the same camera.
  const [barcodeMode, setBarcodeMode] = useState(false);

  const open = !!data && data.delivery.status !== "closed";
  const cam = useCamera(videoRef, open);
  const pausedRef = useRef(false);
  pausedRef.current = !barcodeMode || unknown !== null || editRow !== null || pickOpen || fixShot !== null;
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

  // Continuous barcode detection, only in barcode mode
  useEffect(() => {
    if (!cam.ready || !barcodeMode || !videoRef.current) return;
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
  }, [cam.ready, barcodeMode]);

  if (isPending) return <PageMessage title="Count items" text="Loading…" />;
  if (!data) return <PageMessage title="Count items" text="Delivery not found." onBack={() => navigate({ to: "/" })} />;
  const d = data.delivery;
  const rows = productRows(data);
  const expectedTotal = rows.reduce((a, r) => a + r.expected, 0);
  const receivedTotal = rows.reduce((a, r) => a + r.received, 0);
  const scanned = rows.filter((r) => r.received > 0);
  const waiting = rows.filter((r) => r.received === 0 && r.product_id != null);
  const recognised = shots.filter((s) => s.status === "done" && s.product);

  async function countProduct(p: Product, method: "manual" | "vision" | "barcode") {
    if (await run(() => scanProduct(delivery, p.id, 1, method))) {
      beep();
      setLastScan(p.name);
    }
  }

  const updateShot = (id: number, patch: Partial<Shot>) =>
    setShots((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const dropShot = (id: number) => setShots((all) => all.filter((s) => s.id !== id));

  // The AI only suggests; nothing is counted until the user taps Count.
  async function addShot(src: string) {
    const id = nextShotId++;
    setShots((all) => [{ id, src, status: "identifying", product: null, confidence: 0, reason: "" }, ...all]);
    try {
      const r = await identifyProduct(delivery, await dataUrlToBlob(src));
      updateShot(id, { status: "done", product: r.product, confidence: r.confidence, reason: r.reason });
    } catch (e) {
      updateShot(id, { status: "error", reason: (e as Error).message });
    }
  }

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const url = captureFrame(v, 1024);
    if (!url) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    addShot(url);
  }

  async function countShot(shot: Shot, p: Product, method: "vision" | "manual") {
    dropShot(shot.id);
    await countProduct(p, method);
  }

  async function countAll() {
    for (const shot of recognised) await countShot(shot, shot.product!, "vision");
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
              multiple
              className="hidden"
              onChange={(e) => {
                readFiles(e.target.files, addShot);
                e.target.value = "";
              }}
            />
            <div className="relative overflow-hidden rounded-2xl bg-navy">
              <video ref={videoRef} className="aspect-[3/4] w-full object-cover" muted playsInline autoPlay />
              {flash && <div className="absolute inset-0 bg-card/70" />}
              {cam.ready && barcodeMode && (
                <div className="scanner-frame pointer-events-none absolute inset-x-10 inset-y-24">
                  <div className="animate-scan-sweep absolute inset-x-0 h-0.5 bg-primary" />
                </div>
              )}
              {!cam.ready && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-navy-foreground">
                  <Camera className="h-10 w-10 opacity-70" />
                  <p className="text-sm font-bold">{cam.error ?? "Opening camera…"}</p>
                  <p className="text-xs opacity-80">You can add product photos with the gallery button.</p>
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-navy/70 px-3 py-1 text-xs font-bold text-navy-foreground">
                {barcodeMode ? "Point at a barcode" : "Snap each product, keep going"}
              </span>
              <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-6">
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  className="press flex h-12 w-12 items-center justify-center rounded-full bg-navy/70 text-navy-foreground"
                  aria-label="Add photos from gallery"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
                {barcodeMode ? (
                  <button
                    type="button"
                    onClick={() => setBarcodeMode(false)}
                    className="press flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-navy/70 text-navy-foreground"
                    aria-label="Back to photos"
                  >
                    <Camera className="h-7 w-7" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={snap}
                    disabled={!cam.ready}
                    className="press h-20 w-20 rounded-full border-4 border-card bg-primary disabled:opacity-40"
                    aria-label="Take product photo"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setBarcodeMode((b) => !b)}
                  className={`press flex h-12 w-12 items-center justify-center rounded-full ${
                    barcodeMode ? "bg-primary text-primary-foreground" : "bg-navy/70 text-navy-foreground"
                  }`}
                  aria-label={barcodeMode ? "Back to photos" : "Scan a barcode instead"}
                  aria-pressed={barcodeMode}
                >
                  <ScanBarcode className="h-5 w-5" />
                </button>
              </div>
            </div>

            {barcodeMode && (
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
            )}
          </>
        )}

        {lastScan && (
          <Card className="border-success/40 bg-success/10 p-3">
            <p className="text-sm font-bold text-success">✓ Counted: {lastScan}</p>
          </Card>
        )}

        {shots.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Photos to confirm ({shots.length})</p>
              {recognised.length > 1 && (
                <button
                  type="button"
                  onClick={countAll}
                  className="press flex items-center gap-1 rounded-lg bg-success/15 px-2.5 py-1.5 text-[11px] font-bold text-success"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Count all {recognised.length}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {shots.map((shot) => (
                <Card key={shot.id} className="flex items-center gap-3 p-2">
                  <img src={shot.src} alt="Product" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    {shot.status === "identifying" ? (
                      <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
                        <Sparkles className="h-4 w-4 animate-pulse-soft" /> Identifying…
                      </p>
                    ) : shot.product ? (
                      <>
                        <p className="truncate text-sm font-bold">{shot.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">AI {Math.round(shot.confidence * 100)}% sure</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-destructive">Not recognised</p>
                        <p className="truncate text-[11px] text-muted-foreground">{shot.reason}</p>
                      </>
                    )}
                  </div>
                  {shot.status === "done" && shot.product && (
                    <button
                      type="button"
                      onClick={() => countShot(shot, shot.product!, "vision")}
                      className="press flex items-center gap-1 rounded-lg bg-success px-3 py-2 text-xs font-bold text-success-foreground"
                    >
                      <Check className="h-4 w-4" /> Count
                    </button>
                  )}
                  {shot.status !== "identifying" && (
                    <button
                      type="button"
                      onClick={() => setFixShot(shot)}
                      className="press rounded-lg border border-border px-2.5 py-2 text-[11px] font-bold"
                    >
                      {shot.product ? "Change" : "Pick"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dropShot(shot.id)}
                    className="press rounded-lg p-2 text-muted-foreground"
                    aria-label="Discard photo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {open && (
          <button
            type="button"
            onClick={() => setPickOpen(true)}
            className="press flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-xs font-bold"
          >
            <ListChecks className="h-4 w-4" /> Pick from catalogue
          </button>
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

      {/* The user chooses the product for a photo the AI got wrong or could not recognise. */}
      <Sheet open={fixShot !== null} onClose={() => setFixShot(null)} title="Which product is this?">
        {fixShot && (
          <div className="space-y-3">
            <img src={fixShot.src} alt="Product" className="mx-auto max-h-48 rounded-xl object-contain" />
            <ProductPicker
              onPick={async (p) => {
                const shot = fixShot;
                setFixShot(null);
                await countShot(shot, p, "manual");
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
