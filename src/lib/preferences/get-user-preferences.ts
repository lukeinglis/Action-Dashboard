import type { SupabaseClient } from "@supabase/supabase-js";
import { toUserPreferences, type UserPreferencesRow } from "@/lib/db/rows";
import type { UserPreferences } from "@/lib/types/domain";

const DEFAULT_TIMEZONE = "America/New_York";
const DEFAULT_ROLLOVER_HOUR = 4;

/** Reads the signed-in user's preferences, creating the default row on first access. */
export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return toUserPreferences(data as UserPreferencesRow);

  const { data: created, error: insertError } = await supabase
    .from("user_preferences")
    .insert({
      user_id: userId,
      timezone: DEFAULT_TIMEZONE,
      rollover_hour: DEFAULT_ROLLOVER_HOUR,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return toUserPreferences(created as UserPreferencesRow);
}
