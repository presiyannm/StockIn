import type { ReactNode } from "react";
import { Minus, Plus, X } from "lucide-react";
import type { FindingType, IssueType } from "@/lib/api/types";

export type MatchStatus = FindingType | "match";

// ---- Status pill ----

const matchStyles: Record<MatchStatus, { label: string; className: string }> = {
  match: { label: "Match", className: "bg-success/15 text-success" },
  short: { label: "Short", className: "bg-warning/25 text-warning-foreground" },
  missing: { label: "Missing", className: "bg-destructive/15 text-destructive" },
  extra: { label: "Extra", className: "bg-info/15 text-info" },
  mismatch: { label: "No match", className: "bg-destructive/15 text-destructive" },
};

export function MatchPill({ status }: { status: MatchStatus }) {
  const s = matchStyles[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.className}`}>
      {s.label}
    </span>
  );
}

export const issueTypeLabels: Record<IssueType, string> = {
  short: "Short delivery",
  expired: "Expired",
  damaged: "Damaged",
  wrong_item: "Wrong item",
  other: "Other",
};

// ---- Quantity stepper (glove-friendly) ----

export function QtyStepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="press flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-secondary text-secondary-foreground"
        aria-label="Decrease"
      >
        <Minus className="h-5 w-5" />
      </button>
      <span className="w-12 text-center font-mono text-xl font-bold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="press flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
        aria-label="Increase"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

export function QuickAdds({ onAdd }: { onAdd: (n: number) => void }) {
  return (
    <div className="flex gap-2">
      {[
        { n: 1, label: "+1" },
        { n: 6, label: "+6 pack" },
        { n: 12, label: "+12 case" },
      ].map(({ n, label }) => (
        <button
          key={n}
          type="button"
          onClick={() => onAdd(n)}
          className="press flex-1 rounded-xl border border-primary/30 bg-primary/10 py-2.5 text-sm font-bold text-primary"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---- Persistent bottom action bar ----

export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[57px] z-30 mx-auto w-full max-w-md border-t border-border bg-card/95 px-3 pb-4 pt-3 backdrop-blur">
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "navy" | "destructive" | "outline";
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground",
    navy: "bg-navy text-navy-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-border bg-card text-foreground",
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press flex h-14 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

// ---- Card ----

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ---- Bottom sheet ----

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-navy/50"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92dvh] min-h-[60dvh] flex-col rounded-t-3xl bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 pb-3 pt-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---- Empty state ----

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="max-w-60 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
