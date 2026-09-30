import { describe, expect, it } from "vitest";
import {
  allowsTeamSubject,
  defaultSubjectDirection,
  marketCategory,
  resolveSubjectDirection,
} from "./subjects";

describe("marketCategory", () => {
  it("classifies each market from the docs/PRD.md section 26.2 table", () => {
    expect(marketCategory("moneyline")).toBe("team_vs_opponent");
    expect(marketCategory("spread")).toBe("team_vs_opponent");
    expect(marketCategory("game_total")).toBe("game_total");
    expect(marketCategory("team_total")).toBe("team_total");
    expect(marketCategory("passing_yards")).toBe("player_over_under");
    expect(marketCategory("winner")).toBe("selection_only");
    expect(marketCategory("top_finish")).toBe("selection_only");
    expect(marketCategory("season_future")).toBe("selection_only");
    expect(marketCategory("matchup")).toBe("matchup");
  });

  it("defaults unknown or custom markets to neutral so entry is never blocked", () => {
    expect(marketCategory("custom")).toBe("neutral");
    expect(marketCategory("some_future_market_type")).toBe("neutral");
  });
});

describe("allowsTeamSubject", () => {
  it("is false for player prop markets", () => {
    expect(allowsTeamSubject("passing_yards")).toBe(false);
    expect(allowsTeamSubject("receptions")).toBe(false);
  });

  it("is true for every other market", () => {
    expect(allowsTeamSubject("moneyline")).toBe(true);
    expect(allowsTeamSubject("custom")).toBe(true);
  });
});

describe("defaultSubjectDirection", () => {
  it("moneyline/spread: selected team for, opponent against", () => {
    expect(defaultSubjectDirection("moneyline", "primary")).toBe("for");
    expect(defaultSubjectDirection("moneyline", "opponent")).toBe("against");
    expect(defaultSubjectDirection("spread", "primary")).toBe("for");
    expect(defaultSubjectDirection("spread", "opponent")).toBe("against");
  });

  it("game_total: for on Over, against on Under", () => {
    expect(defaultSubjectDirection("game_total", "primary", "over")).toBe("for");
    expect(defaultSubjectDirection("game_total", "primary", "under")).toBe("against");
  });

  it("team_total: for on Over, against on Under", () => {
    expect(defaultSubjectDirection("team_total", "primary", "over")).toBe("for");
    expect(defaultSubjectDirection("team_total", "primary", "under")).toBe("against");
  });

  it("player props: for on Over/Yes, against on Under/No, never team-level", () => {
    expect(defaultSubjectDirection("passing_yards", "primary", "over")).toBe("for");
    expect(defaultSubjectDirection("passing_yards", "primary", "under")).toBe("against");
    expect(defaultSubjectDirection("anytime_touchdown", "primary", "yes")).toBe("for");
    expect(defaultSubjectDirection("anytime_touchdown", "primary", "no")).toBe("against");
  });

  it("winner/top_finish/season_future: selection for", () => {
    expect(defaultSubjectDirection("winner", "primary")).toBe("for");
    expect(defaultSubjectDirection("top_finish", "primary")).toBe("for");
    expect(defaultSubjectDirection("season_future", "primary")).toBe("for");
  });

  it("matchup: selection for, opponent against", () => {
    expect(defaultSubjectDirection("matchup", "primary")).toBe("for");
    expect(defaultSubjectDirection("matchup", "opponent")).toBe("against");
  });

  it("custom: neutral until set", () => {
    expect(defaultSubjectDirection("custom", "primary")).toBe("neutral");
    expect(defaultSubjectDirection("custom", "opponent")).toBe("neutral");
  });
});

describe("resolveSubjectDirection", () => {
  it("proposes the default when there is no existing subject", () => {
    expect(resolveSubjectDirection(undefined, "for")).toEqual({
      direction: "for",
      directionSource: "auto",
    });
  });

  it("replaces an auto direction with a fresh proposal", () => {
    const existing = { direction: "against" as const, directionSource: "auto" as const };
    expect(resolveSubjectDirection(existing, "for")).toEqual({
      direction: "for",
      directionSource: "auto",
    });
  });

  it("a manually-edited direction survives re-matching", () => {
    const existing = { direction: "neutral" as const, directionSource: "manual" as const };
    expect(resolveSubjectDirection(existing, "for")).toBe(existing);
  });
});
