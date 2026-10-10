import { useSuppliers } from "@/lib/api/queries";

/** Pick a saved supplier, or leave it to the AI to read the supplier from the invoice. */
export function SupplierPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (supplierId: number | null) => void;
}) {
  const { data: suppliers = [] } = useSuppliers();
  const option = (id: number | null, title: string, hint: string) => {
    const selected = value === id;
    return (
      <button
        key={id ?? "auto"}
        type="button"
        onClick={() => onChange(id)}
        className={`press flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
          selected ? "border-primary bg-primary/10" : "border-border bg-card"
        }`}
      >
        <span>
          <span className="block text-sm font-bold">{title}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
        {selected && <span className="text-xs font-bold text-primary">Selected</span>}
      </button>
    );
  };
  return (
    <div className="space-y-2">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Supplier</p>
      {option(null, "Read it from the invoice", "AI fills in the supplier when it reads the invoice")}
      {suppliers.map((s) => option(s.id, s.name, s.email || "no email saved"))}
    </div>
  );
}
