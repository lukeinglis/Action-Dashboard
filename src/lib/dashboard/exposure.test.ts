import { describe, expect, it } from "vitest";
import {
  activeBetLegSubjects,
  computeRootingLabels,
  dfsExposureCount,
  dfsRootingSubjects,
  eventExposureCount,
  fantasyExposureCount,
  fantasyRootingSubjects,
} from "./exposure";

describe("activeBetLegSubjects", () => {
  it("keeps only subjects whose leg is open", () => {
    const subjects = [
      { betLegId: "leg-1" },
      { betLegId: "leg-2" },
    ];
    const settlements = new Map([
      ["leg-1", "open" as const],
      ["leg-2", "won" as const],
    ]);
    expect(activeBetLegSubjects(subjects, settlements)).toEqual([{ betLegId: "leg-1" }]);
  });
});

describe("computeRootingLabels", () => {
  it("labels FOR-only, AGAINST-only, MIXED, and NEUTRAL correctly", () => {
    const labels = computeRootingLabels([
      { participantId: "p-for", direction: "for" },
      { participantId: "p-against", direction: "against" },
      { participantId: "p-mixed", direction: "for" },
      { participantId: "p-mixed", direction: "against" },
      { teamId: "t-neutral", direction: "neutral" },
    ]);
    expect(labels.get("participant:p-for")).toBe("FOR");
    expect(labels.get("participant:p-against")).toBe("AGAINST");
    expect(labels.get("participant:p-mixed")).toBe("MIXED");
    expect(labels.get("team:t-neutral")).toBe("NEUTRAL");
  });
});

describe("eventExposureCount", () => {
  const betLegEvents = [
    { eventId: "event-1", betLegId: "leg-open-active" },
    { eventId: "event-1", betLegId: "leg-open-pending" },
    { eventId: "event-1", betLegId: "leg-settled" },
    { eventId: "event-1", betLegId: "leg-open-void-ticket" },
    { eventId: "event-2", betLegId: "leg-other-event" },
  ];
  const legSettlementByLegId = new Map<string, "open" | "won">([
    ["leg-open-active", "open"],
    ["leg-open-pending", "open"],
    ["leg-settled", "won"],
    ["leg-open-void-ticket", "open"],
    ["leg-other-event", "open"],
  ]);
  const ticketStatusByLegId = new Map<string, "pending" | "active" | "void">([
    ["leg-open-active", "active"],
    ["leg-open-pending", "pending"],
    ["leg-settled", "active"],
    ["leg-open-void-ticket", "void"],
    ["leg-other-event", "active"],
  ]);

  it("counts only open legs on pending/active tickets for the given event", () => {
    expect(eventExposureCount("event-1", betLegEvents, legSettlementByLegId, ticketStatusByLegId)).toBe(2);
  });

  it("scopes to the requested event", () => {
    expect(eventExposureCount("event-2", betLegEvents, legSettlementByLegId, ticketStatusByLegId)).toBe(1);
  });
});

describe("fantasyExposureCount", () => {
  it("counts both user-side and opponent-side roster slots linked to the event", () => {
    const slots = [
      { eventId: "event-1" },
      { eventId: "event-1" },
      { eventId: "event-2" },
      { eventId: null },
    ];
    expect(fantasyExposureCount("event-1", slots)).toBe(2);
  });
});

describe("dfsExposureCount", () => {
  it("counts a lineup's slots once per event regardless of how many entries use the lineup (docs/PRD.md section 11.6)", () => {
    const dfsLineupSlots = [
      { eventId: "event-1", dfsLineupId: "lineup-1" },
      { eventId: "event-1", dfsLineupId: "lineup-1" },
      { eventId: "event-2", dfsLineupId: "lineup-1" },
    ];
    const dfsEntries = [
      { dfsLineupId: "lineup-1", status: "upcoming" as const },
      { dfsLineupId: "lineup-1", status: "live" as const },
      { dfsLineupId: "lineup-1", status: "upcoming" as const },
    ];
    expect(dfsExposureCount("event-1", dfsLineupSlots, dfsEntries)).toBe(2);
  });

  it("excludes slots on lineups whose only entries are final", () => {
    const dfsLineupSlots = [{ eventId: "event-1", dfsLineupId: "lineup-done" }];
    const dfsEntries = [{ dfsLineupId: "lineup-done", status: "final" as const }];
    expect(dfsExposureCount("event-1", dfsLineupSlots, dfsEntries)).toBe(0);
  });
});

describe("fantasyRootingSubjects", () => {
  it("maps user-side slots to for and opponent-side slots to against", () => {
    const subjects = fantasyRootingSubjects([
      { participantId: "p-1", side: "user" },
      { participantId: "p-2", side: "opponent" },
      { participantId: null, side: "user" },
    ]);
    expect(subjects).toEqual([
      { participantId: "p-1", direction: "for" },
      { participantId: "p-2", direction: "against" },
    ]);
  });
});

describe("dfsRootingSubjects", () => {
  it("is always for, and only for lineups with an active (upcoming/live) entry", () => {
    const dfsLineupSlots = [
      { participantId: "p-1", dfsLineupId: "lineup-active" },
      { participantId: "p-2", dfsLineupId: "lineup-final" },
      { participantId: null, dfsLineupId: "lineup-active" },
    ];
    const dfsEntries = [
      { dfsLineupId: "lineup-active", status: "live" as const },
      { dfsLineupId: "lineup-final", status: "final" as const },
    ];
    expect(dfsRootingSubjects(dfsLineupSlots, dfsEntries)).toEqual([{ participantId: "p-1", direction: "for" }]);
  });
});
