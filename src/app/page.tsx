import { createClient } from "@/lib/supabase/server";
import { getUserPreferences } from "@/lib/preferences/get-user-preferences";
import { getOrCreateDefaultView, getWorkspaceState, listViews } from "@/lib/dashboard/views-db";
import { resolveDateWindow } from "@/lib/dashboard/date-window";
import { resolveLayoutOnRestore, resolveOpeningState } from "@/lib/dashboard/views";
import {
  activeBetLegSubjects,
  computeRootingLabels,
  dfsExposureCount,
  dfsRootingSubjects,
  eventExposureCount,
  fantasyExposureCount,
  fantasyRootingSubjects,
  type RootingLabel,
} from "@/lib/dashboard/exposure";
import { groupByState, isScheduleRailEligible } from "@/lib/dashboard/schedule";
import { ticketSection } from "@/lib/dashboard/active-tickets";
import { allLinkedEventsFinal, fantasyDfsSection } from "@/lib/dashboard/active-fantasy-dfs";
import { buildWhatDoINeed, relevantWhatDoINeedEntries, type OpenLegForPane } from "@/lib/dashboard/what-do-i-need";
import { isLegLive, nextEvent } from "@/lib/tickets/bet-leg-events";
import { resolveTicketCode, resolveTicketColor } from "@/lib/tickets/ticket-code";
import { effectiveTicketStatus, legSettlement } from "@/lib/betting/derived-status";
import { displayedAwayScore, displayedClock, displayedHomeScore, displayedPeriod, displayedStatus } from "@/lib/events/overrides";
import {
  toBetLeg,
  toBetLegEvent,
  toBetLegSubject,
  toDFSEntry,
  toDFSLineup,
  toDFSLineupSlot,
  toEvent,
  toFantasyLeague,
  toFantasyMatchup,
  toFantasyRosterSlot,
  toParticipant,
  toTeam,
  toTicket,
  type BetLegEventRow,
  type BetLegRow,
  type BetLegSubjectRow,
  type DFSEntryRow,
  type DFSLineupRow,
  type DFSLineupSlotRow,
  type EventRow,
  type FantasyLeagueRow,
  type FantasyMatchupRow,
  type FantasyRosterSlotRow,
  type ParticipantRow,
  type TeamRow,
  type TicketRow,
} from "@/lib/db/rows";
import type { LegSettlement, TicketStatus } from "@/lib/types/domain";
import { Dashboard } from "./Dashboard";
import type {
  DashboardTicketItem,
  DfsEntryPaneItem,
  EventDetailData,
  EventDetailDfsSlot,
  EventDetailFantasySlot,
  EventDetailLeg,
  EventDetailSubject,
  FantasyMatchupPaneItem,
  PaneRosterPlayer,
  ScheduleEventItem,
  WhatDoINeedItem,
} from "./types";

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

  const [
    eventRes,
    ticketRes,
    legRes,
    teamRes,
    participantRes,
    fantasyLeagueRes,
    fantasyMatchupRes,
    fantasyRosterSlotRes,
    dfsLineupRes,
    dfsLineupSlotRes,
    dfsEntryRes,
  ] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("tickets").select("*").order("sort_key", { ascending: true }),
    supabase.from("bet_legs").select("*"),
    supabase.from("teams").select("*"),
    supabase.from("participants").select("*"),
    supabase.from("fantasy_leagues").select("*"),
    supabase.from("fantasy_matchups").select("*").order("sort_key", { ascending: true }),
    supabase.from("fantasy_roster_slots").select("*"),
    supabase.from("dfs_lineups").select("*"),
    supabase.from("dfs_lineup_slots").select("*"),
    supabase.from("dfs_entries").select("*").order("sort_key", { ascending: true }),
  ]);
  if (eventRes.error) throw eventRes.error;
  if (ticketRes.error) throw ticketRes.error;
  if (legRes.error) throw legRes.error;
  if (teamRes.error) throw teamRes.error;
  if (participantRes.error) throw participantRes.error;
  if (fantasyLeagueRes.error) throw fantasyLeagueRes.error;
  if (fantasyMatchupRes.error) throw fantasyMatchupRes.error;
  if (fantasyRosterSlotRes.error) throw fantasyRosterSlotRes.error;
  if (dfsLineupRes.error) throw dfsLineupRes.error;
  if (dfsLineupSlotRes.error) throw dfsLineupSlotRes.error;
  if (dfsEntryRes.error) throw dfsEntryRes.error;

  const events = (eventRes.data ?? []).map((r) => toEvent(r as EventRow));
  const tickets = (ticketRes.data ?? []).map((r) => toTicket(r as TicketRow));
  const legs = (legRes.data ?? []).map((r) => toBetLeg(r as BetLegRow));
  const teams = (teamRes.data ?? []).map((r) => toTeam(r as TeamRow));
  const participants = (participantRes.data ?? []).map((r) => toParticipant(r as ParticipantRow));
  const fantasyLeagues = (fantasyLeagueRes.data ?? []).map((r) => toFantasyLeague(r as FantasyLeagueRow));
  const fantasyMatchups = (fantasyMatchupRes.data ?? []).map((r) => toFantasyMatchup(r as FantasyMatchupRow));
  const fantasyRosterSlots = (fantasyRosterSlotRes.data ?? []).map((r) => toFantasyRosterSlot(r as FantasyRosterSlotRow));
  const dfsLineups = (dfsLineupRes.data ?? []).map((r) => toDFSLineup(r as DFSLineupRow));
  const dfsLineupSlots = (dfsLineupSlotRes.data ?? []).map((r) => toDFSLineupSlot(r as DFSLineupSlotRow));
  const dfsEntries = (dfsEntryRes.data ?? []).map((r) => toDFSEntry(r as DFSEntryRow));

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

  // Phase 5: Fantasy and DFS lookup maps (docs/PRD.md sections 34-45).
  const fantasyLeagueById = new Map(fantasyLeagues.map((l) => [l.id, l]));
  const fantasyMatchupById = new Map(fantasyMatchups.map((m) => [m.id, m]));
  const dfsLineupById = new Map(dfsLineups.map((l) => [l.id, l]));
  const fantasyRosterSlotsByMatchupId = new Map<string, typeof fantasyRosterSlots>();
  for (const slot of fantasyRosterSlots) {
    const arr = fantasyRosterSlotsByMatchupId.get(slot.fantasyMatchupId) ?? [];
    arr.push(slot);
    fantasyRosterSlotsByMatchupId.set(slot.fantasyMatchupId, arr);
  }
  const dfsLineupSlotsByLineupId = new Map<string, typeof dfsLineupSlots>();
  for (const slot of dfsLineupSlots) {
    const arr = dfsLineupSlotsByLineupId.get(slot.dfsLineupId) ?? [];
    arr.push(slot);
    dfsLineupSlotsByLineupId.set(slot.dfsLineupId, arr);
  }
  const dfsEntriesByLineupId = new Map<string, typeof dfsEntries>();
  for (const entry of dfsEntries) {
    const arr = dfsEntriesByLineupId.get(entry.dfsLineupId) ?? [];
    arr.push(entry);
    dfsEntriesByLineupId.set(entry.dfsLineupId, arr);
  }

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

  // Mixed Rooting Context (docs/PRD.md section 17): combines active (open-leg) betting
  // subjects with Fantasy (user-side "for" / opponent-side "against") and DFS (always
  // "for", active entries only) subjects for a true cross-domain rooting label.
  const activeSubjects = activeBetLegSubjects(subjects, legSettlementByLegId);
  const fantasySubjects = fantasyRootingSubjects(fantasyRosterSlots);
  const dfsSubjects = dfsRootingSubjects(dfsLineupSlots, dfsEntries);
  const rootingLabelByKey = computeRootingLabels([
    ...activeSubjects,
    ...fantasySubjects,
    ...dfsSubjects,
  ]);

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

  // Schedule Rail: exposure counts, eligibility (docs/PRD.md section 11.6:
  // betting + fantasy + DFS terms summed together).
  function totalExposureCount(eventId: string): number {
    return (
      eventExposureCount(eventId, links, legSettlementByLegId, ticketStatusByLegId) +
      fantasyExposureCount(eventId, fantasyRosterSlots) +
      dfsExposureCount(eventId, dfsLineupSlots, dfsEntries)
    );
  }

  const eligibleEvents = events.filter((event) => {
    const exposureCount = totalExposureCount(event.id);
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
    exposureCount: totalExposureCount(event.id),
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
        legs: ticketLegs.map((l) => ({
          id: l.id,
          marketType: l.marketType,
          selection: l.selection ?? null,
          rawDescription: l.rawDescription ?? null,
          line: l.line ?? null,
          oddsAmerican: l.oddsAmerican ?? null,
          settlement: legSettlement(l),
        })),
      },
    ];
  });

  // Event Detail: MY FANTASY / FANTASY OPPONENTS / DFS sections (docs/PRD.md
  // sections 34-45, 65), keyed by linked Event.
  function rootingLabelForParticipant(participantId: string | null | undefined): RootingLabel {
    if (!participantId) return "NEUTRAL";
    return rootingLabelByKey.get(`participant:${participantId}`) ?? "NEUTRAL";
  }

  const fantasySlotsByEventId = new Map<string, EventDetailFantasySlot[]>();
  for (const slot of fantasyRosterSlots) {
    if (!slot.eventId) continue;
    const matchup = fantasyMatchupById.get(slot.fantasyMatchupId);
    const league = matchup ? fantasyLeagueById.get(matchup.fantasyLeagueId) : undefined;
    const arr = fantasySlotsByEventId.get(slot.eventId) ?? [];
    arr.push({
      slotId: slot.id,
      matchupId: slot.fantasyMatchupId,
      leagueName: league?.name ?? "Fantasy League",
      side: slot.side,
      slot: slot.slot,
      playerName: slot.playerName,
      label: rootingLabelForParticipant(slot.participantId),
    });
    fantasySlotsByEventId.set(slot.eventId, arr);
  }

  const dfsSlotsByEventId = new Map<string, EventDetailDfsSlot[]>();
  for (const slot of dfsLineupSlots) {
    if (!slot.eventId) continue;
    const lineup = dfsLineupById.get(slot.dfsLineupId);
    const arr = dfsSlotsByEventId.get(slot.eventId) ?? [];
    arr.push({
      slotId: slot.id,
      lineupId: slot.dfsLineupId,
      platform: lineup?.platform ?? "DFS",
      slot: slot.slot,
      playerName: slot.playerName,
      label: rootingLabelForParticipant(slot.participantId),
    });
    dfsSlotsByEventId.set(slot.eventId, arr);
  }

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
        ticketCode: resolveTicketCode(ticket),
        ticketColor: resolveTicketColor(ticket),
        ticketStatus,
        description: leg.selection ?? leg.rawDescription ?? leg.marketType,
        settlement,
        dead,
        subjects: legSubjects,
      };
    });
    eventDetailByEventId.set(event.id, {
      event: scheduleEvent,
      legs: detailLegs,
      fantasySlots: fantasySlotsByEventId.get(event.id) ?? [],
      dfsSlots: dfsSlotsByEventId.get(event.id) ?? [],
    });
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

  function toPaneRoster(
    slots: { id: string; slot: string; playerName: string; eventId?: string | null }[],
  ): PaneRosterPlayer[] {
    return slots.map((slot) => ({
      slotId: slot.id,
      slot: slot.slot,
      playerName: slot.playerName,
      eventId: slot.eventId ?? null,
      eventName: slot.eventId ? eventById.get(slot.eventId)?.name ?? null : null,
    }));
  }

  // Fantasy / DFS context panes (docs/PRD.md section 8, 65): active matchups/entries
  // only, with the "Mark Final" prompt shown once every linked Event has gone final.
  // Status itself never changes automatically — only the prompt is derived here.
  const fantasyMatchupPaneItems: FantasyMatchupPaneItem[] = fantasyMatchups.flatMap((matchup) => {
    const section = fantasyDfsSection(matchup.status, matchup.finalizedAt, now, timezone, rolloverHour);
    if (section !== "active") return [];
    const league = fantasyLeagueById.get(matchup.fantasyLeagueId);
    const matchupSlots = fantasyRosterSlotsByMatchupId.get(matchup.id) ?? [];
    const linkedEventStatuses = matchupSlots.map((slot) => {
      const e = slot.eventId ? eventById.get(slot.eventId) : undefined;
      return e ? displayedStatus(e) : null;
    });
    const eventIds = [...new Set(matchupSlots.flatMap((slot) => (slot.eventId ? [slot.eventId] : [])))];
    return [
      {
        matchupId: matchup.id,
        leagueName: league?.name ?? "Fantasy League",
        week: matchup.week ?? null,
        userTeamName: matchup.userTeamName,
        opponentTeamName: matchup.opponentTeamName,
        status: matchup.status,
        showMarkFinal: allLinkedEventsFinal(linkedEventStatuses),
        eventIds,
        userRoster: toPaneRoster(matchupSlots.filter((slot) => slot.side === "user")),
        opponentRoster: toPaneRoster(matchupSlots.filter((slot) => slot.side === "opponent")),
      },
    ];
  });

  const dfsEntryPaneItems: DfsEntryPaneItem[] = dfsEntries.flatMap((entry) => {
    const section = fantasyDfsSection(entry.status, entry.finalizedAt, now, timezone, rolloverHour);
    if (section !== "active") return [];
    const lineup = dfsLineupById.get(entry.dfsLineupId);
    const lineupSlots = dfsLineupSlotsByLineupId.get(entry.dfsLineupId) ?? [];
    const linkedEventStatuses = lineupSlots.map((slot) => {
      const e = slot.eventId ? eventById.get(slot.eventId) : undefined;
      return e ? displayedStatus(e) : null;
    });
    return [
      {
        entryId: entry.id,
        lineupId: entry.dfsLineupId,
        platform: lineup?.platform ?? "DFS",
        slateName: lineup?.slateName ?? null,
        contestName: entry.contestName ?? null,
        status: entry.status,
        showMarkFinal: allLinkedEventsFinal(linkedEventStatuses),
        roster: toPaneRoster(lineupSlots),
      },
    ];
  });

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
      fantasyMatchups={fantasyMatchupPaneItems}
      dfsEntries={dfsEntryPaneItems}
      timeZone={timezone}
    />
  );
}
