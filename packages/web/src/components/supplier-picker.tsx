import { getSuppliers, type AppState } from "@/lib/api/client";

const inputCls =
  "mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function SupplierPicker({
  state,
  name,
  email,
  onChange,
}: {
  state: AppState;
  name: string;
  email: string;
  onChange: (name: string, email: string) => void;
}) {
  const suppliers = getSuppliers(state);
  return (
    <div className="space-y-4">
      {suppliers.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Saved suppliers</p>
          <div className="space-y-2">
            {suppliers.map((s) => {
              const selected = name.trim().toLowerCase() === s.name.toLowerCase();
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => onChange(s.name, s.email)}
                  className={`press flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                    selected ? "border-primary bg-primary/10" : "border-border bg-card"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-bold">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.email || "no email saved"}</span>
                  </span>
                  {selected && <span className="text-xs font-bold text-primary">Selected</span>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onChange("", "")}
              className="press w-full rounded-xl border border-dashed border-border py-3 text-sm font-bold text-muted-foreground"
            >
              + New supplier
            </button>
          </div>
        </div>
      )}
      <label className="block">
        <span className="text-xs font-bold text-muted-foreground">Supplier name</span>
        <input value={name} onChange={(e) => onChange(e.target.value, email)} placeholder="e.g. Balkan Foods" className={inputCls} />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-muted-foreground">Supplier claims email</span>
        <input
          value={email}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder="claims@supplier.com"
          type="email"
          className={inputCls}
        />
      </label>
    </div>
  );
}
