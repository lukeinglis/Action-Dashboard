"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createDfsLineup as createDfsLineupLib, type CreateDfsLineupInput } from "@/lib/dfs/lineups";
import { createDfsLineupSlot as createDfsLineupSlotLib } from "@/lib/dfs/lineup-slots";
import {
  createDfsEntry as createDfsEntryLib,
  markDfsEntryFinal as markDfsEntryFinalLib,
  type CreateDfsEntryInput,
} from "@/lib/dfs/entries";
import type { DFSEntry } from "@/lib/types/domain";

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export interface ManualDfsSlotInput {
  slot: string;
  playerName: string;
  salary?: number;
}

export interface CreateManualDfsLineupInput {
  lineup: CreateDfsLineupInput;
  slots: ManualDfsSlotInput[];
  entry: Omit<CreateDfsEntryInput, "dfsLineupId">;
}

/**
 * Manual entry (docs/PRD.md section 43, "Entry methods: ... Manual"):
 * creates the DFSLineup, its DFSLineupSlots with just a player name each —
 * no Participant/Event matching, unlike the import pipeline — and one
 * DFSEntry for the contest.
 */
export async function createManualDfsLineup(input: CreateManualDfsLineupInput): Promise<DFSEntry> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  const lineup = await createDfsLineupLib(supabase, userId, input.lineup);

  for (const slot of input.slots) {
    await createDfsLineupSlotLib(supabase, userId, {
      dfsLineupId: lineup.id,
      slot: slot.slot,
      playerName: slot.playerName,
      salary: slot.salary,
    });
  }

  const entry = await createDfsEntryLib(supabase, userId, { ...input.entry, dfsLineupId: lineup.id });

  revalidatePath("/");
  return entry;
}

/** Marks a DFSEntry final by hand; the status never changes automatically (docs/PRD.md section 8). */
export async function markDfsEntryFinal(entryId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await markDfsEntryFinalLib(supabase, entryId);
  revalidatePath("/");
}
