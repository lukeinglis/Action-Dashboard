import { describe, expect, it } from "vitest";
import {
  espnSlateDate,
  formatPeriod,
  mapEspnStatus,
  normalizeBoxScore,
  normalizeScoreboard,
  normalizeScoringPlays,
  scoringPlayScorer,
} from "./espn";

// Shapes and values below are trimmed from real payloads captured 2026-10-05.
// See docs/api-evaluation.md section 3.

describe("mapEspnStatus", () => {
  it("maps the status names ESPN actually returns", () => {
    expect(mapEspnStatus("STATUS_SCHEDULED", "pre")).toBe("scheduled");
    expect(mapEspnStatus("STATUS_END_PERIOD", "in")).toBe("in_progress");
    expect(mapEspnStatus("STATUS_HALFTIME", "in")).toBe("in_progress");
    expect(mapEspnStatus("STATUS_FINAL", "post")).toBe("final");
    expect(mapEspnStatus("STATUS_FINAL_OVERTIME", "post")).toBe("final");
    expect(mapEspnStatus("STATUS_POSTPONED", "pre")).toBe("postponed");
    expect(mapEspnStatus("STATUS_RAIN_DELAY", "pre")).toBe("suspended");
  });

  it("accepts either American or British spelling of canceled", () => {
    expect(mapEspnStatus("STATUS_CANCELED", "post")).toBe("cancelled");
    expect(mapEspnStatus("STATUS_CANCELLED", "post")).toBe("cancelled");
  });

  it("falls back to state for a status name it has never seen", () => {
    // ESPN adds status names without notice, so an unknown name must still
    // resolve rather than degrading the Event to "unknown".
    expect(mapEspnStatus("STATUS_SOMETHING_NEW", "in")).toBe("in_progress");
    expect(mapEspnStatus(undefined, "post")).toBe("final");
  });

  it("returns unknown only when neither name nor state is recognized", () => {
    expect(mapEspnStatus(undefined, undefined)).toBe("unknown");
    expect(mapEspnStatus("STATUS_WAT", "sideways")).toBe("unknown");
  });
});

describe("formatPeriod", () => {
  it("labels NFL regulation quarters", () => {
    expect(formatPeriod("nfl", 3, "STATUS_IN_PROGRESS")).toBe("Q3");
  });

  it("labels anything past regulation as OT rather than Q5", () => {
    expect(formatPeriod("nfl", 5, "STATUS_IN_PROGRESS")).toBe("OT");
  });

  it("prefers HALF over the quarter number at halftime", () => {
    expect(formatPeriod("nfl", 2, "STATUS_HALFTIME")).toBe("HALF");
  });

  it("marks a break between quarters, which ESPN reports with a 0:00 clock", () => {
    expect(formatPeriod("nfl", 3, "STATUS_END_PERIOD")).toBe("END Q3");
    expect(formatPeriod("nfl", 5, "STATUS_END_OF_PERIOD")).toBe("END OT");
  });

  it("passes the raw period through for non-NFL sports", () => {
    expect(formatPeriod("golf", 3, "STATUS_IN_PROGRESS")).toBe("3");
  });

  it("returns undefined when there is no period", () => {
    expect(formatPeriod("nfl", undefined, "STATUS_SCHEDULED")).toBeUndefined();
    expect(formatPeriod("nfl", 0, "STATUS_SCHEDULED")).toBeUndefined();
  });
});

const liveGame = {
  id: "401872978",
  name: "Detroit Lions at Carolina Panthers",
  date: "2026-10-05T00:20Z",
  status: {
    period: 3,
    displayClock: "5:42",
    type: { name: "STATUS_IN_PROGRESS", state: "in" },
  },
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: "29", team: { id: "29", abbreviation: "CAR" } },
        { homeAway: "away", score: "19", team: { id: "8", abbreviation: "DET" } },
      ],
    },
  ],
};

