import { describe, expect, it } from "vitest";
import { matchPlayerToParticipantAndEvent, type PlayerSlotCandidates } from "./match-fantasy-dfs";

const candidates: PlayerSlotCandidates = {
  participants: [
    { id: "participant-sparks", sport: "football", name: "T. Sparks", teamId: "team-hawks" },
    { id: "participant-no-team", sport: "football", name: "No Team Guy", teamId: null },
  ],
  events: [
    { id: "event-hawks-wolves", homeTeamId: "team-wolves", awayTeamId: "team-hawks" },
    { id: "event-other", homeTeamId: "team-x", awayTeamId: "team-y" },
  ],
};

describe("matchPlayerToParticipantAndEvent", () => {
  it("matches a known player to their Participant and, via their Team, an Event", () => {
    const match = matchPlayerToParticipantAndEvent("T. Sparks", "football", candidates);
    expect(match).toEqual({
      participantId: "participant-sparks",
      participantMatched: true,
      eventId: "event-hawks-wolves",
      eventMatched: true,
    });
  });

  it("matches case/accent-insensitively via normalizeEventName", () => {
    const match = matchPlayerToParticipantAndEvent("t. sparks", "football", candidates);
    expect(match.participantMatched).toBe(true);
  });

  it("flags an unmatched player", () => {
    const match = matchPlayerToParticipantAndEvent("Unknown Player", "football", candidates);
    expect(match).toEqual({ participantMatched: false, eventMatched: false });
  });

  it("matches the Participant but leaves the Event unmatched when the Participant has no Team", () => {
    const match = matchPlayerToParticipantAndEvent("No Team Guy", "football", candidates);
    expect(match.participantMatched).toBe(true);
    expect(match.eventMatched).toBe(false);
    expect(match.eventId).toBeUndefined();
  });

  it("does not match across sports", () => {
    const match = matchPlayerToParticipantAndEvent("T. Sparks", "baseball", candidates);
    expect(match.participantMatched).toBe(false);
  });
});
