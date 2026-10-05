"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markDfsEntryFinal } from "./dfs/actions";
import type { DfsEntryPaneItem } from "./types";
import { RosterList } from "./components/RosterList";
import { Panel, PanelBody, PanelHeader } from "./components/Panel";

export function DFSPane({
  items,
  onSelectEvent,
}: {
  items: DfsEntryPaneItem[];
  onSelectEvent: (eventId: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onMarkFinal(entryId: string) {
    startTransition(async () => {
      await markDfsEntryFinal(entryId);
      router.refresh();
    });
  }

  return (
    <Panel>
      <PanelHeader
        title="DFS"
        count={items.length}
        action={
          <Link href="/dfs/new" className="text-[11px] text-neutral-400 hover:text-neutral-100">
            + New
          </Link>
        }
      />
      <PanelBody className="space-y-2">
        {items.length === 0 && <p className="text-xs text-neutral-500">No active DFS entries.</p>}
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.entryId} className="rounded border border-neutral-800 p-2">
              <p className="text-xs font-medium text-neutral-100">
                {item.platform}
                {item.slateName ? ` — ${item.slateName}` : ""}
              </p>
              {item.contestName && <p className="text-xs text-neutral-400">{item.contestName}</p>}
              <RosterList title="Lineup" players={item.roster} onSelectEvent={onSelectEvent} />
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
      </PanelBody>
    </Panel>
  );
}
