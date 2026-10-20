import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { ProviderEvent } from "@/lib/providers/types";
import { ensureMatchupTeams, ensureTeam } from "./ensure";

const USER = "user-1";

function game(overrides: Partial<ProviderEvent> = {}): ProviderEvent {
  return {
    providerEventId: "espn-401",
    sport: "college-football",
    name: "Auburn Tigers at Texas A&M Aggies",
    startTimeUtc: "2026-10-12T17:00:00Z",
    awayTeamName: "Auburn Tigers",
    awayTeamAbbreviation: "AUB",
    homeTeamName: "Texas A&M Aggies",
    homeTeamAbbreviation: "TA&M",
    ...overrides,
  };
}

function db(teams: Record<string, unknown>[] = []) {
  return createFakeSupabase({ teams });
}

function teamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "team-aub",
    user_id: USER,
    sport: "football",
    league: "NCAAF",
    name: "Auburn Tigers",
    abbreviation: "AUB",
    ...overrides,
  };
}

const ncaaf = { sport: "football", league: "NCAAF" };

describe("ensureTeam", () => {
  it("creates the team with the name and abbreviation it was given", async () => {
    const fake = db();
    const team = await ensureTeam(fake as unknown as SupabaseClient, USER, {
      ...ncaaf,
      name: "Auburn Tigers",
      abbreviation: "AUB",
    });

    expect(team.id).toBeDefined();
    expect(fake.tables.teams).toHaveLength(1);
    expect(fake.tables.teams[0]).toMatchObject({
      user_id: USER,
      sport: "football",
      league: "NCAAF",
      name: "Auburn Tigers",
      abbreviation: "AUB",
    });
  });

  it("reuses a team the import matcher would already have found", async () => {
    // Anything looser than `findTeam` here would mint a second "Auburn Tigers"
    // that the matcher then can't choose between.
    const fake = db([teamRow()]);
    const team = await ensureTeam(fake as unknown as SupabaseClient, USER, {
      ...ncaaf,
      name: "AUB Tigers",
      abbreviation: "AUB",
    });

    expect(team.id).toBe("team-aub");
    expect(fake.tables.teams).toHaveLength(1);
  });

  it("sees a team created moments earlier in the same approval", async () => {
    // A parlay repeats the same game across legs, and the candidate list is
    // snapshotted once per approval — so the second leg can only avoid a
    // duplicate by reading the database rather than the snapshot.
    const fake = db();
    const first = await ensureTeam(fake as unknown as SupabaseClient, USER, {
      ...ncaaf,
      name: "Auburn Tigers",
      abbreviation: "AUB",
    });
    const second = await ensureTeam(fake as unknown as SupabaseClient, USER, {
      ...ncaaf,
      name: "Auburn Tigers",
      abbreviation: "AUB",
    });

    expect(second.id).toBe(first.id);
    expect(fake.tables.teams).toHaveLength(1);
  });

  it("does not hand another user's team back", async () => {
    const fake = db([teamRow({ user_id: "user-2" })]);
    const team = await ensureTeam(fake as unknown as SupabaseClient, USER, {
      ...ncaaf,
      name: "Auburn Tigers",
      abbreviation: "AUB",
    });

    expect(team.id).not.toBe("team-aub");
    expect(fake.tables.teams).toHaveLength(2);
  });
});

