// FantasyRosterSlot CRUD (docs/PRD.md section 37, 45).

import type { SupabaseClient } from "@supabase/supabase-js";
import { toFantasyRosterSlot, type FantasyRosterSlotRow } from "@/lib/db/rows";
import type { FantasyRosterSlot, MatchMethod, RosterSlotSide } from "@/lib/types/domain";

export interface CreateFantasyRosterSlotInput {
  fantasyMatchupId: string;
  side: RosterSlotSide;
  slot: string;
  playerName: string;
  participantId?: string;
  participantMatchMethod?: MatchMethod;
  projectedPoints?: number;
  automaticActualPoints?: number;
  eventId?: string;
  eventMatchMethod?: MatchMethod;
}

export async function createFantasyRosterSlot(
  supabase: SupabaseClient,
  userId: string,
  input: CreateFantasyRosterSlotInput,
): Promise<FantasyRosterSlot> {
  const { data, error } = await supabase
    .from("fantasy_roster_slots")
    .insert({
      user_id: userId,
      fantasy_matchup_id: input.fantasyMatchupId,
      side: input.side,
      slot: input.slot,
      player_name: input.playerName,
      participant_id: input.participantId ?? null,
      participant_match_method: input.participantMatchMethod ?? null,
      projected_points: input.projectedPoints ?? null,
      automatic_actual_points: input.automaticActualPoints ?? null,
      automatic_changed_at: input.automaticActualPoints !== undefined ? new Date().toISOString() : null,
      event_id: input.eventId ?? null,
      event_match_method: input.eventMatchMethod ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toFantasyRosterSlot(data as FantasyRosterSlotRow);
}

/** Sets a manual override for a slot's actual points (docs/PRD.md section 45). */
export async function setManualRosterSlotPoints(
  supabase: SupabaseClient,
  slotId: string,
  points: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("fantasy_roster_slots")
    .update({ manual_actual_points: points, manual_set_at: new Date().toISOString() })
    .eq("id", slotId);
  if (error) throw error;
}
