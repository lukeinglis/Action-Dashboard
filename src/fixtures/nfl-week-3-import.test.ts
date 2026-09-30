// Phase 3 exit-criteria coverage (docs/PRD.md section 65, "Sportsbook
// Import") using the nfl-week-3 fixture's existing Teams/Participants/Events
// as match candidates. Confirms the import pipeline resolves legs against
// real internal records, flags what it can't, detects duplicates, and never
// silently saves malformed input.

import { describe, expect, it } from "vitest";
import { buildImportReview } from "@/lib/import/pipeline";
import { SlipParseError } from "@/lib/import/parse-slip-text";
import type { MatchCandidates } from "@/lib/import/match-parsed-legs";
import type { DuplicateTicketCandidate } from "@/lib/import/duplicate-check";
import {
  teams,
  participants,
  events,
  importSlipTextSingleTicket,
  importSlipTextParlay,
  importSlipTextUnmatchedEvent,
  importSlipTextMalformed,
  importSlipTextThreeTickets,
} from "./nfl-week-3";

const TZ = "America/New_York";

const candidates: MatchCandidates = {
  teams: teams.map((t) => ({ id: t.id, sport: t.sport, name: t.name, abbreviation: t.abbreviation })),
  participants: participants.map((p) => ({ id: p.id, sport: p.sport, name: p.name })),
  events: events.map((e) => ({
    id: e.id,
    sport: e.sport,
    league: e.league,
    name: e.name,
    startTimeUtc: e.startTimeUtc,
    homeTeamId: e.homeTeamId,
    awayTeamId: e.awayTeamId,
  })),
};

describe("nfl-week-3 import fixture", () => {
  it("matches a single ticket's leg to the existing Event and both Team subjects", () => {
    const review = buildImportReview(importSlipTextSingleTicket, candidates, [], TZ);
    expect(review.tickets).toHaveLength(1);
    const [{ ticket, legMatches, duplicateOfTicketId }] = review.tickets;
    expect(ticket.sportsbookTicketId).toBe("DK-9001");
    expect(legMatches).toHaveLength(1);
    expect(legMatches[0].eventMatched).toBe(true);
    expect(legMatches[0].eventId).toBe("event-hawks-wolves");
    expect(legMatches[0].subjects.every((s) => s.matched)).toBe(true);
    expect(duplicateOfTicketId).toBeUndefined();
  });

  it("matches every leg of a 3-leg parlay across markets (moneyline, game_total, player prop)", () => {
    const review = buildImportReview(importSlipTextParlay, candidates, [], TZ);
    expect(review.tickets).toHaveLength(1);
    const [{ ticket, legMatches }] = review.tickets;
    expect(ticket.legs).toHaveLength(3);
    expect(legMatches.map((m) => m.eventMatched)).toEqual([true, true, false]);
    expect(legMatches[2].eventExpected).toBe(false);
    expect(legMatches[2].subjects[0]).toMatchObject({ participantId: "participant-sparks", matched: true });
  });

  it("flags an unmatched Event when the named teams aren't internal Teams", () => {
    const review = buildImportReview(importSlipTextUnmatchedEvent, candidates, [], TZ);
    const [{ legMatches }] = review.tickets;
    expect(legMatches[0].eventExpected).toBe(true);
    expect(legMatches[0].eventMatched).toBe(false);
  });

  it("produces 3 separate tickets from one pasted block, standing in for a 3-ticket screenshot", () => {
    const review = buildImportReview(importSlipTextThreeTickets, candidates, [], TZ);
    expect(review.tickets.map((t) => t.ticket.sportsbookTicketId)).toEqual(["DK-9004", "DK-9005", "DK-9006"]);
  });

  it("flags a duplicate when an existing Ticket matches on sportsbookTicketId", () => {
    const existing: DuplicateTicketCandidate[] = [
      { id: "ticket-existing", sportsbookTicketId: "DK-9001", sportsbook: "DraftKings", stakeCents: 1, toWinCents: 1 },
    ];
    const review = buildImportReview(importSlipTextSingleTicket, candidates, existing, TZ);
    expect(review.tickets[0].duplicateOfTicketId).toBe("ticket-existing");
  });

  it("throws SlipParseError on malformed text rather than saving a guess", () => {
    expect(() => buildImportReview(importSlipTextMalformed, candidates, [], TZ)).toThrow(SlipParseError);
  });
});
