import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Camera, Package, Plus, Search } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, EmptyState, PrimaryButton, Sheet } from "@/components/ui-bits";
import { useAppState, getStockLevels, createProduct, getSuppliers, getProductSuppliers } from "@/lib/api/client";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock & Catalogue | StockIn" },
      { name: "description", content: "Search on-hand stock by name or barcode, see quarantine levels, and add new products." },
      { property: "og:title", content: "Stock & Catalogue | StockIn" },
      { property: "og:description", content: "Search on-hand stock by name or barcode, see quarantine levels, and add new products." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockPage,
});

type Filter = "all" | "sellable" | "quarantine";

function StockPage() {
  const state = useAppState();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [supplier, setSupplier] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [photo, setPhoto] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  const levels = getStockLevels();
  const suppliers = useMemo(() => getSuppliers(state).map((s) => s.name), [state]);

  const items = state.products
    .map((p) => ({ product: p, level: levels.find((l) => l.productId === p.id)! }))
    .filter(({ product }) => {
      const s = q.toLowerCase();
      return !s || product.name.toLowerCase().includes(s) || product.barcode.includes(s);
    })
    .filter(({ product }) => supplier === "all" || getProductSuppliers(state, product.id).includes(supplier.trim().toLowerCase()))
    .filter(({ level }) =>
      filter === "all" ? true : filter === "sellable" ? level.sellableQty > 0 : level.quarantineQty > 0,
    );

  async function save() {
    if (!barcode.trim() || !name.trim()) return;
    await createProduct({ barcode: barcode.trim(), name: name.trim(), unit, ...(photo ? { photo } : {}) });
    setBarcode("");
    setName("");
    setPhoto(undefined);
    setAddOpen(false);
  }

  return (
    <AppShell>
      <PageHeader
        title="Stock"
        subtitle={`${state.products.length} products in catalogue`}
        right={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="press flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        }
      />

      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or barcode"
            className="h-12 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["all", "sellable", "quarantine"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold capitalize ${
                filter === f ? "bg-navy text-navy-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {f}
            </button>
          ))}
          <select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold"
            aria-label="Filter by supplier"
          >
            <option value="all">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="No products found" hint="Try a different search or add a new product." />
        ) : (
          <div className="space-y-2">
            {items.map(({ product, level }) => (
              <Link key={product.id} to="/stock/$productId" params={{ productId: product.id }} className="press block">
              <Card className="flex items-center gap-3 p-3">
                {product.photo ? (
                  <img src={product.photo} alt={product.name} className="h-11 w-11 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <Package className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{product.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{product.barcode}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-bold leading-none text-foreground">{level.sellableQty}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">{product.unit}</p>
                  {level.quarantineQty > 0 && (
                    <p className="mt-0.5 rounded bg-warning/25 px-1 text-[10px] font-bold text-warning-foreground">
                      {level.quarantineQty} quar.
                    </p>
                  )}
                </div>
              </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add new product">
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => typeof r.result === "string" && setPhoto(r.result);
              r.readAsDataURL(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press flex h-24 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 text-sm font-bold text-primary"
          >
            {photo ? <img src={photo} alt="Product" className="h-full w-full object-cover" /> : (<><Camera className="h-5 w-5" /> Photo of product / barcode</>)}
          </button>
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Barcode"
            inputMode="numeric"
            className="h-12 w-full rounded-xl border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
            className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="pcs">Pieces</option>
            <option value="kg">Kilograms</option>
            <option value="box">Boxes</option>
            <option value="l">Litres</option>
          </select>
          <PrimaryButton onClick={save} disabled={!barcode.trim() || !name.trim()}>
            Save product
          </PrimaryButton>
        </div>
      </Sheet>
    </AppShell>
  );
}
