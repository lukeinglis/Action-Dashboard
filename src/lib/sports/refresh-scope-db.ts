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
//
// Rail eligibility alone is not enough, though, and the gap is a bug the user
// hit: a game that finished last Sunday fails every branch of it once the date
// window has moved on, so it was never fetched, never reached `final`, and the
// bets riding on it could never settle (§26.1 only settles a leg off a final
// Event). The dashboard is the right authority on which *scores* matter; it is
// the wrong authority on which bets still need grading. So scope is the union
// of the rail and `needsSettlement` below.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toEvent, type EventRow } from "@/lib/db/rows";
import { displayedStatus } from "@/lib/events/overrides";
import { isFinalizedStatus, isScheduleRailEligible } from "@/lib/dashboard/schedule";
import type { DashboardViewFilters, Event } from "@/lib/types/domain";
import { resolveRefreshScope, type ResolveScopeResult, type ScopeEvent } from "./refresh-scope";

/**
 * The Fantasy and DFS halves of §11.6 exposure. Betting exposure is read
 * separately because it is the only one that carries settlement state.
 */
const SLOT_EXPOSURE_TABLES = ["fantasy_roster_slots", "dfs_lineup_slots"] as const;

/**
 * How far back the settlement carve-out reaches.
 *
 * It needs to cover "I didn't open the app for a couple of weeks" without
 * growing without bound: each extra calendar date costs one provider request
 * per sport (§23 issues one per date), and an Event the provider never resolves
 * — an unsupported league, a game it has no record of — would otherwise be
 * re-fetched on every refresh forever. Past this, the user widens the date
 * window or grades it by hand.
 */
const SETTLEMENT_BACKFILL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const { linked, ungraded } = await exposure(supabase, userId);

  const events = (eventRes.data ?? []).map((row) => toEvent(row as EventRow));

  const relevant: ScopeEvent[] = events
    .filter(
      (event) =>
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
        ) || needsSettlement(event, ungraded, now),
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

/**
 * An Event a bet is still waiting on: started, not yet resolved, recent enough
 * to be worth a request.
 *
 * Deliberately narrower than exposure. Exposure asks "does the user care about
 * this game", which stays true forever; this asks "can a refresh still change
 * an answer", which stops being true as soon as the Event goes final — so an
 * Event leaves the carve-out by being graded, and the backfill empties itself
 * instead of growing one game per week.
 *
 * An Event with no start time is left to the rail rules: without one there is
 * no way to tell a game that needs grading from one that hasn't kicked off.
 */
function needsSettlement(event: Event, ungradedEventIds: Set<string>, now: Date): boolean {
  if (!ungradedEventIds.has(event.id)) return false;
  if (isFinalizedStatus(displayedStatus(event))) return false;
  if (!event.startTimeUtc) return false;

  const elapsed = now.getTime() - new Date(event.startTimeUtc).getTime();
  return elapsed > 0 && elapsed <= SETTLEMENT_BACKFILL_DAYS * DAY_MS;
}

interface Exposure {
  /** Event ids with at least one Betting, Fantasy or DFS term riding on them. */
  linked: Set<string>;
  /** Event ids carrying a bet leg that has not settled, manually or automatically. */
  ungraded: Set<string>;
}

async function exposure(supabase: SupabaseClient, userId: string): Promise<Exposure> {
  const [links, legs, ...slots] = await Promise.all([
    supabase.from("bet_leg_events").select("bet_leg_id,event_id").eq("user_id", userId),
    supabase.from("bet_legs").select("id,manual_status,automatic_status").eq("user_id", userId),
    ...SLOT_EXPOSURE_TABLES.map((table) => supabase.from(table).select("event_id").eq("user_id", userId)),
  ]);

  const linked = new Set<string>();
  for (const { data, error } of slots) {
    if (error) throw error;
    for (const row of (data ?? []) as { event_id: string | null }[]) {
      // Fantasy and DFS slots carry a nullable event_id: an unmatched player
      // has nothing riding on any Event yet.
      if (row.event_id) linked.add(row.event_id);
    }
  }

  if (legs.error) throw legs.error;
  const ungradedLegIds = new Set(
    ((legs.data ?? []) as { id: string; manual_status: string | null; automatic_status: string | null }[])
      .filter((leg) => !leg.manual_status && !leg.automatic_status)
      .map((leg) => leg.id),
  );

  if (links.error) throw links.error;
  const ungraded = new Set<string>();
  for (const row of (links.data ?? []) as { bet_leg_id: string; event_id: string | null }[]) {
    if (!row.event_id) continue;
    linked.add(row.event_id);
    if (ungradedLegIds.has(row.bet_leg_id)) ungraded.add(row.event_id);
  }

  return { linked, ungraded };
}
