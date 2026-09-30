import type { SupabaseClient } from "@supabase/supabase-js";

/** Thrown when a delete is blocked because something still links to the Team (docs/PRD.md section 63.1). */
export class TeamLinkedError extends Error {
  constructor() {
    super("Team is linked to one or more Events, Participants, or BetLeg subjects");
    this.name = "TeamLinkedError";
  }
}

async function hasAnyTeamLinks(supabase: SupabaseClient, teamId: string): Promise<boolean> {
  const checks = await Promise.all([
    supabase.from("events").select("id").eq("home_team_id", teamId),
    supabase.from("events").select("id").eq("away_team_id", teamId),
    supabase.from("participants").select("id").eq("team_id", teamId),
    supabase.from("bet_leg_subjects").select("id").eq("team_id", teamId),
  ]);

  for (const { data, error } of checks) {
    if (error) throw error;
    if ((data ?? []).length > 0) return true;
  }
  return false;
}

/** Hard-deletes a Team. Blocked while anything links to it; offer Merge Into… instead (docs/PRD.md section 63.1). */
export async function deleteTeam(supabase: SupabaseClient, teamId: string): Promise<void> {
  if (await hasAnyTeamLinks(supabase, teamId)) {
    throw new TeamLinkedError();
  }

  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) throw error;
}
