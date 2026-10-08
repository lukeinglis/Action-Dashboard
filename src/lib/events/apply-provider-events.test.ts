import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyProviderEvents, orientAutomaticFields } from "./apply-provider-events";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { ProviderEvent } from "@/lib/providers/types";

const USER = "user-1";
const TZ = "America/New_York";
const NOW = "2026-10-05T01:00:00.000Z";

const teams = [
  { id: "team-det", user_id: USER, sport: "football", league: "NFL", name: "Detroit Lions", abbreviation: "DET" },
  { id: "team-car", user_id: USER, sport: "football", league: "NFL", name: "Carolina Panthers", abbreviation: "CAR" },
];

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    user_id: USER,
    sport: "football",
    league: "NFL",
    name: "Lions @ Panthers",
    start_time_utc: "2026-10-05T00:20:00Z",
    start_time_tbd: false,
    end_time_utc: null,
    home_team_id: "team-car",
    away_team_id: "team-det",
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
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function providerEvent(overrides: Partial<ProviderEvent> = {}): ProviderEvent {
  return {
    providerEventId: "401872978",
    sport: "nfl",
    league: "NFL",
    name: "Detroit Lions at Carolina Panthers",
    startTimeUtc: "2026-10-05T00:20:00Z",
    homeTeamProviderId: "29",
    awayTeamProviderId: "8",
    homeTeamAbbreviation: "CAR",
    awayTeamAbbreviation: "DET",
    status: "in_progress",
    homeScore: 29,
    awayScore: 19,
    period: "Q3",
    clock: "5:42",
    ...overrides,
  };
}

function setup(rows: { events?: Record<string, unknown>[]; provider_mappings?: Record<string, unknown>[] }) {
  return createFakeSupabase({
    teams,
    events: rows.events ?? [eventRow()],
    provider_mappings: rows.provider_mappings ?? [],
  });
}

function run(fake: ReturnType<typeof createFakeSupabase>, events: ProviderEvent[]) {
  return applyProviderEvents(fake as unknown as SupabaseClient, events, {
    userId: USER,
    providerKey: "espn",
    timeZone: TZ,
    now: () => NOW,
  });
}

describe("orientAutomaticFields", () => {
  it("swaps the scores when the Event stores the sides the other way round", () => {
    // A hand-created Event can have home/away reversed relative to the
    // provider; writing positionally would invert the scoreline.
    const fields = orientAutomaticFields(
      {
        providerEvent: providerEvent(),
        homeTeamId: "team-car",
        awayTeamId: "team-det",
        outcome: { kind: "matched", eventId: "event-1" },
      },
      { home_team_id: "team-det", away_team_id: "team-car" },
    );

    expect(fields.automatic_home_score).toBe(19);
    expect(fields.automatic_away_score).toBe(29);
  });

  it("keeps the provider orientation when the sides agree", () => {
    const fields = orientAutomaticFields(
      {
        providerEvent: providerEvent(),
        homeTeamId: "team-car",
        awayTeamId: "team-det",
        outcome: { kind: "matched", eventId: "event-1" },
      },
      { home_team_id: "team-car", away_team_id: "team-det" },
    );

    expect(fields.automatic_home_score).toBe(29);
    expect(fields.automatic_away_score).toBe(19);
  });
});

