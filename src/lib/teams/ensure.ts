// Find-or-create for the Teams behind an imported leg's matchup.
// See docs/PRD.md §20.2 ("Matching") and §30 ("Event Matching").
//
// Why this exists: nothing in the app ever created a Team. The seed data
// carries all 32 NFL teams, and the only other way to get one is the manual
// `window.prompt` on /events/new — so a slip naming any team outside that seed
// (Auburn, Ohio State, Chelsea) resolved neither side, `resolveLegEventId`
// returned undefined, and the leg was saved pointing at no game at all.
//
// The matchup itself survives that: `bet_legs.raw_description` keeps the slip's
// verbatim block, `Event:` line included, and `repairLegs` parses it back. What
// cannot be recovered later is the *link*, because §20.2 permits Event creation
// only from an explicit user action — manual entry, import approval, pin search
// or participant lookup — and refresh "never creates new ones". So `repairLegs`
// can only ever rediscover games the user already has; a leg naming one nobody
// entered stays unlinked however often it runs, never grades, and the Ticket
// holding it never settles. Import approval is the sanctioned place to create
// that game, which is why this runs here.
//
// The safety rule, and the reason this is not simply "insert what the slip
// said": a Team is only ever created from a provider game that matched
// *unambiguously*, using the provider's own canonical name and abbreviation —
// never from the slip's raw text. Screenshot text is OCR'd and frequently
// truncated ("Miami FL"), and a misspelled Team row is permanent, invisible,
// and poisons `findTeam` for every future import. A provider game that cannot
// be pinned down leaves the leg unlinked, which is the pre-existing behaviour
// and still fixable by hand.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toTeam, type TeamRow } from "@/lib/db/rows";
import type { ProviderEvent } from "@/lib/providers/types";
import { findTeam, type TeamCandidate } from "@/lib/import/match-parsed-legs";
import { soleMatchingSide, type TeamSide } from "./match-side";

export interface EnsureTeamInput {
  sport: string;
  /** `teams.league` is NOT NULL; pass the canonical league from `sport-keys`. */
  league: string;
  name: string;
  abbreviation?: string | null;
}

/**
 * Returns the user's Team for `name`, creating it if absent.
 *
 * Matching deliberately reuses `findTeam`, the same comparison the import
 * matcher uses to propose a team. Anything looser here would create a second
 * "Auburn Tigers" on the next import that the matcher then can't choose
 * between — and `findTeam` has three rungs (exact, "ABBR Mascot", "City-
 * initials Mascot"), so a hand-rolled equality check here would miss rows the
 * matcher considers the same team.
 *
 * Queries the database rather than taking a candidate list, because the
 * candidates are snapshotted once per approval while a parlay repeats the same
 * game across legs: the second leg must see the Team the first one created.
 */
