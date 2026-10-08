// Decides which sports a refresh should actually fetch. See docs/PRD.md §23.
//
// A refresh fetches only *relevant* sports. Relevance comes from the Events the
// user has something riding on — active Tickets, active Fantasy matchups,
// active DFS lineups, pinned Events — narrowed by the current filters. A
// dashboard showing NFL and MLB must not spend requests on NBA and NHL.
//
// Pure, so the decision is testable without a database or a provider.

import { toLocalDateString } from "@/lib/events/match-key";
import { toProviderSport } from "./sport-keys";

export interface ScopeEvent {
  id: string;
  sport: string;
  league?: string | null;
  startTimeUtc?: string | null;
  isPinned?: boolean;
  /** Betting + Fantasy + DFS terms riding on this Event (§11.6). */
  exposureCount?: number;
}

export interface ScopeFilters {
  /** The current View's sport filter. Empty or absent means "no restriction". */
  sports?: string[] | null;
  includePinned?: boolean;
}

export interface SportScope {
  /** Internal `events.sport`. */
  sport: string;
  /** Provider-facing key to hand the adapter. */
  providerSport: string;
  /**
   * Local calendar dates (YYYY-MM-DD) the relevant Events fall on. ESPN rejects
   * date *ranges*, so the orchestration issues one request per date; deriving
   * them from the relevant Events keeps that count tied to real exposure rather
   * than to the width of the date window.
   */
  localDates: string[];
}

export interface ResolveScopeResult {
  scopes: SportScope[];
  /**
   * Relevant sports no adapter vocabulary covers. Reported rather than dropped
   * silently, so the UI can say a sport is manual-only instead of leaving the
   * user to wonder why refresh ignored it.
   */
  unsupportedSports: string[];
}

/**
 * Relevant sports, as provider keys. An Event is relevant when something is
 * riding on it or it is pinned. §5.4 makes refresh manual and §22.1 caps it
 * with a daily quota, so a request spent on a sport the user is not watching is
 * a request unavailable to one they are.
 */
export function resolveRefreshScope(
  events: ScopeEvent[],
  timeZone: string,
  filters: ScopeFilters = {},
): ResolveScopeResult {
  const sportFilter = filters.sports?.length ? new Set(filters.sports) : null;
  const includePinned = filters.includePinned ?? true;

  const byProviderSport = new Map<string, { sport: string; localDates: Set<string> }>();
  const unsupportedSports = new Set<string>();

  for (const event of events) {
    const exposed = (event.exposureCount ?? 0) > 0;
    const pinned = includePinned && (event.isPinned ?? false);
    if (!exposed && !pinned) continue;
    if (sportFilter && !sportFilter.has(event.sport)) continue;

    // League comes off the Event rather than from the caller: one internal
    // sport can span several provider keys, and the Event is what says which.
    const providerSport = toProviderSport(event.sport, event.league);
    if (providerSport == null) {
      unsupportedSports.add(event.sport);
      continue;
    }

    const bucket = byProviderSport.get(providerSport) ?? {
      sport: event.sport,
      localDates: new Set<string>(),
    };
    // A TBD start time contributes no date. The sport still refreshes — the
    // provider's current slate is the best available answer for it.
    if (event.startTimeUtc) {
      bucket.localDates.add(toLocalDateString(event.startTimeUtc, timeZone));
    }
    byProviderSport.set(providerSport, bucket);
  }

  const scopes: SportScope[] = [...byProviderSport]
    .map(([providerSport, { sport, localDates }]) => ({
      sport,
      providerSport,
      localDates: [...localDates].sort(),
    }))
    .sort((a, b) => a.providerSport.localeCompare(b.providerSport));

  return { scopes, unsupportedSports: [...unsupportedSports].sort() };
}
