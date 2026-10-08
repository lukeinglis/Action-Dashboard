import { describe, expect, it } from "vitest";
import { matchParsedLeg, type MatchCandidates } from "./match-parsed-legs";
import type { ParsedLeg } from "./parse-slip-text";

const TZ = "America/New_York";

const chiefs = { id: "team-chiefs", sport: "football", name: "Kansas City Chiefs", abbreviation: "KC" };
const bills = { id: "team-bills", sport: "football", name: "Buffalo Bills", abbreviation: "BUF" };
const mahomes = { id: "part-mahomes", sport: "football", name: "Patrick Mahomes" };

const event = {
  id: "event-1",
  sport: "football",
  league: "NFL",
  name: "Kansas City Chiefs @ Buffalo Bills",
  startTimeUtc: "2026-09-21T17:00:00Z",
  homeTeamId: "team-bills",
  awayTeamId: "team-chiefs",
};

const candidates: MatchCandidates = { teams: [chiefs, bills], participants: [mahomes], events: [event] };

function leg(overrides: Partial<ParsedLeg>): ParsedLeg {
  return {
    marketType: "moneyline",
    selection: "Kansas City Chiefs",
    sport: "football",
    league: "NFL",
    rawDescription: "",
    ...overrides,
  };
}

describe("matchParsedLeg", () => {
  it("matches a team_vs_opponent leg to the existing Event and proposes for/against subjects", () => {
    const match = matchParsedLeg(
      leg({ awayTeamName: "Kansas City Chiefs", homeTeamName: "Buffalo Bills", startTimeUtc: event.startTimeUtc }),
      candidates,
      TZ,
    );
    expect(match.eventExpected).toBe(true);
    expect(match.eventMatched).toBe(true);
    expect(match.eventId).toBe("event-1");
    expect(match.subjects).toEqual([
      { name: "Kansas City Chiefs", teamId: "team-chiefs", participantId: undefined, matched: true, direction: "for" },
      { name: "Buffalo Bills", teamId: "team-bills", participantId: undefined, matched: true, direction: "against" },
    ]);
  });

  it("flags an unmatched Event when the team names aren't in the candidate list", () => {
    const match = matchParsedLeg(
      leg({ awayTeamName: "Some Other Team", homeTeamName: "Another Team" }),
      candidates,
      TZ,
    );
    expect(match.eventExpected).toBe(true);
    expect(match.eventMatched).toBe(false);
    expect(match.eventId).toBeUndefined();
  });

  it("does not expect an Event for a season future", () => {
    const match = matchParsedLeg(
      leg({ marketType: "season_future", selection: "Kansas City Chiefs to win Super Bowl", subject: "Kansas City Chiefs" }),
      candidates,
      TZ,
    );
    expect(match.eventExpected).toBe(false);
    expect(match.subjects).toEqual([
      { name: "Kansas City Chiefs", teamId: "team-chiefs", participantId: undefined, matched: true, direction: "for" },
    ]);
  });

  it("proposes both teams as subjects with the same direction for a game total", () => {
    const match = matchParsedLeg(
      leg({
        marketType: "game_total",
        selection: "Over 47.5",
        overUnder: "over",
        awayTeamName: "Kansas City Chiefs",
        homeTeamName: "Buffalo Bills",
      }),
      candidates,
      TZ,
    );
    expect(match.subjects.map((s) => s.direction)).toEqual(["for", "for"]);
  });

  it("matches a player prop to the Subject participant, with no opponent subject", () => {
    const match = matchParsedLeg(
      leg({
        marketType: "passing_yards",
        selection: "Patrick Mahomes Over 275.5",
        subject: "Patrick Mahomes",
        overUnder: "over",
      }),
      candidates,
      TZ,
    );
    expect(match.subjects).toEqual([
      { name: "Patrick Mahomes", teamId: undefined, participantId: "part-mahomes", matched: true, direction: "for" },
    ]);
  });

  it("flags an unknown prop player for creation, since a prop's subject can only be a player", () => {
    // Dropping this subject discarded both the player and the Over the
    // direction encodes, and nothing else in the app creates a Participant —
    // so the prop could never be graded.
    const match = matchParsedLeg(
      leg({
        marketType: "receiving_yards",
        selection: "CeeDee Lamb Over 99.5",
        subject: "CeeDee Lamb",
        overUnder: "over",
      }),
      candidates,
      TZ,
    );
    expect(match.subjects).toEqual([
      {
        name: "CeeDee Lamb",
        teamId: undefined,
        participantId: undefined,
        matched: false,
        createParticipant: true,
        direction: "for",
      },
    ]);
  });

  it("does not offer to create a player for an unmatched team-level subject", () => {
    // "Some Other Team" could be a team we don't carry or a typo; guessing it
    // into the participant list would be worse than leaving it for the user.
    const match = matchParsedLeg(
      leg({ marketType: "team_total", selection: "Some Other Team Over 20.5", subject: "Some Other Team", overUnder: "over" }),
      candidates,
      TZ,
    );
    expect(match.subjects[0]).toMatchObject({ matched: false });
    expect(match.subjects[0].createParticipant).toBeUndefined();
  });

  it("matches teams and the Event by name alone when Sport couldn't be extracted", () => {
    const match = matchParsedLeg(
      leg({
        sport: "",
        league: undefined,
        awayTeamName: "Kansas City Chiefs",
        homeTeamName: "Buffalo Bills",
        startTimeUtc: event.startTimeUtc,
      }),
      candidates,
      TZ,
    );
    expect(match.eventMatched).toBe(true);
    expect(match.eventId).toBe("event-1");
    expect(match.subjects.every((s) => s.matched)).toBe(true);
  });

  it("matches a team shown as '<abbreviation> <mascot>' (common sportsbook display format)", () => {
    const match = matchParsedLeg(
      leg({ marketType: "moneyline", selection: "KC Chiefs", subject: "KC Chiefs" }),
      candidates,
      TZ,
    );
    expect(match.subjects[0]).toEqual({
      name: "KC Chiefs",
      teamId: "team-chiefs",
      participantId: undefined,
      matched: true,
      direction: "for",
    });
  });

  it("matches the Event by team pair alone when the leg has no Start timestamp", () => {
    const match = matchParsedLeg(
      leg({ awayTeamName: "Kansas City Chiefs", homeTeamName: "Buffalo Bills", startTimeUtc: undefined }),
      candidates,
      TZ,
    );
    expect(match.eventMatched).toBe(true);
    expect(match.eventId).toBe("event-1");
  });

  it("picks the team-pair candidate closest to now when more than one exists and Start is missing", () => {
    const pastRematch = {
      id: "event-0",
      sport: "football",
      league: "NFL",
      name: "Kansas City Chiefs @ Buffalo Bills",
      startTimeUtc: "2020-01-01T00:00:00Z",
      homeTeamId: "team-bills",
      awayTeamId: "team-chiefs",
    };
    const twoCandidates: MatchCandidates = { ...candidates, events: [pastRematch, event] };
    const match = matchParsedLeg(
      leg({ awayTeamName: "Kansas City Chiefs", homeTeamName: "Buffalo Bills", startTimeUtc: undefined }),
      twoCandidates,
      TZ,
    );
    expect(match.eventId).toBe("event-1");
  });

  it("uses Opponent Subject for a cross-game matchup with no Event", () => {
    const match = matchParsedLeg(
      leg({
        marketType: "matchup",
        selection: "Patrick Mahomes",
        subject: "Patrick Mahomes",
        opponentSubject: "Buffalo Bills",
      }),
      candidates,
      TZ,
    );
    expect(match.eventExpected).toBe(false);
    expect(match.subjects).toEqual([
      { name: "Patrick Mahomes", teamId: undefined, participantId: "part-mahomes", matched: true, direction: "for" },
      { name: "Buffalo Bills", teamId: "team-bills", participantId: undefined, matched: true, direction: "against" },
    ]);
  });
});
