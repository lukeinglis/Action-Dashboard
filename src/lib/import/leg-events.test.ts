import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { ProviderEvent } from "@/lib/providers/types";
import {
  cachedScheduleLoader,
  resolveLegEventId,
  slateProbeInstants,
  withSlateProbe,
  type LegEventDeps,
} from "./leg-events";
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
    // soccer leg imported so far resolved no teams and linked to no Event.
    // `repairLegs` cannot rescue those after the fact: it re-reads the matchup
    // from `raw_description`, but §20.2 bars it from creating the game, so the
    // Event has to come from approval — here.
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

    // No slate instant: the slip printed no kickoff, so the current slate is
    // what gets asked for.
    expect(loadSchedule).toHaveBeenCalledWith("college-football", undefined);
  });

  it("asks for the slate of the kickoff the slip printed, not today's", async () => {
    // A slip reviewed days after it was placed names a game the current
    // scoreboard no longer carries, so a printed kickoff has to scope the
    // request.
    const loadSchedule = vi.fn(async () => [scheduled]);
    await resolveLegEventId(
      createFakeSupabase({ events: [] }) as unknown as SupabaseClient,
      USER,
      leg({ matchup: { awayTeamName: "LV", homeTeamName: "NE", startTimeUtc: "2026-10-12T17:00:00Z" } }),
      deps({ loadSchedule }),
    );

    expect(loadSchedule).toHaveBeenCalledWith("nfl", "2026-10-12T17:00:00Z");
  });

  it("creates the game for a slip whose kickoff has dropped off the current slate", async () => {
    // The whole point of probing: this leg prints two team names and no time,
    // and its game was yesterday. Against the current slate alone there is
    // nothing to match, which is how every orphaned leg in the author's data
    // got that way — imported the morning after Saturday's college slate.
    const fake = createFakeSupabase({ events: [] });
    const saturday: ProviderEvent = {
      providerEventId: "espn-410",
      sport: "college-football",
      name: "Auburn Tigers at Georgia Bulldogs",
      startTimeUtc: "2026-10-17T19:30:00Z",
      awayTeamName: "Auburn Tigers",
      homeTeamName: "Georgia Bulldogs",
    };

    const loadSchedule = withSlateProbe(
      async (_sport, instant) => (instant?.startsWith("2026-10-17") ? [saturday] : []),
      slateProbeInstants("2026-10-18T12:54:00Z", 3),
    );

    const eventId = await resolveLegEventId(
      fake as unknown as SupabaseClient,
      USER,
      leg({
        league: "NCAAF",
        matchup: { awayTeamName: "Auburn", homeTeamName: "Georgia Bulldogs" },
      }),
      deps({ teams: [], loadSchedule }),
    );

    expect(eventId).toBeDefined();
    expect(fake.tables.events[0]).toMatchObject({
      name: "Auburn Tigers @ Georgia Bulldogs",
      start_time_utc: saturday.startTimeUtc,
      source: "provider",
    });
  });

  it("refuses a matchup two probed slates both offer a game for", async () => {
    // Widening the search widens the chance of two games fitting the same
    // printed names. §20.2 reports that rather than picking the nearer one,
    // because a leg on the wrong game grades to a confidently wrong result.
    const fake = createFakeSupabase({ events: [] });
    const meeting = (id: string, startTimeUtc: string): ProviderEvent => ({
      providerEventId: id,
      sport: "college-football",
      name: "Auburn Tigers at Georgia Bulldogs",
      startTimeUtc,
      awayTeamName: "Auburn Tigers",
      homeTeamName: "Georgia Bulldogs",
    });

    const loadSchedule = withSlateProbe(
      async (_sport, instant) =>
        instant?.startsWith("2026-10-17")
          ? [meeting("espn-410", "2026-10-17T19:30:00Z")]
          : instant?.startsWith("2026-10-16")
            ? [meeting("espn-411", "2026-10-16T19:30:00Z")]
            : [],
      slateProbeInstants("2026-10-18T12:54:00Z", 3),
    );

    const eventId = await resolveLegEventId(
      fake as unknown as SupabaseClient,
      USER,
      leg({
        league: "NCAAF",
        matchup: { awayTeamName: "Auburn", homeTeamName: "Georgia Bulldogs" },
      }),
      deps({ teams: [], loadSchedule }),
    );

    expect(eventId).toBeUndefined();
    expect(fake.tables.events).toHaveLength(0);
    expect(fake.tables.teams ?? []).toHaveLength(0);
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

  it("asks the provider for the slate the instant belongs to", async () => {
    const fetchSchedule = vi.fn(async () => [scheduled]);
    const load = cachedScheduleLoader(fetchSchedule, () => "20261017");

    await load("college-football", "2026-10-18T02:15:00Z");

    expect(fetchSchedule).toHaveBeenCalledWith("college-football", "20261017");
  });

  it("shares one request between two kickoffs on the same slate", async () => {
    // The point of keying on the slate rather than the instant: a parlay across
    // the day's noon and night games is one scoreboard, so it must be one
    // request. Keying on the instant would fetch the same slate twice.
    const fetchSchedule = vi.fn(async () => [scheduled]);
    const load = cachedScheduleLoader(fetchSchedule, (instant) =>
      instant.slice(0, 10).replace(/-/g, ""),
    );

    await Promise.all([
      load("college-football", "2026-10-17T16:00:00Z"),
      load("college-football", "2026-10-17T23:30:00Z"),
    ]);

    expect(fetchSchedule).toHaveBeenCalledTimes(1);
  });

  it("keeps two different slates apart", async () => {
    const fetchSchedule = vi.fn(async () => [scheduled]);
    const load = cachedScheduleLoader(fetchSchedule, (instant) =>
      instant.slice(0, 10).replace(/-/g, ""),
    );

    await Promise.all([
      load("college-football", "2026-10-17T16:00:00Z"),
      load("college-football", "2026-10-24T16:00:00Z"),
    ]);

    expect(fetchSchedule).toHaveBeenCalledTimes(2);
  });

  it("asks for the current slate when no instant is given", async () => {
    const fetchSchedule = vi.fn(async () => [scheduled]);
    const load = cachedScheduleLoader(fetchSchedule, () => "20261017");

    await load("nfl");

    expect(fetchSchedule).toHaveBeenCalledWith("nfl", undefined);
  });
});

