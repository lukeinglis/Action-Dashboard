import type { SupabaseClient } from "@supabase/supabase-js";

/** Thrown when a delete is blocked because a BetLeg is still linked to the Event (docs/PRD.md section 63.1). */
export class EventLinkedError extends Error {
  constructor() {
    super("Event is linked to one or more BetLegs");
    this.name = "EventLinkedError";
  }
}

/**
 * Hard-deletes an Event. Blocked while a BetLeg links to it; offer Merge
 * Into… or Unlink All instead (docs/PRD.md section 63.1). Its
 * provider_mappings cascade at the database level.
 */
export async function deleteEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { data, error } = await supabase.from("bet_leg_events").select("id").eq("event_id", eventId);
  if (error) throw error;
  if ((data ?? []).length > 0) throw new EventLinkedError();

  const { error: deleteError } = await supabase.from("events").delete().eq("id", eventId);
  if (deleteError) throw deleteError;
}

/** Removes every BetLeg link to this Event, clearing the way to delete it. */
export async function unlinkAllEventLinks(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase.from("bet_leg_events").delete().eq("event_id", eventId);
  if (error) throw error;
}
