import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { findDuplicateEvents } from "./duplicate-check";

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "existing-1",
    user_id: "user-1",
    sport: "nfl",
    league: null,
    name: "MIN @ TB",
    start_time_utc: "2026-10-12T17:00:00.000Z",
    start_time_tbd: false,
    end_time_utc: null,
    home_team_id: null,
    away_team_id: null,
    source: "manual",
    automatic_status: null,
    automatic_home_score: null,
    automatic_away_score: null,
    automatic_period: null,
    automatic_clock: null,
    automatic_changed_at: null,
    manual_status: null,
    manual_home_score: null,
    manual_away_score: null,
    manual_period: null,
    manual_clock: null,
    manual_set_at: null,
    is_pinned: false,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("findDuplicateEvents", () => {
  it("returns [] when the candidate has no start time", async () => {
    const supabase = createFakeSupabase({ events: [eventRow()] });
    const result = await findDuplicateEvents(
      supabase as never,
      { sport: "nfl", name: "MIN @ TB" },
      "America/New_York",
    );
    expect(result).toEqual([]);
  });

  it("finds a non-team-sport duplicate when neither event has a league (regression: NULL vs '' in SQL)", async () => {
    const supabase = createFakeSupabase({ events: [eventRow()] });

    const result = await findDuplicateEvents(
      supabase as never,
      {
        sport: "nfl",
        name: "MIN @ TB",
        startTimeUtc: "2026-10-12T17:00:00.000Z",
      },
      "America/New_York",
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("existing-1");
  });

  it("finds a duplicate when both events share the same league", async () => {
    const supabase = createFakeSupabase({
      events: [eventRow({ league: "NFC" })],
    });

    const result = await findDuplicateEvents(
      supabase as never,
      {
        sport: "nfl",
        league: "NFC",
        name: "MIN @ TB",
        startTimeUtc: "2026-10-12T17:00:00.000Z",
      },
      "America/New_York",
    );

    expect(result).toHaveLength(1);
  });

  it("does not match across different leagues", async () => {
    const supabase = createFakeSupabase({
      events: [eventRow({ league: "NFC" })],
    });

    const result = await findDuplicateEvents(
      supabase as never,
      {
        sport: "nfl",
        league: "AFC",
        name: "MIN @ TB",
        startTimeUtc: "2026-10-12T17:00:00.000Z",
      },
      "America/New_York",
    );

    expect(result).toEqual([]);
  });

  it("finds a team-sport duplicate by home/away team ids", async () => {
    const supabase = createFakeSupabase({
      events: [
        eventRow({
          id: "existing-team",
          home_team_id: "home-1",
          away_team_id: "away-1",
        }),
      ],
    });

    const result = await findDuplicateEvents(
      supabase as never,
      {
        sport: "nfl",
        name: "MIN @ TB",
        startTimeUtc: "2026-10-12T17:00:00.000Z",
        homeTeamId: "home-1",
        awayTeamId: "away-1",
      },
      "America/New_York",
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("existing-team");
  });

  it("finds a team-sport duplicate entered with home and away reversed", async () => {
    // Same two teams, same local date: the same game, however the user typed
    // the sides. Warning here is what stops a reversed near-duplicate Event
    // from being created and then competing for the provider match.
    const supabase = createFakeSupabase({
      events: [
        eventRow({
          id: "existing-team",
          home_team_id: "home-1",
          away_team_id: "away-1",
        }),
      ],
    });

    const result = await findDuplicateEvents(
      supabase as never,
      {
        sport: "nfl",
        name: "TB @ MIN",
        startTimeUtc: "2026-10-12T17:00:00.000Z",
        homeTeamId: "away-1",
        awayTeamId: "home-1",
      },
      "America/New_York",
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("existing-team");
  });

  it("does not match a different team pair that shares one team", async () => {
    const supabase = createFakeSupabase({
      events: [
        eventRow({
          id: "existing-team",
          home_team_id: "home-1",
          away_team_id: "away-1",
        }),
      ],
    });

    const result = await findDuplicateEvents(
      supabase as never,
      {
        sport: "nfl",
        name: "MIN @ SEA",
        startTimeUtc: "2026-10-12T17:00:00.000Z",
        homeTeamId: "home-1",
        awayTeamId: "away-2",
      },
      "America/New_York",
    );

    expect(result).toEqual([]);
  });

  it("does not match a non-duplicate on a different day", async () => {
    const supabase = createFakeSupabase({ events: [eventRow()] });

    const result = await findDuplicateEvents(
      supabase as never,
      {
        sport: "nfl",
        name: "MIN @ TB",
        startTimeUtc: "2026-10-19T17:00:00.000Z",
      },
      "America/New_York",
    );

    expect(result).toEqual([]);
  });
});
