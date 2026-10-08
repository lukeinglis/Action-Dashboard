// Writes live leg state back after a refresh. See docs/PRD.md §26.1 and §45.
//
// §22's refresh moved scorelines onto Events; this is what carries that through
// to the legs, so one press of the button answers "is my ticket winning" and
// not merely "what is the score". The arithmetic lives in evaluate-leg.ts; this
// file is only the database edge around it.
//
// Three rules it inherits from §45, all of which matter for correctness:
//
//   1. Only `automatic_*` columns are written. A manual state the user set by
//      hand outranks whatever this computes and must survive a refresh.
//   2. `automatic_changed_at` advances only on a real change, because a stale
//      override is defined as `automaticChangedAt > manualSetAt` — bumping it
//      every refresh would mark every override stale within the minute.
//   3. An unknown evaluation does not erase a known stored one. A provider that
//      briefly stops reporting a score should leave the last good state on
//      screen rather than blanking every chip the user is watching.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventStatus, LegSettlement, LiveLegState } from "@/lib/types/domain";
import { evaluateLeg, type EvaluationSubject } from "./evaluate-leg";

export interface UpdateLegStatesResult {
  /** Legs whose automatic state actually moved. */
  updated: number;
  /** Legs re-evaluated to the same state, so not written. */
  unchanged: number;
}

interface LegRow {
  id: string;
  market_type: string;
  line: number | null;
  automatic_live_state: LiveLegState | null;
  automatic_status: LegSettlement | null;
  live_detail: string | null;
}

interface EventScoreRow {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  automatic_status: EventStatus | null;
  manual_status: EventStatus | null;
  automatic_home_score: number | null;
  manual_home_score: number | null;
  automatic_away_score: number | null;
  manual_away_score: number | null;
}

/**
 * Recomputes the automatic live state and settlement of every leg linked to
 * `eventIds`.
 *
 * Never throws for a leg it cannot evaluate: an unmodelled market or an
 * unmatched team yields "unknown", which is then skipped rather than written.
 * §22 requires a refresh to degrade without taking the dashboard down, and a
 * leg is exactly the kind of user data that must not be clobbered on a guess.
 */
export async function updateLegStates(
  supabase: SupabaseClient,
  options: { userId: string; eventIds: string[]; now?: () => string },
): Promise<UpdateLegStatesResult> {
  const { userId } = options;
  const eventIds = [...new Set(options.eventIds)];
  const now = options.now ?? (() => new Date().toISOString());

  const result: UpdateLegStatesResult = { updated: 0, unchanged: 0 };
  if (eventIds.length === 0) return result;

  // Which legs ride on these Events (§26.1's bet_leg_events linkage).
  const { data: affectedRows, error: affectedError } = await supabase
    .from("bet_leg_events")
    .select("bet_leg_id,event_id")
    .eq("user_id", userId)
    .in("event_id", eventIds);
  if (affectedError) throw affectedError;

  const legIds = [...new Set(((affectedRows ?? []) as { bet_leg_id: string }[]).map((l) => l.bet_leg_id))];
  if (legIds.length === 0) return result;

  // Then *all* of those legs' links, not just the ones pointing into this
  // refresh. Counting only the links we filtered for would make a leg spanning
  // two games look single-Event and settle it off one scoreline.
  const { data: linkRows, error: linkError } = await supabase
    .from("bet_leg_events")
    .select("bet_leg_id,event_id")
    .eq("user_id", userId)
    .in("bet_leg_id", legIds);
  if (linkError) throw linkError;

  const links = (linkRows ?? []) as { bet_leg_id: string; event_id: string }[];

  const [legs, events, subjectsByLeg] = await Promise.all([
    loadLegs(supabase, legIds),
    loadEvents(supabase, eventIds),
    loadSubjects(supabase, legIds),
  ]);

  // A leg can be linked to several Events (a same-game parlay is still one
  // Event; a cross-game leg is not). Only single-Event legs can be settled off
  // one scoreline, so anything with several links is left to the user.
  const eventIdByLeg = new Map<string, string | null>();
  for (const { bet_leg_id, event_id } of links) {
    eventIdByLeg.set(bet_leg_id, eventIdByLeg.has(bet_leg_id) ? null : event_id);
  }

  for (const leg of legs) {
    const eventId = eventIdByLeg.get(leg.id);
    const event = eventId ? events.get(eventId) : undefined;

    const evaluation = evaluateLeg(
      { marketType: leg.market_type, line: leg.line },
      subjectsByLeg.get(leg.id) ?? [],
      event ?? null,
    );

    // Rule 3: silence never overwrites a stored answer, and never invents one.
    if (evaluation.liveState === "unknown") {
      result.unchanged += 1;
      continue;
    }

    const changed =
      evaluation.liveState !== leg.automatic_live_state ||
      evaluation.settlement !== (leg.automatic_status ?? "open") ||
      evaluation.detail !== leg.live_detail;

    if (!changed) {
      result.unchanged += 1;
      continue;
    }

    const { error } = await supabase
      .from("bet_legs")
      .update({
        automatic_live_state: evaluation.liveState,
        // "open" is stored as null, matching how a leg starts life and how
        // legSettlement() reads it back.
        automatic_status: evaluation.settlement === "open" ? null : evaluation.settlement,
        live_detail: evaluation.detail,
        automatic_changed_at: now(),
      })
      .eq("id", leg.id);
    if (error) throw error;
    result.updated += 1;
  }

  return result;
}

async function loadLegs(supabase: SupabaseClient, legIds: string[]): Promise<LegRow[]> {
  const { data, error } = await supabase
    .from("bet_legs")
    .select("id,market_type,line,automatic_live_state,automatic_status,live_detail")
    .in("id", legIds);
  if (error) throw error;
  return (data ?? []) as LegRow[];
}

/** Events keyed by id, with §45's `manual ?? automatic` already resolved. */
async function loadEvents(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, {
  status: EventStatus | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
}>> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id,home_team_id,away_team_id,automatic_status,manual_status,automatic_home_score,manual_home_score,automatic_away_score,manual_away_score",
    )
    .in("id", eventIds);
  if (error) throw error;

  const map = new Map<string, ReturnType<typeof resolve>>();
  for (const row of (data ?? []) as EventScoreRow[]) map.set(row.id, resolve(row));
  return map;
}

/**
 * A manually corrected score is the one the leg state must follow — §45 makes
 * the manual value what the user sees, and a chip disagreeing with the
 * scoreline beside it would be worse than no chip.
 */
function resolve(row: EventScoreRow) {
  return {
    status: row.manual_status ?? row.automatic_status ?? null,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeScore: row.manual_home_score ?? row.automatic_home_score ?? null,
    awayScore: row.manual_away_score ?? row.automatic_away_score ?? null,
  };
}

async function loadSubjects(
  supabase: SupabaseClient,
  legIds: string[],
): Promise<Map<string, EvaluationSubject[]>> {
  const { data, error } = await supabase
    .from("bet_leg_subjects")
    .select("bet_leg_id,team_id,direction")
    .in("bet_leg_id", legIds);
  if (error) throw error;

  const map = new Map<string, EvaluationSubject[]>();
  for (const row of (data ?? []) as { bet_leg_id: string; team_id: string | null; direction: EvaluationSubject["direction"] }[]) {
    const list = map.get(row.bet_leg_id) ?? [];
    list.push({ teamId: row.team_id, direction: row.direction });
    map.set(row.bet_leg_id, list);
  }
  return map;
}
