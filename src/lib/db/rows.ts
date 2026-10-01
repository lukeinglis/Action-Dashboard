// Row shapes as returned by Postgres (snake_case) and mappers to/from the
// camelCase domain types in src/lib/types/domain.ts.

import type {
  BetLeg,
  BetLegEvent,
  BetLegSubject,
  DashboardView,
  DashboardViewFilters,
  DashboardViewLayout,
  DFSEntry,
  DFSEntryStatus,
  DFSLineup,
  DFSLineupSlot,
  Event,
  EventSource,
  EventStatus,
  FantasyLeague,
  FantasyMatchup,
  FantasyMatchupStatus,
  FantasyRosterSlot,
  ImportRecord,
  ImportSource,
  ImportStatus,
  LegSettlement,
  LiveLegState,
  MappedEntityType,
  MatchMethod,
  Participant,
  ParticipantType,
  ProviderMapping,
  RootingDirection,
  RosterSlotSide,
  Team,
  Ticket,
  TicketStatus,
  UserPreferences,
  WorkspaceState,
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

export interface TicketRow {
  id: string;
  user_id: string;
  name: string | null;
  generated_name: string | null;
  sportsbook: string | null;
  sportsbook_ticket_id: string | null;
  stake_cents: number;
  to_win_cents: number;
  total_return_cents: number;
  actual_return_cents: number | null;
  is_bonus_bet: boolean;
  odds_american: number | null;
  placed_at: string | null;
  notes: string | null;
  promotion_note: string | null;
  tags: string[];
  manual_status: TicketStatus | null;
  settled_at: string | null;
  sort_key: string;
  import_record_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BetLegRow {
  id: string;
  user_id: string;
  ticket_id: string;
  sport: string;
  league: string | null;
  raw_description: string | null;
  market_type: string;
  selection: string | null;
  line: number | null;
  odds_american: number | null;
  automatic_status: LegSettlement | null;
  manual_status: LegSettlement | null;
  automatic_live_state: LiveLegState | null;
  manual_live_state: LiveLegState | null;
  live_detail: string | null;
  automatic_current_value: number | null;
  manual_current_value: number | null;
  target_value: number | null;
  progress_unit: string | null;
  automatic_changed_at: string | null;
  manual_set_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BetLegEventRow {
  id: string;
  user_id: string;
  bet_leg_id: string;
  event_id: string;
  match_method: MatchMethod;
  created_at: string;
}

export interface BetLegSubjectRow {
  id: string;
  user_id: string;
  bet_leg_id: string;
  participant_id: string | null;
  team_id: string | null;
  direction: RootingDirection;
  direction_source: MatchMethod;
  match_method: MatchMethod;
  created_at: string;
  updated_at: string;
}

export interface ImportRecordRow {
  id: string;
  user_id: string;
  source: ImportSource;
  status: ImportStatus;
  extracted_text: string | null;
  parsed_payload: unknown;
  original_filename: string | null;
  storage_path: string | null;
  parse_error: string | null;
  created_at: string;
  approved_at: string | null;
}

export function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    generatedName: row.generated_name,
    sportsbook: row.sportsbook,
    sportsbookTicketId: row.sportsbook_ticket_id,
    stakeCents: row.stake_cents,
    toWinCents: row.to_win_cents,
    totalReturnCents: row.total_return_cents,
    actualReturnCents: row.actual_return_cents,
    isBonusBet: row.is_bonus_bet,
    oddsAmerican: row.odds_american,
    placedAt: row.placed_at,
    notes: row.notes,
    promotionNote: row.promotion_note,
    tags: row.tags,
    manualStatus: row.manual_status,
    settledAt: row.settled_at,
    sortKey: row.sort_key,
    importRecordId: row.import_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBetLeg(row: BetLegRow): BetLeg {
  return {
    id: row.id,
    userId: row.user_id,
    ticketId: row.ticket_id,
    sport: row.sport,
    league: row.league,
    rawDescription: row.raw_description,
    marketType: row.market_type,
    selection: row.selection,
    line: row.line,
    oddsAmerican: row.odds_american,
    automaticStatus: row.automatic_status,
    manualStatus: row.manual_status,
    automaticLiveState: row.automatic_live_state,
    manualLiveState: row.manual_live_state,
    liveDetail: row.live_detail,
    automaticCurrentValue: row.automatic_current_value,
    manualCurrentValue: row.manual_current_value,
    targetValue: row.target_value,
    progressUnit: row.progress_unit,
    automaticChangedAt: row.automatic_changed_at,
    manualSetAt: row.manual_set_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBetLegEvent(row: BetLegEventRow): BetLegEvent {
  return {
    id: row.id,
    userId: row.user_id,
    betLegId: row.bet_leg_id,
    eventId: row.event_id,
    matchMethod: row.match_method,
    createdAt: row.created_at,
  };
}

export function toBetLegSubject(row: BetLegSubjectRow): BetLegSubject {
  return {
    id: row.id,
    userId: row.user_id,
    betLegId: row.bet_leg_id,
    participantId: row.participant_id,
    teamId: row.team_id,
    direction: row.direction,
    directionSource: row.direction_source,
    matchMethod: row.match_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toImportRecord(row: ImportRecordRow): ImportRecord {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    status: row.status,
    extractedText: row.extracted_text,
    parsedPayload: row.parsed_payload,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    parseError: row.parse_error,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

export interface DashboardViewRow {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  filters: DashboardViewFilters;
  layout: DashboardViewLayout;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceStateRow {
  user_id: string;
  base_view_id: string | null;
  filters: DashboardViewFilters;
  layout: DashboardViewLayout;
  updated_at: string;
}

export function toDashboardView(row: DashboardViewRow): DashboardView {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    isDefault: row.is_default,
    filters: row.filters,
    layout: row.layout,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toWorkspaceState(row: WorkspaceStateRow): WorkspaceState {
  return {
    userId: row.user_id,
    baseViewId: row.base_view_id,
    filters: row.filters,
    layout: row.layout,
    updatedAt: row.updated_at,
  };
}

// Phase 5: Fantasy and DFS. Mirrors
// supabase/migrations/20261001000000_create_phase5_fantasy_dfs.sql and
// docs/PRD.md sections 34-45.

export interface FantasyLeagueRow {
  id: string;
  user_id: string;
  name: string;
  platform: string | null;
  sport: string;
  season: string;
  user_team_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface FantasyMatchupRow {
  id: string;
  user_id: string;
  fantasy_league_id: string;
  week: number | null;
  user_team_name: string;
  opponent_team_name: string;
  automatic_user_score: number | null;
  automatic_opponent_score: number | null;
  manual_user_score: number | null;
  manual_opponent_score: number | null;
  user_projected_score: number | null;
  opponent_projected_score: number | null;
  automatic_changed_at: string | null;
  manual_set_at: string | null;
  status: FantasyMatchupStatus;
  finalized_at: string | null;
  sort_key: string;
  import_record_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FantasyRosterSlotRow {
  id: string;
  user_id: string;
  fantasy_matchup_id: string;
  side: RosterSlotSide;
  slot: string;
  participant_id: string | null;
  participant_match_method: MatchMethod | null;
  player_name: string;
  projected_points: number | null;
  automatic_actual_points: number | null;
  manual_actual_points: number | null;
  automatic_changed_at: string | null;
  manual_set_at: string | null;
  event_id: string | null;
  event_match_method: MatchMethod | null;
  created_at: string;
  updated_at: string;
}

export interface DFSLineupRow {
  id: string;
  user_id: string;
  platform: string;
  sport: string;
  slate_name: string | null;
  import_record_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DFSLineupSlotRow {
  id: string;
  user_id: string;
  dfs_lineup_id: string;
  slot: string;
  participant_id: string | null;
  participant_match_method: MatchMethod | null;
  player_name: string;
  salary: number | null;
  automatic_actual_points: number | null;
  manual_actual_points: number | null;
  automatic_changed_at: string | null;
  manual_set_at: string | null;
  event_id: string | null;
  event_match_method: MatchMethod | null;
  created_at: string;
  updated_at: string;
}

export interface DFSEntryRow {
  id: string;
  user_id: string;
  dfs_lineup_id: string;
  contest_name: string | null;
  entry_fee_cents: number | null;
  potential_prize_cents: number | null;
  automatic_current_points: number | null;
  manual_current_points: number | null;
  automatic_changed_at: string | null;
  manual_set_at: string | null;
  status: DFSEntryStatus;
  finalized_at: string | null;
  sort_key: string;
  created_at: string;
  updated_at: string;
}

export function toFantasyLeague(row: FantasyLeagueRow): FantasyLeague {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    platform: row.platform,
    sport: row.sport,
    season: row.season,
    userTeamName: row.user_team_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toFantasyMatchup(row: FantasyMatchupRow): FantasyMatchup {
  return {
    id: row.id,
    userId: row.user_id,
    fantasyLeagueId: row.fantasy_league_id,
    week: row.week,
    userTeamName: row.user_team_name,
    opponentTeamName: row.opponent_team_name,
    automaticUserScore: row.automatic_user_score,
    automaticOpponentScore: row.automatic_opponent_score,
    manualUserScore: row.manual_user_score,
    manualOpponentScore: row.manual_opponent_score,
    userProjectedScore: row.user_projected_score,
    opponentProjectedScore: row.opponent_projected_score,
    automaticChangedAt: row.automatic_changed_at,
    manualSetAt: row.manual_set_at,
    status: row.status,
    finalizedAt: row.finalized_at,
    sortKey: row.sort_key,
    importRecordId: row.import_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toFantasyRosterSlot(row: FantasyRosterSlotRow): FantasyRosterSlot {
  return {
    id: row.id,
    userId: row.user_id,
    fantasyMatchupId: row.fantasy_matchup_id,
    side: row.side,
    slot: row.slot,
    participantId: row.participant_id,
    participantMatchMethod: row.participant_match_method,
    playerName: row.player_name,
    projectedPoints: row.projected_points,
    automaticActualPoints: row.automatic_actual_points,
    manualActualPoints: row.manual_actual_points,
    automaticChangedAt: row.automatic_changed_at,
    manualSetAt: row.manual_set_at,
    eventId: row.event_id,
    eventMatchMethod: row.event_match_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDFSLineup(row: DFSLineupRow): DFSLineup {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    sport: row.sport,
    slateName: row.slate_name,
    importRecordId: row.import_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDFSLineupSlot(row: DFSLineupSlotRow): DFSLineupSlot {
  return {
    id: row.id,
    userId: row.user_id,
    dfsLineupId: row.dfs_lineup_id,
    slot: row.slot,
    participantId: row.participant_id,
    participantMatchMethod: row.participant_match_method,
    playerName: row.player_name,
    salary: row.salary,
    automaticActualPoints: row.automatic_actual_points,
    manualActualPoints: row.manual_actual_points,
    automaticChangedAt: row.automatic_changed_at,
    manualSetAt: row.manual_set_at,
    eventId: row.event_id,
    eventMatchMethod: row.event_match_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDFSEntry(row: DFSEntryRow): DFSEntry {
  return {
    id: row.id,
    userId: row.user_id,
    dfsLineupId: row.dfs_lineup_id,
    contestName: row.contest_name,
    entryFeeCents: row.entry_fee_cents,
    potentialPrizeCents: row.potential_prize_cents,
    automaticCurrentPoints: row.automatic_current_points,
    manualCurrentPoints: row.manual_current_points,
    automaticChangedAt: row.automatic_changed_at,
    manualSetAt: row.manual_set_at,
    status: row.status,
    finalizedAt: row.finalized_at,
    sortKey: row.sort_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
