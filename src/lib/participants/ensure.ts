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
import { soleSport } from "@/lib/import/match-parsed-legs";
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
      // An unknown sport is stored rather than rejected, which is the opposite
      // of `ensureTeam` — the asymmetry is in the consequences, not the schema
      // (both columns are NOT NULL, so "" is the sentinel either way).
      //
      // Rejecting would throw, and the only two callers are mid-approval with
      // the Ticket and BetLeg already written (see the import action, which
      // swallows the analogous Event-resolution failure for exactly that
      // reason). `ensureTeam` can afford to throw because it is only ever
      // reached from a provider game that matched unambiguously, which always
      // carries a sport; extraction genuinely does fail to name one here.
      //
      // And the row it creates is inert rather than dangerous: player-stat
      // matching loads candidates with `.eq("sport", sport)` from the leg's own
      // sport, so a sportless Participant is never a candidate and the prop is
      // simply not graded. §26.1 prefers that to a confidently wrong grade.
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
  const named = rows.filter((r) => normalizeEventName(r.name) === norm);

  // An unknown sport matches on name alone, mirroring matchParsedLeg: refusing
  // to reuse a known player just because extraction dropped "football" would
  // create a duplicate of them. `soleSport` is that same matcher's guard, and
  // it is why name-alone is safe to do: when the name belongs to players in two
  // different sports there is no answer, only row order, and §20.2 reports an
  // ambiguous match rather than picking one. Identically-named athletes are
  // routine in college sports, and the cost of guessing is a prop graded
  // against a stranger's stat line (§26.1).
  //
  // The sportless rung is deliberately left unguarded: every row it can match
  // already has no sport, so they cannot span two of them and the guard would
  // be a no-op.
  const match =
    soleSport(named.filter((r) => !sport || r.sport === sport)) ??
    (sport ? named.find((r) => !r.sport) : undefined);

  return match ? toParticipant(match) : null;
}
