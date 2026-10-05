"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markFantasyMatchupFinal } from "./fantasy/actions";
import type { FantasyMatchupPaneItem } from "./types";
import { RosterList } from "./components/RosterList";
import { Panel, PanelBody, PanelHeader } from "./components/Panel";

export function FantasyPane({
  items,
  onSelectEvent,
}: {
  items: FantasyMatchupPaneItem[];
  onSelectEvent: (eventId: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onMarkFinal(matchupId: string) {
    startTransition(async () => {
      await markFantasyMatchupFinal(matchupId);
      router.refresh();
    });
  }

  return (
    <Panel>
      <PanelHeader
        title="Fantasy"
        count={items.length}
        action={
          <Link href="/fantasy/new" className="text-[11px] text-neutral-400 hover:text-neutral-100">
            + New
          </Link>
        }
      />
      <PanelBody className="space-y-2">
        {items.length === 0 && <p className="text-xs text-neutral-500">No active fantasy matchups.</p>}
        <ul className="space-y-2">
          {items.map((item) => {
            const hasEvent = item.eventIds.length > 0;
            return (
              <li key={item.matchupId} className="rounded border border-neutral-800 p-2">
                <button
                  type="button"
                  disabled={!hasEvent}
                  onClick={() => hasEvent && onSelectEvent(item.eventIds[0])}
                  className={`block w-full text-left ${hasEvent ? "cursor-pointer" : "cursor-default"}`}
                >
                  <p className="text-xs font-medium text-neutral-100">{item.leagueName}</p>
                  <p className="text-xs text-neutral-400">
                    {item.userTeamName} vs {item.opponentTeamName}
                    {item.week ? ` · Week ${item.week}` : ""}
                  </p>
                </button>
                <RosterList title="My Players" players={item.userRoster} onSelectEvent={onSelectEvent} />
                <RosterList title="Opponent" players={item.opponentRoster} onSelectEvent={onSelectEvent} />
                {item.showMarkFinal && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onMarkFinal(item.matchupId)}
                    className="mt-1 rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-900 disabled:opacity-50"
                  >
                    Mark Final
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}
