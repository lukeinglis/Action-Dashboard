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

// Phase 2: Betting core. Mirrors
// supabase/migrations/20260930162146_create_phase2_betting_core.sql and
// docs/PRD.md sections 24-33, 63-63.1.

export type LegSettlement = "open" | "won" | "lost" | "push" | "void";

export type TicketStatus = "pending" | "active" | "won" | "lost" | "void" | "cashed_out";

export type LiveLegState = "winning" | "losing" | "even" | "unknown";

export type RootingDirection = "for" | "against" | "neutral";

export type ImportSource = "screenshot" | "text" | "manual";

export type ImportStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "needs_review"
  | "failed"
  | "approved"
  | "rejected";

export interface Ticket {
  id: string;
  userId: string;

  name?: string | null;
  generatedName?: string | null;

  sportsbook?: string | null;
  sportsbookTicketId?: string | null;

  stakeCents: number;
  toWinCents: number;
  totalReturnCents: number;
  actualReturnCents?: number | null;

  isBonusBet: boolean;
  oddsAmerican?: number | null;

  placedAt?: string | null;

  notes?: string | null;
  promotionNote?: string | null;

  tags: string[];

  manualStatus?: TicketStatus | null;
  settledAt?: string | null;

  sortKey: string;

  importRecordId?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface BetLeg {
  id: string;
  userId: string;
  ticketId: string;

  sport: string;
  league?: string | null;

  rawDescription?: string | null;

  marketType: string;
  selection?: string | null;

  line?: number | null;
  oddsAmerican?: number | null;

  automaticStatus?: LegSettlement | null;
  manualStatus?: LegSettlement | null;

  automaticLiveState?: LiveLegState | null;
  manualLiveState?: LiveLegState | null;
  liveDetail?: string | null;

  automaticCurrentValue?: number | null;
  manualCurrentValue?: number | null;
  targetValue?: number | null;
  progressUnit?: string | null;

  automaticChangedAt?: string | null;
  manualSetAt?: string | null;

  notes?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface BetLegEvent {
  id: string;
  userId: string;

  betLegId: string;
  eventId: string;

  matchMethod: MatchMethod;

  createdAt: string;
}

export interface BetLegSubject {
  id: string;
  userId: string;

  betLegId: string;

  participantId?: string | null;
  teamId?: string | null;

  direction: RootingDirection;
  directionSource: MatchMethod;

  matchMethod: MatchMethod;

  createdAt: string;
  updatedAt: string;
}

export interface ImportRecord {
  id: string;
  userId: string;

  source: ImportSource;
  status: ImportStatus;

  extractedText?: string | null;
  parsedPayload?: unknown;

  originalFilename?: string | null;

  storagePath?: string | null;
  parseError?: string | null;

  createdAt: string;
  approvedAt?: string | null;
}
