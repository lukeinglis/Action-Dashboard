import type { SupabaseClient } from "@supabase/supabase-js";

/** Thrown when a delete is blocked because something still links to the Participant (docs/PRD.md section 63.1). */
export class ParticipantLinkedError extends Error {
  constructor() {
    super("Participant is linked to one or more BetLeg subjects");
    this.name = "ParticipantLinkedError";
  }
}

/** Hard-deletes a Participant. Blocked while anything links to it; offer Merge Into… instead (docs/PRD.md section 63.1). */
export async function deleteParticipant(supabase: SupabaseClient, participantId: string): Promise<void> {
  const { data, error } = await supabase
    .from("bet_leg_subjects")
    .select("id")
    .eq("participant_id", participantId);
  if (error) throw error;
  if ((data ?? []).length > 0) throw new ParticipantLinkedError();

  const { error: deleteError } = await supabase.from("participants").delete().eq("id", participantId);
  if (deleteError) throw deleteError;
}
