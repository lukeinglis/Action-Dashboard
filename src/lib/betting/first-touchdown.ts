// Turning a game's scoring order into a stat a prop can be graded against.
// See docs/PRD.md §26.1.
//
// "Derrick Henry First TD" cannot be settled from a stat line. The weekly line
// says Henry scored one touchdown; it does not say whether anyone scored
// before him. Only the ordered scoring feed knows, so this file reduces that
// feed to a single number — `firstTd`, 1 or 0 — which drops straight into the
// same per-participant stats map every other prop is graded from.
//
// That is the whole trick: no new grading path, no new leg state, no second
// notion of what a prop is. `prop-stats.ts` maps `first_touchdown` to the
// `firstTd` key and the existing evaluation settles it.
//
// The matching is deliberately stricter than the general player ladder of
// §20.2. That ladder picks the one plausible player out of a whole week's
// stats, and its loosest rung — surname alone — is safe there because a
// surname shared by two players shows up as several candidates. Here there is
// only ever one name to compare against, so "Hunter Henry" would sail through
// a surname rung and be credited with Derrick Henry's touchdown. A leg can
// therefore come back undecided, and an undecided leg stays open.

import { parseName } from "@/lib/providers/match-player-stats";
import type { ParticipantCandidate } from "@/lib/providers/match-player-stats";
import type { ProviderScoringPlay } from "@/lib/providers/types";

/**
 * `firstTd` for each participant with a first-scorer leg on this game.
 *
 * Empty until the game's first touchdown is actually on the feed. Returning
 * zeroes before then would show every such leg as losing from kickoff, and —
 * worse — a provider that answered with an empty feed mid-game would settle
 * them all as losses.
 *
 * Once there *is* a first touchdown, everyone the feed can rule out gets a 0,
 * because the market is then decided for them: no later touchdown can be the
 * first one. A participant the feed can neither confirm nor rule out is left
 * out of the result entirely, so their leg stays open for the user to settle.
 */
export function firstTouchdownStats(
  plays: ProviderScoringPlay[],
  participants: ParticipantCandidate[],
): Map<string, Record<string, number>> {
  const first = plays.find((play) => play.kind === "touchdown");
  if (!first?.scorerName) return new Map();

  const stats = new Map<string, Record<string, number>>();

  for (const participant of participants) {
    const verdict = compareToScorer(participant, first);
    if (verdict === "unsure") continue;
    stats.set(participant.id, { firstTd: verdict === "scored" ? 1 : 0 });
  }

  return stats;
}

type Verdict = "scored" | "did_not" | "unsure";

/**
 * Whether this participant is the player named on the scoring play.
 *
 * Surnames do the ruling out; a first initial or the team does the confirming.
 * "D. Henry" off a slip and "Derrick Henry" off the feed are the same man, but
 * "Hunter Henry" is not, and a bare "Henry" with no team to check is nobody in
 * particular — which is why that case is undecided rather than a loss.
 */
function compareToScorer(participant: ParticipantCandidate, play: ProviderScoringPlay): Verdict {
  const bet = parseName(participant.name);
  const scorer = parseName(play.scorerName!);

  if (!bet.surname || !scorer.surname) return "unsure";
  if (bet.surname !== scorer.surname) return "did_not";

  if (bet.firstInitial && scorer.firstInitial) {
    return bet.firstInitial === scorer.firstInitial ? "scored" : "did_not";
  }

  const betTeam = participant.teamAbbreviation?.toUpperCase();
  const scorerTeam = play.teamAbbreviation?.toUpperCase();
  if (betTeam && scorerTeam) return betTeam === scorerTeam ? "scored" : "did_not";

  return "unsure";
}
