import type { SupabaseClient } from "@supabase/supabase-js";
import { toBetLegEvent, type BetLegEventRow } from "@/lib/db/rows";
import type { BetLegEvent, LegSettlement, MatchMethod } from "@/lib/types/domain";

/**
 * Links a BetLeg to an Event. Unique on (betLegId, eventId); a duplicate
 * link is a no-op. Automatic matching never overwrites a manual link
 * (docs/PRD.md section 26.1): an "auto" link is skipped entirely when the
 * leg already has any "manual" link.
 */
export async function linkBetLegEvent(
  supabase: SupabaseClient,
  userId: string,
  betLegId: string,
  eventId: string,
  matchMethod: MatchMethod,
): Promise<BetLegEvent | null> {
  if (matchMethod === "auto") {
    const { data: manualLinks, error: manualError } = await supabase
      .from("bet_leg_events")
      .select("id")
      .eq("bet_leg_id", betLegId)
      .eq("match_method", "manual");
    if (manualError) throw manualError;
    if ((manualLinks ?? []).length > 0) return null;
  }

  const { data: existing, error: existingError } = await supabase
    .from("bet_leg_events")
    .select("*")
    .eq("bet_leg_id", betLegId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return toBetLegEvent(existing as BetLegEventRow);

  const { data, error } = await supabase
    .from("bet_leg_events")
    .insert({ user_id: userId, bet_leg_id: betLegId, event_id: eventId, match_method: matchMethod })
    .select("*")
    .single();
  if (error) throw error;
  return toBetLegEvent(data as BetLegEventRow);
}

export async function unlinkBetLegEvent(supabase: SupabaseClient, betLegEventId: string): Promise<void> {
  const { error } = await supabase.from("bet_leg_events").delete().eq("id", betLegEventId);
  if (error) throw error;
}

/** A leg is live when it's still open and any linked Event is in_progress (docs/PRD.md section 26.1). */
export function isLegLive(
  settlement: LegSettlement,
  linkedEventStatuses: Array<string | null | undefined>,
): boolean {
  if (settlement !== "open") return false;
  return linkedEventStatuses.some((status) => status === "in_progress");
}

/** The earliest-starting Event among those passed in (docs/PRD.md section 26.1: "Next Event"). */
export function nextEvent<T extends { startTimeUtc?: string | null }>(candidates: T[]): T | null {
  const withTimes = candidates.filter((c) => c.startTimeUtc);
  if (withTimes.length === 0) return null;
  return withTimes.reduce((earliest, candidate) =>
    candidate.startTimeUtc! < earliest.startTimeUtc! ? candidate : earliest,
  );
}
