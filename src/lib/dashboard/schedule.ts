// Persistent Schedule Rail: eligibility and grouping (docs/PRD.md section
// 8, 11). An Event is "relevant" when it has exposure or is pinned;
// eligibility additionally requires it be live, fall in the View's date
// window, or have gone final/postponed/cancelled today.

import { isWithinRange, mostRecentRollover, nextRollover, zonedParts } from "./date-window";
import type { EventStatus } from "@/lib/types/domain";

const FINALIZED_STATUSES: EventStatus[] = ["final", "postponed", "cancelled"];

/** True when an Event has reached a status no further refresh can move it off. */
export function isFinalizedStatus(status: EventStatus | null | undefined): boolean {
  return Boolean(status && FINALIZED_STATUSES.includes(status));
}

export interface ScheduleEventCandidate {
  id: string;
  status: EventStatus | null;
  startTimeUtc?: string | null;
  endTimeUtc?: string | null;
  /** manualSetAt ?? automaticChangedAt — when `status` last changed. */
  statusChangedAt?: string | null;
  isPinned: boolean;
  exposureCount: number;
}

export function isScheduleRailEligible(
  event: ScheduleEventCandidate,
  dateWindow: { start: Date; end: Date },
  now: Date,
  timeZone: string,
  rolloverHour: number,
): boolean {
  const relevant = event.exposureCount > 0 || event.isPinned;
  if (!relevant) return false;

  if (event.status === "in_progress") return true;

  const start = event.startTimeUtc ? new Date(event.startTimeUtc) : null;
  const end = event.endTimeUtc ? new Date(event.endTimeUtc) : null;

  // A game that has kicked off but isn't finished stays on the rail for the
  // rest of the day. Without this, a slate vanishes as it starts: the default
  // date window opens at `now`, and nothing sets `in_progress` until provider
  // refresh exists (Phase 6), so status alone can't carry it.
  const unfinished = !isFinalizedStatus(event.status);
  if (start && unfinished && start.getTime() <= now.getTime()) {
    const dayStart = mostRecentRollover(now, timeZone, rolloverHour);
    if (start.getTime() >= dayStart.getTime()) return true;
  }

  const overlapsWindow =
    (start && isWithinRange(start, dateWindow)) ||
    (end && isWithinRange(end, dateWindow)) ||
    (start && end && start.getTime() <= dateWindow.start.getTime() && end.getTime() >= dateWindow.end.getTime());
  if (overlapsWindow) return true;

  if (isFinalizedStatus(event.status) && event.statusChangedAt) {
    const today = { start: mostRecentRollover(now, timeZone, rolloverHour), end: nextRollover(now, timeZone, rolloverHour) };
    if (isWithinRange(new Date(event.statusChangedAt), today)) return true;
  }

  return false;
}

export type StateGroup = "LIVE" | "UP NEXT" | "LATER" | "FINAL";

/** Default grouping: LIVE / UP NEXT (soonest upcoming) / LATER / FINAL. */
export function groupByState<T extends { id: string; status: EventStatus | null; startTimeUtc?: string | null }>(
  events: T[],
): Map<string, StateGroup> {
  const groups = new Map<string, StateGroup>();
  const upcoming: T[] = [];

  for (const event of events) {
    if (event.status === "in_progress") {
      groups.set(event.id, "LIVE");
    } else if (isFinalizedStatus(event.status)) {
      groups.set(event.id, "FINAL");
    } else {
      upcoming.push(event);
    }
  }

  const withStart = upcoming.filter((e): e is T & { startTimeUtc: string } => Boolean(e.startTimeUtc));
  const earliestStart = withStart.length > 0
    ? withStart.reduce((min, e) => (e.startTimeUtc < min ? e.startTimeUtc : min), withStart[0].startTimeUtc)
    : null;

  for (const event of upcoming) {
    groups.set(event.id, event.startTimeUtc && event.startTimeUtc === earliestStart ? "UP NEXT" : "LATER");
  }

  return groups;
}

export type NflWindowGroup = "1PM" | "4PM" | "NIGHT" | "MONDAY" | "UNSCHEDULED";

/** NFL broadcast-window grouping: Monday games always MONDAY; otherwise by ET kickoff hour. */
export function nflWindowGroup(startTimeUtc: string | null | undefined, timeZone: string): NflWindowGroup {
  if (!startTimeUtc) return "UNSCHEDULED";
  const parts = zonedParts(new Date(startTimeUtc), timeZone);
  if (parts.weekday === 1) return "MONDAY";
  if (parts.hour < 16) return "1PM";
  if (parts.hour < 20) return "4PM";
  return "NIGHT";
}
