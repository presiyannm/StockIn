import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Plus, Truck, ClipboardList, Camera, ScanBarcode, CheckCheck, Send } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, PrimaryButton, Sheet } from "@/components/ui-bits";
import { SupplierPicker } from "@/components/supplier-picker";
import { useAppState, createDelivery, getApiMode, setApiMode, getApiBase, setApiBase } from "@/lib/api/client";

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
  { icon: ClipboardList, label: "Log issues" },
  { icon: Send, label: "Send report" },
];

const nextRoute: Record<string, string> = {
  invoice: "/receive/invoice",
  scanning: "/receive/scan",
  reconciled: "/receive/report",
};

function HomePage() {
  const state = useAppState();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const active = state.deliveries.find((d) => d.status !== "closed");
  const mode = getApiMode();

  async function start() {
    if (!supplier.trim()) return;
    setBusy(true);
    const d = await createDelivery({ supplierName: supplier.trim(), supplierEmail: email.trim() });
    setBusy(false);
    setNewOpen(false);
    navigate({ to: "/receive/invoice", search: { delivery: d.id } });
  }

  return (
    <AppShell>
      <PageHeader
        title="StockIn"
        subtitle="Dock receiving"
        right={
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="press rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground"
          >
            {mode === "mock" ? "Demo data" : "Live API"}
          </button>
        }
      />

      <div className="space-y-4 p-4">
        {active ? (
          <Card className="border-primary/30 bg-primary/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Active delivery</p>
                <p className="mt-1 text-lg font-bold">{active.reference}</p>
                <p className="text-sm text-muted-foreground">{active.supplierName}</p>
              </div>
              <Truck className="h-8 w-8 text-primary" />
            </div>
            <div className="mt-4">
              <PrimaryButton onClick={() => navigate({ to: nextRoute[active.status] ?? "/receive/invoice", search: { delivery: active.id } })}>
                Resume receiving <ArrowRight className="h-4 w-4" />
              </PrimaryButton>
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
              <PrimaryButton onClick={() => setNewOpen(true)}>
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
          <SupplierPicker state={state} name={supplier} email={email} onChange={(n, e) => { setSupplier(n); setEmail(e); }} />
          <PrimaryButton onClick={start} disabled={!supplier.trim() || busy}>
            {busy ? "Creating…" : "Start receiving"}
          </PrimaryButton>
        </div>
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="API connection">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["mock", "live"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setApiMode(m)}
                className={`press rounded-xl border py-3 text-sm font-bold ${
                  mode === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {m === "mock" ? "Demo data" : "Live API"}
              </button>
            ))}
          </div>
          {mode === "live" && (
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">API base URL</span>
              <input
                defaultValue={getApiBase()}
                onBlur={(e) => setApiBase(e.target.value)}
                placeholder="http://localhost:3001"
                className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Demo data keeps everything on this device. Live API sends requests to your StockIn backend.
          </p>
        </div>
      </Sheet>
    </AppShell>
  );
}
