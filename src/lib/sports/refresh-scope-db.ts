// Loads the §23 refresh scope from the database.
//
// `resolveRefreshScope` is pure and takes the relevant Events; this is the part
// that decides which Events those are. It deliberately reuses
// `isScheduleRailEligible` — the same predicate the Schedule Rail uses — so a
// refresh fetches what the dashboard is actually showing rather than answering
// to a second, slightly different definition of "relevant".
//
// Relevance only needs to know whether an Event has *any* exposure, not how
// much, so membership in the three link tables is enough and the full exposure
// pipeline (leg settlement, ticket status, entry status) is not duplicated
// here. That over-includes slightly: an Event whose only leg has settled still
// counts as exposed. The date window and the finalized-status rules inside
// `isScheduleRailEligible` discard the old ones, and the residue errs toward
// refreshing an Event the user has stopped caring about rather than leaving a
// live one stale — the right direction for a button labelled "refresh".

import type { SupabaseClient } from "@supabase/supabase-js";
import { toEvent, type EventRow } from "@/lib/db/rows";
import { displayedStatus } from "@/lib/events/overrides";
import { isScheduleRailEligible } from "@/lib/dashboard/schedule";
import type { DashboardViewFilters } from "@/lib/types/domain";
import { resolveRefreshScope, type ResolveScopeResult, type ScopeEvent } from "./refresh-scope";

/** Tables that link an Event to something the user has riding on it (§11.6). */
const EXPOSURE_TABLES = ["bet_leg_events", "fantasy_roster_slots", "dfs_lineup_slots"] as const;

export interface LoadRefreshScopeOptions {
  userId: string;
  timeZone: string;
  rolloverHour: number;
  filters: DashboardViewFilters;
  dateWindow: { start: Date; end: Date };
  now: Date;
}

export async function loadRefreshScope(
  supabase: SupabaseClient,
  options: LoadRefreshScopeOptions,
): Promise<ResolveScopeResult> {
  const { userId, timeZone, rolloverHour, filters, dateWindow, now } = options;

  const eventRes = await supabase.from("events").select("*").eq("user_id", userId);
  if (eventRes.error) throw eventRes.error;

  const linked = await exposedEventIds(supabase, userId);

  const events = (eventRes.data ?? []).map((row) => toEvent(row as EventRow));

  const relevant: ScopeEvent[] = events
    .filter((event) =>
      isScheduleRailEligible(
        {
          id: event.id,
          status: displayedStatus(event),
          startTimeUtc: event.startTimeUtc,
          endTimeUtc: event.endTimeUtc,
          statusChangedAt: event.manualSetAt ?? event.automaticChangedAt,
          isPinned: event.isPinned,
          exposureCount: linked.has(event.id) ? 1 : 0,
        },
        dateWindow,
        now,
        timeZone,
        rolloverHour,
      ),
    )
    .map((event) => ({
      id: event.id,
      sport: event.sport,
      league: event.league ?? null,
      startTimeUtc: event.startTimeUtc ?? null,
      isPinned: event.isPinned,
      exposureCount: linked.has(event.id) ? 1 : 0,
    }));

  return resolveRefreshScope(relevant, timeZone, {
    sports: filters.sports,
    includePinned: filters.includePinned,
  });
}

/** Event ids with at least one Betting, Fantasy or DFS term riding on them. */
async function exposedEventIds(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const results = await Promise.all(
    EXPOSURE_TABLES.map((table) => supabase.from(table).select("event_id").eq("user_id", userId)),
  );

  const ids = new Set<string>();
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of (data ?? []) as { event_id: string | null }[]) {
      // Fantasy and DFS slots carry a nullable event_id: an unmatched player
      // has nothing riding on any Event yet.
      if (row.event_id) ids.add(row.event_id);
    }
  }
  return ids;
}
