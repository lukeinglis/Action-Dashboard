import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { MatchCandidates } from "@/lib/import/match-parsed-legs";
import { loadRepairableLegs, planLegRepair, repairLegs, type StoredLeg } from "./repair-legs";

const USER = "user-1";
const TZ = "America/New_York";

const candidates: MatchCandidates = {
  teams: [
    { id: "team-jax", sport: "football", name: "Jacksonville Jaguars", abbreviation: "JAX" },
    { id: "team-cin", sport: "football", name: "Cincinnati Bengals", abbreviation: "CIN" },
  ],
  participants: [],
  events: [
    {
      id: "event-jaxcin",
      sport: "football",
      league: "NFL",
      name: "Jacksonville Jaguars @ Cincinnati Bengals",
      startTimeUtc: "2026-10-04T17:05:00Z",
      awayTeamId: "team-jax",
      homeTeamId: "team-cin",
    },
  ],
};

// Verbatim blocks from the author's own saved legs, including the missing
// "Start:" line that is what defeated Event matching in the first place.
const MONEYLINE = `Market: moneyline
Selection: JAX Jaguars
Event: JAX @ CIN
Sport: football/NFL
Odds: +124`;

const GOLF_OUTRIGHT = `Market: winner
Selection: Jackson Koivun
Sport: golf
Odds: +10000`;

const EPL_TEAM_TOTAL = `Market: team_total
Selection: Chelsea Over 4.5
Subject: Chelsea
Event: Chelsea @ Bournemouth
Sport: soccer/EPL
Line: 4.5
OverUnder: over`;

const PASSING_YARDS = `Market: passing_yards
Selection: Marcus Mariota Over 249.5
Subject: Marcus Mariota
Event: JAX @ CIN
Sport: football/NFL
Line: 249.5
OverUnder: over`;

function leg(overrides: Partial<StoredLeg> = {}): StoredLeg {
  return {
    id: "leg-1",
    sport: "football",
    league: "NFL",
    rawDescription: MONEYLINE,
    hasEventLink: false,
    subjects: [],
    ...overrides,
  };
}

describe("planLegRepair", () => {
  it("links a leg to its game even though the slip printed no kickoff", () => {
    // The whole reason these legs were orphaned: with no "Start:" line there is
    // no date to key on, so only the team pair can find the game.
    const plan = planLegRepair(leg(), candidates, TZ);

    expect(plan?.linkEventId).toBe("event-jaxcin");
    expect(plan?.unlinkable).toBeUndefined();
  });

  it("turns a leg rooting against the team the user backed back around", () => {
    // The dangerous case. "JAX Jaguars" did not string-equal the event side
    // "JAX", so the backed team was taken for the opponent and stored
    // "against" — a Jaguars win would have been recorded as a loss.
    const plan = planLegRepair(
      leg({
        hasEventLink: true,
        subjects: [
          { teamId: "team-jax", participantId: null, direction: "against", directionSource: "auto" },
        ],
      }),
      candidates,
      TZ,
    );

    expect(plan?.subjects).toEqual([
      { teamId: "team-jax", participantId: undefined, direction: "for" },
      { teamId: "team-cin", participantId: undefined, direction: "against" },
    ]);
  });

  it("leaves a healthy leg completely alone", () => {
    // Returning null is what keeps a refresh over correct legs free of writes.
    const plan = planLegRepair(
      leg({
        hasEventLink: true,
        subjects: [
          { teamId: "team-jax", participantId: null, direction: "for", directionSource: "auto" },
          { teamId: "team-cin", participantId: null, direction: "against", directionSource: "auto" },
        ],
      }),
      candidates,
      TZ,
    );

    expect(plan).toBeNull();
  });

  it("never overrides a direction the user set by hand", () => {
    // §45: a manual value outranks anything computed, even when the computed
    // one is the corrected proposal.
    const plan = planLegRepair(
      leg({
        hasEventLink: true,
        subjects: [
          { teamId: "team-jax", participantId: null, direction: "against", directionSource: "manual" },
          { teamId: "team-cin", participantId: null, direction: "against", directionSource: "auto" },
        ],
      }),
      candidates,
      TZ,
    );

    expect(plan).toBeNull();
  });

  it("reports an outright as a future rather than pretending it can be graded", () => {
    // A tournament winner names no game, so no scoreline will ever settle it.
    const plan = planLegRepair(leg({ sport: "golf", league: null, rawDescription: GOLF_OUTRIGHT }), candidates, TZ);

    expect(plan?.unlinkable).toBe("future");
    expect(plan?.linkEventId).toBeUndefined();
    expect(plan?.subjects).toEqual([]);
  });

  it("reports a leg on teams we do not carry separately from a future", () => {
    // There is a real game here; we just have no soccer teams to match it to.
    // Collapsing this into "future" would hide a gap the user can close.
    const plan = planLegRepair(
      leg({ sport: "soccer", league: "EPL", rawDescription: EPL_TEAM_TOTAL }),
      candidates,
      TZ,
    );

    expect(plan?.unlinkable).toBe("unknown_teams");
  });

  it("recovers a player prop whose subject was dropped for having no Participant", () => {
    // §26.2 stores Over/Under in the direction, so the dropped subject took the
    // meaning of the bet with it.
    const plan = planLegRepair(
      leg({ hasEventLink: true, rawDescription: PASSING_YARDS }),
      candidates,
      TZ,
    );

    expect(plan?.subjects).toEqual([{ createParticipantNamed: "Marcus Mariota", direction: "for" }]);
  });

  it("skips a leg whose text cannot be read back", () => {
    expect(planLegRepair(leg({ rawDescription: null }), candidates, TZ)).toBeNull();
    expect(planLegRepair(leg({ rawDescription: "Shipped without a Market line" }), candidates, TZ)).toBeNull();
  });
});

