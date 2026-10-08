import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimRefreshLock,
  cooldownSecondsRemaining,
  listRefreshStates,
  quotaStatus,
  releaseRefreshLock,
  requestsUsedToday,
} from "./refresh-state";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { SportsRefreshState } from "@/lib/types/domain";

const USER = "user-1";
const KEY = { userId: USER, providerKey: "espn", sport: "football" };
const NOW = new Date("2026-10-05T18:00:00.000Z");

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

function setup(rows: Record<string, unknown>[] = []) {
  return createFakeSupabase({ sports_refresh_state: rows });
}

function client(fake: ReturnType<typeof createFakeSupabase>) {
  return fake as unknown as SupabaseClient;
}

function domainState(overrides: Partial<SportsRefreshState> = {}): SportsRefreshState {
  return {
    id: "state-1",
    userId: USER,
    providerKey: "espn",
    sport: "football",
    requestsTodayCount: 0,
    requestsTodayDate: "2026-10-05",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("claimRefreshLock", () => {
  it("creates the row and takes the lock on the very first refresh", async () => {
    const fake = setup();
    const result = await claimRefreshLock(client(fake), KEY, NOW);

    expect(result.claimed).toBe(true);
    expect(fake.tables.sports_refresh_state).toHaveLength(1);
    expect(fake.tables.sports_refresh_state[0].in_progress_since).toBe(NOW.toISOString());
  });

  it("refuses a second refresh while the lock is held", async () => {
    // The whole point of the in-flight lock: a double-click must not double-fetch.
    const fake = setup([stateRow({ in_progress_since: "2026-10-05T17:59:30.000Z" })]);
    const result = await claimRefreshLock(client(fake), KEY, NOW);

    expect(result.claimed).toBe(false);
    expect(result.state).toBeNull();
    // The held lock is left exactly as it was, not overwritten.
    expect(fake.tables.sports_refresh_state[0].in_progress_since).toBe(
      "2026-10-05T17:59:30.000Z",
    );
  });

  it("clears a lock older than two minutes and claims it", async () => {
    // A crashed refresh would otherwise wedge this sport permanently.
    const fake = setup([stateRow({ in_progress_since: "2026-10-05T17:50:00.000Z" })]);
    const result = await claimRefreshLock(client(fake), KEY, NOW);

    expect(result.claimed).toBe(true);
    expect(fake.tables.sports_refresh_state[0].in_progress_since).toBe(NOW.toISOString());
  });

  it("does not disturb another sport's lock", async () => {
    const fake = setup([
      stateRow({ id: "s-golf", sport: "golf", in_progress_since: "2026-10-05T17:59:55.000Z" }),
    ]);
    const result = await claimRefreshLock(client(fake), KEY, NOW);

    expect(result.claimed).toBe(true);
    const golf = fake.tables.sports_refresh_state.find((r) => r.sport === "golf");
    expect(golf?.in_progress_since).toBe("2026-10-05T17:59:55.000Z");
  });

  it("hands back the pre-claim snapshot so cooldown reads the same state", async () => {
    const fake = setup([
      stateRow({ last_success_at: "2026-10-05T17:59:00.000Z", requests_today_count: 4 }),
    ]);
    const result = await claimRefreshLock(client(fake), KEY, NOW);

    expect(result.state?.lastSuccessAt).toBe("2026-10-05T17:59:00.000Z");
    expect(result.state?.requestsTodayCount).toBe(4);
  });
});

describe("releaseRefreshLock", () => {
  it("records a success and clears the previous error", async () => {
    const fake = setup([
      stateRow({ in_progress_since: NOW.toISOString(), last_error: "ESPN request failed: 503" }),
    ]);
    await releaseRefreshLock(client(fake), KEY, NOW, {
      success: true,
      requestCount: 1,
      previous: domainState(),
    });

    const row = fake.tables.sports_refresh_state[0];
    expect(row.in_progress_since).toBeNull();
    expect(row.last_success_at).toBe(NOW.toISOString());
    expect(row.last_error).toBeNull();
    expect(row.last_request_count).toBe(1);
  });

  it("keeps the last successful update visible after a failure", async () => {
    // §22: a failed refresh retains prior data, and the UI shows "last
    // successful update 2:10 PM" — so last_success_at must survive.
    const fake = setup([
      stateRow({
        in_progress_since: NOW.toISOString(),
        last_success_at: "2026-10-05T14:10:00.000Z",
      }),
    ]);
    await releaseRefreshLock(client(fake), KEY, NOW, {
      success: false,
      error: "ESPN request failed: 503",
      requestCount: 1,
      previous: domainState(),
    });

    const row = fake.tables.sports_refresh_state[0];
    expect(row.last_success_at).toBe("2026-10-05T14:10:00.000Z");
    expect(row.last_error).toBe("ESPN request failed: 503");
    expect(row.in_progress_since).toBeNull();
  });

  it("accumulates the quota across refreshes on the same day", async () => {
    const fake = setup([stateRow({ requests_today_count: 4, requests_today_date: "2026-10-05" })]);
    await releaseRefreshLock(client(fake), KEY, NOW, {
      success: true,
      requestCount: 3,
      previous: domainState({ requestsTodayCount: 4, requestsTodayDate: "2026-10-05" }),
    });

    expect(fake.tables.sports_refresh_state[0].requests_today_count).toBe(7);
  });

  it("resets the quota when the stored date is not today", async () => {
    // The count rolls over on its own date rather than by a scheduled job, so
    // a day with no refresh cannot leave a stale count behind.
    const fake = setup([stateRow({ requests_today_count: 900, requests_today_date: "2026-10-04" })]);
    await releaseRefreshLock(client(fake), KEY, NOW, {
      success: true,
      requestCount: 2,
      previous: domainState({ requestsTodayCount: 900, requestsTodayDate: "2026-10-04" }),
    });

    const row = fake.tables.sports_refresh_state[0];
    expect(row.requests_today_count).toBe(2);
    expect(row.requests_today_date).toBe("2026-10-05");
  });

  it("leaves the outcome columns untouched when no request was issued", async () => {
    // A cooldown or quota skip still releases the lock, but must not look like
    // either a success or a failure.
    const fake = setup([
      stateRow({
        in_progress_since: NOW.toISOString(),
        last_success_at: "2026-10-05T17:59:00.000Z",
        requests_today_count: 4,
      }),
    ]);
    await releaseRefreshLock(client(fake), KEY, NOW, { previous: domainState() });

    const row = fake.tables.sports_refresh_state[0];
    expect(row.in_progress_since).toBeNull();
    expect(row.last_success_at).toBe("2026-10-05T17:59:00.000Z");
    expect(row.last_error).toBeNull();
    expect(row.requests_today_count).toBe(4);
  });
});

describe("cooldownSecondsRemaining", () => {
  it("returns zero when the sport has never refreshed", () => {
    expect(cooldownSecondsRemaining(null, 60, NOW)).toBe(0);
  });

  it("reports the seconds left, rounded up for display", () => {
    expect(cooldownSecondsRemaining("2026-10-05T17:59:30.000Z", 60, NOW)).toBe(30);
    expect(cooldownSecondsRemaining("2026-10-05T17:59:30.500Z", 60, NOW)).toBe(31);
  });

  it("returns zero once the interval has passed", () => {
    expect(cooldownSecondsRemaining("2026-10-05T17:58:00.000Z", 60, NOW)).toBe(0);
  });
});

describe("requestsUsedToday", () => {
  const states = [
    domainState({ sport: "football", requestsTodayCount: 3, requestsTodayDate: "2026-10-05" }),
    domainState({ sport: "golf", requestsTodayCount: 2, requestsTodayDate: "2026-10-05" }),
  ];

  it("sums a provider's sports, since the limit applies to the provider", () => {
    expect(requestsUsedToday(states, "espn", NOW)).toBe(5);
  });

  it("ignores counts left over from a previous day", () => {
    const stale = [...states, domainState({ sport: "mlb", requestsTodayCount: 900, requestsTodayDate: "2026-10-04" })];
    expect(requestsUsedToday(stale, "espn", NOW)).toBe(5);
  });

  it("ignores another provider's usage", () => {
    const other = [...states, domainState({ providerKey: "sleeper", requestsTodayCount: 50 })];
    expect(requestsUsedToday(other, "espn", NOW)).toBe(5);
  });
});

describe("quotaStatus", () => {
  it("is always ok when the provider declares no limit", () => {
    // ESPN publishes no rate limit, so there is nothing to measure against.
    expect(quotaStatus(10_000, undefined)).toBe("ok");
  });

  it("warns at 80% and blocks at 100%", () => {
    expect(quotaStatus(79, 100)).toBe("ok");
    expect(quotaStatus(80, 100)).toBe("warning");
    expect(quotaStatus(99, 100)).toBe("warning");
    expect(quotaStatus(100, 100)).toBe("exhausted");
    expect(quotaStatus(140, 100)).toBe("exhausted");
  });
});

describe("listRefreshStates", () => {
  it("maps the stored rows to the domain shape", async () => {
    const fake = setup([stateRow({ last_success_at: "2026-10-05T17:00:00.000Z" })]);
    const states = await listRefreshStates(client(fake), USER);

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      providerKey: "espn",
      sport: "football",
      lastSuccessAt: "2026-10-05T17:00:00.000Z",
    });
  });
});
