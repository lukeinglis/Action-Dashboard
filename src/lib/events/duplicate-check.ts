import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEventMatchKey, type MatchKeyInput } from "./match-key";
import { toEvent, type EventRow } from "@/lib/db/rows";
import type { Event } from "@/lib/types/domain";

/**
 * Finds existing Events that share a match key with the candidate.
 * Returns [] when the candidate has no start time (nothing to compare) or
 * when no existing Event matches. This never blocks creation; callers
 * decide whether to warn (docs/PRD.md section 20.2).
 */
export async function findDuplicateEvents(
  supabase: SupabaseClient,
  candidate: MatchKeyInput,
  timeZone: string,
): Promise<Event[]> {
  const matchKey = buildEventMatchKey(candidate, timeZone);
  if (!matchKey) return [];

  const isTeamSport = Boolean(candidate.homeTeamId && candidate.awayTeamId);

  let query = supabase.from("events").select("*").eq("sport", candidate.sport);

  if (isTeamSport) {
    query = query.eq("home_team_id", candidate.homeTeamId!).eq("away_team_id", candidate.awayTeamId!);
  } else {
    query = candidate.league
      ? query.eq("league", candidate.league)
      : query.is("league", null);
    query = query.is("home_team_id", null).is("away_team_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as EventRow[];

  return rows
    .map(toEvent)
    .filter((event) => buildEventMatchKey(event, timeZone) === matchKey);
}
