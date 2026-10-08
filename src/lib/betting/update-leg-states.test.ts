import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateLegStates } from "./update-leg-states";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";

const USER = "user-1";
const EVENT = "event-1";
const HOME = "team-dal";
const AWAY = "team-tb";

interface SeedOptions {
  leg?: Record<string, unknown>;
  event?: Record<string, unknown>;
  subjects?: Record<string, unknown>[];
  links?: Record<string, unknown>[];
}

function seed(options: SeedOptions = {}) {
  return createFakeSupabase({
    bet_legs: [
      {
        id: "leg-1",
        user_id: USER,
        market_type: "spread",
        line: -3.5,
        automatic_live_state: null,
        automatic_status: null,
        manual_live_state: null,
        live_detail: null,
        automatic_changed_at: null,
        ...options.leg,
      },
    ],
    bet_leg_events: options.links ?? [
      { id: "link-1", user_id: USER, bet_leg_id: "leg-1", event_id: EVENT, match_method: "auto" },
    ],
    bet_leg_subjects: options.subjects ?? [
      { id: "s-1", user_id: USER, bet_leg_id: "leg-1", team_id: HOME, direction: "for" },
      { id: "s-2", user_id: USER, bet_leg_id: "leg-1", team_id: AWAY, direction: "against" },
    ],
    events: [
      {
        id: EVENT,
        user_id: USER,
        home_team_id: HOME,
        away_team_id: AWAY,
        automatic_status: "in_progress",
        manual_status: null,
        automatic_home_score: 21,
        manual_home_score: null,
        automatic_away_score: 17,
        manual_away_score: null,
        ...options.event,
      },
    ],
  });
}

function run(
  fake: ReturnType<typeof createFakeSupabase>,
  eventIds = [EVENT],
  playerStats?: Map<string, Record<string, number>>,
) {
  return updateLegStates(fake as unknown as SupabaseClient, {
    userId: USER,
    eventIds,
    playerStats,
    now: () => "2026-10-08T20:30:00.000Z",
  });
}

/** A prop leg on one player, the shape applyPlayerStats feeds. */
function propSeed(marketType: string, line: number | null) {
  return seed({
    leg: { market_type: marketType, line },
    subjects: [
      {
        id: "s-1",
        user_id: USER,
        bet_leg_id: "leg-1",
        participant_id: "part-1",
        team_id: null,
        direction: "for",
      },
    ],
  });
}

