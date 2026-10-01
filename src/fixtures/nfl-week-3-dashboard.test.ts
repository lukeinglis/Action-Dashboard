// Phase 4 exit-criteria coverage (docs/PRD.md section 65, "Core Dashboard")
// using the nfl-week-3 fixture: Schedule Rail eligibility/exposure counts
// under the default "Active" View, and the MIXED rooting context for a
// player with one open "for" leg and one open "against" leg.

import { describe, expect, it } from "vitest";
import { effectiveTicketStatus, legSettlement } from "@/lib/betting/derived-status";
import { isLegLive } from "@/lib/tickets/bet-leg-events";
import { resolveDateWindow } from "@/lib/dashboard/date-window";
import { activeBetLegSubjects, computeRootingLabels, eventExposureCount } from "@/lib/dashboard/exposure";
import { isScheduleRailEligible } from "@/lib/dashboard/schedule";
import { defaultViewFilters } from "@/lib/dashboard/views";
import type { LegSettlement, TicketStatus } from "@/lib/types/domain";
import { betLegEvents, betLegs, betLegSubjects, events, tickets } from "./nfl-week-3";

const TZ = "America/New_York";
// After Hawks @ Wolves went final (20:00Z) and during the live Comets @
// Miners game; Sharks @ Rams hasn't started.
const NOW = new Date("2026-09-20T21:00:00Z");

function legsForTicket(ticketId: string) {
  return betLegs.filter((l) => l.ticketId === ticketId);
}

function linkedEventStatusesForLeg(betLegId: string) {
  return betLegEvents
    .filter((bev) => bev.betLegId === betLegId)
    .map((bev) => events.find((e) => e.id === bev.eventId)?.automaticStatus ?? null);
}

function anyLinkedEventLiveForTicket(ticketId: string) {
  return legsForTicket(ticketId).some((leg) => isLegLive(legSettlement(leg), linkedEventStatusesForLeg(leg.id)));
}

const legSettlementByLegId = new Map<string, LegSettlement>(betLegs.map((l) => [l.id, legSettlement(l)]));

const ticketStatusById = new Map<string, TicketStatus>(
  tickets.map((t) => [t.id, effectiveTicketStatus(t.manualStatus, legsForTicket(t.id), anyLinkedEventLiveForTicket(t.id))]),
);

const ticketStatusByLegId = new Map<string, TicketStatus>(
  betLegs.map((l) => [l.id, ticketStatusById.get(l.ticketId)!]),
);

describe("nfl-week-3 fixture: Schedule Rail exposure (docs/PRD.md section 11.6)", () => {
  it("counts only active BetLegEvent links (open leg, pending/active ticket) per Event", () => {
    expect(eventExposureCount("event-hawks-wolves", betLegEvents, legSettlementByLegId, ticketStatusByLegId)).toBe(1);
    expect(eventExposureCount("event-comets-miners", betLegEvents, legSettlementByLegId, ticketStatusByLegId)).toBe(4);
    expect(eventExposureCount("event-sharks-rams", betLegEvents, legSettlementByLegId, ticketStatusByLegId)).toBe(0);
  });
});

describe("nfl-week-3 fixture: Schedule Rail eligibility under the default Active View", () => {
  const dateWindow = resolveDateWindow(defaultViewFilters().dateWindow, NOW, TZ, 4);

  it("includes the live Comets @ Miners game", () => {
    const exposureCount = eventExposureCount("event-comets-miners", betLegEvents, legSettlementByLegId, ticketStatusByLegId);
    expect(
      isScheduleRailEligible(
        { id: "event-comets-miners", status: "in_progress", startTimeUtc: "2026-09-20T17:00:00.000Z", isPinned: false, exposureCount },
        dateWindow,
        NOW,
        TZ,
        4,
      ),
    ).toBe(true);
  });

  it("includes Hawks @ Wolves, which went final earlier today", () => {
    const exposureCount = eventExposureCount("event-hawks-wolves", betLegEvents, legSettlementByLegId, ticketStatusByLegId);
    expect(
      isScheduleRailEligible(
        {
          id: "event-hawks-wolves",
          status: "final",
          startTimeUtc: "2026-09-20T17:00:00.000Z",
          statusChangedAt: "2026-09-20T20:00:00.000Z",
          isPinned: false,
          exposureCount,
        },
        dateWindow,
        NOW,
        TZ,
        4,
      ),
    ).toBe(true);
  });

  it("excludes Sharks @ Rams, which has zero exposure and isn't pinned", () => {
    const exposureCount = eventExposureCount("event-sharks-rams", betLegEvents, legSettlementByLegId, ticketStatusByLegId);
    expect(exposureCount).toBe(0);
    expect(
      isScheduleRailEligible(
        { id: "event-sharks-rams", status: "scheduled", startTimeUtc: "2026-09-21T20:20:00.000Z", isPinned: false, exposureCount },
        dateWindow,
        NOW,
        TZ,
        4,
      ),
    ).toBe(false);
  });
});

describe("nfl-week-3 fixture: Mixed Rooting Context (docs/PRD.md section 17)", () => {
  it("labels D. Egbuka MIXED from one open 'for' leg and one open 'against' leg", () => {
    const active = activeBetLegSubjects(betLegSubjects, legSettlementByLegId);
    const labels = computeRootingLabels(active);
    expect(labels.get("participant:participant-egbuka")).toBe("MIXED");
  });

  it("leaves FOR-only and AGAINST-only participants alone", () => {
    const active = activeBetLegSubjects(betLegSubjects, legSettlementByLegId);
    const labels = computeRootingLabels(active);
    // participant-sparks: "for" on the open leg-f1 (leg-e1's "for" is excluded, settled/won).
    expect(labels.get("participant:participant-sparks")).toBe("FOR");
    // participant-reyes: "against" on the open leg-f1, no other exposure.
    expect(labels.get("participant:participant-reyes")).toBe("AGAINST");
  });
});
