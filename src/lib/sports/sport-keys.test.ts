import { describe, expect, it } from "vitest";
import { sportLabel, toInternalSport, toProviderSport } from "./sport-keys";

describe("toInternalSport", () => {
  it("translates the provider's league-namespaced key to the internal sport", () => {
    expect(toInternalSport("nfl")).toBe("football");
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

  it("ignores the league while one sport has a single provider key", () => {
    // An Event whose league was never filled in should still refresh.
    expect(toProviderSport("football", null)).toBe("nfl");
    expect(toProviderSport("football", "XFL")).toBe("nfl");
  });

  it("returns null for a sport no adapter covers", () => {
    // Null makes refresh skip the sport; inventing a key would just earn a
    // provider error on a sport the user tracks by hand anyway.
    expect(toProviderSport("cricket", null)).toBeNull();
  });

  it("round-trips every key in the table", () => {
    for (const providerSport of ["nfl", "golf"]) {
      expect(toProviderSport(toInternalSport(providerSport), null)).toBe(providerSport);
    }
  });
});

describe("sportLabel", () => {
  it("names a sport by its league, which is what a bettor calls it", () => {
    expect(sportLabel("football")).toBe("NFL");
    expect(sportLabel("golf")).toBe("PGA");
  });

  it("falls back to the sport itself for anything the table does not cover", () => {
    expect(sportLabel("cricket")).toBe("Cricket");
  });
});
