import type { SupabaseClient } from "@supabase/supabase-js";
import type { Event, EventStatus } from "@/lib/types/domain";

// Manual override rules. See docs/PRD.md section 45.
//
//   displayedValue = manualValue ?? automaticValue ?? null
//
// Overrides are timestamped per record (manualSetAt), not per field. An
// override is stale when automaticChangedAt > manualSetAt.

export interface EventOverridableFields {
  status?: EventStatus | null;
  homeScore?: number | null;
  awayScore?: number | null;
  period?: string | null;
  clock?: string | null;
}

const OVERRIDABLE_FIELD_TO_MANUAL_COLUMN: Record<keyof EventOverridableFields, string> = {
  status: "manual_status",
  homeScore: "manual_home_score",
  awayScore: "manual_away_score",
  period: "manual_period",
  clock: "manual_clock",
};

export function displayedStatus(event: Event): EventStatus | null {
  return event.manualStatus ?? event.automaticStatus ?? null;
}

export function displayedHomeScore(event: Event): number | null {
  return event.manualHomeScore ?? event.automaticHomeScore ?? null;
}

export function displayedAwayScore(event: Event): number | null {
  return event.manualAwayScore ?? event.automaticAwayScore ?? null;
}

export function displayedPeriod(event: Event): string | null {
  return event.manualPeriod ?? event.automaticPeriod ?? null;
}

export function displayedClock(event: Event): string | null {
  return event.manualClock ?? event.automaticClock ?? null;
}

export function hasManualOverride(event: Event): boolean {
  return (
    event.manualStatus != null ||
    event.manualHomeScore != null ||
    event.manualAwayScore != null ||
    event.manualPeriod != null ||
    event.manualClock != null
  );
}

/** An override is stale when a newer automatic value has arrived since it was set. */
export function isOverrideStale(event: Event): boolean {
  if (!event.manualSetAt || !hasManualOverride(event)) return false;
  if (!event.automaticChangedAt) return false;
  return new Date(event.automaticChangedAt) > new Date(event.manualSetAt);
}

/** Sets one or more manual fields on an Event and stamps manualSetAt. */
export async function setManualOverride(
  supabase: SupabaseClient,
  eventId: string,
  fields: EventOverridableFields,
): Promise<void> {
  const update: Record<string, unknown> = { manual_set_at: new Date().toISOString() };

  for (const [field, value] of Object.entries(fields) as [keyof EventOverridableFields, unknown][]) {
    if (value === undefined) continue;
    update[OVERRIDABLE_FIELD_TO_MANUAL_COLUMN[field]] = value;
  }

  const { error } = await supabase.from("events").update(update).eq("id", eventId);
  if (error) throw error;
}

/**
 * Clears one manual field ("Return to Automatic"). If no manual fields
 * remain set afterward, manualSetAt is cleared too, since it timestamps the
 * record's override as a whole, not any single field.
 */
export async function returnFieldToAutomatic(
  supabase: SupabaseClient,
  eventId: string,
  field: keyof EventOverridableFields,
): Promise<void> {
  const column = OVERRIDABLE_FIELD_TO_MANUAL_COLUMN[field];

  const { data: current, error: readError } = await supabase
    .from("events")
    .select(
      "manual_status, manual_home_score, manual_away_score, manual_period, manual_clock",
    )
    .eq("id", eventId)
    .single();
  if (readError) throw readError;

  const remaining = { ...current, [column]: null };
  const stillOverridden = Object.values(remaining).some((v) => v != null);

  const { error: updateError } = await supabase
    .from("events")
    .update({ [column]: null, manual_set_at: stillOverridden ? undefined : null })
    .eq("id", eventId);
  if (updateError) throw updateError;
}

/** Clears every manual field on an Event ("Clear All Overrides"). */
export async function clearAllOverrides(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase
    .from("events")
    .update({
      manual_status: null,
      manual_home_score: null,
      manual_away_score: null,
      manual_period: null,
      manual_clock: null,
      manual_set_at: null,
    })
    .eq("id", eventId);
  if (error) throw error;
}

/**
 * Writes refreshed automatic values. Only updates automaticChangedAt when a
 * value actually differs from what's stored (docs/PRD.md section 20). Never
 * touches manual fields.
 */
export async function applyAutomaticUpdate(
  supabase: SupabaseClient,
  eventId: string,
  fields: {
    status?: EventStatus | null;
    homeScore?: number | null;
    awayScore?: number | null;
    period?: string | null;
    clock?: string | null;
  },
): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from("events")
    .select("automatic_status, automatic_home_score, automatic_away_score, automatic_period, automatic_clock")
    .eq("id", eventId)
    .single();
  if (readError) throw readError;

  const next = {
    automatic_status: fields.status ?? current.automatic_status,
    automatic_home_score: fields.homeScore ?? current.automatic_home_score,
    automatic_away_score: fields.awayScore ?? current.automatic_away_score,
    automatic_period: fields.period ?? current.automatic_period,
    automatic_clock: fields.clock ?? current.automatic_clock,
  };

  const changed = (Object.keys(next) as (keyof typeof next)[]).some(
    (key) => next[key] !== current[key],
  );

  const { error: updateError } = await supabase
    .from("events")
    .update({
      ...next,
      ...(changed ? { automatic_changed_at: new Date().toISOString() } : {}),
    })
    .eq("id", eventId);
  if (updateError) throw updateError;
}
