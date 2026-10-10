import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Plus, Truck, ClipboardList, Camera, ScanBarcode, CheckCheck, FileCheck2 } from "lucide-react";
import { AppShell, PageHeader, deliveryLabel } from "@/components/app-shell";
import { Card, PrimaryButton, Sheet } from "@/components/ui-bits";
import { SupplierPicker } from "@/components/supplier-picker";
import { createDelivery } from "@/lib/api/client";
import { useDeliveries, useDeliveryAction } from "@/lib/api/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StockIn — Receive a Delivery" },
      { name: "description", content: "Start or resume a delivery: capture the invoice, scan items, reconcile, and report issues." },
      { property: "og:title", content: "StockIn — Receive a Delivery" },
      { property: "og:description", content: "Start or resume a delivery: capture the invoice, scan items, reconcile, and report issues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

const steps = [
  { icon: Camera, label: "Capture invoice" },
  { icon: ScanBarcode, label: "Scan items" },
  { icon: CheckCheck, label: "Reconcile" },
  { icon: ClipboardList, label: "Report issues" },
  { icon: FileCheck2, label: "Confirm & print report" },
];

const nextRoute = {
  draft: "/receive/invoice",
  scanning: "/receive/scan",
  reconciled: "/receive/reconcile",
  closed: "/receive/report",
} as const;

function HomePage() {
  const navigate = useNavigate();
  const { data: deliveries, isPending, error } = useDeliveries();
  const [newOpen, setNewOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const { run, busy } = useDeliveryAction(0);

  const active = deliveries?.find((d) => d.status !== "closed");

  async function start() {
    let id = 0;
    const ok = await run(async () => {
      id = (await createDelivery(supplierId)).id;
    });
    if (!ok) return;
    setNewOpen(false);
    navigate({ to: "/receive/invoice", search: { delivery: id } });
  }

  return (
    <AppShell>
      <PageHeader title="StockIn" subtitle="Dock receiving" />

      <div className="space-y-4 p-4">
        {error && (
          <Card className="border-destructive/40 bg-destructive/10">
            <p className="text-sm font-bold text-destructive">Can't reach the StockIn API</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error.message}. Is <span className="font-mono">npm run dev</span> running?
            </p>
          </Card>
        )}
        {isPending ? (
          <Card>
            <p className="text-sm text-muted-foreground">Loading…</p>
          </Card>
        ) : active ? (
          <Card className="border-primary/30 bg-primary/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Active delivery</p>
                <p className="mt-1 text-lg font-bold">{deliveryLabel(active)}</p>
                <p className="text-sm text-muted-foreground">{active.supplier_name ?? "Supplier not known yet"}</p>
              </div>
              <Truck className="h-8 w-8 text-primary" />
            </div>
            <div className="mt-4 space-y-2">
              <PrimaryButton onClick={() => navigate({ to: nextRoute[active.status], search: { delivery: active.id } })}>
                Resume receiving <ArrowRight className="h-4 w-4" />
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="press w-full py-2 text-xs font-bold text-muted-foreground"
              >
                Start another delivery
              </button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">No active delivery</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start a new delivery to capture the invoice and begin scanning.
                </p>
              </div>
              <Truck className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="mt-4">
              <PrimaryButton onClick={() => setNewOpen(true)} disabled={!!error}>
                <Plus className="h-4 w-4" /> New delivery
              </PrimaryButton>
            </div>
          </Card>
        )}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">How it works</p>
          <Card className="p-2">
            {steps.map(({ icon: Icon, label }, i) => (
              <div key={label} className="flex items-center gap-3 px-2 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">{label}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{i + 1}/5</span>
              </div>
            ))}
          </Card>
        </div>

        <Link to="/stock" className="block text-center text-xs font-semibold text-primary">
          Browse stock catalogue →
        </Link>
      </div>

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="New delivery">
        <div className="space-y-4">
          <SupplierPicker value={supplierId} onChange={setSupplierId} />
          <PrimaryButton onClick={start} disabled={busy}>
            {busy ? "Creating…" : "Start receiving"}
          </PrimaryButton>
        </div>
      </Sheet>
    </AppShell>
  );
}
