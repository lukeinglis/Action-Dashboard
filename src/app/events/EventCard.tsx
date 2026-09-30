"use client";

import { useState, useTransition } from "react";
import type { Event } from "@/lib/types/domain";
import {
  displayedAwayScore,
  displayedClock,
  displayedHomeScore,
  displayedPeriod,
  displayedStatus,
  hasManualOverride,
  isOverrideStale,
} from "@/lib/events/overrides";
import {
  clearAllEventOverrides,
  mergeEvents,
  returnEventFieldToAutomatic,
  setEventOverride,
} from "./actions";

export function EventCard({ event, allEvents }: { event: Event; allEvents: Event[] }) {
  const [isPending, startTransition] = useTransition();
  const [mergeTargetId, setMergeTargetId] = useState("");

  const overridden = hasManualOverride(event);
  const stale = isOverrideStale(event);
  const otherEvents = allEvents.filter((e) => e.id !== event.id);

  function setScoreOverride() {
    const home = window.prompt("Manual home score", String(displayedHomeScore(event) ?? ""));
    if (home === null) return;
    const away = window.prompt("Manual away score", String(displayedAwayScore(event) ?? ""));
    if (away === null) return;
    startTransition(() => {
      void setEventOverride(event.id, {
        homeScore: home === "" ? null : Number(home),
        awayScore: away === "" ? null : Number(away),
      });
    });
  }

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-neutral-100">{event.name}</p>
          <p className="text-xs text-neutral-500">
            {event.sport}
            {event.league ? ` · ${event.league}` : ""}
            {event.startTimeUtc ? ` · ${new Date(event.startTimeUtc).toLocaleString()}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          {overridden && (
            <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-300">
              manual override
            </span>
          )}
          {stale && (
            <span className="rounded bg-red-900/40 px-2 py-0.5 text-red-300">
              stale — provider value differs
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-300">
        <span>Status: {displayedStatus(event) ?? "—"}</span>
        <span>
          Score: {displayedHomeScore(event) ?? "—"} / {displayedAwayScore(event) ?? "—"}
        </span>
        <span>Period: {displayedPeriod(event) ?? "—"}</span>
        <span>Clock: {displayedClock(event) ?? "—"}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          disabled={isPending}
          onClick={setScoreOverride}
          className="rounded border border-neutral-700 px-2 py-1 text-neutral-300"
        >
          Set manual score
        </button>
        {event.manualHomeScore != null && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                void returnEventFieldToAutomatic(event.id, "homeScore");
                void returnEventFieldToAutomatic(event.id, "awayScore");
              })
            }
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300"
          >
            Return score to automatic
          </button>
        )}
        {overridden && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => void clearAllEventOverrides(event.id))}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300"
          >
            Clear all overrides
          </button>
        )}
      </div>

      {otherEvents.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300"
          >
            <option value="">Merge into…</option>
            {otherEvents.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isPending || !mergeTargetId}
            onClick={() => {
              if (!mergeTargetId) return;
              if (!window.confirm(`Merge "${event.name}" into the selected Event? This cannot be undone.`)) {
                return;
              }
              startTransition(() => void mergeEvents(event.id, mergeTargetId));
            }}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 disabled:opacity-40"
          >
            Merge
          </button>
        </div>
      )}
    </div>
  );
}