describe("ensureMatchupTeams", () => {
  const printed = { awayTeamName: "Auburn", homeTeamName: "Texas A&M" };

  it("creates both sides from the scheduled game, spelled the provider's way", async () => {
    // The slip says "Auburn"; the Team row has to say "Auburn Tigers" with the
    // provider's abbreviation, or nothing downstream matches the game again.
    const fake = db();
    const result = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, ...printed },
      { teams: [], schedule: [game()] },
    );

    expect(result).toBeDefined();
    expect(result!.awayTeam.name).toBe("Auburn Tigers");
    expect(result!.homeTeam.name).toBe("Texas A&M Aggies");
    expect(fake.tables.teams.map((t) => t.abbreviation).sort()).toEqual(["AUB", "TA&M"]);
  });

  it("keeps the slip's own away/home orientation", async () => {
    // A slip's "@" is not always the provider's, so the sides are assigned by
    // which printed name matches which — not by position.
    const fake = db();
    const result = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, awayTeamName: "Texas A&M", homeTeamName: "Auburn" },
      { teams: [], schedule: [game()] },
    );

    expect(result!.awayTeam.name).toBe("Texas A&M Aggies");
    expect(result!.homeTeam.name).toBe("Auburn Tigers");
  });

  it("creates only the side the user is missing", async () => {
    const fake = db([teamRow()]);
    const result = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, ...printed },
      {
        teams: [{ id: "team-aub", sport: "football", name: "Auburn Tigers", abbreviation: "AUB" }],
        schedule: [game()],
      },
    );

    expect(result!.awayTeam.id).toBe("team-aub");
    expect(fake.tables.teams).toHaveLength(2);
  });

  it("does not consult the provider when the user already has both sides", async () => {
    const fake = db();
    const teams = [
      { id: "team-aub", sport: "football", name: "Auburn Tigers", abbreviation: "AUB" },
      { id: "team-tam", sport: "football", name: "Texas A&M Aggies", abbreviation: "TA&M" },
    ];
    const result = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, awayTeamName: "AUB", homeTeamName: "TA&M" },
      { teams, schedule: [] },
    );

    expect(result).toEqual({ awayTeam: teams[0], homeTeam: teams[1] });
    expect(fake.tables.teams).toHaveLength(0);
  });

  it("reuses the team a previous import created, rather than cloning it", async () => {
    // The printed "Auburn" never matches an "Auburn Tigers" row directly —
    // `findTeam` has no prefix rung, deliberately, because prefix-matching a
    // *selection* is how "Miami" ends up on the wrong program. The duplicate is
    // avoided one step later instead: the provider's canonical name is what
    // `ensureTeam` looks up, and that matches exactly. So the second import
    // costs a schedule read it was making anyway, and no second row.
    const fake = db();
    const first = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, ...printed },
      { teams: [], schedule: [game()] },
    );
    const second = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, ...printed },
      { teams: [], schedule: [game()] },
    );

    expect(second!.awayTeam.id).toBe(first!.awayTeam.id);
    expect(second!.homeTeam.id).toBe(first!.homeTeam.id);
    expect(fake.tables.teams).toHaveLength(2);
  });

  it("creates nothing when the provider is not carrying the game", async () => {
    // §22: a provider outage yields an empty schedule and the leg stays
    // unlinked, which is the pre-existing behaviour and fixable by hand.
    const fake = db();
    const result = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, ...printed },
      { teams: [], schedule: [] },
    );

    expect(result).toBeUndefined();
    expect(fake.tables.teams).toHaveLength(0);
  });

  it("creates nothing when two scheduled games fit the same printed pair", async () => {
    // §20.2 reports ambiguity instead of picking one. A Team invented from the
    // wrong game is permanent and poisons every later match.
    const fake = db();
    const result = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, ...printed },
      { teams: [], schedule: [game(), game({ providerEventId: "espn-402" })] },
    );

    expect(result).toBeUndefined();
    expect(fake.tables.teams).toHaveLength(0);
  });

  it("creates nothing from a game the provider named only by abbreviation", async () => {
    // The name is what a Team gets created from; there is nothing to seed one
    // with here, and "AUB" is not a team name.
    const fake = db();
    const result = await ensureMatchupTeams(
      fake as unknown as SupabaseClient,
      USER,
      { ...ncaaf, awayTeamName: "AUB", homeTeamName: "TA&M" },
      {
        teams: [],
        schedule: [game({ awayTeamName: undefined, homeTeamName: undefined })],
      },
    );

    expect(result).toBeUndefined();
    expect(fake.tables.teams).toHaveLength(0);
  });

  describe("reconciling the printed name against the provider's", () => {
    async function resolve(
      awayTeamName: string,
      homeTeamName: string,
      schedule: ProviderEvent[],
    ) {
      const fake = db();
      const result = await ensureMatchupTeams(
        fake as unknown as SupabaseClient,
        USER,
        { ...ncaaf, awayTeamName, homeTeamName },
        { teams: [], schedule },
      );
      return result && [result.awayTeam.name, result.homeTeam.name];
    }

    it("accepts the program without the mascot", async () => {
      // Books print "Florida State"; ESPN prints "Florida State Seminoles".
      expect(
        await resolve("Florida State", "Clemson", [
          game({ awayTeamName: "Florida State Seminoles", homeTeamName: "Clemson Tigers" }),
        ]),
      ).toEqual(["Florida State Seminoles", "Clemson Tigers"]);
    });

    it("accepts a name the provider prefixes", async () => {
      // The reverse case: the slip says "Bournemouth", ESPN says "AFC
      // Bournemouth", so the printed words can be a trailing run too.
      expect(
        await resolve("Bournemouth", "Chelsea", [
          game({ awayTeamName: "AFC Bournemouth", homeTeamName: "Chelsea" }),
        ]),
      ).toEqual(["AFC Bournemouth", "Chelsea"]);
    });

    it("accepts the provider's abbreviation", async () => {
      expect(
        await resolve("AUB", "TA&M", [game()]),
      ).toEqual(["Auburn Tigers", "Texas A&M Aggies"]);
    });

    it("refuses a word from the middle of the provider's name", async () => {
      // A bare "State" sits inside both "Florida State Seminoles" and "Ohio
      // State Buckeyes", so matching it decides nothing.
      expect(
        await resolve("State", "Clemson", [
          game({ awayTeamName: "Florida State Seminoles", homeTeamName: "Clemson Tigers" }),
        ]),
      ).toBeUndefined();
    });

    it("refuses a printed name that merely overlaps the provider's", async () => {
      // "Miami FL" is not a run of "Miami Hurricanes" — and "Miami" is also
      // Miami (OH), so a guess here is a coin flip on which program the user
      // actually bet. Unlinked is the honest outcome.
      expect(
        await resolve("Miami FL", "Clemson", [
          game({ awayTeamName: "Miami Hurricanes", homeTeamName: "Clemson Tigers" }),
        ]),
      ).toBeUndefined();
    });

    it("refuses a pair that both land on the same side", async () => {
      expect(
        await resolve("Miami", "Miami Hurricanes", [
          game({ awayTeamName: "Miami Hurricanes", homeTeamName: "Clemson Tigers" }),
        ]),
      ).toBeUndefined();
    });
  });
});
