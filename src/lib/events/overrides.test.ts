import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/types/domain";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import {
  applyAutomaticUpdate,
  clearAllOverrides,
  displayedAwayScore,
  displayedHomeScore,
  hasManualOverride,
  isOverrideStale,
  returnFieldToAutomatic,
  setManualOverride,
} from "./overrides";

function baseEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    userId: "user-1",
    sport: "nfl",
    name: "MIN @ TB",
    startTimeTbd: false,
    source: "manual",
    isPinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("displayed values", () => {
  it("prefers the manual value over the automatic value", () => {
    const event = baseEvent({ manualHomeScore: 21, automaticHomeScore: 14 });
    expect(displayedHomeScore(event)).toBe(21);
  });

  it("falls back to the automatic value when no manual value is set", () => {
    const event = baseEvent({ automaticAwayScore: 7 });
    expect(displayedAwayScore(event)).toBe(7);
  });

  it("returns null when neither value is set", () => {
    expect(displayedHomeScore(baseEvent())).toBeNull();
  });
});

describe("hasManualOverride", () => {
  it("is false with no manual fields set", () => {
    expect(hasManualOverride(baseEvent())).toBe(false);
  });

  it("is true when any manual field is set", () => {
    expect(hasManualOverride(baseEvent({ manualClock: "2:00" }))).toBe(true);
  });
});

describe("isOverrideStale", () => {
  it("is false with no override", () => {
    expect(isOverrideStale(baseEvent())).toBe(false);
  });

  it("is false when the automatic value hasn't changed since the override", () => {
    const event = baseEvent({
      manualHomeScore: 21,
      manualSetAt: "2026-01-01T12:00:00.000Z",
      automaticChangedAt: "2026-01-01T10:00:00.000Z",
    });
    expect(isOverrideStale(event)).toBe(false);
  });

  it("is true when a newer automatic value arrived after the override was set", () => {
    const event = baseEvent({
      manualHomeScore: 21,
      manualSetAt: "2026-01-01T10:00:00.000Z",
      automaticChangedAt: "2026-01-01T12:00:00.000Z",
    });
    expect(isOverrideStale(event)).toBe(true);
  });
});

describe("setManualOverride / returnFieldToAutomatic / clearAllOverrides", () => {
  it("stamps manualSetAt and writes the given fields", async () => {
    const supabase = createFakeSupabase({
      events: [{ id: "event-1", manual_home_score: null, manual_away_score: null }],
    });

    await setManualOverride(supabase as never, "event-1", { homeScore: 21, awayScore: 17 });

    const row = supabase.tables.events[0];
    expect(row.manual_home_score).toBe(21);
    expect(row.manual_away_score).toBe(17);
    expect(row.manual_set_at).toBeTruthy();
  });

  it("returnFieldToAutomatic clears only the given field, keeping manualSetAt if others remain", async () => {
    const supabase = createFakeSupabase({
      events: [
        {
          id: "event-1",
          manual_status: null,
          manual_home_score: 21,
          manual_away_score: 17,
          manual_period: null,
          manual_clock: null,
          manual_set_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await returnFieldToAutomatic(supabase as never, "event-1", "homeScore");

    const row = supabase.tables.events[0];
    expect(row.manual_home_score).toBeNull();
    expect(row.manual_away_score).toBe(17);
    expect(row.manual_set_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returnFieldToAutomatic clears manualSetAt once no manual fields remain", async () => {
    const supabase = createFakeSupabase({
      events: [
        {
          id: "event-1",
          manual_status: null,
          manual_home_score: 21,
          manual_away_score: null,
          manual_period: null,
          manual_clock: null,
          manual_set_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await returnFieldToAutomatic(supabase as never, "event-1", "homeScore");

    const row = supabase.tables.events[0];
    expect(row.manual_home_score).toBeNull();
    expect(row.manual_set_at).toBeNull();
  });

  it("clearAllOverrides nulls every manual field and manualSetAt", async () => {
    const supabase = createFakeSupabase({
      events: [
        {
          id: "event-1",
          manual_status: "final",
          manual_home_score: 21,
          manual_away_score: 17,
          manual_period: "4",
          manual_clock: "0:00",
          manual_set_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await clearAllOverrides(supabase as never, "event-1");

    const row = supabase.tables.events[0];
    expect(row.manual_status).toBeNull();
    expect(row.manual_home_score).toBeNull();
    expect(row.manual_away_score).toBeNull();
    expect(row.manual_period).toBeNull();
    expect(row.manual_clock).toBeNull();
    expect(row.manual_set_at).toBeNull();
  });
});

describe("applyAutomaticUpdate", () => {
  it("stamps automaticChangedAt when a value actually changes", async () => {
    const supabase = createFakeSupabase({
      events: [
        {
          id: "event-1",
          automatic_status: null,
          automatic_home_score: 14,
          automatic_away_score: 7,
          automatic_period: null,
          automatic_clock: null,
          automatic_changed_at: null,
        },
      ],
    });

    await applyAutomaticUpdate(supabase as never, "event-1", { homeScore: 21 });

    const row = supabase.tables.events[0];
    expect(row.automatic_home_score).toBe(21);
    expect(row.automatic_changed_at).toBeTruthy();
  });

  it("does not stamp automaticChangedAt when nothing changed", async () => {
    const supabase = createFakeSupabase({
      events: [
        {
          id: "event-1",
          automatic_status: null,
          automatic_home_score: 21,
          automatic_away_score: 7,
          automatic_period: null,
          automatic_clock: null,
          automatic_changed_at: null,
        },
      ],
    });

    await applyAutomaticUpdate(supabase as never, "event-1", { homeScore: 21 });

    const row = supabase.tables.events[0];
    expect(row.automatic_changed_at).toBeNull();
  });

  it("never touches manual fields", async () => {
    const supabase = createFakeSupabase({
      events: [
        {
          id: "event-1",
          automatic_home_score: 14,
          automatic_away_score: 7,
          manual_home_score: 21,
          manual_away_score: 17,
        },
      ],
    });

    await applyAutomaticUpdate(supabase as never, "event-1", { homeScore: 24 });

    const row = supabase.tables.events[0];
    expect(row.manual_home_score).toBe(21);
    expect(row.manual_away_score).toBe(17);
  });
});
