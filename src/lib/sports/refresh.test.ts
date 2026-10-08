import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshSportsData } from "./refresh";
import type { SportScope } from "./refresh-scope";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import {
  DEFAULT_PROVIDER_CONFIG,
  type ProviderConfig,
  type ProviderEvent,
  type SportsProvider,
} from "@/lib/providers/types";

const USER = "user-1";
const TZ = "America/New_York";
const NOW = new Date("2026-10-05T18:00:00.000Z");

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
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
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

const nflScope: SportScope = {
  sport: "football",
  providerSport: "nfl",
  localDates: ["2026-10-04"],
};

interface FakeProviderOptions {
  getScores?: SportsProvider["getScores"];
  config?: Partial<ProviderConfig>;
  supported?: string[];
}

function fakeProvider(options: FakeProviderOptions = {}): SportsProvider {
  const supported = options.supported ?? ["nfl", "golf"];
  return {
    key: "espn",
    config: { ...DEFAULT_PROVIDER_CONFIG, ...options.config },
    supportsSport: (sport) => supported.includes(sport),
    getSchedule: async () => [providerEvent()],
    getScores: options.getScores ?? (async () => [providerEvent()]),
  };
}

function setup(rows: Partial<Record<"events" | "sports_refresh_state" | "provider_mappings", Record<string, unknown>[]>> = {}) {
  return createFakeSupabase({
    teams,
    events: rows.events ?? [eventRow()],
    provider_mappings: rows.provider_mappings ?? [],
    sports_refresh_state: rows.sports_refresh_state ?? [],
  });
}

function run(
  fake: ReturnType<typeof createFakeSupabase>,
  provider: SportsProvider,
  scopes: SportScope[] = [nflScope],
) {
  return refreshSportsData(fake as unknown as SupabaseClient, {
    userId: USER,
    timeZone: TZ,
    provider,
    scopes,
    now: () => NOW,
  });
}

function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "state-1",
    user_id: USER,
    provider_key: "espn",
    sport: "football",
    in_progress_since: null,
    last_attempt_at: null,
    last_success_at: null,
    last_error: null,
    last_request_count: null,
    requests_today_count: 0,
    requests_today_date: "2026-10-05",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

