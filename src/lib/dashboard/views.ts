// Saved Views and Working State (docs/PRD.md section 8, 46, 46.1): the
// default "Active" View, opening-app restore logic, and the selected-event
// fallback rule.

import { isWithinRange, mostRecentRollover } from "./date-window";
import type { DashboardViewFilters, DashboardViewLayout, WorkspaceState } from "@/lib/types/domain";

export const DEFAULT_VIEW_NAME = "Active";

/**
 * Deep-equality that ignores object key order. Needed because filters/layout
 * round-trip through Postgres `jsonb` columns, which re-order object keys —
 * a plain `JSON.stringify` comparison would report a false "Modified" state.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(b, key) &&
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

export function defaultViewFilters(): DashboardViewFilters {
  return {
    dateWindow: { kind: "rolling", pastHours: 0, futureHours: 168 },
    includePinned: true,
  };
}

export function defaultViewLayout(): DashboardViewLayout {
  return {
    sortMode: "manual",
    visibleSections: ["active", "settled"],
    density: "comfortable",
    activeWorkspace: "tickets",
    scheduleGrouping: "state",
  };
}

/**
 * On restore, a View whose saved selectedEventId is missing or whose Event
 * falls outside the View's resolved date window falls back to All Active
 * Tickets (docs/PRD.md section 46).
 */
export function resolveLayoutOnRestore<T extends DashboardViewLayout>(
  layout: T,
  selectedEvent: { startTimeUtc?: string | null } | null,
  dateWindow: { start: Date; end: Date },
): T {
  if (!layout.selectedEventId) return layout;

  const start = selectedEvent?.startTimeUtc ? new Date(selectedEvent.startTimeUtc) : null;
  if (!start || !isWithinRange(start, dateWindow)) {
    return { ...layout, activeWorkspace: "tickets", selectedEventId: undefined };
  }
  return layout;
}

/**
 * Opening-app logic (docs/PRD.md section 8): restore the working state if
 * the user was last active after the most recent rollover, otherwise load
 * the default View.
 */
export function shouldRestoreWorkingState(
  lastActivityAt: string,
  now: Date,
  timeZone: string,
  rolloverHour: number,
): boolean {
  return new Date(lastActivityAt).getTime() > mostRecentRollover(now, timeZone, rolloverHour).getTime();
}

export interface OpeningState {
  filters: DashboardViewFilters;
  layout: DashboardViewLayout;
  baseViewId?: string | null;
  source: "working_state" | "default_view";
}

/** Resolves which state to open with: the saved working state, or the default View. */
export function resolveOpeningState(
  workspaceState: WorkspaceState | null,
  defaultView: { id: string; filters: DashboardViewFilters; layout: DashboardViewLayout },
  now: Date,
  timeZone: string,
  rolloverHour: number,
): OpeningState {
  if (workspaceState && shouldRestoreWorkingState(workspaceState.updatedAt, now, timeZone, rolloverHour)) {
    return {
      filters: workspaceState.filters,
      layout: workspaceState.layout,
      baseViewId: workspaceState.baseViewId,
      source: "working_state",
    };
  }

  return {
    filters: defaultView.filters,
    layout: defaultView.layout,
    baseViewId: defaultView.id,
    source: "default_view",
  };
}