describe("applyProviderEvents", () => {
  it("writes the automatic fields and creates the auto mappings", async () => {
    const fake = setup({});
    const result = await run(fake, [providerEvent()]);

    expect(result.updated).toBe(1);
    expect(result.eventMappingsCreated).toBe(1);
    expect(result.teamMappingsCreated).toBe(2);

    const event = fake.tables.events[0];
    expect(event.automatic_status).toBe("in_progress");
    expect(event.automatic_home_score).toBe(29);
    expect(event.automatic_away_score).toBe(19);
    expect(event.automatic_period).toBe("Q3");
    expect(event.automatic_clock).toBe("5:42");
    expect(event.automatic_changed_at).toBe(NOW);

    const mapping = fake.tables.provider_mappings.find((m) => m.entity_type === "event");
    expect(mapping).toMatchObject({
      entity_id: "event-1",
      provider_key: "espn",
      provider_id: "401872978",
      match_method: "auto",
      locked: false,
    });
  });

  it("auto-matches a reversed Event and writes the scoreline the Event's way round", async () => {
    // End-to-end proof that orientAutomaticFields is reachable from the
    // auto-match path, not just from a pre-existing provider mapping: the
    // Event stores Lions at home, the provider reports Panthers at home, so
    // the Event's own home score is the Lions' 19 rather than the raw 29.
    const fake = setup({
      events: [eventRow({ name: "Panthers @ Lions", home_team_id: "team-det", away_team_id: "team-car" })],
    });
    const result = await run(fake, [providerEvent()]);

    expect(result.needsMatch).toEqual([]);
    expect(result.eventMappingsCreated).toBe(1);
    expect(result.updated).toBe(1);

    const event = fake.tables.events[0];
    expect(event.automatic_home_score).toBe(19);
    expect(event.automatic_away_score).toBe(29);
  });

  it("never clears a manual override and keeps the automatic value underneath", async () => {
    const fake = setup({
      events: [eventRow({ manual_status: "final", manual_home_score: 31, manual_set_at: NOW })],
    });
    await run(fake, [providerEvent()]);

    const event = fake.tables.events[0];
    expect(event.manual_status).toBe("final");
    expect(event.manual_home_score).toBe(31);
    expect(event.automatic_status).toBe("in_progress");
    expect(event.automatic_home_score).toBe(29);
  });

  it("leaves automatic_changed_at alone when nothing actually moved", async () => {
    // §45 defines a stale override as automaticChangedAt > manualSetAt, so
    // bumping the timestamp on an unchanged refresh would make every override
    // look stale and the "needs review" count worthless.
    const fake = setup({
      events: [
        eventRow({
          automatic_status: "in_progress",
          automatic_home_score: 29,
          automatic_away_score: 19,
          automatic_period: "Q3",
          automatic_clock: "5:42",
          automatic_changed_at: "2026-10-01T00:00:00.000Z",
        }),
      ],
      provider_mappings: [
        {
          id: "m1",
          user_id: USER,
          entity_type: "event",
          entity_id: "event-1",
          provider_key: "espn",
          provider_id: "401872978",
          match_method: "auto",
          locked: false,
        },
      ],
    });

    const result = await run(fake, [providerEvent()]);

    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(fake.tables.events[0].automatic_changed_at).toBe("2026-10-01T00:00:00.000Z");
  });

  it("advances automatic_changed_at as soon as one field moves", async () => {
    const fake = setup({
      events: [
        eventRow({
          automatic_status: "in_progress",
          automatic_home_score: 29,
          automatic_away_score: 19,
          automatic_period: "Q3",
          automatic_clock: "5:42",
          automatic_changed_at: "2026-10-01T00:00:00.000Z",
        }),
      ],
    });

    const result = await run(fake, [providerEvent({ clock: "4:10" })]);

    expect(result.updated).toBe(1);
    expect(fake.tables.events[0].automatic_changed_at).toBe(NOW);
  });

  it("reuses an existing team mapping instead of creating a duplicate", async () => {
    const fake = setup({
      provider_mappings: [
        {
          id: "m-team",
          user_id: USER,
          entity_type: "team",
          entity_id: "team-car",
          provider_key: "espn",
          provider_id: "29",
          match_method: "auto",
          locked: false,
        },
      ],
    });

    const result = await run(fake, [providerEvent()]);

    expect(result.teamMappingsCreated).toBe(1);
    expect(fake.tables.provider_mappings.filter((m) => m.provider_id === "29")).toHaveLength(1);
  });

  it("skips a team mapping whose team is already mapped under a different provider id", async () => {
    // provider_mappings is unique on (entity_id, provider_key) too, so this
    // would be a constraint violation rather than a no-op.
    const fake = setup({
      provider_mappings: [
        {
          id: "m-stale",
          user_id: USER,
          entity_type: "team",
          entity_id: "team-car",
          provider_key: "espn",
          provider_id: "old-29",
          match_method: "auto",
          locked: false,
        },
      ],
    });

    const result = await run(fake, [providerEvent()]);

    expect(result.teamMappingsCreated).toBe(1);
    expect(fake.tables.provider_mappings.filter((m) => m.entity_id === "team-car")).toHaveLength(1);
  });

  it("reports a provider record with no internal Event and creates nothing", async () => {
    const fake = setup({ events: [] });
    const result = await run(fake, [providerEvent()]);

    expect(result.updated).toBe(0);
    expect(result.eventMappingsCreated).toBe(0);
    expect(result.needsMatch).toEqual([
      {
        providerEventId: "401872978",
        name: "Detroit Lions at Carolina Panthers",
        candidateEventIds: [],
      },
    ]);
    // Refresh updates Events and never creates them (§20.2).
    expect(fake.tables.events).toHaveLength(0);
  });

  it("reports an ambiguous match with its candidates and writes nothing", async () => {
    const fake = setup({ events: [eventRow(), eventRow({ id: "event-2" })] });
    const result = await run(fake, [providerEvent()]);

    expect(result.updated).toBe(0);
    expect(result.eventMappingsCreated).toBe(0);
    expect(result.needsMatch[0].candidateEventIds).toEqual(["event-1", "event-2"]);
  });

  it("does not write a pre-kickoff scoreline", async () => {
    const fake = setup({});
    await run(fake, [
      providerEvent({
        status: "scheduled",
        homeScore: undefined,
        awayScore: undefined,
        period: undefined,
        clock: undefined,
      }),
    ]);

    const event = fake.tables.events[0];
    expect(event.automatic_status).toBe("scheduled");
    expect(event.automatic_home_score).toBeNull();
    expect(event.automatic_away_score).toBeNull();
  });

  it("short-circuits on an empty provider result without touching anything", async () => {
    const fake = setup({});
    const result = await run(fake, []);

    expect(result).toMatchObject({ updated: 0, unchanged: 0, eventMappingsCreated: 0 });
    expect(fake.tables.events[0].automatic_status).toBeNull();
  });
});
