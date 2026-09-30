// Row shapes as returned by Postgres (snake_case) and mappers to/from the
// camelCase domain types in src/lib/types/domain.ts.

import type {
  Event,
  EventSource,
  EventStatus,
  MappedEntityType,
  MatchMethod,
  Participant,
  ParticipantType,
  ProviderMapping,
  Team,
  UserPreferences,
} from "@/lib/types/domain";

export interface UserPreferencesRow {
  user_id: string;
  timezone: string;
  rollover_hour: number;
  created_at: string;
  updated_at: string;
}

export interface TeamRow {
  id: string;
  user_id: string;
  sport: string;
  league: string;
  name: string;
  abbreviation: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParticipantRow {
  id: string;
  user_id: string;
  type: ParticipantType;
  sport: string;
  league: string | null;
  name: string;
  team_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  user_id: string;
  sport: string;
  league: string | null;
  name: string;
  start_time_utc: string | null;
  start_time_tbd: boolean;
  end_time_utc: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  source: EventSource;
  automatic_status: EventStatus | null;
  automatic_home_score: number | null;
  automatic_away_score: number | null;
  automatic_period: string | null;
  automatic_clock: string | null;
  automatic_changed_at: string | null;
  manual_status: EventStatus | null;
  manual_home_score: number | null;
  manual_away_score: number | null;
  manual_period: string | null;
  manual_clock: string | null;
  manual_set_at: string | null;
  is_pinned: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderMappingRow {
  id: string;
  user_id: string;
  entity_type: MappedEntityType;
  entity_id: string;
  provider_key: string;
  provider_id: string;
  match_method: MatchMethod;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

export function toUserPreferences(row: UserPreferencesRow): UserPreferences {
  return {
    userId: row.user_id,
    timezone: row.timezone,
    rolloverHour: row.rollover_hour,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    userId: row.user_id,
    sport: row.sport,
    league: row.league,
    name: row.name,
    abbreviation: row.abbreviation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    sport: row.sport,
    league: row.league,
    name: row.name,
    teamId: row.team_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    userId: row.user_id,
    sport: row.sport,
    league: row.league,
    name: row.name,
    startTimeUtc: row.start_time_utc,
    startTimeTbd: row.start_time_tbd,
    endTimeUtc: row.end_time_utc,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    source: row.source,
    automaticStatus: row.automatic_status,
    automaticHomeScore: row.automatic_home_score,
    automaticAwayScore: row.automatic_away_score,
    automaticPeriod: row.automatic_period,
    automaticClock: row.automatic_clock,
    automaticChangedAt: row.automatic_changed_at,
    manualStatus: row.manual_status,
    manualHomeScore: row.manual_home_score,
    manualAwayScore: row.manual_away_score,
    manualPeriod: row.manual_period,
    manualClock: row.manual_clock,
    manualSetAt: row.manual_set_at,
    isPinned: row.is_pinned,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toProviderMapping(row: ProviderMappingRow): ProviderMapping {
  return {
    id: row.id,
    userId: row.user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    providerKey: row.provider_key,
    providerId: row.provider_id,
    matchMethod: row.match_method,
    locked: row.locked,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
