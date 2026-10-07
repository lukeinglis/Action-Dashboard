import { describe, expect, it } from "vitest";
import {
  matchProviderEvents,
  resolveTeamId,
  toInternalSport,
  type MatchContext,
} from "./match-provider-events";
import type { ProviderEvent } from "@/lib/providers/types";

const TZ = "America/New_York";

// Teams are seeded as sport "football" / league "NFL" with ESPN abbreviations,
// while the ESPN adapter namespaces its sport key as "nfl".
const lions = { id: "team-det", sport: "football", league: "NFL", name: "Detroit Lions", abbreviation: "DET" };
const panthers = { id: "team-car", sport: "football", league: "NFL", name: "Carolina Panthers", abbreviation: "CAR" };

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
    ...overrides,
  };
}

function context(overrides: Partial<MatchContext> = {}): MatchContext {
  return {
    timeZone: TZ,
    teamMappings: [],
    eventMappings: [],
    teams: [lions, panthers],
    events: [],
    ...overrides,
  };
}

const internalEvent = {
  id: "event-1",
  sport: "football",
  league: "NFL",
  name: "Lions @ Panthers",
  // 8:20 PM ET on 2026-10-04 — the same local date the provider record falls on,
  // even though the UTC date is the 5th.
  startTimeUtc: "2026-10-05T00:20:00Z",
  homeTeamId: "team-car",
  awayTeamId: "team-det",
};

describe("toInternalSport", () => {
  it("translates the provider's league-namespaced key to the internal sport", () => {
    expect(toInternalSport("nfl")).toBe("football");
    expect(toInternalSport("golf")).toBe("golf");
  });

  it("passes an unknown key through rather than guessing", () => {
    expect(toInternalSport("cricket")).toBe("cricket");
  });
});

describe("resolveTeamId", () => {
  const teams = [lions, panthers];

  it("prefers an existing mapping over the abbreviation", () => {
    const mappings = new Map([["29", "team-mapped"]]);
    expect(resolveTeamId({ providerId: "29", abbreviation: "CAR" }, "football", "NFL", mappings, teams)).toBe(
      "team-mapped",
    );
  });

  it("falls back to the abbreviation on the first refresh, when no mapping exists", () => {
    expect(resolveTeamId({ providerId: "29", abbreviation: "CAR" }, "football", "NFL", new Map(), teams)).toBe(
      "team-car",
    );
  });

  it("returns null when the abbreviation matches no team", () => {
    expect(
      resolveTeamId({ providerId: "99", abbreviation: "SEA" }, "football", "NFL", new Map(), teams),
    ).toBeNull();
  });

  it("refuses to guess when two teams share an abbreviation", () => {
    // Writing a score onto the wrong Event is worse than not writing one.
    const duplicated = [
      ...teams,
      { id: "team-other", sport: "football", league: "NFL", name: "Other", abbreviation: "CAR" },
    ];
    expect(
      resolveTeamId({ providerId: "29", abbreviation: "CAR" }, "football", "NFL", new Map(), duplicated),
    ).toBeNull();
  });

  it("does not cross sports", () => {
    expect(resolveTeamId({ abbreviation: "CAR" }, "basketball", "NBA", new Map(), teams)).toBeNull();
  });

  it("matches on the full name when the abbreviation disagrees", () => {
    // ESPN says "WSH", the seeded team says "WAS". This was the only mismatch
    // across all 32 NFL teams, and without the name fallback that one game
    // silently fails to resolve its teams.
    const commanders = {
      id: "team-was",
      sport: "football",
      league: "NFL",
      name: "Washington Commanders",
      abbreviation: "WAS",
    };
    expect(
      resolveTeamId(
        { providerId: "28", abbreviation: "WSH", name: "Washington Commanders" },
        "football",
        "NFL",
        new Map(),
        [...teams, commanders],
      ),
    ).toBe("team-was");
  });
});

