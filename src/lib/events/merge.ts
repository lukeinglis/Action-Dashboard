import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Merges `sourceEventId` into `targetEventId`: moves every link to the
 * surviving Event, then deletes the duplicate (docs/PRD.md sections 20.2,
 * 63.1). In Phase 1 the only link table is provider_mappings; later phases
 * (BetLegEvent, FantasyRosterSlot, DFSLineupSlot) add more tables here.
 */
export async function mergeEventInto(
  supabase: SupabaseClient,
  sourceEventId: string,
  targetEventId: string,
): Promise<void> {
  if (sourceEventId === targetEventId) {
    throw new Error("Cannot merge an Event into itself");
  }

  const { data: mappings, error: mappingsError } = await supabase
    .from("provider_mappings")
    .select("*")
    .eq("entity_type", "event")
    .eq("entity_id", sourceEventId);

  if (mappingsError) throw mappingsError;

  for (const mapping of mappings ?? []) {
    const { data: existingOnTarget, error: existingError } = await supabase
      .from("provider_mappings")
      .select("id")
      .eq("entity_type", "event")
      .eq("entity_id", targetEventId)
      .eq("provider_key", mapping.provider_key)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingOnTarget) {
      // Target already has a mapping for this provider; drop the duplicate.
      const { error: deleteError } = await supabase
        .from("provider_mappings")
        .delete()
        .eq("id", mapping.id);
      if (deleteError) throw deleteError;
    } else {
      const { error: updateError } = await supabase
        .from("provider_mappings")
        .update({ entity_id: targetEventId })
        .eq("id", mapping.id);
      if (updateError) throw updateError;
    }
  }

  const { data: sourceEvent, error: sourceError } = await supabase
    .from("events")
    .select("is_pinned")
    .eq("id", sourceEventId)
    .single();
  if (sourceError) throw sourceError;

  if (sourceEvent?.is_pinned) {
    const { error: pinError } = await supabase
      .from("events")
      .update({ is_pinned: true })
      .eq("id", targetEventId);
    if (pinError) throw pinError;
  }

  const { error: deleteEventError } = await supabase
    .from("events")
    .delete()
    .eq("id", sourceEventId);
  if (deleteEventError) throw deleteEventError;
}
