import { describe, expect, it } from "vitest";
import { freshnessLines } from "./freshness-lines";
import type { SportRefreshResult } from "./refresh";
import type { SportsRefreshState } from "@/lib/types/domain";

const TZ = "America/New_York";

function state(overrides: Partial<SportsRefreshState> = {}): SportsRefreshState {
  return {
    id: "state-1",
    userId: "user-1",
    providerKey: "espn",
    sport: "football",
    requestsTodayCount: 0,
    requestsTodayDate: "2026-10-05",
    createdAt: "2026-10-05T18:00:00.000Z",
    updatedAt: "2026-10-05T18:00:00.000Z",
    ...overrides,
  };
}

function result(overrides: Partial<SportRefreshResult> = {}): SportRefreshResult {
  return {
    sport: "football",
    providerSport: "nfl",
    status: "refreshed",
    requestCount: 1,
    updated: 0,
    unchanged: 0,
    eventMappingsCreated: 0,
    teamMappingsCreated: 0,
    needsMatch: [],
    lostMappingEventIds: [],
    ...overrides,
  };
}

describe("freshnessLines", () => {
  it("names the sport by its league and gives the local time of the update", () => {
    // §21's example line, verbatim: "NFL updated 4:18 PM".
    const lines = freshnessLines([state({ lastSuccessAt: "2026-10-05T20:18:00.000Z" })], TZ);

    expect(lines).toEqual([{ sport: "football", label: "NFL", detail: "updated 4:18 PM", tone: "ok" }]);
  });

  it("keeps the last successful update visible beside a failure", () => {
    // §22: a failed refresh retains prior data, so the user is told when the
    // numbers on screen were actually last correct.
    const lines = freshnessLines(
      [state({ lastSuccessAt: "2026-10-05T18:10:00.000Z" })],
      TZ,
      [result({ status: "failed", error: "ESPN request failed: 503" })],
    );

    expect(lines[0]).toMatchObject({
      detail: "failed - last successful update 2:10 PM",
      tone: "error",
    });
  });

  it("does not hide one sport's failure behind another's success", () => {
    // The reason §21 tracks freshness per sport at all.
    const lines = freshnessLines(
      [
        state({ sport: "football", lastSuccessAt: "2026-10-05T20:18:00.000Z" }),
        state({ id: "s-2", sport: "golf", lastSuccessAt: "2026-10-05T18:10:00.000Z" }),
      ],
      TZ,
      [
        result({ sport: "football", refreshedAt: "2026-10-05T20:18:00.000Z" }),
        result({ sport: "golf", providerSport: "golf", status: "failed", error: "boom" }),
      ],
    );

    expect(lines.map((l) => `${l.label} ${l.detail}`)).toEqual([
      "NFL updated 4:18 PM",
      "PGA failed - last successful update 2:10 PM",
    ]);
  });

  it("shows the seconds left on a cooldown, so a wait does not read as a failure", () => {
    const lines = freshnessLines(
      [state({ lastSuccessAt: "2026-10-05T20:18:00.000Z" })],
      TZ,
      [result({ status: "skipped", skipReason: "cooldown", cooldownSecondsRemaining: 30, requestCount: 0 })],
    );

    expect(lines[0]).toMatchObject({
      detail: "wait 30s - last successful update 4:18 PM",
      tone: "warning",
    });
  });

  it("says the provider limit was hit rather than that the sport failed", () => {
    // §22.1: at 100% the provider is skipped and manual editing continues —
    // that is not an error state.
    const lines = freshnessLines(
      [state()],
      TZ,
      [result({ status: "skipped", skipReason: "quota", requestCount: 0 })],
    );

    expect(lines[0]).toMatchObject({
      detail: "skipped - daily provider limit reached",
      tone: "warning",
    });
  });

  it("marks a sport no adapter covers as manual only", () => {
    const lines = freshnessLines(
      [],
      TZ,
      [result({ sport: "cricket", providerSport: "cricket", status: "skipped", skipReason: "unsupported", requestCount: 0 })],
    );

    expect(lines[0]).toMatchObject({ label: "Cricket", detail: "manual only", tone: "muted" });
  });

  it("reports a double-click as already refreshing", () => {
    const lines = freshnessLines(
      [state()],
      TZ,
      [result({ status: "skipped", skipReason: "in_progress", requestCount: 0 })],
    );

    expect(lines[0]).toMatchObject({ detail: "already refreshing", tone: "muted" });
  });

  it("falls back to the stored error after a reload, when no attempt was just made", () => {
    const lines = freshnessLines(
      [state({ lastError: "ESPN request failed: 503", lastSuccessAt: "2026-10-05T18:10:00.000Z" })],
      TZ,
    );

    expect(lines[0]).toMatchObject({
      detail: "failed - last successful update 2:10 PM",
      tone: "error",
    });
  });

  it("says so plainly when a sport has never refreshed", () => {
    const lines = freshnessLines([state()], TZ);

    expect(lines[0]).toMatchObject({ detail: "never updated", tone: "muted" });
  });

  it("invents no line for a sport that has neither state nor a result", () => {
    expect(freshnessLines([], TZ)).toEqual([]);
  });
});
