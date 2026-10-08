import { describe, expect, it } from "vitest";
import { evaluateLeg, type EvaluationEvent, type EvaluationSubject } from "./evaluate-leg";

// TB @ DAL, the shape of a real linked Event.
const HOME = "team-dal";
const AWAY = "team-tb";

function game(homeScore: number | null, awayScore: number | null, status: EventStatus = "in_progress"): EvaluationEvent {
  return { status, homeTeamId: HOME, awayTeamId: AWAY, homeScore, awayScore };
}

type EventStatus = EvaluationEvent["status"];

/** Backing a team: "for" on that team, "against" on the opponent (§26.2). */
function backing(teamId: string): EvaluationSubject[] {
  const opponent = teamId === HOME ? AWAY : HOME;
  return [
    { teamId, direction: "for" },
    { teamId: opponent, direction: "against" },
  ];
}

/** An Over leg: both teams "for" for a game total, per §26.2. */
const OVER: EvaluationSubject[] = [
  { teamId: AWAY, direction: "for" },
  { teamId: HOME, direction: "for" },
];
const UNDER: EvaluationSubject[] = [
  { teamId: AWAY, direction: "against" },
  { teamId: HOME, direction: "against" },
];

describe("evaluateLeg", () => {
  describe("nothing to say yet", () => {
    it("is unknown before kickoff, when the provider suppresses the scoreline", () => {
      // A scheduled game reports 0-0 upstream; refresh stores null, and null
      // must not be read as a 0-0 tie.
      expect(evaluateLeg({ marketType: "moneyline" }, backing(HOME), game(null, null, "scheduled"))).toEqual({
        liveState: "unknown",
        settlement: "open",
        detail: null,
      });
    });

    it("is unknown with no linked Event", () => {
      expect(evaluateLeg({ marketType: "moneyline" }, backing(HOME), null).liveState).toBe("unknown");
    });

    it("is unknown for a cancelled or postponed game rather than guessing a void", () => {
      for (const status of ["cancelled", "postponed"] as const) {
        expect(evaluateLeg({ marketType: "moneyline" }, backing(HOME), game(21, 17, status))).toEqual({
          liveState: "unknown",
          settlement: "open",
          detail: null,
        });
      }
    });

    it("is unknown for a player prop with no stat line supplied", () => {
      // The player was never mapped to a stats provider, so the scoreline is
      // all there is — and it says nothing about one receiver.
      expect(
        evaluateLeg({ marketType: "receiving_yards", line: 65.5 }, [{ direction: "for" }], game(21, 17)).liveState,
      ).toBe("unknown");
    });

    it("is unknown for a prop market no stat line can answer", () => {
      // Scoring order is not in a week stat line: a player with one touchdown
      // may or may not have had the first one.
      expect(
        evaluateLeg(
          { marketType: "first_touchdown", line: 0.5, playerStats: { rushTd: 1 } },
          [{ direction: "for" }],
          game(21, 17),
        ).liveState,
      ).toBe("unknown");
    });

    it("is unknown for a prop with no line and none implied", () => {
      expect(
        evaluateLeg({ marketType: "receiving_yards", playerStats: { recYards: 41 } }, [{ direction: "for" }], game(21, 17))
          .liveState,
      ).toBe("unknown");
    });

    it("is unknown for a future, which has no linked scoreline", () => {
      expect(evaluateLeg({ marketType: "season_future" }, [{ direction: "for" }], game(21, 17)).liveState).toBe(
        "unknown",
      );
    });

    it("is unknown when the backed team is not in the Event", () => {
      // A leg mis-linked to the wrong game must not produce a confident answer.
      expect(evaluateLeg({ marketType: "moneyline" }, backing("team-elsewhere"), game(21, 17)).liveState).toBe(
        "unknown",
      );
    });

    it("is unknown for a total with no line", () => {
      expect(evaluateLeg({ marketType: "game_total" }, OVER, game(21, 17)).liveState).toBe("unknown");
    });

    it("is unknown for a total whose direction was never resolved", () => {
      // Neither Over nor Under: an unparsed leg, left alone.
      expect(
        evaluateLeg({ marketType: "game_total", line: 48 }, [{ direction: "neutral" }], game(21, 17)).liveState,
      ).toBe("unknown");
    });
  });

  describe("moneyline", () => {
    it("is winning when the backed team leads", () => {
      expect(evaluateLeg({ marketType: "moneyline" }, backing(HOME), game(21, 17))).toEqual({
        liveState: "winning",
        settlement: "open",
        detail: "ahead by 4",
      });
    });

    it("is losing when the backed team trails, reading the away side correctly", () => {
      expect(evaluateLeg({ marketType: "moneyline" }, backing(AWAY), game(21, 17))).toEqual({
        liveState: "losing",
        settlement: "open",
        detail: "behind by 4",
      });
    });

    it("is even when tied", () => {
      expect(evaluateLeg({ marketType: "moneyline" }, backing(HOME), game(14, 14))).toEqual({
        liveState: "even",
        settlement: "open",
        detail: "tied",
      });
    });

    it("settles won at final", () => {
      expect(evaluateLeg({ marketType: "moneyline" }, backing(HOME), game(21, 17, "final"))).toMatchObject({
        liveState: "winning",
        settlement: "won",
      });
    });

    it("settles lost at final", () => {
      expect(evaluateLeg({ marketType: "moneyline" }, backing(AWAY), game(21, 17, "final"))).toMatchObject({
        settlement: "lost",
      });
    });

    it("pushes on a final tie, since the stake comes back", () => {
      expect(evaluateLeg({ marketType: "moneyline" }, backing(HOME), game(17, 17, "final"))).toMatchObject({
        settlement: "push",
      });
    });
  });

  describe("spread", () => {
    it("is winning when the favourite covers", () => {
      // DAL -3.5, leading 21-17: covers by 0.5.
      expect(evaluateLeg({ marketType: "spread", line: -3.5 }, backing(HOME), game(21, 17))).toEqual({
        liveState: "winning",
        settlement: "open",
        detail: "covering by 0.5",
      });
    });

    it("is losing when the favourite leads but not by enough", () => {
      // DAL -7, leading 21-17: ahead on the scoreboard, behind on the bet.
      expect(evaluateLeg({ marketType: "spread", line: -7 }, backing(HOME), game(21, 17))).toEqual({
        liveState: "losing",
        settlement: "open",
        detail: "short by 3",
      });
    });

    it("is winning for a dog losing by less than the number", () => {
      // TB +7, trailing 21-17.
      expect(evaluateLeg({ marketType: "spread", line: 7 }, backing(AWAY), game(21, 17))).toMatchObject({
        liveState: "winning",
        detail: "covering by 3",
      });
    });

    it("is even sitting exactly on the number", () => {
      expect(evaluateLeg({ marketType: "spread", line: -4 }, backing(HOME), game(21, 17))).toEqual({
        liveState: "even",
        settlement: "open",
        detail: "on the number",
      });
    });

    it("pushes at final exactly on the number", () => {
      expect(evaluateLeg({ marketType: "spread", line: -4 }, backing(HOME), game(21, 17, "final"))).toMatchObject({
        settlement: "push",
      });
    });
  });

  describe("game total", () => {
    it("is winning for an Over already past the number", () => {
      expect(evaluateLeg({ marketType: "game_total", line: 48 }, OVER, game(28, 24))).toEqual({
        liveState: "winning",
        settlement: "open",
        detail: "52 of 48",
      });
    });

    it("is losing for an Over still short", () => {
      expect(evaluateLeg({ marketType: "game_total", line: 48 }, OVER, game(10, 7))).toMatchObject({
        liveState: "losing",
        detail: "17 of 48",
      });
    });

    it("inverts for an Under", () => {
      // The same 17 points that leaves an Over losing leaves an Under winning.
      expect(evaluateLeg({ marketType: "game_total", line: 48 }, UNDER, game(10, 7))).toMatchObject({
        liveState: "winning",
        detail: "17 of 48",
      });
      expect(evaluateLeg({ marketType: "game_total", line: 48 }, UNDER, game(28, 24))).toMatchObject({
        liveState: "losing",
      });
    });

    it("settles an Under that stayed below", () => {
      expect(evaluateLeg({ marketType: "game_total", line: 48 }, UNDER, game(10, 7, "final"))).toMatchObject({
        settlement: "won",
      });
    });
  });

  describe("team total", () => {
    it("reads only the backed team's score", () => {
      // DAL Over 20.5 with DAL on 21 — winning, though the game total is 38.
      expect(evaluateLeg({ marketType: "team_total", line: 20.5 }, [{ teamId: HOME, direction: "for" }], game(21, 17)))
        .toEqual({ liveState: "winning", settlement: "open", detail: "21 of 20.5" });
    });

    it("inverts for an Under", () => {
      expect(
        evaluateLeg({ marketType: "team_total", line: 20.5 }, [{ teamId: HOME, direction: "against" }], game(21, 17)),
      ).toMatchObject({ liveState: "losing" });
    });
  });

  describe("player prop", () => {
    // §26.2 stores Over as "for" on the player and Under as "against".
    const OVER_PLAYER: EvaluationSubject[] = [{ direction: "for" }];
    const UNDER_PLAYER: EvaluationSubject[] = [{ direction: "against" }];

    it("is losing for an Over the player has not reached", () => {
      // Deliberately not "on pace": 41 of 65.5 in the third quarter would lose
      // if the game ended now, and that is what the dot says. The detail gives
      // the raw numbers so the user can judge pace themselves.
      expect(
        evaluateLeg(
          { marketType: "receiving_yards", line: 65.5, playerStats: { recYards: 41 } },
          OVER_PLAYER,
          game(21, 17),
        ),
      ).toEqual({ liveState: "losing", settlement: "open", detail: "41 rec yds of 65.5" });
    });

    it("is winning once the player passes the number", () => {
      expect(
        evaluateLeg(
          { marketType: "receiving_yards", line: 65.5, playerStats: { recYards: 72 } },
          OVER_PLAYER,
          game(21, 17),
        ),
      ).toMatchObject({ liveState: "winning", detail: "72 rec yds of 65.5" });
    });

    it("inverts for an Under", () => {
      expect(
        evaluateLeg(
          { marketType: "receptions", line: 4.5, playerStats: { receptions: 2 } },
          UNDER_PLAYER,
          game(21, 17),
        ),
      ).toMatchObject({ liveState: "winning", detail: "2 rec of 4.5" });
    });

    it("sums both halves of a combined-yards prop", () => {
      expect(
        evaluateLeg(
          { marketType: "combined_yards", line: 60, playerStats: { rushYards: 30, recYards: 41 } },
          OVER_PLAYER,
          game(21, 17),
        ),
      ).toMatchObject({ liveState: "winning", detail: "71 yds of 60" });
    });

    it("uses the implied line of an anytime touchdown, which books print no number for", () => {
      expect(
        evaluateLeg(
          { marketType: "anytime_touchdown", playerStats: { recTd: 1 } },
          OVER_PLAYER,
          game(21, 17),
        ),
      ).toMatchObject({ liveState: "winning", detail: "1 TD of 0.5" });
      expect(
        evaluateLeg(
          { marketType: "anytime_touchdown", playerStats: { recTd: 0 } },
          OVER_PLAYER,
          game(21, 17),
        ),
      ).toMatchObject({ liveState: "losing", detail: "0 TD of 0.5" });
    });

    it("does not credit a quarterback's passing touchdowns to an anytime scorer", () => {
      expect(
        evaluateLeg(
          { marketType: "anytime_touchdown", playerStats: { passTd: 3 } },
          OVER_PLAYER,
          game(21, 17),
        ),
      ).toMatchObject({ liveState: "losing" });
    });

    it("reads a player with no numbers yet as zero, not as missing", () => {
      // A receiver with no catches really does have zero yards. The red dot is
      // correct: right now the Over would lose.
      expect(
        evaluateLeg(
          { marketType: "receiving_yards", line: 65.5, playerStats: {} },
          OVER_PLAYER,
          game(0, 0),
        ),
      ).toMatchObject({ liveState: "losing", detail: "0 rec yds of 65.5" });
    });

    it("says nothing before kickoff, where a zero would read as losing", () => {
      // The trap the Event gates exist for: a scheduled game stores no score,
      // so a player with no stats never shows a red dot pre-game.
      expect(
        evaluateLeg(
          { marketType: "receiving_yards", line: 65.5, playerStats: {} },
          OVER_PLAYER,
          game(null, null, "scheduled"),
        ).liveState,
      ).toBe("unknown");
    });

    it("settles the prop at final", () => {
      expect(
        evaluateLeg(
          { marketType: "receiving_yards", line: 65.5, playerStats: { recYards: 72 } },
          OVER_PLAYER,
          game(21, 17, "final"),
        ),
      ).toMatchObject({ settlement: "won" });
    });

    it("pushes a prop that landed exactly on a whole number", () => {
      expect(
        evaluateLeg(
          { marketType: "receiving_yards", line: 65, playerStats: { recYards: 65 } },
          OVER_PLAYER,
          game(21, 17, "final"),
        ),
      ).toMatchObject({ settlement: "push", detail: "65 rec yds of 65" });
    });

    it("says nothing when the Over/Under direction was never resolved", () => {
      expect(
        evaluateLeg(
          { marketType: "receiving_yards", line: 65.5, playerStats: { recYards: 41 } },
          [{ direction: "neutral" }],
          game(21, 17),
        ).liveState,
      ).toBe("unknown");
    });
  });

  it("keeps the live state and the settlement agreeing at final", () => {
    // The guarantee that matters: the chip a user watched all game cannot
    // disagree with the result they are paid on, because one margin drives both.
    const cases = [
      { line: -3.5, home: 21, away: 17 },
      { line: -7, home: 21, away: 17 },
      { line: -4, home: 21, away: 17 },
    ];
    for (const { line, home, away } of cases) {
      const live = evaluateLeg({ marketType: "spread", line }, backing(HOME), game(home, away));
      const final = evaluateLeg({ marketType: "spread", line }, backing(HOME), game(home, away, "final"));
      expect(final.liveState).toBe(live.liveState);
      expect({ winning: "won", losing: "lost", even: "push" }[live.liveState as string]).toBe(final.settlement);
    }
  });
});
