import type { SupabaseClient } from "@supabase/supabase-js";
import { toBetLegSubject, type BetLegSubjectRow } from "@/lib/db/rows";
import type { BetLegSubject, MatchMethod, RootingDirection } from "@/lib/types/domain";
import { resolveSubjectDirection } from "@/lib/betting/subjects";

export interface SetBetLegSubjectInput {
  betLegId: string;
  participantId?: string;
  teamId?: string;
  proposedDirection: RootingDirection;
  matchMethod: MatchMethod;
}

/**
 * Links a subject (participant or team, exactly one) to a leg with a
 * proposed direction. If the subject is already linked, the proposal only
 * replaces an "auto" direction — a manually-edited direction survives
 * re-matching (docs/PRD.md section 26.2).
 */
export async function setBetLegSubject(
  supabase: SupabaseClient,
  userId: string,
  input: SetBetLegSubjectInput,
): Promise<BetLegSubject> {
  if (Boolean(input.participantId) === Boolean(input.teamId)) {
    throw new Error("Exactly one of participantId or teamId must be set");
  }

  const filterColumn = input.participantId ? "participant_id" : "team_id";
  const filterValue = input.participantId ?? input.teamId;

  const { data: existing, error: existingError } = await supabase
    .from("bet_leg_subjects")
    .select("*")
    .eq("bet_leg_id", input.betLegId)
    .eq(filterColumn, filterValue as string)
    .maybeSingle();
  if (existingError) throw existingError;

  const existingRow = existing as BetLegSubjectRow | null;
  const resolved = resolveSubjectDirection(
    existingRow
      ? { direction: existingRow.direction, directionSource: existingRow.direction_source }
      : undefined,
    input.proposedDirection,
  );

  if (existingRow) {
    const { data, error } = await supabase
      .from("bet_leg_subjects")
      .update({
        direction: resolved.direction,
        direction_source: resolved.directionSource,
        match_method: input.matchMethod,
      })
      .eq("id", existingRow.id)
      .select("*")
      .single();
    if (error) throw error;
    return toBetLegSubject(data as BetLegSubjectRow);
  }

  const { data, error } = await supabase
    .from("bet_leg_subjects")
    .insert({
      user_id: userId,
      bet_leg_id: input.betLegId,
      participant_id: input.participantId ?? null,
      team_id: input.teamId ?? null,
      direction: resolved.direction,
      direction_source: resolved.directionSource,
      match_method: input.matchMethod,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toBetLegSubject(data as BetLegSubjectRow);
}

/** Explicitly sets a subject's direction by hand; this becomes "manual" and survives re-matching. */
export async function setManualSubjectDirection(
  supabase: SupabaseClient,
  subjectId: string,
  direction: RootingDirection,
): Promise<void> {
  const { error } = await supabase
    .from("bet_leg_subjects")
    .update({ direction, direction_source: "manual" })
    .eq("id", subjectId);
  if (error) throw error;
}

export async function removeBetLegSubject(supabase: SupabaseClient, subjectId: string): Promise<void> {
  const { error } = await supabase.from("bet_leg_subjects").delete().eq("id", subjectId);
  if (error) throw error;
}
