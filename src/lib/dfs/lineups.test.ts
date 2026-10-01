import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { createDfsLineup, deleteDfsLineup, DfsLineupLinkedError } from "./lineups";

describe("createDfsLineup", () => {
  it("creates a lineup", async () => {
    const supabase = createFakeSupabase({ dfs_lineups: [] });
    const lineup = await createDfsLineup(supabase as never, "user-1", {
      platform: "DraftKings",
      sport: "football",
      slateName: "Main Slate",
    });
    expect(lineup.platform).toBe("DraftKings");
  });
});

describe("deleteDfsLineup", () => {
  it("is blocked while a DFSEntry references the Lineup (docs/PRD.md section 63.1)", async () => {
    const supabase = createFakeSupabase({
      dfs_lineups: [{ id: "lineup-1" }],
      dfs_entries: [{ id: "entry-1", dfs_lineup_id: "lineup-1" }],
    });

    await expect(deleteDfsLineup(supabase as never, "lineup-1")).rejects.toThrow(DfsLineupLinkedError);
    expect(supabase.tables.dfs_lineups).toHaveLength(1);
  });

  it("cascades to its slots when no entry references it", async () => {
    const supabase = createFakeSupabase({
      dfs_lineups: [{ id: "lineup-1" }],
      dfs_entries: [],
      dfs_lineup_slots: [
        { id: "slot-1", dfs_lineup_id: "lineup-1" },
        { id: "slot-other", dfs_lineup_id: "lineup-2" },
      ],
    });

    await deleteDfsLineup(supabase as never, "lineup-1");

    expect(supabase.tables.dfs_lineups).toHaveLength(0);
    expect(supabase.tables.dfs_lineup_slots.map((s) => s.id)).toEqual(["slot-other"]);
  });
});
