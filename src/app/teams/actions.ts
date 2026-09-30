"use server";

import { createClient } from "@/lib/supabase/server";
import { toTeam, type TeamRow } from "@/lib/db/rows";
import type { Team } from "@/lib/types/domain";

export async function createTeam(input: {
  sport: string;
  league: string;
  name: string;
  abbreviation?: string;
}): Promise<Team> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("teams")
    .insert({
      user_id: user.id,
      sport: input.sport,
      league: input.league,
      name: input.name,
      abbreviation: input.abbreviation ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toTeam(data as TeamRow);
}
