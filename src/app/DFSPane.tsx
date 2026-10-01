"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markDfsEntryFinal } from "./dfs/actions";
import type { DfsEntryPaneItem } from "./types";

export function DFSPane({ items }: { items: DfsEntryPaneItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onMarkFinal(entryId: string) {
    startTransition(async () => {
      await markDfsEntryFinal(entryId);
      router.refresh();
    });
  }

  return (
    <aside className="space-y-3 rounded-lg border border-neutral-800 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">DFS</h2>
        <Link href="/dfs/new" className="text-xs text-neutral-300 underline">
          + New
        </Link>
      </div>
      {items.length === 0 && <p className="text-xs text-neutral-500">No active DFS entries.</p>}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.entryId} className="rounded border border-neutral-800 p-2">
            <p className="text-xs font-medium text-neutral-100">
              {item.platform}
              {item.slateName ? ` — ${item.slateName}` : ""}
            </p>
            {item.contestName && <p className="text-xs text-neutral-400">{item.contestName}</p>}
            {item.showMarkFinal && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onMarkFinal(item.entryId)}
                className="mt-1 rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-900 disabled:opacity-50"
              >
                Mark Final
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
