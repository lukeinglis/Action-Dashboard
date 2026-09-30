import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { createBetLeg, deleteBetLeg, setManualLegStatus, updateBetLeg } from "./bet-legs";

describe("createBetLeg", () => {
  it("saves a leg with no linked Event (futures/season-long bets)", async () => {
    const supabase = createFakeSupabase({ bet_legs: [] });

    const leg = await createBetLeg(supabase as never, "user-1", {
      ticketId: "t1",
      sport: "nfl",
      marketType: "season_future",
      selection: "Vikings to win Super Bowl",
    });

    expect(leg.ticketId).toBe("t1");
    expect(leg.marketType).toBe("season_future");
    expect(supabase.tables.bet_legs).toHaveLength(1);
  });
});

describe("updateBetLeg / setManualLegStatus", () => {
  it("only writes the fields that were provided", async () => {
    const supabase = createFakeSupabase({
      bet_legs: [{ id: "leg1", selection: "Over", notes: "keep me" }],
    });

    await updateBetLeg(supabase as never, "leg1", { selection: "Under" });

    const row = supabase.tables.bet_legs[0];
    expect(row.selection).toBe("Under");
    expect(row.notes).toBe("keep me");
  });

  it("stamps manualSetAt when setting a manual status and clears it when returned to automatic", async () => {
    const supabase = createFakeSupabase({ bet_legs: [{ id: "leg1" }] });

    await setManualLegStatus(supabase as never, "leg1", "won");
    expect(supabase.tables.bet_legs[0].manual_status).toBe("won");
    expect(supabase.tables.bet_legs[0].manual_set_at).toBeTruthy();

    await setManualLegStatus(supabase as never, "leg1", null);
    expect(supabase.tables.bet_legs[0].manual_status).toBeNull();
    expect(supabase.tables.bet_legs[0].manual_set_at).toBeNull();
  });
});

describe("deleteBetLeg", () => {
  it("cascades to its event and subject links, leaving the ticket and other legs alone", async () => {
    const supabase = createFakeSupabase({
      bet_legs: [
        { id: "leg1", ticket_id: "t1" },
        { id: "leg2", ticket_id: "t1" },
      ],
      bet_leg_events: [{ id: "ble1", bet_leg_id: "leg1", event_id: "e1" }],
      bet_leg_subjects: [{ id: "bls1", bet_leg_id: "leg1", participant_id: "p1" }],
    });

    await deleteBetLeg(supabase as never, "leg1");

    expect(supabase.tables.bet_legs.map((l) => l.id)).toEqual(["leg2"]);
    expect(supabase.tables.bet_leg_events).toHaveLength(0);
    expect(supabase.tables.bet_leg_subjects).toHaveLength(0);
  });
});
