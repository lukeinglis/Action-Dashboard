// FantasyMatchup CRUD (docs/PRD.md section 36, 63.1) and Mark Final
// (docs/PRD.md section 8: "the status never changes automatically").

import type { SupabaseClient } from "@supabase/supabase-js";
import { sortKeyAfter } from "@/lib/sort/sort-key";
import { toFantasyMatchup, type FantasyMatchupRow } from "@/lib/db/rows";
import type { FantasyMatchup } from "@/lib/types/domain";

export interface CreateFantasyMatchupInput {
  fantasyLeagueId: string;
  week?: number;
  userTeamName: string;
  opponentTeamName: string;
  automaticUserScore?: number;
  automaticOpponentScore?: number;
  userProjectedScore?: number;
  opponentProjectedScore?: number;
  importRecordId?: string;
}

async function lastSortKey(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("fantasy_matchups").select("sort_key").eq("user_id", userId);
  if (error) throw error;
  const keys = (data ?? []).map((row) => row.sort_key as string);
  if (keys.length === 0) return null;
  return keys.sort().at(-1) ?? null;
}

/** Creates a FantasyMatchup, appending it to the end of the user's sortKey order. */
export async function createFantasyMatchup(
  supabase: SupabaseClient,
  userId: string,
  input: CreateFantasyMatchupInput,
): Promise<FantasyMatchup> {
  const sortKey = sortKeyAfter(await lastSortKey(supabase, userId));
  const hasAutomaticScore = input.automaticUserScore !== undefined || input.automaticOpponentScore !== undefined;

  const { data, error } = await supabase
    .from("fantasy_matchups")
    .insert({
      user_id: userId,
      fantasy_league_id: input.fantasyLeagueId,
      week: input.week ?? null,
      user_team_name: input.userTeamName,
      opponent_team_name: input.opponentTeamName,
      automatic_user_score: input.automaticUserScore ?? null,
      automatic_opponent_score: input.automaticOpponentScore ?? null,
      automatic_changed_at: hasAutomaticScore ? new Date().toISOString() : null,
      user_projected_score: input.userProjectedScore ?? null,
      opponent_projected_score: input.opponentProjectedScore ?? null,
      status: "upcoming",
      sort_key: sortKey,
      import_record_id: input.importRecordId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toFantasyMatchup(data as FantasyMatchupRow);
}

/** Marks a FantasyMatchup final by hand; the status never changes automatically (docs/PRD.md section 8). */
export async function markFantasyMatchupFinal(supabase: SupabaseClient, matchupId: string): Promise<void> {
  const { error } = await supabase
    .from("fantasy_matchups")
    .update({ status: "final", finalized_at: new Date().toISOString() })
    .eq("id", matchupId);
  if (error) throw error;
}

/** Hard-deletes a FantasyMatchup; cascades to its roster slots (docs/PRD.md section 63.1). */
export async function deleteFantasyMatchup(supabase: SupabaseClient, matchupId: string): Promise<void> {
  const { error: slotsError } = await supabase
    .from("fantasy_roster_slots")
    .delete()
    .eq("fantasy_matchup_id", matchupId);
  if (slotsError) throw slotsError;

  const { error } = await supabase.from("fantasy_matchups").delete().eq("id", matchupId);
  if (error) throw error;
}
