import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Flag, ArrowRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ActionBar, Card, MatchPill, PrimaryButton, issueTypeLabels } from "@/components/ui-bits";
import { useAppState, getReconciliation, setDeliveryStatus } from "@/lib/api/client";
import type { MatchStatus } from "@/lib/api/types";

export const Route = createFileRoute("/receive/reconcile")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: String(s["delivery"] ?? "") }),
  head: () => ({
    meta: [
      { title: "Step 3 — Reconcile | StockIn" },
      { name: "description", content: "Compare scanned items against the invoice and flag discrepancies." },
      { property: "og:title", content: "Step 3 — Reconcile | StockIn" },
      { property: "og:description", content: "Compare scanned items against the invoice and flag discrepancies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconcilePage,
});

const order: MatchStatus[] = ["missing", "short", "extra", "match"];

function ReconcilePage() {
  const { delivery } = Route.useSearch();
  const state = useAppState();
  const navigate = useNavigate();

  const d = state.deliveries.find((dd) => dd.id === delivery);
  const rows = getReconciliation(delivery).sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  );
  const counts = rows.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const issueCount = state.issues.filter((i) => i.deliveryId === delivery).length;

  if (!d) {
    return (
      <AppShell>
        <PageHeader title="Reconcile" />
        <p className="p-4 text-sm text-muted-foreground">Delivery not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Reconcile" subtitle={`${d.reference} · Step 3 of 5`} onBack={() => navigate({ to: "/receive/scan", search: { delivery: d.id } })} />

      <div className="space-y-4 p-4 pb-40">
        <div className="grid grid-cols-4 gap-2">
          {(["match", "short", "missing", "extra"] as const).map((s) => (
            <Card key={s} className="flex flex-col items-center gap-1 p-2.5">
              <span className="font-mono text-xl font-bold">{counts[s] ?? 0}</span>
              <MatchPill status={s} />
            </Card>
          ))}
        </div>

        <div className="space-y-2">
          {rows.map((r) => {
            const issue = state.issues.find((i) => i.deliveryId === delivery && i.lineId === r.line.id);
            return (
            <Card key={r.line.id} className={`p-3 ${issue ? "border-destructive/40" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.line.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    expected {r.line.expectedQty} · scanned {r.scannedQty}
                  </p>
                  {r.line.confidence < 0.75 && (
                    <span className="mt-1 inline-block rounded-full bg-warning/25 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
                      Review match — low AI confidence
                    </span>
                  )}
                  {issue && (
                    <p className="mt-1 text-[11px] font-bold text-destructive">
                      Reported: {issueTypeLabels[issue.type]} · {issue.qty} unit{issue.qty === 1 ? "" : "s"}
                      {issue.photos.length ? ` · ${issue.photos.length} photo${issue.photos.length === 1 ? "" : "s"}` : ""}
                    </p>
                  )}
                </div>
                <MatchPill status={r.status} />
                {(r.status !== "match" || issue) && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/receive/issue/$lineId",
                        params: { lineId: r.line.id },
                        search: { delivery: d.id },
                      })
                    }
                    className="press flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-bold text-destructive"
                  >
                    <Flag className="h-3.5 w-3.5" /> {issue ? "Edit" : "Report"}
                  </button>
                )}
              </div>
            </Card>
            );
          })}
        </div>

        {issueCount > 0 && (
          <p className="text-center text-xs font-semibold text-muted-foreground">
            {issueCount} issue{issueCount === 1 ? "" : "s"} logged so far
          </p>
        )}
      </div>

      <ActionBar>
        <PrimaryButton
          onClick={async () => {
            await setDeliveryStatus(d.id, "reconciled");
            navigate({ to: "/receive/report", search: { delivery: d.id } });
          }}
        >
          Continue to report <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </ActionBar>
    </AppShell>
  );
}
