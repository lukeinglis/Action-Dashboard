import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyScoringPlays, mergeStatsByEvent } from "./apply-scoring-plays";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { DEFAULT_PROVIDER_CONFIG, type ProviderScoringPlay, type SportsProvider } from "@/lib/providers/types";

const USER = "user-1";
const EVENT = "event-1";

const henryScoredFirst: ProviderScoringPlay[] = [
  { sequence: 1, kind: "touchdown", scorerName: "Derrick Henry", teamAbbreviation: "BAL" },
];

function fakeProvider(
  plays: ProviderScoringPlay[] | Error,
): SportsProvider & { calls: { sport: string; providerEventId: string }[] } {
  const calls: { sport: string; providerEventId: string }[] = [];
  return {
    key: "espn",
    config: DEFAULT_PROVIDER_CONFIG,
    supportsSport: () => true,
    getSchedule: async () => [],
    async getScoringPlays(params) {
      calls.push(params);
      if (plays instanceof Error) throw plays;
      return plays;
    },
    calls,
  };
}

interface SeedOptions {
  legs?: Record<string, unknown>[];
  links?: Record<string, unknown>[];
  mappings?: Record<string, unknown>[];
}

function seed(options: SeedOptions = {}) {
  return createFakeSupabase({
    bet_legs: options.legs ?? [
      { id: "leg-1", user_id: USER, market_type: "first_touchdown", automatic_status: null },
    ],
    bet_leg_events: options.links ?? [
      { id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: EVENT, match_method: "auto" },
    ],
    bet_leg_subjects: [
      { id: "s-1", user_id: USER, bet_leg_id: "leg-1", participant_id: "part-1", direction: "for" },
    ],
    participants: [
      { id: "part-1", user_id: USER, name: "Derrick Henry", sport: "football", team_id: "team-bal" },
    ],
    teams: [{ id: "team-bal", user_id: USER, sport: "football", abbreviation: "BAL" }],
    provider_mappings: options.mappings ?? [
      {
        id: "m-1",
        user_id: USER,
        entity_type: "event",
        entity_id: EVENT,
        provider_key: "espn",
        provider_id: "401872973",
        match_method: "auto",
        locked: false,
      },
    ],
  });
}

function run(
  fake: ReturnType<typeof createFakeSupabase>,
  provider: SportsProvider,
  eventIds = [EVENT],
) {
  return applyScoringPlays(fake as unknown as SupabaseClient, provider, {
    userId: USER,
    providerKey: "espn",
    providerSport: "nfl",
    sport: "football",
    eventIds,
  });
}

