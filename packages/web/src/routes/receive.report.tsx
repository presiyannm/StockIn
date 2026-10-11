import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, PackageCheck, PackageX, Printer, Flag, AlertTriangle } from "lucide-react";
import { AppShell, PageHeader, PageMessage, deliveryLabel } from "@/components/app-shell";
import { ActionBar, Card, MatchPill, PrimaryButton, issueTypeLabels, type MatchStatus } from "@/components/ui-bits";
import { ApiError, finishDelivery, reportUrl, setResolution } from "@/lib/api/client";
import { useDelivery, useDeliveryAction } from "@/lib/api/queries";
import type { OverReported } from "@/lib/api/types";
import { productRows } from "@/lib/rows";

export const Route = createFileRoute("/receive/report")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: Number(s["delivery"]) || 0 }),
  head: () => ({
    meta: [
      { title: "Step 5 — Confirm & Report | StockIn" },
      { name: "description", content: "Review the stock allocation, confirm the delivery and print the supplier report." },
      { property: "og:title", content: "Step 5 — Confirm & Report | StockIn" },
      { property: "og:description", content: "Review the stock allocation, confirm the delivery and print the supplier report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { delivery } = Route.useSearch();
  const navigate = useNavigate();
  const { data, isPending } = useDelivery(delivery);
  const { run, busy } = useDeliveryAction(delivery);
  const [overReported, setOverReported] = useState<OverReported[]>([]);
  const [note, setNote] = useState<string | null>(null);

  if (isPending) return <PageMessage title="Report" text="Loading…" />;
  if (!data) return <PageMessage title="Report" text="Delivery not found." onBack={() => navigate({ to: "/history" })} />;
  const d = data.delivery;
  const closed = d.status === "closed";
  const rows = productRows(data);
  const allGood = rows.length > 0 && rows.every((r) => !r.finding && r.issues.length === 0);
  const toStock = data.items.reduce((a, i) => a + i.in_stock, 0);
  const notCounted = data.items.reduce((a, i) => a + i.not_counted, 0);
  const resolutionNote = note ?? d.resolution_note ?? "";

  function editIssue(productId: number) {
    navigate({ to: "/receive/issue/$productId", params: { productId: String(productId) }, search: { delivery, back: "report" } });
  }

  async function finish() {
    setOverReported([]);
    await run(async () => {
      try {
        await finishDelivery(d.id);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && Array.isArray(e.body["products"])) {
          setOverReported(e.body["products"] as OverReported[]);
        }
        throw e;
      }
    });
  }

  return (
    <AppShell>
      <PageHeader
        title={closed ? "Delivery report" : "Confirm delivery"}
        subtitle={`${deliveryLabel(d)} · ${closed ? "Closed" : "Step 5 of 5"}`}
        onBack={() =>
          closed ? navigate({ to: "/history" }) : navigate({ to: "/receive/reconcile", search: { delivery: d.id } })
        }
      />

      <div className="space-y-5 p-4 pb-44">
        {closed && (
          <Card className="flex items-center gap-3 border-success/40 bg-success/10">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <p className="text-sm font-bold text-success">
              Stock updated {d.closed_at ? new Date(d.closed_at).toLocaleString() : ""}
            </p>
          </Card>
        )}

        <Card>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {closed ? "Where the stock went" : "Where the stock goes when you confirm"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-success/10 p-3 text-center">
              <PackageCheck className="mx-auto h-6 w-6 text-success" />
              <p className="mt-1 font-mono text-2xl font-bold text-success">{toStock}</p>
              <p className="text-[11px] font-bold text-success">Into sellable stock</p>
            </div>
            <div className="rounded-xl bg-warning/20 p-3 text-center">
              <PackageX className="mx-auto h-6 w-6 text-warning-foreground" />
              <p className="mt-1 font-mono text-2xl font-bold text-warning-foreground">{notCounted}</p>
              <p className="text-[11px] font-bold text-warning-foreground">Not counted (report only)</p>
            </div>
          </div>
        </Card>

        {allGood && (
          <Card className="flex items-center gap-3 border-success/40 bg-success/10">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <p className="text-sm font-bold text-success">Everything matched the invoice and nothing was reported</p>
          </Card>
        )}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            All delivery items ({rows.length})
          </p>
          <div className="space-y-2">
            {rows.map((r) => {
              const item = r.product_id != null ? data.items.find((i) => i.product_id === r.product_id) : undefined;
              const status = (r.finding?.type ?? "match") as MatchStatus;
              return (
                <Card key={r.key} className={`p-3 ${status === "match" && r.issues.length === 0 ? "" : "border-destructive/30"}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug">{r.name}</p>
                      {r.product_id == null ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Invoiced {r.expected} · not linked to a product
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Invoiced {r.expected} · Received {r.received} ·{" "}
                          <b className="text-success">{item?.in_stock ?? 0} into stock</b>
                          {item && item.not_counted > 0 && (
                            <b className="text-warning-foreground"> · {item.not_counted} not counted</b>
                          )}
                        </p>
                      )}
                      {item?.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{item.note}</p>}
                    </div>
                    <MatchPill status={status} />
                  </div>

                  {r.issues.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => editIssue(i.product_id)}
                      className="press mt-2 flex w-full items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-left"
                    >
                      <div className="min-w-0 flex-1 text-xs">
                        <p className="font-bold text-destructive">
                          {issueTypeLabels[i.type]} · {i.qty} unit{i.qty === 1 ? "" : "s"}
                          {i.expiry_date ? ` · expiry ${i.expiry_date}` : ""}
                        </p>
                        {i.note && <p className="mt-0.5 text-foreground">“{i.note}”</p>}
                      </div>
                      {i.photos.slice(0, 3).map((p) => (
                        <img key={p.id} src={p.url} alt="Evidence" className="h-9 w-9 rounded-lg border-2 border-card object-cover" />
                      ))}
                    </button>
                  ))}

                  {r.product_id != null && !closed && (
                    <button
                      type="button"
                      onClick={() => editIssue(r.product_id!)}
                      className="press mt-2 flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-[11px] font-bold"
                    >
                      <Flag className="h-3.5 w-3.5" /> Report a problem
                    </button>
                  )}
                </Card>
              );
            })}
            {rows.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No items yet.</p>}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Requested resolution {closed ? "" : "(optional)"}
          </p>
          {closed ? (
            <Card className="whitespace-pre-wrap p-3 text-sm">{data.report?.requested_resolution ?? "None"}</Card>
          ) : (
            <textarea
              value={resolutionNote}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (resolutionNote.trim() !== (d.resolution_note ?? "")) run(() => setResolution(d.id, resolutionNote));
              }}
              rows={3}
              placeholder="e.g. Credit for the 3 expired units"
              className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          )}
        </div>

        {overReported.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/10">
            <p className="flex items-center gap-2 text-sm font-bold text-destructive">
              <AlertTriangle className="h-4 w-4" /> More units reported than received
            </p>
            {overReported.map((o) => (
              <button
                key={o.product_id}
                type="button"
                onClick={() => editIssue(o.product_id)}
                className="mt-1 block text-left text-xs underline"
              >
                {o.name ?? `Product ${o.product_id}`}: {o.reported} reported, {o.received} received
              </button>
            ))}
          </Card>
        )}

        {data.report && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Supplier report (English)</p>
            <pre className="whitespace-pre-wrap rounded-xl border border-border bg-card p-3 font-mono text-[11px] leading-relaxed">
              {data.report.body}
            </pre>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Generated from the saved records, so it can't drift from them. Printing does not send it anywhere.
            </p>
          </div>
        )}
      </div>

      <ActionBar>
        {closed ? (
          <div className="flex gap-2">
            <PrimaryButton onClick={() => window.open(reportUrl(d.id), "_blank")}>
              <Printer className="h-4 w-4" /> Print / save PDF
            </PrimaryButton>
            <PrimaryButton variant="outline" onClick={() => navigate({ to: "/history" })}>
              Done
            </PrimaryButton>
          </div>
        ) : (
          <PrimaryButton onClick={finish} disabled={busy}>
            <CheckCircle2 className="h-4 w-4" /> {busy ? "Saving…" : "Confirm & update stock"}
          </PrimaryButton>
        )}
      </ActionBar>
    </AppShell>
  );
}
