import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, Mic, MicOff, Trash2 } from "lucide-react";
import { AppShell, PageHeader, PageMessage } from "@/components/app-shell";
import { ActionBar, Card, PrimaryButton, QtyStepper, issueTypeLabels } from "@/components/ui-bits";
import { createIssue, deleteIssue } from "@/lib/api/client";
import { useDelivery, useDeliveryAction } from "@/lib/api/queries";
import type { IssueType } from "@/lib/api/types";
import { productRows } from "@/lib/rows";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const Route = createFileRoute("/receive/issue/$productId")({
  validateSearch: (s: Record<string, unknown>): { delivery: number; back?: "report" } => ({
    delivery: Number(s["delivery"]) || 0,
    ...(s["back"] === "report" ? { back: "report" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Step 4 — Report a Problem | StockIn" },
      { name: "description", content: "Report a problem on any product with quantity, expiry, note and photos." },
      { property: "og:title", content: "Step 4 — Report a Problem | StockIn" },
      { property: "og:description", content: "Report a problem on any product with quantity, expiry, note and photos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IssuePage,
});

function IssuePage() {
  const { productId: productParam } = Route.useParams();
  const productId = Number(productParam);
  const { delivery, back } = Route.useSearch();
  const navigate = useNavigate();
  const { data, isPending } = useDelivery(delivery);
  const { run, busy } = useDeliveryAction(delivery);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [type, setType] = useState<IssueType>("damaged");
  const [qty, setQty] = useState(1);
  const [expiry, setExpiry] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [listening, setListening] = useState(false);

  function goBack() {
    navigate({ to: back === "report" ? "/receive/report" : "/receive/reconcile", search: { delivery } });
  }

  if (isPending) return <PageMessage title="Report a problem" text="Loading…" />;
  const row = data && productRows(data).find((r) => r.product_id === productId);
  if (!data || !row) return <PageMessage title="Report a problem" text="Product not found in this delivery." onBack={goBack} />;
  const closed = data.delivery.status === "closed";

  function toggleVoice() {
    const SR = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition;
    if (!Ctor) {
      setNote((n) => n + (n ? " " : "") + "[Voice input not supported in this browser]");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    // The note goes into the English supplier report.
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setNote((n) => (n ? `${n} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function save() {
    const ok = await run(() =>
      createIssue(delivery, {
        product_id: productId,
        type,
        qty,
        ...(type === "expired" && expiry ? { expiry_date: expiry } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        photos,
      }),
    );
    if (ok) goBack();
  }

  return (
    <AppShell>
      <PageHeader title="Report a problem" subtitle={row.name} onBack={goBack} />

      <div className="space-y-4 p-4 pb-40">
        <Card className="p-3 font-mono text-xs text-muted-foreground">
          invoiced {row.expected} · received {row.received} {row.unit}
        </Card>

        {row.issues.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Already reported</p>
            <div className="space-y-2">
              {row.issues.map((i) => (
                <Card key={i.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {issueTypeLabels[i.type]} · {i.qty} unit{i.qty === 1 ? "" : "s"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {i.expiry_date ? `expiry ${i.expiry_date} · ` : ""}
                      {i.note ?? ""}
                    </p>
                  </div>
                  {i.photos.slice(0, 3).map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                      <img src={p.url} alt="Evidence" className="h-9 w-9 rounded-lg border-2 border-card object-cover" />
                    </a>
                  ))}
                  {!closed && (
                    <button
                      type="button"
                      onClick={() => run(() => deleteIssue(i.id))}
                      className="press rounded-md bg-destructive/10 p-2 text-destructive"
                      aria-label="Remove report"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </Card>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Count each physical unit once: if a unit is both damaged and expired, report it under one type only.
            </p>
          </div>
        )}

        {!closed && (
          <>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {row.issues.length ? "Add another problem" : "What's wrong?"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(issueTypeLabels) as IssueType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`press rounded-xl border py-3.5 text-sm font-bold ${
                      type === t ? "border-destructive bg-destructive/10 text-destructive" : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {issueTypeLabels[t]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {type === "expired" || type === "damaged" || type === "wrong_item"
                  ? "These units are not counted in stock and appear only in the supplier report."
                  : "Recorded in the report; stock is not changed."}
              </p>
            </div>

            <Card className="flex items-center justify-between">
              <span className="text-sm font-bold">Affected quantity</span>
              <QtyStepper value={qty} onChange={setQty} min={1} />
            </Card>

            {type === "expired" && (
              <label className="block">
                <span className="text-xs font-bold text-muted-foreground">Expiry date on product</span>
                <input
                  type="date"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            )}

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Note</p>
              <div className="relative">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Two tubs crushed at the bottom of the crate"
                  className="w-full rounded-xl border border-input bg-background p-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`press absolute right-2 top-2 rounded-lg p-2 ${
                    listening ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"
                  }`}
                  aria-label="Voice input"
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              </div>
              {listening && <p className="mt-1 text-xs font-semibold text-destructive">Listening… speak now</p>}
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Photo evidence ({photos.length})</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setPhotos((p) => [...p, ...files]);
                  e.target.value = "";
                }}
              />
              <div className="grid grid-cols-3 gap-2">
                {photos.map((f, i) => (
                  <div key={i} className="relative overflow-hidden rounded-xl border border-border">
                    <img src={URL.createObjectURL(f)} alt={`Evidence ${i + 1}`} className="aspect-square w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                      className="press absolute right-1 top-1 rounded-md bg-destructive p-1 text-destructive-foreground"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 text-primary"
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-[10px] font-bold">Add photo</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ActionBar>
        {closed ? (
          <PrimaryButton variant="outline" onClick={goBack}>
            Back
          </PrimaryButton>
        ) : (
          <PrimaryButton variant="destructive" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save report"}
          </PrimaryButton>
        )}
      </ActionBar>
    </AppShell>
  );
}
