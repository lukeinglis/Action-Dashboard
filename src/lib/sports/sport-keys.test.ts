import { describe, expect, it } from "vitest";
import {
  SPORT_KEYS,
  providerSportLabel,
  sportLabel,
  toInternalSport,
  toProviderSport,
} from "./sport-keys";

describe("toInternalSport", () => {
  it("translates the provider's league-namespaced key to the internal sport", () => {
    expect(toInternalSport("nfl")).toBe("football");
    expect(toInternalSport("college-football")).toBe("football");
    expect(toInternalSport("mens-college-basketball")).toBe("basketball");
    expect(toInternalSport("eng.1")).toBe("soccer");
    expect(toInternalSport("golf")).toBe("golf");
  });

  it("passes an unknown key through rather than guessing", () => {
    expect(toInternalSport("cricket")).toBe("cricket");
  });
});

describe("toProviderSport", () => {
  it("translates the internal sport back to the provider key", () => {
    expect(toProviderSport("football", "NFL")).toBe("nfl");
    expect(toProviderSport("golf", "PGA")).toBe("golf");
  });

  it("separates two leagues of one sport, which are two different requests", () => {
    // The whole point of carrying the league: NFL and college football share
    // the internal sport "football" but are distinct ESPN endpoints, and a
    // college leg looked up against the NFL schedule grades wrongly.
    expect(toProviderSport("football", "NCAAF")).toBe("college-football");
    expect(toProviderSport("football", "NFL")).toBe("nfl");
  });

  it("accepts the other spellings a book prints for a league", () => {
    // One slip says "College Football", the next says "CFB"; both are the
    // same ESPN endpoint and must not depend on which screen it came from.
    for (const league of ["NCAA Football", "College Football", "CFB", "NCAAFB"]) {
      expect(toProviderSport("football", league)).toBe("college-football");
    }
    for (const league of ["EPL", "England - Premier League", "English Premier League"]) {
      expect(toProviderSport("soccer", league)).toBe("eng.1");
    }
    for (const league of ["NCAAB", "NCAA Basketball", "College Basketball", "CBB", "NCAAM", "NCAAMB"]) {
      expect(toProviderSport("basketball", league)).toBe("mens-college-basketball");
    }
  });

  it("is case- and space-insensitive about the league, as printed text is", () => {
    expect(toProviderSport("football", "  ncaaf ")).toBe("college-football");
    expect(toProviderSport("soccer", "premier league")).toBe("eng.1");
  });

  it("falls back to the sport's primary league when no league was recorded", () => {
    // `events.league` is nullable and most rows predate any sport having more
    // than one league, so a league-less football Event must still refresh —
    // otherwise adding college football would quietly turn every existing NFL
    // Event manual-only.
    expect(toProviderSport("football", null)).toBe("nfl");
    expect(toProviderSport("soccer", null)).toBe("eng.1");
  });

  it("uses the sole candidate when a sport has only one league", () => {
    expect(toProviderSport("golf", null)).toBe("golf");
    expect(toProviderSport("basketball", null)).toBe("mens-college-basketball");
  });

  it("returns null for a named league the table does not carry", () => {
    // Not "the sport's only candidate": that is how a college football leg got
    // looked up against the NFL schedule. A confidently wrong grade is worse
    // than no grade.
    expect(toProviderSport("football", "XFL")).toBeNull();
    expect(toProviderSport("soccer", "La Liga")).toBeNull();
    expect(toProviderSport("golf", "LIV")).toBeNull();
    // The NBA is the case that matters most here: basketball's only league is
    // the college one, and answering with it would look up an NBA leg against
    // the college schedule. Null makes refresh skip it and §22 report it as
    // manual-only, which is the honest answer until the NBA is carried.
    expect(toProviderSport("basketball", "NBA")).toBeNull();
  });

  it("returns null for a sport no adapter covers", () => {
    // Null makes refresh skip the sport; inventing a key would just earn a
    // provider error on a sport the user tracks by hand anyway.
    expect(toProviderSport("cricket", null)).toBeNull();
  });

});

