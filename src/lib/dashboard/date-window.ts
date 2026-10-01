// Day-rollover math and DateWindow resolution. See docs/PRD.md section 8
// (day rollover) and section 46 (Saved View date windows).
//
// "Today" and the default rollover boundary aren't midnight — they're
// whatever hour the user's rolloverHour preference says (default 4am), in
// the user's timezone. Everything here takes `now` as an explicit parameter
// rather than reading the clock, so it stays plain-unit-testable.

import type { DateWindow } from "@/lib/types/domain";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  // hour12:false with Intl can render midnight as "24"; normalize to 0.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday],
  };
}

/** Converts a local wall-clock time in `timeZone` to the UTC instant it represents. */
function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  const guessAsZoned = zonedParts(guess, timeZone);
  const guessAsZonedUtc = Date.UTC(
    guessAsZoned.year,
    guessAsZoned.month - 1,
    guessAsZoned.day,
    guessAsZoned.hour,
    guessAsZoned.minute,
    guessAsZoned.second,
  );
  const offset = guessAsZonedUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/** The most recent rollover instant at or before `now`. */
export function mostRecentRollover(now: Date, timeZone: string, rolloverHour: number): Date {
  const local = zonedParts(now, timeZone);
  const todaysRollover = zonedTimeToUtc(
    { year: local.year, month: local.month, day: local.day, hour: rolloverHour, minute: 0, second: 0 },
    timeZone,
  );
  if (todaysRollover.getTime() <= now.getTime()) return todaysRollover;
  return new Date(todaysRollover.getTime() - 24 * 60 * 60 * 1000);
}

/** The next rollover instant strictly after `now`. */
export function nextRollover(now: Date, timeZone: string, rolloverHour: number): Date {
  const mostRecent = mostRecentRollover(now, timeZone, rolloverHour);
  return new Date(mostRecent.getTime() + 24 * 60 * 60 * 1000);
}

/** The most recent rollover instant, at or before `now`, that falls on the given local weekday. */
export function mostRecentWeekdayRollover(
  now: Date,
  timeZone: string,
  rolloverHour: number,
  weekday: number,
): Date {
  let candidate = mostRecentRollover(now, timeZone, rolloverHour);
  for (let i = 0; i < 7; i++) {
    if (zonedParts(candidate, timeZone).weekday === weekday) return candidate;
    candidate = new Date(candidate.getTime() - 24 * 60 * 60 * 1000);
  }
  throw new Error("Could not find matching weekday rollover.");
}

const TUESDAY = 2;

/** Resolves a DateWindow to a concrete [start, end) UTC instant range. */
export function resolveDateWindow(
  window: DateWindow,
  now: Date,
  timeZone: string,
  rolloverHour: number,
): { start: Date; end: Date } {
  switch (window.kind) {
    case "today": {
      const start = mostRecentRollover(now, timeZone, rolloverHour);
      return { start, end: nextRollover(now, timeZone, rolloverHour) };
    }
    case "rolling": {
      return {
        start: new Date(now.getTime() - window.pastHours * 60 * 60 * 1000),
        end: new Date(now.getTime() + window.futureHours * 60 * 60 * 1000),
      };
    }
    case "nfl_week": {
      const start = mostRecentWeekdayRollover(now, timeZone, rolloverHour, TUESDAY);
      return { start, end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) };
    }
    case "absolute": {
      return { start: new Date(window.start), end: new Date(window.end) };
    }
  }
}

export function isWithinRange(instant: Date, range: { start: Date; end: Date }): boolean {
  return instant.getTime() >= range.start.getTime() && instant.getTime() < range.end.getTime();
}
