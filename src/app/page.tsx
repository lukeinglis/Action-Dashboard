import { createClient } from "@/lib/supabase/server";
import { getUserPreferences } from "@/lib/preferences/get-user-preferences";
import { getOrCreateDefaultView, getWorkspaceState, listViews } from "@/lib/dashboard/views-db";
import { resolveDateWindow } from "@/lib/dashboard/date-window";
import { resolveLayoutOnRestore, resolveOpeningState } from "@/lib/dashboard/views";
import { activeBetLegSubjects, computeRootingLabels, eventExposureCount } from "@/lib/dashboard/exposure";
import { groupByState, isScheduleRailEligible } from "@/lib/dashboard/schedule";
import { ticketSection } from "@/lib/dashboard/active-tickets";
import { buildWhatDoINeed, relevantWhatDoINeedEntries, type OpenLegForPane } from "@/lib/dashboard/what-do-i-need";
import { isLegLive, nextEvent } from "@/lib/tickets/bet-leg-events";
import { effectiveTicketStatus, legSettlement } from "@/lib/betting/derived-status";
import { displayedAwayScore, displayedClock, displayedHomeScore, displayedPeriod, displayedStatus } from "@/lib/events/overrides";
import {
  toBetLeg,
  toBetLegEvent,
  toBetLegSubject,
  toEvent,
  toParticipant,
  toTeam,
  toTicket,
  type BetLegEventRow,
  type BetLegRow,
  type BetLegSubjectRow,
  type EventRow,
  type ParticipantRow,
  type TeamRow,
  type TicketRow,
} from "@/lib/db/rows";
import type { LegSettlement, TicketStatus } from "@/lib/types/domain";
import { Dashboard } from "./Dashboard";
import type { DashboardTicketItem, EventDetailData, EventDetailLeg, EventDetailSubject, ScheduleEventItem, WhatDoINeedItem } from "./types";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [preferences, defaultView, workspaceState, views] = await Promise.all([
    getUserPreferences(supabase, user.id),
    getOrCreateDefaultView(supabase, user.id),
    getWorkspaceState(supabase, user.id),
    listViews(supabase, user.id),
  ]);

  const now = new Date();
  const { timezone, rolloverHour } = preferences;

  const opening = resolveOpeningState(workspaceState, defaultView, now, timezone, rolloverHour);
  const dateWindow = resolveDateWindow(opening.filters.dateWindow, now, timezone, rolloverHour);

  const [eventRes, ticketRes, legRes, teamRes, participantRes] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("tickets").select("*").order("sort_key", { ascending: true }),
    supabase.from("bet_legs").select("*"),
    supabase.from("teams").select("*"),
    supabase.from("participants").select("*"),
  ]);
  if (eventRes.error) throw eventRes.error;
  if (ticketRes.error) throw ticketRes.error;
  if (legRes.error) throw legRes.error;
  if (teamRes.error) throw teamRes.error;
  if (participantRes.error) throw participantRes.error;

  const events = (eventRes.data ?? []).map((r) => toEvent(r as EventRow));
  const tickets = (ticketRes.data ?? []).map((r) => toTicket(r as TicketRow));
  const legs = (legRes.data ?? []).map((r) => toBetLeg(r as BetLegRow));
  const teams = (teamRes.data ?? []).map((r) => toTeam(r as TeamRow));
  const participants = (participantRes.data ?? []).map((r) => toParticipant(r as ParticipantRow));

  const legIds = legs.map((l) => l.id);

  const [linkRes, subjectRes] = await Promise.all([
    legIds.length > 0
      ? supabase.from("bet_leg_events").select("*").in("bet_leg_id", legIds)
      : Promise.resolve({ data: [] as BetLegEventRow[], error: null }),
    legIds.length > 0
      ? supabase.from("bet_leg_subjects").select("*").in("bet_leg_id", legIds)
      : Promise.resolve({ data: [] as BetLegSubjectRow[], error: null }),
  ]);
  if (linkRes.error) throw linkRes.error;
  if (subjectRes.error) throw subjectRes.error;

  const links = (linkRes.data ?? []).map((r) => toBetLegEvent(r as BetLegEventRow));
  const subjects = (subjectRes.data ?? []).map((r) => toBetLegSubject(r as BetLegSubjectRow));

  const eventById = new Map(events.map((e) => [e.id, e]));
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const legById = new Map(legs.map((l) => [l.id, l]));
  const nameByParticipantId = new Map(participants.map((p) => [p.id, p.name]));
  const nameByTeamId = new Map(teams.map((t) => [t.id, t.name]));

  const legSettlementByLegId = new Map<string, LegSettlement>(legs.map((l) => [l.id, legSettlement(l)]));

  const legsByTicketId = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTicketId.get(leg.ticketId) ?? [];
    arr.push(leg);
    legsByTicketId.set(leg.ticketId, arr);
  }

  const eventsByLegId = new Map<string, string[]>();
  for (const link of links) {
    const arr = eventsByLegId.get(link.betLegId) ?? [];
    arr.push(link.eventId);
    eventsByLegId.set(link.betLegId, arr);
  }

  function linkedEventStatusesForLeg(legId: string) {
    return (eventsByLegId.get(legId) ?? []).map((eventId) => eventById.get(eventId)?.automaticStatus ?? null);
  }

  const ticketStatusById = new Map<string, TicketStatus>(
    tickets.map((t) => {
      const ticketLegs = legsByTicketId.get(t.id) ?? [];
      const anyLive = ticketLegs.some((leg) => isLegLive(legSettlement(leg), linkedEventStatusesForLeg(leg.id)));
      return [t.id, effectiveTicketStatus(t.manualStatus, ticketLegs, anyLive)];
    }),
  );
  const ticketStatusByLegId = new Map<string, TicketStatus>(legs.map((l) => [l.id, ticketStatusById.get(l.ticketId)!]));

  // Mixed Rooting Context (docs/PRD.md section 17): derived from active (open-leg) subjects only.
  const activeSubjects = activeBetLegSubjects(subjects, legSettlementByLegId);
  const rootingLabelByKey = computeRootingLabels(activeSubjects);

  function subjectName(s: { participantId?: string | null; teamId?: string | null }): string {
    if (s.participantId) return nameByParticipantId.get(s.participantId) ?? "Unknown player";
    if (s.teamId) return nameByTeamId.get(s.teamId) ?? "Unknown team";
    return "Unknown";
  }
  function subjectKey(s: { participantId?: string | null; teamId?: string | null }): string | null {
    if (s.teamId) return `team:${s.teamId}`;
    if (s.participantId) return `participant:${s.participantId}`;
    return null;
  }

  // Schedule Rail: exposure counts, eligibility (docs/PRD.md section 8, 11).
  const eligibleEvents = events.filter((event) => {
    const exposureCount = eventExposureCount(event.id, links, legSettlementByLegId, ticketStatusByLegId);
    return isScheduleRailEligible(
      {
        id: event.id,
        status: displayedStatus(event),
        startTimeUtc: event.startTimeUtc,
        endTimeUtc: event.endTimeUtc,
        statusChangedAt: event.manualSetAt ?? event.automaticChangedAt,
        isPinned: event.isPinned,
        exposureCount,
      },
      dateWindow,
      now,
      timezone,
      rolloverHour,
    );
  });

  const scheduleEvents: ScheduleEventItem[] = eligibleEvents.map((event) => ({
    id: event.id,
    name: event.name,
    sport: event.sport,
    league: event.league ?? null,
    status: displayedStatus(event),
    startTimeUtc: event.startTimeUtc ?? null,
    endTimeUtc: event.endTimeUtc ?? null,
    statusChangedAt: event.manualSetAt ?? event.automaticChangedAt ?? null,
    homeScore: displayedHomeScore(event),
    awayScore: displayedAwayScore(event),
    period: displayedPeriod(event),
    clock: displayedClock(event),
    isPinned: event.isPinned,
    exposureCount: eventExposureCount(event.id, links, legSettlementByLegId, ticketStatusByLegId),
  }));

  // Resolve the selected Event / fall back to All Active Tickets (docs/PRD.md section 46).
  const selectedEventRaw = opening.layout.selectedEventId ? eventById.get(opening.layout.selectedEventId) ?? null : null;
  const layout = resolveLayoutOnRestore(opening.layout, selectedEventRaw, dateWindow);

  // All Active Tickets workspace.
  const ticketItems: DashboardTicketItem[] = tickets.flatMap((ticket) => {
    const status = ticketStatusById.get(ticket.id)!;
    const section = ticketSection(status, ticket.settledAt, now, timezone, rolloverHour);
    if (!section) return [];
    const ticketLegs = legsByTicketId.get(ticket.id) ?? [];
    const legsRemaining = ticketLegs.filter((l) => legSettlement(l) === "open").length;
    const linkedEvents = ticketLegs
      .flatMap((l) => eventsByLegId.get(l.id) ?? [])
      .flatMap((eventId) => {
        const e = eventById.get(eventId);
        return e ? [e] : [];
      });
    return [
      {
        ticket,
        legCount: ticketLegs.length,
        status,
        section,
        legsRemaining,
        nextEventStartUtc: nextEvent(linkedEvents)?.startTimeUtc ?? null,
      },
    ];
  });

  // Event Detail workspace data, computed for every Schedule Rail-eligible Event.
  const eventDetailByEventId = new Map<string, EventDetailData>();
  for (const scheduleEvent of scheduleEvents) {
    const event = eventById.get(scheduleEvent.id)!;
    const eventLinks = links.filter((l) => l.eventId === event.id);
    const detailLegs: EventDetailLeg[] = eventLinks.map((link) => {
      const leg = legById.get(link.betLegId)!;
      const ticket = ticketById.get(leg.ticketId)!;
      const settlement = legSettlement(leg);
      const ticketStatus = ticketStatusById.get(ticket.id)!;
      const dead = settlement !== "open" || !(ticketStatus === "pending" || ticketStatus === "active");
      const legSubjects: EventDetailSubject[] = subjects
        .filter((s) => s.betLegId === leg.id)
        .map((s) => {
          const key = subjectKey(s);
          return {
            name: subjectName(s),
            label: (key && rootingLabelByKey.get(key)) || "NEUTRAL",
            dead,
          };
        });
      return {
        legId: leg.id,
        ticketId: ticket.id,
        ticketName: ticket.name ?? ticket.generatedName ?? ticket.sportsbook ?? "Ticket",
        ticketStatus,
        description: leg.selection ?? leg.rawDescription ?? leg.marketType,
        settlement,
        dead,
        subjects: legSubjects,
      };
    });
    eventDetailByEventId.set(event.id, { event: scheduleEvent, legs: detailLegs });
  }

  // What Do I Need? pane (docs/PRD.md section 16): active Betting need legs, grouped LIVE/UP NEXT.
  const groupByEventId = groupByState(scheduleEvents.map((e) => ({ id: e.id, status: e.status, startTimeUtc: e.startTimeUtc })));
  const openLegsForPane: OpenLegForPane[] = legs
    .filter((leg) => legSettlement(leg) === "open")
    .filter((leg) => {
      const status = ticketStatusByLegId.get(leg.id);
      return status === "pending" || status === "active";
    })
    .map((leg) => ({
      legId: leg.id,
      ticketId: leg.ticketId,
      description: leg.selection ?? leg.rawDescription ?? leg.marketType,
      eventId: (eventsByLegId.get(leg.id) ?? [])[0] ?? null,
      subjects: subjects
        .filter((s) => s.betLegId === leg.id)
        .map((s) => ({ name: subjectName(s), teamId: s.teamId, participantId: s.participantId })),
    }));
  const whatDoINeed: WhatDoINeedItem[] = relevantWhatDoINeedEntries(
    buildWhatDoINeed(openLegsForPane, groupByEventId, rootingLabelByKey),
  ).map((e) => ({
    legId: e.legId,
    ticketId: e.ticketId,
    description: e.description,
    group: e.group as "LIVE" | "UP NEXT",
    subjects: e.subjects,
  }));

  return (
    <Dashboard
      baseViewId={opening.baseViewId ?? null}
      initialFilters={opening.filters}
      initialLayout={layout}
      views={views}
      scheduleEvents={scheduleEvents}
      ticketItems={ticketItems}
      eventDetailByEventId={Object.fromEntries(eventDetailByEventId)}
      whatDoINeed={whatDoINeed}
      timeZone={timezone}
    />
  );
}
