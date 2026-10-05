"use client";

import { useState } from "react";
import type { PaneRosterPlayer } from "../types";

/**
 * Expandable roster. Collapsed it reports only the count, so a 9-player lineup
 * doesn't bury the next entry; expanded it names each player and the game to
 * watch them in.
 */
export function RosterList({
  title,
  players,
  onSelectEvent,
}: {
  title: string;
  players: PaneRosterPlayer[];
  onSelectEvent: (eventId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (players.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
      >
        {open ? "▾" : "▸"} {title} ({players.length})
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5">
          {players.map((player) => (
            <li key={player.slotId} className="flex items-baseline gap-1.5 text-[11px]">
              <span className="w-8 shrink-0 text-neutral-600">{player.slot}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-200">{player.playerName}</span>
              {player.eventId ? (
                <button
                  type="button"
                  onClick={() => onSelectEvent(player.eventId!)}
                  className="shrink-0 max-w-24 truncate text-neutral-500 underline hover:text-neutral-300"
                >
                  {player.eventName ?? "Game"}
                </button>
              ) : (
                <span className="shrink-0 text-neutral-700" title="No Event matched yet">
                  unmatched
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
