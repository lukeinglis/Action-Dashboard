import { describe, expect, it } from "vitest";
import { isSupportedProp, propCurrentValue, propLine, propUnit } from "./prop-stats";

describe("propCurrentValue", () => {
  it("reads the one stat a single-key market is about", () => {
    expect(propCurrentValue("receiving_yards", { recYards: 41, rushYards: 12 })).toBe(41);
  });

  it("sums the keys of a combined market", () => {
    // "Rush + rec yards" needs no special case beyond listing both keys.
    expect(propCurrentValue("combined_yards", { rushYards: 30, recYards: 41 })).toBe(71);
  });

  it("counts only touchdowns the player scored", () => {
    // A quarterback throwing three is not an anytime-touchdown scorer.
    expect(propCurrentValue("anytime_touchdown", { passTd: 3, rushTd: 0, recTd: 0 })).toBe(0);
    expect(propCurrentValue("anytime_touchdown", { passTd: 3, rushTd: 1 })).toBe(1);
  });

  it("is zero, not null, for a player who has not done it yet", () => {
    // A receiver with no catches has zero receiving yards: a real answer, and
    // the caller gates on kickoff so a pre-game zero is never shown.
    expect(propCurrentValue("receiving_yards", {})).toBe(0);
  });

  it("is null for a market no stat line can answer", () => {
    // Scoring *order* is not in a week stat line, and no provider is wired up
    // for baseball. Both keep the leg silent rather than guessing.
    expect(propCurrentValue("first_touchdown", { rushTd: 1 })).toBeNull();
    expect(propCurrentValue("batter_home_runs", { homeRuns: 1 })).toBeNull();
    expect(propCurrentValue("moneyline", {})).toBeNull();
  });
});

describe("propLine", () => {
  it("uses the leg's own line", () => {
    expect(propLine("receiving_yards", 65.5)).toBe(65.5);
  });

  it("falls back to the market's implied line", () => {
    // Books print no number for "anytime touchdown"; it is really over 0.5.
    expect(propLine("anytime_touchdown", null)).toBe(0.5);
    expect(propLine("anytime_touchdown", undefined)).toBe(0.5);
  });

  it("prefers a stated line over the implied one", () => {
    expect(propLine("anytime_touchdown", 1.5)).toBe(1.5);
  });

  it("is null for a supported market with no line and none implied", () => {
    expect(propLine("receiving_yards", null)).toBeNull();
  });

  it("is null for an unsupported market, line or not", () => {
    expect(propLine("first_touchdown", 0.5)).toBeNull();
  });
});

describe("isSupportedProp", () => {
  it("is true only for markets a stat line can answer", () => {
    expect(isSupportedProp("receiving_yards")).toBe(true);
    expect(isSupportedProp("anytime_touchdown")).toBe(true);
    expect(isSupportedProp("first_touchdown")).toBe(false);
    expect(isSupportedProp("spread")).toBe(false);
  });
});

describe("propUnit", () => {
  it("names the unit for the leg row", () => {
    expect(propUnit("receiving_yards")).toBe("rec yds");
    expect(propUnit("receptions")).toBe("rec");
  });

  it("is null where there is nothing to label", () => {
    expect(propUnit("moneyline")).toBeNull();
  });
});
