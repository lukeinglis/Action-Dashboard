// Exposure counting (docs/PRD.md section 11.6) and Mixed Rooting Context
// (docs/PRD.md section 17). Phase 5 adds the Fantasy/DFS terms of the
// exposure formula and rooting sources alongside the Phase 4 betting ones.

import type { DFSEntryStatus, LegSettlement, RootingDirection, RosterSlotSide, TicketStatus } from "@/lib/types/domain";

/** A BetLegSubject is an "active exposure" only while its leg is open (docs/PRD.md section 17). */
export function activeBetLegSubjects<S extends { betLegId: string }>(
  subjects: S[],
  legSettlementByLegId: Map<string, LegSettlement>,
): S[] {
  return subjects.filter((s) => legSettlementByLegId.get(s.betLegId) === "open");
}

export type RootingLabel = "FOR" | "AGAINST" | "MIXED" | "NEUTRAL";

function subjectKeyOf(s: { teamId?: string | null; participantId?: string | null }): string | null {
  if (s.teamId) return `team:${s.teamId}`;
  if (s.participantId) return `participant:${s.participantId}`;
  return null;
}

/**
 * Rooting direction per Team/Participant, derived from active exposures
 * only. Both "for" and "against" present -> MIXED; only one -> that
 * direction; neither (only "neutral", or no exposure) -> NEUTRAL.
 */
export function computeRootingLabels(
  activeSubjects: Array<{ teamId?: string | null; participantId?: string | null; direction: RootingDirection }>,
): Map<string, RootingLabel> {
  const directionsByKey = new Map<string, Set<RootingDirection>>();
  for (const s of activeSubjects) {
    const key = subjectKeyOf(s);
    if (!key) continue;
    const set = directionsByKey.get(key) ?? new Set<RootingDirection>();
    set.add(s.direction);
    directionsByKey.set(key, set);
  }

  const labels = new Map<string, RootingLabel>();
  for (const [key, dirs] of directionsByKey) {
    if (dirs.has("for") && dirs.has("against")) labels.set(key, "MIXED");
    else if (dirs.has("for")) labels.set(key, "FOR");
    else if (dirs.has("against")) labels.set(key, "AGAINST");
    else labels.set(key, "NEUTRAL");
  }
  return labels;
}

/**
 * Schedule Rail exposure count for one Event (docs/PRD.md section 11.6):
 * active BetLegEvent links, i.e. an open leg on a pending/active ticket.
 * Phase 4 scope: the Fantasy/DFS terms aren't included (deferred to Phase 5).
 */
export function eventExposureCount(
  eventId: string,
  betLegEvents: Array<{ eventId: string; betLegId: string }>,
  legSettlementByLegId: Map<string, LegSettlement>,
  ticketStatusByLegId: Map<string, TicketStatus>,
): number {
  return betLegEvents.filter((bev) => {
    if (bev.eventId !== eventId) return false;
    if (legSettlementByLegId.get(bev.betLegId) !== "open") return false;
    const status = ticketStatusByLegId.get(bev.betLegId);
    return status === "pending" || status === "active";
  }).length;
}

/**
 * DFSEntry statuses that count as "active" for exposure/rooting purposes
 * (docs/PRD.md section 11.6, 17): upcoming or live, i.e. not yet final.
 */
function isActiveDfsEntryStatus(status: DFSEntryStatus): boolean {
  return status === "upcoming" || status === "live";
}

/**
 * Fantasy term of the Exposure Count formula (docs/PRD.md section 11.6):
 * user-side + opponent-side FantasyRosterSlots linked to this Event. No
 * status filter — unlike BetLegEvents/DFSLineupSlots there is no "active"
 * qualifier on the FantasyRosterSlot term.
 */
export function fantasyExposureCount(
  eventId: string,
  fantasyRosterSlots: Array<{ eventId?: string | null }>,
): number {
  return fantasyRosterSlots.filter((s) => s.eventId === eventId).length;
}

/**
 * DFS term of the Exposure Count formula (docs/PRD.md section 11.6):
 * DFSLineupSlots linked to this Event, on lineups with an active
 * (upcoming/live) entry. A DFSLineup counts once however many DFSEntries
 * use it, because this counts LineupSlots (one per lineup), not Entries.
 */
export function dfsExposureCount(
  eventId: string,
  dfsLineupSlots: Array<{ eventId?: string | null; dfsLineupId: string }>,
  dfsEntries: Array<{ dfsLineupId: string; status: DFSEntryStatus }>,
): number {
  const activeLineupIds = new Set(
    dfsEntries.filter((e) => isActiveDfsEntryStatus(e.status)).map((e) => e.dfsLineupId),
  );
  return dfsLineupSlots.filter((s) => s.eventId === eventId && activeLineupIds.has(s.dfsLineupId)).length;
}

/**
 * Fantasy rooting source (docs/PRD.md section 17): side "user" -> for,
 * side "opponent" -> against. No status filter on the matchup.
 */
export function fantasyRootingSubjects(
  fantasyRosterSlots: Array<{ participantId?: string | null; side: RosterSlotSide }>,
): Array<{ participantId: string; direction: RootingDirection }> {
  const result: Array<{ participantId: string; direction: RootingDirection }> = [];
  for (const s of fantasyRosterSlots) {
    if (!s.participantId) continue;
    result.push({ participantId: s.participantId, direction: s.side === "user" ? "for" : "against" });
  }
  return result;
}

/**
 * DFS rooting source (docs/PRD.md section 17): a DFSLineupSlot on a
 * lineup with an entry that is upcoming or live is "for". DFS opponents
 * are not tracked, so DFS exposure is always "for".
 */
export function dfsRootingSubjects(
  dfsLineupSlots: Array<{ participantId?: string | null; dfsLineupId: string }>,
  dfsEntries: Array<{ dfsLineupId: string; status: DFSEntryStatus }>,
): Array<{ participantId: string; direction: RootingDirection }> {
  const activeLineupIds = new Set(
    dfsEntries.filter((e) => isActiveDfsEntryStatus(e.status)).map((e) => e.dfsLineupId),
  );
  const result: Array<{ participantId: string; direction: RootingDirection }> = [];
  for (const s of dfsLineupSlots) {
    if (!s.participantId) continue;
    if (!activeLineupIds.has(s.dfsLineupId)) continue;
    result.push({ participantId: s.participantId, direction: "for" });
  }
  return result;
}
