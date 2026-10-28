import { describe, expect, it } from "vitest";
import { findTeam, matchParsedLeg, type MatchCandidates } from "./match-parsed-legs";
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

  describe("given the matchup's teams", () => {
    // The real shape of the author's own orphaned legs: a college slip prints
    // the program, ESPN prints the full team, and the Teams exist under ESPN's
    // spelling because `ensureMatchupTeams` created them that way.
    const auburn = { id: "team-aub", sport: "football", name: "Auburn Tigers", abbreviation: "AUB" };
    const georgia = { id: "team-uga", sport: "football", name: "Georgia Bulldogs", abbreviation: "UGA" };
    const cfbEvent = {
      id: "event-cfb",
      sport: "football",
      league: "NCAAF",
      name: "Auburn Tigers @ Georgia Bulldogs",
      startTimeUtc: "2026-10-11T19:30:00Z",
      awayTeamId: "team-aub",
      homeTeamId: "team-uga",
    };
    const cfb: MatchCandidates = { teams: [auburn, georgia], participants: [], events: [cfbEvent] };
    const matchup = { awayTeam: auburn, homeTeam: georgia };

    // Verbatim from leg 0d4f5703 in the author's data.
    const spread = leg({
      marketType: "spread",
      selection: "Auburn +19.5",
      awayTeamName: "Auburn",
      homeTeamName: "Georgia Bulldogs",
      league: "NCAAF",
      line: 19.5,
      overUnder: "over" as const,
      startTimeUtc: undefined,
    });

    it("links the Event the printed names alone could not find", () => {
      expect(matchParsedLeg(spread, cfb, TZ).eventId).toBeUndefined();
      expect(matchParsedLeg(spread, cfb, TZ, matchup).eventId).toBe("event-cfb");
    });

    it("backs the team the slip actually named", () => {
      // The baseline is the live defect, reproduced exactly — and it is not
      // merely "unmatched". With no team on the selection, the opponent is
      // picked by comparing printed strings: "Auburn" differs from "Auburn
      // +19.5" as text, so the side the user *backed* is proposed as the
      // opponent, "against". That is how leg 0d4f5703 came to hold a single
      // subject rooting against Auburn, and how a Participant named "Auburn"
      // came to exist at all.
      expect(matchParsedLeg(spread, cfb, TZ).subjects).toEqual([
        { name: "Auburn +19.5", teamId: undefined, participantId: undefined, matched: false, direction: "for" },
        { name: "Auburn", teamId: undefined, participantId: undefined, matched: false, direction: "against" },
      ]);

      // With the pair, both sides resolve and the directions land the right way
      // round. Note the primary also loses its line, because the team is only
      // found once the line comes off.
      expect(matchParsedLeg(spread, cfb, TZ, matchup).subjects).toEqual([
        { name: "Auburn", teamId: "team-aub", participantId: undefined, matched: true, direction: "for" },
        { name: "Georgia Bulldogs", teamId: "team-uga", participantId: undefined, matched: true, direction: "against" },
      ]);
    });

    it("reads the team off a selection that carries its line", () => {
      // "Auburn +19.5" has to lose the line before either rule can see a team.
      const noSubjectLine = leg({
        marketType: "spread",
        selection: "Auburn +19.5",
        awayTeamName: "Auburn",
        homeTeamName: "Georgia Bulldogs",
      });
      expect(matchParsedLeg(noSubjectLine, cfb, TZ, matchup).subjects[0]).toMatchObject({
        teamId: "team-aub",
        direction: "for",
      });
    });

    it("keeps a player prop's subject a player", () => {
      // The gate on `allowsTeamSubject`. A word-run against two teams is a
      // loose rule by design, and a surname is exactly where it would do harm:
      // "Washington" would otherwise be stored as the team.
      const prop = leg({
        marketType: "rushing_yards",
        selection: "Washington Over 100",
        subject: "Washington",
        awayTeamName: "Auburn",
        homeTeamName: "Georgia Bulldogs",
        overUnder: "over" as const,
      });
      const withWashington: MatchCandidates = {
        ...cfb,
        teams: [...cfb.teams, { id: "team-wsh", sport: "football", name: "Washington Huskies" }],
      };
      const match = matchParsedLeg(prop, withWashington, TZ, {
        awayTeam: auburn,
        homeTeam: { id: "team-wsh", sport: "football", name: "Washington Huskies" },
      });

      expect(match.subjects[0]).toMatchObject({ teamId: undefined, createParticipant: true });
    });

    it("still falls back to the roster for a name only findTeam can read", () => {
      // "MIN Timberwolves" is the abbreviation-plus-mascot form, which is not a
      // run of "Minnesota Timberwolves" — so the pair cannot resolve it and the
      // existing rung has to stay reachable.
      const wolves = { id: "team-min", sport: "basketball", name: "Minnesota Timberwolves", abbreviation: "MIN" };
      const heat = { id: "team-mia", sport: "basketball", name: "Miami Heat", abbreviation: "MIA" };
      const nba: MatchCandidates = { teams: [wolves, heat], participants: [], events: [] };

      const match = matchParsedLeg(
        leg({
          marketType: "moneyline",
          selection: "MIN Timberwolves",
          awayTeamName: "MIN",
          homeTeamName: "MIA",
          sport: "basketball",
          league: "NBA",
        }),
        nba,
        TZ,
        { awayTeam: wolves, homeTeam: heat },
      );

      expect(match.subjects[0]).toMatchObject({ teamId: "team-min", direction: "for" });
    });
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
  });
});
