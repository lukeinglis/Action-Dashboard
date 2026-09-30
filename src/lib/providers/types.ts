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
  getPlayerStats?(providerEventId: string): Promise<unknown>;
}
