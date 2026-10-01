import { describe, expect, it } from "vitest";
import {
  deepEqual,
  defaultViewFilters,
  defaultViewLayout,
  resolveLayoutOnRestore,
  resolveOpeningState,
  shouldRestoreWorkingState,
} from "./views";
import type { DashboardViewLayout } from "@/lib/types/domain";

const TZ = "America/New_York";

describe("deepEqual", () => {
  it("treats objects with differently-ordered keys as equal", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("catches a genuine difference under a nested key", () => {
    expect(deepEqual({ a: { x: 1 } }, { a: { x: 2 } })).toBe(false);
  });

  it("compares arrays by position", () => {
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
  });

  it("is sensitive to missing vs undefined keys", () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });

  it("matches real DashboardView filters/layout after re-ordering, as happens across a jsonb round-trip", () => {
    const layout = defaultViewLayout();
    const reordered = Object.fromEntries(Object.entries(layout).reverse());
    expect(deepEqual(layout, reordered)).toBe(true);
  });
});

describe("resolveLayoutOnRestore", () => {
  const window = { start: new Date("2026-09-21T08:00:00Z"), end: new Date("2026-09-22T08:00:00Z") };
  const baseLayout: DashboardViewLayout = { ...defaultViewLayout(), activeWorkspace: "event", selectedEventId: "event-1" };

  it("keeps the selection when the event falls inside the window", () => {
    const result = resolveLayoutOnRestore(baseLayout, { startTimeUtc: "2026-09-21T18:00:00Z" }, window);
    expect(result).toEqual(baseLayout);
  });

  it("falls back to All Active Tickets when the event is outside the window", () => {
    const result = resolveLayoutOnRestore(baseLayout, { startTimeUtc: "2026-10-01T18:00:00Z" }, window);
    expect(result.activeWorkspace).toBe("tickets");
    expect(result.selectedEventId).toBeUndefined();
  });

  it("falls back to All Active Tickets when the event no longer exists", () => {
    const result = resolveLayoutOnRestore(baseLayout, null, window);
    expect(result.activeWorkspace).toBe("tickets");
    expect(result.selectedEventId).toBeUndefined();
  });

  it("leaves a layout with no selectedEventId untouched", () => {
    const layout = defaultViewLayout();
    expect(resolveLayoutOnRestore(layout, null, window)).toBe(layout);
  });
});

describe("shouldRestoreWorkingState", () => {
  it("restores working state when last activity is after the most recent rollover", () => {
    const now = new Date("2026-09-21T10:00:00Z"); // 6am ET, rollover was 4am ET (08:00Z)
    expect(shouldRestoreWorkingState("2026-09-21T09:00:00Z", now, TZ, 4)).toBe(true);
  });

  it("does not restore working state when last activity predates the most recent rollover", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    expect(shouldRestoreWorkingState("2026-09-20T12:00:00Z", now, TZ, 4)).toBe(false);
  });
});

describe("resolveOpeningState", () => {
  const defaultView = { id: "view-default", filters: defaultViewFilters(), layout: defaultViewLayout() };

  it("reloads mid-day (working state after rollover) restores the working state", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    const workspaceState = {
      userId: "u1",
      baseViewId: "view-other",
      filters: { ...defaultViewFilters(), includePinned: false },
      layout: { ...defaultViewLayout(), sortMode: "stake" as const },
      updatedAt: "2026-09-21T09:30:00Z",
    };
    const result = resolveOpeningState(workspaceState, defaultView, now, TZ, 4);
    expect(result.source).toBe("working_state");
    expect(result.layout.sortMode).toBe("stake");
  });

  it("reloading after rollover loads the default View", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    const workspaceState = {
      userId: "u1",
      baseViewId: "view-other",
      filters: { ...defaultViewFilters(), includePinned: false },
      layout: { ...defaultViewLayout(), sortMode: "stake" as const },
      updatedAt: "2026-09-20T12:00:00Z",
    };
    const result = resolveOpeningState(workspaceState, defaultView, now, TZ, 4);
    expect(result.source).toBe("default_view");
    expect(result.layout.sortMode).toBe("manual");
    expect(result.baseViewId).toBe("view-default");
  });

  it("loads the default View when there is no saved working state", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    const result = resolveOpeningState(null, defaultView, now, TZ, 4);
    expect(result.source).toBe("default_view");
  });
});
