import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, PackageCheck, PackageX, Printer, Flag, AlertTriangle } from "lucide-react";
import { AppShell, PageHeader, PageMessage, deliveryLabel } from "@/components/app-shell";
import { ActionBar, Card, MatchPill, PrimaryButton, issueTypeLabels } from "@/components/ui-bits";
import { ApiError, finishDelivery, reportUrl, setResolution } from "@/lib/api/client";
import { useDelivery, useDeliveryAction } from "@/lib/api/queries";
import type { OverReported, Resolution } from "@/lib/api/types";
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

const resolutions: { value: Resolution | null; label: string }[] = [
  { value: null, label: "None" },
  { value: "credit", label: "Credit note" },
  { value: "replacement", label: "Replacement" },
];

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
  const findings = rows.filter((r) => r.finding && r.issues.length === 0);
  const issues = rows.flatMap((r) => r.issues);
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

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">All delivery items</p>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Item</th>
                  <th className="p-2 text-right">Inv.</th>
                  <th className="p-2 text-right">Recv.</th>
                  <th className="p-2 text-right">Stock</th>
                  <th className="p-2 text-right">Not cnt.</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i, n) => (
                  <tr key={n} className="border-b border-border last:border-0">
                    <td className="p-2">
                      <p className="font-bold">{i.name}</p>
                      {i.note && <p className="text-[10px] text-muted-foreground">{i.note}</p>}
                    </td>
                    <td className="p-2 text-right font-mono">{i.expected}</td>
                    <td className="p-2 text-right font-mono">{i.unmatched ? "—" : i.received}</td>
                    <td className="p-2 text-right font-mono font-bold text-success">{i.unmatched ? "—" : i.in_stock}</td>
                    <td className="p-2 text-right font-mono">{i.unmatched ? "—" : i.not_counted}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-muted-foreground">
                      No items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Problems</p>
          {issues.length === 0 && findings.length === 0 ? (
            <Card className="flex items-center gap-3 border-success/40 bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="text-sm font-bold text-success">Everything matched the invoice and nothing was reported</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {issues.map((i) => (
                <button key={i.id} type="button" onClick={() => editIssue(i.product_id)} className="press block w-full text-left">
                  <Card className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{i.product_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {issueTypeLabels[i.type]} · {i.qty} unit{i.qty === 1 ? "" : "s"}
                          {i.expiry_date ? ` · expiry ${i.expiry_date}` : ""}
                        </p>
                        {i.note && <p className="mt-1 text-xs text-foreground">“{i.note}”</p>}
                      </div>
                      {i.photos.slice(0, 3).map((p) => (
                        <img key={p.id} src={p.url} alt="Evidence" className="h-9 w-9 rounded-lg border-2 border-card object-cover" />
                      ))}
                    </div>
                  </Card>
                </button>
              ))}
              {findings.map((r) => (
                <Card key={r.key} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.finding?.detail}</p>
                  </div>
                  {r.finding && <MatchPill status={r.finding.type} />}
                  {r.product_id != null && !closed && (
                    <button
                      type="button"
                      onClick={() => editIssue(r.product_id!)}
                      className="press flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-bold text-destructive"
                    >
                      <Flag className="h-3.5 w-3.5" /> Report
                    </button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Requested resolution</p>
          {closed ? (
            <Card className="p-3 text-sm">{data.report?.requested_resolution ?? "None requested"}</Card>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {resolutions.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => setResolution(d.id, r.value, resolutionNote))}
                    className={`press rounded-xl border py-3 text-xs font-bold ${
                      d.requested_resolution === r.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {d.requested_resolution && (
                <input
                  value={resolutionNote}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => run(() => setResolution(d.id, d.requested_resolution, resolutionNote))}
                  placeholder="Optional note, e.g. credit for the 3 expired units"
                  className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
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
