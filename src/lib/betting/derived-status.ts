import type { BetLeg, LegSettlement, TicketStatus } from "@/lib/types/domain";

// Derived Ticket status. See docs/PRD.md section 27.
//
//   any leg lost                                 -> lost
//   all legs settled, every one push or void      -> void
//   all legs settled, at least one won             -> won
//   any leg settled, or any linked Event live      -> active
//   otherwise                                       -> pending
//
// A leg's settlement is manualStatus ?? automaticStatus ?? "open". A single
// -leg ticket that pushes is void, since the stake is refunded.

export function legSettlement(leg: Pick<BetLeg, "manualStatus" | "automaticStatus">): LegSettlement {
  return leg.manualStatus ?? leg.automaticStatus ?? "open";
}

export function derivedTicketStatus(
  legs: Pick<BetLeg, "manualStatus" | "automaticStatus">[],
  anyLinkedEventLive: boolean,
): TicketStatus {
  if (legs.length === 0) return "pending";

  const settlements = legs.map(legSettlement);

  if (settlements.some((s) => s === "lost")) return "lost";

  const allSettled = settlements.every((s) => s !== "open");

  if (allSettled && settlements.every((s) => s === "push" || s === "void")) return "void";
  if (allSettled && settlements.some((s) => s === "won")) return "won";

  const anySettled = settlements.some((s) => s !== "open");
  if (anySettled || anyLinkedEventLive) return "active";

  return "pending";
}

/** A manual Ticket status always wins over the derived value (docs/PRD.md section 27 and 45). */
export function effectiveTicketStatus(
  manualStatus: TicketStatus | null | undefined,
  legs: Pick<BetLeg, "manualStatus" | "automaticStatus">[],
  anyLinkedEventLive: boolean,
): TicketStatus {
  return manualStatus ?? derivedTicketStatus(legs, anyLinkedEventLive);
}
