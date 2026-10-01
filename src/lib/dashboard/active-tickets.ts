// All Active Tickets workspace: section visibility (docs/PRD.md section 8)
// and sort-mode application (docs/PRD.md section 5.3, 46).
//
// Sort modes other than "manual" only reorder in memory — they never write
// sortKey — so switching back to "manual" always restores the prior order.

import { nextRollover } from "./date-window";
import type { SortMode, TicketStatus } from "@/lib/types/domain";

export type TicketSection = "active" | "settled" | null;

const SETTLED_STATUSES: TicketStatus[] = ["won", "lost", "void", "cashed_out"];

/**
 * Which dashboard section a Ticket belongs in, or null if it should no
 * longer appear at all (it leaves the dashboard at the first rollover after
 * settledAt).
 */
export function ticketSection(
  status: TicketStatus,
  settledAt: string | null | undefined,
  now: Date,
  timeZone: string,
  rolloverHour: number,
): TicketSection {
  if (!SETTLED_STATUSES.includes(status)) return "active";
  if (!settledAt) return "settled";

  const cutoff = nextRollover(new Date(settledAt), timeZone, rolloverHour);
  return now.getTime() < cutoff.getTime() ? "settled" : null;
}

export interface SortableTicket {
  id: string;
  sortKey: string;
  stakeCents: number;
  toWinCents: number;
  legsRemaining: number;
  nextEventStartUtc?: string | null;
}

/** Sorts a copy of `tickets`; never mutates or derives a new sortKey. */
export function sortTickets<T extends SortableTicket>(tickets: T[], mode: SortMode): T[] {
  const sorted = [...tickets];

  switch (mode) {
    case "manual":
      sorted.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
      break;
    case "next_event":
      sorted.sort((a, b) => {
        if (!a.nextEventStartUtc && !b.nextEventStartUtc) return 0;
        if (!a.nextEventStartUtc) return 1;
        if (!b.nextEventStartUtc) return -1;
        return a.nextEventStartUtc < b.nextEventStartUtc ? -1 : 1;
      });
      break;
    case "stake":
      sorted.sort((a, b) => b.stakeCents - a.stakeCents);
      break;
    case "to_win":
      sorted.sort((a, b) => b.toWinCents - a.toWinCents);
      break;
    case "legs_remaining":
      sorted.sort((a, b) => a.legsRemaining - b.legsRemaining);
      break;
  }

  return sorted;
}
