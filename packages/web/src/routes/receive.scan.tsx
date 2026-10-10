import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCheck, ScanBarcode, Pause, Play } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ActionBar, Card, PrimaryButton, QtyStepper, QuickAdds, Sheet } from "@/components/ui-bits";
import {
  useAppState,
  recordScan,
  setScanQty,
  createProduct,
  getReconciliation,
  getState,
} from "@/lib/api/client";
import { useCamera } from "@/lib/camera";
import type { Product } from "@/lib/api/types";

export const Route = createFileRoute("/receive/scan")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: String(s["delivery"] ?? "") }),
  head: () => ({
    meta: [
      { title: "Step 2 — Scan Items | StockIn" },
      { name: "description", content: "Scan package barcodes, count items, and register new products on the fly." },
      { property: "og:title", content: "Step 2 — Scan Items | StockIn" },
      { property: "og:description", content: "Scan package barcodes, count items, and register new products on the fly." },
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
  const state = useAppState();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualCode, setManualCode] = useState("");
  const [paused, setPaused] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  const d = state.deliveries.find((dd) => dd.id === delivery);
  const rows = getReconciliation(delivery);
  const expectedTotal = rows.reduce((a, r) => a + r.line.expectedQty, 0);
  const scannedTotal = rows.reduce((a, r) => a + Math.min(r.scannedQty, r.line.expectedQty || Infinity), 0);

  const cam = useCamera(videoRef, !!d);
  const pausedRef = useRef(false);
  pausedRef.current = unknown !== null || editProduct !== null || paused;
  const lastRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  function handleBarcode(code: string, fromCamera = false) {
    if (fromCamera) {
      if (pausedRef.current) return;
      const t = Date.now();
      if (lastRef.current.code === code && t - lastRef.current.t < 2000) return;
      lastRef.current = { code, t };
    }
    const product = getState().products.find((p) => p.barcode === code);
    if (product) {
      beep();
      setLastScan(product.name);
      recordScan(delivery, product.id, 1);
    } else {
      setUnknown(code);
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

  async function registerUnknown() {
    if (!unknown || !newName.trim()) return;
    const p = await createProduct({ barcode: unknown, name: newName.trim(), unit: "pcs", supplier: d?.supplierName });
    beep();
    await recordScan(delivery, p.id, 1);
    setUnknown(null);
    setNewName("");
    setLastScan(p.name);
  }

  if (!d) {
    return (
      <AppShell>
        <PageHeader title="Scan items" />
        <p className="p-4 text-sm text-muted-foreground">Delivery not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        onBack={() => navigate({ to: "/receive/invoice", search: { delivery: d.id } })}
        title="Scan items"
        subtitle={`${d.reference} · Step 2 of 5`}
        right={
          <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-bold text-primary">
            {scannedTotal}/{expectedTotal}
          </span>
        }
      />

      <div className="space-y-4 p-4 pb-40">
        <div className="relative overflow-hidden rounded-2xl bg-navy">
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
            {paused ? "Paused" : "Scanning — just point at barcodes"}
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

        {lastScan && (
          <Card className="border-success/40 bg-success/10 p-3">
            <p className="text-sm font-bold text-success">✓ Scanned: {lastScan}</p>
          </Card>
        )}

        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Or enter barcode manually
          </p>
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualCode.trim()) {
                  handleBarcode(manualCode.trim());
                  setManualCode("");
                }
              }}
              inputMode="numeric"
              placeholder="3800204000011"
              className="h-12 flex-1 rounded-xl border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => {
                if (manualCode.trim()) {
                  handleBarcode(manualCode.trim());
                  setManualCode("");
                }
              }}
              className="press h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground"
            >
              Add
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Scanned so far
          </p>
          <div className="space-y-2">
            {rows.filter((r) => r.scannedQty > 0).length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nothing scanned yet. Known barcodes: 3800204000011, …028, …035, …042
              </p>
            )}
            {rows
              .filter((r) => r.scannedQty > 0)
              .map((r) => (
                <Card key={r.line.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.line.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {r.scannedQty} / {r.line.expectedQty} {r.line.unit}
                    </p>
                  </div>
                  <div
                    className={`h-2 w-16 overflow-hidden rounded-full bg-secondary`}
                    role="progressbar"
                    aria-valuenow={r.scannedQty}
                    aria-valuemax={r.line.expectedQty}
                  >
                    <div
                      className={`h-full ${r.scannedQty >= r.line.expectedQty ? "bg-success" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, (r.scannedQty / Math.max(1, r.line.expectedQty)) * 100)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => r.product && setEditProduct(r.product)}
                    className="press rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground"
                  >
                    Edit
                  </button>
                </Card>
              ))}
          </div>
        </div>
      </div>

      <ActionBar>
        <PrimaryButton
          onClick={() => navigate({ to: "/receive/reconcile", search: { delivery: d.id } })}
          disabled={rows.every((r) => r.scannedQty === 0)}
        >
          <CheckCheck className="h-4 w-4" /> Review & reconcile
        </PrimaryButton>
      </ActionBar>

      {/* Unknown barcode intercept */}
      <Sheet open={unknown !== null} onClose={() => setUnknown(null)} title="New product">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Barcode <span className="font-mono font-bold text-foreground">{unknown}</span> isn't in the
            catalogue. Name it to add it as a new product.
          </p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Product name"
            autoFocus
            className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <PrimaryButton onClick={registerUnknown} disabled={!newName.trim()}>
            Save product & count 1
          </PrimaryButton>
        </div>
      </Sheet>

      {/* Quick qty edit */}
      <Sheet open={editProduct !== null} onClose={() => setEditProduct(null)} title={editProduct?.name ?? ""}>
        {editProduct && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <QtyStepper
                value={state.scans.find((s) => s.deliveryId === delivery && s.productId === editProduct.id)?.qty ?? 0}
                onChange={(v) => setScanQty(delivery, editProduct.id, v)}
              />
            </div>
            <QuickAdds onAdd={(n) => recordScan(delivery, editProduct.id, n)} />
            <PrimaryButton variant="outline" onClick={() => setEditProduct(null)}>
              Done
            </PrimaryButton>
          </div>
        )}
      </Sheet>
    </AppShell>
  );
}
