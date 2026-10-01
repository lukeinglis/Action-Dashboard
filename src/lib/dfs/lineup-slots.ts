// DFSLineupSlot CRUD (docs/PRD.md section 41).

import type { SupabaseClient } from "@supabase/supabase-js";
import { toDFSLineupSlot, type DFSLineupSlotRow } from "@/lib/db/rows";
import type { DFSLineupSlot, MatchMethod } from "@/lib/types/domain";

export interface CreateDfsLineupSlotInput {
  dfsLineupId: string;
  slot: string;
  playerName: string;
  participantId?: string;
  participantMatchMethod?: MatchMethod;
  salary?: number;
  automaticActualPoints?: number;
  eventId?: string;
  eventMatchMethod?: MatchMethod;
}

export async function createDfsLineupSlot(
  supabase: SupabaseClient,
  userId: string,
  input: CreateDfsLineupSlotInput,
): Promise<DFSLineupSlot> {
  const { data, error } = await supabase
    .from("dfs_lineup_slots")
    .insert({
      user_id: userId,
      dfs_lineup_id: input.dfsLineupId,
      slot: input.slot,
      player_name: input.playerName,
      participant_id: input.participantId ?? null,
      participant_match_method: input.participantMatchMethod ?? null,
      salary: input.salary ?? null,
      automatic_actual_points: input.automaticActualPoints ?? null,
      automatic_changed_at: input.automaticActualPoints !== undefined ? new Date().toISOString() : null,
      event_id: input.eventId ?? null,
      event_match_method: input.eventMatchMethod ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toDFSLineupSlot(data as DFSLineupSlotRow);
}

/** Sets a manual override for a slot's actual points (docs/PRD.md section 45). */
export async function setManualLineupSlotPoints(
  supabase: SupabaseClient,
  slotId: string,
  points: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("dfs_lineup_slots")
    .update({ manual_actual_points: points, manual_set_at: new Date().toISOString() })
    .eq("id", slotId);
  if (error) throw error;
}
