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

// 46. Saved View model.
export type DateWindow =
  | { kind: "today" }
  | { kind: "rolling"; pastHours: number; futureHours: number }
  | { kind: "nfl_week" }
  | { kind: "absolute"; start: string; end: string };

export type SortMode = "manual" | "next_event" | "stake" | "to_win" | "legs_remaining";

export type DashboardSection = "active" | "settled" | "final";
export type DashboardDomain = "betting" | "fantasy" | "dfs";
export type ScheduleGrouping = "state" | "nfl_window" | "chronological";
export type ActiveWorkspace = "tickets" | "event";

export interface DashboardViewFilters {
  domains?: DashboardDomain[];
  sports?: string[];
  leagues?: string[];
  tags?: string[];
  dateWindow: DateWindow;
  includePinned: boolean;
}

export interface DashboardViewLayout {
  sortMode: SortMode;
  visibleSections: DashboardSection[];
  collapsedIds?: string[];
  density: "comfortable" | "compact";
  activeWorkspace: ActiveWorkspace;
  selectedEventId?: string;
  openPane?: string;
  scheduleGrouping: ScheduleGrouping;
}

export interface DashboardView {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;

  filters: DashboardViewFilters;
  layout: DashboardViewLayout;

  createdAt: string;
  updatedAt: string;
}

// 46.1 Working state.
export interface WorkspaceState {
  userId: string;
  baseViewId?: string | null;

  filters: DashboardViewFilters;
  layout: DashboardViewLayout;

  updatedAt: string;
}

// Phase 5: Fantasy and DFS. Mirrors
// supabase/migrations/20261001000000_create_phase5_fantasy_dfs.sql and
// docs/PRD.md sections 34-45, 63, 63.1.

export type FantasyMatchupStatus = "upcoming" | "live" | "final";
export type DFSEntryStatus = "upcoming" | "live" | "final";
export type RosterSlotSide = "user" | "opponent";

export interface FantasyLeague {
  id: string;
  userId: string;

  name: string;
  platform?: string | null;

  sport: string;
  season: string;

  userTeamName?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface FantasyMatchup {
  id: string;
  userId: string;
  fantasyLeagueId: string;

  week?: number | null;

  userTeamName: string;
  opponentTeamName: string;

  automaticUserScore?: number | null;
  automaticOpponentScore?: number | null;

  manualUserScore?: number | null;
  manualOpponentScore?: number | null;

  userProjectedScore?: number | null;
  opponentProjectedScore?: number | null;

  automaticChangedAt?: string | null;
  manualSetAt?: string | null;

  status: FantasyMatchupStatus;
  finalizedAt?: string | null;

  sortKey: string;

  importRecordId?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface FantasyRosterSlot {
  id: string;
  userId: string;
  fantasyMatchupId: string;

  side: RosterSlotSide;
  slot: string;

  participantId?: string | null;
  participantMatchMethod?: MatchMethod | null;

  playerName: string;

  projectedPoints?: number | null;

  automaticActualPoints?: number | null;
  manualActualPoints?: number | null;

  automaticChangedAt?: string | null;
  manualSetAt?: string | null;

  eventId?: string | null;
  eventMatchMethod?: MatchMethod | null;

  createdAt: string;
  updatedAt: string;
}

export interface DFSLineup {
  id: string;
  userId: string;

  platform: string;
  sport: string;

  slateName?: string | null;

  importRecordId?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface DFSLineupSlot {
  id: string;
  userId: string;
  dfsLineupId: string;

  slot: string;

  participantId?: string | null;
  participantMatchMethod?: MatchMethod | null;

  playerName: string;

  salary?: number | null;

  automaticActualPoints?: number | null;
  manualActualPoints?: number | null;

  automaticChangedAt?: string | null;
  manualSetAt?: string | null;

  eventId?: string | null;
  eventMatchMethod?: MatchMethod | null;

  createdAt: string;
  updatedAt: string;
}

export interface DFSEntry {
  id: string;
  userId: string;

  dfsLineupId: string;

  contestName?: string | null;

  entryFeeCents?: number | null;
  potentialPrizeCents?: number | null;

  automaticCurrentPoints?: number | null;
  manualCurrentPoints?: number | null;

  automaticChangedAt?: string | null;
  manualSetAt?: string | null;

  status: DFSEntryStatus;
  finalizedAt?: string | null;

  sortKey: string;

  createdAt: string;
  updatedAt: string;
}
