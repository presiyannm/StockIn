import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, Package, Trash2, History } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ActionBar, Card, PrimaryButton, QtyStepper } from "@/components/ui-bits";
import { useAppState, getStockLevels, adjustStock } from "@/lib/api/client";
import { readFiles } from "@/lib/camera";

export const Route = createFileRoute("/stock_/$productId")({
  head: () => ({
    meta: [
      { title: "Product Stock | StockIn" },
      { name: "description", content: "Correct the on-hand quantity of a product with a reason and photo evidence." },
      { property: "og:title", content: "Product Stock | StockIn" },
      { property: "og:description", content: "Correct the on-hand quantity of a product with a reason and photo evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductPage,
});

const REASONS = ["Damaged / broken", "Expired", "Stock count correction", "Lost / stolen", "Returned", "Other"];

function ProductPage() {
  const { productId } = Route.useParams();
  const state = useAppState();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const product = state.products.find((p) => p.id === productId);
  const level = getStockLevels().find((l) => l.productId === productId);
  const current = level?.sellableQty ?? 0;
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const value = qty ?? current;
  const history = (state.adjustments ?? []).filter((a) => a.productId === productId);

  if (!product) {
    return (
      <AppShell>
        <PageHeader title="Product" onBack={() => navigate({ to: "/stock" })} />
        <p className="p-4 text-sm text-muted-foreground">Product not found.</p>
      </AppShell>
    );
  }

  const changed = value !== current;

  async function save() {
    if (!changed || !reason) return;
    await adjustStock({ productId, newQty: value, reason, note: note.trim() || undefined, photos });
    setQty(null);
    setReason("");
    setNote("");
    setPhotos([]);
  }

  return (
    <AppShell>
      <PageHeader title={product.name} subtitle={product.barcode} onBack={() => navigate({ to: "/stock" })} />
      <div className="space-y-4 p-4 pb-44">
        <Card className="flex items-center gap-3">
          {product.photo ? (
            <img src={product.photo} alt={product.name} className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <Package className="h-6 w-6" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{product.supplier ?? "No supplier"} · {product.unit}</p>
            <p className="font-mono text-2xl font-bold">{current} <span className="text-xs font-semibold text-muted-foreground">in stock</span></p>
            {(level?.quarantineQty ?? 0) > 0 && (
              <p className="text-xs font-bold text-warning-foreground">{level?.quarantineQty} in quarantine</p>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Correct quantity</p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">New quantity</span>
            <QtyStepper value={value} onChange={setQty} min={0} />
          </div>
          {changed && (
            <p className={`text-xs font-bold ${value < current ? "text-destructive" : "text-success"}`}>
              {value < current ? "−" : "+"}{Math.abs(value - current)} {product.unit} ({current} → {value})
            </p>
          )}
        </Card>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Reason</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`press rounded-full px-3.5 py-2 text-xs font-bold ${
                  reason === r ? "bg-navy text-navy-foreground" : "bg-secondary text-secondary-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Details (optional) — e.g. dropped a crate in aisle 4"
            className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Photos ({photos.length})</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              readFiles(e.target.files, (u) => setPhotos((p) => [...p, u]));
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-3 gap-2">
            {photos.map((src, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl border border-border">
                <img src={src} alt={`Photo ${i + 1}`} className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="press absolute right-1 top-1 rounded-md bg-destructive p-1.5 text-destructive-foreground"
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 text-primary"
            >
              <Camera className="h-6 w-6" />
              <span className="text-[11px] font-bold">Add photo</span>
            </button>
          </div>
        </div>

        {history.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" /> Change history
            </p>
            <div className="space-y-2">
              {history.map((a) => (
                <Card key={a.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">{a.reason}</p>
                    <p className="font-mono text-xs font-bold">{a.previousQty} → {a.newQty}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</p>
                  {a.note && <p className="mt-1 text-xs">“{a.note}”</p>}
                  {a.photos.length > 0 && (
                    <div className="mt-2 flex gap-1.5">
                      {a.photos.map((src, i) => (
                        <img key={i} src={src} alt="Evidence" className="h-10 w-10 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <ActionBar>
        <PrimaryButton onClick={save} disabled={!changed || !reason}>
          {!changed ? "Change the quantity to update" : !reason ? "Pick a reason" : "Save stock change"}
        </PrimaryButton>
      </ActionBar>
    </AppShell>
  );
}