describe("slateProbeInstants", () => {
  it("offers the anchor's own day first, then each day before it", () => {
    expect(slateProbeInstants("2026-10-18T12:54:00Z", 3)).toEqual([
      "2026-10-18T12:54:00.000Z",
      "2026-10-17T12:54:00.000Z",
      "2026-10-16T12:54:00.000Z",
      "2026-10-15T12:54:00.000Z",
    ]);
  });

  it("offers the anchor alone when asked to look no further back", () => {
    expect(slateProbeInstants("2026-10-18T12:54:00Z", 0)).toEqual(["2026-10-18T12:54:00.000Z"]);
  });

  it("treats a negative reach as no reach rather than counting upward", () => {
    expect(slateProbeInstants("2026-10-18T12:54:00Z", -2)).toEqual(["2026-10-18T12:54:00.000Z"]);
  });

  it("offers nothing for an anchor it cannot read, so no probing happens", () => {
    // A ticket with an unparseable placed date should fall back to searching
    // nothing, not to searching from the epoch.
    expect(slateProbeInstants("not a date", 3)).toEqual([]);
    expect(slateProbeInstants("", 3)).toEqual([]);
  });
});

describe("withSlateProbe", () => {
  it("searches every probed slate and returns their games together", async () => {
    // The Saturday college slate is invisible to a Sunday-morning import, so
    // the day before has to be searched too.
    const saturday: ProviderEvent = { ...scheduled, providerEventId: "espn-sat" };
    const load = vi.fn(async (_sport: string, instant?: string) =>
      instant?.startsWith("2026-10-17") ? [saturday] : [],
    );

    const probed = withSlateProbe(load, slateProbeInstants("2026-10-18T12:54:00Z", 3));
    const games = await probed("college-football");

    expect(games).toEqual([saturday]);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("defers to a printed kickoff instead of searching around it", async () => {
    // The slip named the slate outright, so a wider search could only add
    // candidates and turn a clean match into an ambiguous one.
    const load = vi.fn(async () => [scheduled]);
    const probed = withSlateProbe(load, slateProbeInstants("2026-10-18T12:54:00Z", 3));

    await probed("nfl", "2026-10-12T17:00:00Z");

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("nfl", "2026-10-12T17:00:00Z");
  });

  it("counts a game found on two probed slates once", async () => {
    // Two candidates for one game would be refused as ambiguous, which is the
    // opposite of what probing wider is for — and it would fail silently.
    const load = vi.fn(async () => [scheduled]);
    const probed = withSlateProbe(load, slateProbeInstants("2026-10-18T12:54:00Z", 2));

    await expect(probed("nfl")).resolves.toEqual([scheduled]);
  });

  it("leaves the loader alone when there is nothing to probe", async () => {
    // No anchor means no date signal at all, so this must not quietly become a
    // request for the current slate on top of the one the loader already makes.
    const load = vi.fn(async () => [scheduled]);

    expect(withSlateProbe(load, [])).toBe(load);
  });
});
