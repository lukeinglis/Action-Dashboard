import { describe, expect, it } from "vitest";
import { findTeam, matchParsedLeg, type MatchCandidates, type ParticipantCandidate } from "./match-parsed-legs";
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

  it("opposes the other side when the slip abbreviates the Event but not the selection", () => {
    // A real slip writes "Event: KC @ BUF" with "Selection: KC Chiefs".
    // Compared as text those are different teams, so the side actually bet on
    // was taken for the opponent: the ticket ended up both for and against
    // Kansas City and never recorded Buffalo at all.
    const match = matchParsedLeg(
      leg({ selection: "KC Chiefs", awayTeamName: "KC", homeTeamName: "BUF" }),
      candidates,
      TZ,
    );
    expect(match.subjects).toEqual([
      { name: "KC Chiefs", teamId: "team-chiefs", participantId: undefined, matched: true, direction: "for" },
      { name: "BUF", teamId: "team-bills", participantId: undefined, matched: true, direction: "against" },
    ]);
  });

  it("reads the backed team off a spread selection that carries its own line", () => {
    // Grading finds the backed team on the "for" subject, so leaving the
    // primary as the raw "KC Chiefs +9.5" with no teamId made every spread
    // leg ungradeable — and promoted the real pick to the opponent.
    const match = matchParsedLeg(
      leg({
        marketType: "spread",
        selection: "KC Chiefs +9.5",
        line: 9.5,
        overUnder: "over",
        awayTeamName: "Kansas City Chiefs",
        homeTeamName: "Buffalo Bills",
      }),
      candidates,
      TZ,
    );
    expect(match.subjects).toEqual([
      { name: "KC Chiefs", teamId: "team-chiefs", participantId: undefined, matched: true, direction: "for" },
      { name: "Buffalo Bills", teamId: "team-bills", participantId: undefined, matched: true, direction: "against" },
    ]);
  });

  it("keeps the whole selection when stripping a trailing number finds no team", () => {
    const match = matchParsedLeg(
      leg({ marketType: "spread", selection: "Some Other Team +3", awayTeamName: "KC", homeTeamName: "BUF" }),
      candidates,
      TZ,
    );
    expect(match.subjects[0]).toMatchObject({ name: "Some Other Team +3", matched: false });
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

describe("findTeam", () => {
  const rams = { id: "team-rams", sport: "football", name: "Los Angeles Rams", abbreviation: "LAR" };
  const chargers = { id: "team-chargers", sport: "football", name: "Los Angeles Chargers", abbreviation: "LAC" };
  const giants = { id: "team-giants", sport: "football", name: "New York Giants", abbreviation: "NYG" };
  const jets = { id: "team-jets", sport: "football", name: "New York Jets", abbreviation: "NYJ" };
  const nfl = [rams, chargers, giants, jets, chiefs, bills];

  it("matches a selection shortened by the city's initials rather than the abbreviation", () => {
    // "LA Rams" equals neither the full name, nor "LAR", nor the "LAR Rams"
    // hybrid, so all three earlier passes miss it. The consequence is worse
    // than an unmatched leg: with no team on the selection the matcher compares
    // printed strings, takes the backed side for the opponent, and the leg ends
    // up rooting *against* the team the user bet on.
    expect(findTeam("LA Rams", "football", nfl)?.id).toBe("team-rams");
    expect(findTeam("NY Giants", "football", nfl)?.id).toBe("team-giants");
  });

  it("keeps same-city teams apart, which is what makes the shortening safe", () => {
    // Two teams can share a city, never a city and a mascot — so requiring the
    // mascot to match leaves "LA Rams" vs "LA Chargers" unambiguous.
    expect(findTeam("LA Chargers", "football", nfl)?.id).toBe("team-chargers");
    expect(findTeam("NY Jets", "football", nfl)?.id).toBe("team-jets");
  });

  it("still prefers the abbreviation hybrid and the full name", () => {
    expect(findTeam("KC Chiefs", "football", nfl)?.id).toBe("team-chiefs");
    expect(findTeam("Buffalo Bills", "football", nfl)?.id).toBe("team-bills");
    expect(findTeam("BUF", "football", nfl)?.id).toBe("team-bills");
  });

  it("does not invent a match for a city alone", () => {
    expect(findTeam("LA", "football", nfl)).toBeUndefined();
    expect(findTeam("New York", "football", nfl)).toBeUndefined();
  });

  describe("when extraction could not determine the sport", () => {
    // ESPN lists 264 schools whose college-football and college-basketball
    // display names are byte-identical, and 266 sharing an abbreviation — so
    // "Auburn Tigers" is two Team rows as soon as both sports are tracked, and
    // a name-only match has to pick between them.
    const footballAuburn = { id: "team-aub-fb", sport: "football", name: "Auburn Tigers", abbreviation: "AUB" };
    const basketballAuburn = { id: "team-aub-bb", sport: "basketball", name: "Auburn Tigers", abbreviation: "AUB" };

    it("still matches by name alone while the name belongs to one sport", () => {
      expect(findTeam("Auburn Tigers", "", [footballAuburn, ...nfl])?.id).toBe("team-aub-fb");
      expect(findTeam("AUB", "", [footballAuburn, ...nfl])?.id).toBe("team-aub-fb");
    });

    it("refuses to pick between two sports' teams of the same name", () => {
      // Picking the first would be picking by row order, and the sport decided
      // here is the sport the Event is filed under and the schedule the leg is
      // graded against — so the wrong one grades off a different game entirely.
      expect(findTeam("Auburn Tigers", "", [footballAuburn, basketballAuburn])).toBeUndefined();
      expect(findTeam("AUB", "", [footballAuburn, basketballAuburn])).toBeUndefined();
    });

    it("is decisive again as soon as the leg names its sport", () => {
      const both = [footballAuburn, basketballAuburn];
      expect(findTeam("Auburn Tigers", "football", both)?.id).toBe("team-aub-fb");
      expect(findTeam("Auburn Tigers", "basketball", both)?.id).toBe("team-aub-bb");
    });

    it("does not fall through to a looser rung after an ambiguous one", () => {
      // The exact-name rung matched; it was just ambiguous. Answering from the
      // "ABBR Mascot" rung instead would be a worse guess, not a better one.
      const hybridTrap = { id: "team-trap", sport: "golf", name: "Auburn Tigers", abbreviation: "Auburn" };
      expect(
        findTeam("Auburn Tigers", "", [footballAuburn, basketballAuburn, hybridTrap]),
      ).toBeUndefined();
    });

    // The same hazard for players, and a sharper one: a school's football and
    // basketball rosters are different people, and identically-named athletes
    // are far more common in college than in the pros.
    const footballSmith = { id: "part-smith-fb", sport: "football", name: "Will Smith" };
    const basketballSmith = { id: "part-smith-bb", sport: "basketball", name: "Will Smith" };

    function propSubjects(sport: string, participants: ParticipantCandidate[]) {
      return matchParsedLeg(
        leg({
          marketType: "receiving_yards",
          selection: "Will Smith Over 49.5",
          subject: "Will Smith",
          overUnder: "over",
          sport,
        }),
        { teams: [], participants, events: [] },
        TZ,
      ).subjects;
    }

    it("still matches a player by name alone while the name belongs to one sport", () => {
      expect(propSubjects("", [footballSmith])[0]).toMatchObject({
        participantId: "part-smith-fb",
        matched: true,
      });
    });

    it("refuses to pick between two sports' players of the same name", () => {
      // A prop pinned to the wrong Participant is looked up against a
      // stranger's stat line, which §26.1 ranks below not grading at all. The
      // subject falls back to "create a player", and that new row is sportless
      // — player-stat matching filters candidates by the leg's own sport, so it
      // stays out of grading rather than answering with the wrong person.
      expect(propSubjects("", [footballSmith, basketballSmith])[0]).toMatchObject({
        participantId: undefined,
        matched: false,
        createParticipant: true,
      });
    });

    it("is decisive about the player again as soon as the leg names its sport", () => {
      const both = [footballSmith, basketballSmith];
      expect(propSubjects("football", both)[0].participantId).toBe("part-smith-fb");
      expect(propSubjects("basketball", both)[0].participantId).toBe("part-smith-bb");
    });
  });
});
