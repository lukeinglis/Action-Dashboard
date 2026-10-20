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

  it("creates nothing when either team is unknown to both us and the provider", async () => {
    const fake = createFakeSupabase({ events: [] });
    const eventId = await resolveLegEventId(
      fake as unknown as SupabaseClient,
      USER,
      leg({ matchup: { awayTeamName: "LV", homeTeamName: "Some Other Team" } }),
      deps(),
    );

    expect(eventId).toBeUndefined();
    expect(fake.tables.events).toHaveLength(0);
    expect(fake.tables.teams ?? []).toHaveLength(0);
  });

  it("creates the teams a college football slip named, which no seed carries", async () => {
    // The seed data is the 32 NFL teams, and the only other way to get a Team
    // was the manual prompt on /events/new — so every college football and
    // soccer leg imported so far resolved no teams, linked to no Event, and
    // lost its matchup for good (BetLeg does not persist the team names).
    const fake = createFakeSupabase({ events: [] });
    const ncaaf: ProviderEvent = {
      providerEventId: "espn-402",
      sport: "college-football",
      name: "Auburn Tigers at Texas A&M Aggies",
      startTimeUtc: "2026-10-12T20:30:00Z",
      awayTeamName: "Auburn Tigers",
      awayTeamAbbreviation: "AUB",
      homeTeamName: "Texas A&M Aggies",
      homeTeamAbbreviation: "TA&M",
    };

    const eventId = await resolveLegEventId(
      fake as unknown as SupabaseClient,
      USER,
      leg({
        league: "NCAAF",
        matchup: { awayTeamName: "Auburn", homeTeamName: "Texas A&M" },
      }),
      deps({ teams: [], loadSchedule: async () => [ncaaf] }),
    );

    expect(eventId).toBeDefined();
    expect(fake.tables.teams).toHaveLength(2);
    expect(fake.tables.events[0]).toMatchObject({
      sport: "football",
      league: "NCAAF",
      name: "Auburn Tigers @ Texas A&M Aggies",
      start_time_utc: ncaaf.startTimeUtc,
      source: "provider",
    });
  });

  it("asks the provider for the league the leg actually names", async () => {
    // NFL and college football are one internal sport but two ESPN endpoints,
    // and a college game looked up against the NFL schedule is not there.
    const loadSchedule = vi.fn(async () => []);
    await resolveLegEventId(
      createFakeSupabase({ events: [] }) as unknown as SupabaseClient,
      USER,
      leg({ league: "CFB", matchup: { awayTeamName: "Auburn", homeTeamName: "Texas A&M" } }),
      deps({ teams: [], loadSchedule }),
    );

    expect(loadSchedule).toHaveBeenCalledWith("college-football");
  });

  it("files a created team under the canonical league, not the slip's spelling", async () => {
    // A slip writes "CFB"; a Team stored under that is one `sport-keys` cannot
    // translate back into a provider key.
    const fake = createFakeSupabase({ events: [] });
    await resolveLegEventId(
      fake as unknown as SupabaseClient,
      USER,
      leg({ league: "CFB", matchup: { awayTeamName: "Auburn", homeTeamName: "Texas A&M" } }),
      deps({
        teams: [],
        loadSchedule: async () => [
          {
            providerEventId: "espn-402",
            sport: "college-football",
            name: "Auburn Tigers at Texas A&M Aggies",
            startTimeUtc: "2026-10-12T20:30:00Z",
            awayTeamName: "Auburn Tigers",
            homeTeamName: "Texas A&M Aggies",
          },
        ],
      }),
    );

    expect(fake.tables.teams.map((t) => t.league)).toEqual(["NCAAF", "NCAAF"]);
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
