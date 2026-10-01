import { describe, expect, it } from "vitest";
import { activeBetLegSubjects, computeRootingLabels, eventExposureCount } from "./exposure";

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
