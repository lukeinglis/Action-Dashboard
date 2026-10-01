// Active Fantasy matchups and DFS entries (docs/PRD.md section 8): same
// Active/Settled section rule as Tickets, plus the "Mark Final" prompt
// condition (every linked Event has gone final). The status itself never
// changes automatically — this module only derives section/prompt state.

import { nextRollover } from "./date-window";
import type { DFSEntryStatus, FantasyMatchupStatus } from "@/lib/types/domain";

export type FantasyDfsSection = "active" | "settled" | null;

/**
 * Which dashboard section a FantasyMatchup or DFSEntry belongs in, or null
 * if it should no longer appear (it leaves the dashboard at the first
 * rollover after finalizedAt). Mirrors ticketSection's rollover rule.
 */
export function fantasyDfsSection(
  status: FantasyMatchupStatus | DFSEntryStatus,
  finalizedAt: string | null | undefined,
  now: Date,
  timeZone: string,
  rolloverHour: number,
): FantasyDfsSection {
  if (status !== "final") return "active";
  if (!finalizedAt) return "settled";

  const cutoff = nextRollover(new Date(finalizedAt), timeZone, rolloverHour);
  return now.getTime() < cutoff.getTime() ? "settled" : null;
}

/**
 * True once every Event linked to a FantasyMatchup or DFSEntry has gone
 * final (docs/PRD.md section 8) — the condition for showing the "Mark
 * Final" prompt. Requires at least one linked Event: a matchup/entry with
 * no linked Events never auto-prompts.
 */
export function allLinkedEventsFinal(linkedEventStatuses: Array<string | null | undefined>): boolean {
  if (linkedEventStatuses.length === 0) return false;
  return linkedEventStatuses.every((status) => status === "final");
}