describe("normalizeScoreboard", () => {
  it("normalizes a live NFL game", () => {
    const [event] = normalizeScoreboard({ events: [liveGame] }, "nfl");

    expect(event).toMatchObject({
      providerEventId: "401872978",
      sport: "nfl",
      league: "NFL",
      name: "Detroit Lions at Carolina Panthers",
      startTimeUtc: "2026-10-05T00:20Z",
      startTimeTbd: false,
      homeTeamProviderId: "29",
      awayTeamProviderId: "8",
      homeTeamAbbreviation: "CAR",
      awayTeamAbbreviation: "DET",
      status: "in_progress",
      homeScore: 29,
      awayScore: 19,
      period: "Q3",
      clock: "5:42",
    });
  });

  it("drops period and clock once a game is final", () => {
    // A final game still reports displayClock "0:00", which would render as a
    // live clock if passed through.
    const final = {
      ...liveGame,
      status: { period: 4, displayClock: "0:00", type: { name: "STATUS_FINAL", state: "post" } },
    };
    const [event] = normalizeScoreboard({ events: [final] }, "nfl");

    expect(event.status).toBe("final");
    expect(event.period).toBeUndefined();
    expect(event.clock).toBeUndefined();
    expect(event.homeScore).toBe(29);
  });

  it("drops the clock between quarters, where the period label carries the state", () => {
    // ESPN reports the quarter it just finished with a 0:00 clock, which would
    // otherwise render as a stalled live clock.
    const betweenQuarters = {
      ...liveGame,
      status: { period: 3, displayClock: "0:00", type: { name: "STATUS_END_PERIOD", state: "in" } },
    };
    const [event] = normalizeScoreboard({ events: [betweenQuarters] }, "nfl");

    expect(event.status).toBe("in_progress");
    expect(event.period).toBe("END Q3");
    expect(event.clock).toBeUndefined();
  });

  it("withholds scores before kickoff, where ESPN reports 0-0", () => {
    const scheduled = {
      ...liveGame,
      status: { type: { name: "STATUS_SCHEDULED", state: "pre" } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "0", team: { id: "18", abbreviation: "NO" } },
            { homeAway: "away", score: "0", team: { id: "1", abbreviation: "ATL" } },
          ],
        },
      ],
    };
    const [event] = normalizeScoreboard({ events: [scheduled] }, "nfl");

    expect(event.status).toBe("scheduled");
    expect(event.homeScore).toBeUndefined();
    expect(event.awayScore).toBeUndefined();
  });

  it("carries the slate the game belongs to, which is how a prop finds its stats", () => {
    // Player stats are published per week, so settling a prop on a game from
    // last week means asking the stats provider for *that* week. The week has to
    // come off the payload: the NFL week does not turn over at midnight, so
    // deriving it from the date lands on the wrong slate around Thursday and
    // Monday games.
    const week4 = { ...liveGame, week: { number: 4 }, season: { year: 2026, type: 2 } };
    const [event] = normalizeScoreboard({ events: [week4] }, "nfl");

    expect(event.season).toBe(2026);
    expect(event.week).toBe(4);
    expect(event.seasonType).toBe("regular");
  });

  it("maps the season types a stat line can belong to, and no others", () => {
    const slate = (type: number) =>
      normalizeScoreboard(
        { events: [{ ...liveGame, week: { number: 1 }, season: { year: 2026, type } }] },
        "nfl",
      )[0].seasonType;

    expect(slate(1)).toBe("pre");
    expect(slate(2)).toBe("regular");
    expect(slate(3)).toBe("post");
    // ESPN also uses 4 for the Pro Bowl and 5 for the offseason. Neither has a
    // stat slate, so the caller must fall back rather than ask for one.
    expect(slate(4)).toBeUndefined();
    expect(slate(5)).toBeUndefined();
  });

  it("reports no slate when ESPN omits one", () => {
    const [event] = normalizeScoreboard({ events: [liveGame] }, "nfl");

    expect(event.season).toBeUndefined();
    expect(event.week).toBeUndefined();
    expect(event.seasonType).toBeUndefined();
  });

  it("marks a start time as TBD when ESPN omits the date", () => {
    const noDate = { ...liveGame, date: undefined };
    const [event] = normalizeScoreboard({ events: [noDate] }, "nfl");

    expect(event.startTimeTbd).toBe(true);
    expect(event.startTimeUtc).toBeUndefined();
  });

  it("normalizes a golf tournament, which has no home or away side", () => {
    const tournament = {
      id: "401850915",
      name: "Bank of Utah Championship",
      date: "2026-10-01T04:00Z",
      endDate: "2026-10-04T04:00Z",
      status: { type: { name: "STATUS_FINAL", state: "post" } },
      competitions: [
        { competitors: [{ order: 1, score: "-26", athlete: { id: "11056" } }] },
      ],
    };
    const [event] = normalizeScoreboard({ events: [tournament] }, "golf");

    expect(event).toMatchObject({
      providerEventId: "401850915",
      sport: "golf",
      league: "PGA",
      endTimeUtc: "2026-10-04T04:00Z",
      status: "final",
    });
    expect(event.homeTeamProviderId).toBeUndefined();
    expect(event.homeScore).toBeUndefined();
  });

  it("skips an event with no id", () => {
    const events = normalizeScoreboard({ events: [{ name: "nameless" }, liveGame] }, "nfl");
    expect(events).toHaveLength(1);
  });

  it("throws when the payload has no events array", () => {
    // ESPN's date-range regression returned {"code":400,"message":...} with a
    // 200-shaped body in some clients. That must not look like success.
    expect(() => normalizeScoreboard({ code: 400, message: "Failed" }, "nfl")).toThrow(
      /no events array/,
    );
  });

  it("treats an empty slate as a failure rather than no games", () => {
    expect(() => normalizeScoreboard({ events: [] }, "nfl")).toThrow(/no usable events/);
  });

  describe("allowEmptySlate", () => {
    it("accepts an empty slate when the caller asked about a specific date", () => {
      // A dated probe asks about one day, and days with no games are ordinary:
      // college football's `dates=20261018` (the Sunday after a Saturday slate)
      // and a midweek `eng.1` date both return `events: []` today. Throwing on
      // those makes walking a date window to find a past game impossible.
      expect(
        normalizeScoreboard({ events: [] }, "college-football", { allowEmptySlate: true }),
      ).toEqual([]);
    });

    it("still rejects a payload with no events array at all", () => {
      // The opt-out concerns an empty day, not trusting any payload: an error
      // body carries no `events` key and must never read as "no games".
      expect(() =>
        normalizeScoreboard({ code: 400, message: "Failed" }, "nfl", { allowEmptySlate: true }),
      ).toThrow(/no events array/);
    });

    it("still rejects a slate whose events are all unusable", () => {
      // ESPN listed a game and it lacked an id. That is a shape change, not an
      // empty day — so tolerating empty days must not tolerate this, or an id
      // rename would silently turn every slate into "no games".
      expect(() =>
        normalizeScoreboard({ events: [{ name: "nameless" }] }, "nfl", { allowEmptySlate: true }),
      ).toThrow(/listed 1 event\(s\) but none were usable/);
    });

    it("defaults to off, so the current slate keeps its guard", () => {
      expect(() => normalizeScoreboard({ events: [] }, "nfl", {})).toThrow(/no usable events/);
    });
  });
});

