"use client";

import { groupByState, nflWindowGroup, type NflWindowGroup, type StateGroup } from "@/lib/dashboard/schedule";
import type { DashboardViewLayout } from "@/lib/types/domain";
import type { EventDetailData, EventDetailDfsSlot, EventDetailFantasySlot, ScheduleEventItem } from "./types";
import { TicketChip } from "./components/TicketChip";
import { Panel, PanelBody, PanelHeader } from "./components/Panel";

interface Props {
  events: ScheduleEventItem[];
  grouping: DashboardViewLayout["scheduleGrouping"];
  onGroupingChange: (grouping: DashboardViewLayout["scheduleGrouping"]) => void;
  selectedEventId: string | null;
  onSelect: (eventId: string | null) => void;
  expandedEventIds: string[];
  onToggleExpanded: (eventId: string) => void;
  eventDetailByEventId: Record<string, EventDetailData>;
  timeZone: string;
}

const STATE_ORDER: StateGroup[] = ["LIVE", "UP NEXT", "LATER", "FINAL"];
const NFL_WINDOW_ORDER: NflWindowGroup[] = ["1PM", "4PM", "NIGHT", "MONDAY", "UNSCHEDULED"];

/** Colored band per group, echoing the printed sheet's window headers. */
const GROUP_ACCENT: Record<string, string> = {
  LIVE: "bg-emerald-500",
  "UP NEXT": "bg-sky-500",
  LATER: "bg-neutral-600",
  FINAL: "bg-neutral-700",
  "1PM": "bg-sky-500",
  "4PM": "bg-amber-500",
  NIGHT: "bg-violet-500",
  MONDAY: "bg-rose-500",
  UNSCHEDULED: "bg-neutral-600",
  Schedule: "bg-neutral-600",
};

function formatKickoff(startTimeUtc: string | null, timeZone: string): string {
  if (!startTimeUtc) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startTimeUtc));
}

/** Collapses repeated slots for one player into `Name · LeagueA, LeagueB`. */
function groupByPlayer<T extends { playerName: string }>(slots: T[], tagOf: (slot: T) => string) {
  const byPlayer = new Map<string, string[]>();
  for (const slot of slots) {
    const tags = byPlayer.get(slot.playerName) ?? [];
    const tag = tagOf(slot);
    if (!tags.includes(tag)) tags.push(tag);
    byPlayer.set(slot.playerName, tags);
  }
  return [...byPlayer.entries()].map(([playerName, tags]) => ({ playerName, tags }));
}

