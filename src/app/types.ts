// View models the dashboard server component hands to client components.
// Derived once on the server from the domain types; client components only
// reorder/regroup them (pure functions from src/lib/dashboard), never
// refetch, so interactions stay instant.

import type { RootingLabel } from "@/lib/dashboard/exposure";
import type { TicketColor } from "@/lib/tickets/ticket-code";
import type { DFSEntryStatus, EventStatus, FantasyMatchupStatus, RosterSlotSide, TicketStatus } from "@/lib/types/domain";
import type { TicketWithStatus } from "./tickets/types";

export interface ScheduleEventItem {
  id: string;
  name: string;
  sport: string;
  league: string | null;
  status: EventStatus | null;
  startTimeUtc: string | null;
  endTimeUtc: string | null;
  statusChangedAt: string | null;
  homeScore: number | null;
  awayScore: number | null;
  period: string | null;
  clock: string | null;
  isPinned: boolean;
  exposureCount: number;
}

export interface DashboardTicketItem extends TicketWithStatus {
  section: "active" | "settled";
  legsRemaining: number;
  nextEventStartUtc: string | null;
}

export interface EventDetailSubject {
  name: string;
  label: RootingLabel;
  dead: boolean;
}

export interface EventDetailLeg {
  legId: string;
  ticketId: string;
  ticketName: string;
  ticketCode: string;
  ticketColor: TicketColor;
  ticketStatus: TicketStatus;
  description: string;
  settlement: string;
  dead: boolean;
  subjects: EventDetailSubject[];
}

/** A FantasyRosterSlot linked to this Event, for the MY FANTASY / FANTASY OPPONENTS sections (docs/PRD.md section 34, 65). */
export interface EventDetailFantasySlot {
  slotId: string;
  matchupId: string;
  leagueName: string;
  side: RosterSlotSide;
  slot: string;
  playerName: string;
  label: RootingLabel;
}

/** A DFSLineupSlot linked to this Event, for the DFS section (docs/PRD.md section 40, 65). */
export interface EventDetailDfsSlot {
  slotId: string;
  lineupId: string;
  platform: string;
  slot: string;
  playerName: string;
  label: RootingLabel;
}

export interface EventDetailData {
  event: ScheduleEventItem;
  legs: EventDetailLeg[];
  fantasySlots: EventDetailFantasySlot[];
  dfsSlots: EventDetailDfsSlot[];
}

export interface WhatDoINeedItem {
  legId: string;
  ticketId: string;
  description: string;
  group: "LIVE" | "UP NEXT";
  subjects: { name: string; label: RootingLabel }[];
}

/**
 * A roster entry as the context panes show it. `eventId` is null until the
 * player's Event is matched, which is also why the pane shows the Event name:
 * an unmatched player is invisible in the Schedule Rail.
 */
export interface PaneRosterPlayer {
  slotId: string;
  slot: string;
  playerName: string;
  eventId: string | null;
  eventName: string | null;
}

/** Active FantasyMatchup for the Fantasy context pane; Mark Final (docs/PRD.md section 8). */
export interface FantasyMatchupPaneItem {
  matchupId: string;
  leagueName: string;
  week: number | null;
  userTeamName: string;
  opponentTeamName: string;
  status: FantasyMatchupStatus;
  showMarkFinal: boolean;
  /** Distinct Event ids linked via this matchup's roster slots, for click-through to Event Detail. */
  eventIds: string[];
  userRoster: PaneRosterPlayer[];
  opponentRoster: PaneRosterPlayer[];
}

/** Active DFSEntry for the DFS context pane; Mark Final (docs/PRD.md section 8). */
export interface DfsEntryPaneItem {
  entryId: string;
  lineupId: string;
  platform: string;
  slateName: string | null;
  contestName: string | null;
  status: DFSEntryStatus;
  showMarkFinal: boolean;
  roster: PaneRosterPlayer[];
}
