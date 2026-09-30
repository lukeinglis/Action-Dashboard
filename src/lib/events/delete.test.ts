import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { deleteEvent, EventLinkedError, unlinkAllEventLinks } from "./delete";

describe("deleteEvent", () => {
  it("deletes an Event with no linked BetLegs", async () => {
    const supabase = createFakeSupabase({ events: [{ id: "e1" }], bet_leg_events: [] });

    await deleteEvent(supabase as never, "e1");

    expect(supabase.tables.events).toHaveLength(0);
  });

  it("is blocked when a BetLeg links to the Event", async () => {
    const supabase = createFakeSupabase({
      events: [{ id: "e1" }],
      bet_leg_events: [{ id: "ble1", event_id: "e1" }],
    });

    await expect(deleteEvent(supabase as never, "e1")).rejects.toThrow(EventLinkedError);
    expect(supabase.tables.events).toHaveLength(1);
  });
});

describe("unlinkAllEventLinks", () => {
  it("removes every BetLeg link to the Event, clearing the way to delete it", async () => {
    const supabase = createFakeSupabase({
      events: [{ id: "e1" }, { id: "e2" }],
      bet_leg_events: [
        { id: "ble1", event_id: "e1" },
        { id: "ble2", event_id: "e1" },
        { id: "ble3", event_id: "e2" },
      ],
    });

    await unlinkAllEventLinks(supabase as never, "e1");
    await deleteEvent(supabase as never, "e1");

    expect(supabase.tables.events.map((e) => e.id)).toEqual(["e2"]);
    expect(supabase.tables.bet_leg_events.map((l) => l.id)).toEqual(["ble3"]);
  });
});
