"use client";

import Link from "next/link";
import type { EventDetailData, EventDetailDfsSlot, EventDetailFantasySlot } from "./types";
import { TicketChip } from "./components/TicketChip";

function rosterSlotBadgeClass(label: string): string {
  return label === "MIXED" ? "bg-amber-900/40 text-amber-300" : "bg-neutral-800 text-neutral-300";
}

function FantasySlotRow({ slot }: { slot: EventDetailFantasySlot }) {
  return (
    <div className="flex items-center justify-between rounded border border-neutral-800 p-2 text-sm">
      <span className="text-neutral-200">
        <span className="text-xs text-neutral-500">{slot.slot}</span> {slot.playerName}
      </span>
      <span className={`rounded px-1.5 py-0 text-[10px] ${rosterSlotBadgeClass(slot.label)}`}>
        {slot.leagueName} · {slot.label}
      </span>
    </div>
  );
}

function DfsSlotRow({ slot }: { slot: EventDetailDfsSlot }) {
  return (
    <div className="flex items-center justify-between rounded border border-neutral-800 p-2 text-sm">
      <span className="text-neutral-200">
        <span className="text-xs text-neutral-500">{slot.slot}</span> {slot.playerName}
      </span>
      <span className={`rounded px-1.5 py-0 text-[10px] ${rosterSlotBadgeClass(slot.label)}`}>
        {slot.platform} · {slot.label}
      </span>
    </div>
  );
}

export function EventDetail({ data }: { data: EventDetailData }) {
  const { event, legs, fantasySlots, dfsSlots } = data;
  const myFantasySlots = fantasySlots.filter((s) => s.side === "user");
  const opponentFantasySlots = fantasySlots.filter((s) => s.side === "opponent");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-800 p-4">
        <p className="font-medium text-neutral-100">{event.name}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {event.sport}
          {event.league ? ` · ${event.league}` : ""}
          {event.startTimeUtc ? ` · ${new Date(event.startTimeUtc).toLocaleString()}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-300">
          <span>Status: {event.status ?? "—"}</span>
          <span>
            Score: {event.awayScore ?? "—"} / {event.homeScore ?? "—"}
          </span>
          {event.period && <span>Period: {event.period}</span>}
          {event.clock && <span>Clock: {event.clock}</span>}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-100">Exposure ({legs.filter((l) => !l.dead).length})</h3>
        {legs.length === 0 && <p className="text-sm text-neutral-500">No linked bet legs.</p>}
        <div className="space-y-2">
          {legs.map((leg) => (
            <Link
              key={leg.legId}
              href={`/tickets/${leg.ticketId}`}
              className={`block rounded-lg border p-3 hover:border-neutral-700 ${
                leg.dead ? "border-neutral-900 opacity-60" : "border-neutral-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 text-neutral-100">{leg.description}</span>
                <span className="shrink-0 text-xs text-neutral-500">{leg.settlement}</span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                <TicketChip code={leg.ticketCode} color={leg.ticketColor} />
                {leg.ticketName} · {leg.ticketStatus}
              </p>
              {leg.subjects.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {leg.subjects.map((s) => (
                    <span
                      key={s.name}
                      className={`rounded px-1.5 py-0 text-[10px] ${
                        s.dead
                          ? "bg-neutral-900 text-neutral-600"
                          : s.label === "MIXED"
                            ? "bg-amber-900/40 text-amber-300"
                            : "bg-neutral-800 text-neutral-300"
                      }`}
                    >
                      {s.name} {s.dead ? "(settled)" : s.label}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>

      {myFantasySlots.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-100">My Fantasy ({myFantasySlots.length})</h3>
          <div className="space-y-2">
            {myFantasySlots.map((slot) => (
              <FantasySlotRow key={slot.slotId} slot={slot} />
            ))}
          </div>
        </div>
      )}

      {opponentFantasySlots.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-100">
            Fantasy Opponents ({opponentFantasySlots.length})
          </h3>
          <div className="space-y-2">
            {opponentFantasySlots.map((slot) => (
              <FantasySlotRow key={slot.slotId} slot={slot} />
            ))}
          </div>
        </div>
      )}

      {dfsSlots.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-100">DFS ({dfsSlots.length})</h3>
          <div className="space-y-2">
            {dfsSlots.map((slot) => (
              <DfsSlotRow key={slot.slotId} slot={slot} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