describe("updateLegStates", () => {
  it("writes the live state of a leg riding on a refreshed Event", async () => {
    const fake = seed();
    expect(await run(fake)).toEqual({ updated: 1, unchanged: 0 });

    const leg = fake.tables.bet_legs[0];
    expect(leg.automatic_live_state).toBe("winning");
    expect(leg.live_detail).toBe("covering by 0.5");
    // Still open: the game is in progress, so nothing is settled yet.
    expect(leg.automatic_status).toBeNull();
    expect(leg.automatic_changed_at).toBe("2026-10-08T20:30:00.000Z");
  });

  it("settles the leg once the Event is final", async () => {
    const fake = seed({ event: { automatic_status: "final" } });
    await run(fake);

    const leg = fake.tables.bet_legs[0];
    expect(leg.automatic_status).toBe("won");
    expect(leg.automatic_live_state).toBe("winning");
  });

  it("does not write, or re-stamp, when the state has not moved", async () => {
    // §45: automatic_changed_at defines override staleness, so bumping it on an
    // unchanged refresh would mark every manual override stale within a minute.
    const fake = seed({
      leg: {
        automatic_live_state: "winning",
        live_detail: "covering by 0.5",
        automatic_changed_at: "2026-10-08T20:00:00.000Z",
      },
    });
    expect(await run(fake)).toEqual({ updated: 0, unchanged: 1 });
    expect(fake.tables.bet_legs[0].automatic_changed_at).toBe("2026-10-08T20:00:00.000Z");
  });

  it("never clears a manual live state", async () => {
    // §45: the manual value outranks the automatic one and must survive.
    const fake = seed({ leg: { manual_live_state: "losing" } });
    await run(fake);

    const leg = fake.tables.bet_legs[0];
    expect(leg.manual_live_state).toBe("losing");
    // The automatic value still updates underneath it.
    expect(leg.automatic_live_state).toBe("winning");
  });

  it("leaves a stored state alone when the Event stops reporting a score", async () => {
    // A provider blip must not blank a chip the user is watching.
    const fake = seed({
      leg: { automatic_live_state: "winning", live_detail: "covering by 0.5" },
      event: { automatic_home_score: null, automatic_away_score: null },
    });
    expect(await run(fake)).toEqual({ updated: 0, unchanged: 1 });
    expect(fake.tables.bet_legs[0].automatic_live_state).toBe("winning");
  });

  it("follows a manually corrected score rather than the provider's", async () => {
    // §45 makes the manual score what the user sees; the chip has to agree with
    // the scoreline printed next to it.
    const fake = seed({ event: { manual_home_score: 17, manual_away_score: 21 } });
    await run(fake);
    expect(fake.tables.bet_legs[0].automatic_live_state).toBe("losing");
  });

  it("leaves a leg linked to several Events to the user", async () => {
    // One scoreline cannot settle a cross-game leg.
    const fake = seed({
      links: [
        { id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: EVENT, match_method: "auto" },
        { id: "l-2", user_id: USER, bet_leg_id: "leg-1", event_id: "event-2", match_method: "auto" },
      ],
    });
    expect(await run(fake)).toEqual({ updated: 0, unchanged: 1 });
    expect(fake.tables.bet_legs[0].automatic_live_state).toBeNull();
  });

  it("leaves a player prop alone when no stats were supplied", async () => {
    const fake = propSeed("receiving_yards", 65.5);
    expect(await run(fake)).toEqual({ updated: 0, unchanged: 1 });
    expect(fake.tables.bet_legs[0].automatic_live_state).toBeNull();
  });

  it("writes a prop's live state from the backed player's stat line", async () => {
    const fake = propSeed("receiving_yards", 65.5);
    expect(await run(fake, [EVENT], new Map([["part-1", { recYards: 72 }]]))).toEqual({
      updated: 1,
      unchanged: 0,
    });

    const leg = fake.tables.bet_legs[0];
    expect(leg.automatic_live_state).toBe("winning");
    expect(leg.live_detail).toBe("72 rec yds of 65.5");
  });

  it("leaves a prop alone when the stats are for a different player", async () => {
    // An unmatched participant must not borrow another player's numbers.
    const fake = propSeed("receiving_yards", 65.5);
    expect(await run(fake, [EVENT], new Map([["part-2", { recYards: 72 }]]))).toEqual({
      updated: 0,
      unchanged: 1,
    });
    expect(fake.tables.bet_legs[0].automatic_live_state).toBeNull();
  });

  it("settles a prop once the game is final", async () => {
    const fake = seed({
      leg: { market_type: "anytime_touchdown", line: null },
      event: { automatic_status: "final" },
      subjects: [
        {
          id: "s-1",
          user_id: USER,
          bet_leg_id: "leg-1",
          participant_id: "part-1",
          team_id: null,
          direction: "for",
        },
      ],
    });
    await run(fake, [EVENT], new Map([["part-1", { recTd: 1 }]]));
    expect(fake.tables.bet_legs[0].automatic_status).toBe("won");
  });

  it("does nothing when no leg rides on the refreshed Events", async () => {
    const fake = seed({ links: [] });
    expect(await run(fake)).toEqual({ updated: 0, unchanged: 0 });
  });

  it("does nothing for an empty Event list", async () => {
    expect(await run(seed(), [])).toEqual({ updated: 0, unchanged: 0 });
  });

  it("ignores another user's links", async () => {
    const fake = seed({
      links: [{ id: "l-1", user_id: "user-2", bet_leg_id: "leg-1", event_id: EVENT, match_method: "auto" }],
    });
    expect(await run(fake)).toEqual({ updated: 0, unchanged: 0 });
    expect(fake.tables.bet_legs[0].automatic_live_state).toBeNull();
  });

  it("re-evaluates a leg added since the last refresh, on an unchanged Event", async () => {
    // Why touchedEventIds includes unchanged Events: a bet placed at halftime
    // must not wait for the next score to show a state.
    const fake = seed();
    expect(await run(fake)).toEqual({ updated: 1, unchanged: 0 });
    expect(fake.tables.bet_legs[0].automatic_live_state).toBe("winning");
  });
});
