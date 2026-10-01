"use client";

import { groupByState, nflWindowGroup, type NflWindowGroup, type StateGroup } from "@/lib/dashboard/schedule";
import type { DashboardViewLayout } from "@/lib/types/domain";
import type { ScheduleEventItem } from "./types";

interface Props {
  events: ScheduleEventItem[];
  grouping: DashboardViewLayout["scheduleGrouping"];
  onGroupingChange: (grouping: DashboardViewLayout["scheduleGrouping"]) => void;
  selectedEventId: string | null;
  onSelect: (eventId: string | null) => void;
  timeZone: string;
}

const STATE_ORDER: StateGroup[] = ["LIVE", "UP NEXT", "LATER", "FINAL"];
const NFL_WINDOW_ORDER: NflWindowGroup[] = ["1PM", "4PM", "NIGHT", "MONDAY", "UNSCHEDULED"];

export function ScheduleRail({ events, grouping, onGroupingChange, selectedEventId, onSelect, timeZone }: Props) {
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
      [...events].sort((a, b) => (a.startTimeUtc ?? "9999") < (b.startTimeUtc ?? "9999") ? -1 : 1),
    );
  }

  const order = grouping === "state" ? STATE_ORDER : grouping === "nfl_window" ? NFL_WINDOW_ORDER : ["Schedule"];

  return (
    <aside className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">Schedule</h2>
        <select
          value={grouping}
          onChange={(e) => onGroupingChange(e.target.value as DashboardViewLayout["scheduleGrouping"])}
          className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-300"
        >
          <option value="state">State</option>
          <option value="nfl_window">NFL Window</option>
          <option value="chronological">Chronological</option>
        </select>
      </div>

      {events.length === 0 && <p className="text-xs text-neutral-500">No relevant events.</p>}

      {order.map((group) => {
        const groupEvents = groups.get(group);
        if (!groupEvents || groupEvents.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{group}</p>
            <div className="space-y-1">
              {groupEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onSelect(event.id === selectedEventId ? null : event.id)}
                  aria-current={event.id === selectedEventId}
                  className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                    event.id === selectedEventId
                      ? "border-neutral-400 bg-neutral-800"
                      : "border-neutral-800 bg-transparent hover:bg-neutral-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-neutral-100">{event.name}</span>
                    {event.isPinned && <span title="Pinned">📌</span>}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-neutral-500">
                    <span>
                      {event.startTimeUtc ? new Date(event.startTimeUtc).toLocaleString(undefined, { timeZone }) : "TBD"}
                    </span>
                    <span>
                      {event.status}
                      {event.homeScore !== null && event.awayScore !== null ? ` · ${event.awayScore}-${event.homeScore}` : ""}
                    </span>
                  </div>
                  {event.exposureCount > 0 && (
                    <span className="mt-0.5 inline-block rounded bg-neutral-800 px-1.5 py-0 text-[10px] text-neutral-300">
                      {event.exposureCount} exposure
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
