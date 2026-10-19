// FantasyLeague CRUD (docs/PRD.md section 35, 63.1).

import type { SupabaseClient } from "@supabase/supabase-js";
import { toFantasyLeague, type FantasyLeagueRow } from "@/lib/db/rows";
import type { FantasyLeague } from "@/lib/types/domain";

export interface CreateFantasyLeagueInput {
  name: string;
  platform?: string;
  sport: string;
  season: string;
  userTeamName?: string;
}

export async function createFantasyLeague(
  supabase: SupabaseClient,
  userId: string,
  input: CreateFantasyLeagueInput,
): Promise<FantasyLeague> {
  const { data, error } = await supabase
    .from("fantasy_leagues")
    .insert({
      user_id: userId,
      name: input.name,
      platform: input.platform ?? null,
      sport: input.sport,
      season: input.season,
      user_team_name: input.userTeamName ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toFantasyLeague(data as FantasyLeagueRow);
}

/**
 * Finds an existing FantasyLeague by exact name (scoped to the user), or null.
 *
 * `season` narrows the match when supplied, because a league's name is only
 * unique *within* a season — the same league is re-entered every year, and §35
 * models that as one row per season. Matching on name alone would hand back
 * last year's row, and the matchup's week would be filed under the wrong
 * season. This matters more now that an absent "League:" line falls back to the
 * user's fantasy team name (see parse-fantasy-matchup.ts), which is stable
 * across seasons and so collides across them by design.
 *
 * Returns the first match rather than erroring when several share a name: the
 * caller is mid-approval with a Ticket's worth of rows already written, and a
 * duplicate league is the user's to merge (§63.1), not a reason to fail the
 * import.
 */
export async function findFantasyLeagueByName(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  season?: string,
): Promise<FantasyLeague | null> {
  let query = supabase.from("fantasy_leagues").select("*").eq("user_id", userId).eq("name", name);
  if (season) query = query.eq("season", season);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as FantasyLeagueRow[];
  return rows.length > 0 ? toFantasyLeague(rows[0]) : null;
}

/** Finds a FantasyLeague by name and season, creating it if it doesn't exist yet. */
export async function findOrCreateFantasyLeague(
  supabase: SupabaseClient,
  userId: string,
  input: CreateFantasyLeagueInput,
): Promise<FantasyLeague> {
  const existing = await findFantasyLeagueByName(supabase, userId, input.name, input.season);
  if (existing) return existing;
  return createFantasyLeague(supabase, userId, input);
}

/** Hard-deletes a FantasyLeague; cascades to its matchups and their roster slots (docs/PRD.md section 63.1). */
export async function deleteFantasyLeague(supabase: SupabaseClient, fantasyLeagueId: string): Promise<void> {
  const { data: matchups, error: matchupsError } = await supabase
    .from("fantasy_matchups")
    .select("id")
    .eq("fantasy_league_id", fantasyLeagueId);
  if (matchupsError) throw matchupsError;

  const matchupIds = (matchups ?? []).map((m) => m.id as string);
  if (matchupIds.length > 0) {
    const { error: slotsError } = await supabase
      .from("fantasy_roster_slots")
      .delete()
      .in("fantasy_matchup_id", matchupIds);
    if (slotsError) throw slotsError;

    const { error: deleteMatchupsError } = await supabase
      .from("fantasy_matchups")
      .delete()
      .eq("fantasy_league_id", fantasyLeagueId);
    if (deleteMatchupsError) throw deleteMatchupsError;
  }

  const { error } = await supabase.from("fantasy_leagues").delete().eq("id", fantasyLeagueId);
  if (error) throw error;
}
