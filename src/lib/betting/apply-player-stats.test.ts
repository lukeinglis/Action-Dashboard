import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlayerStats } from "./apply-player-stats";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { ProviderPlayerStat } from "@/lib/providers/types";

const USER = "user-1";

const EGBUKA: ProviderPlayerStat = {
  providerPlayerId: "4984",
  playerName: "Devin Egbuka",
  teamAbbreviation: "TB",
  stats: { recYards: 41, receptions: 4 },
};
const EVANS: ProviderPlayerStat = {
  providerPlayerId: "3321",
  playerName: "Mike Evans",
  teamAbbreviation: "TB",
  stats: { recYards: 88, receptions: 6 },
};

interface SeedOptions {
  legs?: Record<string, unknown>[];
  subjects?: Record<string, unknown>[];
  participants?: Record<string, unknown>[];
  mappings?: Record<string, unknown>[];
}

function seed(options: SeedOptions = {}) {
  return createFakeSupabase({
    bet_legs: options.legs ?? [
      { id: "leg-1", user_id: USER, market_type: "receiving_yards", line: 65.5 },
    ],
    bet_leg_subjects: options.subjects ?? [
      {
        id: "s-1",
        user_id: USER,
        bet_leg_id: "leg-1",
        participant_id: "part-1",
        team_id: null,
        direction: "for",
      },
    ],
    participants: options.participants ?? [
      {
        id: "part-1",
        user_id: USER,
        type: "player",
        sport: "football",
        league: "NFL",
        name: "D. Egbuka",
        team_id: "team-tb",
      },
    ],
    teams: [{ id: "team-tb", user_id: USER, sport: "football", abbreviation: "TB" }],
    provider_mappings: options.mappings ?? [],
  });
}

function run(fake: ReturnType<typeof createFakeSupabase>, stats: ProviderPlayerStat[]) {
  return applyPlayerStats(fake as unknown as SupabaseClient, stats, {
    userId: USER,
    providerKey: "sleeper",
    sport: "football",
  });
}

