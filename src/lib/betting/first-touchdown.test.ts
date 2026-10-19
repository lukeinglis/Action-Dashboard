import { describe, expect, it } from "vitest";
import { firstTouchdownStats } from "./first-touchdown";
import type { ProviderScoringPlay } from "@/lib/providers/types";

const HENRY = { id: "p-henry", name: "Derrick Henry", sport: "football", teamAbbreviation: "BAL" };
const POLLARD = { id: "p-pollard", name: "Tony Pollard", sport: "football", teamAbbreviation: "TEN" };

/** Trimmed from the real TEN @ BAL feed, 2026-10-04. */
const plays: ProviderScoringPlay[] = [
  {
    sequence: 1,
    kind: "touchdown",
    scorerName: "Derrick Henry",
    teamAbbreviation: "BAL",
    period: 1,
    clock: "12:09",
  },
  {
    sequence: 2,
    kind: "touchdown",
    scorerName: "Tony Pollard",
    teamAbbreviation: "TEN",
    period: 1,
    clock: "5:56",
  },
];

describe("firstTouchdownStats", () => {
  it("credits the scorer of the game's first touchdown", () => {
    const stats = firstTouchdownStats(plays, [HENRY, POLLARD]);

    expect(stats.get("p-henry")).toEqual({ firstTd: 1 });
    // A later touchdown cannot be the first one, so this is decided too.
    expect(stats.get("p-pollard")).toEqual({ firstTd: 0 });
  });

  it("ignores a field goal that came first", () => {
    // "First touchdown scorer" is not "first points scorer".
    const withFieldGoal: ProviderScoringPlay[] = [
      { sequence: 1, kind: "field_goal", scorerName: "Joey Slye", teamAbbreviation: "TEN" },
      ...plays.map((p, i) => ({ ...p, sequence: i + 2 })),
    ];

    expect(firstTouchdownStats(withFieldGoal, [HENRY]).get("p-henry")).toEqual({ firstTd: 1 });
  });

  it("says nothing until a touchdown has actually been scored", () => {
    // Zeroes before the first touchdown would show every such leg as losing
    // from kickoff, and would settle them all as losses on an empty feed.
    expect(firstTouchdownStats([], [HENRY, POLLARD]).size).toBe(0);
    expect(
      firstTouchdownStats(
        [{ sequence: 1, kind: "field_goal", scorerName: "Tyler Loop" }],
        [HENRY],
      ).size,
    ).toBe(0);
  });

  it("says nothing when the scorer's name could not be read", () => {
    // A wording the adapter cannot parse must leave the leg open rather than
    // grading it against nobody.
    const unreadable: ProviderScoringPlay[] = [{ sequence: 1, kind: "touchdown" }];
    expect(firstTouchdownStats(unreadable, [HENRY]).size).toBe(0);
  });

  it("resolves an abbreviated name the way every other player match does", () => {
    // A slip prints "D. Henry"; the feed says "Derrick Henry". The §20.2
    // ladder is the one place that equivalence is decided.
    const abbreviated = { ...HENRY, name: "D. Henry" };
    expect(firstTouchdownStats(plays, [abbreviated]).get("p-henry")).toEqual({ firstTd: 1 });
  });

  it("does not credit a different player who shares a surname", () => {
    // The reason this file does not reuse the general matching ladder: its
    // loosest rung is surname alone, which against a single name to compare
    // would hand Derrick Henry's touchdown to Hunter Henry.
    const otherHenry = {
      id: "p-other",
      name: "Hunter Henry",
      sport: "football",
      teamAbbreviation: "NE",
    };
    expect(firstTouchdownStats(plays, [otherHenry]).get("p-other")).toEqual({ firstTd: 0 });
  });

  it("confirms a bare surname off the team instead", () => {
    const bare = { id: "p-bare", name: "Henry", sport: "football", teamAbbreviation: "BAL" };
    expect(firstTouchdownStats(plays, [bare]).get("p-bare")).toEqual({ firstTd: 1 });

    const wrongTeam = { ...bare, id: "p-wrong", teamAbbreviation: "NE" };
    expect(firstTouchdownStats(plays, [wrongTeam]).get("p-wrong")).toEqual({ firstTd: 0 });
  });

  it("leaves a surname it can neither confirm nor rule out undecided", () => {
    // No first initial and no team: this could be the scorer or his namesake,
    // and a 0 here would settle a winning bet as a loss. The leg stays open.
    const bare = { id: "p-bare", name: "Henry", sport: "football", teamAbbreviation: null };
    expect(firstTouchdownStats(plays, [bare]).has("p-bare")).toBe(false);
  });

  it("answers for every participant asked about, and no one else", () => {
    const stats = firstTouchdownStats(plays, [POLLARD]);
    expect([...stats.keys()]).toEqual(["p-pollard"]);
  });
});
