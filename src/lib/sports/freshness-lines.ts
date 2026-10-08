// The lines shown beside the refresh control. See docs/PRD.md §21 and §22.
//
// §21 exists so the UI can say
//
//   NFL updated 4:18 PM
//   MLB failed - last successful update 2:10 PM
//
// without hiding a partial failure behind one global "updated just now". This
// turns the stored state into exactly those lines, and is pure so the wording
// is testable without rendering anything.
//
// Two sources feed a line. The stored `SportsRefreshState` is what survives a
// reload. The result of the refresh just attempted is richer — it knows *why* a
// sport was skipped, which the state row deliberately does not record, because
// a skip is neither a success nor a failure. The result wins where it exists.

import type { SportsRefreshState } from "@/lib/types/domain";
import type { SportRefreshResult } from "./refresh";
import { sportLabel } from "./sport-keys";

export type FreshnessTone = "ok" | "warning" | "error" | "muted";

export interface FreshnessLine {
  /** Internal `events.sport`, for a stable React key. */
  sport: string;
  /** How the sport is named to the user, e.g. "NFL". */
  label: string;
  /** The part after the label, e.g. "updated 4:18 PM". */
  detail: string;
  tone: FreshnessTone;
}

export function freshnessLines(
  states: SportsRefreshState[],
  timeZone: string,
  results: SportRefreshResult[] = [],
): FreshnessLine[] {
  const stateBySport = new Map(states.map((s) => [s.sport, s]));
  const resultBySport = new Map(results.map((r) => [r.sport, r]));

  // A sport appears if it has ever refreshed or was just attempted. Nothing is
  // invented for a sport the user has no exposure to.
  const sports = [...new Set([...stateBySport.keys(), ...resultBySport.keys()])];

  return sports
    .map((sport) => ({
      sport,
      label: sportLabel(sport),
      ...detailFor(resultBySport.get(sport), stateBySport.get(sport), timeZone),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function detailFor(
  result: SportRefreshResult | undefined,
  state: SportsRefreshState | undefined,
  timeZone: string,
): { detail: string; tone: FreshnessTone } {
  const lastSuccess = state?.lastSuccessAt;

  if (result?.status === "skipped") {
    switch (result.skipReason) {
      case "cooldown":
        // §22.1 asks for the remaining seconds specifically, so the user knows
        // this is a wait rather than a failure.
        return {
          detail: `wait ${result.cooldownSecondsRemaining ?? 0}s${since(lastSuccess, timeZone)}`,
          tone: "warning",
        };
      case "quota":
        return { detail: "skipped - daily provider limit reached", tone: "warning" };
      case "in_progress":
        return { detail: "already refreshing", tone: "muted" };
      case "unsupported":
        return { detail: "manual only", tone: "muted" };
    }
  }

  if (result?.status === "failed") {
    // §22: a failed refresh retains prior data, so the last time it *did* work
    // is the number that matters and is kept on screen.
    return { detail: `failed${since(lastSuccess, timeZone)}`, tone: "error" };
  }

  if (result?.status === "refreshed") {
    return { detail: `updated ${formatTime(result.refreshedAt ?? lastSuccess, timeZone)}`, tone: "ok" };
  }

  // No attempt just now: fall back to what the stored state remembers.
  if (state?.lastError) {
    return { detail: `failed${since(lastSuccess, timeZone)}`, tone: "error" };
  }
  if (lastSuccess) {
    return { detail: `updated ${formatTime(lastSuccess, timeZone)}`, tone: "ok" };
  }
  return { detail: "never updated", tone: "muted" };
}

function since(lastSuccessAt: string | null | undefined, timeZone: string): string {
  if (!lastSuccessAt) return "";
  return ` - last successful update ${formatTime(lastSuccessAt, timeZone)}`;
}

function formatTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "just now";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
