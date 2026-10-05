import type { ReactNode } from "react";

/**
 * Shared chrome for the dashboard's columns. The Schedule Rail, the ticket
 * workspace, and the context panes are peers that the user reads across, so
 * they need identical framing and one header treatment rather than three.
 */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/40 ${className ?? ""}`}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {title}
        {count != null && <span className="ml-1.5 tabular-nums text-neutral-600">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

/** Scrolls independently so a long slate never pushes the other columns down. */
export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`max-h-[calc(100vh-9rem)] overflow-y-auto p-3 ${className ?? ""}`}>{children}</div>
  );
}
