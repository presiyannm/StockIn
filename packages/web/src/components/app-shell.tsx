import { Link, useRouterState } from "@tanstack/react-router";
import { Package, ScanLine, History, ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

const tabs = [
  { to: "/", label: "Receive", icon: ScanLine },
  { to: "/stock", label: "Stock", icon: Package },
  { to: "/history", label: "History", icon: History },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <main className="flex-1 pb-32">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-border bg-card pb-safe">
        <div className="grid grid-cols-3">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" || pathname.startsWith("/receive") : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`press flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Full page for loading / not-found states of a delivery screen. */
export function PageMessage({ title, text, onBack }: { title: string; text: string; onBack?: () => void }) {
  return (
    <AppShell>
      <PageHeader title={title} {...(onBack ? { onBack } : {})} />
      <p className="p-4 text-sm text-muted-foreground">{text}</p>
    </AppShell>
  );
}

/** Short label for a delivery in headers and lists. */
export function deliveryLabel(d: { id: number; invoice_number: string | null }) {
  return d.invoice_number ? `Invoice ${d.invoice_number}` : `Delivery #${d.id}`;
}

export function PageHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="press -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