describe("refreshSportsData", () => {
  it("fetches, writes the automatic fields, and records the success", async () => {
    const fake = setup();
    const result = await run(fake, fakeProvider());

    expect(result.results[0]).toMatchObject({
      sport: "football",
      providerSport: "nfl",
      status: "refreshed",
      requestCount: 1,
      updated: 1,
    });
    expect(fake.tables.events[0].automatic_home_score).toBe(29);

    const state = fake.tables.sports_refresh_state[0];
    expect(state.last_success_at).toBe(NOW.toISOString());
    expect(state.in_progress_since).toBeNull();
    expect(state.requests_today_count).toBe(1);
  });

  it("asks the provider for the date the relevant Events fall on", async () => {
    // ESPN rejects date ranges, so the orchestration issues one request per
    // local date rather than one spanning request.
    // Typed off the provider interface so the recorded params are inspectable.
    const getScores = vi.fn<NonNullable<SportsProvider["getScores"]>>(async () => [providerEvent()]);
    await run(setup(), fakeProvider({ getScores }), [
      { ...nflScope, localDates: ["2026-10-04", "2026-10-11"] },
    ]);

    expect(getScores.mock.calls.map((c) => c[0])).toEqual([
      { sport: "nfl", date: "20261004" },
      { sport: "nfl", date: "20261011" },
    ]);
  });

  it("asks for the current slate when the only relevant Event is TBD", async () => {
    const getScores = vi.fn(async () => [providerEvent()]);
    await run(setup(), fakeProvider({ getScores }), [{ ...nflScope, localDates: [] }]);

    expect(getScores).toHaveBeenCalledWith({ sport: "nfl", date: undefined });
  });

  it("skips a sport whose refresh is already in flight", async () => {
    // A double-click must not double-fetch.
    const getScores = vi.fn(async () => [providerEvent()]);
    const fake = setup({
      sports_refresh_state: [stateRow({ in_progress_since: "2026-10-05T17:59:30.000Z" })],
    });
    const result = await run(fake, fakeProvider({ getScores }));

    expect(result.results[0]).toMatchObject({ status: "skipped", skipReason: "in_progress" });
    expect(getScores).not.toHaveBeenCalled();
  });

  it("skips a sport inside its cooldown and reports the seconds left", async () => {
    const getScores = vi.fn(async () => [providerEvent()]);
    const fake = setup({
      sports_refresh_state: [stateRow({ last_success_at: "2026-10-05T17:59:30.000Z" })],
    });
    const result = await run(fake, fakeProvider({ getScores }));

    expect(result.results[0]).toMatchObject({
      status: "skipped",
      skipReason: "cooldown",
      cooldownSecondsRemaining: 30,
    });
    expect(getScores).not.toHaveBeenCalled();
    // The lock must not be left behind by a skip.
    expect(fake.tables.sports_refresh_state[0].in_progress_since).toBeNull();
  });

  it("releases the lock it took, so the next refresh is not blocked", async () => {
    const fake = setup();
    await run(fake, fakeProvider());
    const second = await run(fake, fakeProvider({ config: { minRefreshIntervalSeconds: 0 } }));

    expect(second.results[0].status).toBe("refreshed");
  });

  it("skips the provider once the daily limit is reached", async () => {
    // §22.1: at 100% the provider is skipped and manual editing continues.
    const getScores = vi.fn(async () => [providerEvent()]);
    const fake = setup({
      sports_refresh_state: [stateRow({ requests_today_count: 100, requests_today_date: "2026-10-05" })],
    });
    const result = await run(fake, fakeProvider({ getScores, config: { dailyRequestLimit: 100 } }));

    expect(result.results[0]).toMatchObject({ status: "skipped", skipReason: "quota" });
    expect(result.quota).toMatchObject({ used: 100, limit: 100, status: "exhausted" });
    expect(getScores).not.toHaveBeenCalled();
  });

  it("reports the quota warning band without blocking the refresh", async () => {
    const fake = setup({
      sports_refresh_state: [stateRow({ requests_today_count: 80, requests_today_date: "2026-10-05" })],
    });
    const result = await run(fake, fakeProvider({ config: { dailyRequestLimit: 100 } }));

    expect(result.results[0].status).toBe("refreshed");
    expect(result.quota).toMatchObject({ used: 81, status: "warning" });
  });

  it("skips a sport the provider does not cover", async () => {
    const result = await run(setup(), fakeProvider({ supported: ["golf"] }));

    expect(result.results[0]).toMatchObject({ status: "skipped", skipReason: "unsupported" });
  });

  it("retains prior data and records the error when the provider fails", async () => {
    // §22: a failed refresh keeps prior data and shows a non-blocking error.
    const fake = setup({
      events: [eventRow({ automatic_status: "scheduled", automatic_home_score: 7 })],
      sports_refresh_state: [stateRow({ last_success_at: "2026-10-05T14:10:00.000Z" })],
    });
    const result = await run(
      fake,
      fakeProvider({
        getScores: async () => {
          throw new Error("ESPN request failed: 503");
        },
        config: { minRefreshIntervalSeconds: 0 },
      }),
    );

    expect(result.results[0]).toMatchObject({
      status: "failed",
      error: "ESPN request failed: 503",
    });
    expect(fake.tables.events[0].automatic_home_score).toBe(7);

    const state = fake.tables.sports_refresh_state[0];
    expect(state.last_error).toBe("ESPN request failed: 503");
    expect(state.last_success_at).toBe("2026-10-05T14:10:00.000Z");
    expect(state.in_progress_since).toBeNull();
  });

  it("lets one sport fail without losing another sport's write", async () => {
    // §22.1: each sport is written as it arrives; one failing never rolls back
    // another.
    const fake = setup();
    const provider = fakeProvider({
      getScores: async (params) => {
        if ((params as { sport: string }).sport === "golf") throw new Error("golf slate empty");
        return [providerEvent()];
      },
    });

    const result = await run(fake, provider, [
      nflScope,
      { sport: "golf", providerSport: "golf", localDates: ["2026-10-04"] },
    ]);

    const bySport = Object.fromEntries(result.results.map((r) => [r.sport, r]));
    expect(bySport.football.status).toBe("refreshed");
    expect(bySport.golf.status).toBe("failed");
    expect(fake.tables.events[0].automatic_home_score).toBe(29);
  });

  it("still counts the requests it spent when the write fails afterwards", async () => {
    // The quota has to reflect what left the machine, not whether we managed
    // to store the answer.
    const fake = setup();
    const realFrom = fake.from;
    const brokenEvents = {
      ...fake,
      from: (table: string) => {
        if (table === "events") throw new Error("events table unavailable");
        return realFrom(table);
      },
    };

    const result = await refreshSportsData(brokenEvents as unknown as SupabaseClient, {
      userId: USER,
      timeZone: TZ,
      provider: fakeProvider(),
      scopes: [nflScope],
      now: () => NOW,
    });

    expect(result.results[0]).toMatchObject({
      status: "failed",
      requestCount: 1,
      error: "events table unavailable",
    });
    expect(fake.tables.sports_refresh_state[0].requests_today_count).toBe(1);
  });

  it("times out a provider that never settles, and frees the sport afterwards", async () => {
    const fake = setup();
    const result = await run(
      fake,
      fakeProvider({
        getScores: () => new Promise(() => {}),
        config: { timeoutMs: 10 },
      }),
    );

    expect(result.results[0].status).toBe("failed");
    expect(result.results[0].error).toMatch(/timed out after 10ms/);
    expect(fake.tables.sports_refresh_state[0].in_progress_since).toBeNull();
  });

  it("does nothing at all when no sport is in scope", async () => {
    const fake = setup();
    const result = await run(fake, fakeProvider(), []);

    expect(result.results).toEqual([]);
    expect(fake.tables.sports_refresh_state).toHaveLength(0);
    expect(fake.tables.events[0].automatic_status).toBeNull();
  });
});
