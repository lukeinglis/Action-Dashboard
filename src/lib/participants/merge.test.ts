import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { mergeParticipantInto } from "./merge";

describe("mergeParticipantInto", () => {
  it("throws when merging a Participant into itself", async () => {
    const supabase = createFakeSupabase({ bet_leg_subjects: [], provider_mappings: [] });
    await expect(mergeParticipantInto(supabase as never, "p1", "p1")).rejects.toThrow(
      "Cannot merge a Participant into itself",
    );
  });

  it("moves a BetLegSubject to the target when the target has none for that leg", async () => {
    const supabase = createFakeSupabase({
      bet_leg_subjects: [{ id: "s1", bet_leg_id: "leg1", participant_id: "source" }],
      provider_mappings: [],
    });

    await mergeParticipantInto(supabase as never, "source", "target");

    expect(supabase.tables.bet_leg_subjects[0].participant_id).toBe("target");
  });

  it("drops a duplicate BetLegSubject when the target already has one for the same leg", async () => {
    const supabase = createFakeSupabase({
      bet_leg_subjects: [
        { id: "s-source", bet_leg_id: "leg1", participant_id: "source" },
        { id: "s-target", bet_leg_id: "leg1", participant_id: "target" },
      ],
      provider_mappings: [],
    });

    await mergeParticipantInto(supabase as never, "source", "target");

    expect(supabase.tables.bet_leg_subjects.map((s) => s.id)).toEqual(["s-target"]);
  });

  it("deletes the source Participant after merging", async () => {
    const supabase = createFakeSupabase({
      bet_leg_subjects: [],
      provider_mappings: [],
      participants: [{ id: "source" }, { id: "target" }],
    });

    await mergeParticipantInto(supabase as never, "source", "target");

    expect(supabase.tables.participants.map((p) => p.id)).toEqual(["target"]);
  });
});