describe("espnSlateDate", () => {
  it("files a late kickoff under the Eastern date, not the UTC one", () => {
    // Measured: `college-football?dates=20261017` returns 52 games, 9 of which
    // carry UTC dates on the 18th. Utah at Colorado kicks off 02:15Z — Saturday
    // 10:15pm ET. Slicing the ISO string would ask for `dates=20261018`, which
    // returns zero events, so every late game would be unreachable.
    expect(espnSlateDate("2026-10-18T02:15:00Z")).toBe("20261017");
  });

  it("files the NFL's Sunday-night game under the Sunday", () => {
    // Same trap on the NFL slate: Lions at Panthers at 00:20Z on the 5th is the
    // 4th's 8:20pm ET game, and `nfl?dates=20261004` is where ESPN carries it.
    expect(espnSlateDate("2026-10-05T00:20:00Z")).toBe("20261004");
  });

  it("formats an afternoon kickoff as its own date", () => {
    expect(espnSlateDate("2026-10-17T16:00:00Z")).toBe("20261017");
  });

  it("pads single-digit months and days", () => {
    expect(espnSlateDate("2026-01-04T18:00:00Z")).toBe("20260104");
  });

  it("returns undefined for an instant it cannot read", () => {
    // A slip's printed time is OCR'd text; a garbled one must not become a
    // `dates=NaNaNNaN` request.
    expect(espnSlateDate("not a date")).toBeUndefined();
    expect(espnSlateDate("")).toBeUndefined();
  });
});

