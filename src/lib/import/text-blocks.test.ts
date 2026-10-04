import { describe, expect, it } from "vitest";
import { parseSportField } from "./text-blocks";

describe("parseSportField", () => {
  it("splits sport/league", () => {
    expect(parseSportField("football/NFL")).toEqual({ sport: "football", league: "NFL" });
  });

  it("omits league when not present", () => {
    expect(parseSportField("football")).toEqual({ sport: "football", league: undefined });
  });

  it("normalizes the literal 'unknown' to empty sport", () => {
    expect(parseSportField("unknown")).toEqual({ sport: "", league: undefined });
    expect(parseSportField("Unknown")).toEqual({ sport: "", league: undefined });
  });

  it("normalizes a missing field to empty sport", () => {
    expect(parseSportField(undefined)).toEqual({ sport: "", league: undefined });
  });
});
