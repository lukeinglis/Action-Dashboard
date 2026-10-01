import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { createFantasyLeague, deleteFantasyLeague, findFantasyLeagueByName, findOrCreateFantasyLeague } from "./leagues";

describe("createFantasyLeague", () => {
  it("creates a league", async () => {
    const supabase = createFakeSupabase({ fantasy_leagues: [] });
    const league = await createFantasyLeague(supabase as never, "user-1", {
      name: "2 Fast 2 Fantasy",
      platform: "Sleeper",
      sport: "football",
      season: "2026",
      userTeamName: "My Team",
    });
    expect(league.name).toBe("2 Fast 2 Fantasy");
    expect(league.platform).toBe("Sleeper");
  });
});

describe("findOrCreateFantasyLeague", () => {
  it("returns the existing league by name instead of creating a duplicate", async () => {
    const supabase = createFakeSupabase({
      fantasy_leagues: [
        { id: "league-1", user_id: "user-1", name: "2 Fast 2 Fantasy", platform: null, sport: "football", season: "2026", user_team_name: null },
      ],
    });
    const found = await findFantasyLeagueByName(supabase as never, "user-1", "2 Fast 2 Fantasy");
    expect(found?.id).toBe("league-1");

    const league = await findOrCreateFantasyLeague(supabase as never, "user-1", {
      name: "2 Fast 2 Fantasy",
      sport: "football",
      season: "2026",
    });
    expect(league.id).toBe("league-1");
    expect(supabase.tables.fantasy_leagues).toHaveLength(1);
  });

  it("creates a new league when none exists by that name", async () => {
    const supabase = createFakeSupabase({ fantasy_leagues: [] });
    const league = await findOrCreateFantasyLeague(supabase as never, "user-1", {
      name: "Brand New League",
      sport: "football",
      season: "2026",
    });
    expect(league.name).toBe("Brand New League");
    expect(supabase.tables.fantasy_leagues).toHaveLength(1);
  });
});

describe("deleteFantasyLeague", () => {
  it("cascades to its matchups and their roster slots (docs/PRD.md section 63.1)", async () => {
    const supabase = createFakeSupabase({
      fantasy_leagues: [{ id: "league-1", user_id: "user-1" }],
      fantasy_matchups: [
        { id: "matchup-1", fantasy_league_id: "league-1" },
        { id: "matchup-2", fantasy_league_id: "league-1" },
        { id: "matchup-other", fantasy_league_id: "league-other" },
      ],
      fantasy_roster_slots: [
        { id: "slot-1", fantasy_matchup_id: "matchup-1" },
        { id: "slot-2", fantasy_matchup_id: "matchup-2" },
        { id: "slot-other", fantasy_matchup_id: "matchup-other" },
      ],
    });

    await deleteFantasyLeague(supabase as never, "league-1");

    expect(supabase.tables.fantasy_leagues).toHaveLength(0);
    expect(supabase.tables.fantasy_matchups.map((m) => m.id)).toEqual(["matchup-other"]);
    expect(supabase.tables.fantasy_roster_slots.map((s) => s.id)).toEqual(["slot-other"]);
  });

  it("deletes a league with no matchups", async () => {
    const supabase = createFakeSupabase({
      fantasy_leagues: [{ id: "league-1" }],
      fantasy_matchups: [],
      fantasy_roster_slots: [],
    });
    await deleteFantasyLeague(supabase as never, "league-1");
    expect(supabase.tables.fantasy_leagues).toHaveLength(0);
  });
});