describe("normalizeBoxScore", () => {
  const payload = {
    boxscore: {
      players: [
        {
          team: { abbreviation: "DET" },
          statistics: [
            {
              name: "passing",
              labels: ["C/ATT", "YDS", "AVG", "TD", "INT", "SACKS", "QBR", "RTG"],
              athletes: [
                {
                  athlete: { id: "3046779", displayName: "Jared Goff" },
                  stats: ["32/52", "412", "7.9", "1", "0", "1-6", "71.3", "92.8"],
                },
              ],
            },
            {
              name: "receiving",
              labels: ["REC", "YDS", "AVG", "TD", "LONG", "TGTS"],
              athletes: [
                {
                  athlete: { id: "4430027", displayName: "Sam LaPorta" },
                  stats: ["8", "84", "10.5", "1", "25", "13"],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  it("extracts the stat labels a prop can be measured against", () => {
    const stats = normalizeBoxScore(payload, "401872978");
    const laPorta = stats.find((s) => s.providerPlayerId === "4430027");

    expect(laPorta).toMatchObject({
      playerName: "Sam LaPorta",
      teamAbbreviation: "DET",
      providerEventId: "401872978",
      stats: { receptions: 8, recYards: 84, recTd: 1, targets: 13 },
    });
  });

  it("ignores labels that are not counting stats", () => {
    const goff = normalizeBoxScore(payload, "401872978").find(
      (s) => s.providerPlayerId === "3046779",
    );

    // C/ATT is "32/52" and cannot be a number; AVG/QBR/RTG are not props.
    expect(goff!.stats).toEqual({ passYards: 412, passTd: 1, passInt: 0 });
  });

  it("throws when the payload has no boxscore.players", () => {
    expect(() => normalizeBoxScore({ boxscore: {} }, "401872978")).toThrow(/no boxscore.players/);
  });
});

describe("scoringPlayScorer", () => {
  // Every wording below is verbatim from the TEN @ BAL feed, 2026-10-04.
  it("reads the scorer off a rushing touchdown", () => {
    expect(scoringPlayScorer("Derrick Henry 5 Yd Rush (Tyler Loop Kick)")).toBe("Derrick Henry");
  });

  it("credits the receiver, not the quarterback, on a passing touchdown", () => {
    // The scorer leads the text and the passer follows it, which is the whole
    // reason the yardage is the delimiter.
    expect(scoringPlayScorer("Zay Flowers 19 Yd pass from Lamar Jackson (Tyler Loop Kick)")).toBe(
      "Zay Flowers",
    );
  });

  it("handles an apostrophe in a name", () => {
    expect(scoringPlayScorer("Wan'Dale Robinson 3 Yd pass from Cam Ward")).toBe(
      "Wan'Dale Robinson",
    );
  });

  it("reads a kicker off a field goal", () => {
    expect(scoringPlayScorer("Tyler Loop 64 Yd Field Goal")).toBe("Tyler Loop");
  });

  it("yields no name for a wording it cannot read", () => {
    // Safer than a partial guess: no name leaves the leg open rather than
    // grading someone's bet against nobody.
    expect(scoringPlayScorer("Team safety")).toBeUndefined();
    expect(scoringPlayScorer(undefined)).toBeUndefined();
  });
});

describe("normalizeScoringPlays", () => {
  const payload = {
    scoringPlays: [
      {
        type: { text: "Rushing Touchdown" },
        text: "Derrick Henry 5 Yd Rush (Tyler Loop Kick)",
        period: { number: 1 },
        clock: { displayValue: "12:09" },
        team: { id: "33", abbreviation: "BAL" },
      },
      {
        type: { text: "Field Goal Good" },
        text: "Tyler Loop 64 Yd Field Goal",
        period: { number: 2 },
        clock: { displayValue: "0:00" },
        team: { id: "33", abbreviation: "BAL" },
      },
    ],
  };

  it("keeps the scores in the order they happened", () => {
    const plays = normalizeScoringPlays(payload, "401872973");

    expect(plays.map((p) => p.sequence)).toEqual([1, 2]);
    expect(plays[0]).toMatchObject({
      kind: "touchdown",
      scorerName: "Derrick Henry",
      teamAbbreviation: "BAL",
      teamProviderId: "33",
      period: 1,
      clock: "12:09",
    });
  });

  it("tells a touchdown from a field goal, which is not a first-touchdown", () => {
    expect(normalizeScoringPlays(payload, "401872973")[1].kind).toBe("field_goal");
  });

  it("classifies a wording it has never seen as other rather than guessing", () => {
    // ESPN adds type names without notice; an unknown one must not be counted
    // as a touchdown.
    const odd = { scoringPlays: [{ type: { text: "Defensive 2pt Conversion" }, text: "x" }] };
    expect(normalizeScoringPlays(odd, "1")[0].kind).toBe("other");
  });

  it("reads a scoreless game as no plays", () => {
    expect(normalizeScoringPlays({ scoringPlays: [] }, "401872973")).toEqual([]);
  });

  it("throws when the payload has no scoringPlays at all", () => {
    // A shape change or an error body must not read as "nobody scored", which
    // would settle every first-scorer leg on the slate as a loss.
    expect(() => normalizeScoringPlays({ code: 400 }, "401872973")).toThrow(/no scoringPlays/);
  });
});
