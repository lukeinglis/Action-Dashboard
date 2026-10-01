import { describe, expect, it } from "vitest";
import { buildImportReview, DEFAULT_SPORTSBOOK } from "./pipeline";
import type { MatchCandidates } from "./match-parsed-legs";
import { SlipParseError } from "./parse-slip-text";

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
