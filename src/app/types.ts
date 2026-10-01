// View models the dashboard server component hands to client components.
// Derived once on the server from the domain types; client components only
// reorder/regroup them (pure functions from src/lib/dashboard), never
// refetch, so interactions stay instant.

import type { RootingLabel } from "@/lib/dashboard/exposure";
import type { EventStatus, TicketStatus } from "@/lib/types/domain";
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
  ticketStatus: TicketStatus;
  description: string;
  settlement: string;
  dead: boolean;
  subjects: EventDetailSubject[];
}

export interface EventDetailData {
  event: ScheduleEventItem;
  legs: EventDetailLeg[];
}

export interface WhatDoINeedItem {
  legId: string;
  ticketId: string;
  description: string;
  group: "LIVE" | "UP NEXT";
  subjects: { name: string; label: RootingLabel }[];
}
