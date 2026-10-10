import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PrimaryButton } from "@/components/ui-bits";
import { createProduct } from "@/lib/api/client";
import { keys, useProducts } from "@/lib/api/queries";
import type { Product } from "@/lib/api/types";

const inputCls =
  "h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

/**
 * Choose a catalogue product, or create a new one (BR: an unknown product can be matched
 * to an existing product or created, without losing the session).
 */
export function ProductPicker({
  onPick,
  barcode = "",
  initialName = "",
  selectedId,
  createOnly = false,
}: {
  onPick: (p: Product) => void;
  /** Prefills the new-product barcode, e.g. an unknown scanned code. */
  barcode?: string;
  initialName?: string;
  selectedId?: number | null;
  /** Skip the catalogue list and show only the new-product form. */
  createOnly?: boolean;
}) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(createOnly);
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(barcode);
  const [unit, setUnit] = useState("pcs");
  const [busy, setBusy] = useState(false);

  const s = q.trim().toLowerCase();
  const list = products.filter(
    (p) => !s || p.name.toLowerCase().includes(s) || p.barcode?.includes(s) || p.aliases.some((a) => a.toLowerCase().includes(s)),
  );

  async function create() {
    setBusy(true);
    try {
      const p = await createProduct({ name: name.trim(), barcode: code.trim() || null, unit });
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.products }),
        qc.invalidateQueries({ queryKey: keys.stock }),
      ]);
      toast.success(`Added "${p.name}" to the catalogue`);
      onPick(p);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div className="space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" autoFocus className={inputCls} />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          placeholder="Barcode (optional)"
          inputMode="numeric"
          className={`${inputCls} font-mono`}
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
          <option value="pcs">Pieces</option>
          <option value="pack">Packs</option>
          <option value="box">Boxes</option>
          <option value="kg">Kilograms</option>
          <option value="l">Litres</option>
        </select>
        <PrimaryButton onClick={create} disabled={!name.trim() || busy}>
          {busy ? "Saving…" : "Save new product"}
        </PrimaryButton>
        {!createOnly && (
          <button type="button" onClick={() => setCreating(false)} className="press w-full py-2 text-xs font-bold text-muted-foreground">
            Back to catalogue
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or barcode" className={`${inputCls} pl-9`} />
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className={`press flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold ${
              selectedId === p.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
            }`}
          >
            {p.name}
            <span className="font-mono text-[11px] font-normal text-muted-foreground">{p.barcode ?? p.unit}</span>
          </button>
        ))}
        {list.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No product matches.</p>}
      </div>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="press flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-bold text-primary"
      >
        <Plus className="h-4 w-4" /> Create new product
      </button>
    </div>
  );
}
