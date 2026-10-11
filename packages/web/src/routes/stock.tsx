import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Package, Plus, Search } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, EmptyState, Sheet } from "@/components/ui-bits";
import { ProductPicker } from "@/components/product-picker";
import { useStock } from "@/lib/api/queries";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock & Catalogue | StockIn" },
      { name: "description", content: "Search on-hand stock by name or barcode and add new products." },
      { property: "og:title", content: "Stock & Catalogue | StockIn" },
      { property: "og:description", content: "Search on-hand stock by name or barcode and add new products." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockPage,
});

type Filter = "all" | "in_stock" | "empty";

function StockPage() {
  const { data: stock = [], isPending, error } = useStock();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);

  const s = q.trim().toLowerCase();
  const items = stock
    .filter((p) => !s || p.name.toLowerCase().includes(s) || p.barcode?.includes(s))
    .filter((p) => (filter === "all" ? true : filter === "in_stock" ? p.in_stock > 0 : p.in_stock <= 0));

  return (
    <AppShell>
      <PageHeader
        title="Stock"
        subtitle={isPending ? "Loading…" : `${stock.length} products in catalogue`}
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
          {(
            [
              ["all", "All"],
              ["in_stock", "In stock"],
              ["empty", "None in stock"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                filter === f ? "bg-navy text-navy-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm font-bold text-destructive">{error.message}</p>}
        {!isPending && items.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="No products found" hint="Try a different search or add a new product." />
        ) : (
          <div className="space-y-2">
            {items.map((p) => (
              <Card key={p.id} className="flex items-center gap-3 p-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{p.barcode ?? "no barcode"}</p>
                  {p.last_received && (
                    <p className="text-[10px] text-muted-foreground">last received {new Date(p.last_received).toLocaleDateString()}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-bold leading-none text-foreground">{p.in_stock}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">{p.unit}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add new product">
        <ProductPicker createOnly onPick={() => setAddOpen(false)} />
      </Sheet>
    </AppShell>
  );
}
