import { describe, expect, it } from "vitest";
import {
  normalizePlayerDirectory,
  normalizeState,
  normalizeWeekStats,
  type SleeperDirectory,
} from "./sleeper";

// Values below are the real week 4 numbers captured 2026-10-05 and verified
// against ESPN's box score. See docs/api-evaluation.md section 4.4.

describe("normalizeState", () => {
  it("reads the current week", () => {
    expect(
      normalizeState({ week: 4, season: "2026", season_type: "regular", display_week: 4 }),
    ).toEqual({ season: "2026", week: 4, seasonType: "regular" });
  });

  it("defaults the season type when absent", () => {
    expect(normalizeState({ week: 1, season: "2026" }).seasonType).toBe("regular");
  });

  it("throws when season or week is missing", () => {
    expect(() => normalizeState({ season: "2026" })).toThrow(/missing season or week/);
    expect(() => normalizeState(null)).toThrow(/missing season or week/);
  });
});

describe("normalizePlayerDirectory", () => {
  it("keeps only the fields needed to resolve a stats row", () => {
    const directory = normalizePlayerDirectory({
      "3163": {
        full_name: "Jared Goff",
        team: "DET",
        position: "QB",
        // The real payload carries ~40 more fields per player across 14.6 MB
        // and 12,229 entries.
        espn_id: "3046779",
        fantasy_positions: ["QB"],
      },
    });

    expect(directory["3163"]).toEqual({
      playerName: "Jared Goff",
      team: "DET",
      position: "QB",
    });
  });

  it("falls back to first and last name when full_name is absent", () => {
    const directory = normalizePlayerDirectory({
      "99": { first_name: "Sam", last_name: "LaPorta", team: "DET", position: "TE" },
    });
    expect(directory["99"].playerName).toBe("Sam LaPorta");
  });

  it("normalizes a null team to undefined rather than keeping null", () => {
    const directory = normalizePlayerDirectory({
      "99": { full_name: "Free Agent", team: null, position: "WR" },
    });
    expect(directory["99"].team).toBeUndefined();
  });

  it("throws when the directory is empty", () => {
    expect(() => normalizePlayerDirectory({})).toThrow(/parsed but was empty/);
    expect(() => normalizePlayerDirectory(null)).toThrow(/not an object/);
  });
});

const directory: SleeperDirectory = {
  "3163": { playerName: "Jared Goff", team: "DET", position: "QB" },
  "10859": { playerName: "Sam LaPorta", team: "DET", position: "TE" },
  "8148": { playerName: "Jameson Williams", team: "DET", position: "WR" },
};

describe("normalizeWeekStats", () => {
  it("normalizes Sleeper field names to the same keys the ESPN adapter emits", () => {
    const stats = normalizeWeekStats(
      {
        "10859": { rec: 8, rec_yd: 84, rec_td: 1, rec_tgt: 13, pts_ppr: 22.4 },
      },
      directory,
    );

    expect(stats).toHaveLength(1);
    expect(stats[0]).toEqual({
      providerPlayerId: "10859",
      playerName: "Sam LaPorta",
      teamAbbreviation: "DET",
      position: "TE",
      stats: { receptions: 8, recYards: 84, recTd: 1, targets: 13 },
      fantasyPointsPpr: 22.4,
      fantasyPointsHalfPpr: undefined,
      fantasyPointsStandard: undefined,
    });
  });

  it("carries all three fantasy scoring formats", () => {
    const [goff] = normalizeWeekStats(
      {
        "3163": { pass_yd: 412, pass_td: 1, pts_ppr: 20.48, pts_half_ppr: 20.48, pts_std: 20.48 },
      },
      directory,
    );

    expect(goff.stats).toEqual({ passYards: 412, passTd: 1 });
    expect(goff.fantasyPointsPpr).toBe(20.48);
    expect(goff.fantasyPointsHalfPpr).toBe(20.48);
    expect(goff.fantasyPointsStandard).toBe(20.48);
  });

  it("drops TEAM_ aggregates, which are not players", () => {
    const stats = normalizeWeekStats(
      { TEAM_DET: { pass_yd: 412 }, "8148": { rec: 6, rec_yd: 102, rec_tgt: 8 } },
      directory,
    );

    expect(stats.map((s) => s.providerPlayerId)).toEqual(["8148"]);
  });

  it("drops players who recorded nothing", () => {
    // The real week 4 payload held 2,230 entries for 357 players with stats.
    const stats = normalizeWeekStats(
      { "3163": { pass_yd: 412 }, "10859": { gp: 1, gms_active: 1 } },
      directory,
    );

    expect(stats.map((s) => s.providerPlayerId)).toEqual(["3163"]);
  });

  it("keeps a player whose only datum is fantasy points", () => {
    const stats = normalizeWeekStats({ "8148": { pts_ppr: 2.5 } }, directory);
    expect(stats[0].stats).toEqual({});
    expect(stats[0].fantasyPointsPpr).toBe(2.5);
  });

  it("still returns a stats row for a player missing from the directory", () => {
    // Directory and stats are fetched separately, so a just-signed player can
    // appear in stats before the cached directory knows about them.
    const [entry] = normalizeWeekStats({ "99999": { rec: 1, rec_yd: 9 } }, directory);

    expect(entry.providerPlayerId).toBe("99999");
    expect(entry.playerName).toBeUndefined();
    expect(entry.stats).toEqual({ receptions: 1, recYards: 9 });
  });

  it("treats a week with no recorded stats as a failure", () => {
    expect(() => normalizeWeekStats({ "3163": { gp: 0 } }, directory)).toThrow(
      /no player recorded anything/,
    );
    expect(() => normalizeWeekStats({}, directory)).toThrow(/no player recorded anything/);
  });

  it("rejects a non-object payload", () => {
    expect(() => normalizeWeekStats(null, directory)).toThrow(/not an object/);
  });
});