describe("applyScoringPlays", () => {
  it("grades a first-scorer leg off the Event's own scoring feed", async () => {
    const provider = fakeProvider(henryScoredFirst);
    const result = await run(seed(), provider);

    expect(provider.calls).toEqual([{ sport: "nfl", providerEventId: "401872973" }]);
    expect(result.requestCount).toBe(1);
    expect(result.statsByEvent.get(EVENT)?.get("part-1")).toEqual({ firstTd: 1 });
  });

  it("spends nothing when no leg needs scoring order", async () => {
    // The cost control that makes a per-Event feed affordable: a user with no
    // first-scorer bets pays for none of it.
    const provider = fakeProvider(henryScoredFirst);
    const fake = seed({
      legs: [{ id: "leg-1", user_id: USER, market_type: "anytime_touchdown", automatic_status: null }],
    });

    expect(await run(fake, provider)).toMatchObject({ requestCount: 0 });
    expect(provider.calls).toEqual([]);
  });

  it("does not re-read a game whose leg is already graded", async () => {
    // §22.1 cost: the settlement backfill spans fourteen days, so re-reading
    // every finished game on every refresh would be the whole expense of the
    // backfill spent on answers already stored.
    const provider = fakeProvider(henryScoredFirst);
    const fake = seed({
      legs: [{ id: "leg-1", user_id: USER, market_type: "first_touchdown", automatic_status: "won" }],
    });

    expect(await run(fake, provider)).toMatchObject({ requestCount: 0 });
  });

  it("skips an Event that was never matched to a provider record", async () => {
    // No mapping means there is no feed to ask for. The leg stays open rather
    // than being graded against a guess.
    const provider = fakeProvider(henryScoredFirst);
    const result = await run(seed({ mappings: [] }), provider);

    expect(result.requestCount).toBe(0);
    expect(result.statsByEvent.size).toBe(0);
  });

  it("ignores a leg riding on an Event this refresh did not touch", async () => {
    const provider = fakeProvider(henryScoredFirst);
    expect(await run(seed(), provider, ["event-elsewhere"])).toMatchObject({ requestCount: 0 });
  });

  it("reports a feed failure without losing the other Events", async () => {
    // §22: a failed feed must leave the scorelines and every other market
    // alone, so this is reported rather than thrown.
    const provider = fakeProvider(new Error("ESPN request failed: 503"));
    const result = await run(seed(), provider);

    expect(result.error).toMatch(/503/);
    expect(result.statsByEvent.size).toBe(0);
    expect(result.requestCount).toBe(1);
  });

  it("does nothing for a provider with no scoring feed", async () => {
    const noFeed: SportsProvider = {
      key: "espn",
      config: DEFAULT_PROVIDER_CONFIG,
      supportsSport: () => true,
      getSchedule: async () => [],
    };
    expect(await run(seed(), noFeed)).toMatchObject({ requestCount: 0 });
  });

  it("ignores another user's legs", async () => {
    const provider = fakeProvider(henryScoredFirst);
    const fake = seed({
      legs: [{ id: "leg-1", user_id: "user-2", market_type: "first_touchdown", automatic_status: null }],
    });
    expect(await run(fake, provider)).toMatchObject({ requestCount: 0 });
  });

  it("asks once per Event, not once per leg", async () => {
    const provider = fakeProvider(henryScoredFirst);
    const fake = seed({
      legs: [
        { id: "leg-1", user_id: USER, market_type: "first_touchdown", automatic_status: null },
        { id: "leg-2", user_id: USER, market_type: "first_touchdown", automatic_status: null },
      ],
      links: [
        { id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: EVENT, match_method: "auto" },
        { id: "l-2", user_id: USER, bet_leg_id: "leg-2", event_id: EVENT, match_method: "auto" },
      ],
    });

    expect(await run(fake, provider)).toMatchObject({ requestCount: 1 });
  });
});

describe("mergeStatsByEvent", () => {
  const weekly = (): Map<string, Map<string, Record<string, number>>> =>
    new Map([
      [
        "event-a",
        new Map<string, Record<string, number>>([
          ["part-1", { rushTd: 1, rushYards: 40 }],
          ["part-2", { recYards: 20 }],
        ]),
      ],
    ]);

  it("adds the scoring-order stat beside the weekly numbers", () => {
    const merged = mergeStatsByEvent(weekly(), new Map([["event-a", new Map([["part-1", { firstTd: 1 }]])]]));

    expect(merged.get("event-a")?.get("part-1")).toEqual({ rushTd: 1, rushYards: 40, firstTd: 1 });
    expect(merged.get("event-a")?.get("part-2")).toEqual({ recYards: 20 });
  });

  it("does not leak one game's first scorer into the rest of its week", () => {
    // Events sharing a week share one stats map by reference, so writing into
    // it would credit every game that week with the same first touchdown.
    const shared = new Map([["part-1", { rushTd: 1 }]]);
    const base = new Map([
      ["event-a", shared],
      ["event-b", shared],
    ]);

    const merged = mergeStatsByEvent(base, new Map([["event-a", new Map([["part-1", { firstTd: 1 }]])]]));

    expect(merged.get("event-a")?.get("part-1")).toEqual({ rushTd: 1, firstTd: 1 });
    expect(merged.get("event-b")?.get("part-1")).toEqual({ rushTd: 1 });
    expect(shared.get("part-1")).toEqual({ rushTd: 1 });
  });

  it("carries an Event the weekly stats said nothing about", () => {
    const merged = mergeStatsByEvent(undefined, new Map([["event-c", new Map([["part-9", { firstTd: 0 }]])]]));
    expect(merged.get("event-c")?.get("part-9")).toEqual({ firstTd: 0 });
  });

  it("leaves the weekly stats alone when there is nothing to merge", () => {
    const merged = mergeStatsByEvent(weekly(), new Map());
    expect(merged.get("event-a")?.size).toBe(2);
  });
});
