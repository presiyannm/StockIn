import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, History as HistoryIcon } from "lucide-react";
import { AppShell, PageHeader, deliveryLabel } from "@/components/app-shell";
import { Card, EmptyState } from "@/components/ui-bits";
import { useDeliveries } from "@/lib/api/queries";
import type { DeliveryStatus } from "@/lib/api/types";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Delivery History | StockIn" },
      { name: "description", content: "Past deliveries with status and supplier reports." },
      { property: "og:title", content: "Delivery History | StockIn" },
      { property: "og:description", content: "Past deliveries with status and supplier reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

const statusStyle: Record<DeliveryStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  scanning: "bg-primary/15 text-primary",
  reconciled: "bg-warning/25 text-warning-foreground",
  closed: "bg-success/15 text-success",
};

const openRoute = {
  draft: "/receive/invoice",
  scanning: "/receive/scan",
  reconciled: "/receive/reconcile",
  closed: "/receive/report",
} as const;

function HistoryPage() {
  const { data: deliveries = [], isPending, error } = useDeliveries();

  return (
    <AppShell>
      <PageHeader title="History" subtitle={isPending ? "Loading…" : `${deliveries.length} deliveries`} />
      <div className="space-y-2 p-4">
        {error && <p className="text-sm font-bold text-destructive">{error.message}</p>}
        {!isPending && deliveries.length === 0 && <EmptyState icon={<HistoryIcon className="h-6 w-6" />} title="No deliveries yet" />}
        {deliveries.map((d) => (
          <Link key={d.id} to={openRoute[d.status]} search={{ delivery: d.id }} className="block">
            <Card className="press flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold">{deliveryLabel(d)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${statusStyle[d.status]}`}>{d.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {d.supplier_name ?? "Unknown supplier"} · {new Date(d.created_at).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
