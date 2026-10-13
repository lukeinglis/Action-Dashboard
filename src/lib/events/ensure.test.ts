import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { ProviderEvent } from "@/lib/providers/types";
import { ensureEvent, type EnsureEventInput } from "./ensure";

const USER = "user-1";

const raiders = { id: "team-lv", name: "Las Vegas Raiders", abbreviation: "LV" };
const patriots = { id: "team-ne", name: "New England Patriots", abbreviation: "NE" };

const scheduled: ProviderEvent = {
  providerEventId: "espn-401",
  sport: "nfl",
  name: "Las Vegas Raiders at New England Patriots",
  startTimeUtc: "2026-10-12T17:00:00Z",
  awayTeamAbbreviation: "LV",
  homeTeamAbbreviation: "NE",
  awayTeamName: "Las Vegas Raiders",
  homeTeamName: "New England Patriots",
};

function input(overrides: Partial<EnsureEventInput> = {}): EnsureEventInput {
  return { sport: "football", league: "NFL", awayTeam: raiders, homeTeam: patriots, ...overrides };
}

function run(
  fake: ReturnType<typeof createFakeSupabase>,
  overrides: Partial<EnsureEventInput> = {},
  schedule: ProviderEvent[] = [scheduled],
) {
  return ensureEvent(fake as unknown as SupabaseClient, USER, input(overrides), {
    schedule,
    providerKey: "espn",
  });
}

describe("ensureEvent", () => {
  it("creates the game from the provider schedule when the user never entered it", async () => {
    const fake = createFakeSupabase({ events: [] });
    const eventId = await run(fake);

    expect(eventId).toBeDefined();
    expect(fake.tables.events).toHaveLength(1);
    expect(fake.tables.events[0]).toMatchObject({
      user_id: USER,
      sport: "football",
      league: "NFL",
      name: "Las Vegas Raiders @ New England Patriots",
      start_time_utc: scheduled.startTimeUtc,
      away_team_id: "team-lv",
      home_team_id: "team-ne",
      source: "provider",
    });
  });

  it("binds the new game to the provider so refresh updates it by mapping", async () => {
    const fake = createFakeSupabase({ events: [], provider_mappings: [] });
    const eventId = await run(fake);

    expect(fake.tables.provider_mappings).toHaveLength(1);
    expect(fake.tables.provider_mappings[0]).toMatchObject({
      entity_type: "event",
      entity_id: eventId,
      provider_key: "espn",
      provider_id: "espn-401",
      match_method: "auto",
      locked: false,
    });
  });

  it("reuses the Event the user already has instead of creating a second copy", async () => {
    const fake = createFakeSupabase({
      events: [
        {
          id: "event-1",
          user_id: USER,
          sport: "football",
          name: "LV @ NE",
          start_time_utc: scheduled.startTimeUtc,
          away_team_id: "team-lv",
          home_team_id: "team-ne",
        },
      ],
    });

    expect(await run(fake)).toBe("event-1");
    expect(fake.tables.events).toHaveLength(1);
  });

  it("matches an existing Event however the slip ordered the two teams", async () => {
    // A slip's "@" is not always the provider's, and reversing home/away
    // would otherwise create a duplicate of a game the user already has.
    const fake = createFakeSupabase({
      events: [
        {
          id: "event-1",
          user_id: USER,
          sport: "football",
          name: "NE @ LV",
          start_time_utc: scheduled.startTimeUtc,
          away_team_id: "team-ne",
          home_team_id: "team-lv",
        },
      ],
    });

    expect(await run(fake)).toBe("event-1");
    expect(fake.tables.events).toHaveLength(1);
  });

  it("never reuses another user's Event", async () => {
    const fake = createFakeSupabase({
      events: [
        {
          id: "event-1",
          user_id: "user-2",
          sport: "football",
          name: "LV @ NE",
          away_team_id: "team-lv",
          home_team_id: "team-ne",
        },
      ],
    });

    expect(await run(fake)).not.toBe("event-1");
    expect(fake.tables.events).toHaveLength(2);
  });

  it("creates nothing when no kickoff can be established", async () => {
    // A row with no start time is permanently unmatchable against the provider
    // (buildEventMatchKey returns null) and invisible to the Schedule Rail —
    // worse than the unlinked leg it replaced, because it looks fixed.
    const fake = createFakeSupabase({ events: [] });

    expect(await run(fake, {}, [])).toBeUndefined();
    expect(fake.tables.events).toHaveLength(0);
  });

  it("uses the slip's own kickoff when the provider has no schedule", async () => {
    const fake = createFakeSupabase({ events: [] });
    const eventId = await run(fake, { startTimeUtc: "2026-10-12T20:05:00Z" }, []);

    expect(eventId).toBeDefined();
    expect(fake.tables.events[0]).toMatchObject({
      start_time_utc: "2026-10-12T20:05:00Z",
      // The kickoff came off the slip, so it is the user's own data.
      source: "manual",
    });
  });

  it("matches the provider game by team name when the slip carries no abbreviations", async () => {
    const fake = createFakeSupabase({ events: [] });
    const eventId = await run(
      fake,
      { awayTeam: { id: "team-lv", name: "Las Vegas Raiders" }, homeTeam: { id: "team-ne", name: "New England Patriots" } },
      [{ ...scheduled, awayTeamAbbreviation: undefined, homeTeamAbbreviation: undefined }],
    );

    expect(eventId).toBeDefined();
    expect(fake.tables.events[0]).toMatchObject({ start_time_utc: scheduled.startTimeUtc });
  });

  it("creates one Event for a parlay that repeats the same game across legs", async () => {
    const fake = createFakeSupabase({ events: [] });
    const first = await run(fake);
    const second = await run(fake);

    expect(second).toBe(first);
    expect(fake.tables.events).toHaveLength(1);
  });

  it("picks the meeting nearest the slip's kickoff when two teams meet twice", async () => {
    const fake = createFakeSupabase({
      events: [
        {
          id: "event-early",
          user_id: USER,
          sport: "football",
          name: "LV @ NE",
          start_time_utc: "2026-09-14T17:00:00Z",
          away_team_id: "team-lv",
          home_team_id: "team-ne",
        },
        {
          id: "event-late",
          user_id: USER,
          sport: "football",
          name: "LV @ NE",
          start_time_utc: "2026-12-20T17:00:00Z",
          away_team_id: "team-lv",
          home_team_id: "team-ne",
        },
      ],
    });

    expect(await run(fake, { startTimeUtc: "2026-12-20T17:00:00Z" })).toBe("event-late");
  });

  it("does not match a different sport's Event between same-named teams", async () => {
    const fake = createFakeSupabase({
      events: [
        {
          id: "event-1",
          user_id: USER,
          sport: "basketball",
          name: "LV @ NE",
          start_time_utc: scheduled.startTimeUtc,
          away_team_id: "team-lv",
          home_team_id: "team-ne",
        },
      ],
    });

    expect(await run(fake)).not.toBe("event-1");
  });
});