function PlayerLines({
  title,
  rows,
}: {
  title: string;
  rows: { playerName: string; tags: string[] }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      <ul className="mt-0.5 space-y-0.5">
        {rows.map((row) => (
          <li key={row.playerName} className="text-[11px] text-neutral-300">
            {row.playerName}
            <span className="text-neutral-500"> · {row.tags.join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RowDetail({ detail }: { detail: EventDetailData }) {
  const liveLegs = detail.legs.filter((leg) => !leg.dead);
  const deadLegs = detail.legs.filter((leg) => leg.dead);
  const mine = detail.fantasySlots.filter((s: EventDetailFantasySlot) => s.side === "user");
  const theirs = detail.fantasySlots.filter((s: EventDetailFantasySlot) => s.side === "opponent");

  const nothing =
    detail.legs.length === 0 && detail.fantasySlots.length === 0 && detail.dfsSlots.length === 0;

  return (
    <div className="space-y-2 border-t border-neutral-800 bg-neutral-950/60 px-2 py-2">
      {nothing && <p className="text-[11px] text-neutral-600">No linked action.</p>}

      {liveLegs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Betting</p>
          <ul className="mt-0.5 space-y-0.5">
            {liveLegs.map((leg) => (
              <li key={leg.legId} className="flex items-start justify-between gap-2 text-[11px]">
                <span className="min-w-0 flex-1 text-neutral-200">{leg.description}</span>
                <TicketChip code={leg.ticketCode} color={leg.ticketColor} title={leg.ticketName} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <PlayerLines title="My Fantasy" rows={groupByPlayer(mine, (s) => s.leagueName)} />
      <PlayerLines title="Opponents" rows={groupByPlayer(theirs, (s) => s.leagueName)} />
      <PlayerLines
        title="DFS"
        rows={groupByPlayer(detail.dfsSlots, (s: EventDetailDfsSlot) => s.platform)}
      />

      {deadLegs.length > 0 && (
        <p className="text-[10px] text-neutral-600">
          {deadLegs.length} settled leg{deadLegs.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

export function ScheduleRail({
  events,
  grouping,
  onGroupingChange,
  selectedEventId,
  onSelect,
  expandedEventIds,
  onToggleExpanded,
  eventDetailByEventId,
  timeZone,
}: Props) {
  const groups = new Map<string, ScheduleEventItem[]>();

  if (grouping === "state") {
    const groupByEventId = groupByState(events);
    for (const event of events) {
      const group = groupByEventId.get(event.id)!;
      const arr = groups.get(group) ?? [];
      arr.push(event);
      groups.set(group, arr);
    }
  } else if (grouping === "nfl_window") {
    for (const event of events) {
      const group = nflWindowGroup(event.startTimeUtc, timeZone);
      const arr = groups.get(group) ?? [];
      arr.push(event);
      groups.set(group, arr);
    }
  } else {
    groups.set(
      "Schedule",
      [...events].sort((a, b) => ((a.startTimeUtc ?? "9999") < (b.startTimeUtc ?? "9999") ? -1 : 1)),
    );
  }

  const order = grouping === "state" ? STATE_ORDER : grouping === "nfl_window" ? NFL_WINDOW_ORDER : ["Schedule"];

  return (
    <Panel>
      <PanelHeader
        title="Schedule"
        count={events.length}
        action={
          <select
            aria-label="Schedule grouping"
            value={grouping}
            onChange={(e) => onGroupingChange(e.target.value as DashboardViewLayout["scheduleGrouping"])}
            className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-400"
          >
            <option value="state">State</option>
            <option value="nfl_window">NFL Window</option>
            <option value="chronological">Chronological</option>
          </select>
        }
      />
      <PanelBody className="space-y-3">
        {events.length === 0 && <p className="text-xs text-neutral-500">No relevant events.</p>}

        {order.map((group) => {
          const groupEvents = groups.get(group);
          if (!groupEvents || groupEvents.length === 0) return null;
          return (
            <div key={group}>
              <div className="mb-1 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${GROUP_ACCENT[group] ?? "bg-neutral-600"}`} />
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{group}</p>
                <span className="text-[10px] tabular-nums text-neutral-700">{groupEvents.length}</span>
              </div>
              <div className="space-y-1">
                {groupEvents.map((event) => {
                  const isExpanded = expandedEventIds.includes(event.id);
                  const isSelected = event.id === selectedEventId;
                  const detail = eventDetailByEventId[event.id];
                  const hasScore = event.homeScore !== null && event.awayScore !== null;
                  return (
                    <div
                      key={event.id}
                      className={`overflow-hidden rounded-md border ${
                        isSelected ? "border-neutral-500" : "border-neutral-800"
                      }`}
                    >
                      <div className="flex items-stretch">
                        <button
                          type="button"
                          onClick={() => onToggleExpanded(event.id)}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${event.name}`}
                          className="flex-1 px-2 py-1.5 text-left hover:bg-neutral-900"
                        >
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[10px] tabular-nums text-neutral-500">
                              {isExpanded ? "▾" : "▸"}
                            </span>
                            <span className="text-[10px] tabular-nums text-neutral-400">
                              {formatKickoff(event.startTimeUtc, timeZone)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100">
                              {event.name}
                            </span>
                            {event.isPinned && <span title="Pinned">📌</span>}
                            {event.exposureCount > 0 && (
                              <span className="shrink-0 rounded bg-neutral-800 px-1 text-[10px] tabular-nums text-neutral-300">
                                {event.exposureCount}
                              </span>
                            )}
                          </div>
                          {(hasScore || event.status) && (
                            <div className="mt-0.5 flex items-center gap-2 pl-[14px] text-[10px] text-neutral-500">
                              {hasScore && (
                                <span className="tabular-nums text-neutral-400">
                                  {event.awayScore}–{event.homeScore}
                                </span>
                              )}
                              {event.status && <span>{event.status.replace("_", " ")}</span>}
                              {event.period && <span>{event.period}</span>}
                              {event.clock && <span>{event.clock}</span>}
                            </div>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelect(isSelected ? null : event.id)}
                          aria-label={`Open full detail for ${event.name}`}
                          title="Open full detail"
                          className={`w-7 shrink-0 border-l border-neutral-800 text-xs hover:bg-neutral-800 ${
                            isSelected ? "bg-neutral-800 text-neutral-100" : "text-neutral-600"
                          }`}
                        >
                          ↗
                        </button>
                      </div>
                      {isExpanded && detail && <RowDetail detail={detail} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </PanelBody>
    </Panel>
  );
}
