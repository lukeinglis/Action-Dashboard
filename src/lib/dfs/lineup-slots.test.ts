import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { createDfsLineupSlot, setManualLineupSlotPoints } from "./lineup-slots";

describe("createDfsLineupSlot", () => {
  it("creates a slot", async () => {
    const supabase = createFakeSupabase({ dfs_lineup_slots: [] });
    const slot = await createDfsLineupSlot(supabase as never, "user-1", {
      dfsLineupId: "lineup-1",
      slot: "QB",
      playerName: "Josh Allen",
      salary: 8200,
    });
    expect(slot.slot).toBe("QB");
    expect(slot.salary).toBe(8200);
  });
});

describe("setManualLineupSlotPoints", () => {
  it("sets a manual override and stamps manualSetAt (docs/PRD.md section 45)", async () => {
    const supabase = createFakeSupabase({
      dfs_lineup_slots: [{ id: "slot-1", manual_actual_points: null, manual_set_at: null }],
    });
    await setManualLineupSlotPoints(supabase as never, "slot-1", 18.2);
    expect(supabase.tables.dfs_lineup_slots[0].manual_actual_points).toBe(18.2);
    expect(supabase.tables.dfs_lineup_slots[0].manual_set_at).toBeTruthy();
  });
});
