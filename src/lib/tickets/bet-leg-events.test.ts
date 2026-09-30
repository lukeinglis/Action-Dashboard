import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { isLegLive, linkBetLegEvent, nextEvent, unlinkBetLegEvent } from "./bet-leg-events";

describe("linkBetLegEvent", () => {
  it("lets a leg link to two Events (e.g. a same-game parlay across events)", async () => {
    const supabase = createFakeSupabase({ bet_leg_events: [] });

    await linkBetLegEvent(supabase as never, "user-1", "leg1", "e1", "manual");
    await linkBetLegEvent(supabase as never, "user-1", "leg1", "e2", "manual");

    const links = supabase.tables.bet_leg_events.filter((l) => l.bet_leg_id === "leg1");
    expect(links.map((l) => l.event_id).sort()).toEqual(["e1", "e2"]);
  });

  it("is a no-op when the (betLegId, eventId) pair is already linked", async () => {
    const supabase = createFakeSupabase({ bet_leg_events: [] });

    await linkBetLegEvent(supabase as never, "user-1", "leg1", "e1", "manual");
    await linkBetLegEvent(supabase as never, "user-1", "leg1", "e1", "manual");

    expect(supabase.tables.bet_leg_events).toHaveLength(1);
  });

  it("automatic matching never overwrites a manual link", async () => {
    const supabase = createFakeSupabase({
      bet_leg_events: [{ id: "ble1", bet_leg_id: "leg1", event_id: "e1", match_method: "manual" }],
    });

    const result = await linkBetLegEvent(supabase as never, "user-1", "leg1", "e2", "auto");

    expect(result).toBeNull();
    expect(supabase.tables.bet_leg_events).toHaveLength(1);
    expect(supabase.tables.bet_leg_events[0].event_id).toBe("e1");
  });

  it("allows automatic linking when no manual link exists on the leg", async () => {
    const supabase = createFakeSupabase({ bet_leg_events: [] });

    await linkBetLegEvent(supabase as never, "user-1", "leg1", "e1", "auto");

    expect(supabase.tables.bet_leg_events).toHaveLength(1);
    expect(supabase.tables.bet_leg_events[0].match_method).toBe("auto");
  });
});

describe("unlinkBetLegEvent", () => {
  it("removes the link row", async () => {
    const supabase = createFakeSupabase({
      bet_leg_events: [{ id: "ble1", bet_leg_id: "leg1", event_id: "e1" }],
    });

    await unlinkBetLegEvent(supabase as never, "ble1");

    expect(supabase.tables.bet_leg_events).toHaveLength(0);
  });
});

describe("isLegLive", () => {
  it("is true when the leg is open and a linked Event is in_progress", () => {
    expect(isLegLive("open", ["scheduled", "in_progress"])).toBe(true);
  });

  it("is false once the leg has settled, even with a live linked Event", () => {
    expect(isLegLive("won", ["in_progress"])).toBe(false);
  });

  it("is false when no linked Event is in_progress", () => {
    expect(isLegLive("open", ["scheduled", "final"])).toBe(false);
  });
});

describe("nextEvent", () => {
  it("returns the earliest-starting Event", () => {
    const events = [
      { id: "e2", startTimeUtc: "2026-10-12T20:00:00.000Z" },
      { id: "e1", startTimeUtc: "2026-10-12T17:00:00.000Z" },
    ];
    expect(nextEvent(events)?.id).toBe("e1");
  });

  it("ignores candidates with no start time", () => {
    const events = [{ id: "e1", startTimeUtc: null }, { id: "e2", startTimeUtc: "2026-10-12T17:00:00.000Z" }];
    expect(nextEvent(events)?.id).toBe("e2");
  });

  it("returns null when there are no candidates", () => {
    expect(nextEvent([])).toBeNull();
  });
});
