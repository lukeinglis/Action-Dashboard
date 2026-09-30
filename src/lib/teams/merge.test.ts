import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { mergeTeamInto } from "./merge";

describe("mergeTeamInto", () => {
  it("throws when merging a Team into itself", async () => {
    const supabase = createFakeSupabase({ events: [], participants: [], bet_leg_subjects: [], provider_mappings: [] });
    await expect(mergeTeamInto(supabase as never, "t1", "t1")).rejects.toThrow(
      "Cannot merge a Team into itself",
    );
  });

  it("repoints home and away Event references to the target", async () => {
    const supabase = createFakeSupabase({
      events: [
        { id: "e1", home_team_id: "source", away_team_id: "other" },
        { id: "e2", home_team_id: "other", away_team_id: "source" },
      ],
      participants: [],
      bet_leg_subjects: [],
      provider_mappings: [],
    });

    await mergeTeamInto(supabase as never, "source", "target");

    expect(supabase.tables.events.find((e) => e.id === "e1")?.home_team_id).toBe("target");
    expect(supabase.tables.events.find((e) => e.id === "e2")?.away_team_id).toBe("target");
  });

  it("moves Participants to the target Team", async () => {
    const supabase = createFakeSupabase({
      events: [],
      participants: [{ id: "p1", team_id: "source" }],
      bet_leg_subjects: [],
      provider_mappings: [],
    });

    await mergeTeamInto(supabase as never, "source", "target");

    expect(supabase.tables.participants[0].team_id).toBe("target");
  });

  it("drops a duplicate BetLegSubject when the target already has one for the same leg", async () => {
    const supabase = createFakeSupabase({
      events: [],
      participants: [],
      bet_leg_subjects: [
        { id: "s-source", bet_leg_id: "leg1", team_id: "source" },
        { id: "s-target", bet_leg_id: "leg1", team_id: "target" },
      ],
      provider_mappings: [],
    });

    await mergeTeamInto(supabase as never, "source", "target");

    expect(supabase.tables.bet_leg_subjects.map((s) => s.id)).toEqual(["s-target"]);
  });

  it("deletes the source Team after merging", async () => {
    const supabase = createFakeSupabase({
      events: [],
      participants: [],
      bet_leg_subjects: [],
      provider_mappings: [],
      teams: [{ id: "source" }, { id: "target" }],
    });

    await mergeTeamInto(supabase as never, "source", "target");

    expect(supabase.tables.teams.map((t) => t.id)).toEqual(["target"]);
  });
});
