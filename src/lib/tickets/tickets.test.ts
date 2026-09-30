import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { createTicket, deleteTicket, reorderTicket, setManualTicketStatus, updateTicket } from "./tickets";

function baseInput() {
  return { stakeCents: 1000, toWinCents: 15000, totalReturnCents: 16000 };
}

describe("createTicket", () => {
  it("appends a new sortKey after the user's last ticket", async () => {
    const supabase = createFakeSupabase({
      tickets: [{ id: "t1", user_id: "user-1", sort_key: "i" }],
    });

    const created = await createTicket(supabase as never, "user-1", baseInput());

    expect(created.sortKey > "i").toBe(true);
    expect(created.stakeCents).toBe(1000);
    expect(created.isBonusBet).toBe(false);
    expect(created.tags).toEqual([]);
  });

  it("starts at the alphabet midpoint for a user's first ticket", async () => {
    const supabase = createFakeSupabase({ tickets: [] });
    const created = await createTicket(supabase as never, "user-1", baseInput());
    expect(created.sortKey).toBe("i");
  });
});

describe("updateTicket / setManualTicketStatus", () => {
  it("only writes the fields that were provided", async () => {
    const supabase = createFakeSupabase({
      tickets: [{ id: "t1", name: "Original", notes: "keep me" }],
    });

    await updateTicket(supabase as never, "t1", { name: "Updated" });

    const row = supabase.tables.tickets[0];
    expect(row.name).toBe("Updated");
    expect(row.notes).toBe("keep me");
  });

  it("sets the manual status, which overrides the derived status", async () => {
    const supabase = createFakeSupabase({ tickets: [{ id: "t1", manual_status: null }] });
    await setManualTicketStatus(supabase as never, "t1", "cashed_out");
    expect(supabase.tables.tickets[0].manual_status).toBe("cashed_out");
  });
});

describe("reorderTicket", () => {
  it("writes a single sortKey that sorts strictly between its new neighbors", async () => {
    const supabase = createFakeSupabase({
      tickets: [
        { id: "t1", sort_key: "a" },
        { id: "t2", sort_key: "b" },
        { id: "t3", sort_key: "c" },
      ],
    });

    const newKey = await reorderTicket(supabase as never, "t3", "a", "b");

    expect(newKey > "a").toBe(true);
    expect(newKey < "b").toBe(true);
    expect(supabase.tables.tickets.find((t) => t.id === "t3")?.sort_key).toBe(newKey);
    // Only the moved row changed.
    expect(supabase.tables.tickets.find((t) => t.id === "t1")?.sort_key).toBe("a");
    expect(supabase.tables.tickets.find((t) => t.id === "t2")?.sort_key).toBe("b");
  });
});

describe("deleteTicket", () => {
  it("cascades to its legs and their event and subject links", async () => {
    const supabase = createFakeSupabase({
      tickets: [{ id: "t1" }],
      bet_legs: [
        { id: "leg1", ticket_id: "t1" },
        { id: "leg2", ticket_id: "t1" },
      ],
      bet_leg_events: [{ id: "ble1", bet_leg_id: "leg1", event_id: "e1" }],
      bet_leg_subjects: [{ id: "bls1", bet_leg_id: "leg2", participant_id: "p1" }],
    });

    await deleteTicket(supabase as never, "t1");

    expect(supabase.tables.tickets).toHaveLength(0);
    expect(supabase.tables.bet_legs).toHaveLength(0);
    expect(supabase.tables.bet_leg_events).toHaveLength(0);
    expect(supabase.tables.bet_leg_subjects).toHaveLength(0);
  });

  it("leaves other tickets' legs untouched", async () => {
    const supabase = createFakeSupabase({
      tickets: [{ id: "t1" }, { id: "t2" }],
      bet_legs: [
        { id: "leg1", ticket_id: "t1" },
        { id: "leg2", ticket_id: "t2" },
      ],
    });

    await deleteTicket(supabase as never, "t1");

    expect(supabase.tables.tickets.map((t) => t.id)).toEqual(["t2"]);
    expect(supabase.tables.bet_legs.map((l) => l.id)).toEqual(["leg2"]);
  });
});
