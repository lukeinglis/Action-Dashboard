import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { createFantasyMatchup, deleteFantasyMatchup, markFantasyMatchupFinal } from "./matchups";

describe("createFantasyMatchup", () => {
  it("creates a matchup with status upcoming and an appended sortKey", async () => {
    const supabase = createFakeSupabase({ fantasy_matchups: [] });
    const matchup = await createFantasyMatchup(supabase as never, "user-1", {
      fantasyLeagueId: "league-1",
      week: 3,
      userTeamName: "My Team",
      opponentTeamName: "Team DanCantDraft",
    });
    expect(matchup.status).toBe("upcoming");
    expect(matchup.sortKey).toBeTruthy();
  });
});

describe("markFantasyMatchupFinal", () => {
  it("sets status to final and stamps finalizedAt; never changes automatically", async () => {
    const supabase = createFakeSupabase({
      fantasy_matchups: [{ id: "matchup-1", status: "live", finalized_at: null }],
    });
    await markFantasyMatchupFinal(supabase as never, "matchup-1");
    expect(supabase.tables.fantasy_matchups[0].status).toBe("final");
    expect(supabase.tables.fantasy_matchups[0].finalized_at).toBeTruthy();
  });
});

describe("deleteFantasyMatchup", () => {
  it("cascades to its roster slots (docs/PRD.md section 63.1)", async () => {
    const supabase = createFakeSupabase({
      fantasy_matchups: [{ id: "matchup-1" }, { id: "matchup-2" }],
      fantasy_roster_slots: [
        { id: "slot-1", fantasy_matchup_id: "matchup-1" },
        { id: "slot-2", fantasy_matchup_id: "matchup-1" },
        { id: "slot-other", fantasy_matchup_id: "matchup-2" },
      ],
    });

    await deleteFantasyMatchup(supabase as never, "matchup-1");

    expect(supabase.tables.fantasy_matchups.map((m) => m.id)).toEqual(["matchup-2"]);
    expect(supabase.tables.fantasy_roster_slots.map((s) => s.id)).toEqual(["slot-other"]);
  });
});
