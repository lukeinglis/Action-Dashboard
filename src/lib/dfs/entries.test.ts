import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { createDfsEntry, deleteDfsEntry, markDfsEntryFinal } from "./entries";

describe("createDfsEntry", () => {
  it("creates an entry with status upcoming and an appended sortKey", async () => {
    const supabase = createFakeSupabase({ dfs_entries: [] });
    const entry = await createDfsEntry(supabase as never, "user-1", {
      dfsLineupId: "lineup-1",
      contestName: "Millionaire Maker",
      entryFeeCents: 2000,
    });
    expect(entry.status).toBe("upcoming");
    expect(entry.sortKey).toBeTruthy();
  });
});

describe("markDfsEntryFinal", () => {
  it("sets status to final and stamps finalizedAt; never changes automatically", async () => {
    const supabase = createFakeSupabase({ dfs_entries: [{ id: "entry-1", status: "live", finalized_at: null }] });
    await markDfsEntryFinal(supabase as never, "entry-1");
    expect(supabase.tables.dfs_entries[0].status).toBe("final");
    expect(supabase.tables.dfs_entries[0].finalized_at).toBeTruthy();
  });
});

describe("deleteDfsEntry", () => {
  it("removes the entry only and signals the lineup is still used by other entries (docs/PRD.md section 63.1)", async () => {
    const supabase = createFakeSupabase({
      dfs_entries: [
        { id: "entry-1", dfs_lineup_id: "lineup-1" },
        { id: "entry-2", dfs_lineup_id: "lineup-1" },
      ],
    });

    const result = await deleteDfsEntry(supabase as never, "entry-1");

    expect(result).toEqual({ lineupId: "lineup-1", lineupHasOtherEntries: true });
    expect(supabase.tables.dfs_entries.map((e) => e.id)).toEqual(["entry-2"]);
  });

  it("signals the lineup has no remaining entries so the caller can offer to delete it too", async () => {
    const supabase = createFakeSupabase({
      dfs_entries: [{ id: "entry-1", dfs_lineup_id: "lineup-1" }],
    });

    const result = await deleteDfsEntry(supabase as never, "entry-1");

    expect(result).toEqual({ lineupId: "lineup-1", lineupHasOtherEntries: false });
    expect(supabase.tables.dfs_entries).toHaveLength(0);
  });
});
