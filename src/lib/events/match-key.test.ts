import { describe, expect, it } from "vitest";
import { buildEventMatchKey, normalizeEventName, toLocalDateString } from "./match-key";

describe("toLocalDateString", () => {
  it("converts a late-UTC instant to the prior Eastern calendar date", () => {
    // 2026-09-28T02:30:00Z is 2026-09-27 10:30 PM Eastern.
    expect(toLocalDateString("2026-09-28T02:30:00Z", "America/New_York")).toBe("2026-09-27");
  });
});

describe("normalizeEventName", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeEventName("  PGA - Masters,  Round 4!! ")).toBe("pga masters round 4");
  });
});

describe("buildEventMatchKey", () => {
  it("returns null when there is no start time", () => {
    expect(
      buildEventMatchKey({ sport: "nfl", name: "TBD Game", startTimeUtc: null }, "America/New_York"),
    ).toBeNull();
  });

  it("builds a team-sport key from sport + both teams + local date", () => {
    const key = buildEventMatchKey(
      {
        sport: "nfl",
        name: "MIN @ TB",
        startTimeUtc: "2026-09-28T20:05:00Z",
        homeTeamId: "team-tb",
        awayTeamId: "team-min",
      },
      "America/New_York",
    );
    expect(key).toBe("team|nfl|team-min|team-tb|2026-09-28");
  });

  it("builds the same team-sport key when home and away are reversed", () => {
    const input = {
      sport: "nfl",
      name: "MIN @ TB",
      startTimeUtc: "2026-09-28T20:05:00Z",
    };
    const asEntered = buildEventMatchKey(
      { ...input, homeTeamId: "team-tb", awayTeamId: "team-min" },
      "America/New_York",
    );
    const reversed = buildEventMatchKey(
      { ...input, homeTeamId: "team-min", awayTeamId: "team-tb" },
      "America/New_York",
    );
    expect(reversed).toBe(asEntered);
  });

  it("still separates the same pair on different local dates", () => {
    const sunday = buildEventMatchKey(
      {
        sport: "nfl",
        name: "MIN @ TB",
        startTimeUtc: "2026-09-28T20:05:00Z",
        homeTeamId: "team-tb",
        awayTeamId: "team-min",
      },
      "America/New_York",
    );
    const laterMeeting = buildEventMatchKey(
      {
        sport: "nfl",
        name: "TB @ MIN",
        startTimeUtc: "2026-12-06T18:00:00Z",
        homeTeamId: "team-min",
        awayTeamId: "team-tb",
      },
      "America/New_York",
    );
    expect(laterMeeting).not.toBe(sunday);
  });

  it("builds a non-team key from sport + league + normalized name + local date", () => {
    const key = buildEventMatchKey(
      {
        sport: "golf",
        league: "pga",
        name: "PGA - Masters - Round 4",
        startTimeUtc: "2026-09-28T15:00:00Z",
      },
      "America/New_York",
    );
    expect(key).toBe("nonteam|golf|pga|pga masters round 4|2026-09-28");
  });

  it("treats team keys and non-team keys as distinct even with similar inputs", () => {
    const teamKey = buildEventMatchKey(
      {
        sport: "nfl",
        name: "MIN @ TB",
        startTimeUtc: "2026-09-28T20:05:00Z",
        homeTeamId: "a",
        awayTeamId: "b",
      },
      "America/New_York",
    );
    const nonTeamKey = buildEventMatchKey(
      { sport: "nfl", name: "MIN @ TB", startTimeUtc: "2026-09-28T20:05:00Z" },
      "America/New_York",
    );
    expect(teamKey).not.toBe(nonTeamKey);
  });
});
