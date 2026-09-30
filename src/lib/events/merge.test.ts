import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { mergeEventInto } from "./merge";

describe("mergeEventInto", () => {
  it("throws when merging an Event into itself", async () => {
    const supabase = createFakeSupabase({ events: [], provider_mappings: [] });
    await expect(mergeEventInto(supabase as never, "e1", "e1")).rejects.toThrow(
      "Cannot merge an Event into itself",
    );
  });

  it("moves the source's provider mappings to the target when the target has none for that provider", async () => {
    const supabase = createFakeSupabase({
      events: [
        { id: "source", is_pinned: false },
        { id: "target", is_pinned: false },
      ],
      provider_mappings: [
        { id: "m1", entity_type: "event", entity_id: "source", provider_key: "espn" },
      ],
    });

    await mergeEventInto(supabase as never, "source", "target");

    const mapping = supabase.tables.provider_mappings.find((m) => m.id === "m1");
    expect(mapping?.entity_id).toBe("target");
  });

  it("drops the source's mapping when the target already has one for that provider", async () => {
    const supabase = createFakeSupabase({
      events: [
        { id: "source", is_pinned: false },
        { id: "target", is_pinned: false },
      ],
      provider_mappings: [
        { id: "m-source", entity_type: "event", entity_id: "source", provider_key: "espn" },
        { id: "m-target", entity_type: "event", entity_id: "target", provider_key: "espn" },
      ],
    });

    await mergeEventInto(supabase as never, "source", "target");

    const remaining = supabase.tables.provider_mappings.map((m) => m.id);
    expect(remaining).toEqual(["m-target"]);
  });

  it("transfers isPinned from source to target when the source was pinned", async () => {
    const supabase = createFakeSupabase({
      events: [
        { id: "source", is_pinned: true },
        { id: "target", is_pinned: false },
      ],
      provider_mappings: [],
    });

    await mergeEventInto(supabase as never, "source", "target");

    const target = supabase.tables.events.find((e) => e.id === "target");
    expect(target?.is_pinned).toBe(true);
  });

  it("deletes the source Event after merging", async () => {
    const supabase = createFakeSupabase({
      events: [
        { id: "source", is_pinned: false },
        { id: "target", is_pinned: false },
      ],
      provider_mappings: [],
    });

    await mergeEventInto(supabase as never, "source", "target");

    const ids = supabase.tables.events.map((e) => e.id);
    expect(ids).toEqual(["target"]);
  });

  it("moves a bet_leg_events link to the target when the target has none for that leg", async () => {
    const supabase = createFakeSupabase({
      events: [
        { id: "source", is_pinned: false },
        { id: "target", is_pinned: false },
      ],
      provider_mappings: [],
      bet_leg_events: [{ id: "ble1", bet_leg_id: "leg1", event_id: "source" }],
    });

    await mergeEventInto(supabase as never, "source", "target");

    expect(supabase.tables.bet_leg_events[0].event_id).toBe("target");
  });

  it("drops a duplicate bet_leg_events link when the target already has one for the same leg", async () => {
    const supabase = createFakeSupabase({
      events: [
        { id: "source", is_pinned: false },
        { id: "target", is_pinned: false },
      ],
      provider_mappings: [],
      bet_leg_events: [
        { id: "ble-source", bet_leg_id: "leg1", event_id: "source" },
        { id: "ble-target", bet_leg_id: "leg1", event_id: "target" },
      ],
    });

    await mergeEventInto(supabase as never, "source", "target");

    expect(supabase.tables.bet_leg_events.map((l) => l.id)).toEqual(["ble-target"]);
  });
});
