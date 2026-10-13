import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { ProviderEvent } from "@/lib/providers/types";
import { cachedScheduleLoader, resolveLegEventId, type LegEventDeps } from "./leg-events";
import type { ApprovedLeg } from "./pipeline";

const USER = "user-1";

const teams = [
  { id: "team-lv", sport: "football", name: "Las Vegas Raiders", abbreviation: "LV" },
  { id: "team-ne", sport: "football", name: "New England Patriots", abbreviation: "NE" },
];

const scheduled: ProviderEvent = {
  providerEventId: "espn-401",
  sport: "nfl",
  name: "Las Vegas Raiders at New England Patriots",
  startTimeUtc: "2026-10-12T17:00:00Z",
  awayTeamAbbreviation: "LV",
  homeTeamAbbreviation: "NE",
};

function leg(overrides: Partial<ApprovedLeg> = {}): Pick<ApprovedLeg, "sport" | "league" | "matchup"> {
  return {
    sport: "football",
    league: "NFL",
    matchup: { awayTeamName: "LV", homeTeamName: "NE" },
    ...overrides,
  };
}

function deps(overrides: Partial<LegEventDeps> = {}): LegEventDeps {
  return {
    teams,
    loadSchedule: async () => [scheduled],
    providerKey: "espn",
    ...overrides,
  };
}

describe("resolveLegEventId", () => {
  it("creates the game a slip named by abbreviation alone", async () => {
    const fake = createFakeSupabase({ events: [] });
    const eventId = await resolveLegEventId(fake as unknown as SupabaseClient, USER, leg(), deps());

    expect(eventId).toBeDefined();
    expect(fake.tables.events[0]).toMatchObject({
      name: "Las Vegas Raiders @ New England Patriots",
      start_time_utc: scheduled.startTimeUtc,
    });
  });

  it("stores the Event under the matched teams' sport when extraction found none", async () => {
    // An Event filed under sport "" is invisible to refresh scope, so the
    // teams' own sport is authoritative.
    const fake = createFakeSupabase({ events: [] });
    await resolveLegEventId(
      fake as unknown as SupabaseClient,
      USER,
      leg({ sport: "", league: undefined }),
      deps(),
    );

    expect(fake.tables.events[0]).toMatchObject({ sport: "football" });
  });

  it("creates nothing when either team is unknown, rather than guessing a game", async () => {
    const fake = createFakeSupabase({ events: [] });
    const eventId = await resolveLegEventId(
      fake as unknown as SupabaseClient,
      USER,
      leg({ matchup: { awayTeamName: "LV", homeTeamName: "Some Other Team" } }),
      deps(),
    );

    expect(eventId).toBeUndefined();
    expect(fake.tables.events).toHaveLength(0);
  });

  it("does nothing for a leg with no matchup, such as a season future", async () => {
    const fake = createFakeSupabase({ events: [] });
    const loadSchedule = vi.fn(async () => [scheduled]);

    expect(
      await resolveLegEventId(
        fake as unknown as SupabaseClient,
        USER,
        leg({ matchup: undefined }),
        deps({ loadSchedule }),
      ),
    ).toBeUndefined();
    expect(loadSchedule).not.toHaveBeenCalled();
  });

  it("does not ask a provider about a sport it has no vocabulary for", async () => {
    // toProviderSport returns null for sports tracked by hand; asking anyway
    // would make the adapter reject a key it never knew.
    const fake = createFakeSupabase({ events: [] });
    const loadSchedule = vi.fn(async () => [scheduled]);
    const darts = [
      { id: "team-a", sport: "darts", name: "Team A", abbreviation: "A" },
      { id: "team-b", sport: "darts", name: "Team B", abbreviation: "B" },
    ];

    await resolveLegEventId(
      fake as unknown as SupabaseClient,
      USER,
      { sport: "darts", matchup: { awayTeamName: "A", homeTeamName: "B" } },
      deps({ teams: darts, loadSchedule }),
    );

    expect(loadSchedule).not.toHaveBeenCalled();
  });
});

describe("cachedScheduleLoader", () => {
  it("asks the provider once per sport however many legs need it", async () => {
    const fetchSchedule = vi.fn(async () => [scheduled]);
    const load = cachedScheduleLoader(fetchSchedule);

    const [a, b] = await Promise.all([load("nfl"), load("nfl")]);

    expect(a).toEqual([scheduled]);
    expect(b).toEqual([scheduled]);
    expect(fetchSchedule).toHaveBeenCalledTimes(1);
  });

  it("treats a provider outage as an empty schedule so the import still saves", async () => {
    // §22: a failed refresh retains prior data and keeps the rest working. An
    // empty schedule just leaves the leg unlinked, which the user can fix.
    const load = cachedScheduleLoader(async () => {
      throw new Error("ESPN request failed: 500");
    });

    await expect(load("nfl")).resolves.toEqual([]);
  });
});
