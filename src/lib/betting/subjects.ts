import type { RootingDirection } from "@/lib/types/domain";

// Default subject/direction rules by market type. See docs/PRD.md section 26.2.
//
//   moneyline, spread                     -> selected team for, opponent against
//   game_total                            -> both teams for on Over, against on Under
//   team_total                            -> team for on Over, against on Under
//   player props (yards, TDs, ATTS, etc.) -> player for on Over/Yes, against on Under/No
//   winner, top_finish, season_future     -> selection for
//   matchup                               -> selection for, opponent against
//   custom                                -> subjects neutral until set

export type MarketCategory =
  | "team_vs_opponent"
  | "game_total"
  | "team_total"
  | "player_over_under"
  | "selection_only"
  | "matchup"
  | "neutral";

export type SubjectRole = "primary" | "opponent";

export type OverUnderYesNo = "over" | "under" | "yes" | "no";

const MARKET_CATEGORY: Record<string, MarketCategory> = {
  moneyline: "team_vs_opponent",
  spread: "team_vs_opponent",

  game_total: "game_total",
  team_total: "team_total",

  anytime_touchdown: "player_over_under",
  first_touchdown: "player_over_under",
  player_touchdowns: "player_over_under",
  passing_yards: "player_over_under",
  passing_touchdowns: "player_over_under",
  rushing_yards: "player_over_under",
  receiving_yards: "player_over_under",
  receptions: "player_over_under",
  combined_yards: "player_over_under",
  hits: "player_over_under",
  runs: "player_over_under",
  rbis: "player_over_under",
  hits_runs_rbis: "player_over_under",
  home_runs: "player_over_under",
  strikeouts: "player_over_under",

  winner: "selection_only",
  top_finish: "selection_only",
  season_future: "selection_only",

  matchup: "matchup",
};

/** Unknown/unlisted market types (including "custom") default to neutral — they must never block entry. */
export function marketCategory(marketType: string): MarketCategory {
  return MARKET_CATEGORY[marketType] ?? "neutral";
}

/** Player props never propose a team-level subject; every other category allows either kind. */
export function allowsTeamSubject(marketType: string): boolean {
  return marketCategory(marketType) !== "player_over_under";
}

export function defaultSubjectDirection(
  marketType: string,
  role: SubjectRole,
  overUnder?: OverUnderYesNo,
): RootingDirection {
  switch (marketCategory(marketType)) {
    case "team_vs_opponent":
    case "matchup":
      return role === "primary" ? "for" : "against";
    case "game_total":
    case "team_total":
    case "player_over_under":
      if (!overUnder) return "neutral";
      return overUnder === "over" || overUnder === "yes" ? "for" : "against";
    case "selection_only":
      return role === "primary" ? "for" : "neutral";
    case "neutral":
    default:
      return "neutral";
  }
}

/**
 * A manually-edited direction survives re-matching or re-parsing (docs/PRD.md
 * section 26.2): only an "auto" existing direction may be replaced by a fresh
 * proposal.
 */
export function resolveSubjectDirection(
  existing: { direction: RootingDirection; directionSource: "auto" | "manual" } | undefined,
  proposedDirection: RootingDirection,
): { direction: RootingDirection; directionSource: "auto" | "manual" } {
  if (existing?.directionSource === "manual") return existing;
  return { direction: proposedDirection, directionSource: "auto" };
}