export async function ensureTeam(
  supabase: SupabaseClient,
  userId: string,
  input: EnsureTeamInput,
): Promise<TeamCandidate> {
  const name = input.name.trim();
  if (!name) throw new Error("ensureTeam: name is required");
  // A sport is not optional here the way it is for *matching*. `teams.sport` is
  // NOT NULL, so "" would be a junk row — and worse, it would make the lookup
  // below cross-sport, where "Auburn Tigers" is two different teams.
  if (!input.sport) throw new Error("ensureTeam: sport is required");
  if (!input.league) throw new Error("ensureTeam: league is required");

  const existing = await findExisting(supabase, userId, name, input.sport);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("teams")
    .insert({
      user_id: userId,
      sport: input.sport,
      league: input.league,
      name,
      abbreviation: input.abbreviation ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // `teams` has no unique constraint, so this is a genuine failure rather
    // than a race — but re-check anyway, so a duplicate created by a
    // concurrent approval is reused instead of failing the whole import.
    const raced = await findExisting(supabase, userId, name, input.sport);
    if (raced) return raced;
    throw error;
  }

  return toTeam(data as TeamRow);
}

async function findExisting(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  sport: string,
): Promise<TeamCandidate | undefined> {
  const { data, error } = await supabase.from("teams").select("*").eq("user_id", userId);
  if (error) throw error;

  const candidates = (data ?? []).map((row) => toTeam(row as TeamRow));
  return findTeam(name, sport, candidates);
}

export interface EnsureMatchupTeamsInput {
  sport: string;
  league: string;
  /** As printed on the slip, not yet reconciled to anything. */
  awayTeamName: string;
  homeTeamName: string;
}

export interface EnsureMatchupTeamsDeps {
  /** Snapshotted once per approval, so only used for the read-side match. */
  teams: TeamCandidate[];
  /** The provider's schedule for this sport; `[]` when the provider is down. */
  schedule: ProviderEvent[];
}

/**
 * Both sides of a matchup as Teams, creating whichever the user doesn't have
 * yet, or undefined when the matchup can't be pinned to exactly one scheduled
 * game.
 *
 * Undefined is the honest answer rather than a partial result: a leg linked to
 * the wrong game grades to a confidently wrong result, which is worse than an
 * unlinked leg the user can still fix (§20.2 reports ambiguity instead of
 * picking one).
 *
 * Note the printed name is reconciled *only* through the provider, never
 * directly against the user's Teams: `findTeam` has no prefix rung, so the
 * slip's "Auburn" does not match an existing "Auburn Tigers" row. That is
 * deliberate — prefix-matching inside `findTeam` would also apply to
 * selections, where it decides which side a bet is *on*, and "Miami" there is a
 * coin flip between two programs. Re-importing the same slip therefore comes
 * back through here, looks the provider's canonical name up, and finds the row
 * it made last time, so no duplicate appears.
 */
export async function ensureMatchupTeams(
  supabase: SupabaseClient,
  userId: string,
  input: EnsureMatchupTeamsInput,
  deps: EnsureMatchupTeamsDeps,
): Promise<{ awayTeam: TeamCandidate; homeTeam: TeamCandidate } | undefined> {
  const matchedAway = findTeam(input.awayTeamName, input.sport, deps.teams);
  const matchedHome = findTeam(input.homeTeamName, input.sport, deps.teams);
  if (matchedAway && matchedHome) return { awayTeam: matchedAway, homeTeam: matchedHome };

  // Even when only one side is missing, the provider game is what supplies its
  // canonical spelling — so there is nothing to do without one.
  const assigned = deps.schedule
    .map((game) => assignSides(game, input.awayTeamName, input.homeTeamName))
    .filter((sides): sides is AssignedSides => sides !== undefined);

  // Exactly one. Zero means the slip names a game the provider isn't carrying
  // (or spells a side in a way we refuse to guess at); more than one means two
  // scheduled games fit the same pair of printed names.
  //
  // This guard carries most of the weight in college sports, where short names
  // are not unique: across ESPN's 762 college football teams only 93% of
  // program names ("Arkansas", "Miami") match exactly one team roster-wide, and
  // college basketball adds another 362. What makes the pair safe anyway is
  // that both printed names must land in the *same* scheduled game: "Arkansas"
  // alone is ambiguous with Arkansas State, but only one of them is playing the
  // printed opponent on the day.
  if (assigned.length !== 1) return undefined;
  const { away, home } = assigned[0];

  const awayTeam =
    matchedAway ??
    (await ensureTeam(supabase, userId, {
      sport: input.sport,
      league: input.league,
      name: away.name,
      abbreviation: away.abbreviation,
    }));
  const homeTeam =
    matchedHome ??
    (await ensureTeam(supabase, userId, {
      sport: input.sport,
      league: input.league,
      name: home.name,
      abbreviation: home.abbreviation,
    }));

  return { awayTeam, homeTeam };
}

interface AssignedSides {
  away: TeamSide;
  home: TeamSide;
}

/**
 * Which side of a scheduled game each printed name refers to, or undefined if
 * that can't be decided.
 *
 * Order-independent, because a slip's "@" is not always the provider's — the
 * two printed names are only required to land on two *different* sides.
 */
function assignSides(
  game: ProviderEvent,
  awayTeamName: string,
  homeTeamName: string,
): AssignedSides | undefined {
  // A side with no name is useless here: the name is what a Team gets created
  // from, so a game that only gave us abbreviations can't seed one.
  if (!game.awayTeamName || !game.homeTeamName) return undefined;
  const sides: TeamSide[] = [
    { name: game.awayTeamName, abbreviation: game.awayTeamAbbreviation },
    { name: game.homeTeamName, abbreviation: game.homeTeamAbbreviation },
  ];

  const away = soleMatchingSide(awayTeamName, sides);
  const home = soleMatchingSide(homeTeamName, sides);
  if (!away || !home) return undefined;
  // Both names landing on the same side means one of them is a run of the other
  // ("Miami" and "Miami FL"), which decides nothing.
  if (away === home) return undefined;

  return { away, home };
}
