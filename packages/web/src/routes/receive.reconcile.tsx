import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Flag, ArrowRight, Link2 } from "lucide-react";
import { AppShell, PageHeader, PageMessage, deliveryLabel } from "@/components/app-shell";
import { ActionBar, Card, MatchPill, PrimaryButton, issueTypeLabels, type MatchStatus } from "@/components/ui-bits";
import { reconcile, setExcessAccepted } from "@/lib/api/client";
import { useDelivery, useDeliveryAction } from "@/lib/api/queries";
import { productRows } from "@/lib/rows";

export const Route = createFileRoute("/receive/reconcile")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: Number(s["delivery"]) || 0 }),
  head: () => ({
    meta: [
      { title: "Step 3 — Reconcile | StockIn" },
      { name: "description", content: "Compare received items against the invoice and report problems on any product." },
      { property: "og:title", content: "Step 3 — Reconcile | StockIn" },
      { property: "og:description", content: "Compare received items against the invoice and report problems on any product." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconcilePage,
});

const order: MatchStatus[] = ["mismatch", "missing", "short", "extra", "match"];

function ReconcilePage() {
  const { delivery } = Route.useSearch();
  const navigate = useNavigate();
  const { data, isPending } = useDelivery(delivery);
  const { run, busy } = useDeliveryAction(delivery);
  const compared = useRef(false);

  // Compare against the latest saved invoice and scans every time this screen opens.
  const status = data?.delivery.status;
  useEffect(() => {
    if (compared.current || !status || status === "closed") return;
    compared.current = true;
    run(() => reconcile(delivery));
  }, [status, delivery, run]);

  if (isPending) return <PageMessage title="Reconcile" text="Loading…" />;
  if (!data) return <PageMessage title="Reconcile" text="Delivery not found." onBack={() => navigate({ to: "/" })} />;
  const d = data.delivery;
  const closed = d.status === "closed";

  const rows = productRows(data)
    .map((r) => ({ ...r, status: (r.finding?.type ?? "match") as MatchStatus }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

  return (
    <AppShell>
      <PageHeader
        title="Reconcile"
        subtitle={`${deliveryLabel(d)} · Step 3 of 5`}
        onBack={() => navigate({ to: "/receive/scan", search: { delivery: d.id } })}
      />

      <div className="space-y-4 p-4 pb-40">
        <div className="grid grid-cols-4 gap-2">
          {(["match", "short", "missing", "extra"] as const).map((s) => (
            <Card key={s} className="flex flex-col items-center gap-1 p-2.5">
              <span className="font-mono text-xl font-bold">{counts[s] ?? 0}</span>
              <MatchPill status={s} />
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          A match on quantity doesn't mean the goods are fine: use <b>Report</b> on any product that is expired, damaged or wrong.
        </p>

        <div className="space-y-2">
          {rows.map((r) => {
            const extra = r.received - r.expected;
            return (
              <Card key={r.key} className={`p-3 ${r.issues.length ? "border-destructive/40" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      invoiced {r.expected} · received {r.received} {r.unit}
                    </p>
                    {r.issues.map((i) => (
                      <p key={i.id} className="mt-1 text-[11px] font-bold text-destructive">
                        Reported: {issueTypeLabels[i.type]} · {i.qty} unit{i.qty === 1 ? "" : "s"}
                        {i.photos.length ? ` · ${i.photos.length} photo${i.photos.length === 1 ? "" : "s"}` : ""}
                      </p>
                    ))}
                  </div>
                  <MatchPill status={r.status} />
                  {r.product_id != null ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          to: "/receive/issue/$productId",
                          params: { productId: String(r.product_id) },
                          search: { delivery: d.id },
                        })
                      }
                      className="press flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-bold text-destructive"
                    >
                      <Flag className="h-3.5 w-3.5" /> Report
                    </button>
                  ) : (
                    !closed && (
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/receive/invoice", search: { delivery: d.id } })}
                        className="press flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-2 text-[11px] font-bold"
                      >
                        <Link2 className="h-3.5 w-3.5" /> Fix match
                      </button>
                    )
                  )}
                </div>
                {r.product_id != null && extra > 0 && (
                  <label className="mt-2 flex items-center gap-2 rounded-lg bg-info/10 px-3 py-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={r.excess_accepted}
                      disabled={closed || busy}
                      onChange={(e) => run(() => setExcessAccepted(d.id, r.product_id!, e.target.checked))}
                      className="h-4 w-4"
                    />
                    Add the {extra} extra to stock (we keep them)
                  </label>
                )}
              </Card>
            );
          })}
          {rows.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No invoice lines or scans yet.</p>}
        </div>
      </div>

      <ActionBar>
        <PrimaryButton onClick={() => navigate({ to: "/receive/report", search: { delivery: d.id } })}>
          Review & confirm <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </ActionBar>
    </AppShell>
  );
}