describe("matchProviderEvents", () => {
  it("matches on the match key and reports the team mappings worth persisting", () => {
    const { matches, resolvedTeams } = matchProviderEvents([providerEvent()], context({
      events: [internalEvent],
    }));

    expect(matches[0].outcome).toEqual({ kind: "matched", eventId: "event-1" });
    expect(matches[0].homeTeamId).toBe("team-car");
    expect(matches[0].awayTeamId).toBe("team-det");
    expect(resolvedTeams).toEqual(
      expect.arrayContaining([
        { teamId: "team-car", providerId: "29" },
        { teamId: "team-det", providerId: "8" },
      ]),
    );
  });

  it("prefers an existing mapping over the match key", () => {
    // The point of the mapping: a postponement moves the start date, which
    // breaks the match key, and the link has to survive that.
    const postponed = providerEvent({ startTimeUtc: "2026-12-01T18:00:00Z" });
    const { matches } = matchProviderEvents([postponed], context({
      events: [internalEvent],
      eventMappings: [{ entityId: "event-1", providerId: "401872978" }],
    }));

    expect(matches[0].outcome).toEqual({ kind: "mapped", eventId: "event-1" });
  });

  it("does not match an Event already mapped to a different provider record", () => {
    const { matches } = matchProviderEvents([providerEvent({ providerEventId: "999" })], context({
      events: [internalEvent],
      eventMappings: [{ entityId: "event-1", providerId: "401872978" }],
    }));

    expect(matches[0].outcome).toEqual({ kind: "unmatched", reason: "no-candidate" });
  });

  it("leaves a doubleheader ambiguous rather than pairing arbitrarily", () => {
    const second = { ...internalEvent, id: "event-2" };
    const { matches } = matchProviderEvents([providerEvent()], context({
      events: [internalEvent, second],
    }));

    expect(matches[0].outcome).toEqual({
      kind: "ambiguous",
      candidateEventIds: ["event-1", "event-2"],
    });
  });

  it("leaves two provider records sharing one key ambiguous too", () => {
    const games = [providerEvent({ providerEventId: "a" }), providerEvent({ providerEventId: "b" })];
    const { matches } = matchProviderEvents(games, context({ events: [internalEvent] }));

    expect(matches.map((m) => m.outcome.kind)).toEqual(["ambiguous", "ambiguous"]);
  });

  it("reports no match key when the start time is TBD", () => {
    const tbd = providerEvent({ startTimeUtc: undefined, startTimeTbd: true });
    const { matches } = matchProviderEvents([tbd], context({ events: [internalEvent] }));

    expect(matches[0].outcome).toEqual({ kind: "unmatched", reason: "no-match-key" });
  });

  it("falls back to the non-team key when the teams cannot be resolved", () => {
    const tournament: ProviderEvent = {
      providerEventId: "401850915",
      sport: "golf",
      league: "PGA",
      name: "Bank of Utah Championship",
      startTimeUtc: "2026-10-01T16:00:00Z",
      status: "final",
    };
    const { matches } = matchProviderEvents([tournament], context({
      events: [
        {
          id: "event-golf",
          sport: "golf",
          league: "PGA",
          name: "bank of utah championship",
          startTimeUtc: "2026-10-01T18:00:00Z",
          homeTeamId: null,
          awayTeamId: null,
        },
      ],
    }));

    expect(matches[0].outcome).toEqual({ kind: "matched", eventId: "event-golf" });
  });

  it("flags a mapped Event the provider stopped reporting on a date it covered", () => {
    const { lostMappingEventIds } = matchProviderEvents([providerEvent()], context({
      events: [internalEvent, { ...internalEvent, id: "event-gone" }],
      eventMappings: [{ entityId: "event-gone", providerId: "401999999" }],
    }));

    expect(lostMappingEventIds).toEqual(["event-gone"]);
  });

  it("does not flag a mapped Event on a date the provider never reported on", () => {
    // Otherwise every Event outside the refreshed slate is flagged every refresh.
    const { lostMappingEventIds } = matchProviderEvents([providerEvent()], context({
      events: [
        internalEvent,
        { ...internalEvent, id: "event-next-week", startTimeUtc: "2026-10-12T17:00:00Z" },
      ],
      eventMappings: [{ entityId: "event-next-week", providerId: "401999999" }],
    }));

    expect(lostMappingEventIds).toEqual([]);
  });
});
