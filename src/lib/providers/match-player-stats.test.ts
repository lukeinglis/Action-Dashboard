import { describe, expect, it } from "vitest";
import { matchPlayerStats, parseName, type ParticipantCandidate } from "./match-player-stats";
import type { ProviderPlayerStat } from "./types";

function player(
  providerPlayerId: string,
  playerName: string,
  teamAbbreviation?: string,
): ProviderPlayerStat {
  return { providerPlayerId, playerName, teamAbbreviation, stats: {} };
}

function participant(name: string, teamAbbreviation?: string): ParticipantCandidate {
  return { id: `p-${name}`, name, sport: "football", teamAbbreviation };
}

const EGBUKA = player("4984", "Devin Egbuka", "TB");
const EVANS = player("3321", "Mike Evans", "TB");

describe("matchPlayerStats", () => {
  it("matches an exact full name", () => {
    const { matches } = matchPlayerStats([participant("Devin Egbuka")], [EGBUKA, EVANS]);
    expect(matches).toEqual([
      { participantId: "p-Devin Egbuka", providerPlayerId: "4984", via: "full_name" },
    ]);
  });

  it("matches an abbreviated first name, which is how a slip prints it", () => {
    // The case the whole module exists for: DraftKings writes "D. Egbuka",
    // Sleeper carries "Devin Egbuka", and exact matching fails on every prop.
    const { matches } = matchPlayerStats([participant("D. Egbuka")], [EGBUKA, EVANS]);
    expect(matches).toEqual([
      { participantId: "p-D. Egbuka", providerPlayerId: "4984", via: "initial_surname" },
    ]);
  });

  it("matches a surname alone when only one player has it", () => {
    const { matches } = matchPlayerStats([participant("Egbuka")], [EGBUKA, EVANS]);
    expect(matches[0]).toMatchObject({ providerPlayerId: "4984", via: "surname" });
  });

  it("ignores a suffix on either side", () => {
    const obj = player("111", "Odell Beckham Jr.", "MIA");
    expect(matchPlayerStats([participant("Odell Beckham")], [obj]).matches[0]).toMatchObject({
      providerPlayerId: "111",
      via: "full_name",
    });
    expect(matchPlayerStats([participant("Odell Beckham Jr")], [obj]).matches[0]).toMatchObject({
      providerPlayerId: "111",
      via: "full_name",
    });
  });

  it("is case- and punctuation-insensitive", () => {
    const { matches } = matchPlayerStats(
      [participant("DEVIN  EGBUKA")],
      [EGBUKA],
    );
    expect(matches[0]).toMatchObject({ via: "full_name" });
  });

  describe("two players with the same surname", () => {
    const JOSH_ALLEN = player("4984", "Josh Allen", "BUF");
    const BRIAN_ALLEN = player("5544", "Brian Allen", "LAR");

    it("prefers the full name over the shared surname", () => {
      const { matches, ambiguous } = matchPlayerStats(
        [participant("Josh Allen")],
        [JOSH_ALLEN, BRIAN_ALLEN],
      );
      expect(ambiguous).toEqual([]);
      expect(matches[0]).toMatchObject({ providerPlayerId: "4984", via: "full_name" });
    });

    it("separates them by first initial", () => {
      const { matches } = matchPlayerStats(
        [participant("B. Allen")],
        [JOSH_ALLEN, BRIAN_ALLEN],
      );
      expect(matches[0]).toMatchObject({ providerPlayerId: "5544", via: "initial_surname" });
    });

    it("breaks a tie on the participant's team", () => {
      // Same first initial, so only the team tells them apart — and a slip
      // almost always prints the team.
      const jalen = player("7001", "Jalen Allen", "LAR");
      const { matches, ambiguous } = matchPlayerStats(
        [participant("J. Allen", "buf")],
        [JOSH_ALLEN, jalen],
      );
      expect(ambiguous).toEqual([]);
      expect(matches[0]).toMatchObject({ providerPlayerId: "4984" });
    });

    it("reports an ambiguity rather than picking one", () => {
      // §20.2: exactly one candidate is a match. Guessing would grade the prop
      // against a stranger's stat line.
      const { matches, ambiguous, unmatchedParticipantIds } = matchPlayerStats(
        [participant("Allen")],
        [JOSH_ALLEN, BRIAN_ALLEN],
      );
      expect(matches).toEqual([]);
      expect(unmatchedParticipantIds).toEqual([]);
      expect(ambiguous).toEqual([
        {
          participantId: "p-Allen",
          name: "Allen",
          candidateProviderIds: ["4984", "5544"],
        },
      ]);
    });

    it("still reports an ambiguity when the team does not narrow it to one", () => {
      const other = player("9001", "Jared Allen", "BUF");
      const { ambiguous } = matchPlayerStats(
        [participant("Allen", "BUF")],
        [JOSH_ALLEN, other, BRIAN_ALLEN],
      );
      // Narrowed to the two BUF players, but two is not one.
      expect(ambiguous[0].candidateProviderIds).toEqual(["4984", "9001"]);
    });
  });

  it("keeps an existing mapping and never looks for a better one", () => {
    // §20.2: a mapping the user fixed by hand must survive a refresh.
    const { matches } = matchPlayerStats(
      [participant("Devin Egbuka")],
      [EGBUKA, EVANS],
      [{ participantId: "p-Devin Egbuka", providerPlayerId: "3321" }],
    );
    expect(matches).toEqual([
      { participantId: "p-Devin Egbuka", providerPlayerId: "3321", via: "mapping" },
    ]);
  });

  it("reports a participant no rung resolved", () => {
    const { matches, unmatchedParticipantIds } = matchPlayerStats(
      [participant("Nobody Here")],
      [EGBUKA, EVANS],
    );
    expect(matches).toEqual([]);
    expect(unmatchedParticipantIds).toEqual(["p-Nobody Here"]);
  });

  it("skips a player row with no name to match on", () => {
    // Sleeper's directory is incomplete at the edges.
    const nameless: ProviderPlayerStat = { providerPlayerId: "0", stats: {} };
    const { unmatchedParticipantIds } = matchPlayerStats([participant("Egbuka")], [nameless]);
    expect(unmatchedParticipantIds).toEqual(["p-Egbuka"]);
  });

  it("reports a participant whose own name has no surname", () => {
    const { unmatchedParticipantIds } = matchPlayerStats([participant("   ")], [EGBUKA]);
    expect(unmatchedParticipantIds).toEqual(["p-   "]);
  });

  it("resolves each participant independently", () => {
    const { matches, unmatchedParticipantIds } = matchPlayerStats(
      [participant("D. Egbuka"), participant("Who Dis"), participant("Mike Evans")],
      [EGBUKA, EVANS],
    );
    expect(matches.map((m) => m.providerPlayerId)).toEqual(["4984", "3321"]);
    expect(unmatchedParticipantIds).toEqual(["p-Who Dis"]);
  });
});

describe("parseName", () => {
  it("splits a full name", () => {
    expect(parseName("Devin Egbuka")).toEqual({
      full: "devin egbuka",
      surname: "egbuka",
      firstInitial: "d",
    });
  });

  it("reads a one-letter first token as an initial", () => {
    // normalizeEventName has already dropped the period.
    expect(parseName("D. Egbuka")).toEqual({
      full: "d egbuka",
      surname: "egbuka",
      firstInitial: "d",
    });
  });

  it("drops a suffix from the surname and the full name", () => {
    expect(parseName("Odell Beckham Jr.")).toEqual({
      full: "odell beckham",
      surname: "beckham",
      firstInitial: "o",
    });
  });

  it("keeps a middle name in the full form but not as the surname", () => {
    expect(parseName("Amon Ra St Brown")).toMatchObject({
      full: "amon ra st brown",
      surname: "brown",
    });
  });

  it("carries no first initial for a single token", () => {
    expect(parseName("Egbuka")).toEqual({ full: "egbuka", surname: "egbuka", firstInitial: null });
  });

  it("has nothing to say about an empty name", () => {
    expect(parseName("  ")).toEqual({ full: "", surname: "", firstInitial: null });
  });
});
