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
}

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