describe("repairLegs", () => {
  it("links the game and writes both sides for an orphaned moneyline", async () => {
    const fake = createFakeSupabase({ bet_leg_events: [], bet_leg_subjects: [] });

    const result = await repairLegs(fake as unknown as SupabaseClient, USER, [leg()], {
      candidates,
      timeZone: TZ,
    });

    expect(result).toMatchObject({ legsRepaired: 1, eventsLinked: 1, subjectsWritten: 2 });
    expect(fake.tables.bet_leg_events[0]).toMatchObject({
      user_id: USER,
      bet_leg_id: "leg-1",
      event_id: "event-jaxcin",
      match_method: "auto",
    });
    expect(fake.tables.bet_leg_subjects).toHaveLength(2);
    expect(fake.tables.bet_leg_subjects.map((s) => [s.team_id, s.direction])).toEqual([
      ["team-jax", "for"],
      ["team-cin", "against"],
    ]);
  });

  it("corrects the stored row in place rather than adding a second subject", async () => {
    const fake = createFakeSupabase({
      bet_leg_events: [{ id: "link-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-jaxcin" }],
      bet_leg_subjects: [
        {
          id: "subject-1",
          user_id: USER,
          bet_leg_id: "leg-1",
          team_id: "team-jax",
          participant_id: null,
          direction: "against",
          direction_source: "auto",
        },
      ],
    });

    await repairLegs(
      fake as unknown as SupabaseClient,
      USER,
      [
        leg({
          hasEventLink: true,
          subjects: [
            { teamId: "team-jax", participantId: null, direction: "against", directionSource: "auto" },
          ],
        }),
      ],
      { candidates, timeZone: TZ },
    );

    const jax = fake.tables.bet_leg_subjects.filter((s) => s.team_id === "team-jax");
    expect(jax).toHaveLength(1);
    expect(jax[0]).toMatchObject({ id: "subject-1", direction: "for" });
  });

  it("creates the Participant a recovered player prop needs", async () => {
    const fake = createFakeSupabase({ bet_leg_events: [], bet_leg_subjects: [], participants: [] });

    await repairLegs(
      fake as unknown as SupabaseClient,
      USER,
      [leg({ hasEventLink: true, rawDescription: PASSING_YARDS })],
      { candidates, timeZone: TZ },
    );

    expect(fake.tables.participants).toHaveLength(1);
    expect(fake.tables.participants[0]).toMatchObject({ name: "Marcus Mariota", sport: "football" });
    expect(fake.tables.bet_leg_subjects[0]).toMatchObject({
      participant_id: fake.tables.participants[0].id,
      direction: "for",
    });
  });

  it("counts what only a human can settle without touching it", async () => {
    const fake = createFakeSupabase({ bet_leg_events: [], bet_leg_subjects: [] });

    const result = await repairLegs(
      fake as unknown as SupabaseClient,
      USER,
      [
        leg({ id: "leg-golf", sport: "golf", league: null, rawDescription: GOLF_OUTRIGHT }),
        leg({ id: "leg-epl", sport: "soccer", league: "EPL", rawDescription: EPL_TEAM_TOTAL }),
      ],
      { candidates, timeZone: TZ },
    );

    expect(result).toEqual({ legsRepaired: 0, eventsLinked: 0, subjectsWritten: 0, futures: 1, unresolved: 1 });
    expect(fake.tables.bet_leg_events).toHaveLength(0);
  });

  it("writes nothing at all when every leg is already correct", async () => {
    const fake = createFakeSupabase({ bet_leg_events: [], bet_leg_subjects: [] });

    const result = await repairLegs(
      fake as unknown as SupabaseClient,
      USER,
      [
        leg({
          hasEventLink: true,
          subjects: [
            { teamId: "team-jax", participantId: null, direction: "for", directionSource: "auto" },
            { teamId: "team-cin", participantId: null, direction: "against", directionSource: "auto" },
          ],
        }),
      ],
      { candidates, timeZone: TZ },
    );

    expect(result).toEqual({ legsRepaired: 0, eventsLinked: 0, subjectsWritten: 0, futures: 0, unresolved: 0 });
    expect(fake.tables.bet_leg_subjects).toHaveLength(0);
  });
});