describe("applyPlayerStats", () => {
  it("maps a prop participant to the provider's player and returns their numbers", async () => {
    const fake = seed();
    const result = await run(fake, [EGBUKA, EVANS]);

    expect(result.participantMappingsCreated).toBe(1);
    expect(result.statsByParticipant.get("part-1")).toEqual({ recYards: 41, receptions: 4 });
    expect(fake.tables.provider_mappings[0]).toMatchObject({
      user_id: USER,
      entity_type: "participant",
      entity_id: "part-1",
      provider_key: "sleeper",
      provider_id: "4984",
      match_method: "auto",
      locked: false,
    });
  });

  it("reuses an existing mapping without writing a second one", async () => {
    // §20.2: a mapping the user may have fixed by hand is never overridden, and
    // a refresh must not accumulate duplicates.
    const fake = seed({
      mappings: [
        {
          id: "m-1",
          user_id: USER,
          entity_type: "participant",
          entity_id: "part-1",
          provider_key: "sleeper",
          provider_id: "3321",
          match_method: "manual",
          locked: false,
        },
      ],
    });
    const result = await run(fake, [EGBUKA, EVANS]);

    expect(result.participantMappingsCreated).toBe(0);
    expect(fake.tables.provider_mappings).toHaveLength(1);
    // The hand-fixed mapping is what supplies the numbers.
    expect(result.statsByParticipant.get("part-1")).toEqual({ recYards: 88, receptions: 6 });
  });

  it("reports an ambiguity rather than mapping a guess", async () => {
    const fake = seed({
      participants: [
        {
          id: "part-1",
          user_id: USER,
          type: "player",
          sport: "football",
          league: "NFL",
          name: "Allen",
          team_id: null,
        },
      ],
    });
    const result = await run(fake, [
      { providerPlayerId: "1", playerName: "Josh Allen", stats: { rushYards: 20 } },
      { providerPlayerId: "2", playerName: "Brian Allen", stats: { rushYards: 0 } },
    ]);

    expect(fake.tables.provider_mappings).toHaveLength(0);
    expect(result.statsByParticipant.size).toBe(0);
    expect(result.needsMatch).toEqual([
      { participantId: "part-1", name: "Allen", candidateProviderIds: ["1", "2"] },
    ]);
  });

  it("holds a mapping whose player the provider is not reporting this week", async () => {
    // A bye or an inactive: the mapping is still right, there is just nothing
    // to compare against, so the leg stays silent.
    const fake = seed({
      mappings: [
        {
          id: "m-1",
          user_id: USER,
          entity_type: "participant",
          entity_id: "part-1",
          provider_key: "sleeper",
          provider_id: "9999",
          match_method: "auto",
          locked: false,
        },
      ],
    });
    const result = await run(fake, [EGBUKA]);

    expect(result.statsByParticipant.size).toBe(0);
    expect(fake.tables.provider_mappings).toHaveLength(1);
  });

  it("ignores a participant whose only legs are markets no stat line answers", async () => {
    // A season future on a player has a participant too; a week's stats say
    // nothing about it, so there is no mapping worth making from it.
    const fake = seed({
      legs: [{ id: "leg-1", user_id: USER, market_type: "season_future", line: null }],
    });
    const result = await run(fake, [EGBUKA]);

    expect(result.participantMappingsCreated).toBe(0);
    expect(result.statsByParticipant.size).toBe(0);
  });

  it("ignores a participant from another sport", async () => {
    const fake = seed({
      participants: [
        {
          id: "part-1",
          user_id: USER,
          type: "player",
          sport: "golf",
          league: "PGA",
          name: "D. Egbuka",
          team_id: null,
        },
      ],
    });
    expect((await run(fake, [EGBUKA])).participantMappingsCreated).toBe(0);
  });

  it("ignores another user's legs", async () => {
    const fake = seed({
      subjects: [
        {
          id: "s-1",
          user_id: "user-2",
          bet_leg_id: "leg-1",
          participant_id: "part-1",
          team_id: null,
          direction: "for",
        },
      ],
    });
    expect((await run(fake, [EGBUKA])).participantMappingsCreated).toBe(0);
  });

  it("does nothing when the provider returned no stats", async () => {
    // Not the same as no match: an empty answer says nothing about any player,
    // and matching against it would report every participant as unmatched.
    const fake = seed();
    const result = await run(fake, []);
    expect(result).toEqual({
      statsByParticipant: new Map(),
      participantMappingsCreated: 0,
      needsMatch: [],
    });
  });

  it("does nothing when no leg is a prop", async () => {
    const fake = seed({ legs: [] });
    expect((await run(fake, [EGBUKA])).participantMappingsCreated).toBe(0);
  });

  it("maps each of a parlay's players once", async () => {
    const fake = seed({
      legs: [
        { id: "leg-1", user_id: USER, market_type: "receiving_yards", line: 65.5 },
        { id: "leg-2", user_id: USER, market_type: "anytime_touchdown", line: null },
      ],
      subjects: [
        { id: "s-1", user_id: USER, bet_leg_id: "leg-1", participant_id: "part-1", team_id: null, direction: "for" },
        { id: "s-2", user_id: USER, bet_leg_id: "leg-2", participant_id: "part-2", team_id: null, direction: "for" },
        // The same player again, on a second leg of the same parlay.
        { id: "s-3", user_id: USER, bet_leg_id: "leg-2", participant_id: "part-1", team_id: null, direction: "for" },
      ],
      participants: [
        { id: "part-1", user_id: USER, type: "player", sport: "football", name: "D. Egbuka", team_id: "team-tb" },
        { id: "part-2", user_id: USER, type: "player", sport: "football", name: "Mike Evans", team_id: "team-tb" },
      ],
    });
    const result = await run(fake, [EGBUKA, EVANS]);

    expect(result.participantMappingsCreated).toBe(2);
    expect(fake.tables.provider_mappings).toHaveLength(2);
    expect(result.statsByParticipant.size).toBe(2);
  });
});
