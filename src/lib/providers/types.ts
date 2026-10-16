// Shared sports-data provider interface. See docs/PRD.md section 50.
// Real adapters (Phase 6+) implement this against a live API. The app must
// run with zero adapters configured, so ManualSportsProvider (below) is
// always available as a no-op implementation.

export interface ProviderEvent {
  providerEventId: string;
  sport: string;
  league?: string;
  name: string;
  startTimeUtc?: string;
  startTimeTbd?: boolean;
  endTimeUtc?: string;
  homeTeamProviderId?: string;
  awayTeamProviderId?: string;
  /** Bootstrap a team mapping on the first refresh, before one exists (§20.2). */
  homeTeamAbbreviation?: string;
  awayTeamAbbreviation?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  status?: string;
  homeScore?: number;
  awayScore?: number;
  period?: string;
  clock?: string;
  /**
   * Which slate this game belongs to, when the provider says so.
   *
   * Needed because a player's stat line is published per week, not per game: to
   * settle a prop on a game from ten days ago, the stats provider has to be
   * asked for *that* game's week. Asking for the current week instead returns
   * another slate's numbers, or — before the next kickoff — none at all, which
   * leaves every prop on a past game silent forever (§26.1).
   *
   * Carried on the event rather than computed from its date on purpose: the NFL
   * week does not turn over at midnight, so a date-to-week guess lands on the
   * wrong slate around Thursday and Monday games.
   */
  season?: number;
  week?: number;
  /** Provider-neutral season phase, so adapters agree on more than a number. */
  seasonType?: SeasonType;
}

export type SeasonType = "pre" | "regular" | "post";

/**
 * One score, in the order it happened.
 *
 * A stat line is a total and cannot answer a market about *order*: a player
 * with one touchdown may or may not have had the game's first. So the markets
 * that turn on sequence — "first touchdown scorer", and every soccer
 * goalscorer market, since soccer box scores carry no per-player goals at all
 * — are answered from this feed instead.
 *
 * The scorer is identified by name because that is all some providers give:
 * ESPN's NFL scoring plays carry only prose ("Derrick Henry 5 Yd Rush"), with
 * no athlete id anywhere in the payload.
 */
export interface ProviderScoringPlay {
  /** Position in the game, 1-based. Order is the whole point of this feed. */
  sequence: number;
  kind: ScoringPlayKind;
  /** Absent when the provider's text could not be read; the leg stays silent. */
  scorerName?: string;
  /** Present only where the provider names the athlete, as soccer does. */
  scorerProviderId?: string;
  /** The tiebreaker when two players share a surname (§20.2). */
  teamAbbreviation?: string;
  teamProviderId?: string;
  period?: number;
  clock?: string;
}

/**
 * Anything that is not a score a market asks about is "other" rather than
 * dropped, so the sequence numbers still describe the real game.
 */
export type ScoringPlayKind = "touchdown" | "field_goal" | "goal" | "other";

export interface ProviderConfig {
  minRefreshIntervalSeconds: number; // default 60
  dailyRequestLimit?: number;
  timeoutMs: number; // default 15000
  scheduleCacheHours: number; // default 6
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  minRefreshIntervalSeconds: 60,
  timeoutMs: 15000,
  scheduleCacheHours: 6,
};

export interface SportsProvider {
  key: string;
  config: ProviderConfig;

  supportsSport(sport: string): boolean;

  getSchedule(params: unknown): Promise<ProviderEvent[]>;
  getScores?(params: unknown): Promise<ProviderEvent[]>;
  getEvent?(providerEventId: string): Promise<ProviderEvent>;
  getPlayerStats?(providerEventId: string): Promise<ProviderPlayerStat[]>;
  /**
   * Scores in the order they happened, for the markets that turn on sequence.
   * Per Event rather than per slate, so it is only worth calling for an Event
   * that actually carries such a leg.
   */
  getScoringPlays?(params: {
    sport: string;
    providerEventId: string;
  }): Promise<ProviderScoringPlay[]>;
}

/**
 * One player's counting stats from a provider. `stats` keys are normalized
 * (`passYards`, `receptions`, ...) so the "What Do I Need?" pane can compare a
 * prop threshold without knowing which provider supplied the number.
 */
export interface ProviderPlayerStat {
  providerPlayerId: string;
  playerName?: string;
  teamAbbreviation?: string;
  position?: string;
  /** Absent for week-scoped sources, which don't say which game a stat came from. */
  providerEventId?: string;
  stats: Record<string, number>;
  fantasyPointsPpr?: number;
  fantasyPointsHalfPpr?: number;
  fantasyPointsStandard?: number;
}

/**
 * Player stats keyed by week rather than by Event. Separate from SportsProvider
 * because a week-scoped source has no Events to offer and `getPlayerStats` is
 * per-Event: Sleeper returns every player in the league in one call, which is
 * what makes a refresh cost flat instead of one call per game.
 */
export interface PlayerStatsProvider {
  key: string;
  config: ProviderConfig;

  supportsSport(sport: string): boolean;

  getCurrentWeek(): Promise<{ season: string; week: number; seasonType: string }>;
  getWeekPlayerStats(params: {
    season: string;
    week: number;
    seasonType?: string;
  }): Promise<ProviderPlayerStat[]>;
}
