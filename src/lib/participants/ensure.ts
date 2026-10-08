// Find-or-create for the Participant behind an imported player prop.
// See docs/PRD.md §30 ("Participant Matching").
//
// Why this exists: nothing in the app ever created a Participant. The
// participants page has actions but no screen, and the import review screen
// dropped any subject it could not match — so "CeeDee Lamb Over 99.5" imported
// with no subject at all, losing both the player and the Over/Under direction
// the subject carries (§26.2). With no Participant there is also nothing for a
// stats provider to map to, so no player prop could ever be graded.
//
// Only the player-prop path calls this, where the subject cannot be anything
// but a player (`allowsTeamSubject` is already false for that category). An
// unmatched name on any other market stays unmatched for the user to resolve,
// because there it might be a team we don't carry.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEventName } from "@/lib/events/match-key";
import { toParticipant, type ParticipantRow } from "@/lib/db/rows";
import type { Participant } from "@/lib/types/domain";

export interface EnsureParticipantInput {
  name: string;
  /** May be "" when extraction could not determine the sport. */
  sport: string;
  league?: string;
}

/**
 * Returns the user's Participant for `name`, creating it if absent.
 *
 * Matching deliberately reuses `normalizeEventName`, the same comparison
 * `matchParsedLeg` uses to propose a participant. Anything looser here would
 * create a second "CeeDee Lamb" on the next import that the matcher then
 * can't choose between.
 *
 * `team_id` is left null on creation. We know the game but not which side the
 * player is on, and a guessed team is worse than none: the stats matcher
 * narrows ambiguous surnames *by team*, so a wrong team would actively break
 * the match it is meant to help.
 */
export async function ensureParticipant(
  supabase: SupabaseClient,
  userId: string,
  input: EnsureParticipantInput,
): Promise<Participant> {
  const name = input.name.trim();
  if (!name) throw new Error("ensureParticipant: name is required");

  const existing = await findByName(supabase, userId, name, input.sport);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("participants")
    .insert({
      user_id: userId,
      // Every market this is reached from is a player prop. "other" would be
      // the honest answer for an unknown sport, but it reads as a data problem
      // in the participants list rather than as a footballer.
      type: "player",
      sport: input.sport || "",
      league: input.league ?? null,
      name,
      team_id: null,
    })
    .select("*")
    .single();

  if (error) {
    // A concurrent import of the same slip could have inserted it between the
    // lookup and here; prefer the row that won over failing the whole approval.
    const raced = await findByName(supabase, userId, name, input.sport);
    if (raced) return raced;
    throw error;
  }
  return toParticipant(data as ParticipantRow);
}

async function findByName(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  sport: string,
): Promise<Participant | null> {
  const { data, error } = await supabase.from("participants").select("*").eq("user_id", userId);
  if (error) throw error;

  const norm = normalizeEventName(name);
  const rows = (data ?? []) as ParticipantRow[];
  // An unknown sport matches on name alone, mirroring matchParsedLeg: refusing
  // to reuse a known player just because extraction dropped "football" would
  // create a duplicate of them.
  const match =
    rows.find((r) => (!sport || r.sport === sport) && normalizeEventName(r.name) === norm) ??
    (sport ? rows.find((r) => !r.sport && normalizeEventName(r.name) === norm) : undefined);

  return match ? toParticipant(match) : null;
}
