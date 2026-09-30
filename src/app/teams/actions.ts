"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toTeam, type TeamRow } from "@/lib/db/rows";
import type { Team } from "@/lib/types/domain";
import { deleteTeam as deleteTeamLib } from "@/lib/teams/delete";
import { mergeTeamInto } from "@/lib/teams/merge";

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function createTeam(input: {
  sport: string;
  league: string;
  name: string;
  abbreviation?: string;
}): Promise<Team> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("teams")
    .insert({
      user_id: userId,
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

/** Hard-deletes a Team. Throws TeamLinkedError if anything still links to it. */
export async function deleteTeam(teamId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await deleteTeamLib(supabase, teamId);
  revalidatePath("/teams");
}

export async function mergeTeams(sourceTeamId: string, targetTeamId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await mergeTeamInto(supabase, sourceTeamId, targetTeamId);
  revalidatePath("/teams");
}
