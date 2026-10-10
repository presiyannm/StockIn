import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Mic, MicOff, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ActionBar, Card, PrimaryButton, QtyStepper, issueTypeLabels } from "@/components/ui-bits";
import { useAppState, createIssue, updateIssue, deleteIssue, getReconciliation } from "@/lib/api/client";
import type { IssueType } from "@/lib/api/types";

interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: SpeechRecognitionResultLike[][] | { 0: { 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
}

export const Route = createFileRoute("/receive/issue/$lineId")({
  validateSearch: (s: Record<string, unknown>): { delivery: string; back?: "report" } => ({
    delivery: String(s["delivery"] ?? ""),
    ...(s["back"] === "report" ? { back: "report" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Step 4 — Log Issue | StockIn" },
      { name: "description", content: "Report a delivery issue with photos, quantities, and voice notes." },
      { property: "og:title", content: "Step 4 — Log Issue | StockIn" },
      { property: "og:description", content: "Report a delivery issue with photos, quantities, and voice notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IssuePage,
});

function IssuePage() {
  const { lineId } = Route.useParams();
  const { delivery, back } = Route.useSearch();
  const state = useAppState();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const row = getReconciliation(delivery).find((r) => r.line.id === lineId);
  const line = row?.line;
  const existing = state.issues.find((i) => i.deliveryId === delivery && i.lineId === lineId);
  const loaded = useRef(false);
  const [type, setType] = useState<IssueType>("short");
  const [qty, setQty] = useState(1);
  const [expiry, setExpiry] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);

  const productName = line?.name ?? existing?.productName ?? "Unknown item";

  useEffect(() => {
    if (loaded.current) return;
    if (existing) {
      loaded.current = true;
      setType(existing.type);
      setQty(existing.qty);
      setExpiry(existing.expiryDate ?? "");
      setNote(existing.note ?? "");
      setPhotos(existing.photos);
    } else if (row) {
      loaded.current = true;
      if (row.status === "extra") {
        setType("wrong_item");
        setQty(Math.max(1, row.scannedQty - row.line.expectedQty));
      } else {
        setQty(Math.max(1, row.line.expectedQty - row.scannedQty));
      }
    }
  }, [existing, row]);

  function goBack() {
    navigate({ to: back === "report" ? "/receive/report" : "/receive/reconcile", search: { delivery } });
  }

  function onPhoto(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") setPhotos((p) => [...p, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  }

  function toggleVoice() {
    const SR = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition;
    if (!Ctor) {
      setNote((n) => n + (n ? " " : "") + "[Voice input not supported in this browser]");
      return;
    }
    if (listening) {
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "bg-BG";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = (e.results as { 0: { 0: { transcript: string } } })[0]?.[0]?.transcript ?? "";
      setNote((n) => (n ? `${n} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  }

  async function save() {
    setBusy(true);
    if (existing) {
      await updateIssue(existing.id, {
        type,
        qty,
        expiryDate: expiry || undefined,
        note: note || undefined,
        photos,
      });
      setBusy(false);
      goBack();
      return;
    }
    await createIssue({
      deliveryId: delivery,
      ...(line?.id ? { lineId: line.id } : {}),
      ...(line?.productId ? { productId: line.productId } : {}),
      productName,
      type,
      qty,
      ...(expiry ? { expiryDate: expiry } : {}),
      ...(note ? { note } : {}),
      photos,
    });
    setBusy(false);
    goBack();
  }

  return (
    <AppShell>
      <PageHeader title={existing ? "Edit issue" : "Log issue"} subtitle={productName} onBack={goBack} />

      <div className="space-y-4 p-4 pb-40">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">What's wrong?</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(issueTypeLabels) as IssueType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`press rounded-xl border py-3.5 text-sm font-bold ${
                  type === t
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {issueTypeLabels[t]}
              </button>
            ))}
          </div>
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
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Photo evidence ({photos.length})
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              onPhoto(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-3 gap-2">
            {photos.map((src, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl border border-border">
                <img src={src} alt={`Evidence ${i + 1}`} className="aspect-square w-full object-cover" />
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
      </div>

      <ActionBar>
        <div className="flex gap-2">
          {existing && (
            <PrimaryButton
              variant="outline"
              onClick={async () => {
                await deleteIssue(existing.id);
                goBack();
              }}
            >
              Remove
            </PrimaryButton>
          )}
          <PrimaryButton variant="destructive" onClick={save} disabled={busy}>
            {busy ? "Saving…" : existing ? "Update issue" : "Save issue"}
          </PrimaryButton>
        </div>
      </ActionBar>
    </AppShell>
  );
}
