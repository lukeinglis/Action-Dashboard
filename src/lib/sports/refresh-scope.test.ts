import { describe, expect, it } from "vitest";
import { resolveRefreshScope, type ScopeEvent } from "./refresh-scope";

const TZ = "America/New_York";

function event(overrides: Partial<ScopeEvent> = {}): ScopeEvent {
  return {
    id: "event-1",
    sport: "football",
    league: "NFL",
    // 8:20 PM ET on the 4th, even though the UTC date is the 5th.
    startTimeUtc: "2026-10-05T00:20:00Z",
    exposureCount: 1,
    ...overrides,
  };
}

describe("resolveRefreshScope", () => {
  it("includes a sport the user has exposure to", () => {
    const { scopes } = resolveRefreshScope([event()], TZ);

    expect(scopes).toEqual([
      { sport: "football", providerSport: "nfl", localDates: ["2026-10-04"] },
    ]);
  });

  it("skips an Event with no exposure and no pin", () => {
    // The whole point of §23: an Event sitting in the library with nothing
    // riding on it must not cost a provider request.
    const { scopes } = resolveRefreshScope([event({ exposureCount: 0 })], TZ);

    expect(scopes).toEqual([]);
  });

  it("includes a pinned Event even with no exposure", () => {
    const { scopes } = resolveRefreshScope([event({ exposureCount: 0, isPinned: true })], TZ);

    expect(scopes.map((s) => s.providerSport)).toEqual(["nfl"]);
  });

  it("ignores pins when the View excludes them", () => {
    const { scopes } = resolveRefreshScope(
      [event({ exposureCount: 0, isPinned: true })],
      TZ,
      { includePinned: false },
    );

    expect(scopes).toEqual([]);
  });

  it("narrows to the View's sport filter", () => {
    const events = [
      event(),
      event({ id: "event-golf", sport: "golf", league: "PGA" }),
    ];
    const { scopes } = resolveRefreshScope(events, TZ, { sports: ["golf"] });

    expect(scopes.map((s) => s.providerSport)).toEqual(["golf"]);
  });

  it("treats an empty sport filter as no restriction", () => {
    const events = [event(), event({ id: "event-golf", sport: "golf", league: "PGA" })];
    const { scopes } = resolveRefreshScope(events, TZ, { sports: [] });

    expect(scopes.map((s) => s.providerSport)).toEqual(["golf", "nfl"]);
  });

  it("collects every local date the relevant Events fall on, deduplicated", () => {
    // ESPN rejects date ranges, so the orchestration issues one request per
    // date; the count has to follow real exposure, not the window width.
    const events = [
      event({ id: "a" }),
      event({ id: "b" }),
      event({ id: "c", startTimeUtc: "2026-10-12T17:00:00Z" }),
    ];
    const { scopes } = resolveRefreshScope(events, TZ);

    expect(scopes[0].localDates).toEqual(["2026-10-04", "2026-10-12"]);
  });

  it("still refreshes a sport whose only relevant Event has a TBD start", () => {
    // No date to ask for, but the provider's current slate is the best
    // available answer — and it is how a TBD start time gets filled in.
    const { scopes } = resolveRefreshScope([event({ startTimeUtc: null })], TZ);

    expect(scopes).toEqual([{ sport: "football", providerSport: "nfl", localDates: [] }]);
  });

  it("reports a relevant sport no adapter covers instead of dropping it", () => {
    const { scopes, unsupportedSports } = resolveRefreshScope(
      [event({ id: "event-cricket", sport: "cricket", league: "IPL" })],
      TZ,
    );

    expect(scopes).toEqual([]);
    expect(unsupportedSports).toEqual(["cricket"]);
  });
});