// These hold for the table as it stands and must keep holding for whatever is
// added to it. The NBA is the next entry — it joins college basketball under
// internal sport "basketball" exactly as NCAAF joined the NFL under "football"
// — and each of these is a way that addition could break a sport already
// working, silently and without touching its own code. In particular, adding it
// gives basketball a second league, so the league-less check below will fail
// until the NBA is marked `primary`.
describe("the SPORT_KEYS table itself", () => {
  const sports = [...new Set(SPORT_KEYS.map((k) => k.sport))];

  it("gives every provider key a distinct name", () => {
    const keys = SPORT_KEYS.map((k) => k.providerSport);
    expect(keys).toEqual([...new Set(keys)]);
  });

  it("never lets two leagues of one sport answer to the same name", () => {
    // `toProviderSport` picks the first league that matches, so a collision
    // here does not fail — it silently resolves by row order, and the loser's
    // legs get graded against the winner's schedule.
    for (const sport of sports) {
      const names = SPORT_KEYS.filter((k) => k.sport === sport).flatMap((k) =>
        [k.league, ...(k.leagueAliases ?? [])].map((n) => n.trim().toLowerCase()),
      );
      expect(names, `duplicate league name within "${sport}"`).toEqual([...new Set(names)]);
    }
  });

  it("resolves a league-less Event for every sport it covers", () => {
    // The regression adding a second league to a sport causes: with no
    // `primary` there are two candidates and no reason to prefer either, so
    // `toProviderSport` returns null and §22 reports the sport manual-only —
    // for Events that were refreshing fine the day before.
    for (const sport of sports) {
      expect(toProviderSport(sport, null), `"${sport}" has no primary league`).not.toBeNull();
    }
  });

  it("marks at most one primary league per sport", () => {
    for (const sport of sports) {
      const primaries = SPORT_KEYS.filter((k) => k.sport === sport && k.primary);
      expect(primaries.length, `"${sport}" has ${primaries.length} primary leagues`).toBeLessThan(2);
    }
  });

  it("round-trips every key through its own league", () => {
    for (const key of SPORT_KEYS) {
      expect(toProviderSport(key.sport, key.league)).toBe(key.providerSport);
      expect(toInternalSport(key.providerSport)).toBe(key.sport);
      for (const alias of key.leagueAliases ?? []) {
        expect(toProviderSport(key.sport, alias), `alias "${alias}"`).toBe(key.providerSport);
      }
    }
  });
});

describe("sportLabel", () => {
  it("names a single-league sport by its league, which is what a bettor calls it", () => {
    expect(sportLabel("golf")).toBe("PGA");
  });

  it("names a multi-league sport by the sport, because no league speaks for it", () => {
    // §23's manual-only list is built from `events.sport`, so it can only speak
    // in internal terms — and calling football "NFL" there would be a lie once
    // college football is in the same bucket.
    expect(sportLabel("football")).toBe("Football");
  });

  it("falls back to the sport itself for anything the table does not cover", () => {
    expect(sportLabel("cricket")).toBe("Cricket");
  });
});

describe("providerSportLabel", () => {
  it("names a provider key by its league, so two leagues read as two lines", () => {
    // §21's freshness lines are per provider request: "NFL updated 4:18 PM" and
    // "NCAAF updated 4:19 PM" are two separate facts, and labelling both
    // "Football" would collapse them into one ambiguous line.
    expect(providerSportLabel("nfl")).toBe("NFL");
    expect(providerSportLabel("college-football")).toBe("NCAAF");
    expect(providerSportLabel("mens-college-basketball")).toBe("NCAAB");
    expect(providerSportLabel("eng.1")).toBe("Premier League");
    expect(providerSportLabel("golf")).toBe("PGA");
  });

  it("is the canonical league a created Team is stored under", () => {
    // `resolveLegEventId` passes this, not the slip's spelling: a Team saved as
    // "CBB" or "College Basketball" is one `toProviderSport` cannot translate
    // back, so it would never match its own schedule again.
    expect(providerSportLabel(toProviderSport("basketball", "CBB")!)).toBe("NCAAB");
  });

  it("falls back to the key itself for anything the table does not cover", () => {
    expect(providerSportLabel("cricket")).toBe("Cricket");
  });
});
