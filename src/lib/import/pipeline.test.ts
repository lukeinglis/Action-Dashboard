import { describe, expect, it } from "vitest";
import { buildDfsLineupReview, buildFantasyMatchupReview, buildImportReview, DEFAULT_SPORTSBOOK } from "./pipeline";
import type { MatchCandidates } from "./match-parsed-legs";
import type { PlayerSlotCandidates } from "./match-fantasy-dfs";
import { SlipParseError } from "./parse-slip-text";
import { DfsLineupParseError } from "./parse-dfs-lineup";
import { FantasyMatchupParseError } from "./parse-fantasy-matchup";

const chiefs = { id: "team-chiefs", sport: "football", name: "Kansas City Chiefs", abbreviation: "KC" };
const bills = { id: "team-bills", sport: "football", name: "Buffalo Bills", abbreviation: "BUF" };
const event = {
  id: "event-1",
  sport: "football",
  league: "NFL",
  name: "Kansas City Chiefs @ Buffalo Bills",
  startTimeUtc: "2026-09-21T17:00:00Z",
  homeTeamId: "team-bills",
  awayTeamId: "team-chiefs",
};
const candidates: MatchCandidates = { teams: [chiefs, bills], participants: [], events: [event] };

const oneTicketText = `Bet Slip #DK-1001
Type: Straight
Leg 1:
Market: moneyline
Selection: Kansas City Chiefs
Event: Kansas City Chiefs @ Buffalo Bills
Sport: football/NFL
Start: 2026-09-21T17:00:00Z
Odds: -150
Wager: $20.00
To Win: $13.33
Payout: $33.33
Placed: 2026-09-20T12:00:00Z`;

describe("buildImportReview", () => {
  it("parses a ticket and matches its leg to the Event and a subject", () => {
    const review = buildImportReview(oneTicketText, candidates, [], "America/New_York");
    expect(review.tickets).toHaveLength(1);
    const [{ ticket, legMatches, duplicateOfTicketId }] = review.tickets;
    expect(ticket.sportsbookTicketId).toBe("DK-1001");
    expect(legMatches).toHaveLength(1);
    expect(legMatches[0].eventId).toBe("event-1");
    expect(legMatches[0].subjects[0]).toMatchObject({ teamId: "team-chiefs", matched: true });
    expect(duplicateOfTicketId).toBeUndefined();
  });

  it("flags a duplicate when an existing ticket matches on sportsbookTicketId", () => {
    const review = buildImportReview(
      oneTicketText,
      candidates,
      [{ id: "ticket-existing", sportsbookTicketId: "DK-1001", sportsbook: DEFAULT_SPORTSBOOK, stakeCents: 999, toWinCents: 1 }],
      "America/New_York",
    );
    expect(review.tickets[0].duplicateOfTicketId).toBe("ticket-existing");
  });

  it("throws SlipParseError on malformed text rather than returning a partial review", () => {
    expect(() => buildImportReview("not a bet slip", candidates, [], "America/New_York")).toThrow(SlipParseError);
  });
});

const playerCandidates: PlayerSlotCandidates = {
  participants: [{ id: "participant-sparks", sport: "football", name: "T. Sparks", teamId: "team-hawks" }],
  events: [{ id: "event-1", homeTeamId: "team-bills", awayTeamId: "team-hawks" }],
};

const dfsLineupText = `DFS Lineup
Platform: DraftKings
Sport: football/NFL
Slate: Main Slate
Slot: QB
Player: T. Sparks
Salary: 8200
Points: 24.5
Slot: FLEX
Player: Unknown Guy
Salary: 4000
Contest: Millionaire Maker
Entry Fee: $20.00
Prize: $100000.00
Current Points: 24.5`;

describe("buildDfsLineupReview", () => {
  it("parses a lineup and proposes a Participant/Event match for each slot's player", () => {
    const review = buildDfsLineupReview(dfsLineupText, playerCandidates);
    expect(review.lineups).toHaveLength(1);
    const [{ lineup, slotMatches }] = review.lineups;
    expect(lineup.platform).toBe("DraftKings");
    expect(slotMatches).toHaveLength(2);
    expect(slotMatches[0].playerMatch).toMatchObject({ participantId: "participant-sparks", eventId: "event-1" });
    expect(slotMatches[1].playerMatch).toMatchObject({ participantMatched: false });
  });

  it("throws DfsLineupParseError on malformed text", () => {
    expect(() => buildDfsLineupReview("not a lineup", playerCandidates)).toThrow(DfsLineupParseError);
  });
});

const fantasyMatchupText = `Fantasy Matchup
League: 2 Fast 2 Fantasy
Sport: football/NFL
My Team: My Team
Opponent: Team DanCantDraft
Starter: T. Sparks
Opponent Starter: Unknown Guy`;

describe("buildFantasyMatchupReview", () => {
  it("parses a matchup and proposes a Participant/Event match for each starter", () => {
    const review = buildFantasyMatchupReview(fantasyMatchupText, playerCandidates);
    expect(review.matchups).toHaveLength(1);
    const [{ matchup, starterMatches, opponentStarterMatches }] = review.matchups;
    expect(matchup.leagueName).toBe("2 Fast 2 Fantasy");
    expect(starterMatches).toHaveLength(1);
    expect(starterMatches[0].playerMatch).toMatchObject({ participantId: "participant-sparks", eventId: "event-1" });
    expect(opponentStarterMatches).toHaveLength(1);
    expect(opponentStarterMatches[0].playerMatch).toMatchObject({ participantMatched: false });
  });

  it("throws FantasyMatchupParseError on malformed text", () => {
    expect(() => buildFantasyMatchupReview("not a matchup", playerCandidates)).toThrow(FantasyMatchupParseError);
  });
});
