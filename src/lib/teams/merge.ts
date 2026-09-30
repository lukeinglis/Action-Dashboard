import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Merges `sourceTeamId` into `targetTeamId`: moves every link to the
 * surviving Team, then deletes the duplicate (docs/PRD.md section 63.1).
 */
export async function mergeTeamInto(
  supabase: SupabaseClient,
  sourceTeamId: string,
  targetTeamId: string,
): Promise<void> {
  if (sourceTeamId === targetTeamId) {
    throw new Error("Cannot merge a Team into itself");
  }

  const { error: homeError } = await supabase
    .from("events")
    .update({ home_team_id: targetTeamId })
    .eq("home_team_id", sourceTeamId);
  if (homeError) throw homeError;

  const { error: awayError } = await supabase
    .from("events")
    .update({ away_team_id: targetTeamId })
    .eq("away_team_id", sourceTeamId);
  if (awayError) throw awayError;

  const { error: participantsError } = await supabase
    .from("participants")
    .update({ team_id: targetTeamId })
    .eq("team_id", sourceTeamId);
  if (participantsError) throw participantsError;

  const { data: subjects, error: subjectsError } = await supabase
    .from("bet_leg_subjects")
    .select("*")
    .eq("team_id", sourceTeamId);
  if (subjectsError) throw subjectsError;

  for (const subject of subjects ?? []) {
    const { data: existingOnTarget, error: existingError } = await supabase
      .from("bet_leg_subjects")
      .select("id")
      .eq("bet_leg_id", subject.bet_leg_id)
      .eq("team_id", targetTeamId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existingOnTarget) {
      const { error: deleteError } = await supabase
        .from("bet_leg_subjects")
        .delete()
        .eq("id", subject.id);
      if (deleteError) throw deleteError;
    } else {
      const { error: updateError } = await supabase
        .from("bet_leg_subjects")
        .update({ team_id: targetTeamId })
        .eq("id", subject.id);
      if (updateError) throw updateError;
    }
  }

  const { data: mappings, error: mappingsError } = await supabase
    .from("provider_mappings")
    .select("*")
    .eq("entity_type", "team")
    .eq("entity_id", sourceTeamId);
  if (mappingsError) throw mappingsError;

  for (const mapping of mappings ?? []) {
    const { data: existingOnTarget, error: existingError } = await supabase
      .from("provider_mappings")
      .select("id")
      .eq("entity_type", "team")
      .eq("entity_id", targetTeamId)
      .eq("provider_key", mapping.provider_key)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existingOnTarget) {
      const { error: deleteError } = await supabase
        .from("provider_mappings")
        .delete()
        .eq("id", mapping.id);
      if (deleteError) throw deleteError;
    } else {
      const { error: updateError } = await supabase
        .from("provider_mappings")
        .update({ entity_id: targetTeamId })
        .eq("id", mapping.id);
      if (updateError) throw updateError;
    }
  }

  const { error: deleteTeamError } = await supabase.from("teams").delete().eq("id", sourceTeamId);
  if (deleteTeamError) throw deleteTeamError;
}