describe("loadRepairableLegs", () => {
  it("gathers each leg's existing link and subject state", async () => {
    const fake = createFakeSupabase({
      bet_legs: [
        { id: "leg-1", user_id: USER, sport: "football", league: "NFL", raw_description: MONEYLINE },
        { id: "leg-2", user_id: USER, sport: "golf", league: null, raw_description: GOLF_OUTRIGHT },
      ],
      bet_leg_events: [{ id: "link-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-jaxcin" }],
      bet_leg_subjects: [
        {
          id: "subject-1",
          user_id: USER,
          bet_leg_id: "leg-1",
          team_id: "team-jax",
          participant_id: null,
          direction: "against",
          direction_source: "auto",
        },
      ],
    });

    const legs = await loadRepairableLegs(fake as unknown as SupabaseClient, USER);

    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({
      id: "leg-1",
      hasEventLink: true,
      subjects: [{ teamId: "team-jax", direction: "against", directionSource: "auto" }],
    });
    expect(legs[1]).toMatchObject({ id: "leg-2", hasEventLink: false, subjects: [] });
  });

  it("ignores a leg with no slip text, which nothing can be re-derived from", async () => {
    const fake = createFakeSupabase({
      bet_legs: [{ id: "leg-manual", user_id: USER, sport: "football", league: "NFL", raw_description: null }],
      bet_leg_events: [],
      bet_leg_subjects: [],
    });

    expect(await loadRepairableLegs(fake as unknown as SupabaseClient, USER)).toEqual([]);
  });

  it("never reads another user's legs", async () => {
    const fake = createFakeSupabase({
      bet_legs: [{ id: "leg-other", user_id: "user-2", sport: "football", league: "NFL", raw_description: MONEYLINE }],
      bet_leg_events: [],
      bet_leg_subjects: [],
    });

    expect(await loadRepairableLegs(fake as unknown as SupabaseClient, USER)).toEqual([]);
  });
});
