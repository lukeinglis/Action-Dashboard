import { describe, expect, it } from "vitest";
import { isWithinRange, mostRecentRollover, nextRollover, resolveDateWindow } from "./date-window";

const TZ = "America/New_York";

describe("mostRecentRollover / nextRollover", () => {
  it("returns today's rollover when now is after it", () => {
    // 2026-09-21T10:00:00Z is 6:00am in America/New_York (EDT, UTC-4).
    const now = new Date("2026-09-21T10:00:00Z");
    expect(mostRecentRollover(now, TZ, 4).toISOString()).toBe("2026-09-21T08:00:00.000Z");
    expect(nextRollover(now, TZ, 4).toISOString()).toBe("2026-09-22T08:00:00.000Z");
  });

  it("returns yesterday's rollover when now is before today's", () => {
    // 2026-09-21T05:00:00Z is 1:00am in America/New_York.
    const now = new Date("2026-09-21T05:00:00Z");
    expect(mostRecentRollover(now, TZ, 4).toISOString()).toBe("2026-09-20T08:00:00.000Z");
    expect(nextRollover(now, TZ, 4).toISOString()).toBe("2026-09-21T08:00:00.000Z");
  });
});

describe("resolveDateWindow", () => {
  const now = new Date("2026-09-21T10:00:00Z");

  it("resolves 'today' to the rollover-bounded local day", () => {
    const { start, end } = resolveDateWindow({ kind: "today" }, now, TZ, 4);
    expect(start.toISOString()).toBe("2026-09-21T08:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-22T08:00:00.000Z");
  });

  it("resolves 'rolling' relative to now", () => {
    const { start, end } = resolveDateWindow({ kind: "rolling", pastHours: 2, futureHours: 168 }, now, TZ, 4);
    expect(start.toISOString()).toBe("2026-09-21T08:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-28T10:00:00.000Z");
  });

  it("resolves 'nfl_week' to the most recent Tuesday rollover through next Tuesday", () => {
    // 2026-09-21 is a Monday, so the week started the prior Tuesday (2026-09-15).
    const { start, end } = resolveDateWindow({ kind: "nfl_week" }, now, TZ, 4);
    expect(start.toISOString()).toBe("2026-09-15T08:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-22T08:00:00.000Z");
  });

  it("resolves 'absolute' directly", () => {
    const { start, end } = resolveDateWindow(
      { kind: "absolute", start: "2026-09-01T00:00:00Z", end: "2026-09-30T00:00:00Z" },
      now,
      TZ,
      4,
    );
    expect(start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
});

describe("isWithinRange", () => {
  it("is inclusive of start, exclusive of end", () => {
    const range = { start: new Date("2026-09-21T08:00:00Z"), end: new Date("2026-09-22T08:00:00Z") };
    expect(isWithinRange(new Date("2026-09-21T08:00:00Z"), range)).toBe(true);
    expect(isWithinRange(new Date("2026-09-22T08:00:00Z"), range)).toBe(false);
    expect(isWithinRange(new Date("2026-09-21T12:00:00Z"), range)).toBe(true);
  });
});
