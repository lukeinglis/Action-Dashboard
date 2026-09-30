import type { SupabaseClient } from "@supabase/supabase-js";
import { toBetLeg, type BetLegRow } from "@/lib/db/rows";
import type { BetLeg, LegSettlement, LiveLegState } from "@/lib/types/domain";

export interface CreateBetLegInput {
  ticketId: string;
  sport: string;
  league?: string;
  rawDescription?: string;
  marketType: string;
  selection?: string;
  line?: number;
  oddsAmerican?: number;
  notes?: string;
}

export async function createBetLeg(
  supabase: SupabaseClient,
  userId: string,
  input: CreateBetLegInput,
): Promise<BetLeg> {
  const { data, error } = await supabase
    .from("bet_legs")
    .insert({
      user_id: userId,
      ticket_id: input.ticketId,
      sport: input.sport,
      league: input.league ?? null,
      raw_description: input.rawDescription ?? null,
      market_type: input.marketType,
      selection: input.selection ?? null,
      line: input.line ?? null,
      odds_american: input.oddsAmerican ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toBetLeg(data as BetLegRow);
}

export interface UpdateBetLegInput {
  rawDescription?: string | null;
  marketType?: string;
  selection?: string | null;
  line?: number | null;
  oddsAmerican?: number | null;
  notes?: string | null;
}

export async function updateBetLeg(
  supabase: SupabaseClient,
  betLegId: string,
  input: UpdateBetLegInput,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (input.rawDescription !== undefined) update.raw_description = input.rawDescription;
  if (input.marketType !== undefined) update.market_type = input.marketType;
  if (input.selection !== undefined) update.selection = input.selection;
  if (input.line !== undefined) update.line = input.line;
  if (input.oddsAmerican !== undefined) update.odds_american = input.oddsAmerican;
  if (input.notes !== undefined) update.notes = input.notes;

  const { error } = await supabase.from("bet_legs").update(update).eq("id", betLegId);
  if (error) throw error;
}

/** Sets the manual settlement for a leg. Passing null returns it to automatic. */
export async function setManualLegStatus(
  supabase: SupabaseClient,
  betLegId: string,
  status: LegSettlement | null,
): Promise<void> {
  const { error } = await supabase
    .from("bet_legs")
    .update({ manual_status: status, manual_set_at: status ? new Date().toISOString() : null })
    .eq("id", betLegId);
  if (error) throw error;
}

export async function setManualLegLiveState(
  supabase: SupabaseClient,
  betLegId: string,
  liveState: LiveLegState | null,
  liveDetail?: string | null,
): Promise<void> {
  const update: Record<string, unknown> = { manual_live_state: liveState };
  if (liveDetail !== undefined) update.live_detail = liveDetail;

  const { error } = await supabase.from("bet_legs").update(update).eq("id", betLegId);
  if (error) throw error;
}

/** Deletes a BetLeg's event and subject links only, without deleting the leg itself. */
export async function deleteBetLegLinks(supabase: SupabaseClient, betLegId: string): Promise<void> {
  const { error: eventsError } = await supabase.from("bet_leg_events").delete().eq("bet_leg_id", betLegId);
  if (eventsError) throw eventsError;

  const { error: subjectsError } = await supabase
    .from("bet_leg_subjects")
    .delete()
    .eq("bet_leg_id", betLegId);
  if (subjectsError) throw subjectsError;
}

/** Hard-deletes a BetLeg; cascades to its event and subject links (docs/PRD.md section 63.1). */
export async function deleteBetLeg(supabase: SupabaseClient, betLegId: string): Promise<void> {
  await deleteBetLegLinks(supabase, betLegId);

  const { error } = await supabase.from("bet_legs").delete().eq("id", betLegId);
  if (error) throw error;
}
