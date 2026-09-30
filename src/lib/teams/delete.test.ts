import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { deleteTeam, TeamLinkedError } from "./delete";

describe("deleteTeam", () => {
  it("deletes a Team with no links", async () => {
    const supabase = createFakeSupabase({
      teams: [{ id: "t1" }],
      events: [],
      participants: [],
      bet_leg_subjects: [],
    });

    await deleteTeam(supabase as never, "t1");

    expect(supabase.tables.teams).toHaveLength(0);
  });

  it("is blocked when the Team is a home team on an Event", async () => {
    const supabase = createFakeSupabase({
      teams: [{ id: "t1" }],
      events: [{ id: "e1", home_team_id: "t1", away_team_id: null }],
      participants: [],
      bet_leg_subjects: [],
    });

    await expect(deleteTeam(supabase as never, "t1")).rejects.toThrow(TeamLinkedError);
    expect(supabase.tables.teams).toHaveLength(1);
  });

  it("is blocked when a Participant belongs to the Team", async () => {
    const supabase = createFakeSupabase({
      teams: [{ id: "t1" }],
      events: [],
      participants: [{ id: "p1", team_id: "t1" }],
      bet_leg_subjects: [],
    });

    await expect(deleteTeam(supabase as never, "t1")).rejects.toThrow(TeamLinkedError);
  });

  it("is blocked when a BetLegSubject references the Team", async () => {
    const supabase = createFakeSupabase({
      teams: [{ id: "t1" }],
      events: [],
      participants: [],
      bet_leg_subjects: [{ id: "s1", team_id: "t1" }],
    });

    await expect(deleteTeam(supabase as never, "t1")).rejects.toThrow(TeamLinkedError);
  });
});
