import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { deleteParticipant, ParticipantLinkedError } from "./delete";

describe("deleteParticipant", () => {
  it("deletes a Participant with no links", async () => {
    const supabase = createFakeSupabase({ participants: [{ id: "p1" }], bet_leg_subjects: [] });

    await deleteParticipant(supabase as never, "p1");

    expect(supabase.tables.participants).toHaveLength(0);
  });

  it("is blocked when a BetLegSubject references the Participant", async () => {
    const supabase = createFakeSupabase({
      participants: [{ id: "p1" }],
      bet_leg_subjects: [{ id: "s1", participant_id: "p1" }],
    });

    await expect(deleteParticipant(supabase as never, "p1")).rejects.toThrow(ParticipantLinkedError);
    expect(supabase.tables.participants).toHaveLength(1);
  });
});
