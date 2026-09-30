"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserPreferences } from "@/lib/preferences/get-user-preferences";
import { findDuplicateEvents } from "@/lib/events/duplicate-check";
import { createEventInputSchema, type CreateEventInput } from "@/lib/events/schema";
import { toEvent, type EventRow } from "@/lib/db/rows";
import type { Event } from "@/lib/types/domain";
import { mergeEventInto } from "@/lib/events/merge";
import {
  clearAllOverrides,
  returnFieldToAutomatic,
  setManualOverride,
  type EventOverridableFields,
} from "@/lib/events/overrides";

export type CreateEventResult =
  | { status: "duplicates"; duplicates: Event[] }
  | { status: "created"; event: Event }
  | { status: "error"; error: string };

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

/**
 * Creates a manual Event. Runs the duplicate check (docs/PRD.md section 20.2)
 * first; pass forceCreate to bypass it after the user confirms "Create Anyway."
 */
export async function createEvent(
  input: CreateEventInput,
  forceCreate = false,
): Promise<CreateEventResult> {
  const parsed = createEventInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const preferences = await getUserPreferences(supabase, userId);

  if (!forceCreate) {
    const duplicates = await findDuplicateEvents(supabase, data, preferences.timezone);
    if (duplicates.length > 0) {
      return { status: "duplicates", duplicates };
    }
  }

  const { data: created, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      sport: data.sport,
      league: data.league ?? null,
      name: data.name,
      start_time_utc: data.startTimeUtc ?? null,
      start_time_tbd: data.startTimeTbd,
      end_time_utc: data.endTimeUtc ?? null,
      home_team_id: data.homeTeamId ?? null,
      away_team_id: data.awayTeamId ?? null,
      source: "manual",
      notes: data.notes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return { status: "error", error: error.message };
  }

  revalidatePath("/events");
  return { status: "created", event: toEvent(created as EventRow) };
}

export async function mergeEvents(sourceEventId: string, targetEventId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await mergeEventInto(supabase, sourceEventId, targetEventId);
  revalidatePath("/events");
}

export async function setEventOverride(
  eventId: string,
  fields: EventOverridableFields,
): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await setManualOverride(supabase, eventId, fields);
  revalidatePath("/events");
}

export async function returnEventFieldToAutomatic(
  eventId: string,
  field: keyof EventOverridableFields,
): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await returnFieldToAutomatic(supabase, eventId, field);
  revalidatePath("/events");
}

export async function clearAllEventOverrides(eventId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await clearAllOverrides(supabase, eventId);
  revalidatePath("/events");
}
