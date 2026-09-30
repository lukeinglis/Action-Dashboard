import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { removeBetLegSubject, setBetLegSubject, setManualSubjectDirection } from "./bet-leg-subjects";

describe("setBetLegSubject", () => {
  it("creates a new subject with the proposed direction, sourced auto", async () => {
    const supabase = createFakeSupabase({ bet_leg_subjects: [] });

    const subject = await setBetLegSubject(supabase as never, "user-1", {
      betLegId: "leg1",
      teamId: "team1",
      proposedDirection: "for",
      matchMethod: "manual",
    });

    expect(subject.direction).toBe("for");
    expect(subject.directionSource).toBe("auto");
    expect(subject.teamId).toBe("team1");
    expect(subject.participantId).toBeNull();
  });

  it("rejects a subject with both a participant and a team, or neither", async () => {
    const supabase = createFakeSupabase({ bet_leg_subjects: [] });

    await expect(
      setBetLegSubject(supabase as never, "user-1", {
        betLegId: "leg1",
        participantId: "p1",
        teamId: "team1",
        proposedDirection: "for",
        matchMethod: "manual",
      }),
    ).rejects.toThrow();

    await expect(
      setBetLegSubject(supabase as never, "user-1", {
        betLegId: "leg1",
        proposedDirection: "for",
        matchMethod: "manual",
      }),
    ).rejects.toThrow();
  });

  it("replaces an auto direction with a fresh proposal on re-matching", async () => {
    const supabase = createFakeSupabase({
      bet_leg_subjects: [
        {
          id: "s1",
          bet_leg_id: "leg1",
          team_id: "team1",
          participant_id: null,
          direction: "against",
          direction_source: "auto",
        },
      ],
    });

    const updated = await setBetLegSubject(supabase as never, "user-1", {
      betLegId: "leg1",
      teamId: "team1",
      proposedDirection: "for",
      matchMethod: "auto",
    });

    expect(updated.direction).toBe("for");
    expect(updated.directionSource).toBe("auto");
    expect(supabase.tables.bet_leg_subjects).toHaveLength(1);
  });

  it("a manually-edited direction survives re-matching", async () => {
    const supabase = createFakeSupabase({
      bet_leg_subjects: [
        {
          id: "s1",
          bet_leg_id: "leg1",
          team_id: "team1",
          participant_id: null,
          direction: "neutral",
          direction_source: "manual",
        },
      ],
    });

    const updated = await setBetLegSubject(supabase as never, "user-1", {
      betLegId: "leg1",
      teamId: "team1",
      proposedDirection: "for",
      matchMethod: "auto",
    });

    expect(updated.direction).toBe("neutral");
    expect(updated.directionSource).toBe("manual");
  });
});

describe("setManualSubjectDirection / removeBetLegSubject", () => {
  it("sets the direction and marks it manual", async () => {
    const supabase = createFakeSupabase({
      bet_leg_subjects: [{ id: "s1", direction: "for", direction_source: "auto" }],
    });

    await setManualSubjectDirection(supabase as never, "s1", "against");

    expect(supabase.tables.bet_leg_subjects[0].direction).toBe("against");
    expect(supabase.tables.bet_leg_subjects[0].direction_source).toBe("manual");
  });

  it("removes a subject link", async () => {
    const supabase = createFakeSupabase({ bet_leg_subjects: [{ id: "s1" }] });
    await removeBetLegSubject(supabase as never, "s1");
    expect(supabase.tables.bet_leg_subjects).toHaveLength(0);
  });
});
