import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import {
  approveImportRecord,
  createImportRecord,
  deleteImportRecord,
  listPendingImportRecords,
  rejectImportRecord,
} from "./import-records";

describe("createImportRecord", () => {
  it("creates a screenshot ImportRecord with status uploaded", async () => {
    const supabase = createFakeSupabase({ import_records: [] });

    const record = await createImportRecord(supabase as never, "user-1", {
      source: "screenshot",
      originalFilename: "bet.jpg",
      storagePath: "user-1/abc.jpg",
    });

    expect(record.status).toBe("uploaded");
    expect(record.storagePath).toBe("user-1/abc.jpg");
  });
});

describe("listPendingImportRecords", () => {
  it("excludes approved and rejected records and sorts newest first", async () => {
    const supabase = createFakeSupabase({
      import_records: [
        { id: "r1", user_id: "user-1", status: "uploaded", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "r2", user_id: "user-1", status: "approved", created_at: "2026-01-02T00:00:00.000Z" },
        { id: "r3", user_id: "user-1", status: "needs_review", created_at: "2026-01-03T00:00:00.000Z" },
        { id: "r4", user_id: "user-1", status: "rejected", created_at: "2026-01-04T00:00:00.000Z" },
      ],
    });

    const pending = await listPendingImportRecords(supabase as never, "user-1");

    expect(pending.map((r) => r.id)).toEqual(["r3", "r1"]);
  });
});

describe("approveImportRecord / rejectImportRecord", () => {
  it("approving sets status and approvedAt, and clears storagePath", async () => {
    const supabase = createFakeSupabase({
      import_records: [{ id: "r1", status: "uploaded", storage_path: "user-1/abc.jpg", approved_at: null }],
    });

    await approveImportRecord(supabase as never, "r1");

    const row = supabase.tables.import_records[0];
    expect(row.status).toBe("approved");
    expect(row.approved_at).toBeTruthy();
    expect(row.storage_path).toBeNull();
  });

  it("rejecting sets status and clears storagePath", async () => {
    const supabase = createFakeSupabase({
      import_records: [{ id: "r1", status: "uploaded", storage_path: "user-1/abc.jpg" }],
    });

    await rejectImportRecord(supabase as never, "r1");

    const row = supabase.tables.import_records[0];
    expect(row.status).toBe("rejected");
    expect(row.storage_path).toBeNull();
  });
});

describe("deleteImportRecord", () => {
  it("nulls importRecordId on created Tickets but leaves them in place", async () => {
    const supabase = createFakeSupabase({
      import_records: [{ id: "r1" }],
      tickets: [
        { id: "t1", import_record_id: "r1" },
        { id: "t2", import_record_id: "other" },
      ],
    });

    await deleteImportRecord(supabase as never, "r1");

    expect(supabase.tables.import_records).toHaveLength(0);
    expect(supabase.tables.tickets.find((t) => t.id === "t1")?.import_record_id).toBeNull();
    expect(supabase.tables.tickets.find((t) => t.id === "t2")?.import_record_id).toBe("other");
  });
});
