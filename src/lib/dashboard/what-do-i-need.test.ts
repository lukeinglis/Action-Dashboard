import { describe, expect, it } from "vitest";
import { buildWhatDoINeed, relevantWhatDoINeedEntries } from "./what-do-i-need";

describe("buildWhatDoINeed", () => {
  it("labels a MIXED subject and groups by the linked event's schedule group", () => {
    const legs = [
      {
        legId: "leg-1",
        ticketId: "ticket-1",
        description: "Egbuka Over 5.5 receptions",
        eventId: "event-live",
        subjects: [{ name: "Egbuka", participantId: "participant-egbuka" }],
      },
      {
        legId: "leg-2",
        ticketId: "ticket-2",
        description: "Hawks moneyline",
        eventId: "event-later",
        subjects: [{ name: "Hawks", teamId: "team-hawks" }],
      },
      {
        legId: "leg-3",
        ticketId: "ticket-3",
        description: "Season future",
        eventId: null,
        subjects: [],
      },
    ];
    const groupByEventId = new Map<string, "LIVE" | "UP NEXT" | "LATER" | "FINAL">([
      ["event-live", "LIVE"],
      ["event-later", "LATER"],
    ]);
    const rootingLabelByKey = new Map<string, "FOR" | "AGAINST" | "MIXED" | "NEUTRAL">([
      ["participant:participant-egbuka", "MIXED"],
      ["team:team-hawks", "FOR"],
    ]);

    const entries = buildWhatDoINeed(legs, groupByEventId, rootingLabelByKey);

    expect(entries[0]).toMatchObject({ group: "LIVE", subjects: [{ name: "Egbuka", label: "MIXED" }] });
    expect(entries[1]).toMatchObject({ group: "LATER", subjects: [{ name: "Hawks", label: "FOR" }] });
    expect(entries[2]).toMatchObject({ group: "UNSCHEDULED", subjects: [] });
  });
});

describe("relevantWhatDoINeedEntries", () => {
  it("keeps only LIVE and UP NEXT entries", () => {
    const entries = [
      { legId: "a", ticketId: "t", description: "", group: "LIVE" as const, subjects: [] },
      { legId: "b", ticketId: "t", description: "", group: "UP NEXT" as const, subjects: [] },
      { legId: "c", ticketId: "t", description: "", group: "LATER" as const, subjects: [] },
      { legId: "d", ticketId: "t", description: "", group: "FINAL" as const, subjects: [] },
      { legId: "e", ticketId: "t", description: "", group: "UNSCHEDULED" as const, subjects: [] },
    ];
    expect(relevantWhatDoINeedEntries(entries).map((e) => e.legId)).toEqual(["a", "b"]);
  });
});
