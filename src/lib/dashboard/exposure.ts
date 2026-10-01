// Exposure counting (docs/PRD.md section 11.6) and Mixed Rooting Context
// (docs/PRD.md section 17), betting-only for Phase 4 — the Fantasy/DFS
// terms of the exposure formula don't apply until those domains exist
// (Phase 5).

import type { LegSettlement, RootingDirection, TicketStatus } from "@/lib/types/domain";

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
