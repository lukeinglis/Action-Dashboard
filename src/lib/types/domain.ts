// Shared identity-layer types. Mirrors the schema in
// supabase/migrations/20260930153555_create_phase1_schema.sql and
// docs/PRD.md sections 18-20.1.

export type ParticipantType = "player" | "golfer" | "driver" | "fighter" | "other";

export type EventStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "cancelled"
  | "suspended"
  | "unknown";

export type EventSource = "manual" | "provider";

export type MatchMethod = "auto" | "manual";

export type MappedEntityType = "event" | "team" | "participant";

export interface UserPreferences {
  userId: string;
  timezone: string;
  rolloverHour: number;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  userId: string;
  sport: string;
  league: string;
  name: string;
  abbreviation?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Participant {
  id: string;
  userId: string;
  type: ParticipantType;
  sport: string;
  league?: string | null;
  name: string;
  teamId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: string;
  userId: string;

  sport: string;
  league?: string | null;
  name: string;

  startTimeUtc?: string | null;
  startTimeTbd: boolean;
  endTimeUtc?: string | null;

  homeTeamId?: string | null;
  awayTeamId?: string | null;

  source: EventSource;

  automaticStatus?: EventStatus | null;
  automaticHomeScore?: number | null;
  automaticAwayScore?: number | null;
  automaticPeriod?: string | null;
  automaticClock?: string | null;
  automaticChangedAt?: string | null;

  manualStatus?: EventStatus | null;
  manualHomeScore?: number | null;
  manualAwayScore?: number | null;
  manualPeriod?: string | null;
  manualClock?: string | null;
  manualSetAt?: string | null;

  isPinned: boolean;
  notes?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface ProviderMapping {
  id: string;
  userId: string;

  entityType: MappedEntityType;
  entityId: string;

  providerKey: string;
  providerId: string;

  matchMethod: MatchMethod;
  locked: boolean;

  createdAt: string;
  updatedAt: string;
}
