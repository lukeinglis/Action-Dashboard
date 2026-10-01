import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { createFantasyRosterSlot, setManualRosterSlotPoints } from "./roster-slots";

describe("createFantasyRosterSlot", () => {
  it("creates a starter slot", async () => {
    const supabase = createFakeSupabase({ fantasy_roster_slots: [] });
    const slot = await createFantasyRosterSlot(supabase as never, "user-1", {
      fantasyMatchupId: "matchup-1",
      side: "user",
      slot: "WR",
      playerName: "Emeka Egbuka",
    });
    expect(slot.side).toBe("user");
    expect(slot.playerName).toBe("Emeka Egbuka");
  });
});

describe("setManualRosterSlotPoints", () => {
  it("sets a manual override and stamps manualSetAt (docs/PRD.md section 45)", async () => {
    const supabase = createFakeSupabase({
      fantasy_roster_slots: [{ id: "slot-1", manual_actual_points: null, manual_set_at: null }],
    });
    await setManualRosterSlotPoints(supabase as never, "slot-1", 24.5);
    expect(supabase.tables.fantasy_roster_slots[0].manual_actual_points).toBe(24.5);
    expect(supabase.tables.fantasy_roster_slots[0].manual_set_at).toBeTruthy();
  });
});
