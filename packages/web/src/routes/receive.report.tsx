import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mail, Share2, CheckCircle2, PackageCheck, ShieldAlert, Camera, Trash2, Pencil, RotateCcw, Flag } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ActionBar, Card, MatchPill, PrimaryButton, Sheet, issueTypeLabels } from "@/components/ui-bits";
import { SupplierPicker } from "@/components/supplier-picker";
import {
  useAppState,
  getReconciliation,
  buildReportMessage,
  markReportSent,
  updateDelivery,
  setDeliveryStatus,
} from "@/lib/api/client";
import { readFiles } from "@/lib/camera";

export const Route = createFileRoute("/receive/report")({
  validateSearch: (s: Record<string, unknown>) => ({ delivery: String(s["delivery"] ?? "") }),
  head: () => ({
    meta: [
      { title: "Step 5 — Report & Dispatch | StockIn" },
      { name: "description", content: "Final delivery summary with sellable vs quarantine split and a ready-to-send supplier report." },
      { property: "og:title", content: "Step 5 — Report & Dispatch | StockIn" },
      { property: "og:description", content: "Final delivery summary with sellable vs quarantine split and a ready-to-send supplier report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

async function dataUrlToFile(url: string, name: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}


function ReportPage() {
  const { delivery } = Route.useSearch();
  const state = useAppState();
  const navigate = useNavigate();
  const photoRef = useRef<HTMLInputElement>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const [supOpen, setSupOpen] = useState(false);
  const [supName, setSupName] = useState("");
  const [supEmail, setSupEmail] = useState("");

  const d = state.deliveries.find((dd) => dd.id === delivery);
  const rows = getReconciliation(delivery);
  const issues = state.issues.filter((i) => i.deliveryId === delivery);

  if (!d) {
    return (
      <AppShell>
        <PageHeader title="Report" onBack={() => navigate({ to: "/history" })} />
        <p className="p-4 text-sm text-muted-foreground">Delivery not found.</p>
      </AppShell>
    );
  }

  const sent = !!d.reportSentAt;
  const quarantineQty = issues
    .filter((i) => i.type === "expired" || i.type === "damaged")
    .reduce((a, i) => a + i.qty, 0);
  const totalScanned = rows.reduce((a, r) => a + r.scannedQty, 0);
  const sellableQty = Math.max(0, totalScanned - quarantineQty);
  const autoMessage = buildReportMessage(delivery);
  const message = d.reportMessage ?? autoMessage;
  const reportPhotos = d.reportPhotos ?? [];
  const allPhotos = [...issues.flatMap((i) => i.photos), ...reportPhotos];

  function editIssue(lineId: string) {
    navigate({ to: "/receive/issue/$lineId", params: { lineId }, search: { delivery, back: "report" } });
  }

  async function share() {
    const subject = `Delivery report ${d!.reference}`;
    if (canShare) {
      try {
        const files = await Promise.all(allPhotos.map((p, i) => dataUrlToFile(p, `evidence-${i + 1}.jpg`)));
        const data: ShareData = { title: subject, text: message };
        if (files.length && navigator.canShare?.({ files })) data.files = files;
        await navigator.share(data);
        await markReportSent(d!.id);
      } catch {
        /* user cancelled */
      }
      return;
    }
    window.location.href = `mailto:${encodeURIComponent(d!.supplierEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    await markReportSent(d!.id);
  }

  async function done() {
    if (d!.status !== "closed") await setDeliveryStatus(d!.id, "closed");
    navigate({ to: "/history" });
  }

  return (
    <AppShell>
      <PageHeader
        title="Delivery report"
        subtitle={`${d.reference} · Step 5 of 5`}
        onBack={() => navigate({ to: "/receive/reconcile", search: { delivery: d.id } })}
      />

      <div className="space-y-5 p-4 pb-44">
        {sent && (
          <Card className="flex items-center gap-3 border-success/40 bg-success/10">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <p className="text-sm font-bold text-success">
              Report sent {new Date(d.reportSentAt!).toLocaleString()}
            </p>
          </Card>
        )}

        <Card>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Where the stock goes</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-success/10 p-3 text-center">
              <PackageCheck className="mx-auto h-6 w-6 text-success" />
              <p className="mt-1 font-mono text-2xl font-bold text-success">{sellableQty}</p>
              <p className="text-[11px] font-bold text-success">To sellable shelves</p>
            </div>
            <div className="rounded-xl bg-warning/20 p-3 text-center">
              <ShieldAlert className="mx-auto h-6 w-6 text-warning-foreground" />
              <p className="mt-1 font-mono text-2xl font-bold text-warning-foreground">{quarantineQty}</p>
              <p className="text-[11px] font-bold text-warning-foreground">To quarantine</p>
            </div>
          </div>
        </Card>

        <Card className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Supplier</p>
            <p className="mt-1 truncate text-sm font-bold">{d.supplierName}</p>
            <p className="truncate text-xs text-muted-foreground">{d.supplierEmail || "no claims email"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSupName(d.supplierName);
              setSupEmail(d.supplierEmail);
              setSupOpen(true);
            }}
            className="press flex items-center gap-1 rounded-xl bg-secondary px-3 py-2.5 text-xs font-bold text-secondary-foreground"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </Card>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Issues & discrepancies — tap to edit
          </p>
          {issues.length === 0 && rows.every((r) => r.status === "match") ? (
            <Card className="flex items-center gap-3 border-success/40 bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="text-sm font-bold text-success">Everything matched the invoice</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {issues.map((i) => (
                <button key={i.id} type="button" onClick={() => i.lineId && editIssue(i.lineId)} className="press block w-full text-left">
                  <Card className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{i.productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {issueTypeLabels[i.type]} · {i.qty} unit{i.qty === 1 ? "" : "s"}
                          {i.expiryDate ? ` · expiry ${i.expiryDate}` : ""}
                        </p>
                        {i.note && <p className="mt-1 text-xs text-foreground">“{i.note}”</p>}
                      </div>
                      {i.photos.length > 0 && (
                        <div className="flex -space-x-2">
                          {i.photos.slice(0, 3).map((src, j) => (
                            <img key={j} src={src} alt="Evidence" className="h-9 w-9 rounded-lg border-2 border-card object-cover" />
                          ))}
                        </div>
                      )}
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Card>
                </button>
              ))}
              {rows
                .filter((r) => r.status !== "match" && !issues.some((i) => i.lineId === r.line.id))
                .map((r) => (
                  <Card key={r.line.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{r.line.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        expected {r.line.expectedQty} · scanned {r.scannedQty}
                      </p>
                    </div>
                    <MatchPill status={r.status} />
                    <button
                      type="button"
                      onClick={() => editIssue(r.line.id)}
                      className="press flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-bold text-destructive"
                    >
                      <Flag className="h-3.5 w-3.5" /> Report
                    </button>
                  </Card>
                ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Proof photos ({reportPhotos.length})
          </p>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              readFiles(e.target.files, (u) =>
                updateDelivery(d.id, { reportPhotos: [...(state.deliveries.find((x) => x.id === d.id)?.reportPhotos ?? []), u] }),
              );
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-3 gap-2">
            {reportPhotos.map((src, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl border border-border">
                <img src={src} alt={`Proof ${i + 1}`} className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  onClick={() => updateDelivery(d.id, { reportPhotos: reportPhotos.filter((_, j) => j !== i) })}
                  className="press absolute right-1 top-1 rounded-md bg-destructive p-1.5 text-destructive-foreground"
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 text-primary"
            >
              <Camera className="h-6 w-6" />
              <span className="text-[11px] font-bold">Add photo</span>
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Message to supplier</p>
            {d.reportMessage !== undefined && (
              <button
                type="button"
                onClick={() => updateDelivery(d.id, { reportMessage: undefined })}
                className="press flex items-center gap-1 text-[11px] font-bold text-primary"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
          <textarea
            value={message}
            onChange={(e) => updateDelivery(d.id, { reportMessage: e.target.value })}
            rows={12}
            className="w-full rounded-xl border border-input bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {allPhotos.length} photo{allPhotos.length === 1 ? "" : "s"} attached when sharing · to{" "}
            {d.supplierEmail || "supplier email missing"}
          </p>
        </div>
      </div>

      <ActionBar>
        <div className="flex gap-2">
          <PrimaryButton onClick={share}>
            {canShare ? <Share2 className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {sent ? "Send again" : "Send to supplier"}
          </PrimaryButton>
          <PrimaryButton variant="outline" onClick={done}>
            Done
          </PrimaryButton>
        </div>
      </ActionBar>

      <Sheet open={supOpen} onClose={() => setSupOpen(false)} title="Change supplier">
        <div className="space-y-4">
          <SupplierPicker state={state} name={supName} email={supEmail} onChange={(n, e) => { setSupName(n); setSupEmail(e); }} />
          <PrimaryButton
            disabled={!supName.trim()}
            onClick={async () => {
              await updateDelivery(d.id, { supplierName: supName.trim(), supplierEmail: supEmail.trim() });
              setSupOpen(false);
            }}
          >
            Save supplier
          </PrimaryButton>
        </div>
      </Sheet>
    </AppShell>
  );
}
