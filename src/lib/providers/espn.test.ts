import { describe, expect, it } from "vitest";
import { formatPeriod, mapEspnStatus, normalizeBoxScore, normalizeScoreboard } from "./espn";

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
