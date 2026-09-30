import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Merges `sourceParticipantId` into `targetParticipantId`: moves every link
 * to the surviving Participant, then deletes the duplicate (docs/PRD.md
 * section 63.1).
 */
export async function mergeParticipantInto(
  supabase: SupabaseClient,
  sourceParticipantId: string,
  targetParticipantId: string,
): Promise<void> {
  if (sourceParticipantId === targetParticipantId) {
    throw new Error("Cannot merge a Participant into itself");
  }

  const { data: subjects, error: subjectsError } = await supabase
    .from("bet_leg_subjects")
    .select("*")
    .eq("participant_id", sourceParticipantId);
  if (subjectsError) throw subjectsError;

  for (const subject of subjects ?? []) {
    const { data: existingOnTarget, error: existingError } = await supabase
      .from("bet_leg_subjects")
      .select("id")
      .eq("bet_leg_id", subject.bet_leg_id)
      .eq("participant_id", targetParticipantId)
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
        .update({ participant_id: targetParticipantId })
        .eq("id", subject.id);
      if (updateError) throw updateError;
    }
  }

  const { data: mappings, error: mappingsError } = await supabase
    .from("provider_mappings")
    .select("*")
    .eq("entity_type", "participant")
    .eq("entity_id", sourceParticipantId);
  if (mappingsError) throw mappingsError;

  for (const mapping of mappings ?? []) {
    const { data: existingOnTarget, error: existingError } = await supabase
      .from("provider_mappings")
      .select("id")
      .eq("entity_type", "participant")
      .eq("entity_id", targetParticipantId)
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
        .update({ entity_id: targetParticipantId })
        .eq("id", mapping.id);
      if (updateError) throw updateError;
    }
  }

  const { error: deleteParticipantError } = await supabase
    .from("participants")
    .delete()
    .eq("id", sourceParticipantId);
  if (deleteParticipantError) throw deleteParticipantError;
}
