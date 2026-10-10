import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, History as HistoryIcon } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, EmptyState } from "@/components/ui-bits";
import { useAppState } from "@/lib/api/client";
import type { DeliveryStatus } from "@/lib/api/types";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Delivery History | StockIn" },
      { name: "description", content: "Past deliveries with status, issues, and supplier reports." },
      { property: "og:title", content: "Delivery History | StockIn" },
      { property: "og:description", content: "Past deliveries with status, issues, and supplier reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

const statusStyle: Record<DeliveryStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  invoice: "bg-info/15 text-info",
  scanning: "bg-primary/15 text-primary",
  reconciled: "bg-warning/25 text-warning-foreground",
  closed: "bg-success/15 text-success",
};

function HistoryPage() {
  const state = useAppState();

  return (
    <AppShell>
      <PageHeader title="History" subtitle={`${state.deliveries.length} deliveries`} />
      <div className="space-y-2 p-4">
        {state.deliveries.length === 0 && (
          <EmptyState icon={<HistoryIcon className="h-6 w-6" />} title="No deliveries yet" />
        )}
        {state.deliveries.map((d) => {
          const issues = state.issues.filter((i) => i.deliveryId === d.id).length;
          return (
            <Link key={d.id} to="/receive/report" search={{ delivery: d.id }} className="block">
              <Card className="press flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold">{d.reference}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${statusStyle[d.status]}`}>
                      {d.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {d.supplierName} · {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                    {issues} issue{issues === 1 ? "" : "s"}
                    {d.reportSentAt ? " · report sent" : ""}
                  </p>
                  {!d.reportSentAt && d.status === "closed" && (
                    <span className="mt-1 inline-block rounded-full bg-warning/25 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
                      Report not sent — tap to send
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
