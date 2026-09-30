"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toParticipant, type ParticipantRow } from "@/lib/db/rows";
import type { Participant, ParticipantType } from "@/lib/types/domain";
import { deleteParticipant as deleteParticipantLib } from "@/lib/participants/delete";
import { mergeParticipantInto } from "@/lib/participants/merge";

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function createParticipant(input: {
  type: ParticipantType;
  sport: string;
  league?: string;
  name: string;
  teamId?: string;
}): Promise<Participant> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("participants")
    .insert({
      user_id: userId,
      type: input.type,
      sport: input.sport,
      league: input.league ?? null,
      name: input.name,
      team_id: input.teamId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toParticipant(data as ParticipantRow);
}

/** Hard-deletes a Participant. Throws ParticipantLinkedError if anything still links to it. */
export async function deleteParticipant(participantId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await deleteParticipantLib(supabase, participantId);
  revalidatePath("/participants");
}

export async function mergeParticipants(
  sourceParticipantId: string,
  targetParticipantId: string,
): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await mergeParticipantInto(supabase, sourceParticipantId, targetParticipantId);
  revalidatePath("/participants");
}
