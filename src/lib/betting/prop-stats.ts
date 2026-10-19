// Which stat a player prop is actually about. See docs/PRD.md §26.1 and §30.
//
// A prop leg says "Egbuka Over 65.5 Receiving Yards". To know whether it is
// winning, three things have to line up: the player (a participant mapping),
// the threshold (the leg's line), and *which number* off that player's stat line
// to compare against. This file is the third one.
//
// The stat keys are the normalized ones every provider emits — `recYards`, not
// Sleeper's `rec_yd` — so a prop can be read without knowing which adapter
// answered. The Sleeper adapter already maps into this vocabulary.
//
// Most of these keys come off a weekly stat line. One does not: `firstTd` is
// derived from the ordered scoring feed instead (see `first-touchdown.ts`),
// because a total cannot say whether a player's touchdown was the game's
// first. It is listed here anyway so the market grades through the one prop
// path rather than a parallel one of its own.
//
// Still deliberately absent:
//
//   MLB props         no stats provider is wired up for baseball yet, and
//                     Sleeper is NFL-only.
//
// Those resolve to null, which keeps the leg silent rather than guessing.

/** Normalized stat keys that add up to one prop's current value. */
interface PropStat {
  /** Summed, so "combined yards" is rush + receiving without a special case. */
  keys: string[];
  /** Shown beside the number, e.g. "41 rec yds of 65.5". */
  unit: string;
  /**
   * The threshold when the market implies one rather than printing it. An
   * "anytime touchdown" is really "over 0.5 touchdowns" and books show no line
   * for it at all.
   */
  impliedLine?: number;
  /**
   * Whether a missing stat key means "not reported" instead of zero.
   *
   * Zero is the right answer for a receiver with no catches yet, but not for
   * scoring order: `firstTd` is absent from every weekly stat line, and
   * reading that absence as "did not score first" would settle every
   * first-scorer leg as a loss the moment a stat line arrived without it.
   */
  absentIsUnknown?: boolean;
}

const PROP_STATS: Record<string, PropStat> = {
  passing_yards: { keys: ["passYards"], unit: "pass yds" },
  passing_touchdowns: { keys: ["passTd"], unit: "pass TD" },
  rushing_yards: { keys: ["rushYards"], unit: "rush yds" },
  receiving_yards: { keys: ["recYards"], unit: "rec yds" },
  receptions: { keys: ["receptions"], unit: "rec" },
  combined_yards: { keys: ["rushYards", "recYards"], unit: "yds" },

  // Touchdowns a player *scored*, so passing TDs are excluded: a quarterback
  // throwing three is not an anytime-touchdown scorer.
  player_touchdowns: { keys: ["rushTd", "recTd"], unit: "TD" },
  anytime_touchdown: { keys: ["rushTd", "recTd"], unit: "TD", impliedLine: 0.5 },

  // Not a count but a verdict: 1 if this player scored the game's first
  // touchdown, 0 once someone else has. Absent until the feed reports a
  // touchdown at all.
  first_touchdown: {
    keys: ["firstTd"],
    unit: "first TD",
    impliedLine: 0.5,
    absentIsUnknown: true,
  },
};

/** True when a stats provider can answer this market at all. */
export function isSupportedProp(marketType: string): boolean {
  return marketType in PROP_STATS;
}

/**
 * Every market a stat line can answer, so the database can ask for just the
 * legs worth fetching player stats for instead of filtering in memory.
 */
export function supportedPropMarkets(): string[] {
  return Object.keys(PROP_STATS);
}

/**
 * The player's current value for this market, or null when the market is not
 * one a stat line can answer.
 *
 * A counting market with no matching stat key returns 0 rather than null: a
 * receiver with no catches yet has zero receiving yards, which is a real
 * answer and not missing data. The caller gates on whether the game has
 * started, so a pre-kickoff zero is never shown.
 *
 * A market marked `absentIsUnknown` is the exception, and returns null — the
 * absence of `firstTd` means the scoring feed has not been consulted, not that
 * the player failed to score first.
 */
export function propCurrentValue(
  marketType: string,
  stats: Record<string, number>,
): number | null {
  const prop = PROP_STATS[marketType];
  if (!prop) return null;
  if (prop.absentIsUnknown && !prop.keys.some((key) => key in stats)) return null;
  return prop.keys.reduce((total, key) => total + (stats[key] ?? 0), 0);
}

/** The threshold to compare against: the leg's own line, or the market's implied one. */
export function propLine(marketType: string, line: number | null | undefined): number | null {
  const prop = PROP_STATS[marketType];
  if (!prop) return null;
  return line ?? prop.impliedLine ?? null;
}

export function propUnit(marketType: string): string | null {
  return PROP_STATS[marketType]?.unit ?? null;
}
