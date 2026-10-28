// Reconciles a name as a book printed it against a small, closed set of teams.
// See docs/PRD.md §20.2 ("Matching") and §30 ("Event Matching").
//
// This is deliberately *not* `findTeam`. That one searches the user's whole
// roster and is exact on purpose: a looser rule there decides which side a bet
// is on out of hundreds of candidates, and "Miami" is a coin flip between two
// programs. The rule here is looser precisely because the candidate set is not
// the roster — it is the two sides of one game, already pinned down by
// something else. Telling "Auburn" apart from "Georgia Bulldogs" is a decision
// between two options; telling it apart from 762 college programs is not.
//
// So the two live side by side: `findTeam` for an open search, this for a
// two-horse race.

import { normalizeEventName } from "@/lib/events/match-key";

/** Anything with a canonical name, and optionally the provider's short form. */
export interface TeamSide {
  name: string;
  abbreviation?: string | null;
}

/**
 * The sole side `printed` denotes, or undefined when none does or more than
 * one does.
 *
 * Ambiguity returns undefined rather than the first hit: §20.2 reports an
 * ambiguous match instead of picking one, and both callers would rather leave a
 * leg for the user than point it at the wrong team. Two sides both matching
 * means one printed name is a run of the other ("Miami" against "Miami FL"),
 * which decides nothing.
 */
export function soleMatchingSide<T extends TeamSide>(printed: string, sides: T[]): T | undefined {
  const hits = sides.filter((side) => sideMatches(printed, side));
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * Whether a printed name denotes this side.
 *
 * Books print the program ("Auburn") where the provider prints the full team
 * ("Auburn Tigers"), and sometimes the reverse ("Bournemouth" vs "AFC
 * Bournemouth") — so the printed words are allowed to be a leading or trailing
 * run of the side's words.
 *
 * Contiguous, anchored to one end, and whole words, on purpose. A plain
 * word-subset rule would let a bare "State" match both "Florida State
 * Seminoles" and "Ohio State Buckeyes"; a prefix rule is worse still, because
 * the "FL" in "Miami FL" prefixes "Florida" and Florida State's schedule
 * contains both Miami and the Florida Gators. Neither loosening is tried.
 *
 * On top of the run there is one narrow allowance for a state-qualified program
 * name — see `withoutStateQualifier`.
 */
function sideMatches(printed: string, side: TeamSide): boolean {
  const wanted = normalizeEventName(printed);
  if (!wanted) return false;

  if (side.abbreviation && normalizeEventName(side.abbreviation) === wanted) return true;

  const words = normalizeEventName(side.name).split(" ").filter(Boolean);
  const wantedWords = wanted.split(" ").filter(Boolean);

  const isRun = (needle: string[], offset: number) =>
    needle.every((word, index) => words[offset + index] === word);
  const matchesRun = (needle: string[]) =>
    needle.length > 0 &&
    needle.length <= words.length &&
    (isRun(needle, 0) || isRun(needle, words.length - needle.length));

  if (matchesRun(wantedWords)) return true;

  const unqualified = withoutStateQualifier(wantedWords, words);
  return unqualified !== undefined && matchesRun(unqualified);
}

/**
 * Every USPS state code, plus DC — the vocabulary both sides use to tell
 * same-named programs apart.
 *
 * Measured against ESPN's own rosters (762 college football teams, 362 men's
 * basketball), every one of the 46 qualified names has the identical shape
 * `<program> (<ST>) <mascot>`: "Miami (OH) RedHawks", "Wayne State (MI)
 * Warriors", "California (PA) Vulcans". Books print the same code, without the
 * parentheses, as a trailing word: "Miami FL".
 *
 * All 51 codes rather than the 23 ESPN actually uses, because the case that
 * matters is one it *doesn't*: ESPN qualifies only the minority program, so
 * Miami (FL) is plain "Miami Hurricanes" and FL never appears as an ESPN
 * qualifier at all — yet "Miami FL" is exactly what the slip prints.
 */
const STATE_CODES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "dc", "de", "fl", "ga", "hi", "ia",
  "id", "il", "in", "ks", "ky", "la", "ma", "md", "me", "mi", "mn", "mo", "ms",
  "mt", "nc", "nd", "ne", "nh", "nj", "nm", "nv", "ny", "oh", "ok", "or", "pa",
  "ri", "sc", "sd", "tn", "tx", "ut", "va", "vt", "wa", "wi", "wv", "wy",
]);

/**
 * The printed words with a trailing state qualifier removed, or undefined when
 * there isn't one to remove or removing it would be a guess.
 *
 * This is what links "Miami FL" to "Miami Hurricanes": the two share no run in
 * either direction, because the slip ends with the state and the provider ends
 * with the mascot.
 *
 * The qualifier is dropped only when the side's own name does not carry a
 * *different* one. That is the whole safety property, and it is precisely the
 * Miami case: "Miami FL" against "Miami (OH) RedHawks" is refused on the
 * conflict between FL and OH, not on the name, so widening the run cannot put
 * a leg on the wrong Miami.
 *
 * The converse — "Miami OH" against the unqualified "Miami Hurricanes" — is
 * still allowed, since ESPN gives no state to contradict it. That looseness is
 * real but contained by the caller: both callers require the name to pick out
 * exactly one side of a single game, and Miami (OH) and Miami (FL) do not share
 * an opponent on a given day. It is also the safer direction to err in, since a
 * leg that refuses to match is fixable by hand.
 */
function withoutStateQualifier(wantedWords: string[], sideWords: string[]): string[] | undefined {
  const printedState = wantedWords[wantedWords.length - 1];
  if (wantedWords.length < 2 || !STATE_CODES.has(printedState)) return undefined;

  // Index 0 is the program itself and never the qualifier — "La Salle
  // Explorers" opens with Louisiana's code without being qualified by it.
  const sideState = sideWords.slice(1).find((word) => STATE_CODES.has(word));
  if (sideState && sideState !== printedState) return undefined;

  return wantedWords.slice(0, -1);
}
