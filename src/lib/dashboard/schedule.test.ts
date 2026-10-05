import { describe, expect, it } from "vitest";
import { groupByState, isScheduleRailEligible, nflWindowGroup } from "./schedule";

const TZ = "America/New_York";
const now = new Date("2026-09-21T10:00:00Z");
const window = { start: new Date("2026-09-21T08:00:00Z"), end: new Date("2026-09-22T08:00:00Z") };

describe("isScheduleRailEligible", () => {
  it("excludes events with no exposure and no pin", () => {
    expect(
      isScheduleRailEligible(
        { id: "e1", status: "scheduled", startTimeUtc: "2026-09-21T18:00:00Z", isPinned: false, exposureCount: 0 },
        window,
        now,
        TZ,
        4,
      ),
    ).toBe(false);
  });

  it("includes an in_progress event regardless of date window", () => {
    expect(
      isScheduleRailEligible(
        { id: "e1", status: "in_progress", startTimeUtc: "2026-09-01T18:00:00Z", isPinned: false, exposureCount: 1 },
        window,
        now,
        TZ,
        4,
      ),
    ).toBe(true);
  });

  it("includes a pinned event with zero exposure whose start falls in the window", () => {
    expect(
      isScheduleRailEligible(
        { id: "e1", status: "scheduled", startTimeUtc: "2026-09-21T18:00:00Z", isPinned: true, exposureCount: 0 },
        window,
        now,
        TZ,
        4,
      ),
    ).toBe(true);
  });

  it("excludes an exposed event whose start falls outside the window and isn't live or finalized today", () => {
    expect(
      isScheduleRailEligible(
        { id: "e1", status: "scheduled", startTimeUtc: "2026-10-01T18:00:00Z", isPinned: false, exposureCount: 1 },
        window,
        now,
        TZ,
        4,
      ),
    ).toBe(false);
  });

  it("includes an exposed event that went final today even if its start was outside the window", () => {
    expect(
      isScheduleRailEligible(
        {
          id: "e1",
          status: "final",
          startTimeUtc: "2026-09-20T18:00:00Z",
          isPinned: false,
          exposureCount: 1,
          statusChangedAt: "2026-09-21T09:00:00Z",
        },
        window,
        now,
        TZ,
        4,
      ),
    ).toBe(true);
  });

  it("keeps a kicked-off event on the rail when the window opens at now", () => {
    // Reproduces the live bug: the default View uses pastHours: 0, so a 1pm
    // game sits outside the window from 1:01pm onward.
    const openAtNow = { start: now, end: new Date("2026-09-28T10:00:00Z") };
    expect(
      isScheduleRailEligible(
        { id: "e1", status: "scheduled", startTimeUtc: "2026-09-21T09:00:00Z", isPinned: false, exposureCount: 1 },
        openAtNow,
        now,
        TZ,
        4,
      ),
    ).toBe(true);
  });

  it("drops an unfinished event that started before the most recent rollover", () => {
    const openAtNow = { start: now, end: new Date("2026-09-28T10:00:00Z") };
    expect(
      isScheduleRailEligible(
        { id: "e1", status: "scheduled", startTimeUtc: "2026-09-20T18:00:00Z", isPinned: false, exposureCount: 1 },
        openAtNow,
        now,
        TZ,
        4,
      ),
    ).toBe(false);
  });

  it("excludes an exposed event that went final on a prior day", () => {
    expect(
      isScheduleRailEligible(
        {
          id: "e1",
          status: "final",
          startTimeUtc: "2026-09-19T18:00:00Z",
          isPinned: false,
          exposureCount: 1,
          statusChangedAt: "2026-09-19T21:00:00Z",
        },
        window,
        now,
        TZ,
        4,
      ),
    ).toBe(false);
  });
});

describe("groupByState", () => {
  it("assigns LIVE, FINAL, UP NEXT (soonest), and LATER", () => {
    const events = [
      { id: "live", status: "in_progress" as const, startTimeUtc: "2026-09-21T17:00:00Z" },
      { id: "final", status: "final" as const, startTimeUtc: "2026-09-21T13:00:00Z" },
      { id: "soonest", status: "scheduled" as const, startTimeUtc: "2026-09-21T20:00:00Z" },
      { id: "later", status: "scheduled" as const, startTimeUtc: "2026-09-21T21:00:00Z" },
    ];
    const groups = groupByState(events);
    expect(groups.get("live")).toBe("LIVE");
    expect(groups.get("final")).toBe("FINAL");
    expect(groups.get("soonest")).toBe("UP NEXT");
    expect(groups.get("later")).toBe("LATER");
  });
});

describe("nflWindowGroup", () => {
  it("buckets Sunday afternoon/evening kickoffs and Monday games", () => {
    // 2026-09-20 is a Sunday; 17:00Z = 1:00pm ET, 20:20Z = 4:20pm ET, 00:20Z(+1) = 8:20pm ET.
    expect(nflWindowGroup("2026-09-20T17:00:00Z", TZ)).toBe("1PM");
    expect(nflWindowGroup("2026-09-20T20:20:00Z", TZ)).toBe("4PM");
    expect(nflWindowGroup("2026-09-21T00:20:00Z", TZ)).toBe("NIGHT");
    // 2026-09-21 is a Monday.
    expect(nflWindowGroup("2026-09-22T00:15:00Z", TZ)).toBe("MONDAY");
  });

  it("returns UNSCHEDULED with no start time", () => {
    expect(nflWindowGroup(null, TZ)).toBe("UNSCHEDULED");
  });
});
