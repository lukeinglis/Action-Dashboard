"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateFantasyLeague, type CreateFantasyLeagueInput } from "@/lib/fantasy/leagues";
import {
  createFantasyMatchup as createFantasyMatchupLib,
  markFantasyMatchupFinal as markFantasyMatchupFinalLib,
  type CreateFantasyMatchupInput,
} from "@/lib/fantasy/matchups";
import { createFantasyRosterSlot as createFantasyRosterSlotLib } from "@/lib/fantasy/roster-slots";
import type { FantasyMatchup } from "@/lib/types/domain";

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export interface ManualFantasyStarterInput {
  slot: string;
  playerName: string;
}

export interface CreateManualFantasyMatchupInput {
  league: CreateFantasyLeagueInput;
  matchup: Omit<CreateFantasyMatchupInput, "fantasyLeagueId">;
  starters: ManualFantasyStarterInput[];
  opponentStarters: ManualFantasyStarterInput[];
}

/**
 * Manual entry (docs/PRD.md section 43, "Entry methods: ... Manual"):
 * finds or creates the named FantasyLeague, then creates the FantasyMatchup
 * and its FantasyRosterSlots with just a player name on each side — no
 * Participant/Event matching, unlike the import pipeline.
 */
export async function createManualFantasyMatchup(input: CreateManualFantasyMatchupInput): Promise<FantasyMatchup> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  const league = await findOrCreateFantasyLeague(supabase, userId, input.league);
  const matchup = await createFantasyMatchupLib(supabase, userId, {
    ...input.matchup,
    fantasyLeagueId: league.id,
  });

  for (const starter of input.starters) {
    await createFantasyRosterSlotLib(supabase, userId, {
      fantasyMatchupId: matchup.id,
      side: "user",
      slot: starter.slot,
      playerName: starter.playerName,
    });
  }
  for (const starter of input.opponentStarters) {
    await createFantasyRosterSlotLib(supabase, userId, {
      fantasyMatchupId: matchup.id,
      side: "opponent",
      slot: starter.slot,
      playerName: starter.playerName,
    });
  }

  revalidatePath("/");
  return matchup;
}

/** Marks a FantasyMatchup final by hand; the status never changes automatically (docs/PRD.md section 8). */
export async function markFantasyMatchupFinal(matchupId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await markFantasyMatchupFinalLib(supabase, matchupId);
  revalidatePath("/");
}
